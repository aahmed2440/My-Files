'use strict';

const { CERT_CLASS, forbiddenPaths, validateSourceProof } = require('./source-proof');

function isoFromEpochMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function str(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeInstrument(candidate, requested) {
  const explicit = str(requested);
  const lastSymbols = Array.isArray(candidate?.last_data?.symbols) ? candidate.last_data.symbols.filter(x => typeof x === 'string') : [];
  const observed = Array.isArray(candidate?.symbols_observed) ? candidate.symbols_observed.filter(x => typeof x === 'string') : [];
  const available = [...new Set([...lastSymbols, ...observed])];
  if (explicit) return available.includes(explicit) ? { instrument: explicit, error: null } : { instrument: explicit, error: 'INSTRUMENT_NOT_OBSERVED' };
  if (lastSymbols.length === 1) return { instrument: lastSymbols[0], error: null };
  if (available.length === 1) return { instrument: available[0], error: null };
  return { instrument: null, error: 'INSTRUMENT_REQUIRED_OR_AMBIGUOUS' };
}

function evaluateSchwabCandidate(candidate, options = {}) {
  const normalizationErrors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
      eligible: false,
      decision: 'NOT_ELIGIBLE',
      normalization_errors: ['CANDIDATE_NOT_OBJECT'],
      proof: null,
      validation: null,
      governance: { automatic_live_promotion: false, capital_authority: 'NONE', t0: 'LOCKED' }
    };
  }

  const forbidden = forbiddenPaths(candidate);
  if (forbidden.length) normalizationErrors.push('FORBIDDEN_SECRET_FIELD_IN_CANDIDATE');
  if (candidate.classification !== 'EMPIRICAL_MARKET_SOURCE_EVIDENCE_CANDIDATE') normalizationErrors.push('WRONG_CANDIDATE_CLASSIFICATION');
  if (candidate.source !== 'SCHWAB_TOS') normalizationErrors.push('WRONG_SOURCE');
  if (candidate.provider !== 'Charles Schwab Trader API') normalizationErrors.push('WRONG_PROVIDER');
  if (candidate.automatic_live_promotion !== false) normalizationErrors.push('AUTOMATIC_LIVE_PROMOTION_NOT_FALSE');
  if (candidate.trading_authority !== 'NONE') normalizationErrors.push('TRADING_AUTHORITY_NOT_NONE');

  const selected = normalizeInstrument(candidate, options.instrument);
  if (selected.error) normalizationErrors.push(selected.error);

  const firstDataAt = str(candidate?.first_data?.receivedAt) || str(candidate?.first_data?.observedAt);
  const recvTs = str(candidate?.last_data?.receivedAt) || str(candidate?.last_receive_at);
  const sourceTs = isoFromEpochMs(candidate?.last_data?.sourceTimestampMs ?? candidate?.last_source_timestamp_ms);
  const heartbeatAt = str(candidate?.last_heartbeat_at);
  const service = str(candidate?.last_data?.service) || str(candidate?.first_data?.service);
  const delayed = candidate.realtime_status === 'REALTIME_OBSERVED' ? false : candidate.realtime_status === 'DELAYED_OBSERVED' ? true : null;

  const proof = {
    classification: CERT_CLASS,
    simulated: false,
    synthetic: false,
    source_id: 'SCHWAB',
    provider: 'Charles Schwab Trader API',
    service,
    instrument: selected.instrument,
    entitlement_verified: candidate.entitlement === 'VERIFIED',
    delayed,
    authentication: candidate.authentication,
    subscription: candidate.subscription,
    connection: candidate.connection,
    first_data_at: firstDataAt,
    source_ts: sourceTs,
    recv_ts: recvTs,
    heartbeat_at: heartbeatAt,
    messages_received: numberOrNull(candidate.data_messages),
    freshness_ms: numberOrNull(candidate.data_age_ms),
    heartbeat_age_ms: numberOrNull(candidate.heartbeat_age_ms),
    timestamp_integrity: candidate.timestamp_integrity === 'VERIFIED',
    sequence_integrity: candidate.continuity === 'VERIFIED',
    sequence_gaps: numberOrNull(candidate.sequence_gaps),
    provenance: `Charles Schwab Trader API streamer -> MarketSphere Schwab/TOS adapter ${str(candidate.adapter_version) || 'unknown-version'}`,
    proof_window_start: firstDataAt,
    proof_window_end: recvTs,
    adapter_candidate_state: candidate.state,
    adapter_candidate_eligible: candidate.eligible_for_governed_review === true,
    adapter_version: str(candidate.adapter_version),
    candidate_first_data_hash: str(candidate?.first_data?.sha256),
    candidate_last_data_hash: str(candidate?.last_data?.sha256)
  };

  const validation = validateSourceProof(proof, {
    max_freshness_ms: options.max_freshness_ms,
    max_heartbeat_age_ms: options.max_heartbeat_age_ms,
    require_sequence_integrity: options.require_sequence_integrity !== false,
    require_realtime: true
  });

  if (candidate.eligible_for_governed_review !== true) normalizationErrors.push('ADAPTER_CANDIDATE_NOT_ELIGIBLE');
  if (candidate.state !== 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW') normalizationErrors.push('ADAPTER_STATE_NOT_ELIGIBLE');

  const eligible = normalizationErrors.length === 0 && validation.eligible === true;
  return {
    eligible,
    decision: eligible ? 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW' : 'NOT_ELIGIBLE',
    normalization_errors: [...new Set(normalizationErrors)],
    forbidden_candidate_paths: forbidden,
    proof,
    validation,
    governance: { automatic_live_promotion: false, capital_authority: 'NONE', t0: 'LOCKED' }
  };
}

module.exports = { evaluateSchwabCandidate, isoFromEpochMs, numberOrNull };
