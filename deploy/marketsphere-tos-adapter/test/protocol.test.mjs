import test from 'node:test';
import assert from 'node:assert/strict';
import { SchwabTosAdapter, validateStreamerUrl, readJsonBounded } from '../src/adapter.mjs';

test('subscription ack cannot become LIVE and empirical gates remain fail-closed', () => {
  const a = new SchwabTosAdapter();
  const sent = [];
  a.send = (x) => { sent.push(x); return true; };
  a.state.setSocket('CONNECTED');
  const info = {schwabClientCustomerId:'cust',schwabClientCorrelId:'corr',schwabClientChannel:'chan',schwabClientFunctionId:'func'};

  a.onMessage(JSON.stringify({response:[{service:'ADMIN',command:'LOGIN',content:{code:0}}]}), info);
  assert.equal(a.state.auth, 'VERIFIED');
  assert.equal(a.state.subscription, 'SUBS_SENT');
  assert.ok(sent.length >= 1);

  a.onMessage(JSON.stringify({response:[{service:'LEVELONE_EQUITIES',command:'SUBS',content:{code:0}}]}), info);
  assert.equal(a.state.subscription, 'ACK');
  assert.equal(a.state.mode, 'SUBSCRIBED_AWAITING_DATA');
  assert.notEqual(a.state.snapshot().mode, 'LIVE');
  assert.equal(a.state.snapshot().proof_available, false);

  const now = Date.now();
  a.onMessage(JSON.stringify({notify:[{heartbeat:String(now)}],data:[{service:'LEVELONE_EQUITIES',timestamp:now,content:[{key:'SPY',delayed:false,'1':100}]}]}), info);
  assert.equal(a.state.eventsReceived, 1);
  assert.equal(a.state.heartbeats, 1);
  assert.equal(a.state.realtimeStatus, 'REALTIME_OBSERVED');
  assert.equal(a.state.snapshot().mode, 'ENTITLEMENT_PENDING');
  assert.notEqual(a.state.snapshot().mode, 'LIVE');
  assert.equal(a.state.proof().eligible_for_governed_review, false);

  a.state.setEntitlement('VERIFIED');
  assert.equal(a.state.derivedMode(), 'TIMESTAMP_INTEGRITY_PENDING');
  a.state.setTimestampIntegrity('VERIFIED');
  assert.equal(a.state.derivedMode(), 'CONTINUITY_PENDING');
  a.state.setContinuity('VERIFIED', { sequenceGaps: 0 });
  assert.equal(a.state.derivedMode(), 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW');
  assert.equal(a.state.proof().eligible_for_governed_review, true);
  assert.equal(a.state.proof().automatic_live_promotion, false);
});

test('delayed payload cannot satisfy real-time state', () => {
  const a = new SchwabTosAdapter();
  a.state.setAuth('VERIFIED');
  a.state.setSocket('CONNECTED');
  a.state.setSubscription('ACK');
  const now = Date.now();
  a.onMessage(JSON.stringify({notify:[{heartbeat:String(now)}],data:[{service:'LEVELONE_EQUITIES',timestamp:now,content:[{key:'SPY',delayed:true}]}]}), {});
  assert.equal(a.state.realtimeStatus, 'DELAYED_OBSERVED');
  assert.equal(a.state.snapshot().mode, 'DELAYED_DATA');
  assert.equal(a.state.proof().eligible_for_governed_review, false);
});

test('candidate proof is versioned and exposes sanitized timestamps and transport state', () => {
  const a = new SchwabTosAdapter();
  a.state.setAuth('VERIFIED');
  a.state.setSocket('CONNECTED');
  a.state.setSubscription('ACK');
  const now = Date.now();
  a.onMessage(JSON.stringify({notify:[{heartbeat:String(now)}],data:[{service:'LEVELONE_EQUITIES',timestamp:now,content:[{key:'SPY',delayed:false}]}]}), {});
  const proof = a.state.proof();
  assert.equal(proof.candidate_schema_version, 1);
  assert.equal(a.state.snapshot().candidate_schema_version, 1);
  assert.equal(proof.authentication, 'VERIFIED');
  assert.equal(proof.subscription, 'ACK');
  assert.equal(proof.connection, 'CONNECTED');
  assert.equal(proof.timestamp_integrity, 'UNVERIFIED');
  assert.equal(proof.first_data.sourceTimestampMs, now);
  assert.deepEqual(proof.first_data.symbols, ['SPY']);
  assert.equal(typeof proof.last_receive_at, 'string');
  const serialized = JSON.stringify(proof).toLowerCase();
  assert.equal(serialized.includes('access_token'), false);
  assert.equal(serialized.includes('authorization'), false);
});

test('login nack fails closed', () => {
  const a = new SchwabTosAdapter();
  const info = {};
  a.onMessage(JSON.stringify({response:[{service:'ADMIN',command:'LOGIN',content:{code:3}}]}), info);
  assert.equal(a.state.auth, 'LOGIN_REJECTED');
  assert.equal(a.state.lastErrorCode, 'LOGIN_CODE_3');
});

test('streamer URL requires explicit trusted wss host', () => {
  assert.throws(() => validateStreamerUrl('wss://stream.vendor.example/ws', []), /STREAMER_HOST_ALLOWLIST_REQUIRED/);
  assert.throws(() => validateStreamerUrl('ws://stream.vendor.example/ws', ['vendor.example']), /STREAMER_URL_PROTOCOL_REJECTED/);
  assert.throws(() => validateStreamerUrl('wss://user:pass@stream.vendor.example/ws', ['vendor.example']), /STREAMER_URL_CREDENTIALS_REJECTED/);
  assert.throws(() => validateStreamerUrl('wss://stream.vendor.example:8443/ws', ['vendor.example']), /STREAMER_URL_PORT_REJECTED/);
  assert.throws(() => validateStreamerUrl('wss://evil.example/ws', ['vendor.example']), /STREAMER_HOST_REJECTED/);
  assert.throws(() => validateStreamerUrl('wss://notvendor.example/ws', ['vendor.example']), /STREAMER_HOST_REJECTED/);
  const accepted = new URL(validateStreamerUrl('wss://stream.vendor.example/ws', ['vendor.example']));
  assert.equal(accepted.protocol, 'wss:');
  assert.equal(accepted.hostname, 'stream.vendor.example');
});

test('preference response parser enforces byte budget', async () => {
  const body = {streamerInfo:[{streamerSocketUrl:'wss://stream.vendor.example/ws'}]};
  const parsed = await readJsonBounded(new Response(JSON.stringify(body)), 4096);
  assert.equal(parsed.streamerInfo[0].streamerSocketUrl, body.streamerInfo[0].streamerSocketUrl);

  await assert.rejects(() => readJsonBounded(new Response(JSON.stringify({payload:'x'.repeat(4096)})), 1024), /PREFERENCE_RESPONSE_TOO_LARGE/);
  await assert.rejects(() => readJsonBounded(new Response('{not-json}'), 4096), /PREFERENCE_RESPONSE_INVALID_JSON/);
});
