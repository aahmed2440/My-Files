import http from 'node:http';
import { SchwabTosAdapter } from './adapter.mjs';

const PORT = Number(process.env.PORT || 3000);
const adapter = new SchwabTosAdapter();
const heartbeatStaleMs = Number(process.env.SCHWAB_HEARTBEAT_STALE_MS || 45000);
const dataStaleMs = Number(process.env.SCHWAB_DATA_STALE_MS || 90000);

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
  if (url.pathname === '/health/live') return json(res, 200, { status: 'live', component: 'marketsphere-schwab-tos-adapter', version: '0.1.0' });
  if (url.pathname === '/health/ready') return json(res, 200, { status: 'ready', feed_gate: adapter.state.snapshot({ heartbeatStaleMs, dataStaleMs }).mode });
  if (url.pathname === '/api/v1/feed/status') return json(res, 200, adapter.state.snapshot({ heartbeatStaleMs, dataStaleMs }));
  if (url.pathname === '/api/v1/feed/proof') return json(res, adapter.state.firstDataProof ? 200 : 425, adapter.state.proof());
  if (url.pathname === '/api/v1/feed/contract') return json(res, 200, {
    source: 'SCHWAB_TOS',
    required_for_live: ['auth=VERIFIED', 'subscription=ACK', 'socket=CONNECTED', 'heartbeat fresh', 'received data evidence'],
    state_machine: ['DISABLED', 'AUTH_REQUIRED', 'AUTHENTICATING', 'CONNECTING', 'LIVE', 'DEGRADED', 'STALE', 'DISCONNECTED'],
    trading_authority: 'NONE',
    production_mutation: false
  });
  return json(res, 404, { error: 'NOT_FOUND' });
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(JSON.stringify({ event: 'adapter_started', port: PORT, source: 'SCHWAB_TOS', trading_authority: 'NONE' }));
  await adapter.start();
});

const shutdown = () => { adapter.stop(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
