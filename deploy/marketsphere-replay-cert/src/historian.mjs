import path from 'node:path';
import { mkdir, open, readFile } from 'node:fs/promises';
import { canonicalJson, fingerprintMarketEvent, sha256 } from './schema.mjs';

const nowIso = () => new Date().toISOString();

export class ReplayHistorian {
  constructor({ filePath, maxRecordBytes = 1024 * 1024 } = {}) {
    this.filePath = filePath ?? process.env.MARKETSPHERE_REPLAY_HISTORIAN_PATH ?? '/data/marketsphere-replay/events.jsonl';
    this.maxRecordBytes = Math.max(64 * 1024, Math.min(4 * 1024 * 1024, Number(maxRecordBytes) || 1024 * 1024));
    this.chainHead = null;
    this.initialized = false;
    this.tail = Promise.resolve();
    this.recordsWrittenRuntime = 0;
  }

  async initialize() {
    if (this.initialized) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const verification = await this.verifyFile();
    if (!verification.verified) throw new Error(`REPLAY_HISTORIAN_INIT_${verification.reason}`);
    this.chainHead = verification.chain_head_sha256;
    this.initialized = true;
  }

  append(input) {
    const task = this.tail.then(() => this.#append(input));
    this.tail = task.catch(() => {});
    return task;
  }

  async #append(input) {
    await this.initialize();
    const { event, event_sha256 } = fingerprintMarketEvent(input);
    const eventBytes = Buffer.byteLength(canonicalJson(event), 'utf8');
    if (eventBytes > this.maxRecordBytes) throw new Error('REPLAY_RECORD_TOO_LARGE');
    const previous = this.chainHead;
    const chainSha = sha256(canonicalJson({ previous_chain_sha256: previous, event_sha256 }));
    const envelope = {
      replay_historian_schema_version: 1,
      recorded_at: nowIso(),
      previous_chain_sha256: previous,
      event_sha256,
      chain_sha256: chainSha,
      event
    };
    const handle = await open(this.filePath, 'a');
    try {
      await handle.writeFile(`${JSON.stringify(envelope)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    this.chainHead = chainSha;
    this.recordsWrittenRuntime += 1;
    return { event_sha256, chain_sha256: chainSha };
  }

  async flush() { await this.tail; }

  async verifyFile({ maxBytes = 64 * 1024 * 1024 } = {}) {
    let data;
    try { data = await readFile(this.filePath); }
    catch (err) {
      if (err?.code === 'ENOENT') return { verified: true, records: 0, chain_head_sha256: null };
      throw err;
    }
    if (data.length > maxBytes) return { verified: false, reason: 'VERIFY_BYTE_BUDGET_EXCEEDED', records: null, chain_head_sha256: null };
    const lines = data.toString('utf8').split('\n').filter(Boolean);
    let previous = null;
    for (let i = 0; i < lines.length; i += 1) {
      let entry;
      try { entry = JSON.parse(lines[i]); }
      catch { return { verified: false, reason: 'INVALID_JSON', record_index: i, records: lines.length, chain_head_sha256: previous }; }
      let fingerprint;
      try { fingerprint = fingerprintMarketEvent(entry.event); }
      catch { return { verified: false, reason: 'INVALID_EVENT', record_index: i, records: lines.length, chain_head_sha256: previous }; }
      const expectedChain = sha256(canonicalJson({ previous_chain_sha256: previous, event_sha256: fingerprint.event_sha256 }));
      if (entry.previous_chain_sha256 !== previous || entry.event_sha256 !== fingerprint.event_sha256 || entry.chain_sha256 !== expectedChain) {
        return { verified: false, reason: 'CHAIN_MISMATCH', record_index: i, records: lines.length, chain_head_sha256: previous };
      }
      previous = expectedChain;
    }
    return { verified: true, records: lines.length, chain_head_sha256: previous };
  }

  status() {
    return {
      replay_historian_schema_version: 1,
      path_class: this.filePath.startsWith('/data/') ? 'DURABLE_PATH_DECLARED' : 'EPHEMERAL_PATH',
      persistence_mode: 'APPEND_ONLY_FSYNC',
      chain_head_sha256: this.chainHead,
      records_written_runtime: this.recordsWrittenRuntime,
      source_classification: 'SYNTHETIC_CERT_REPLAY',
      trading_authority: 'NONE',
      production_mutation: false
    };
  }
}
