import { sha256 } from './schema.mjs';
import { validateAdapterManifest } from './adapter_contract.mjs';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;

export const FRED_DGS10_MANIFEST = validateAdapterManifest({
  adapter_contract_version: 1,
  adapter_id: 'public-fred-dgs10',
  adapter_version: '0.8.0',
  provider_name: 'Federal Reserve Bank of St. Louis FRED',
  source_classification: 'PUBLIC_OFFICIAL',
  transport: 'HTTPS_PULL',
  endpoints: ['https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10'],
  host_allowlist: ['fred.stlouisfed.org'],
  output_schema_version: 1,
  authority: 'READ_ONLY_EVIDENCE'
});

export const TREASURY_10Y_MANIFEST = validateAdapterManifest({
  adapter_contract_version: 1,
  adapter_id: 'public-us-treasury-10y',
  adapter_version: '0.8.0',
  provider_name: 'U.S. Department of the Treasury',
  source_classification: 'AGENCY_OFFICIAL',
  transport: 'HTTPS_PULL',
  endpoints: ['https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=YYYY'],
  host_allowlist: ['home.treasury.gov'],
  output_schema_version: 1,
  authority: 'READ_ONLY_EVIDENCE'
});

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchBoundedText(url, allowedHost, { maxBytes = MAX_BODY_BYTES, timeoutMs = TIMEOUT_MS } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('EMPIRICAL_SOURCE_HTTPS_REQUIRED');
  if (parsed.hostname !== allowedHost) throw new Error('EMPIRICAL_SOURCE_HOST_REJECTED');
  if (parsed.username || parsed.password) throw new Error('EMPIRICAL_SOURCE_URL_CREDENTIALS_PROHIBITED');
  for (const key of parsed.searchParams.keys()) {
    if (/token|secret|password|auth|key/i.test(key)) throw new Error('EMPIRICAL_SOURCE_SECRET_QUERY_PROHIBITED');
  }
  const response = await fetch(parsed, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(Math.max(1000, Math.min(20000, Number(timeoutMs) || TIMEOUT_MS))),
    headers: { 'accept': 'text/csv,text/xml,application/xml,text/plain;q=0.9,*/*;q=0.1', 'user-agent': 'MarketSphere-Empirical-Cert/0.8' }
  });
  if (response.status >= 300 && response.status < 400) throw new Error('EMPIRICAL_SOURCE_REDIRECT_REJECTED');
  if (!response.ok) throw new Error(`EMPIRICAL_SOURCE_HTTP_${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('EMPIRICAL_SOURCE_BODY_TOO_LARGE');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error('EMPIRICAL_SOURCE_BODY_TOO_LARGE');
  const text = bytes.toString('utf8');
  return {
    text,
    fetched_at: new Date().toISOString(),
    body_sha256: sha256(bytes),
    byte_length: bytes.length,
    content_type: String(response.headers.get('content-type') ?? '').slice(0, 128),
    final_url: parsed.toString()
  };
}

function utcObservationTimestamp(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? '').trim());
  if (!match) throw new Error('EMPIRICAL_OBSERVATION_DATE_INVALID');
  return `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
}

export function parseFredDgs10Csv(csvText) {
  const lines = String(csvText ?? '').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('FRED_DGS10_CSV_EMPTY');
  const headers = lines[0].split(',').map(x => x.trim().replace(/^"|"$/g, ''));
  const dateIndex = headers.findIndex(x => /^(DATE|observation_date)$/i.test(x));
  const valueIndex = headers.findIndex(x => /^DGS10$/i.test(x));
  if (dateIndex < 0 || valueIndex < 0) throw new Error('FRED_DGS10_CSV_SCHEMA_MISMATCH');
  const observations = [];
  for (const line of lines.slice(1)) {
    const columns = line.split(',').map(x => x.trim().replace(/^"|"$/g, ''));
    const date = columns[dateIndex];
    const value = Number(columns[valueIndex]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value)) observations.push({ date, value });
  }
  if (!observations.length) throw new Error('FRED_DGS10_NO_VALID_OBSERVATIONS');
  observations.sort((a, b) => a.date.localeCompare(b.date));
  return observations.at(-1);
}

export function parseTreasury10yXml(xmlText) {
  const xml = String(xmlText ?? '');
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const observations = [];
  for (const entry of entries) {
    const dateMatch = entry.match(/<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>/i)
      ?? entry.match(/<d:Date[^>]*>([^<]+)<\/d:Date>/i)
      ?? entry.match(/<updated[^>]*>([^<]+)<\/updated>/i);
    const yieldMatch = entry.match(/<d:BC_10YEAR[^>]*>([^<]+)<\/d:BC_10YEAR>/i);
    if (!dateMatch || !yieldMatch) continue;
    const rawDate = decodeXml(dateMatch[1]).trim();
    const parsedDate = new Date(rawDate);
    const value = Number(decodeXml(yieldMatch[1]).trim());
    if (!Number.isFinite(parsedDate.getTime()) || !Number.isFinite(value)) continue;
    observations.push({ date: parsedDate.toISOString().slice(0, 10), value });
  }
  if (!observations.length) throw new Error('TREASURY_10Y_NO_VALID_OBSERVATIONS');
  observations.sort((a, b) => a.date.localeCompare(b.date));
  return observations.at(-1);
}

function asEvent({ manifest, observation, fetchMeta, source, venue }) {
  return {
    source_classification: manifest.source_classification,
    source,
    provider: manifest.provider_name,
    asset_class: 'RATES',
    instrument_id: 'UST:CMT:10Y',
    symbol: 'UST10Y',
    venue,
    event_type: 'DAILY_YIELD_OBSERVATION',
    source_ts: utcObservationTimestamp(observation.date),
    receive_ts: fetchMeta.fetched_at,
    sequence: null,
    fields: {
      tenor_years: 10,
      yield_percent: observation.value,
      observation_date: observation.date,
      publication_path: fetchMeta.final_url,
      source_body_sha256: fetchMeta.body_sha256,
      source_body_bytes: fetchMeta.byte_length
    },
    quality_flags: ['EMPIRICAL','PUBLIC','READ_ONLY','DAILY_OBSERVATION','NOT_INTRADAY','NOT_AUTHORITATIVE_PROMOTION']
  };
}

export async function fetchFredDgs10() {
  const endpoint = FRED_DGS10_MANIFEST.endpoints[0];
  const fetchMeta = await fetchBoundedText(endpoint, 'fred.stlouisfed.org');
  const observation = parseFredDgs10Csv(fetchMeta.text);
  return { manifest: FRED_DGS10_MANIFEST, observation, fetch_meta: fetchMeta, event: asEvent({ manifest:FRED_DGS10_MANIFEST, observation, fetchMeta, source:'FRED_DGS10', venue:'FEDERAL_RESERVE_PUBLICATION' }) };
}

export async function fetchTreasury10y({ year = new Date().getUTCFullYear() } = {}) {
  const safeYear = Number(year);
  if (!Number.isInteger(safeYear) || safeYear < 1990 || safeYear > 2100) throw new Error('TREASURY_YEAR_INVALID');
  const endpoint = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${safeYear}`;
  const fetchMeta = await fetchBoundedText(endpoint, 'home.treasury.gov');
  const observation = parseTreasury10yXml(fetchMeta.text);
  return { manifest: TREASURY_10Y_MANIFEST, observation, fetch_meta: fetchMeta, event: asEvent({ manifest:TREASURY_10Y_MANIFEST, observation, fetchMeta, source:'US_TREASURY_DAILY_PAR_YIELD', venue:'US_TREASURY_PUBLICATION' }) };
}
