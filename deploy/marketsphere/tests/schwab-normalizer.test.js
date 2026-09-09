'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SUPPORTED_CANDIDATE_SCHEMA_VERSION, evaluateSchwabCandidate, numberOrNull } = require('../lib/schwab-proof-normalizer');

const TEST_NOW = Date.parse('2026-09-09T11:00:11.000Z');
const evalCandidate = (candidate, options = {}) => evaluateSchwabCandidate(candidate, { now_ms: TEST_NOW, ...options });

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
  const r = evalCandidate(eligibleCandidate());
  assert.equal(r.eligible, true);
  assert.equal(r.validation.eligible, true);
  assert.equal(r.decision, 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW');
  assert.equal(r.proof.source_id, 'SCHWAB');
  assert.equal(r.proof.instrument, 'SPY');
  assert.equal(r.proof.entitlement_verified, true);
  assert.equal(r.proof.delayed, false);
  assert.equal(r.proof.adapter_candidate_schema_version, SUPPORTED_CANDIDATE_SCHEMA_VERSION);
  assert.equal(r.proof.freshness_ms, 1000);
  assert.equal(r.proof.heartbeat_age_ms, 500);
  assert.equal(r.proof.transport_latency_ms, 10);
  assert.equal(r.governance.automatic_live_promotion, false);
  assert.equal(r.governance.capital_authority, 'NONE');
});

test('unknown or missing candidate schema version fails closed', () => {
  const missing = eligibleCandidate();
  delete missing.candidate_schema_version;
  const r1 = evalCandidate(missing);
  assert.equal(r1.eligible, false);
  assert.ok(r1.normalization_errors.includes('UNSUPPORTED_CANDIDATE_SCHEMA_VERSION'));

  const future = eligibleCandidate();
  future.candidate_schema_version = 999;
  const r2 = evalCandidate(future);
  assert.equal(r2.eligible, false);
  assert.ok(r2.normalization_errors.includes('UNSUPPORTED_CANDIDATE_SCHEMA_VERSION'));
});

test('unknown v1 top-level or frame fields are rejected at runtime', () => {
  const top = eligibleCandidate();
  top.unexpected_field = 'must-fail';
  const r1 = evalCandidate(top);
  assert.equal(r1.eligible, false);
  assert.ok(r1.normalization_errors.includes('UNKNOWN_CANDIDATE_FIELD'));
  assert.deepEqual(r1.unknown_candidate_paths, ['candidate.unexpected_field']);

  const frame = eligibleCandidate();
  frame.last_data.unexpected = 1;
  const r2 = evalCandidate(frame);
  assert.equal(r2.eligible, false);
  assert.ok(r2.unknown_candidate_paths.includes('candidate.last_data.unexpected'));
});

test('adapter candidate must itself be eligible even if normalized fields look valid', () => {
  const c = eligibleCandidate();
  c.eligible_for_governed_review = false;
  c.state = 'CONTINUITY_PENDING';
  const r = evalCandidate(c);
  assert.equal(r.eligible, false);
  assert.ok(r.normalization_errors.includes('ADAPTER_CANDIDATE_NOT_ELIGIBLE'));
  assert.ok(r.normalization_errors.includes('ADAPTER_STATE_NOT_ELIGIBLE'));
});

test('delayed Schwab data fails generic real-time certification', () => {
  const c = eligibleCandidate();
  c.realtime_status = 'DELAYED_OBSERVED';
  const r = evalCandidate(c);
  assert.equal(r.eligible, false);
  assert.equal(r.proof.delayed, true);
  assert.ok(r.validation.errors.includes('REALTIME_STATUS_NOT_VERIFIED'));
});

test('ambiguous instrument scope fails unless requested instrument was observed', () => {
  const c = eligibleCandidate();
  c.last_data.symbols = ['SPY', 'QQQ'];
  c.symbols_observed = ['SPY', 'QQQ'];
  const noSelection = evalCandidate(c);
  assert.equal(noSelection.eligible, false);
  assert.ok(noSelection.normalization_errors.includes('INSTRUMENT_REQUIRED_OR_AMBIGUOUS'));

  const selected = evalCandidate(c, { instrument: 'SPY' });
  assert.equal(selected.eligible, true);
  assert.equal(selected.proof.instrument, 'SPY');

  const missing = evalCandidate(c, { instrument: 'IWM' });
  assert.equal(missing.eligible, false);
  assert.ok(missing.normalization_errors.includes('INSTRUMENT_NOT_OBSERVED'));
});

