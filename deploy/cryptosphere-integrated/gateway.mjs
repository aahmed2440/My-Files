import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8080);
const OWNER_PORT = Number(process.env.CRYPTOSPHERE_OWNER_PORT || 3001);
const CORE_PORT = Number(process.env.CRYPTOSPHERE_CORE_PORT || 8001);
const CORE_PYTHON = process.env.CORE_PYTHON || 'python3';
const OWNER_DIR = process.env.CRYPTOSPHERE_OWNER_DIR || '/app/owner';
const CORE_DIR = process.env.CRYPTOSPHERE_CORE_DIR || '/app/core';
const CORE_BODY_LIMIT = positiveInt(process.env.CRYPTOSPHERE_CORE_BODY_LIMIT_BYTES, 262144);
const CORE_MAX_CONCURRENCY = positiveInt(process.env.CRYPTOSPHERE_CORE_MAX_CONCURRENCY, 4);
const CORE_RATE_LIMIT_PER_MINUTE = positiveInt(process.env.CRYPTOSPHERE_CORE_RATE_LIMIT_PER_MINUTE, 60);
const CORE_UPSTREAM_TIMEOUT_MS = positiveInt(process.env.CRYPTOSPHERE_CORE_UPSTREAM_TIMEOUT_MS, 15000);
const PRIVILEGED = new Set(['OWNER', 'PRINCIPAL_ADMIN']);
const ALLOWED_CORE_METHODS = new Set(['GET', 'HEAD', 'POST']);

const children = [];
let activeCoreRequests = 0;
const rateBuckets = new Map();

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

