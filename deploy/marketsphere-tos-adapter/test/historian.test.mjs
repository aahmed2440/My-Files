import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { MarketHistorian } from '../src/historian.mjs';

async function tempFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-historian-'));
  return path.join(dir, 'events.jsonl');
}

const sample = (symbol, sequence, ts = Date.now()) => ({
  source: 'SCHWAB_TOS',
  provider: 'Charles Schwab Trader API',
  service: 'LEVELONE_EQUITIES',
  source_timestamp_ms: ts,
  sequence,
  received_at: new Date(ts).toISOString(),
  payload: [{ key: symbol, delayed: false, '1': 100 + sequence }]
});

test('historian is fail-closed and disabled by default when explicitly disabled', async () => {
  const filePath = await tempFile();
  const h = new MarketHistorian({ enabled: false, filePath });
  const result = await h.append(sample('SPY', 1));
  assert.equal(result.persisted, false);
  assert.equal(result.reason, 'HISTORIAN_DISABLED');
  assert.equal(h.status().persistence_mode, 'DISABLED');
  assert.equal(h.status().trading_authority, 'NONE');
  assert.equal(h.status().production_mutation, false);
});

test('append order is serialized and chain verifies', async () => {
  const filePath = await tempFile();
  const h = new MarketHistorian({ enabled: true, filePath });
  const base = Date.now();
  await Promise.all([
    h.append(sample('SPY', 1, base)),
    h.append(sample('QQQ', 2, base + 1)),
    h.append(sample('IWM', 3, base + 2))
  ]);
  await h.flush();
  const verification = await h.verifyFile();
  assert.equal(verification.verified, true);
  assert.equal(verification.records, 3);
  assert.match(verification.chain_head_sha256, /^[a-f0-9]{64}$/);
  assert.equal(h.status().records_written_runtime, 3);
});

test('missing timestamp and sequence remain null rather than becoming zero', async () => {
  const filePath = await tempFile();
  const h = new MarketHistorian({ enabled: true, filePath });
  await h.append({ source: 'SCHWAB_TOS', provider: 'Charles Schwab Trader API', service: 'LEVELONE_EQUITIES', source_timestamp_ms: null, sequence: null, payload: [] });
  await h.flush();
  const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.record.source_timestamp_ms, null);
  assert.equal(entry.record.sequence, null);
});

test('credential-like fields are rejected before persistence', async () => {
  const filePath = await tempFile();
  const h = new MarketHistorian({ enabled: true, filePath });
  await assert.rejects(() => h.append({ ...sample('SPY', 1), payload: [{ key: 'SPY', access_token: 'should-never-persist' }] }), /HISTORIAN_CREDENTIAL_FIELD_REJECTED/);
  assert.equal(h.status().last_error_code, 'HISTORIAN_CREDENTIAL_FIELD_REJECTED');
});

test('tampering is detected by full-chain verification', async () => {
  const filePath = await tempFile();
  const h = new MarketHistorian({ enabled: true, filePath });
  await h.append(sample('SPY', 1));
  await h.append(sample('QQQ', 2));
  await h.flush();

  const lines = (await readFile(filePath, 'utf8')).trim().split('\n');
  const first = JSON.parse(lines[0]);
  first.record.payload[0]['1'] = 999999;
  lines[0] = JSON.stringify(first);
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');

  const verification = await h.verifyFile();
  assert.equal(verification.verified, false);
  assert.equal(verification.reason, 'CHAIN_MISMATCH');
  assert.equal(verification.record_index, 0);
});

test('record byte budget rejects oversized retention payloads', async () => {
  const filePath = await tempFile();
  const h = new MarketHistorian({ enabled: true, filePath, maxRecordBytes: 64 * 1024 });
  await assert.rejects(() => h.append({ ...sample('SPY', 1), payload: [{ key: 'SPY', blob: 'x'.repeat(80 * 1024) }] }), /HISTORIAN_RECORD_TOO_LARGE/);
});
