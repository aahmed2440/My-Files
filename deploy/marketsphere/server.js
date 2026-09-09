'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const APP_VERSION = '4.5.0-cert';
const ATTRIBUTION = 'Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale';
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DURABLE_STORE_PATH || '/data/marketsphere';
const STATE_FILE = path.join(DATA_DIR, 'certification-state.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 16384);
const BOOT_ID = crypto.randomUUID();
const INSTANCE_ID = process.env.RAILWAY_REPLICA_ID || process.env.RAILWAY_SERVICE_ID || 'local';
const bootTime = new Date().toISOString();

function nowIso() { return new Date().toISOString(); }
function isTrue(v) { return String(v || '').toLowerCase() === 'true'; }
function safeEqual(a, b) {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

let storageWritable = false;
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const probe = path.join(DATA_DIR, '.write-probe');
  fs.writeFileSync(probe, bootTime, { mode: 0o600 });
  fs.rmSync(probe, { force: true });
  storageWritable = true;
} catch (err) {
  console.error(JSON.stringify({ event: 'storage_probe_failed', error: err.code || 'UNKNOWN' }));
}

function defaultState() {
  return {
    schema_version: 1,
    boots: 0,
    last_boot_id: null,
    last_boot_at: null,
    last_browser_proof_at: null,
    owner_auth_last_pass_at: null,
    owner_auth_failures: 0,
    synthetic: {
      messages_received: 0,
      last_sequence: null,
      sequence_gaps: 0,
      last_source_ts: null,
      last_recv_ts: null,
      heartbeat_at: null,
      provenance: 'MarketSphere certification self-test',
      certification: 'NOT_RUN'
    }
  };
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return defaultState();
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { ...defaultState(), ...parsed, synthetic: { ...defaultState().synthetic, ...(parsed.synthetic || {}) } };
  } catch (err) {
    console.error(JSON.stringify({ event: 'state_read_failed', error: err.code || 'INVALID_STATE' }));
    return defaultState();
  }
}

let state = readState();
state.boots = Number(state.boots || 0) + 1;
state.last_boot_id = BOOT_ID;
state.last_boot_at = bootTime;

function persistState() {
  if (!storageWritable) return false;
  try {
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, STATE_FILE);
    return true;
  } catch (err) {
    console.error(JSON.stringify({ event: 'state_write_failed', error: err.code || 'UNKNOWN' }));
    return false;
  }
}
persistState();

