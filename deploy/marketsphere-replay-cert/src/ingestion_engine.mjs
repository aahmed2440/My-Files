import { AdapterRegistry } from './adapter_contract.mjs';
import { ContinuityTracker } from './continuity.mjs';
import { fingerprintMarketEvent } from './schema.mjs';
import { buildEvidencePassport } from './evidence_passport.mjs';
import { IngestionHistorian } from './ingestion_historian.mjs';

export class IngestionEngine {
  constructor({ registry, historian, continuity } = {}) {
    this.registry = registry ?? new AdapterRegistry();
    this.historian = historian ?? new IngestionHistorian();
    this.continuity = continuity ?? new ContinuityTracker();
    this.lastPassportByStream = new Map();
    this.accepted = 0;
    this.rejected = 0;
    this.lastError = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    const verification = await this.historian.initialize();
    this.continuity.hydrate(verification?.stream_tails ?? {});
    for (const [streamKey, tail] of Object.entries(verification?.stream_tails ?? {})) {
      if (tail?.passport_sha256) this.lastPassportByStream.set(streamKey, tail.passport_sha256);
    }
    this.initialized = true;
  }

  registerAdapter(manifest) {
    return this.registry.register(manifest);
  }

  async ingest(adapterId, rawEvent) {
    await this.initialize();
    const entry = this.registry.get(adapterId);
    if (!entry) {
      this.rejected += 1;
      this.lastError = 'ADAPTER_NOT_REGISTERED';
      throw new Error('ADAPTER_NOT_REGISTERED');
    }

    try {
      const sourceClassification = String(rawEvent?.source_classification ?? '').toUpperCase();
      if (sourceClassification !== entry.manifest.source_classification) throw new Error('ADAPTER_SOURCE_CLASSIFICATION_MISMATCH');
      if (String(rawEvent?.provider ?? '') !== entry.manifest.provider_name) throw new Error('ADAPTER_PROVIDER_MISMATCH');

      const { event, event_sha256 } = fingerprintMarketEvent(rawEvent);
      const streamKey = `${entry.manifest.adapter_id}|${event.instrument_id}|${event.event_type}`;
      const continuity = this.continuity.observe({ stream_key: streamKey, sequence: event.sequence, source_ts: event.source_ts });
      const prior = this.lastPassportByStream.get(streamKey) ?? null;
      const passport = buildEvidencePassport({
        manifest: entry.manifest,
        adapter_manifest_sha256: entry.adapter_manifest_sha256,
        event,
        event_sha256,
        continuity,
        prior_passport_sha256: prior
      });

      const persisted = await this.historian.append({ event, passport });
      this.lastPassportByStream.set(streamKey, passport.passport_sha256);
      this.accepted += 1;
      this.lastError = null;
      return {
        status: 'ACCEPTED_AS_EVIDENCE',
        quality_gate: passport.quality_gate,
        event_sha256,
        passport_sha256: passport.passport_sha256,
        prior_passport_sha256: passport.prior_passport_sha256,
        historian_chain_sha256: persisted.chain_sha256,
        continuity: passport.continuity,
        empirical_source_certified: false,
        authoritative_source_promoted: false,
        trading_authority: 'NONE'
      };
    } catch (err) {
      this.rejected += 1;
      this.lastError = err?.message || 'INGESTION_REJECTED';
      throw err;
    }
  }

  async verify() { await this.initialize(); return this.historian.verifyFile(); }
  async flush() { return this.historian.flush(); }

  status() {
    return {
      ingestion_contract_version: 1,
      initialized: this.initialized,
      accepted_events: this.accepted,
      rejected_events: this.rejected,
      last_error: this.lastError,
      registered_adapters: this.registry.list(),
      continuity: this.continuity.snapshot(),
      historian: this.historian.status(),
      empirical_source_certified: false,
      authoritative_source_promoted: false,
      trading_authority: 'NONE',
      production_mutation: false,
      automatic_live_promotion: false
    };
  }
}
