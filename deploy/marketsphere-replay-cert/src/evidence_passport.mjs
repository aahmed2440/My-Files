import { canonicalJson, sha256 } from './schema.mjs';

export const EVIDENCE_PASSPORT_VERSION = 1;

function qualityGate(continuity) {
  const failed = String(continuity?.continuity ?? '').startsWith('FAILED_');
  if (failed) return 'DEGRADED_EVIDENCE_ONLY';
  if (continuity?.provider_continuity_verified === true) return 'CONTINUITY_PROVIDER_VERIFIED';
  return 'EVIDENCE_OBSERVED_NOT_CERTIFIED';
}

export function buildEvidencePassport({ manifest, adapter_manifest_sha256, event, event_sha256, continuity, prior_passport_sha256 = null }) {
  if (!manifest || !adapter_manifest_sha256 || !event || !event_sha256 || !continuity) throw new Error('EVIDENCE_PASSPORT_INPUT_REQUIRED');
  const base = {
    evidence_passport_version: EVIDENCE_PASSPORT_VERSION,
    adapter_id: manifest.adapter_id,
    adapter_version: manifest.adapter_version,
    adapter_manifest_sha256,
    source_classification: event.source_classification,
    source: event.source,
    provider: event.provider,
    instrument_id: event.instrument_id,
    symbol: event.symbol,
    event_type: event.event_type,
    source_ts: event.source_ts,
    receive_ts: event.receive_ts,
    event_sha256,
    continuity: {
      stream_key: continuity.stream_key,
      state: continuity.continuity,
      observation: continuity.observation,
      sequence: continuity.sequence,
      sequence_gaps: continuity.sequence_gaps,
      sequence_duplicates: continuity.sequence_duplicates,
      sequence_regressions: continuity.sequence_regressions,
      timestamp_regressions: continuity.timestamp_regressions,
      provider_continuity_verified: false
    },
    quality_gate: qualityGate(continuity),
    quality_flags: Array.isArray(event.quality_flags) ? [...event.quality_flags] : [],
    observed_at: event.receive_ts,
    prior_passport_sha256,
    empirical_source_certified: false,
    authoritative_source_promoted: false,
    trading_authority: 'NONE',
    production_mutation: false,
    automatic_live_promotion: false
  };
  const passport_sha256 = sha256(canonicalJson(base));
  return { ...base, passport_sha256 };
}
