import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedState } from '../src/state.mjs';
import { SchwabTosAdapter } from '../src/adapter.mjs';

test('payload proof hashes canonical market content and forms a tamper-evident chain', () => {
  const s = new FeedState();
  const ts = Date.now();
  s.data('LEVELONE_EQUITIES', ts, [{key:'SPY',price:100,delayed:false}], 10);
  const first = s.proof().last_data;
  s.data('LEVELONE_EQUITIES', ts + 1, [{key:'SPY',price:101,delayed:false}], 11);
  const second = s.proof().last_data;
  assert.match(first.payload_sha256, /^[a-f0-9]{64}$/);
  assert.match(first.event_sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(first.payload_sha256, second.payload_sha256);
  assert.notEqual(first.chain_sha256, second.chain_sha256);
  assert.equal(s.snapshot().proof_chain_length, 2);
  assert.equal(s.snapshot().sequence_gaps, 0);
  assert.equal(s.snapshot().sequence_observations, 2);
});

test('canonical payload hashing is stable across object key order', () => {
  const ts = 1700000000000;
  const a = new FeedState();
  const b = new FeedState();
  a.data('LEVELONE_EQUITIES', ts, [{key:'SPY',bid:99,ask:101,delayed:false}]);
  b.data('LEVELONE_EQUITIES', ts, [{ask:101,delayed:false,bid:99,key:'SPY'}]);
  assert.equal(a.proof().last_data.payload_sha256, b.proof().last_data.payload_sha256);
});

test('sequence gap and timestamp regression fail closed', () => {
  const s = new FeedState();
  const ts = Date.now();
  s.setAuth('VERIFIED'); s.setSocket('CONNECTED'); s.setSubscription('ACK');
  s.data('LEVELONE_EQUITIES', ts, [{key:'SPY',delayed:false}], 20);
  s.data('LEVELONE_EQUITIES', ts - 1000, [{key:'SPY',delayed:false}], 22);
  s.heartbeat(ts);
  assert.equal(s.snapshot().sequence_gaps, 1);
  assert.equal(s.snapshot().continuity, 'FAILED_SEQUENCE_GAP');
  assert.equal(s.snapshot().timestamp_integrity, 'FAILED_TIMESTAMP_REGRESSION');
  assert.equal(s.snapshot().mode, 'TIMESTAMP_INTEGRITY_FAILED');
});

test('duplicate payload evidence is counted without retaining raw payload in proof', () => {
  const s = new FeedState();
  const ts = Date.now();
  const payload = [{key:'QQQ',marker:'DO_NOT_EXPOSE_9X7Q',delayed:false}];
  s.data('LEVELONE_EQUITIES', ts, payload);
  s.data('LEVELONE_EQUITIES', ts, payload);
  assert.equal(s.snapshot().duplicate_payloads, 1);
  assert.equal(JSON.stringify(s.proof()).includes('DO_NOT_EXPOSE_9X7Q'), false);
});

test('adapter rejects oversized streaming frames before parsing', () => {
  process.env.SCHWAB_MAX_FRAME_BYTES = String(64 * 1024);
  const a = new SchwabTosAdapter();
  a.onMessage('x'.repeat(70 * 1024), {});
  assert.equal(a.state.lastErrorCode, 'STREAM_FRAME_TOO_LARGE');
});

test('adapter maps provider sequence evidence when a sequence field is present', () => {
  const a = new SchwabTosAdapter();
  const now = Date.now();
  a.onMessage(JSON.stringify({data:[
    {service:'LEVELONE_EQUITIES',timestamp:now,sequence:7,content:[{key:'SPY',delayed:false}]},
    {service:'LEVELONE_EQUITIES',timestamp:now+1,sequence:9,content:[{key:'SPY',delayed:false}]}
  ]}), {});
  assert.equal(a.state.sequenceObservations, 2);
  assert.equal(a.state.sequenceGaps, 1);
  assert.equal(a.state.continuity, 'FAILED_SEQUENCE_GAP');
});
