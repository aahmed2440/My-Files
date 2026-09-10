import http from 'node:http';
import { EmpiricalCertificationEngine } from './empirical_cert_engine.mjs';

const PORT = Number(process.env.PORT || 3000);
const VERSION = '0.8.0-empirical-quorum-cert';
const ATTRIBUTION = 'Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale';
const engine = new EmpiricalCertificationEngine();

function json(res, code, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()'
  });
  res.end(data);
}

let certification;
try {
  certification = await engine.certify();
  console.log(JSON.stringify({
    level:'info',
    event:'empirical_quorum_certification_pass',
    version:VERSION,
    historian_records_verified:certification.historian_records_verified,
    new_observations_appended:certification.new_observations_appended,
    duplicate_observations_not_appended:certification.duplicate_observations_not_appended,
    chain_head_sha256:certification.historian_chain_head_sha256,
    quorum_state:certification.quorum.state,
    common_observation_date:certification.quorum.common_observation_date,
    delta_bps:certification.quorum.delta_bps,
    empirical_source_certified:false,
    authoritative_source_promoted:false,
    trading_authority:'NONE',
    production_mutation:false
  }));
} catch (err) {
  console.error(JSON.stringify({ level:'error', event:'empirical_quorum_certification_failed', version:VERSION, code:String(err?.message || 'EMPIRICAL_CERT_FAILED').slice(0,128) }));
  throw err;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error:'METHOD_NOT_ALLOWED' });
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health/live') return json(res, 200, { status:'live', version:VERSION, trading_authority:'NONE' });
  if (url.pathname === '/health/ready') return json(res, certification?.status === 'PASS_EMPIRICAL_INGESTION' ? 200 : 503, {
    status: certification?.status === 'PASS_EMPIRICAL_INGESTION' ? 'ready' : 'not_ready',
    version:VERSION,
    empirical_ingestion:certification?.status ?? 'NOT_RUN',
    quorum_state:certification?.quorum?.state ?? null,
    common_observation_date:certification?.quorum?.common_observation_date ?? null,
    trading_authority:'NONE'
  });
  if (url.pathname === '/api/v1/empirical/status') return json(res, 200, certification);
  if (url.pathname === '/api/v1/empirical/quorum') return json(res, 200, certification.quorum);
  if (url.pathname === '/api/v1/empirical/contract') return json(res, 200, {
    version:VERSION,
    purpose:'First empirical public-data reality gate for provider-neutral MarketSphere ingestion',
    metric:'UST_10Y_YIELD_PERCENT',
    source_paths:[
      { provider:'Federal Reserve Bank of St. Louis FRED', series:'DGS10', classification:'PUBLIC_OFFICIAL', transport:'HTTPS_PULL' },
      { provider:'U.S. Department of the Treasury', series:'Daily Treasury Par Yield Curve 10-Year', classification:'AGENCY_OFFICIAL', transport:'HTTPS_PULL' }
    ],
    independence_class:'INDEPENDENT_PUBLICATION_PATHS_RELATED_UNDERLYING_RATE_METHODOLOGY',
    quorum_scope:'PUBLICATION_CONSISTENCY_ONLY',
    disagreement_preserved:true,
    date_alignment_required:true,
    semantic_observation_deduplication:true,
    append_only_historian:true,
    empirical_source_certified:false,
    authoritative_source_promoted:false,
    independent_market_measurement_claim:false,
    live_market_data_claim:false,
    brokerage_credentials:'NOT_USED',
    trading_authority:'NONE',
    production_mutation:false,
    automatic_live_promotion:false,
    attribution:ATTRIBUTION
  });
  return json(res, 404, { error:'NOT_FOUND' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ level:'info', event:'empirical_cert_server_started', port:PORT, version:VERSION, trading_authority:'NONE' }));
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
