import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, open, readFile } from 'node:fs/promises';

const nowIso = () => new Date().toISOString();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const envBool = (name, fallback = false) => /^(1|true|yes|on)$/i.test(process.env[name] ?? String(fallback));

function boundedInt(value, fallback, min, max) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
}

function forbiddenCredentialKey(value) {
  if (!value || typeof value !== 'object') return null;
  const stack = [value];
  const forbidden = /^(authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|password)$/i;
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, child] of Object.entries(current)) {
      if (forbidden.test(key)) return key;
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return null;
}

function normalizedRecord(record) {
  return {
    source: String(record?.source ?? 'UNKNOWN').slice(0, 64),
    provider: String(record?.provider ?? 'UNKNOWN').slice(0, 128),
    service: String(record?.service ?? 'UNKNOWN').slice(0, 128),
    source_timestamp_ms: Number.isFinite(Number(record?.source_timestamp_ms)) ? Number(record.source_timestamp_ms) : null,
    sequence: Number.isSafeInteger(Number(record?.sequence)) && Number(record.sequence) >= 0 ? Number(record.sequence) : null,
    received_at: typeof record?.received_at === 'string' ? record.received_at : nowIso(),
    payload: Array.isArray(record?.payload) ? record.payload : []
  };
}

export class MarketHistorian {
  constructor({ enabled, filePath, maxRecordBytes } = {}) {
    this.enabled = enabled ?? envBool('MARKETSPHERE_HISTORIAN_ENABLED', false);
    this.filePath = filePath ?? process.env.MARKETSPHERE_HISTORIAN_PATH ?? '/data/marketsphere-feed-cert/events.jsonl';
    this.maxRecordBytes = boundedInt(maxRecordBytes ?? process.env.MARKETSPHERE_HISTORIAN_MAX_RECORD_BYTES, 4 * 1024 * 1024, 64 * 1024, 8 * 1024 * 1024);
    this.chainHead = null;
    this.recordsWrittenRuntime = 0;
    this.lastWriteAt = null;
    this.lastErrorCode = null;
    this.initialized = false;
    this.initPromise = null;
    this.tail = Promise.resolve();
  }

  status() {
    return {
      historian_schema_version: 1,
      enabled: this.enabled,
      persistence_mode: this.enabled ? 'APPEND_ONLY_FSYNC' : 'DISABLED',
      durable_path_declared: this.filePath.startsWith('/data/'),
      records_written_runtime: this.recordsWrittenRuntime,
      chain_head_sha256: this.chainHead,
      last_write_at: this.lastWriteAt,
      last_error_code: this.lastErrorCode,
      max_record_bytes: this.maxRecordBytes,
      credential_fields_prohibited: true,
      trading_authority: 'NONE',
      production_mutation: false
    };
  }

  recordError(code) {
    this.lastErrorCode = String(code || 'HISTORIAN_ERROR').slice(0, 80);
  }

  async initialize() {
    if (!this.enabled || this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      try {
        const data = await readFile(this.filePath, 'utf8');
        const lines = data.split('\n').filter(Boolean);
        if (lines.length) {
          const last = JSON.parse(lines.at(-1));
          const recordSha = sha256(canonicalJson(last.record));
          const chainSha = sha256(canonicalJson({ previous_historian_chain_sha256: last.previous_historian_chain_sha256 ?? null, record_sha256: recordSha }));
          if (recordSha !== last.record_sha256 || chainSha !== last.historian_chain_sha256) throw new Error('HISTORIAN_TAIL_INTEGRITY_FAILED');
          this.chainHead = last.historian_chain_sha256;
        }
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          this.recordError(err?.message || 'HISTORIAN_INIT_FAILED');
          throw err;
        }
      }
      this.initialized = true;
    })();
    return this.initPromise;
  }

  append(record) {
    if (!this.enabled) return Promise.resolve({ persisted: false, reason: 'HISTORIAN_DISABLED' });
    const task = this.tail.then(() => this.#append(record));
    this.tail = task.catch(() => {});
    return task;
  }

  async #append(record) {
    await this.initialize();
    const forbidden = forbiddenCredentialKey(record);
    if (forbidden) {
      this.recordError('HISTORIAN_CREDENTIAL_FIELD_REJECTED');
      throw new Error('HISTORIAN_CREDENTIAL_FIELD_REJECTED');
    }

    const normalized = normalizedRecord(record);
    const canonical = canonicalJson(normalized);
    const bytes = Buffer.byteLength(canonical, 'utf8');
    if (bytes > this.maxRecordBytes) {
      this.recordError('HISTORIAN_RECORD_TOO_LARGE');
      throw new Error('HISTORIAN_RECORD_TOO_LARGE');
    }

    const recordSha256 = sha256(canonical);
    const previous = this.chainHead;
    const historianChainSha256 = sha256(canonicalJson({ previous_historian_chain_sha256: previous, record_sha256: recordSha256 }));
    const envelope = {
      historian_schema_version: 1,
      recorded_at: nowIso(),
      previous_historian_chain_sha256: previous,
      record_sha256: recordSha256,
      historian_chain_sha256: historianChainSha256,
      record: normalized
    };

    const handle = await open(this.filePath, 'a');
    try {
      await handle.writeFile(`${JSON.stringify(envelope)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    this.chainHead = historianChainSha256;
    this.recordsWrittenRuntime += 1;
    this.lastWriteAt = envelope.recorded_at;
    this.lastErrorCode = null;
    return { persisted: true, record_sha256: recordSha256, historian_chain_sha256: historianChainSha256 };
  }

  async flush() {
    await this.tail;
  }

  async verifyFile({ maxBytes = 64 * 1024 * 1024 } = {}) {
    if (!this.enabled) return { verified: false, reason: 'HISTORIAN_DISABLED', records: 0 };
    await this.flush();
    let data;
    try { data = await readFile(this.filePath); }
    catch (err) {
      if (err?.code === 'ENOENT') return { verified: true, records: 0, chain_head_sha256: null };
      throw err;
    }
    if (data.length > maxBytes) return { verified: false, reason: 'VERIFY_BYTE_BUDGET_EXCEEDED', records: null };
    const lines = data.toString('utf8').split('\n').filter(Boolean);
    let previous = null;
    for (let i = 0; i < lines.length; i += 1) {
      const entry = JSON.parse(lines[i]);
      const recordSha = sha256(canonicalJson(entry.record));
      const chainSha = sha256(canonicalJson({ previous_historian_chain_sha256: previous, record_sha256: recordSha }));
      if (entry.previous_historian_chain_sha256 !== previous || entry.record_sha256 !== recordSha || entry.historian_chain_sha256 !== chainSha) {
        return { verified: false, reason: 'CHAIN_MISMATCH', record_index: i, records: lines.length };
      }
      previous = chainSha;
    }
    return { verified: true, records: lines.length, chain_head_sha256: previous };
  }
}
