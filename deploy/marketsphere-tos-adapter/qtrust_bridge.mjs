import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { SchwabTosAdapter } from './adapter.mjs';

const EXTERNAL_PORT = Number(process.env.PORT || 3000);
const INTERNAL_PORT = Number(process.env.QTRUST_INTERNAL_PORT || 3002);
const EXPOSE_DIAGNOSTICS = /^true$/i.test(process.env.TOS_EXPOSE_DIAGNOSTICS ?? 'false');
const TRUST_FORWARD_HEADERS = /^true$/i.test(process.env.QTRUST_BRIDGE_TRUST_FORWARD_HEADERS ?? 'false');
const adapter = new SchwabTosAdapter();
const hb = Number(process.env.SCHWAB_HEARTBEAT_STALE_MS || 45000);
const data = Number(process.env.SCHWAB_DATA_STALE_MS || 90000);
const VERSION = '0.2.0-cert';
const CANDIDATE_SCHEMA_VERSION = 1;

const SOURCE_CONTRACT = {
  candidate_schema_version:CANDIDATE_SCHEMA_VERSION,
  source:'SCHWAB_TOS',
  provider:'Charles Schwab Trader API',
  evidence_classification:'EMPIRICAL_MARKET_SOURCE_EVIDENCE_CANDIDATE',
  required_for_governed_review:[
    'auth=VERIFIED','subscription=ACK','socket=CONNECTED','first market-data evidence','heartbeat fresh',
    'realtime_status=REALTIME_OBSERVED','entitlement=VERIFIED','timestamp_integrity=VERIFIED','continuity=VERIFIED',
    'sequence_gaps=0 when provider continuity mechanism supports sequence semantics'
  ],
  automatic_live_promotion:false,
  trading_authority:'NONE',
  production_mutation:false
};

function securityHeaders() {
  const headers = {
    'cache-control':'no-store',
    'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  };
  if (process.env.NODE_ENV === 'production') headers['strict-transport-security'] = 'max-age=31536000';
  return headers;
}

const json = (res,code,body) => {
  const b=Buffer.from(JSON.stringify(body));
  res.writeHead(code,{'content-type':'application/json; charset=utf-8','content-length':b.length,...securityHeaders()});
  res.end(b);
};

function tos(req,res,path){
  if(req.method!=='GET') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(path==='/health/live') return json(res,200,{status:'live',component:'marketsphere-schwab-tos-adapter',version:VERSION,candidate_schema_version:CANDIDATE_SCHEMA_VERSION});
  if(path==='/health/ready') {
    const mode=adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data}).mode;
    return json(res,200,{status:'ready',feed_gate:mode,candidate_schema_version:CANDIDATE_SCHEMA_VERSION,source_certification_eligible:mode==='ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW',automatic_live_promotion:false});
  }
  if(!EXPOSE_DIAGNOSTICS && path.startsWith('/api/v1/feed/')) return json(res,403,{error:'DIAGNOSTICS_DISABLED'});
  if(path==='/api/v1/feed/status') return json(res,200,adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data}));
  if(path==='/api/v1/feed/proof') return json(res,adapter.state.firstDataProof?200:425,adapter.state.proof({heartbeatStaleMs:hb,dataStaleMs:data}));
  if(path==='/api/v1/feed/contract') return json(res,200,SOURCE_CONTRACT);
  return json(res,404,{error:'NOT_FOUND'});
}

function sanitizeProxyHeaders(input) {
  const headers={...input,host:`127.0.0.1:${INTERNAL_PORT}`};
  if (!TRUST_FORWARD_HEADERS) {
    for (const name of ['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-forwarded-port','x-real-ip','cf-connecting-ip','true-client-ip']) delete headers[name];
  }
  return headers;
}

process.env.PORT=String(INTERNAL_PORT);
try {
  const html=gunzipSync(Buffer.from(process.env.HTML_GZ_B64,'base64')).toString();
  process.env.HTML_B64=Buffer.from(html).toString('base64');
  eval(gunzipSync(Buffer.from(process.env.SERVER_GZ_B64,'base64')).toString());
} catch(e) {
  console.error(JSON.stringify({event:'qtrust_boot_failed',code:e?.name||'ERROR'})); process.exit(1);
}

const gateway=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname.startsWith('/tos/')) return tos(req,res,u.pathname.slice(4)||'/');
  const headers=sanitizeProxyHeaders(req.headers);
  const p=http.request({hostname:'127.0.0.1',port:INTERNAL_PORT,path:req.url,method:req.method,headers},pr=>{
    const upstreamHeaders={...pr.headers,...securityHeaders()};
    res.writeHead(pr.statusCode||502,upstreamHeaders);
    pr.pipe(res);
  });
  p.on('error',()=>json(res,502,{error:'QTRUST_UPSTREAM_UNAVAILABLE'})); req.pipe(p);
});

gateway.listen(EXTERNAL_PORT,'0.0.0.0',async()=>{
  await adapter.start();
  const state=adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data});
  console.log(JSON.stringify({event:'qtrust_tos_bridge_started',version:VERSION,candidate_schema_version:CANDIDATE_SCHEMA_VERSION,external_port:EXTERNAL_PORT,qtrust_internal_port:INTERNAL_PORT,feed_mode:state.mode,trading_authority:'NONE',automatic_live_promotion:false,production_mutation:false}));
});
const shutdown=()=>{adapter.stop();gateway.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref()}; process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
