'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 31377 + Math.floor(Math.random()*1000);
const base = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-cert-'));
let child;
const ownerHeaders = { Authorization:'Bearer test-owner-secret' };

async function waitForHealth() {
  for (let i=0;i<80;i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('server did not become healthy');
}
function start() {
  child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(PORT), HOST:'127.0.0.1', DURABLE_STORE_PATH:dataDir, MS_OWNER_TOKEN:'test-owner-secret', GIT_SHA:'test-sha' }, stdio:'ignore' });
}
async function restart() {
  child.kill('SIGTERM');
  await new Promise(r => child.once('exit', r));
  start();
  await waitForHealth();
}

test.before(async () => { start(); await waitForHealth(); });
test.after(async () => { if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(r => child.once('exit', r)); } fs.rmSync(dataDir,{recursive:true,force:true}); });

test('root renders attribution and governance boundary', async () => {
  const r = await fetch(`${base}/`); const text = await r.text();
  assert.equal(r.status, 200);
  assert.match(text, /Designed, Engineered, &amp; Built By: Azad Ahmed/);
  assert.match(text, /Capital authority: NONE/);
});

test('browser proof writes hashed evidence and updates readiness', async () => {
  const p = await fetch(`${base}/api/browser-proof`, {method:'POST'}); const pj = await p.json();
  assert.equal(p.status,200); assert.equal(pj.evidence.ok,true); assert.match(pj.evidence.sha256,/^[a-f0-9]{64}$/);
  const r = await fetch(`${base}/api/readiness`); const j = await r.json();
  assert.equal(j.gates.browser_interactivity,'PASS'); assert.equal(j.gates.evidence_store,'PASS');
  assert.equal(j.gates.t0,'LOCKED'); assert.equal(j.gates.capital_authority,'NONE');
});

test('owner endpoint records both denied and passed evidence', async () => {
  const no = await fetch(`${base}/api/whoami`); const nj = await no.json(); assert.equal(no.status,401); assert.equal(nj.evidence.ok,true);
  const yes = await fetch(`${base}/api/whoami`, {headers:ownerHeaders}); const j = await yes.json();
  assert.equal(yes.status,200); assert.equal(j.role,'OWNER'); assert.equal(j.permissions.capital_authority,false); assert.equal(j.evidence.ok,true);
});

test('synthetic self-test stays explicitly simulated and is evidenced', async () => {
  const r = await fetch(`${base}/api/certification/selftest`, {method:'POST',headers:ownerHeaders}); const j = await r.json();
  assert.equal(r.status,200); assert.equal(j.classification,'SIMULATED'); assert.equal(j.evidence.ok,true);
  const s = await fetch(`${base}/api/sources`); const sj = await s.json();
  const synth = sj.sources.find(x => x.source_id === 'SYNTHETIC_CERT');
  assert.equal(synth.certification,'SIMULATED_PASS'); assert.match(synth.warning,/never eligible for LIVE/i);
});

test('evidence manifest and integrity verification pass', async () => {
  const m = await fetch(`${base}/api/evidence/manifest?limit=100`, {headers:ownerHeaders}); const mj = await m.json();
  assert.equal(m.status,200); assert.ok(mj.records.length >= 4);
  const i = await fetch(`${base}/api/evidence/integrity`, {headers:ownerHeaders}); const ij = await i.json();
  assert.equal(i.status,200); assert.equal(ij.status,'PASS'); assert.equal(ij.hash_mismatch,0); assert.equal(ij.chain_breaks,0);
});

test('certification snapshot produces evidence', async () => {
  const r = await fetch(`${base}/api/certification/snapshot`, {method:'POST',headers:ownerHeaders}); const j = await r.json();
  assert.equal(r.status,200); assert.equal(j.result,'PASS'); assert.equal(j.evidence.ok,true); assert.equal(j.snapshot.readiness.gates.capital_authority,'NONE');
});

test('capital action path is denied and evidenced', async () => {
  const r = await fetch(`${base}/api/capital/execute`, {method:'POST',headers:ownerHeaders}); const j = await r.json();
  assert.equal(r.status,403); assert.equal(j.capital_authority,'NONE'); assert.equal(j.t0,'LOCKED'); assert.equal(j.evidence.ok,true);
});

test('restart proves persisted state and recovery continuity', async () => {
  const before = await fetch(`${base}/api/certification/storage`); const bj = await before.json();
  assert.ok(bj.boot_count >= 1);
  await restart();
  const r = await fetch(`${base}/api/certification/recovery`); const j = await r.json();
  assert.equal(r.status,200); assert.equal(j.status,'PASS'); assert.ok(j.boot_count >= 2); assert.equal(j.prior_state_found,true); assert.notEqual(j.previous_boot_id,j.current_boot_id);
  const ready = await fetch(`${base}/api/readiness`); const rr = await ready.json(); assert.equal(rr.gates.recovery,'PASS');
});

test('certification bundle is downloadable, governed, and integrity-backed', async () => {
  const r = await fetch(`${base}/api/certification/bundle`, {headers:ownerHeaders}); const j = await r.json();
  assert.equal(r.status,200); assert.match(r.headers.get('content-disposition') || '',/attachment/);
  assert.match(j.bundle_id,/^MS-CERT-/); assert.equal(j.governance.t0,'LOCKED'); assert.equal(j.governance.capital_authority,'NONE'); assert.equal(j.evidence_integrity.status,'PASS'); assert.equal(j.bundle_generation_evidence.ok,true);
});
