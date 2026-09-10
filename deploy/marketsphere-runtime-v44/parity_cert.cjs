'use strict';

const EXPECTED = [
  ['/api/health', 200, b => b.ok === true && b.build === '4.4.0-beta'],
  ['/api/global/readiness', 200, b => b.state === 'NO_LIVE_T0 / CERTIFICATION_ONLY' && b.safety?.capital_authority === 'NONE' && b.safety?.funded_order_routing === false],
  ['/api/cme/readiness', 200, b => b.tier0_authorized === false && b.build === '4.4.0-beta'],
  ['/api/durable/status', 200, b => b.state === 'PROCESS_LOCAL_SANDBOX' && b.durable === false && b.capital_authority === 'NONE'],
  ['/api/durable/replay', 200, b => b.state === 'DETERMINISTIC' && b.durable === false && b.capital_authority === 'NONE'],
  ['/api/quorum/status', 200, b => b.tier0_live === 0 && b.funded_order_routing === false && b.capital_authority === 'NONE'],
  ['/api/reference/status', 200, b => b.tier0_authority === false && b.capital_authority === 'NONE'],
  ['/api/cme/preflight', 200, b => b.promotion_enabled === false && b.tier0_authorized === false && b.state === 'CREDENTIALS_PENDING' && b.capital_authority === 'NONE'],
  ['/api/t0/certification', 200, b => b.promotion_enabled === false && b.state === 'LOCKED_PRE_CREDENTIAL' && b.capital_authority === 'NONE'],
  ['/api/order', 403, b => String(b.error || '').includes('locked')]
];

async function certify() {
  const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const report = [];
  for (const [path, expectedStatus, predicate] of EXPECTED) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(3500) });
    const body = await response.json();
    const pass = response.status === expectedStatus && predicate(body);
    report.push({ path, status: response.status, pass });
    if (!pass) {
      const err = new Error(`PARITY_ASSERTION_FAILED:${path}`);
      err.report = report;
      throw err;
    }
  }
  return report;
}

setTimeout(() => {
  certify()
    .then(report => {
      console.log(JSON.stringify({
        event: 'MARKETSPHERE_V44_PARITY_CERT_PASS',
        build: '4.4.0-beta',
        checks: report,
        check_count: report.length,
        tier0_authorized: false,
        funded_order_routing: false,
        capital_authority: 'NONE'
      }));
    })
    .catch(err => {
      console.error(JSON.stringify({
        event: 'MARKETSPHERE_V44_PARITY_CERT_FAIL',
        error: err.message,
        report: err.report || []
      }));
      process.exit(2);
    });
}, 1500);
