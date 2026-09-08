import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const VERSION = 'recovery-2026.09.08';
const ATTRIBUTION = 'Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.';

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};

function json(res, status, body) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

const status = () => ({
  status: 'ready',
  product: 'CryptoSphere',
  runtime: 'RAILWAY_RECOVERY_SHELL',
  version: VERSION,
  owner_console: { state: 'RECOVERY_UI_READY', full_runtime_promoted: false },
  analytical_core: { state: 'VALIDATED_ARTIFACT_PENDING_SOURCE_REPAIR', version_target: '0.90.1', mode: 'ADVISORY_ONLY', full_runtime_promoted: false },
  validated_artifacts: {
    owner_sha256: '6d58d4023eedbf319a162f15541628c512acb9751a06d47dcc049d5d988dd146',
    core_sha256: 'bc2c527f358174715b569c32f10d9a28f85d8d8724fcbae407963c9922a1b997'
  },
  production_execution: false,
  production_mutation: false,
  arbitrary_scanning: false,
  human_governance_required: true,
  full_runtime_certified: false,
  attribution: ATTRIBUTION,
  time: new Date().toISOString()
});

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CryptoSphere Recovery</title><style>body{margin:0;background:#071521;color:#e9f1f7;font:14px system-ui}.w{max-width:960px;margin:auto;padding:22px}.p{background:#0d2030;border:1px solid #29465c;border-radius:14px;padding:18px;margin:14px 0}.tag{display:inline-block;border:1px solid #5d7f98;border-radius:999px;padding:5px 9px}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.k{background:#091a27;border:1px solid #233d51;border-radius:10px;padding:12px}.k small{display:block;color:#8ba6b9}.f{text-align:center;color:#8ba6b9;font-size:11px;margin-top:20px}@media(max-width:700px){.g{grid-template-columns:1fr}}</style></head><body><div class="w"><div class="p"><span class="tag">CONTROLLED RECOVERY</span><h1>CryptoSphere</h1><p>Railway availability recovery shell. The validated Owner and Analytical Core artifacts are preserved but are not represented as live until the source-package repair is completed and verified.</p></div><div class="g"><div class="k"><small>Railway runtime</small><b>READY</b></div><div class="k"><small>Analytical Core</small><b>PENDING SOURCE REPAIR</b></div><div class="k"><small>Execution authority</small><b>NONE</b></div><div class="k"><small>Human governance</small><b>REQUIRED</b></div></div><div class="p"><b>Boundary</b><p>Service availability ≠ full analytical-core restoration ≠ production certification. No arbitrary scanning, autonomous remediation, credential collection, or production mutation is enabled.</p></div><div class="f">${ATTRIBUTION}</div></div></body></html>`;

http.createServer((req, res) => {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  if (path === '/health' || path === '/api/health') return json(res, 200, status());
  if (path === '/api/status') return json(res, 200, status());
  if (path.startsWith('/api/')) return json(res, 404, { status: 'NOT_FOUND' });
  res.writeHead(200, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(PORT, '0.0.0.0', () => console.log(JSON.stringify({ event: 'cryptosphere_recovery_ready', port: PORT, version: VERSION, production_execution: false })));
