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

async function waitForHealth() {
  for (let i=0;i<60;i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) return; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('server did not become healthy');
}

test.before(async () => {
  child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(PORT), HOST:'127.0.0.1', DURABLE_STORE_PATH:dataDir, MS_OWNER_TOKEN:'test-owner-secret' }, stdio:'ignore' });
  await waitForHealth();
});

test.after(() => { if (child) child.kill('SIGTERM'); fs.rmSync(dataDir,{recursive:true,force:true}); });

test('root renders attribution and governance boundary', async () => {
  const r = await fetch(`${base}/`); const text = await r.text();
  assert.equal(r.status, 200);
  assert.match(text, /Designed, Engineered, &amp; Built By: Azad Ahmed/);
  assert.match(text, /Capital authority: NONE/);
});

test('browser proof updates readiness', async () => {
  const p = await fetch(`${base}/api/browser-proof`, {method:'POST'}); assert.equal(p.status,200);
  const r = await fetch(`${base}/api/readiness`); const j = await r.json();
  assert.equal(j.gates.browser_interactivity,'PASS');
  assert.equal(j.gates.t0,'LOCKED');
  assert.equal(j.gates.capital_authority,'NONE');
});

test('owner endpoint is server-side authenticated', async () => {
  const no = await fetch(`${base}/api/whoami`); assert.equal(no.status,401);
  const yes = await fetch(`${base}/api/whoami`, {headers:{Authorization:'Bearer test-owner-secret'}}); const j = await yes.json();
  assert.equal(yes.status,200); assert.equal(j.role,'OWNER'); assert.equal(j.permissions.capital_authority,false);
});

test('synthetic self-test stays explicitly simulated', async () => {
  const r = await fetch(`${base}/api/certification/selftest`, {method:'POST',headers:{Authorization:'Bearer test-owner-secret'}}); const j = await r.json();
  assert.equal(r.status,200); assert.equal(j.classification,'SIMULATED');
  const s = await fetch(`${base}/api/sources`); const sj = await s.json();
  const synth = sj.sources.find(x => x.source_id === 'SYNTHETIC_CERT');
  assert.equal(synth.certification,'SIMULATED_PASS');
  assert.match(synth.warning,/never eligible for LIVE/i);
});

test('capital action path is denied', async () => {
  const r = await fetch(`${base}/api/capital/execute`, {method:'POST',headers:{Authorization:'Bearer test-owner-secret'}}); const j = await r.json();
  assert.equal(r.status,403); assert.equal(j.capital_authority,'NONE'); assert.equal(j.t0,'LOCKED');
});
