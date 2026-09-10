import { canonicalJson, sha256 } from './schema.mjs';
import { IngestionEngine } from './ingestion_engine.mjs';
import { IngestionHistorian } from './ingestion_historian.mjs';
import { fetchFredDgs10, fetchTreasury10y, FRED_DGS10_MANIFEST, TREASURY_10Y_MANIFEST } from './public_yield_sources.mjs';
import { evaluateYieldQuorum } from './quorum_engine.mjs';

function semanticObservationIdentity(event) {
  const value = Number(event?.fields?.yield_percent);
  const date = String(event?.fields?.observation_date ?? '');
  if (!Number.isFinite(value) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('EMPIRICAL_OBSERVATION_IDENTITY_INPUT_INVALID');
  return sha256(canonicalJson({
    source_classification: event.source_classification,
    source: event.source,
    provider: event.provider,
    instrument_id: event.instrument_id,
    event_type: event.event_type,
    observation_date: date,
    value_percent: value
  }));
}

function withIdentity(result) {
  const identity = semanticObservationIdentity(result.event);
  return {
    ...result,
    event: {
      ...result.event,
      fields: { ...result.event.fields, observation_identity_sha256: identity }
    },
    observation_identity_sha256: identity
  };
}

export class EmpiricalCertificationEngine {
  constructor({ historian, fredFetcher = fetchFredDgs10, treasuryFetcher = fetchTreasury10y, toleranceBps = 2 } = {}) {
    this.historian = historian ?? new IngestionHistorian({
      filePath: process.env.MARKETSPHERE_EMPIRICAL_HISTORIAN_PATH ?? '/data/marketsphere-empirical/events.jsonl'
    });
    this.ingestion = new IngestionEngine({ historian: this.historian });
    this.ingestion.registerAdapter(FRED_DGS10_MANIFEST);
    this.ingestion.registerAdapter(TREASURY_10Y_MANIFEST);
    this.fredFetcher = fredFetcher;
    this.treasuryFetcher = treasuryFetcher;
    this.toleranceBps = toleranceBps;
    this.lastCertification = null;
  }

  async #persistIfNovel(sourceResult) {
    const identified = withIdentity(sourceResult);
    const verification = await this.historian.verifyFile();
    if (!verification.verified) throw new Error(`EMPIRICAL_PRECHECK_${verification.reason}`);
    const prior = verification.observation_identities?.[identified.observation_identity_sha256] ?? null;
    if (prior) {
      return {
        status: 'DUPLICATE_OBSERVATION_NOT_APPENDED',
        observation_identity_sha256: identified.observation_identity_sha256,
        prior,
        source: identified
      };
    }
    const persisted = await this.ingestion.ingest(identified.manifest.adapter_id, identified.event);
    return {
      status: 'NEW_OBSERVATION_APPENDED',
      observation_identity_sha256: identified.observation_identity_sha256,
      persisted,
      source: identified
    };
  }

  async certify() {
    await this.ingestion.initialize();
    const [fredRaw, treasuryRaw] = await Promise.all([this.fredFetcher(), this.treasuryFetcher()]);
    const fred = withIdentity(fredRaw);
    const treasury = withIdentity(treasuryRaw);
    const quorum = evaluateYieldQuorum({ fred, treasury, toleranceBps: this.toleranceBps });

    const fredPersistence = await this.#persistIfNovel(fred);
    const treasuryPersistence = await this.#persistIfNovel(treasury);
    await this.ingestion.flush();
    const verification = await this.historian.verifyFile();
    if (!verification.verified) throw new Error(`EMPIRICAL_POSTCHECK_${verification.reason}`);

    const appended = [fredPersistence, treasuryPersistence].filter(x => x.status === 'NEW_OBSERVATION_APPENDED').length;
    const duplicates = 2 - appended;
    this.lastCertification = {
      empirical_cert_schema_version: 1,
      status: 'PASS_EMPIRICAL_INGESTION',
      metric: 'UST_10Y_YIELD_PERCENT',
      sources_fetched: 2,
      new_observations_appended: appended,
      duplicate_observations_not_appended: duplicates,
      historian_records_verified: verification.records,
      historian_chain_head_sha256: verification.chain_head_sha256,
      observations: {
        fred_dgs10: {
          date: fred.observation.date,
          value_percent: fred.observation.value,
          source_body_sha256: fred.fetch_meta.body_sha256,
          observation_identity_sha256: fred.observation_identity_sha256,
          persistence_status: fredPersistence.status
        },
        treasury_10y: {
          date: treasury.observation.date,
          value_percent: treasury.observation.value,
          source_body_sha256: treasury.fetch_meta.body_sha256,
          observation_identity_sha256: treasury.observation_identity_sha256,
          persistence_status: treasuryPersistence.status
        }
      },
      quorum,
      empirical_observation_ingested: true,
      empirical_source_certified: false,
      authoritative_source_promoted: false,
      independent_market_measurement_claim: false,
      live_market_data_claim: false,
      trading_authority: 'NONE',
      production_mutation: false,
      automatic_live_promotion: false
    };
    return this.lastCertification;
  }

  status() {
    return this.lastCertification ?? {
      empirical_cert_schema_version: 1,
      status: 'NOT_RUN',
      empirical_source_certified: false,
      authoritative_source_promoted: false,
      independent_market_measurement_claim: false,
      live_market_data_claim: false,
      trading_authority: 'NONE',
      production_mutation: false,
      automatic_live_promotion: false
    };
  }
}
