import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { MarketHistorian } from '../src/historian.mjs';
import { HistorianSchwabTosAdapter } from '../src/historian_adapter.mjs';

async function tempFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-historian-adapter-'));
  return path.join(dir, 'events.jsonl');
}

test('historian adapter preserves missing source timestamp and sequence as null', async () => {
  const filePath = await tempFile();
  const historian = new MarketHistorian({ enabled: true, filePath });
  const adapter = new HistorianSchwabTosAdapter({ historian });

  adapter.onMessage(JSON.stringify({
    data: [{
      service: 'LEVELONE_EQUITIES',
      content: [{ key: 'SPY', delayed: false, '1': 100 }]
    }]
  }), {});

  await adapter.flushHistorian();
  const line = (await readFile(filePath, 'utf8')).trim();
  const entry = JSON.parse(line);
  assert.equal(entry.record.source_timestamp_ms, null);
  assert.equal(entry.record.sequence, null);
  assert.equal(entry.record.service, 'LEVELONE_EQUITIES');
});
