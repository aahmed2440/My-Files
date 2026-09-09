import test from 'node:test';
import assert from 'node:assert/strict';
import { CredentialGuard } from '../src/credential_guard.mjs';

const now = Date.parse('2026-09-09T23:40:00Z');
const build = (env) => new CredentialGuard({ env });

test('missing token fails closed without exposing a value', () => {
  const g = build({});
  const s = g.status({ nowMs: now });
  assert.equal(s.state, 'MISSING_ACCESS_TOKEN');
  assert.equal(s.access_token_present, false);
  assert.equal(s.access_token_value_exposed, false);
  assert.equal(JSON.stringify(s).includes('SCHWAB_ACCESS_TOKEN'), false);
});

test('token without explicit expiry is unusable', () => {
  const g = build({ SCHWAB_ACCESS_TOKEN: 'TEST_SECRET_VALUE' });
  const s = g.status({ nowMs: now });
  assert.equal(s.state, 'TOKEN_EXPIRY_UNVERIFIED');
  assert.throws(() => g.requireAccessToken({ nowMs: now }), /TOKEN_EXPIRY_UNVERIFIED/);
  assert.equal(JSON.stringify(s).includes('TEST_SECRET_VALUE'), false);
});

test('invalid expiry fails closed', () => {
  const g = build({ SCHWAB_ACCESS_TOKEN: 'TEST_SECRET_VALUE', SCHWAB_ACCESS_TOKEN_EXPIRES_AT: 'not-a-date' });
  assert.equal(g.status({ nowMs: now }).state, 'TOKEN_EXPIRY_INVALID');
});

test('token inside safety margin is rejected before actual expiry', () => {
  const g = build({
    SCHWAB_ACCESS_TOKEN: 'TEST_SECRET_VALUE',
    SCHWAB_ACCESS_TOKEN_EXPIRES_AT: new Date(now + 60000).toISOString(),
    SCHWAB_TOKEN_EXPIRY_SAFETY_MARGIN_MS: '120000'
  });
  assert.equal(g.status({ nowMs: now }).state, 'TOKEN_EXPIRING');
  assert.throws(() => g.requireAccessToken({ nowMs: now }), /TOKEN_EXPIRING/);
});

test('expired token is rejected', () => {
  const g = build({ SCHWAB_ACCESS_TOKEN: 'TEST_SECRET_VALUE', SCHWAB_ACCESS_TOKEN_EXPIRES_AT: new Date(now - 1).toISOString() });
  assert.equal(g.status({ nowMs: now }).state, 'TOKEN_EXPIRED');
});

test('valid token can be consumed internally but status remains sanitized', () => {
  const g = build({
    SCHWAB_ACCESS_TOKEN: 'TEST_SECRET_VALUE',
    SCHWAB_ACCESS_TOKEN_EXPIRES_AT: new Date(now + 15 * 60 * 1000).toISOString(),
    SCHWAB_TOKEN_EXPIRY_SAFETY_MARGIN_MS: '120000'
  });
  const s = g.status({ nowMs: now });
  assert.equal(s.state, 'READY');
  assert.equal(s.access_token_present, true);
  assert.equal(s.access_token_value_exposed, false);
  assert.equal(g.requireAccessToken({ nowMs: now }), 'TEST_SECRET_VALUE');
  assert.equal(JSON.stringify(s).includes('TEST_SECRET_VALUE'), false);
  assert.equal(s.persistence, 'PROHIBITED');
  assert.equal(s.logging, 'PROHIBITED');
  assert.equal(s.trading_authority, 'NONE');
  assert.equal(s.production_mutation, false);
});
