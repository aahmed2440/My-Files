import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedState } from '../src/state.mjs';

test('proof appears only after data', () => {
  const s = new FeedState({ symbols:['SPY'], services:['LEVELONE_EQUITIES'] });
  assert.equal(s.snapshot().proof_available, false);
  s.data('LEVELONE_EQUITIES', Date.now(), [{key:'SPY'}]);
  assert.equal(s.snapshot().proof_available, true);
  assert.equal(s.proof().events_received, 1);
  assert.deepEqual(s.proof().symbols_observed, ['SPY']);
  assert.match(s.proof().first_data.sha256, /^[a-f0-9]{64}$/);
});

test('live degrades on stale heartbeat/data', () => {
  const s = new FeedState();
  s.setMode('LIVE');
  s.lastHeartbeatAt = new Date(Date.now()-10000).toISOString();
  s.lastDataAt = new Date(Date.now()-10000).toISOString();
  assert.equal(s.snapshot({heartbeatStaleMs:1000,dataStaleMs:20000}).mode, 'DEGRADED');
  assert.equal(s.snapshot({heartbeatStaleMs:20000,dataStaleMs:1000}).mode, 'STALE');
});

test('authority is permanently non-trading', () => {
  const s = new FeedState();
  assert.equal(s.snapshot().trading_authority, 'NONE');
  assert.equal(s.snapshot().production_mutation, false);
});
