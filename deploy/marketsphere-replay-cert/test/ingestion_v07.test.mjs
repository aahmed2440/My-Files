import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { normalizeAdapterManifest, AdapterRegistry } from '../src/adapter_contract.mjs';
import { IngestionHistorian } from '../src/ingestion_historian.mjs';
import { IngestionEngine } from '../src/ingestion_engine.mjs';
import { IngestionCertificationEngine, validateFutureSourceManifests } from '../src/ingestion_cert_engine.mjs';

async function tempFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-ingestion-v07-'));
  return path.join(dir, 'events.jsonl');
}

function manifest() {
  return {
    adapter_id:'test.synthetic', adapter_version:'0.7.0', source_classification:'SYNTHETIC_CERT_REPLAY',
    provider_name:'Test Provider', transport:'REPLAY', endpoint:null, allowed_hosts:[],
    capabilities:['EQUITY_QUOTE'], trading_authority:'NONE', production_mutation:false
  };
}

function event(sequence, sourceTs = `2026-09-09T13:30:0${sequence}.000Z`) {
  return {
    source_classification:'SYNTHETIC_CERT_REPLAY', source:'TEST', provider:'Test Provider', asset_class:'EQUITY',
    instrument_id:'SYNTH:SPY', symbol:'SPY', venue:'SYNTHETIC', event_type:'QUOTE',
    source_ts:sourceTs, receive_ts:sourceTs, sequence, fields:{bid:100+sequence}, quality_flags:['SYNTHETIC']
  };
}

test('network adapter contract requires exact trusted https/wss host and read-only authority', () => {
  const m = normalizeAdapterManifest({
    adapter_id:'public.example', adapter_version:'1.0.0', source_classification:'PUBLIC_OFFICIAL',
    provider_name:'Public Example', transport:'HTTPS_PULL', endpoint:'https://data.example.gov/reference',
    allowed_hosts:['data.example.gov'], capabilities:['REFERENCE_DATA'], trading_authority:'NONE', production_mutation:false
  });
  assert.equal(m.authority, 'READ_ONLY_EVIDENCE');
  assert.equal(m.trading_authority, 'NONE');
  assert.equal(m.production_mutation, false);
  assert.throws(() => normalizeAdapterManifest({ ...m, adapter_id:'bad.http', endpoint:'http://data.example.gov/reference' }), /ADAPTER_ENDPOINT_HTTPS_REQUIRED/);
  assert.throws(() => normalizeAdapterManifest({ ...m, adapter_id:'bad.host', endpoint:'https://evil.example/reference' }), /ADAPTER_HOST_REJECTED/);
  assert.throws(() => normalizeAdapterManifest({ ...m, adapter_id:'bad.secret', endpoint:'https://data.example.gov/reference?access_token=x' }), /ADAPTER_ENDPOINT_SECRET_QUERY_PROHIBITED/);
  assert.throws(() => normalizeAdapterManifest({ ...m, adapter_id:'bad.auth', trading_authority:'TRADING' }), /ADAPTER_AUTHORITY_ESCALATION_REJECTED/);
});

test('adapter registry rejects conflicting definitions for one adapter id', () => {
  const r = new AdapterRegistry();
  r.register(manifest());
  assert.throws(() => r.register({ ...manifest(), adapter_version:'0.7.1' }), /ADAPTER_ID_CONFLICT/);
});

test('ingestion rejects source and provider mismatches before persistence', async () => {
  const filePath = await tempFile();
  const engine = new IngestionEngine({ historian:new IngestionHistorian({ filePath }) });
  engine.registerAdapter(manifest());
  await assert.rejects(() => engine.ingest('test.synthetic', { ...event(1), provider:'Wrong Provider' }), /ADAPTER_PROVIDER_MISMATCH/);
  await assert.rejects(() => engine.ingest('test.synthetic', { ...event(1), source_classification:'PUBLIC_OFFICIAL' }), /ADAPTER_SOURCE_CLASSIFICATION_MISMATCH/);
  const verified = await engine.verify();
  assert.equal(verified.records, 0);
});

