import http from 'node:http';
import { IngestionCertificationEngine } from './ingestion_cert_engine.mjs';
import { ADAPTER_CONTRACT_VERSION, ALLOWED_SOURCE_CLASSIFICATIONS, ALLOWED_TRANSPORTS } from './adapter_contract.mjs';

const PORT = Number(process.env.PORT || 3000);
const VERSION = '0.7.0-ingestion-contract-cert';
const ATTRIBUTION = 'Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale';
const certEngine = new IngestionCertificationEngine();
const certification = await certEngine.certify();

console.log(JSON.stringify({
  event: 'ingestion_contract_certification_pass',
  version: VERSION,
  records_verified: certification.records_verified,
  stream_count: certification.stream_count,
  chain_head_sha256: certification.chain_head_sha256,
  empirical_source_certified: false,
  authoritative_source_promoted: false,
  live_market_data_claim: false,
  trading_authority: 'NONE',
  production_mutation: false
}));

function json(res, code, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health/live') return json(res, 200, { status:'live', version:VERSION });
  if (url.pathname === '/health/ready') return json(res, certification.status === 'PASS' ? 200 : 503, {
    status: certification.status === 'PASS' ? 'ready' : 'not_ready',
    version: VERSION,
    ingestion_contract_certification: certification.status,
    records_verified: certification.records_verified,
    stream_count: certification.stream_count,
    empirical_source_certified: false,
    trading_authority: 'NONE'
  });
  if (url.pathname === '/api/v1/ingestion/status') return json(res, 200, certEngine.engine.status());
  if (url.pathname === '/api/v1/ingestion/proof') return json(res, 200, { ...certification, historian: certEngine.engine.historian.status(), attribution: ATTRIBUTION });
  if (url.pathname === '/api/v1/ingestion/adapters') return json(res, 200, {
    adapter_contract_version: ADAPTER_CONTRACT_VERSION,
    registered: certEngine.engine.registry.list(),
    allowed_source_classifications: ALLOWED_SOURCE_CLASSIFICATIONS,
    allowed_transports: ALLOWED_TRANSPORTS,
    trading_authority: 'NONE'
  });
  if (url.pathname === '/api/v1/ingestion/contract') return json(res, 200, {
    version: VERSION,
    architecture: 'SOURCE_ADAPTER -> CANONICAL_EVENT -> CONTINUITY -> EVIDENCE_PASSPORT -> APPEND_ONLY_HISTORIAN -> READ_ONLY_INTELLIGENCE',
    adapter_contract_version: ADAPTER_CONTRACT_VERSION,
    allowed_source_classifications: ALLOWED_SOURCE_CLASSIFICATIONS,
    allowed_transports: ALLOWED_TRANSPORTS,
    endpoint_host_allowlist_required_for_network_transports: true,
    credential_material_in_manifest: 'PROHIBITED',
    arbitrary_plugin_execution: 'NOT_PERMITTED_BY_CONTRACT',
    append_only: true,
    fsync_each_record: true,
    restart_state_rehydration_required: true,
    sequence_absence_means_verified_continuity: false,
    empirical_source_certified: false,
    authoritative_source_promoted: false,
    live_market_data_claim: false,
    trading_authority: 'NONE',
    production_mutation: false,
    automatic_live_promotion: false,
    attribution: ATTRIBUTION
  });
  return json(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ event:'ingestion_cert_server_started', port:PORT, version:VERSION, trading_authority:'NONE' }));
});

const shutdown = async () => {
  try { await certEngine.engine.flush(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