function requestId(req) {
  const incoming = req.headers['x-request-id'];
  if (typeof incoming === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

function securityHeaders(res, requestIdValue) {
  res.setHeader('X-Request-Id', requestIdValue);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function sendJson(res, status, payload, requestIdValue) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  securityHeaders(res, requestIdValue);
  res.end(body);
}

function sendFile(res, filePath, contentType, requestIdValue) {
  try {
    const body = fs.readFileSync(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=300');
    securityHeaders(res, requestIdValue);
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'NOT_FOUND' }, requestIdValue);
  }
}

function parseBearer(req) {
  const auth = req.headers.authorization;
  if (!auth || typeof auth !== 'string') return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function ownerConfigured() { return Boolean(process.env.MS_OWNER_TOKEN); }
function isOwner(req) { return ownerConfigured() && safeEqual(parseBearer(req), process.env.MS_OWNER_TOKEN); }
function ownerSessionClass(req) { return isOwner(req) ? 'OWNER' : 'PUBLIC'; }

function sourceStatus(id) {
  const now = Date.now();
  if (id === 'cme') {
    const credentials = isTrue(process.env.CME_CREDENTIALS_PRESENT);
    const auth = isTrue(process.env.CME_CERT_AUTHENTICATED);
    const stream = isTrue(process.env.CME_STREAM_VERIFIED);
    const heartbeat = isTrue(process.env.CME_HEARTBEAT_STABLE);
    const sequence = isTrue(process.env.CME_SEQUENCE_INTEGRITY_PASS);
    const timestamp = isTrue(process.env.CME_TIMESTAMP_INTEGRITY_PASS);
    const quorum = isTrue(process.env.CME_SOURCE_QUORUM_PASS);
    const fully = credentials && auth && stream && heartbeat && sequence && timestamp && quorum;
    return {
      source_id: 'CME',
      connection_state: fully ? 'LIVE' : credentials ? 'UNVERIFIED' : 'AWAITING_CREDENTIALS',
      certification: fully ? 'CERTIFIED' : 'NOT_CERTIFIED',
      source_ts: null,
      recv_ts: null,
      age_ms: null,
      heartbeat_age_ms: null,
      last_sequence: null,
      sequence_gaps: null,
      messages_received: null,
      reconnect_count: null,
      provenance: 'CME adapter declaration only; empirical packet evidence not present in this runtime',
      declared_gates: { credentials, auth, stream, heartbeat, sequence, timestamp, quorum }
    };
  }
  if (id === 'schwab') {
    const approved = isTrue(process.env.SCHWAB_API_APPROVED);
    const oauth = isTrue(process.env.SCHWAB_OAUTH_VERIFIED);
    const stream = isTrue(process.env.SCHWAB_STREAM_VERIFIED);
    const fully = approved && oauth && stream;
    return {
      source_id: 'SCHWAB',
      connection_state: fully ? 'LIVE' : approved ? 'UNVERIFIED' : 'AWAITING_API_APPROVAL',
      certification: fully ? 'CERTIFIED' : 'NOT_CERTIFIED',
      source_ts: null,
      recv_ts: null,
      age_ms: null,
      heartbeat_age_ms: null,
      last_sequence: null,
      sequence_gaps: null,
      messages_received: null,
      reconnect_count: null,
      provenance: 'Schwab Trader API declaration only; empirical packet evidence not present in this runtime',
      declared_gates: { approved, oauth, stream }
    };
  }
  if (id === 'synthetic') {
    const s = state.synthetic;
    const recv = s.last_recv_ts ? Date.parse(s.last_recv_ts) : null;
    const hb = s.heartbeat_at ? Date.parse(s.heartbeat_at) : null;
    return {
      source_id: 'SYNTHETIC_CERT',
      connection_state: s.certification === 'PASS' ? 'SIMULATED' : 'OFFLINE',
      certification: s.certification === 'PASS' ? 'SIMULATED_PASS' : 'NOT_RUN',
      source_ts: s.last_source_ts,
      recv_ts: s.last_recv_ts,
      age_ms: recv ? Math.max(0, now - recv) : null,
      heartbeat_age_ms: hb ? Math.max(0, now - hb) : null,
      last_sequence: s.last_sequence,
      sequence_gaps: s.sequence_gaps,
      messages_received: s.messages_received,
      reconnect_count: 0,
      provenance: s.provenance,
      warning: 'Synthetic evidence is never eligible for LIVE market-data certification.'
    };
  }
  return null;
}

function readiness() {
  const browserRecent = state.last_browser_proof_at && (Date.now() - Date.parse(state.last_browser_proof_at) < 24 * 3600 * 1000);
  const ownerPassRecent = state.owner_auth_last_pass_at && (Date.now() - Date.parse(state.owner_auth_last_pass_at) < 24 * 3600 * 1000);
  const cme = sourceStatus('cme');
  const schwab = sourceStatus('schwab');
  const anyRealCertified = cme.certification === 'CERTIFIED' || schwab.certification === 'CERTIFIED';
  return {
    app: 'MarketSphere',
    version: APP_VERSION,
    maturity: 'APPLICATION_CERTIFICATION',
    instance_id: INSTANCE_ID,
    boot_id: BOOT_ID,
    boot_count: state.boots,
    gates: {
      runtime: 'PASS',
      storage: storageWritable ? 'PASS' : 'FAIL',
      browser_interactivity: browserRecent ? 'PASS' : 'UNVERIFIED',
      owner_auth: ownerPassRecent ? 'PASS' : ownerConfigured() ? 'CONFIGURED_UNVERIFIED' : 'NOT_CONFIGURED',
      cme: cme.certification,
      schwab: schwab.certification,
      real_market_ingestion: anyRealCertified ? 'PASS' : 'WAITING_EXTERNAL_SOURCE',
      source_quorum: (cme.certification === 'CERTIFIED' && schwab.certification === 'CERTIFIED') ? 'READY_FOR_QUORUM_TEST' : 'WAITING_MULTIPLE_CERTIFIED_SOURCES',
      t0: 'LOCKED',
      capital_authority: 'NONE'
    },
    evidence: {
      last_browser_proof_at: state.last_browser_proof_at,
      owner_auth_last_pass_at: state.owner_auth_last_pass_at,
      storage_state_file_present: storageWritable && fs.existsSync(STATE_FILE)
    },
    attribution: ATTRIBUTION,
    generated_at: nowIso()
  };
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('BODY_TOO_LARGE'), { code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const rid = requestId(req);
  const started = process.hrtime.bigint();
  const originalEnd = res.end;
  res.end = function (...args) {
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(JSON.stringify({
      event: 'http_request', request_id: rid, timestamp: nowIso(), method: req.method,
      path: (req.url || '').split('?')[0], status: res.statusCode || 200, latency_ms: Number(latencyMs.toFixed(3)),
      session_class: ownerSessionClass(req), instance_id: INSTANCE_ID, boot_id: BOOT_ID
    }));
    return originalEnd.apply(this, args);
  };

  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8', rid);
    if (req.method === 'GET' && url.pathname === '/app.js') return sendFile(res, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript; charset=utf-8', rid);
    if (req.method === 'GET' && url.pathname === '/styles.css') return sendFile(res, path.join(PUBLIC_DIR, 'styles.css'), 'text/css; charset=utf-8', rid);
    if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { status: 'ok', app: 'MarketSphere', version: APP_VERSION, storage_writable: storageWritable, boot_id: BOOT_ID, capital_authority: 'NONE', t0: 'LOCKED', time: nowIso() }, rid);
    if (req.method === 'GET' && url.pathname === '/api/readiness') return sendJson(res, 200, readiness(), rid);
    if (req.method === 'GET' && url.pathname === '/api/sources') return sendJson(res, 200, { sources: [sourceStatus('cme'), sourceStatus('schwab'), sourceStatus('synthetic')], generated_at: nowIso() }, rid);
    if (req.method === 'POST' && url.pathname === '/api/browser-proof') {
      state.last_browser_proof_at = nowIso(); persistState();
      return sendJson(res, 200, { browser_interactivity: 'PASS', proof_at: state.last_browser_proof_at, request_id: rid }, rid);
    }
    if (req.method === 'GET' && url.pathname === '/api/whoami') {
      if (!ownerConfigured()) return sendJson(res, 503, { authenticated: false, role: 'NONE', reason: 'OWNER_AUTH_NOT_CONFIGURED', capital_authority: 'NONE' }, rid);
      if (!isOwner(req)) {
        state.owner_auth_failures = Number(state.owner_auth_failures || 0) + 1; persistState();
        return sendJson(res, 401, { authenticated: false, role: 'NONE', capital_authority: 'NONE' }, rid);
      }
      state.owner_auth_last_pass_at = nowIso(); persistState();
      return sendJson(res, 200, { authenticated: true, role: 'OWNER', session_state: 'ACTIVE', permissions: { configuration: true, source_promotion: true, certification_selftest: true, capital_authority: false }, capital_authority: 'NONE', t0: 'LOCKED' }, rid);
    }
    if (req.method === 'POST' && url.pathname === '/api/certification/selftest') {
      if (!isOwner(req)) return sendJson(res, ownerConfigured() ? 401 : 503, { error: ownerConfigured() ? 'UNAUTHORIZED' : 'OWNER_AUTH_NOT_CONFIGURED' }, rid);
      const receivedAt = nowIso();
      const seq = Number(state.synthetic.last_sequence || 0) + 1;
      state.synthetic.messages_received = Number(state.synthetic.messages_received || 0) + 1;
      state.synthetic.last_sequence = seq;
      state.synthetic.last_source_ts = receivedAt;
      state.synthetic.last_recv_ts = receivedAt;
      state.synthetic.heartbeat_at = receivedAt;
      state.synthetic.sequence_gaps = 0;
      state.synthetic.certification = 'PASS';
      persistState();
      return sendJson(res, 200, { result: 'PASS', classification: 'SIMULATED', sequence: seq, persisted: storageWritable, warning: 'This self-test validates application plumbing only. It cannot certify a real market-data source.' }, rid);
    }
    if (req.method === 'GET' && url.pathname === '/api/certification/storage') return sendJson(res, 200, { writable: storageWritable, state_file_present: storageWritable && fs.existsSync(STATE_FILE), boot_count: state.boots, current_boot_id: BOOT_ID, last_boot_at: state.last_boot_at, durable_store_path: DATA_DIR }, rid);
    if (req.method === 'POST' && url.pathname.startsWith('/api/capital')) return sendJson(res, 403, { error: 'CAPITAL_AUTHORITY_DISABLED', capital_authority: 'NONE', t0: 'LOCKED' }, rid);
    return sendJson(res, 404, { error: 'NOT_FOUND' }, rid);
  } catch (err) {
    console.error(JSON.stringify({ event: 'request_error', request_id: rid, error: err.code || err.message || 'UNKNOWN' }));
    if (!res.headersSent) return sendJson(res, 500, { error: err.code || 'INTERNAL_ERROR' }, rid);
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ event: 'boot', app: 'MarketSphere', version: APP_VERSION, host: HOST, port: PORT, storage: DATA_DIR, storage_writable: storageWritable, boot_id: BOOT_ID, boot_count: state.boots, capital_authority: 'NONE', t0: 'LOCKED' }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ event: 'shutdown', signal, boot_id: BOOT_ID }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