function launch(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.push(child);
  child.on('exit', (code, signal) => {
    console.error(JSON.stringify({ event: 'child_exit', command, code, signal }));
    if (!signal && code !== 0) process.exitCode = 1;
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
          resolve({ ok: res.statusCode === 200, statusCode: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
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

function gatewayHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  gatewayHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function constantTimeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length > 0 && aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function coreIdentity(req) {
  const external = process.env.CRYPTOSPHERE_OWNER_AUTH_MODE === 'external';
  if (!external) return { required: false, authenticated: true, principal: null, role: null, assurance: null };
  const expectedKey = process.env.CRYPTOSPHERE_IDENTITY_PROXY_KEY || '';
  const suppliedKey = req.headers['x-cryptosphere-proxy-key'] || '';
  const principal = String(req.headers['x-cryptosphere-principal'] || '').trim();
  const role = String(req.headers['x-cryptosphere-role'] || '').trim().toUpperCase();
  const assurance = String(req.headers['x-cryptosphere-assurance'] || '').trim();
  const authenticated = Boolean(
    expectedKey &&
    constantTimeEqual(expectedKey, suppliedKey) &&
    principal &&
    PRIVILEGED.has(role) &&
    assurance &&
    assurance.toUpperCase() !== 'UNVERIFIED'
  );
  return {
    required: true,
    authenticated,
    principal: authenticated ? principal.slice(0, 160) : null,
    role: authenticated ? role : 'UNVERIFIED',
    assurance: authenticated ? assurance.slice(0, 80) : 'UNVERIFIED'
  };
}

function rateAllowed(key) {
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const bucketKey = `${minute}:${key}`;
  const count = (rateBuckets.get(bucketKey) || 0) + 1;
  rateBuckets.set(bucketKey, count);
  if (rateBuckets.size > 10000) {
    for (const k of rateBuckets.keys()) if (!k.startsWith(`${minute}:`)) rateBuckets.delete(k);
  }
  return count <= CORE_RATE_LIMIT_PER_MINUTE;
}

async function health(res) {
  const [owner, core] = await Promise.all([
    requestJson(OWNER_PORT, '/api/health'),
    requestJson(CORE_PORT, '/health/ready')
  ]);
  const ready = owner.ok && core.ok && core.json?.status === 'ready';
  json(res, ready ? 200 : 503, {
    status: ready ? 'ready' : 'not_ready',
    product: 'CryptoSphere',
    owner_console: { version: '1.4.1', ready: owner.ok },
    analytical_core: { version: '0.90.1', ready: core.ok, mode: 'ADVISORY_ONLY' },
    identity_perimeter: process.env.CRYPTOSPHERE_OWNER_AUTH_MODE === 'external' ? 'TRUSTED_EXTERNAL_REQUIRED' : 'LOCAL_OR_CONTROLLED_ONLY',
    core_guardrails: {
      allowed_methods: [...ALLOWED_CORE_METHODS],
      request_body_limit_bytes: CORE_BODY_LIMIT,
      max_concurrency: CORE_MAX_CONCURRENCY,
      rate_limit_per_minute: CORE_RATE_LIMIT_PER_MINUTE,
      upstream_timeout_ms: CORE_UPSTREAM_TIMEOUT_MS,
      openapi_exposed: false
    },
    production_execution: false,
    human_governance_required: true
  });
}

function collectBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > limit) {
        reject(Object.assign(new Error('body_limit'), { code: 'BODY_LIMIT' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', err => reject(err));
  });
}

function proxyBuffered(req, res, targetPort, targetPath, body = null, stripProxySecret = false) {
  return new Promise(resolve => {
    const headers = { ...req.headers, host: `127.0.0.1:${targetPort}` };
    delete headers.connection;
    delete headers['transfer-encoding'];
    if (stripProxySecret) delete headers['x-cryptosphere-proxy-key'];
    if (body !== null) headers['content-length'] = String(body.length);

    const p = http.request({
      host: '127.0.0.1',
      port: targetPort,
      path: targetPath,
      method: req.method,
      headers,
      timeout: CORE_UPSTREAM_TIMEOUT_MS
    }, upstream => {
      res.statusCode = upstream.statusCode || 502;
      for (const [k, v] of Object.entries(upstream.headers)) {
        if (v !== undefined && !['connection', 'transfer-encoding'].includes(k.toLowerCase())) res.setHeader(k, v);
      }
      gatewayHeaders(res);
      upstream.pipe(res);
      upstream.on('end', resolve);
    });
    p.on('timeout', () => p.destroy(new Error('upstream_timeout')));
    p.on('error', err => {
      if (!res.headersSent) json(res, err.message === 'upstream_timeout' ? 504 : 502, { status: 'UPSTREAM_UNAVAILABLE' });
      else res.destroy();
      resolve();
    });
    if (body !== null) p.end(body);
    else req.pipe(p);
  });
}

async function handleCore(req, res, u) {
  if (!ALLOWED_CORE_METHODS.has(req.method || 'GET')) return json(res, 405, { status: 'METHOD_NOT_ALLOWED' });

  const stripped = u.pathname.slice('/core'.length) || '/';
  const targetPath = stripped + u.search;
  if (stripped === '/api/v1/openapi.json' || stripped === '/openapi.json' || stripped === '/docs' || stripped.startsWith('/docs/')) {
    return json(res, 404, { status: 'NOT_FOUND' });
  }

  const identity = coreIdentity(req);
  if (identity.required && !identity.authenticated) {
    return json(res, 401, { status: 'UNAUTHORIZED', authenticated: false, role: 'UNVERIFIED', error: 'Trusted privileged external identity is required.' });
  }

  const rateKey = identity.principal || req.socket.remoteAddress || 'unknown';
  if (!rateAllowed(rateKey)) return json(res, 429, { status: 'RATE_LIMITED' });
  if (activeCoreRequests >= CORE_MAX_CONCURRENCY) return json(res, 503, { status: 'CORE_BUSY' });

  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > CORE_BODY_LIMIT) return json(res, 413, { status: 'PAYLOAD_TOO_LARGE' });

  activeCoreRequests += 1;
  try {
    let body = null;
    if (req.method === 'POST') {
      try {
        body = await collectBody(req, CORE_BODY_LIMIT);
      } catch (err) {
        if (err?.code === 'BODY_LIMIT') {
          if (!res.headersSent) json(res, 413, { status: 'PAYLOAD_TOO_LARGE' });
          return;
        }
        if (!res.headersSent) json(res, 400, { status: 'BAD_REQUEST' });
        return;
      }
    }
    await proxyBuffered(req, res, CORE_PORT, targetPath, body, true);
  } finally {
    activeCoreRequests = Math.max(0, activeCoreRequests - 1);
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://gateway.local');
  if (u.pathname === '/health') return health(res);
  if (u.pathname === '/core') {
    res.statusCode = 308;
    res.setHeader('Location', '/core/');
    gatewayHeaders(res);
    return res.end();
  }
  if (u.pathname.startsWith('/core/')) return handleCore(req, res, u);
  return proxyBuffered(req, res, OWNER_PORT, u.pathname + u.search, null, false);
});

server.listen(PORT, '0.0.0.0', () => console.log(JSON.stringify({
  event: 'gateway_listening',
  port: PORT,
  owner_port: OWNER_PORT,
  core_port: CORE_PORT,
  core_mode: 'ADVISORY_ONLY',
  external_identity_required: process.env.CRYPTOSPHERE_OWNER_AUTH_MODE === 'external'
})));

function shutdown() {
  server.close(() => process.exit(0));
  for (const c of children) if (!c.killed) c.kill('SIGTERM');
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
