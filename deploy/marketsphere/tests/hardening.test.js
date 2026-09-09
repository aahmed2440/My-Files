'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 33500 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-hardening-'));
const ownerKey = 'local-hardening-key';
const ownerHeaders = { Authorization: `Bearer ${ownerKey}` };
let child;

async function wait(baseUrl) {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${baseUrl}/api/health`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 40));
  }
  throw new Error('health timeout');
}

function startPrimary() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DURABLE_STORE_PATH: dataDir,
      MS_OWNER_TOKEN: ownerKey, GIT_SHA: 'hardening-test',
      CME_CREDENTIALS_PRESENT: 'true', CME_CERT_AUTHENTICATED: 'true', CME_STREAM_VERIFIED: 'true',
      CME_HEARTBEAT_STABLE: 'true', CME_SEQUENCE_INTEGRITY_PASS: 'true', CME_TIMESTAMP_INTEGRITY_PASS: 'true', CME_SOURCE_QUORUM_PASS: 'true',
      SCHWAB_API_APPROVED: 'true', SCHWAB_OAUTH_VERIFIED: 'true', SCHWAB_STREAM_VERIFIED: 'true'
    }, stdio: 'ignore'
  });
}

test.before(async () => { startPrimary(); await wait(base); });
test.after(async () => {
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(r => child.once('exit', r)); }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('declaration flags cannot certify CME or Schwab', async () => {
  const r = await fetch(`${base}/api/sources`); const j = await r.json();
  for (const id of ['CME', 'SCHWAB']) {
    const s = j.sources.find(x => x.source_id === id);
    assert.equal(s.certification, 'NOT_CERTIFIED');
    assert.notEqual(s.connection_state, 'LIVE');
    assert.match(s.warning, /cannot certify/i);
  }
});

test('browser proof rejects cross-origin requests and rate-limits repeated writes', async () => {
  const hostile = await fetch(`${base}/api/browser-proof`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
  assert.equal(hostile.status, 403);
  const headers = { 'User-Agent': 'hardening-rate-probe' };
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await fetch(`${base}/api/browser-proof`, { method: 'POST', headers })).status);
  assert.deepEqual(statuses, [200, 200, 200, 429]);
});

test('owner-auth denial evidence is throttled independently of denial enforcement', async () => {
  const headers = { 'User-Agent': 'denial-audit-probe' };
  let last;
  for (let i = 0; i < 4; i++) { const r = await fetch(`${base}/api/whoami`, { headers }); assert.equal(r.status, 401); last = await r.json(); }
  assert.equal(last.evidence.ok, false);
  assert.equal(last.evidence.reason, 'AUDIT_EVIDENCE_THROTTLED');
});

test('synthetic degraded stale offline states are explicit and never LIVE', async () => {
  for (const [state, expected] of [['DEGRADED','SIMULATED_DEGRADED'], ['STALE','SIMULATED_STALE'], ['OFFLINE','OFFLINE']]) {
    const r = await fetch(`${base}/api/certification/simulate-state`, {
      method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ state })
    });
    const j = await r.json();
    assert.equal(r.status, 200); assert.equal(j.classification, 'SIMULATED'); assert.equal(j.state.connection_state, expected);
    assert.notEqual(j.state.connection_state, 'LIVE'); assert.equal(j.evidence.ok, true);
  }
});

test('evidence hard-cap applies backpressure instead of deleting history', async () => {
  const port2 = PORT + 700;
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-cap-'));
  const p = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port2), HOST: '127.0.0.1', DURABLE_STORE_PATH: dir2, MS_OWNER_TOKEN: ownerKey, MS_EVIDENCE_WARN_BYTES: '1', MS_EVIDENCE_HARD_BYTES: '1' },
    stdio: 'ignore'
  });
  try {
    const url = `http://127.0.0.1:${port2}`; await wait(url);
    const ready = await fetch(`${url}/api/readiness`); const rj = await ready.json(); assert.equal(rj.gates.evidence_store, 'FULL');
    const proof = await fetch(`${url}/api/browser-proof`, { method: 'POST', headers: { 'User-Agent': 'capacity-probe' } });
    const pj = await proof.json(); assert.equal(proof.status, 507); assert.equal(pj.evidence.reason, 'EVIDENCE_CAPACITY_EXCEEDED');
    const manifest = fs.readFileSync(path.join(dir2, 'evidence', 'manifest.jsonl'), 'utf8'); assert.match(manifest, /runtime_boot/);
  } finally {
    p.kill('SIGTERM'); await new Promise(r => p.once('exit', r)); fs.rmSync(dir2, { recursive: true, force: true });
  }
});
