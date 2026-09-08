import test from 'node:test';
import assert from 'node:assert/strict';
import { SchwabTosAdapter } from '../src/adapter.mjs';

test('login ack triggers subscription and data produces live proof', () => {
  const a = new SchwabTosAdapter();
  const sent = [];
  a.send = (x) => { sent.push(x); return true; };
  const info = {schwabClientCustomerId:'cust',schwabClientCorrelId:'corr',schwabClientChannel:'chan',schwabClientFunctionId:'func'};
  a.onMessage(JSON.stringify({response:[{service:'ADMIN',command:'LOGIN',content:{code:0}}]}), info);
  assert.equal(a.state.auth, 'VERIFIED');
  assert.equal(a.state.subscription, 'SUBS_SENT');
  assert.ok(sent.length >= 1);
  a.onMessage(JSON.stringify({response:[{service:'LEVELONE_EQUITIES',command:'SUBS',content:{code:0}}]}), info);
  assert.equal(a.state.subscription, 'ACK');
  assert.equal(a.state.mode, 'LIVE');
  a.onMessage(JSON.stringify({notify:[{heartbeat:String(Date.now())}],data:[{service:'LEVELONE_EQUITIES',timestamp:Date.now(),content:[{key:'SPY','1':100}]}]}), info);
  assert.equal(a.state.eventsReceived, 1);
  assert.equal(a.state.heartbeats, 1);
  assert.equal(a.state.proof().symbols_observed[0], 'SPY');
});

test('login nack fails closed', () => {
  const a = new SchwabTosAdapter();
  const info = {};
  a.onMessage(JSON.stringify({response:[{service:'ADMIN',command:'LOGIN',content:{code:3}}]}), info);
  assert.equal(a.state.auth, 'LOGIN_REJECTED');
  assert.equal(a.state.lastErrorCode, 'LOGIN_CODE_3');
});
