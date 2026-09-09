import http from 'node:http';
import { ReplayCertificationEngine } from './replay_engine.mjs';

const PORT = Number(process.env.PORT || 3000);
const VERSION = '0.6.0-replay-cert';
const ATTRIBUTION = 'Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale';
const engine = new ReplayCertificationEngine();

function json(res, code, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  res.end(data);
}

const certification = await engine.certify();
console.log(JSON.stringify({
  event: 'replay_certification_pass',
  version: VERSION,
  records_verified: certification.records_verified,
  chain_head_sha256: certification.chain_head_sha256,
  source_classification: certification.source_classification,
  empirical_market_data_claim: false,
  live_market_data_claim: false,
  trading_authority: 'NONE',
  production_mutation: false
}));

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health/live') return json(res, 200, { status:'live', version:VERSION });
  if (url.pathname === '/health/ready') return json(res, certification.status === 'PASS' ? 200 : 503, {
    status: certification.status === 'PASS' ? 'ready' : 'not_ready',
    version: VERSION,
    replay_certification: certification.status,
    records_verified: certification.records_verified,
    source_classification: 'SYNTHETIC_CERT_REPLAY',
    empirical_market_data_claim: false,
    trading_authority: 'NONE'
  });
  if (url.pathname === '/api/v1/replay/status') return json(res, 200, engine.status());
  if (url.pathname === '/api/v1/replay/proof') return json(res, 200, {
    ...engine.status(),
    historian: engine.historian.status(),
    attribution: ATTRIBUTION
  });
  if (url.pathname === '/api/v1/replay/contract') return json(res, 200, {
    version: VERSION,
    purpose: 'Provider-neutral MarketSphere ingestion and persistence certification without live or brokerage-connected data',
    source_classification: 'SYNTHETIC_CERT_REPLAY',
    append_only: true,
    fsync_each_record: true,
    restart_verification_required: true,
    empirical_market_data_claim: false,
    live_market_data_claim: false,
    brokerage_credentials: 'NOT_USED',
    trading_authority: 'NONE',
    production_mutation: false,
    automatic_live_promotion: false,
    attribution: ATTRIBUTION
  });
  return json(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ event:'replay_server_started', port:PORT, version:VERSION, trading_authority:'NONE' }));
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
