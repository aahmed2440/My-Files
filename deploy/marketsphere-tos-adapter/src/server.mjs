import http from 'node:http';
import { HistorianSchwabTosAdapter } from './historian_adapter.mjs';

const PORT = Number(process.env.PORT || 3000);
const VERSION = '0.4.0-historian-cert';
const CANDIDATE_SCHEMA_VERSION = 1;
const adapter = new HistorianSchwabTosAdapter();
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
  historian: {
    opt_in: true,
    append_only: true,
    fsync_each_record: true,
    credential_fields_prohibited: true,
    production_mutation: false
  },
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
  if (url.pathname === '/health/live') {
    return json(res, 200, { status: 'live', component: 'marketsphere-schwab-tos-adapter', version: VERSION, candidate_schema_version: CANDIDATE_SCHEMA_VERSION });
  }
  if (url.pathname === '/health/ready') {
    const feedGate = adapter.state.snapshot({ heartbeatStaleMs, dataStaleMs }).mode;
    const historian = adapter.historian.status();
    return json(res, 200, {
      status: 'ready',
      feed_gate: feedGate,
      candidate_schema_version: CANDIDATE_SCHEMA_VERSION,
      source_certification_eligible: feedGate === 'ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW',
      historian_enabled: historian.enabled,
      historian_durable_path_declared: historian.durable_path_declared,
      automatic_live_promotion: false
    });
  }
  if (url.pathname === '/api/v1/feed/status') return json(res, 200, adapter.state.snapshot({ heartbeatStaleMs, dataStaleMs }));
  if (url.pathname === '/api/v1/feed/proof') return json(res, adapter.state.firstDataProof ? 200 : 425, adapter.state.proof({ heartbeatStaleMs, dataStaleMs }));
  if (url.pathname === '/api/v1/feed/contract') return json(res, 200, SOURCE_CONTRACT);
  if (url.pathname === '/api/v1/historian/status') return json(res, 200, adapter.historian.status());
  return json(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(JSON.stringify({
    event: 'adapter_started',
    port: PORT,
    source: 'SCHWAB_TOS',
    version: VERSION,
    candidate_schema_version: CANDIDATE_SCHEMA_VERSION,
    historian_enabled: adapter.historian.enabled,
    trading_authority: 'NONE',
    automatic_live_promotion: false
  }));
  await adapter.start();
});

const shutdown = async () => {
  adapter.stop();
  try { await adapter.flushHistorian(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
