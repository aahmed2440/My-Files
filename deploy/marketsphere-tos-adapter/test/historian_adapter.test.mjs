import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { MarketHistorian } from '../src/historian.mjs';
import { HistorianSchwabTosAdapter } from '../src/historian_adapter.mjs';
import { CredentialGuard } from '../src/credential_guard.mjs';

async function tempFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-historian-adapter-'));
  return path.join(dir, 'events.jsonl');
}

const guard = (expiresAt) => new CredentialGuard({ env: {
  SCHWAB_ACCESS_TOKEN: 'TEST_ONLY_NOT_A_REAL_TOKEN',
  SCHWAB_ACCESS_TOKEN_EXPIRES_AT: expiresAt,
  SCHWAB_TOKEN_EXPIRY_SAFETY_MARGIN_MS: '120000'
} });

test('historian adapter preserves missing source timestamp and sequence as null', async () => {
  const filePath = await tempFile();
  const historian = new MarketHistorian({ enabled: true, filePath });
  const adapter = new HistorianSchwabTosAdapter({ historian, credentialGuard: guard(new Date(Date.now() + 15 * 60 * 1000).toISOString()) });

  const accepted = adapter.onMessage(JSON.stringify({
    data: [{
      service: 'LEVELONE_EQUITIES',
      content: [{ key: 'SPY', delayed: false, '1': 100 }]
    }]
  }), {});

  assert.equal(accepted, true);
  await adapter.flushHistorian();
  const line = (await readFile(filePath, 'utf8')).trim();
  const entry = JSON.parse(line);
  assert.equal(entry.record.source_timestamp_ms, null);
  assert.equal(entry.record.sequence, null);
  assert.equal(entry.record.service, 'LEVELONE_EQUITIES');
});

test('historian refuses persistence when credential lease is expired', async () => {
  const filePath = await tempFile();
  const historian = new MarketHistorian({ enabled: true, filePath });
  const adapter = new HistorianSchwabTosAdapter({ historian, credentialGuard: guard(new Date(Date.now() - 1000).toISOString()) });
  const accepted = adapter.onMessage(JSON.stringify({
    data: [{ service: 'LEVELONE_EQUITIES', timestamp: Date.now(), sequence: 1, content: [{ key: 'SPY', delayed: false }] }]
  }), {});
  assert.equal(accepted, false);
  await adapter.flushHistorian();
  await assert.rejects(() => readFile(filePath, 'utf8'), err => err?.code === 'ENOENT');
  assert.equal(adapter.state.auth, 'TOKEN_EXPIRED');
  assert.equal(adapter.state.mode, 'AUTH_FAILED');
});