test('secret-contaminated candidate is rejected before normalization can hide it', () => {
  const c = eligibleCandidate();
  const forbiddenKey = ['access', 'token'].join('_');
  c.transport = { [forbiddenKey]: 'synthetic-fixture-only' };
  const r = evalCandidate(c);
  assert.equal(r.eligible, false);
  assert.ok(r.normalization_errors.includes('FORBIDDEN_SECRET_FIELD_IN_CANDIDATE'));
  assert.ok(r.normalization_errors.includes('UNKNOWN_CANDIDATE_FIELD'));
  assert.equal(r.forbidden_candidate_paths.length, 1);
});

test('reported adapter ages cannot forge freshness or heartbeat', () => {
  const c = eligibleCandidate();
  c.data_age_ms = 0;
  c.heartbeat_age_ms = 0;
  const r = evalCandidate(c, { now_ms: Date.parse('2026-09-09T11:01:00.000Z') });
  assert.equal(r.proof.adapter_reported_data_age_ms, 0);
  assert.equal(r.proof.adapter_reported_heartbeat_age_ms, 0);
  assert.equal(r.proof.freshness_ms, 50000);
  assert.equal(r.proof.heartbeat_age_ms, 49500);
  assert.equal(r.eligible, false);
  assert.ok(r.validation.errors.includes('FRESHNESS_FAIL'));
  assert.ok(r.validation.errors.includes('HEARTBEAT_STALE'));
});

test('future or source-after-receive timestamps fail closed', () => {
  const future = eligibleCandidate();
  future.last_data.sourceTimestampMs = Date.parse('2026-09-09T11:00:20.000Z');
  future.last_source_timestamp_ms = future.last_data.sourceTimestampMs;
  const r1 = evalCandidate(future, { max_future_skew_ms: 1000 });
  assert.equal(r1.eligible, false);
  assert.ok(r1.normalization_errors.includes('SOURCE_TIMESTAMP_IN_FUTURE'));
  assert.ok(r1.normalization_errors.includes('SOURCE_TIMESTAMP_AFTER_RECEIVE'));

  const receiveFuture = eligibleCandidate();
  receiveFuture.last_data.receivedAt = '2026-09-09T11:00:20.000Z';
  receiveFuture.last_receive_at = receiveFuture.last_data.receivedAt;
  const r2 = evalCandidate(receiveFuture, { max_future_skew_ms: 1000 });
  assert.equal(r2.eligible, false);
  assert.ok(r2.normalization_errors.includes('RECEIVE_TIMESTAMP_IN_FUTURE'));
});

test('missing numeric evidence remains null rather than becoming zero', () => {
  assert.equal(numberOrNull(null), null);
  assert.equal(numberOrNull(undefined), null);
  assert.equal(numberOrNull('0'), null);
  const c = eligibleCandidate();
  c.data_messages = null;
  const r = evalCandidate(c);
  assert.equal(r.proof.messages_received, null);
  assert.equal(r.eligible, false);
  assert.ok(r.validation.errors.includes('NO_MARKET_MESSAGES'));
});

test('alternative continuity can pass only when explicitly governed and already verified by adapter', () => {
  const c = eligibleCandidate();
  c.sequence_gaps = null;
  const strict = evalCandidate(c, { require_sequence_integrity: true });
  assert.equal(strict.eligible, false);
  assert.ok(strict.validation.errors.includes('SEQUENCE_GAPS_INVALID'));

  const governedAlternative = evalCandidate(c, { require_sequence_integrity: false });
  assert.equal(governedAlternative.eligible, true);
  assert.equal(governedAlternative.proof.sequence_integrity, true);
  assert.equal(governedAlternative.proof.sequence_gaps, null);
});
