import { canonicalJson, sha256 } from './schema.mjs';

export const QUORUM_VERSION = 1;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDate(value) {
  const text = String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function ageDays(date, referenceIso) {
  const d = Date.parse(`${date}T00:00:00.000Z`);
  const r = Date.parse(referenceIso);
  if (!Number.isFinite(d) || !Number.isFinite(r)) return null;
  return Math.max(0, Math.floor((r - d) / 86400000));
}

export function evaluateYieldQuorum({ fred, treasury, toleranceBps = 2, evaluatedAt = new Date().toISOString() }) {
  const fredDate = isoDate(fred?.observation?.date);
  const treasuryDate = isoDate(treasury?.observation?.date);
  const fredValue = finite(fred?.observation?.value);
  const treasuryValue = finite(treasury?.observation?.value);
  if (!fredDate || !treasuryDate || fredValue === null || treasuryValue === null) throw new Error('QUORUM_OBSERVATIONS_REQUIRED');

  const commonDate = fredDate === treasuryDate ? fredDate : null;
  const deltaBps = commonDate ? Math.abs(fredValue - treasuryValue) * 100 : null;
  const tolerance = Math.max(0, Math.min(25, Number(toleranceBps) || 2));
  let state = 'NO_COMMON_OBSERVATION';
  if (commonDate && deltaBps === 0) state = 'PUBLICATION_AGREEMENT_EXACT';
  else if (commonDate && deltaBps <= tolerance) state = 'PUBLICATION_AGREEMENT_WITHIN_TOLERANCE';
  else if (commonDate) state = 'PUBLICATION_DIVERGENCE';

  const base = {
    quorum_version: QUORUM_VERSION,
    metric: 'UST_10Y_YIELD_PERCENT',
    state,
    common_observation_date: commonDate,
    tolerance_bps: tolerance,
    delta_bps: deltaBps === null ? null : Number(deltaBps.toFixed(6)),
    observations: {
      fred_dgs10: { date: fredDate, value_percent: fredValue, body_sha256: fred?.fetch_meta?.body_sha256 ?? null },
      treasury_10y: { date: treasuryDate, value_percent: treasuryValue, body_sha256: treasury?.fetch_meta?.body_sha256 ?? null }
    },
    freshness: {
      fred_age_days: ageDays(fredDate, evaluatedAt),
      treasury_age_days: ageDays(treasuryDate, evaluatedAt)
    },
    independence_class: 'INDEPENDENT_PUBLICATION_PATHS_RELATED_UNDERLYING_RATE_METHODOLOGY',
    quorum_scope: 'PUBLICATION_CONSISTENCY_ONLY',
    independent_market_measurement_claim: false,
    empirical_source_certified: false,
    authoritative_source_promoted: false,
    live_market_data_claim: false,
    trading_authority: 'NONE',
    production_mutation: false,
    automatic_live_promotion: false,
    evaluated_at: evaluatedAt
  };
  return { ...base, quorum_sha256: sha256(canonicalJson(base)) };
}
