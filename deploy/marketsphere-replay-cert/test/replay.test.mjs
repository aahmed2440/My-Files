import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { canonicalJson, fingerprintMarketEvent, normalizeMarketEvent } from '../src/schema.mjs';
import { ReplayHistorian } from '../src/historian.mjs';
import { ReplayCertificationEngine } from '../src/replay_engine.mjs';

async function tempFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-replay-cert-'));
  return path.join(dir, 'events.jsonl');
}

const event = (fields) => ({
  source_classification:'SYNTHETIC_CERT_REPLAY', source:'MARKETSPHERE_REPLAY', provider:'MarketSphere Deterministic Replay',
  asset_class:'EQUITY', instrument_id:'SYNTH:SPY', symbol:'SPY', venue:'SYNTHETIC', event_type:'QUOTE',
  source_ts:'2026-09-09T13:30:00.000Z', receive_ts:'2026-09-09T13:30:00.000Z', sequence:1,
  fields, quality_flags:['SYNTHETIC','NON_LIVE']
});

test('canonical event fingerprint is stable across field key order', () => {
  const a = fingerprintMarketEvent(event({ bid:1, ask:2 }));
  const b = fingerprintMarketEvent(event({ ask:2, bid:1 }));
  assert.equal(a.event_sha256, b.event_sha256);
  assert.equal(canonicalJson(a.event), canonicalJson(b.event));
});

test('non-synthetic source classification is rejected', () => {
  assert.throws(() => normalizeMarketEvent({ ...event({bid:1}), source_classification:'LIVE' }), /REPLAY_SOURCE_CLASSIFICATION_REQUIRED/);
});

test('first certification writes six deterministic events and verifies chain', async () => {
  const filePath = await tempFile();
  const historian = new ReplayHistorian({ filePath });
  const engine = new ReplayCertificationEngine({ historian });
  const cert = await engine.certify();
  assert.equal(cert.status, 'PASS');
  assert.equal(cert.initialized_fixture, true);
  assert.equal(cert.records_verified, 6);
  assert.match(cert.chain_head_sha256, /^[a-f0-9]{64}$/);
  assert.equal(cert.empirical_market_data_claim, false);
  assert.equal(cert.live_market_data_claim, false);
  assert.equal(cert.trading_authority, 'NONE');
});

test('restart certification verifies existing six records without duplication', async () => {
  const filePath = await tempFile();
  const first = new ReplayCertificationEngine({ historian:new ReplayHistorian({ filePath }) });
  const a = await first.certify();
  const second = new ReplayCertificationEngine({ historian:new ReplayHistorian({ filePath }) });
  const b = await second.certify();
  assert.equal(b.status, 'PASS');
  assert.equal(b.initialized_fixture, false);
  assert.equal(b.records_verified, 6);
  assert.equal(b.chain_head_sha256, a.chain_head_sha256);
  const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 6);
});

test('tampering is detected before replay certification can pass', async () => {
  const filePath = await tempFile();
  const engine = new ReplayCertificationEngine({ historian:new ReplayHistorian({ filePath }) });
  await engine.certify();
  const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
  const first = JSON.parse(lines[0]);
  first.event.fields.bid = 999999;
  lines[0] = JSON.stringify(first);
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
  const historian = new ReplayHistorian({ filePath });
  const verification = await historian.verifyFile();
  assert.equal(verification.verified, false);
  assert.equal(verification.reason, 'CHAIN_MISMATCH');
  await assert.rejects(() => new ReplayCertificationEngine({ historian }).certify(), /REPLAY_HISTORIAN_INIT_CHAIN_MISMATCH/);
});

test('replay proof surface contains no brokerage or execution authority', async () => {
  const filePath = await tempFile();
  const engine = new ReplayCertificationEngine({ historian:new ReplayHistorian({ filePath }) });
  const cert = await engine.certify();
  const text = JSON.stringify(cert).toLowerCase();
  assert.equal(text.includes('access_token'), false);
  assert.equal(text.includes('refresh_token'), false);
  assert.equal(text.includes('client_secret'), false);
  assert.equal(cert.production_mutation, false);
  assert.equal(cert.trading_authority, 'NONE');
});
