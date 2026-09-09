import crypto from 'node:crypto';

export const MARKET_EVENT_SCHEMA_VERSION = 1;

export function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeString(value, max = 128) {
  return String(value ?? '').slice(0, max);
}

function nullableSequence(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function normalizeMarketEvent(input) {
  if (input?.source_classification !== 'SYNTHETIC_CERT_REPLAY') {
    throw new Error('REPLAY_SOURCE_CLASSIFICATION_REQUIRED');
  }
  const symbol = safeString(input?.symbol, 64);
  if (!symbol) throw new Error('SYMBOL_REQUIRED');
  const sourceTs = Date.parse(String(input?.source_ts ?? ''));
  const receiveTs = Date.parse(String(input?.receive_ts ?? ''));
  if (!Number.isFinite(sourceTs) || !Number.isFinite(receiveTs)) throw new Error('VALID_TIMESTAMPS_REQUIRED');

  return {
    market_event_schema_version: MARKET_EVENT_SCHEMA_VERSION,
    source_classification: 'SYNTHETIC_CERT_REPLAY',
    source: safeString(input?.source || 'MARKETSPHERE_REPLAY', 64),
    provider: safeString(input?.provider || 'MarketSphere Deterministic Replay', 128),
    asset_class: safeString(input?.asset_class || 'EQUITY', 32),
    instrument_id: safeString(input?.instrument_id || symbol, 128),
    symbol,
    venue: safeString(input?.venue || 'SYNTHETIC', 64),
    event_type: safeString(input?.event_type || 'QUOTE', 32),
    source_ts: new Date(sourceTs).toISOString(),
    receive_ts: new Date(receiveTs).toISOString(),
    sequence: nullableSequence(input?.sequence),
    fields: input?.fields && typeof input.fields === 'object' && !Array.isArray(input.fields) ? input.fields : {},
    quality_flags: Array.isArray(input?.quality_flags) ? [...new Set(input.quality_flags.map(x => safeString(x, 64)))].sort() : ['SYNTHETIC']
  };
}

export function fingerprintMarketEvent(input) {
  const event = normalizeMarketEvent(input);
  return { event, event_sha256: sha256(canonicalJson(event)) };
}