test('missing sequence remains unknown rather than verified continuity', async () => {
  const filePath = await tempFile();
  const engine = new IngestionEngine({ historian:new IngestionHistorian({ filePath }) });
  engine.registerAdapter(manifest());
  const e = { ...event(1), sequence:null };
  const result = await engine.ingest('test.synthetic', e);
  assert.equal(result.continuity.state, 'UNKNOWN_SEQUENCE_NOT_PROVIDED');
  assert.equal(result.continuity.provider_continuity_verified, false);
  assert.equal(result.quality_gate, 'EVIDENCE_OBSERVED_NOT_CERTIFIED');
});

test('sequence gap is persisted as degraded evidence and never promoted', async () => {
  const filePath = await tempFile();
  const engine = new IngestionEngine({ historian:new IngestionHistorian({ filePath }) });
  engine.registerAdapter(manifest());
  await engine.ingest('test.synthetic', event(1));
  const result = await engine.ingest('test.synthetic', event(3));
  assert.equal(result.continuity.state, 'FAILED_SEQUENCE_GAP');
  assert.equal(result.quality_gate, 'DEGRADED_EVIDENCE_ONLY');
  assert.equal(result.empirical_source_certified, false);
  assert.equal(result.authoritative_source_promoted, false);
  const verified = await engine.verify();
  assert.equal(verified.records, 2);
});

test('restart rehydrates sequence counters and passport lineage', async () => {
  const filePath = await tempFile();
  const first = new IngestionEngine({ historian:new IngestionHistorian({ filePath }) });
  first.registerAdapter(manifest());
  await first.ingest('test.synthetic', event(1));
  const secondWrite = await first.ingest('test.synthetic', event(2));
  await first.flush();

  const restarted = new IngestionEngine({ historian:new IngestionHistorian({ filePath }) });
  restarted.registerAdapter(manifest());
  await restarted.initialize();
  const third = await restarted.ingest('test.synthetic', event(3));
  assert.equal(third.prior_passport_sha256, secondWrite.passport_sha256);
  assert.equal(third.continuity.observations, 3);
  assert.equal(third.continuity.sequence_gaps, 0);
  assert.equal(third.continuity.sequence_regressions, 0);
});

test('historian detects passport or event tampering', async () => {
  const filePath = await tempFile();
  const engine = new IngestionEngine({ historian:new IngestionHistorian({ filePath }) });
  engine.registerAdapter(manifest());
  await engine.ingest('test.synthetic', event(1));
  await engine.flush();
  const line = (await readFile(filePath, 'utf8')).trim();
  const entry = JSON.parse(line);
  entry.event.fields.bid = 999999;
  await writeFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  const verify = await new IngestionHistorian({ filePath }).verifyFile();
  assert.equal(verify.verified, false);
});

test('future public agency and exchange manifest shapes validate without claiming source certification', () => {
  const manifests = validateFutureSourceManifests();
  assert.deepEqual(manifests.map(m => m.source_classification), ['PUBLIC_OFFICIAL','AGENCY_OFFICIAL','EXCHANGE_REFERENCE']);
  assert.ok(manifests.every(m => m.authority === 'READ_ONLY_EVIDENCE' && m.trading_authority === 'NONE'));
});

test('provider-neutral certification writes six events and survives restart without duplication', async () => {
  const filePath = await tempFile();
  const first = new IngestionCertificationEngine({ engine:new IngestionEngine({ historian:new IngestionHistorian({ filePath }) }) });
  const a = await first.certify();
  assert.equal(a.status, 'PASS');
  assert.equal(a.records_verified, 6);
  assert.equal(a.stream_count, 2);
  assert.ok(a.continuity_state.every(s => s.observations === 3 && s.sequence_gaps === 0));

  const second = new IngestionCertificationEngine({ engine:new IngestionEngine({ historian:new IngestionHistorian({ filePath }) }) });
  const b = await second.certify();
  assert.equal(b.records_verified, 6);
  assert.equal(b.chain_head_sha256, a.chain_head_sha256);
  assert.equal(b.initialized_fixture, false);
  assert.ok(b.continuity_state.every(s => s.observations === 3 && s.sequence_gaps === 0));
});
