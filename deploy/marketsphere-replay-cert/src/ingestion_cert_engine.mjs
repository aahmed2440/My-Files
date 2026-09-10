import { IngestionEngine } from './ingestion_engine.mjs';
import { normalizeAdapterManifest } from './adapter_contract.mjs';

const SYNTHETIC_MANIFEST = Object.freeze({
  adapter_id: 'marketsphere.synthetic.ingestion-cert',
  adapter_version: '0.7.0',
  source_classification: 'SYNTHETIC_CERT_REPLAY',
  provider_name: 'MarketSphere Provider-Neutral Certification Fixture',
  transport: 'REPLAY',
  endpoint: null,
  allowed_hosts: [],
  capabilities: ['EQUITY_QUOTE', 'SEQUENCE_EVIDENCE', 'TIMESTAMP_EVIDENCE'],
  trading_authority: 'NONE',
  production_mutation: false
});

const FIXTURE = Object.freeze([
  { symbol:'SPY', sequence:1, source_ts:'2026-09-09T13:30:00.000Z', fields:{ bid:649.10, ask:649.12, last:649.11 } },
  { symbol:'QQQ', sequence:1, source_ts:'2026-09-09T13:30:00.100Z', fields:{ bid:578.20, ask:578.23, last:578.22 } },
  { symbol:'SPY', sequence:2, source_ts:'2026-09-09T13:30:00.200Z', fields:{ bid:649.11, ask:649.13, last:649.12 } },
  { symbol:'QQQ', sequence:2, source_ts:'2026-09-09T13:30:00.300Z', fields:{ bid:578.21, ask:578.24, last:578.23 } },
  { symbol:'SPY', sequence:3, source_ts:'2026-09-09T13:30:00.400Z', fields:{ bid:649.12, ask:649.14, last:649.13 } },
  { symbol:'QQQ', sequence:3, source_ts:'2026-09-09T13:30:00.500Z', fields:{ bid:578.22, ask:578.25, last:578.24 } }
]);

function event(row) {
  return {
    source_classification: 'SYNTHETIC_CERT_REPLAY',
    source: 'MARKETSPHERE_INGESTION_CERT',
    provider: SYNTHETIC_MANIFEST.provider_name,
    asset_class: 'EQUITY',
    instrument_id: `SYNTH:${row.symbol}`,
    symbol: row.symbol,
    venue: 'SYNTHETIC',
    event_type: 'QUOTE',
    source_ts: row.source_ts,
    receive_ts: row.source_ts,
    sequence: row.sequence,
    fields: row.fields,
    quality_flags: ['DETERMINISTIC_FIXTURE', 'NON_LIVE', 'PROVIDER_NEUTRAL', 'SYNTHETIC']
  };
}

export function validateFutureSourceManifests() {
  const manifests = [
    {
      adapter_id:'example.public.official', adapter_version:'1.0.0', source_classification:'PUBLIC_OFFICIAL',
      provider_name:'Example Public Official Source', transport:'HTTPS_PULL', endpoint:'https://data.example.gov/market/reference',
      allowed_hosts:['data.example.gov'], capabilities:['REFERENCE_DATA'], trading_authority:'NONE', production_mutation:false
    },
    {
      adapter_id:'example.agency.official', adapter_version:'1.0.0', source_classification:'AGENCY_OFFICIAL',
      provider_name:'Example Agency Source', transport:'HTTPS_PULL', endpoint:'https://api.example.gov/series',
      allowed_hosts:['api.example.gov'], capabilities:['ECONOMIC_SERIES'], trading_authority:'NONE', production_mutation:false
    },
    {
      adapter_id:'example.exchange.reference', adapter_version:'1.0.0', source_classification:'EXCHANGE_REFERENCE',
      provider_name:'Example Exchange Reference Source', transport:'WSS_READ_ONLY', endpoint:'wss://stream.example.exchange/reference',
      allowed_hosts:['stream.example.exchange'], capabilities:['REFERENCE_QUOTE'], trading_authority:'NONE', production_mutation:false
    }
  ];
  return manifests.map(normalizeAdapterManifest);
}

export class IngestionCertificationEngine {
  constructor({ engine } = {}) {
    this.engine = engine ?? new IngestionEngine();
    this.lastCertification = null;
  }

  async certify() {
    this.engine.registerAdapter(SYNTHETIC_MANIFEST);
    const futureManifests = validateFutureSourceManifests();
    await this.engine.initialize();
    const before = await this.engine.verify();
    if (!before.verified) throw new Error(`INGESTION_PRECHECK_${before.reason}`);

    let initializedFixture = false;
    if (before.records === 0) {
      for (const row of FIXTURE) await this.engine.ingest(SYNTHETIC_MANIFEST.adapter_id, event(row));
      await this.engine.flush();
      initializedFixture = true;
    }

    const after = await this.engine.verify();
    if (!after.verified) throw new Error(`INGESTION_POSTCHECK_${after.reason}`);
    if (after.records !== FIXTURE.length) throw new Error(`INGESTION_RECORD_COUNT_UNEXPECTED_${after.records}`);

    const continuity = this.engine.continuity.snapshot();
    if (continuity.length !== 2) throw new Error(`INGESTION_STREAM_COUNT_UNEXPECTED_${continuity.length}`);
    for (const stream of continuity) {
      if (stream.sequence_gaps !== 0 || stream.sequence_regressions !== 0 || stream.timestamp_regressions !== 0) {
        throw new Error('INGESTION_CONTINUITY_DEGRADED');
      }
      if (stream.observations !== 3) throw new Error('INGESTION_OBSERVATION_COUNT_UNEXPECTED');
    }

    this.lastCertification = {
      ingestion_cert_schema_version: 1,
      status: 'PASS',
      initialized_fixture: initializedFixture,
      records_verified: after.records,
      stream_count: continuity.length,
      chain_head_sha256: after.chain_head_sha256,
      adapter_manifest_sha256: this.engine.registry.get(SYNTHETIC_MANIFEST.adapter_id).adapter_manifest_sha256,
      future_source_contracts_validated: futureManifests.map(m => ({
        adapter_id: m.adapter_id,
        source_classification: m.source_classification,
        transport: m.transport,
        authority: m.authority
      })),
      continuity_state: continuity,
      empirical_source_certified: false,
      authoritative_source_promoted: false,
      live_market_data_claim: false,
      trading_authority: 'NONE',
      production_mutation: false,
      automatic_live_promotion: false
    };
    return this.lastCertification;
  }

  status() {
    return this.lastCertification ?? {
      ingestion_cert_schema_version: 1,
      status: 'NOT_RUN',
      empirical_source_certified: false,
      authoritative_source_promoted: false,
      live_market_data_claim: false,
      trading_authority: 'NONE',
      production_mutation: false,
      automatic_live_promotion: false
    };
  }
}
