'use strict';
const EXPECTED = [
  ['/api/health', 200, b => b.ok === true && b.build === '4.5.0-beta' && b.atomic_persistence === true && b.persistence_semantics === 'ATOMIC_FSYNC_RENAME_V1'],
  ['/api/global/readiness', 200, b => b.state === 'NO_LIVE_T0 / CERTIFICATION_ONLY' && b.safety?.capital_authority === 'NONE' && b.safety?.funded_order_routing === false],
  ['/api/cme/readiness', 200, b => b.tier0_authorized === false && b.build === '4.5.0-beta'],
  ['/api/durable/status', 200, b => b.state === 'PROCESS_LOCAL_SANDBOX' && b.durable === false && b.atomic_persistence === true && b.persistence_semantics === 'ATOMIC_FSYNC_RENAME_V1' && b.capital_authority === 'NONE'],
  ['/api/durable/replay', 200, b => b.state === 'DETERMINISTIC' && b.durable === false && b.capital_authority === 'NONE'],
  ['/api/quorum/status', 200, b => b.tier0_live === 0 && b.funded_order_routing === false && b.capital_authority === 'NONE'],
  ['/api/reference/status', 200, b => b.tier0_authority === false && b.capital_authority === 'NONE'],
  ['/api/cme/preflight', 200, b => b.promotion_enabled === false && b.tier0_authorized === false && b.state === 'CREDENTIALS_PENDING' && b.capital_authority === 'NONE'],
  ['/api/t0/certification', 200, b => b.promotion_enabled === false && b.state === 'LOCKED_PRE_CREDENTIAL' && b.capital_authority === 'NONE'],
  ['/api/order', 403, b => String(b.error || '').includes('locked')]
];
async function certify(){const base=`http://127.0.0.1:${process.env.PORT||3000}`,report=[];for(const [path,status,predicate] of EXPECTED){const r=await fetch(base+path,{signal:AbortSignal.timeout(3500)});const b=await r.json();const pass=r.status===status&&predicate(b);report.push({path,status:r.status,pass});if(!pass){const e=new Error(`PARITY_ASSERTION_FAILED:${path}`);e.report=report;throw e}}return report}
setTimeout(()=>{certify().then(report=>console.log(JSON.stringify({event:'MARKETSPHERE_V45_PARITY_CERT_PASS',build:'4.5.0-beta',runtime_sha256:process.env.RUNTIME_SHA256||null,persistence_semantics:'ATOMIC_FSYNC_RENAME_V1',checks:report,check_count:report.length,tier0_authorized:false,funded_order_routing:false,capital_authority:'NONE'}))).catch(err=>{console.error(JSON.stringify({event:'MARKETSPHERE_V45_PARITY_CERT_FAIL',error:err.message,report:err.report||[]}));process.exit(2)})},1500);
