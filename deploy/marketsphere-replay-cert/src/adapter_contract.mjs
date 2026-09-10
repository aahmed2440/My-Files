import { canonicalJson, sha256 } from './schema.mjs';

export const ADAPTER_CONTRACT_VERSION = 1;
export const ALLOWED_SOURCE_CLASSIFICATIONS = Object.freeze([
  'SYNTHETIC_CERT_REPLAY',
  'PUBLIC_OFFICIAL',
  'AGENCY_OFFICIAL',
  'EXCHANGE_REFERENCE'
]);
export const ALLOWED_TRANSPORTS = Object.freeze(['REPLAY', 'HTTPS_PULL', 'WSS_READ_ONLY']);

const ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const HOST_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SECRETISH = /(token|secret|password|authorization|api[_-]?key|refresh|cookie|session)/i;

function text(value, max = 128) {
  return String(value ?? '').trim().slice(0, max);
}
function uniqueStrings(values, maxItems = 32, maxLength = 128) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(v => text(v, maxLength)).filter(Boolean))].slice(0, maxItems).sort();
}
function fail(code) { const err = new Error(code); err.code = code; throw err; }
function normalizeHost(value) { return text(value, 253).toLowerCase().replace(/^\.+|\.+$/g, ''); }

export function validateEndpoint(endpoint, { transport, allowedHosts } = {}) {
  if (transport === 'REPLAY') {
    if (endpoint !== null && endpoint !== undefined && String(endpoint).trim()) fail('REPLAY_ENDPOINT_PROHIBITED');
    return null;
  }
  let url;
  try { url = new URL(String(endpoint ?? '')); }
  catch { fail('ADAPTER_ENDPOINT_INVALID'); }
  if (url.username || url.password) fail('ADAPTER_ENDPOINT_CREDENTIALS_PROHIBITED');
  if (transport === 'HTTPS_PULL' && url.protocol !== 'https:') fail('ADAPTER_ENDPOINT_HTTPS_REQUIRED');
  if (transport === 'WSS_READ_ONLY' && url.protocol !== 'wss:') fail('ADAPTER_ENDPOINT_WSS_REQUIRED');
  if (url.port && url.port !== '443') fail('ADAPTER_ENDPOINT_PORT_REJECTED');
  for (const [key] of url.searchParams) if (SECRETISH.test(key)) fail('ADAPTER_ENDPOINT_SECRET_QUERY_PROHIBITED');

  const host = normalizeHost(url.hostname);
  const allow = uniqueStrings(allowedHosts, 32, 253).map(normalizeHost);
  if (!allow.length) fail('ADAPTER_HOST_ALLOWLIST_REQUIRED');
  if (!allow.every(h => HOST_RE.test(h))) fail('ADAPTER_HOST_ALLOWLIST_INVALID');
  if (!allow.includes(host)) fail('ADAPTER_HOST_REJECTED');
  return url.toString();
}

export function normalizeAdapterManifest(input) {
  const adapterId = text(input?.adapter_id, 64).toLowerCase();
  if (!ID_RE.test(adapterId)) fail('ADAPTER_ID_INVALID');
  const adapterVersion = text(input?.adapter_version, 32);
  if (!adapterVersion) fail('ADAPTER_VERSION_REQUIRED');
  const sourceClassification = text(input?.source_classification, 64).toUpperCase();
  if (!ALLOWED_SOURCE_CLASSIFICATIONS.includes(sourceClassification)) fail('SOURCE_CLASSIFICATION_REJECTED');
  const transport = text(input?.transport, 32).toUpperCase();
  if (!ALLOWED_TRANSPORTS.includes(transport)) fail('ADAPTER_TRANSPORT_REJECTED');
  const allowedHosts = uniqueStrings(input?.allowed_hosts, 32, 253).map(normalizeHost);
  const endpoint = validateEndpoint(input?.endpoint, { transport, allowedHosts });
  const capabilities = uniqueStrings(input?.capabilities, 32, 64);
  if (!capabilities.length) fail('ADAPTER_CAPABILITIES_REQUIRED');

  if (input?.trading_authority && String(input.trading_authority).toUpperCase() !== 'NONE') fail('ADAPTER_AUTHORITY_ESCALATION_REJECTED');
  if (input?.production_mutation === true) fail('ADAPTER_PRODUCTION_MUTATION_REJECTED');

  return Object.freeze({
    adapter_contract_version: ADAPTER_CONTRACT_VERSION,
    adapter_id: adapterId,
    adapter_version: adapterVersion,
    source_classification: sourceClassification,
    provider_name: text(input?.provider_name, 128) || 'UNSPECIFIED_PROVIDER',
    transport,
    endpoint,
    allowed_hosts: allowedHosts,
    capabilities,
    canonical_market_event_schema_version: 1,
    authority: 'READ_ONLY_EVIDENCE',
    trading_authority: 'NONE',
    production_mutation: false,
    automatic_live_promotion: false,
    credential_material_allowed_in_manifest: false
  });
}

export function fingerprintAdapterManifest(input) {
  const manifest = normalizeAdapterManifest(input);
  return { manifest, adapter_manifest_sha256: sha256(canonicalJson(manifest)) };
}

export class AdapterRegistry {
  constructor() { this.entries = new Map(); }
  register(input) {
    const { manifest, adapter_manifest_sha256 } = fingerprintAdapterManifest(input);
    const prior = this.entries.get(manifest.adapter_id);
    if (prior && prior.adapter_manifest_sha256 !== adapter_manifest_sha256) throw new Error('ADAPTER_ID_CONFLICT');
    this.entries.set(manifest.adapter_id, { manifest, adapter_manifest_sha256 });
    return this.entries.get(manifest.adapter_id);
  }
  get(adapterId) { return this.entries.get(String(adapterId ?? '').toLowerCase()) ?? null; }
  list() {
    return [...this.entries.values()].map(({ manifest, adapter_manifest_sha256 }) => ({
      adapter_id: manifest.adapter_id,
      adapter_version: manifest.adapter_version,
      source_classification: manifest.source_classification,
      transport: manifest.transport,
      capabilities: manifest.capabilities,
      adapter_manifest_sha256,
      authority: manifest.authority,
      trading_authority: 'NONE'
    }));
  }
}
