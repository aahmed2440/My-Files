'use strict';
let ownerToken = '';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtAge = (ms) => ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms/1000).toFixed(1)} s` : `${(ms/60000).toFixed(1)} min`;
const badgeClass = (v) => /PASS|CERTIFIED|LIVE|SIMULATED/.test(v) ? 'pass' : /FAIL|OFFLINE|UNAUTHORIZED/.test(v) ? 'fail' : 'waiting';

async function api(path, opts={}) {
  const headers = { ...(opts.headers || {}) };
  if (ownerToken && opts.owner) headers.Authorization = `Bearer ${ownerToken}`;
  const res = await fetch(path, { ...opts, headers });
  let body; try { body = await res.json(); } catch { body = { error: 'INVALID_JSON' }; }
  return { ok: res.ok, status: res.status, body, requestId: res.headers.get('x-request-id'), disposition: res.headers.get('content-disposition') };
}

async function refresh() {
  const [r, s] = await Promise.all([api('/api/readiness'), api('/api/sources')]);
  if (!r.ok) throw new Error(`readiness ${r.status}`);
  const g = r.body.gates;
  const appPass = g.runtime === 'PASS' && g.storage === 'PASS' && g.evidence_store === 'PASS' && g.evidence_integrity === 'PASS' && g.browser_interactivity === 'PASS';
  $('overall').textContent = appPass ? 'APP PATH PROVEN' : 'CERTIFICATION OPEN';
  $('overall').className = `badge ${appPass ? 'pass' : 'waiting'}`;
  const cards = [
    ['Runtime', g.runtime], ['Storage', g.storage], ['Evidence store', g.evidence_store], ['Evidence integrity', g.evidence_integrity], ['Recovery', g.recovery],
    ['Browser', g.browser_interactivity], ['Owner', g.owner_auth], ['T0', g.t0], ['Capital authority', g.capital_authority],
    ['CME', g.cme], ['Schwab', g.schwab], ['Real ingestion', g.real_market_ingestion], ['Quorum', g.source_quorum]
  ];
  $('gates').innerHTML = cards.map(([k,v]) => `<article class="card"><span>${esc(k)}</span><strong class="status ${badgeClass(v)}">${esc(v)}</strong></article>`).join('');
  if (s.ok) {
    $('sources').innerHTML = s.body.sources.map(x => `<tr><td>${esc(x.source_id)}</td><td><span class="status ${badgeClass(x.connection_state)}">${esc(x.connection_state)}</span></td><td>${esc(x.certification)}</td><td>${fmtAge(x.age_ms)}</td><td>${fmtAge(x.heartbeat_age_ms)}</td><td>${esc(x.messages_received ?? '—')}</td><td>${esc(x.provenance)}</td></tr>`).join('');
  }
}

$('refresh').addEventListener('click', () => refresh().catch(e => $('browserResult').textContent = `Refresh failed: ${e.message}`));
$('browserProof').addEventListener('click', async () => {
  const r = await api('/api/browser-proof', { method: 'POST' });
  $('browserResult').textContent = JSON.stringify(r.body, null, 2);
  await refresh();
});
$('ownerVerify').addEventListener('click', async () => {
  ownerToken = $('ownerToken').value;
  const r = await api('/api/whoami', { owner: true });
  $('ownerResult').textContent = JSON.stringify(r.body, null, 2);
  $('ownerToken').value = '';
  if (!r.ok) ownerToken = '';
  await refresh();
});
$('selfTest').addEventListener('click', async () => {
  if (!ownerToken) {
    $('ownerResult').textContent = 'Verify owner first. Token is held only in page memory for this session.';
    return;
  }
  const r = await api('/api/certification/selftest', { method: 'POST', owner: true });
  $('ownerResult').textContent = JSON.stringify(r.body, null, 2);
  await refresh();
});
$('integrityVerify').addEventListener('click', async () => {
  if (!ownerToken) { $('evidenceResult').textContent = 'Verify owner first.'; return; }
  const r = await api('/api/evidence/integrity', { owner: true });
  $('evidenceResult').textContent = JSON.stringify(r.body, null, 2);
  await refresh();
});
$('snapshotCapture').addEventListener('click', async () => {
  if (!ownerToken) { $('evidenceResult').textContent = 'Verify owner first.'; return; }
  const r = await api('/api/certification/snapshot', { method: 'POST', owner: true });
  $('evidenceResult').textContent = JSON.stringify(r.body, null, 2);
  await refresh();
});
$('bundleDownload').addEventListener('click', async () => {
  if (!ownerToken) { $('evidenceResult').textContent = 'Verify owner first.'; return; }
  const res = await fetch('/api/certification/bundle', { headers: { Authorization: `Bearer ${ownerToken}` } });
  if (!res.ok) { $('evidenceResult').textContent = JSON.stringify(await res.json(), null, 2); return; }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : 'MarketSphere-certification-bundle.json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  $('evidenceResult').textContent = `Downloaded ${filename}`;
  await refresh();
});

refresh().catch(e => {
  $('overall').textContent = 'DEGRADED';
  $('overall').className = 'badge fail';
  $('browserResult').textContent = `Initialization failed: ${e.message}`;
});
