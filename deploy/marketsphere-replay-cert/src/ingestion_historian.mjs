import path from 'node:path';
import { mkdir, open, readFile } from 'node:fs/promises';
import { canonicalJson, fingerprintMarketEvent, sha256 } from './schema.mjs';

const nowIso = () => new Date().toISOString();

export class IngestionHistorian {
  constructor({ filePath, maxRecordBytes = 2 * 1024 * 1024 } = {}) {
    this.filePath = filePath ?? process.env.MARKETSPHERE_INGESTION_HISTORIAN_PATH ?? '/data/marketsphere-ingestion/events.jsonl';
    this.maxRecordBytes = Math.max(64 * 1024, Math.min(8 * 1024 * 1024, Number(maxRecordBytes) || 2 * 1024 * 1024));
    this.chainHead = null;
    this.initialized = false;
    this.lastVerification = null;
    this.tail = Promise.resolve();
    this.recordsWrittenRuntime = 0;
  }

  async initialize() {
    if (this.initialized) return this.lastVerification;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const verification = await this.verifyFile();
    if (!verification.verified) throw new Error(`INGESTION_HISTORIAN_INIT_${verification.reason}`);
    this.chainHead = verification.chain_head_sha256;
    this.lastVerification = verification;
    this.initialized = true;
    return verification;
  }

  append({ event, passport }) {
    const task = this.tail.then(() => this.#append({ event, passport }));
    this.tail = task.catch(() => {});
    return task;
  }

  async #append({ event, passport }) {
    await this.initialize();
    const fingerprint = fingerprintMarketEvent(event);
    if (fingerprint.event_sha256 !== passport?.event_sha256) throw new Error('PASSPORT_EVENT_HASH_MISMATCH');
    if (!passport?.passport_sha256) throw new Error('PASSPORT_HASH_REQUIRED');
    const computedPassport = sha256(canonicalJson(Object.fromEntries(Object.entries(passport).filter(([k]) => k !== 'passport_sha256'))));
    if (computedPassport !== passport.passport_sha256) throw new Error('PASSPORT_HASH_MISMATCH');

    const record = { event: fingerprint.event, passport };
    const recordSha = sha256(canonicalJson(record));
    const recordBytes = Buffer.byteLength(canonicalJson(record), 'utf8');
    if (recordBytes > this.maxRecordBytes) throw new Error('INGESTION_RECORD_TOO_LARGE');
    const previous = this.chainHead;
    const chainSha = sha256(canonicalJson({ previous_chain_sha256: previous, record_sha256: recordSha }));
    const envelope = {
      ingestion_historian_schema_version: 1,
      recorded_at: nowIso(),
      previous_chain_sha256: previous,
      record_sha256: recordSha,
      chain_sha256: chainSha,
      ...record
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
    return { record_sha256: recordSha, chain_sha256: chainSha };
  }

  async flush() { await this.tail; }

  async verifyFile({ maxBytes = 128 * 1024 * 1024 } = {}) {
    let data;
    try { data = await readFile(this.filePath); }
    catch (err) {
      if (err?.code === 'ENOENT') return { verified: true, records: 0, chain_head_sha256: null, stream_tails: {} };
      throw err;
    }
    if (data.length > maxBytes) return { verified: false, reason: 'VERIFY_BYTE_BUDGET_EXCEEDED', records: null, chain_head_sha256: null, stream_tails: null };
    const lines = data.toString('utf8').split('\n').filter(Boolean);
    let previous = null;
    const streamTails = {};
    for (let i = 0; i < lines.length; i += 1) {
      let entry;
      try { entry = JSON.parse(lines[i]); }
      catch { return { verified: false, reason: 'INVALID_JSON', record_index: i, records: lines.length, chain_head_sha256: previous, stream_tails: null }; }
      try {
        const fingerprint = fingerprintMarketEvent(entry.event);
        const passportBase = Object.fromEntries(Object.entries(entry.passport ?? {}).filter(([k]) => k !== 'passport_sha256'));
        const passportSha = sha256(canonicalJson(passportBase));
        if (fingerprint.event_sha256 !== entry.passport?.event_sha256 || passportSha !== entry.passport?.passport_sha256) {
          return { verified: false, reason: 'PASSPORT_MISMATCH', record_index: i, records: lines.length, chain_head_sha256: previous, stream_tails: null };
        }
        const recordSha = sha256(canonicalJson({ event: fingerprint.event, passport: entry.passport }));
        const expectedChain = sha256(canonicalJson({ previous_chain_sha256: previous, record_sha256: recordSha }));
        if (entry.previous_chain_sha256 !== previous || entry.record_sha256 !== recordSha || entry.chain_sha256 !== expectedChain) {
          return { verified: false, reason: 'CHAIN_MISMATCH', record_index: i, records: lines.length, chain_head_sha256: previous, stream_tails: null };
        }
        const streamKey = entry.passport?.continuity?.stream_key;
        if (streamKey) {
          streamTails[streamKey] = {
            sequence: entry.event.sequence,
            source_ts: entry.event.source_ts,
            passport_sha256: entry.passport.passport_sha256,
            observations: entry.passport?.continuity?.observations ?? i + 1,
            sequence_gaps: entry.passport?.continuity?.sequence_gaps ?? 0,
            sequence_duplicates: entry.passport?.continuity?.sequence_duplicates ?? 0,
            sequence_regressions: entry.passport?.continuity?.sequence_regressions ?? 0,
            timestamp_regressions: entry.passport?.continuity?.timestamp_regressions ?? 0
          };
        }
        previous = expectedChain;
      } catch {
        return { verified: false, reason: 'INVALID_RECORD', record_index: i, records: lines.length, chain_head_sha256: previous, stream_tails: null };
      }
    }
    return { verified: true, records: lines.length, chain_head_sha256: previous, stream_tails: streamTails };
  }

  status() {
    return {
      ingestion_historian_schema_version: 1,
      path_class: this.filePath.startsWith('/data/') ? 'DURABLE_PATH_DECLARED' : 'EPHEMERAL_PATH',
      persistence_mode: 'APPEND_ONLY_FSYNC',
      chain_head_sha256: this.chainHead,
      records_written_runtime: this.recordsWrittenRuntime,
      trading_authority: 'NONE',
      production_mutation: false
    };
  }
}
