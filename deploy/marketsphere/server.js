'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const APP_VERSION = '4.6.0-evidence';
const ATTRIBUTION = 'Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale';
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DURABLE_STORE_PATH || '/data/marketsphere';
const STATE_FILE = path.join(DATA_DIR, 'certification-state.json');
const EVIDENCE_DIR = path.join(DATA_DIR, 'evidence');
const MANIFEST_FILE = path.join(EVIDENCE_DIR, 'manifest.jsonl');
const PUBLIC_DIR = path.join(__dirname, 'public');
const BOOT_ID = crypto.randomUUID();
const INSTANCE_ID = process.env.RAILWAY_REPLICA_ID || process.env.RAILWAY_SERVICE_ID || 'local';
const DEPLOYMENT_ID = process.env.RAILWAY_DEPLOYMENT_ID || 'unknown';
const BUILD_SHA = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'unknown';
const bootTime = new Date().toISOString();

function nowIso() { return new Date().toISOString(); }
function isTrue(v) { return String(v || '').toLowerCase() === 'true'; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeEqual(a, b) {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function safeType(v) { return String(v || 'event').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64); }
function safeTimestamp(v) { return String(v).replace(/[:.]/g, '-'); }

let storageWritable = false;
try {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const probe = path.join(DATA_DIR, '.write-probe');
  fs.writeFileSync(probe, bootTime, { mode: 0o600 });
  fs.rmSync(probe, { force: true });
  storageWritable = true;
} catch (err) {
  console.error(JSON.stringify({ event: 'storage_probe_failed', error: err.code || 'UNKNOWN' }));
}

function defaultState() {
  return {
    schema_version: 2,
    boots: 0,
    last_boot_id: null,
    last_boot_at: null,
    previous_boot_id: null,
    previous_boot_at: null,
    prior_state_found: false,
    last_browser_proof_at: null,
    owner_auth_last_pass_at: null,
    owner_auth_failures: 0,
    evidence_chain_head: null,
    evidence_count: 0,
    last_evidence_id: null,
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
    const d = defaultState();
    return { ...d, ...parsed, synthetic: { ...d.synthetic, ...(parsed.synthetic || {}) } };
  } catch (err) {
    console.error(JSON.stringify({ event: 'state_read_failed', error: err.code || 'INVALID_STATE' }));
    return defaultState();
  }
}

let state = readState();
const hadPriorState = storageWritable && fs.existsSync(STATE_FILE);
const priorBootId = state.last_boot_id;
const priorBootAt = state.last_boot_at;
state.prior_state_found = Boolean(hadPriorState);
state.previous_boot_id = priorBootId || null;
state.previous_boot_at = priorBootAt || null;
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

function sendJson(res, status, payload, requestIdValue, attachmentName = null) {
  const body = JSON.stringify(payload, null, attachmentName ? 2 : 0);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (attachmentName) res.setHeader('Content-Disposition', `attachment; filename="${attachmentName}"`);
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

function appendEvidence(eventType, payload = {}, meta = {}) {
  if (!storageWritable) return { ok: false, reason: 'STORAGE_NOT_WRITABLE' };
  try {
    const createdAt = nowIso();
    const evidenceId = `EVD-${createdAt.slice(0,10).replace(/-/g,'')}-${crypto.randomUUID().slice(0,8)}`;
    const recordCore = {
      schema_version: 1,
      evidence_id: evidenceId,
      created_at: createdAt,
      event_type: safeType(eventType),
      classification: meta.classification || 'EMPIRICAL_APPLICATION_EVIDENCE',
      request_id: meta.request_id || null,
      actor_class: meta.actor_class || 'SYSTEM',
      app: 'MarketSphere',
      app_version: APP_VERSION,
      build_sha: BUILD_SHA,
      deployment_id: DEPLOYMENT_ID,
      instance_id: INSTANCE_ID,
      boot_id: BOOT_ID,
      previous_evidence_hash: state.evidence_chain_head || null,
      governance: { t0: 'LOCKED', capital_authority: 'NONE' },
      payload
    };
    const recordHash = sha256(JSON.stringify(recordCore));
    const record = { ...recordCore, sha256: recordHash };
    const filename = `${safeTimestamp(createdAt)}_${evidenceId}_${safeType(eventType)}.json`;
    const full = path.join(EVIDENCE_DIR, filename);
    const tmp = `${full}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, full);
    const manifestEntry = {
      evidence_id: evidenceId,
      created_at: createdAt,
      filename,
      event_type: record.event_type,
      classification: record.classification,
      sha256: recordHash,
      previous_evidence_hash: record.previous_evidence_hash
    };
    fs.appendFileSync(MANIFEST_FILE, `${JSON.stringify(manifestEntry)}\n`, { mode: 0o600 });
    state.evidence_chain_head = recordHash;
    state.evidence_count = Number(state.evidence_count || 0) + 1;
    state.last_evidence_id = evidenceId;
    persistState();
    return { ok: true, evidence_id: evidenceId, sha256: recordHash, filename, created_at: createdAt };
  } catch (err) {
    console.error(JSON.stringify({ event: 'evidence_write_failed', error: err.code || 'UNKNOWN' }));
    return { ok: false, reason: err.code || 'WRITE_FAILED' };
  }
}

function readManifest(limit = 100) {
  if (!fs.existsSync(MANIFEST_FILE)) return [];
  const lines = fs.readFileSync(MANIFEST_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  return lines.slice(Math.max(0, lines.length - limit)).map(line => {
    try { return JSON.parse(line); } catch { return { invalid_manifest_line: true, raw_hash: sha256(line) }; }
  });
}

function verifyEvidenceIntegrity() {
  const entries = readManifest(Number.MAX_SAFE_INTEGER);
  let previous = null;
  let filesMissing = 0;
  let hashMismatch = 0;
  let chainBreaks = 0;
  let invalidManifestLines = 0;
  for (const entry of entries) {
    if (entry.invalid_manifest_line) { invalidManifestLines++; continue; }
    if ((entry.previous_evidence_hash || null) !== previous) chainBreaks++;
    const file = path.join(EVIDENCE_DIR, entry.filename || '');
    if (!fs.existsSync(file)) { filesMissing++; previous = entry.sha256 || null; continue; }
    try {
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      const claimed = record.sha256;
      const { sha256: _omit, ...core } = record;
      const computed = sha256(JSON.stringify(core));
      if (claimed !== computed || claimed !== entry.sha256) hashMismatch++;
    } catch { hashMismatch++; }
    previous = entry.sha256 || null;
  }
  const ok = filesMissing === 0 && hashMismatch === 0 && chainBreaks === 0 && invalidManifestLines === 0;
  return {
    status: ok ? 'PASS' : 'FAIL',
    records_checked: entries.length,
    files_missing: filesMissing,
    hash_mismatch: hashMismatch,
    chain_breaks: chainBreaks,
    invalid_manifest_lines: invalidManifestLines,
    chain_head: state.evidence_chain_head || null,
    generated_at: nowIso()
  };
}

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
      source_ts: null, recv_ts: null, age_ms: null, heartbeat_age_ms: null,
      last_sequence: null, sequence_gaps: null, messages_received: null, reconnect_count: null,
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
      source_ts: null, recv_ts: null, age_ms: null, heartbeat_age_ms: null,
      last_sequence: null, sequence_gaps: null, messages_received: null, reconnect_count: null,
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

function recoveryStatus() {
  const passed = storageWritable && state.prior_state_found && Boolean(state.previous_boot_id) && state.previous_boot_id !== BOOT_ID && state.boots >= 2;
  return {
    status: passed ? 'PASS' : 'UNVERIFIED',
    storage_writable: storageWritable,
    prior_state_found: Boolean(state.prior_state_found),
    boot_count: state.boots,
    previous_boot_id: state.previous_boot_id,
    previous_boot_at: state.previous_boot_at,
    current_boot_id: BOOT_ID,
    current_boot_at: bootTime,
    evidence_count: state.evidence_count || 0,
    state_file_present: storageWritable && fs.existsSync(STATE_FILE)
  };
}

function readiness() {
  const browserRecent = state.last_browser_proof_at && (Date.now() - Date.parse(state.last_browser_proof_at) < 24 * 3600 * 1000);
  const ownerPassRecent = state.owner_auth_last_pass_at && (Date.now() - Date.parse(state.owner_auth_last_pass_at) < 24 * 3600 * 1000);
  const cme = sourceStatus('cme');
  const schwab = sourceStatus('schwab');
  const anyRealCertified = cme.certification === 'CERTIFIED' || schwab.certification === 'CERTIFIED';
  return {
    app: 'MarketSphere', version: APP_VERSION, maturity: 'APPLICATION_CERTIFICATION',
    instance_id: INSTANCE_ID, deployment_id: DEPLOYMENT_ID, build_sha: BUILD_SHA, boot_id: BOOT_ID, boot_count: state.boots,
    gates: {
      runtime: 'PASS',
      storage: storageWritable ? 'PASS' : 'FAIL',
      evidence_store: storageWritable ? 'PASS' : 'FAIL',
      evidence_integrity: verifyEvidenceIntegrity().status,
      recovery: recoveryStatus().status,
      browser_interactivity: browserRecent ? 'PASS' : 'UNVERIFIED',
      owner_auth: ownerPassRecent ? 'PASS' : ownerConfigured() ? 'CONFIGURED_UNVERIFIED' : 'NOT_CONFIGURED',
      cme: cme.certification,
      schwab: schwab.certification,
      real_market_ingestion: anyRealCertified ? 'PASS' : 'WAITING_EXTERNAL_SOURCE',
      source_quorum: (cme.certification === 'CERTIFIED' && schwab.certification === 'CERTIFIED') ? 'READY_FOR_QUORUM_TEST' : 'WAITING_MULTIPLE_CERTIFIED_SOURCES',
      t0: 'LOCKED', capital_authority: 'NONE'
    },
    evidence: {
      last_browser_proof_at: state.last_browser_proof_at,
      owner_auth_last_pass_at: state.owner_auth_last_pass_at,
      storage_state_file_present: storageWritable && fs.existsSync(STATE_FILE),
      evidence_count: state.evidence_count || 0,
      last_evidence_id: state.last_evidence_id || null,
      chain_head: state.evidence_chain_head || null
    },
    attribution: ATTRIBUTION, generated_at: nowIso()
  };
}

function certificationBundle() {
  return {
    bundle_schema_version: 1,
    bundle_id: `MS-CERT-${nowIso().slice(0,10).replace(/-/g,'')}-${crypto.randomUUID().slice(0,8)}`,
    generated_at: nowIso(),
    app: 'MarketSphere', app_version: APP_VERSION, build_sha: BUILD_SHA, deployment_id: DEPLOYMENT_ID,
    instance_id: INSTANCE_ID, boot_id: BOOT_ID,
    readiness: readiness(),
    sources: [sourceStatus('cme'), sourceStatus('schwab'), sourceStatus('synthetic')],
    recovery: recoveryStatus(),
    evidence_integrity: verifyEvidenceIntegrity(),
    evidence_manifest_tail: readManifest(100),
    governance: { t0: 'LOCKED', capital_authority: 'NONE', owner_is_not_capital_authority: true },
    attribution: ATTRIBUTION
  };
}

const server = http.createServer(async (req, res) => {
  const rid = requestId(req);
  const started = process.hrtime.bigint();
  const originalEnd = res.end;
  res.end = function (...args) {
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(JSON.stringify({ event: 'http_request', request_id: rid, timestamp: nowIso(), method: req.method,
      path: (req.url || '').split('?')[0], status: res.statusCode || 200, latency_ms: Number(latencyMs.toFixed(3)),
      session_class: ownerSessionClass(req), instance_id: INSTANCE_ID, boot_id: BOOT_ID }));
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
      const ev = appendEvidence('browser_proof', { browser_interactivity: 'PASS', proof_at: state.last_browser_proof_at }, { request_id: rid, actor_class: 'BROWSER' });
      return sendJson(res, 200, { browser_interactivity: 'PASS', proof_at: state.last_browser_proof_at, request_id: rid, evidence: ev }, rid);
    }

    if (req.method === 'GET' && url.pathname === '/api/whoami') {
      if (!ownerConfigured()) return sendJson(res, 503, { authenticated: false, role: 'NONE', reason: 'OWNER_AUTH_NOT_CONFIGURED', capital_authority: 'NONE' }, rid);
      if (!isOwner(req)) {
        state.owner_auth_failures = Number(state.owner_auth_failures || 0) + 1; persistState();
        const ev = appendEvidence('owner_auth_denied', { authenticated: false, role: 'NONE', failure_count: state.owner_auth_failures }, { request_id: rid, actor_class: 'PUBLIC' });
        return sendJson(res, 401, { authenticated: false, role: 'NONE', capital_authority: 'NONE', evidence: ev }, rid);
      }
      state.owner_auth_last_pass_at = nowIso(); persistState();
      const ev = appendEvidence('owner_auth_pass', { authenticated: true, role: 'OWNER', session_state: 'ACTIVE', capital_authority: 'NONE' }, { request_id: rid, actor_class: 'OWNER' });
      return sendJson(res, 200, { authenticated: true, role: 'OWNER', session_state: 'ACTIVE', permissions: { configuration: true, source_promotion: true, certification_selftest: true, capital_authority: false }, capital_authority: 'NONE', t0: 'LOCKED', evidence: ev }, rid);
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
      const ev = appendEvidence('synthetic_plumbing_selftest', { result: 'PASS', classification: 'SIMULATED', sequence: seq, persisted: storageWritable }, { request_id: rid, actor_class: 'OWNER', classification: 'SIMULATED_APPLICATION_EVIDENCE' });
      return sendJson(res, 200, { result: 'PASS', classification: 'SIMULATED', sequence: seq, persisted: storageWritable, evidence: ev, warning: 'This self-test validates application plumbing only. It cannot certify a real market-data source.' }, rid);
    }

    if (req.method === 'GET' && url.pathname === '/api/certification/storage') return sendJson(res, 200, { writable: storageWritable, state_file_present: storageWritable && fs.existsSync(STATE_FILE), evidence_dir_present: storageWritable && fs.existsSync(EVIDENCE_DIR), boot_count: state.boots, current_boot_id: BOOT_ID, last_boot_at: state.last_boot_at, durable_store_path: DATA_DIR }, rid);
    if (req.method === 'GET' && url.pathname === '/api/certification/recovery') return sendJson(res, 200, recoveryStatus(), rid);

    if (req.method === 'GET' && url.pathname === '/api/evidence/integrity') {
      if (!isOwner(req)) return sendJson(res, ownerConfigured() ? 401 : 503, { error: ownerConfigured() ? 'UNAUTHORIZED' : 'OWNER_AUTH_NOT_CONFIGURED' }, rid);
      return sendJson(res, 200, verifyEvidenceIntegrity(), rid);
    }
    if (req.method === 'GET' && url.pathname === '/api/evidence/manifest') {
      if (!isOwner(req)) return sendJson(res, ownerConfigured() ? 401 : 503, { error: ownerConfigured() ? 'UNAUTHORIZED' : 'OWNER_AUTH_NOT_CONFIGURED' }, rid);
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 100)));
      const records = readManifest(limit);
      return sendJson(res, 200, { records, count: records.length, generated_at: nowIso() }, rid);
    }
    if (req.method === 'POST' && url.pathname === '/api/certification/snapshot') {
      if (!isOwner(req)) return sendJson(res, ownerConfigured() ? 401 : 503, { error: ownerConfigured() ? 'UNAUTHORIZED' : 'OWNER_AUTH_NOT_CONFIGURED' }, rid);
      const payload = { readiness: readiness(), sources: [sourceStatus('cme'), sourceStatus('schwab'), sourceStatus('synthetic')], recovery: recoveryStatus() };
      const ev = appendEvidence('certification_snapshot', payload, { request_id: rid, actor_class: 'OWNER' });
      return sendJson(res, 200, { result: 'PASS', evidence: ev, snapshot: payload }, rid);
    }
    if (req.method === 'GET' && url.pathname === '/api/certification/bundle') {
      if (!isOwner(req)) return sendJson(res, ownerConfigured() ? 401 : 503, { error: ownerConfigured() ? 'UNAUTHORIZED' : 'OWNER_AUTH_NOT_CONFIGURED' }, rid);
      const bundle = certificationBundle();
      const ev = appendEvidence('certification_bundle_generated', { bundle_id: bundle.bundle_id, evidence_records_included: bundle.evidence_manifest_tail.length, integrity_status: bundle.evidence_integrity.status }, { request_id: rid, actor_class: 'OWNER' });
      bundle.bundle_generation_evidence = ev;
      return sendJson(res, 200, bundle, rid, `${bundle.bundle_id}.json`);
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/capital')) {
      const ev = appendEvidence('capital_action_denied', { path: url.pathname, reason: 'CAPITAL_AUTHORITY_DISABLED' }, { request_id: rid, actor_class: ownerSessionClass(req) });
      return sendJson(res, 403, { error: 'CAPITAL_AUTHORITY_DISABLED', capital_authority: 'NONE', t0: 'LOCKED', evidence: ev }, rid);
    }
    return sendJson(res, 404, { error: 'NOT_FOUND' }, rid);
  } catch (err) {
    console.error(JSON.stringify({ event: 'request_error', request_id: rid, error: err.code || err.message || 'UNKNOWN' }));
    if (!res.headersSent) return sendJson(res, 500, { error: err.code || 'INTERNAL_ERROR' }, rid);
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  const bootEvidence = appendEvidence('runtime_boot', { boot_at: bootTime, boot_count: state.boots, prior_state_found: state.prior_state_found, previous_boot_id: state.previous_boot_id, storage_writable: storageWritable }, { actor_class: 'SYSTEM' });
  console.log(JSON.stringify({ event: 'boot', app: 'MarketSphere', version: APP_VERSION, host: HOST, port: PORT, storage: DATA_DIR, storage_writable: storageWritable, boot_id: BOOT_ID, boot_count: state.boots, evidence: bootEvidence, capital_authority: 'NONE', t0: 'LOCKED' }));
});

function shutdown(signal) {
  appendEvidence('runtime_shutdown', { signal }, { actor_class: 'SYSTEM' });
  console.log(JSON.stringify({ event: 'shutdown', signal, boot_id: BOOT_ID }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
