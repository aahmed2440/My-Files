import crypto from 'node:crypto';

export const MARKET_EVENT_SCHEMA_VERSION = 1;
export const MARKET_EVENT_SOURCE_CLASSIFICATIONS = Object.freeze([
  'SYNTHETIC_CERT_REPLAY',
  'PUBLIC_OFFICIAL',
  'AGENCY_OFFICIAL',
  'EXCHANGE_REFERENCE'
]);

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
  const sourceClassification = safeString(input?.source_classification, 64).toUpperCase();
  if (!MARKET_EVENT_SOURCE_CLASSIFICATIONS.includes(sourceClassification)) {
    throw new Error('MARKET_EVENT_SOURCE_CLASSIFICATION_REJECTED');
  }
  const symbol = safeString(input?.symbol, 64);
  if (!symbol) throw new Error('SYMBOL_REQUIRED');
  const sourceTs = Date.parse(String(input?.source_ts ?? ''));
  const receiveTs = Date.parse(String(input?.receive_ts ?? ''));
  if (!Number.isFinite(sourceTs) || !Number.isFinite(receiveTs)) throw new Error('VALID_TIMESTAMPS_REQUIRED');
  if (receiveTs + 1000 < sourceTs) throw new Error('RECEIVE_TIMESTAMP_PRECEDES_SOURCE');

  return {
    market_event_schema_version: MARKET_EVENT_SCHEMA_VERSION,
    source_classification: sourceClassification,
    source: safeString(input?.source || 'UNSPECIFIED_SOURCE', 64),
    provider: safeString(input?.provider || 'UNSPECIFIED_PROVIDER', 128),
    asset_class: safeString(input?.asset_class || 'UNKNOWN', 32),
    instrument_id: safeString(input?.instrument_id || symbol, 128),
    symbol,
    venue: safeString(input?.venue || 'UNKNOWN', 64),
    event_type: safeString(input?.event_type || 'OBSERVATION', 32),
    source_ts: new Date(sourceTs).toISOString(),
    receive_ts: new Date(receiveTs).toISOString(),
    sequence: nullableSequence(input?.sequence),
    fields: input?.fields && typeof input.fields === 'object' && !Array.isArray(input.fields) ? input.fields : {},
    quality_flags: Array.isArray(input?.quality_flags) ? [...new Set(input.quality_flags.map(x => safeString(x, 64)))].sort() : []
  };
}

export function fingerprintMarketEvent(input) {
  const event = normalizeMarketEvent(input);
  return { event, event_sha256: sha256(canonicalJson(event)) };
}
