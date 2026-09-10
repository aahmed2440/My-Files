import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { IngestionHistorian } from '../src/ingestion_historian.mjs';
import { EmpiricalCertificationEngine } from '../src/empirical_cert_engine.mjs';
import { FRED_DGS10_MANIFEST, TREASURY_10Y_MANIFEST, parseFredDgs10Csv, parseTreasury10yXml } from '../src/public_yield_sources.mjs';
import { evaluateYieldQuorum } from '../src/quorum_engine.mjs';

async function tempHistory() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-empirical-'));
  return path.join(dir, 'events.jsonl');
}

function sourceResult({ manifest, source, venue, date='2026-09-08', value=4.67, fetchedAt='2026-09-09T22:00:00.000Z', body='a'.repeat(64) }) {
  return {
    manifest,
    observation: { date, value },
    fetch_meta: {
      fetched_at: fetchedAt,
      body_sha256: body,
      byte_length: 1234,
      final_url: manifest.endpoint,
      content_type: 'fixture/test'
    },
    event: {
      source_classification: manifest.source_classification,
      source,
      provider: manifest.provider_name,
      asset_class: 'RATES',
      instrument_id: 'UST:CMT:10Y',
      symbol: 'UST10Y',
      venue,
      event_type: 'DAILY_YIELD_OBSERVATION',
      source_ts: `${date}T00:00:00.000Z`,
      receive_ts: fetchedAt,
      sequence: null,
      fields: {
        tenor_years: 10,
        yield_percent: value,
        observation_date: date,
        publication_path: manifest.endpoint,
        source_body_sha256: body,
        source_body_bytes: 1234
      },
      quality_flags: ['EMPIRICAL','PUBLIC','READ_ONLY','DAILY_OBSERVATION','NOT_INTRADAY','NOT_AUTHORITATIVE_PROMOTION']
    }
  };
}

const fred = overrides => sourceResult({ manifest:FRED_DGS10_MANIFEST, source:'FRED_DGS10', venue:'FEDERAL_RESERVE_PUBLICATION', ...overrides });
const treasury = overrides => sourceResult({ manifest:TREASURY_10Y_MANIFEST, source:'US_TREASURY_DAILY_PAR_YIELD', venue:'US_TREASURY_PUBLICATION', ...overrides });

test('FRED DGS10 CSV parser selects latest valid daily observation', () => {
  const parsed = parseFredDgs10Csv('observation_date,DGS10\n2026-09-04,4.71\n2026-09-07,.\n2026-09-08,4.67\n');
  assert.deepEqual(parsed, { date:'2026-09-08', value:4.67 });
});

test('Treasury XML parser selects latest BC_10YEAR observation', () => {
  const xml = `<?xml version="1.0"?><feed>
    <entry><content><m:properties><d:NEW_DATE>2026-09-04T00:00:00</d:NEW_DATE><d:BC_10YEAR>4.71</d:BC_10YEAR></m:properties></content></entry>
    <entry><content><m:properties><d:NEW_DATE>2026-09-08T00:00:00</d:NEW_DATE><d:BC_10YEAR>4.67</d:BC_10YEAR></m:properties></content></entry>
  </feed>`;
  assert.deepEqual(parseTreasury10yXml(xml), { date:'2026-09-08', value:4.67 });
});

test('quorum reports exact publication agreement without independent-market claim', () => {
  const q = evaluateYieldQuorum({ fred:fred({}), treasury:treasury({}), evaluatedAt:'2026-09-09T22:00:00.000Z' });
  assert.equal(q.state, 'PUBLICATION_AGREEMENT_EXACT');
  assert.equal(q.delta_bps, 0);
  assert.equal(q.quorum_scope, 'PUBLICATION_CONSISTENCY_ONLY');
  assert.equal(q.independent_market_measurement_claim, false);
  assert.equal(q.authoritative_source_promoted, false);
});

test('quorum preserves divergence rather than forcing consensus', () => {
  const q = evaluateYieldQuorum({ fred:fred({ value:4.67 }), treasury:treasury({ value:4.72 }), toleranceBps:2, evaluatedAt:'2026-09-09T22:00:00.000Z' });
  assert.equal(q.state, 'PUBLICATION_DIVERGENCE');
  assert.equal(q.delta_bps, 5);
  assert.equal(q.authoritative_source_promoted, false);
});

test('quorum refuses to compare different observation dates', () => {
  const q = evaluateYieldQuorum({ fred:fred({ date:'2026-09-08' }), treasury:treasury({ date:'2026-09-09' }), evaluatedAt:'2026-09-09T22:00:00.000Z' });
  assert.equal(q.state, 'NO_COMMON_OBSERVATION');
  assert.equal(q.delta_bps, null);
  assert.equal(q.common_observation_date, null);
});

test('empirical certification appends two new facts then deduplicates them after restart', async () => {
  const filePath = await tempHistory();
  const first = new EmpiricalCertificationEngine({
    historian:new IngestionHistorian({ filePath }),
    fredFetcher:async () => fred({ fetchedAt:'2026-09-09T22:00:00.000Z', body:'a'.repeat(64) }),
    treasuryFetcher:async () => treasury({ fetchedAt:'2026-09-09T22:00:01.000Z', body:'b'.repeat(64) })
  });
  const a = await first.certify();
  assert.equal(a.status, 'PASS_EMPIRICAL_INGESTION');
  assert.equal(a.new_observations_appended, 2);
  assert.equal(a.duplicate_observations_not_appended, 0);
  assert.equal(a.historian_records_verified, 2);
  assert.equal(a.quorum.state, 'PUBLICATION_AGREEMENT_EXACT');

  const second = new EmpiricalCertificationEngine({
    historian:new IngestionHistorian({ filePath }),
    fredFetcher:async () => fred({ fetchedAt:'2026-09-09T23:00:00.000Z', body:'c'.repeat(64) }),
    treasuryFetcher:async () => treasury({ fetchedAt:'2026-09-09T23:00:01.000Z', body:'d'.repeat(64) })
  });
  const b = await second.certify();
  assert.equal(b.new_observations_appended, 0);
  assert.equal(b.duplicate_observations_not_appended, 2);
  assert.equal(b.historian_records_verified, 2);
  assert.equal(b.historian_chain_head_sha256, a.historian_chain_head_sha256);
  assert.equal(b.trading_authority, 'NONE');
  assert.equal(b.authoritative_source_promoted, false);
});
