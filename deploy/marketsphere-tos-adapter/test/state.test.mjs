import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedState } from '../src/state.mjs';

test('proof appears only after data and captures real-time status', () => {
  const s = new FeedState({ symbols:['SPY'], services:['LEVELONE_EQUITIES'] });
  assert.equal(s.snapshot().proof_available, false);
  s.data('LEVELONE_EQUITIES', Date.now(), [{key:'SPY',delayed:false}]);
  assert.equal(s.snapshot().proof_available, true);
  assert.equal(s.proof().events_received, 1);
  assert.deepEqual(s.proof().symbols_observed, ['SPY']);
  assert.equal(s.snapshot().realtime_status, 'REALTIME_OBSERVED');
  assert.match(s.proof().first_data.sha256, /^[a-f0-9]{64}$/);
});

test('subscription ack alone remains awaiting data', () => {
  const s = new FeedState();
  s.setAuth('VERIFIED');
  s.setSocket('CONNECTED');
  s.setSubscription('ACK');
  s.setMode('SUBSCRIBED_AWAITING_DATA');
  assert.equal(s.snapshot().mode, 'SUBSCRIBED_AWAITING_DATA');
  assert.equal(s.snapshot().proof_available, false);
});

test('fresh real-time data still requires entitlement, timestamp integrity and continuity', () => {
  const s = new FeedState();
  s.setAuth('VERIFIED');
  s.setSocket('CONNECTED');
  s.setSubscription('ACK');
  s.data('LEVELONE_EQUITIES', Date.now(), [{key:'SPY',delayed:false}]);
  s.heartbeat(Date.now());
  assert.equal(s.snapshot().mode, 'ENTITLEMENT_PENDING');
  s.setEntitlement('VERIFIED');
  assert.equal(s.snapshot().mode, 'TIMESTAMP_INTEGRITY_PENDING');
  s.setTimestampIntegrity('VERIFIED');
  assert.equal(s.snapshot().mode, 'CONTINUITY_PENDING');
  s.setContinuity('VERIFIED', { sequenceGaps: 0 });
  assert.equal(s.snapshot().mode, 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW');
  assert.equal(s.proof().eligible_for_governed_review, true);
  assert.equal(s.proof().automatic_live_promotion, false);
});

test('eligible state degrades on stale heartbeat or data', () => {
  const s = new FeedState();
  s.setAuth('VERIFIED');
  s.setSocket('CONNECTED');
  s.setSubscription('ACK');
  s.data('LEVELONE_EQUITIES', Date.now(), [{key:'SPY',delayed:false}]);
  s.heartbeat(Date.now());
  s.setEntitlement('VERIFIED');
  s.setTimestampIntegrity('VERIFIED');
  s.setContinuity('VERIFIED', { sequenceGaps: 0 });
  s.lastHeartbeatAt = new Date(Date.now()-10000).toISOString();
  s.lastDataAt = new Date(Date.now()-10000).toISOString();
  assert.equal(s.snapshot({heartbeatStaleMs:1000,dataStaleMs:20000}).mode, 'DEGRADED');
  assert.equal(s.snapshot({heartbeatStaleMs:20000,dataStaleMs:1000}).mode, 'STALE');
});

test('sequence gaps are unknown until continuity is actually set', () => {
  const s = new FeedState();
  assert.equal(s.snapshot().sequence_gaps, null);
  assert.equal(s.snapshot().continuity, 'UNVERIFIED');
  s.setContinuity('VERIFIED', { sequenceGaps: 0 });
  assert.equal(s.snapshot().sequence_gaps, 0);
  assert.equal(s.snapshot().continuity, 'VERIFIED');
});

test('timestamp integrity is independent and fail-closed', () => {
  const s = new FeedState();
  assert.equal(s.snapshot().timestamp_integrity, 'UNVERIFIED');
  s.setTimestampIntegrity('VERIFIED');
  assert.equal(s.snapshot().timestamp_integrity, 'VERIFIED');
});

test('candidate proof carries source and receive timestamps without credentials', () => {
  const s = new FeedState();
  s.setAuth('VERIFIED');
  s.setSocket('CONNECTED');
  s.setSubscription('ACK');
  const ts = Date.now();
  s.data('LEVELONE_EQUITIES', ts, [{key:'SPY',delayed:false}]);
  const p = s.proof();
  assert.equal(p.authentication, 'VERIFIED');
  assert.equal(p.subscription, 'ACK');
  assert.equal(p.connection, 'CONNECTED');
  assert.equal(p.last_source_timestamp_ms, ts);
  assert.equal(typeof p.last_receive_at, 'string');
  assert.deepEqual(p.last_data.symbols, ['SPY']);
  const serialized = JSON.stringify(p).toLowerCase();
  assert.equal(serialized.includes('access_token'), false);
  assert.equal(serialized.includes('authorization'), false);
});

test('delayed observations fail real-time eligibility', () => {
  const s = new FeedState();
  s.setAuth('VERIFIED');
  s.setSocket('CONNECTED');
  s.setSubscription('ACK');
  s.data('LEVELONE_EQUITIES', Date.now(), [{key:'SPY',delayed:true}]);
  s.heartbeat(Date.now());
  s.setEntitlement('VERIFIED');
  s.setTimestampIntegrity('VERIFIED');
  s.setContinuity('VERIFIED', { sequenceGaps: 0 });
  assert.equal(s.snapshot().mode, 'DELAYED_DATA');
  assert.equal(s.proof().eligible_for_governed_review, false);
});

test('authority is permanently non-trading', () => {
  const s = new FeedState();
  assert.equal(s.snapshot().trading_authority, 'NONE');
  assert.equal(s.snapshot().production_mutation, false);
  assert.equal(s.snapshot().automatic_live_promotion, false);
});
