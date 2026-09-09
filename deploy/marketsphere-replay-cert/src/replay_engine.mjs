import { ReplayHistorian } from './historian.mjs';

const FIXTURE = [
  { symbol:'SPY', sequence:1, source_ts:'2026-09-09T13:30:00.000Z', fields:{ bid:649.10, ask:649.12, last:649.11 } },
  { symbol:'QQQ', sequence:2, source_ts:'2026-09-09T13:30:00.100Z', fields:{ bid:578.20, ask:578.23, last:578.22 } },
  { symbol:'SPY', sequence:3, source_ts:'2026-09-09T13:30:00.200Z', fields:{ bid:649.11, ask:649.13, last:649.12 } },
  { symbol:'QQQ', sequence:4, source_ts:'2026-09-09T13:30:00.300Z', fields:{ bid:578.21, ask:578.24, last:578.23 } },
  { symbol:'SPY', sequence:5, source_ts:'2026-09-09T13:30:00.400Z', fields:{ bid:649.12, ask:649.14, last:649.13 } },
  { symbol:'QQQ', sequence:6, source_ts:'2026-09-09T13:30:00.500Z', fields:{ bid:578.22, ask:578.25, last:578.24 } }
];

function asEvent(row) {
  return {
    source_classification: 'SYNTHETIC_CERT_REPLAY',
    source: 'MARKETSPHERE_REPLAY',
    provider: 'MarketSphere Deterministic Replay',
    asset_class: 'EQUITY',
    instrument_id: `SYNTH:${row.symbol}`,
    symbol: row.symbol,
    venue: 'SYNTHETIC',
    event_type: 'QUOTE',
    source_ts: row.source_ts,
    receive_ts: row.source_ts,
    sequence: row.sequence,
    fields: row.fields,
    quality_flags: ['DETERMINISTIC_FIXTURE','NON_LIVE','SYNTHETIC']
  };
}

export class ReplayCertificationEngine {
  constructor({ historian } = {}) {
    this.historian = historian ?? new ReplayHistorian();
    this.lastCertification = null;
  }

  async certify() {
    await this.historian.initialize();
    const before = await this.historian.verifyFile();
    if (!before.verified) throw new Error(`REPLAY_PRECHECK_${before.reason}`);
    let initializedFixture = false;
    if (before.records === 0) {
      for (const row of FIXTURE) await this.historian.append(asEvent(row));
      await this.historian.flush();
      initializedFixture = true;
    }
    const after = await this.historian.verifyFile();
    if (!after.verified) throw new Error(`REPLAY_POSTCHECK_${after.reason}`);
    if (after.records !== FIXTURE.length) throw new Error(`REPLAY_RECORD_COUNT_UNEXPECTED_${after.records}`);
    this.lastCertification = {
      replay_cert_schema_version: 1,
      status: 'PASS',
      source_classification: 'SYNTHETIC_CERT_REPLAY',
      initialized_fixture: initializedFixture,
      records_verified: after.records,
      chain_head_sha256: after.chain_head_sha256,
      deterministic_fixture_size: FIXTURE.length,
      empirical_market_data_claim: false,
      live_market_data_claim: false,
      trading_authority: 'NONE',
      production_mutation: false
    };
    return this.lastCertification;
  }

  status() {
    return this.lastCertification ?? {
      replay_cert_schema_version: 1,
      status: 'NOT_RUN',
      source_classification: 'SYNTHETIC_CERT_REPLAY',
      empirical_market_data_claim: false,
      live_market_data_claim: false,
      trading_authority: 'NONE',
      production_mutation: false
    };
  }
}
