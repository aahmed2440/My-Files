import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8080);
const OWNER_PORT = 3001;
const CORE_PORT = 8001;
const CORE_PYTHON = process.env.CORE_PYTHON || 'python3';
const OWNER_DIR = process.env.CRYPTOSPHERE_OWNER_DIR || '/app/owner';
const CORE_DIR = process.env.CRYPTOSPHERE_CORE_DIR || '/app/core';
const VERSION = 'primetime-hardening-2026.09.10';
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

const children = [];
let shuttingDown = false;

function audit(event, details = {}) {
  console.log(JSON.stringify({
    event,
    product: 'CryptoSphere',
    gateway_version: VERSION,
    production_execution: false,
    production_mutation: false,
    time: new Date().toISOString(),
    ...details
  }));
}

function launch(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.push(child);
  child.on('exit', (code, signal) => {
    audit('child_exit', { command, code, signal });
    if (!shuttingDown) {
      // A partial runtime must never remain advertised as healthy. Exit the
      // gateway so Railway can restart the whole unit atomically.
      process.exit(code && code !== 0 ? code : 1);
    }
  });
  return child;
}

launch('node', ['server.mjs'], {
  cwd: OWNER_DIR,
  env: { ...process.env, PORT: String(OWNER_PORT) }
});
launch(CORE_PYTHON, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', String(CORE_PORT)], {
  cwd: CORE_DIR,
  env: { ...process.env, CRYPTOSPHERE_CORE_MODE: 'ADVISORY_ONLY' }
});

function requestJson(port, path, timeout = 1800) {
  return new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', timeout }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({
            ok: res.statusCode === 200,
            statusCode: res.statusCode,
            json: JSON.parse(Buffer.concat(chunks).toString('utf8'))
          });
        } catch {
          resolve({ ok: false, statusCode: res.statusCode });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ ok: false, statusCode: 0 }));
    req.end();
  });
}

function gatewayHeaders(res, requestId) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store');
  if (requestId) res.setHeader('X-Request-Id', requestId);
}

function json(res, statusCode, body, requestId) {
  res.statusCode = statusCode;
  gatewayHeaders(res, requestId);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function safeRequestId(req) {
  const candidate = req.headers['x-request-id'];
  if (typeof candidate === 'string' && /^[A-Za-z0-9._:-]{1,96}$/.test(candidate)) return candidate;
  return randomUUID();
}

function isReadOnly(req) {
  return READ_ONLY_METHODS.has((req.method || 'GET').toUpperCase());
}

function sanitizedProxyHeaders(req, targetPort, requestId) {
  const headers = { ...req.headers };
  for (const name of HOP_BY_HOP) delete headers[name];

  // Never allow an external caller to spoof proxy-chain identity metadata.
  delete headers['x-forwarded-for'];
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-port'];
  delete headers['x-forwarded-proto'];
  delete headers['forwarded'];
  delete headers['content-length'];

  headers.host = `127.0.0.1:${targetPort}`;
  headers['x-request-id'] = requestId;
  headers['x-cryptosphere-governance-mode'] = 'ADVISORY_ONLY';
  return headers;
}

async function health(res, requestId) {
  const [owner, core] = await Promise.all([
    requestJson(OWNER_PORT, '/api/health'),
    requestJson(CORE_PORT, '/health/ready')
  ]);
  const ready = owner.ok && core.ok && core.json?.status === 'ready';
  json(res, ready ? 200 : 503, {
    status: ready ? 'ready' : 'not_ready',
    product: 'CryptoSphere',
    gateway: { version: VERSION, mode: 'READ_ONLY_ADVISORY' },
    owner_console: { version: '1.4.1', ready: owner.ok },
    analytical_core: { version: '0.90.1', ready: core.ok, mode: 'ADVISORY_ONLY' },
    production_execution: false,
    production_mutation: false,
    arbitrary_scanning: false,
    human_governance_required: true,
    full_runtime_certified: false
  }, requestId);
}

function proxy(req, res, targetPort, targetPath, requestId) {
  const headers = sanitizedProxyHeaders(req, targetPort, requestId);
  const started = Date.now();

  const p = http.request({
    host: '127.0.0.1',
    port: targetPort,
    path: targetPath,
    method: req.method,
    headers,
    timeout: 5000
  }, upstream => {
    res.statusCode = upstream.statusCode || 502;
    for (const [k, v] of Object.entries(upstream.headers)) {
      if (v !== undefined && !HOP_BY_HOP.has(k.toLowerCase())) res.setHeader(k, v);
    }
    gatewayHeaders(res, requestId);
    res.on('finish', () => audit('request_complete', {
      request_id: requestId,
      method: req.method,
      path: new URL(req.url || '/', 'http://gateway.local').pathname,
      status: res.statusCode,
      duration_ms: Date.now() - started
    }));
    upstream.pipe(res);
  });

  p.on('timeout', () => p.destroy(new Error('upstream_timeout')));
  p.on('error', error => {
    audit('upstream_error', {
      request_id: requestId,
      target_port: targetPort,
      error: error?.message || 'unknown'
    });
    if (res.headersSent) {
      res.destroy();
      return;
    }
    json(res, 502, { status: 'UPSTREAM_UNAVAILABLE', request_id: requestId }, requestId);
  });
  req.pipe(p);
}

const server = http.createServer(async (req, res) => {
  const requestId = safeRequestId(req);
  const u = new URL(req.url || '/', 'http://gateway.local');

  if (u.pathname === '/health' || u.pathname === '/api/health') return health(res, requestId);
  if (u.pathname === '/health/live') {
    return json(res, 200, {
      status: 'live',
      product: 'CryptoSphere',
      gateway_version: VERSION,
      production_execution: false,
      production_mutation: false
    }, requestId);
  }
  if (u.pathname === '/robots.txt') {
    res.statusCode = 200;
    gatewayHeaders(res, requestId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('User-agent: *\nDisallow: /\n');
  }

  // PRIMETIME risk-off invariant: this gateway remains read-only until a
  // separately reviewed, signed human GO explicitly promotes mutation.
  if (!isReadOnly(req)) {
    audit('mutation_blocked', { request_id: requestId, method: req.method, path: u.pathname });
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return json(res, 405, {
      status: 'METHOD_NOT_ALLOWED',
      governance: 'READ_ONLY_ADVISORY',
      request_id: requestId
    }, requestId);
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    gatewayHeaders(res, requestId);
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.end();
  }

  if (u.pathname === '/core') {
    res.statusCode = 308;
    res.setHeader('Location', '/core/');
    gatewayHeaders(res, requestId);
    return res.end();
  }
  if (u.pathname.startsWith('/core/')) {
    const stripped = u.pathname.slice('/core'.length) || '/';
    return proxy(req, res, CORE_PORT, stripped + u.search, requestId);
  }
  return proxy(req, res, OWNER_PORT, u.pathname + u.search, requestId);
});

server.requestTimeout = 10_000;
server.headersTimeout = 8_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1000;

server.listen(PORT, '0.0.0.0', () => audit('gateway_listening', {
  port: PORT,
  owner_port: OWNER_PORT,
  core_port: CORE_PORT,
  governance_mode: 'READ_ONLY_ADVISORY'
}));

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  audit('gateway_shutdown', { signal });
  server.close(() => process.exit(0));
  for (const c of children) if (!c.killed) c.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
