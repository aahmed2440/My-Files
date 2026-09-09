'use strict';

const FORBIDDEN_KEYS = /(^|_)(password|passwd|secret|client_secret|api_key|access_token|refresh_token|authorization|cookie|private_key|account_credential)s?$/i;
const CERT_CLASS = 'EMPIRICAL_MARKET_SOURCE_EVIDENCE';

function finiteNonNegative(v) {
  return Number.isFinite(v) && v >= 0;
}

function parseIso(v) {
  if (typeof v !== 'string' || !v) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

function forbiddenPaths(value, prefix = '', out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [k, v] of Object.entries(value)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (FORBIDDEN_KEYS.test(k)) out.push(p);
    if (v && typeof v === 'object') forbiddenPaths(v, p, out);
  }
  return out;
}

function validateSourceProof(proof, policy = {}) {
  const maxFreshnessMs = Number(policy.max_freshness_ms ?? 15000);
  const maxHeartbeatAgeMs = Number(policy.max_heartbeat_age_ms ?? 45000);
  const errors = [];
  const forbidden = forbiddenPaths(proof);

  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
    return { valid: false, eligible: false, errors: ['PROOF_NOT_OBJECT'], forbidden_paths: [] };
  }
  if (forbidden.length) errors.push('FORBIDDEN_SECRET_FIELD');
  if (proof.classification !== CERT_CLASS) errors.push('WRONG_CLASSIFICATION');
  if (proof.simulated === true || proof.synthetic === true) errors.push('SIMULATED_OR_SYNTHETIC');
  if (typeof proof.source_id !== 'string' || !proof.source_id.trim()) errors.push('SOURCE_ID_REQUIRED');
  if (typeof proof.provider !== 'string' || !proof.provider.trim()) errors.push('PROVIDER_REQUIRED');
  if (typeof proof.service !== 'string' || !proof.service.trim()) errors.push('SERVICE_REQUIRED');
  if (typeof proof.instrument !== 'string' || !proof.instrument.trim()) errors.push('INSTRUMENT_REQUIRED');
  if (proof.authentication !== 'VERIFIED') errors.push('AUTH_NOT_VERIFIED');
  if (proof.subscription !== 'ACK') errors.push('SUBSCRIPTION_NOT_ACK');
  if (proof.connection !== 'CONNECTED') errors.push('CONNECTION_NOT_CONNECTED');
  if (!parseIso(proof.first_data_at)) errors.push('FIRST_DATA_REQUIRED');
  if (!parseIso(proof.source_ts)) errors.push('SOURCE_TIMESTAMP_REQUIRED');
  if (!parseIso(proof.recv_ts)) errors.push('RECEIVE_TIMESTAMP_REQUIRED');
  if (!parseIso(proof.heartbeat_at)) errors.push('HEARTBEAT_REQUIRED');
  if (!finiteNonNegative(proof.messages_received) || proof.messages_received < 1) errors.push('NO_MARKET_MESSAGES');
  if (!finiteNonNegative(proof.freshness_ms) || proof.freshness_ms > maxFreshnessMs) errors.push('FRESHNESS_FAIL');
  if (!finiteNonNegative(proof.heartbeat_age_ms) || proof.heartbeat_age_ms > maxHeartbeatAgeMs) errors.push('HEARTBEAT_STALE');
  if (proof.timestamp_integrity !== true) errors.push('TIMESTAMP_INTEGRITY_FAIL');
  if (proof.sequence_integrity !== true) errors.push('SEQUENCE_INTEGRITY_FAIL');
  if (!finiteNonNegative(proof.sequence_gaps)) errors.push('SEQUENCE_GAPS_INVALID');
  if (proof.sequence_gaps !== 0) errors.push('SEQUENCE_GAPS_PRESENT');
  if (typeof proof.provenance !== 'string' || proof.provenance.trim().length < 8) errors.push('PROVENANCE_REQUIRED');
  if (typeof proof.proof_window_start !== 'string' || !parseIso(proof.proof_window_start)) errors.push('PROOF_WINDOW_START_REQUIRED');
  if (typeof proof.proof_window_end !== 'string' || !parseIso(proof.proof_window_end)) errors.push('PROOF_WINDOW_END_REQUIRED');

  const ws = parseIso(proof.proof_window_start);
  const we = parseIso(proof.proof_window_end);
  if (ws !== null && we !== null && we < ws) errors.push('PROOF_WINDOW_INVALID');

  const valid = errors.length === 0;
  return {
    valid,
    eligible: valid,
    decision: valid ? 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW' : 'NOT_ELIGIBLE',
    errors: [...new Set(errors)],
    forbidden_paths: forbidden,
    policy: { max_freshness_ms: maxFreshnessMs, max_heartbeat_age_ms: maxHeartbeatAgeMs },
    governance: { automatic_live_promotion: false, capital_authority: 'NONE', t0: 'LOCKED' }
  };
}

module.exports = { CERT_CLASS, forbiddenPaths, validateSourceProof };
