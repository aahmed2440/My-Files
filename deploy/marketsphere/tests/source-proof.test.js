'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CERT_CLASS, validateSourceProof } = require('../lib/source-proof');

function validProof() {
  return {
    classification: CERT_CLASS,
    simulated: false,
    source_id: 'TEST_REAL_SOURCE',
    provider: 'Provider Under Test',
    service: 'MARKET_DATA',
    instrument: 'TEST-INSTRUMENT',
    entitlement_verified: true,
    delayed: false,
    authentication: 'VERIFIED',
    subscription: 'ACK',
    connection: 'CONNECTED',
    first_data_at: '2026-09-09T01:00:00.000Z',
    source_ts: '2026-09-09T01:00:10.000Z',
    recv_ts: '2026-09-09T01:00:10.010Z',
    heartbeat_at: '2026-09-09T01:00:10.500Z',
    messages_received: 100,
    freshness_ms: 10,
    heartbeat_age_ms: 500,
    timestamp_integrity: true,
    sequence_integrity: true,
    sequence_gaps: 0,
    provenance: 'Provider endpoint → MarketSphere adapter → normalized event',
    proof_window_start: '2026-09-09T01:00:00.000Z',
    proof_window_end: '2026-09-09T01:01:00.000Z'
  };
}

test('complete empirical proof is eligible only for governed review', () => {
  const r = validateSourceProof(validProof());
  assert.equal(r.valid, true);
  assert.equal(r.eligible, true);
  assert.equal(r.decision, 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW');
  assert.equal(r.governance.automatic_live_promotion, false);
  assert.equal(r.governance.capital_authority, 'NONE');
  assert.equal(r.governance.t0, 'LOCKED');
});

test('synthetic proof is categorically ineligible', () => {
  const p = validProof(); p.simulated = true;
  const r = validateSourceProof(p);
  assert.equal(r.eligible, false);
  assert.ok(r.errors.includes('SIMULATED_OR_SYNTHETIC'));
});

test('missing packet heartbeat and integrity evidence fails closed', () => {
  const p = validProof();
  p.messages_received = 0; p.heartbeat_age_ms = 999999; p.sequence_integrity = false;
  const r = validateSourceProof(p);
  assert.equal(r.eligible, false);
  assert.ok(r.errors.includes('NO_MARKET_MESSAGES'));
  assert.ok(r.errors.includes('HEARTBEAT_STALE'));
  assert.ok(r.errors.includes('SEQUENCE_INTEGRITY_FAIL'));
});

test('unverified entitlement or delayed data cannot satisfy real-time certification', () => {
  const p = validProof(); p.entitlement_verified = false; p.delayed = true;
  const r = validateSourceProof(p);
  assert.equal(r.eligible, false);
  assert.ok(r.errors.includes('ENTITLEMENT_NOT_VERIFIED'));
  assert.ok(r.errors.includes('REALTIME_STATUS_NOT_VERIFIED'));
});

test('secret-like fields invalidate the evidence artifact', () => {
  const p = validProof();
  const forbiddenKey = ['access', 'token'].join('_');
  p.transport = { [forbiddenKey]: ['fixture', 'only'].join('-') };
  const r = validateSourceProof(p);
  assert.equal(r.eligible, false);
  assert.ok(r.errors.includes('FORBIDDEN_SECRET_FIELD'));
  assert.deepEqual(r.forbidden_paths, ['transport.access_token']);
});

test('policy thresholds are deterministic and explicit', () => {
  const p = validProof(); p.freshness_ms = 25;
  const pass = validateSourceProof(p, { max_freshness_ms: 30, max_heartbeat_age_ms: 1000 });
  const fail = validateSourceProof(p, { max_freshness_ms: 20, max_heartbeat_age_ms: 1000 });
  assert.equal(pass.eligible, true);
  assert.equal(fail.eligible, false);
  assert.ok(fail.errors.includes('FRESHNESS_FAIL'));
});

test('disabling generic sequence requirement does not silently waive continuity proof', () => {
  const p = validProof(); p.sequence_integrity = false;
  const r = validateSourceProof(p, { require_sequence_integrity: false });
  assert.equal(r.eligible, false);
  assert.ok(r.errors.includes('ALTERNATIVE_CONTINUITY_POLICY_REQUIRED'));
});
