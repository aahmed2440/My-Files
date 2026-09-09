import http from 'node:http';
import { SchwabTosAdapter } from './adapter.mjs';

const PORT = Number(process.env.PORT || 3000);
const VERSION = '0.2.0-cert';
const CANDIDATE_SCHEMA_VERSION = 1;
const adapter = new SchwabTosAdapter();
const heartbeatStaleMs = Number(process.env.SCHWAB_HEARTBEAT_STALE_MS || 45000);
const dataStaleMs = Number(process.env.SCHWAB_DATA_STALE_MS || 90000);

const SOURCE_CONTRACT = {
  candidate_schema_version: CANDIDATE_SCHEMA_VERSION,
  source: 'SCHWAB_TOS',
  provider: 'Charles Schwab Trader API',
  evidence_classification: 'EMPIRICAL_MARKET_SOURCE_EVIDENCE_CANDIDATE',
  required_for_governed_review: [
    'auth=VERIFIED',
    'subscription=ACK',
    'socket=CONNECTED',
    'first market-data evidence',
    'heartbeat fresh',
    'realtime_status=REALTIME_OBSERVED',
    'entitlement=VERIFIED',
    'timestamp_integrity=VERIFIED',
    'continuity=VERIFIED',
    'sequence_gaps=0 when provider continuity mechanism supports sequence semantics'
  ],
  state_machine: [
    'DISABLED', 'AUTH_REQUIRED', 'AUTH_FAILED', 'AUTHENTICATING', 'CONNECTING', 'SUBSCRIBING',
    'CONNECTED_NOT_SUBSCRIBED', 'SUBSCRIBED_AWAITING_DATA', 'DATA_OBSERVED_AWAITING_HEARTBEAT',
    'REALTIME_STATUS_UNVERIFIED', 'DELAYED_DATA', 'ENTITLEMENT_PENDING', 'TIMESTAMP_INTEGRITY_PENDING',
    'CONTINUITY_PENDING', 'DEGRADED', 'STALE', 'DISCONNECTED',
    'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW'
  ],
  automatic_live_promotion: false,
  trading_authority: 'NONE',
  production_mutation: false
};

const json = (res, code, body) => {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  res.end(data);
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health/live') return json(res, 200, { status: 'live', component: 'marketsphere-schwab-tos-adapter', version: VERSION, candidate_schema_version: CANDIDATE_SCHEMA_VERSION });
  if (url.pathname === '/health/ready') {
    const feedGate = adapter.state.snapshot({ heartbeatStaleMs, dataStaleMs }).mode;
    return json(res, 200, { status: 'ready', feed_gate: feedGate, candidate_schema_version: CANDIDATE_SCHEMA_VERSION, source_certification_eligible: feedGate === 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW', automatic_live_promotion: false });
  }
  if (url.pathname === '/api/v1/feed/status') return json(res, 200, adapter.state.snapshot({ heartbeatStaleMs, dataStaleMs }));
  if (url.pathname === '/api/v1/feed/proof') return json(res, adapter.state.firstDataProof ? 200 : 425, adapter.state.proof({ heartbeatStaleMs, dataStaleMs }));
  if (url.pathname === '/api/v1/feed/contract') return json(res, 200, SOURCE_CONTRACT);
  return json(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(JSON.stringify({ event: 'adapter_started', port: PORT, source: 'SCHWAB_TOS', version: VERSION, candidate_schema_version: CANDIDATE_SCHEMA_VERSION, trading_authority: 'NONE', automatic_live_promotion: false }));
  await adapter.start();
});

const shutdown = () => { adapter.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
