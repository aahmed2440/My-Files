'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SUPPORTED_CANDIDATE_SCHEMA_VERSION, evaluateSchwabCandidate, numberOrNull } = require('../lib/schwab-proof-normalizer');

function eligibleCandidate() {
  const firstSource = Date.parse('2026-09-09T11:00:00.000Z');
  const lastSource = Date.parse('2026-09-09T11:00:10.000Z');
  return {
    candidate_schema_version: 1,
    classification: 'EMPIRICAL_MARKET_SOURCE_EVIDENCE_CANDIDATE',
    source: 'SCHWAB_TOS',
    provider: 'Charles Schwab Trader API',
    adapter_version: '0.2.0-cert',
    authentication: 'VERIFIED',
    subscription: 'ACK',
    connection: 'CONNECTED',
    first_data: {
      observedAt: '2026-09-09T11:00:00.010Z',
      receivedAt: '2026-09-09T11:00:00.010Z',
      sourceTimestampMs: firstSource,
      sha256: 'a'.repeat(64),
      service: 'LEVELONE_EQUITIES',
      count: 1,
      symbols: ['SPY'],
      realtime: 1,
      delayed: 0,
      unknown: 0
    },
    last_data: {
      observedAt: '2026-09-09T11:00:10.010Z',
      receivedAt: '2026-09-09T11:00:10.010Z',
      sourceTimestampMs: lastSource,
      sha256: 'b'.repeat(64),
      service: 'LEVELONE_EQUITIES',
      count: 1,
      symbols: ['SPY'],
      realtime: 1,
      delayed: 0,
      unknown: 0
    },
    last_heartbeat_at: '2026-09-09T11:00:10.500Z',
    last_source_timestamp_ms: lastSource,
    last_receive_at: '2026-09-09T11:00:10.010Z',
    clock_skew_ms: 10,
    events_received: 10,
    data_messages: 10,
    heartbeats: 5,
    symbols_observed: ['SPY'],
    realtime_status: 'REALTIME_OBSERVED',
    entitlement: 'VERIFIED',
    timestamp_integrity: 'VERIFIED',
    continuity: 'VERIFIED',
    sequence_gaps: 0,
    heartbeat_age_ms: 500,
    data_age_ms: 10,
    state: 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW',
    eligible_for_governed_review: true,
    automatic_live_promotion: false,
    trading_authority: 'NONE'
  };
}

test('eligible Schwab candidate normalizes and passes generic MS-L2 validator', () => {
  const r = evaluateSchwabCandidate(eligibleCandidate());
  assert.equal(r.eligible, true);
  assert.equal(r.validation.eligible, true);
  assert.equal(r.decision, 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW');
  assert.equal(r.proof.source_id, 'SCHWAB');
  assert.equal(r.proof.instrument, 'SPY');
  assert.equal(r.proof.entitlement_verified, true);
  assert.equal(r.proof.delayed, false);
  assert.equal(r.proof.adapter_candidate_schema_version, SUPPORTED_CANDIDATE_SCHEMA_VERSION);
  assert.equal(r.governance.automatic_live_promotion, false);
  assert.equal(r.governance.capital_authority, 'NONE');
});

test('unknown or missing candidate schema version fails closed', () => {
  const missing = eligibleCandidate();
  delete missing.candidate_schema_version;
  const r1 = evaluateSchwabCandidate(missing);
  assert.equal(r1.eligible, false);
  assert.ok(r1.normalization_errors.includes('UNSUPPORTED_CANDIDATE_SCHEMA_VERSION'));

  const future = eligibleCandidate();
  future.candidate_schema_version = 999;
  const r2 = evaluateSchwabCandidate(future);
  assert.equal(r2.eligible, false);
  assert.ok(r2.normalization_errors.includes('UNSUPPORTED_CANDIDATE_SCHEMA_VERSION'));
});

test('adapter candidate must itself be eligible even if normalized fields look valid', () => {
  const c = eligibleCandidate();
  c.eligible_for_governed_review = false;
  c.state = 'CONTINUITY_PENDING';
  const r = evaluateSchwabCandidate(c);
  assert.equal(r.eligible, false);
  assert.ok(r.normalization_errors.includes('ADAPTER_CANDIDATE_NOT_ELIGIBLE'));
  assert.ok(r.normalization_errors.includes('ADAPTER_STATE_NOT_ELIGIBLE'));
});

test('delayed Schwab data fails generic real-time certification', () => {
  const c = eligibleCandidate();
  c.realtime_status = 'DELAYED_OBSERVED';
  const r = evaluateSchwabCandidate(c);
  assert.equal(r.eligible, false);
  assert.equal(r.proof.delayed, true);
  assert.ok(r.validation.errors.includes('REALTIME_STATUS_NOT_VERIFIED'));
});

test('ambiguous instrument scope fails unless requested instrument was observed', () => {
  const c = eligibleCandidate();
  c.last_data.symbols = ['SPY', 'QQQ'];
  c.symbols_observed = ['SPY', 'QQQ'];
  const noSelection = evaluateSchwabCandidate(c);
  assert.equal(noSelection.eligible, false);
  assert.ok(noSelection.normalization_errors.includes('INSTRUMENT_REQUIRED_OR_AMBIGUOUS'));

  const selected = evaluateSchwabCandidate(c, { instrument: 'SPY' });
  assert.equal(selected.eligible, true);
  assert.equal(selected.proof.instrument, 'SPY');

  const missing = evaluateSchwabCandidate(c, { instrument: 'IWM' });
  assert.equal(missing.eligible, false);
  assert.ok(missing.normalization_errors.includes('INSTRUMENT_NOT_OBSERVED'));
});

test('secret-contaminated candidate is rejected before normalization can hide it', () => {
  const c = eligibleCandidate();
  const forbiddenKey = ['access', 'token'].join('_');
  c.transport = { [forbiddenKey]: 'synthetic-fixture-only' };
  const r = evaluateSchwabCandidate(c);
  assert.equal(r.eligible, false);
  assert.ok(r.normalization_errors.includes('FORBIDDEN_SECRET_FIELD_IN_CANDIDATE'));
  assert.equal(r.forbidden_candidate_paths.length, 1);
});

test('missing numeric evidence remains null rather than becoming zero', () => {
  assert.equal(numberOrNull(null), null);
  assert.equal(numberOrNull(undefined), null);
  assert.equal(numberOrNull('0'), null);
  const c = eligibleCandidate();
  c.data_age_ms = null;
  c.heartbeat_age_ms = null;
  const r = evaluateSchwabCandidate(c);
  assert.equal(r.proof.freshness_ms, null);
  assert.equal(r.proof.heartbeat_age_ms, null);
  assert.equal(r.eligible, false);
  assert.ok(r.validation.errors.includes('FRESHNESS_FAIL'));
  assert.ok(r.validation.errors.includes('HEARTBEAT_STALE'));
});

test('alternative continuity can pass only when explicitly governed and already verified by adapter', () => {
  const c = eligibleCandidate();
  c.sequence_gaps = null;
  const strict = evaluateSchwabCandidate(c, { require_sequence_integrity: true });
  assert.equal(strict.eligible, false);
  assert.ok(strict.validation.errors.includes('SEQUENCE_GAPS_INVALID'));

  const governedAlternative = evaluateSchwabCandidate(c, { require_sequence_integrity: false });
  assert.equal(governedAlternative.eligible, true);
  assert.equal(governedAlternative.proof.sequence_integrity, true);
  assert.equal(governedAlternative.proof.sequence_gaps, null);
});
