import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { SchwabTosAdapter } from './adapter.mjs';

const require = createRequire(import.meta.url);
const EXTERNAL_PORT = Number(process.env.PORT || 3000);
const INTERNAL_PORT = Number(process.env.QTRUST_INTERNAL_PORT || 3002);
const adapter = new SchwabTosAdapter();
const hb = Number(process.env.SCHWAB_HEARTBEAT_STALE_MS || 45000);
const data = Number(process.env.SCHWAB_DATA_STALE_MS || 90000);
const BOOT_ID = crypto.randomUUID();
const ATTRIBUTION = 'Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale';
const certState = { browserProofAt:null, ownerAuthPassAt:null, synthMessages:0, synthSequence:0, synthAt:null };

const now = () => new Date().toISOString();
const isTrue = v => String(v || '').toLowerCase() === 'true';
const safeEqual = (a,b) => { if(!a||!b) return false; const aa=Buffer.from(String(a)),bb=Buffer.from(String(b)); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); };
const bearer = req => { const m=String(req.headers.authorization||'').match(/^Bearer\s+(.+)$/i); return m?m[1]:null; };
const ownerConfigured = () => Boolean(process.env.MS_OWNER_TOKEN);
const isOwner = req => ownerConfigured() && safeEqual(bearer(req),process.env.MS_OWNER_TOKEN);
const json = (res,code,body,rid) => { const b=Buffer.from(JSON.stringify(body)); res.writeHead(code,{'content-type':'application/json; charset=utf-8','content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'x-request-id':rid}); res.end(b); };
const text = (res,code,body,type,rid) => { const b=Buffer.from(body); res.writeHead(code,{'content-type':type,'content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy': type.startsWith('text/html') ? "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" : "default-src 'none'",'x-request-id':rid}); res.end(b); };

const certHtml = readFileSync('/tmp/marketsphere-tos/cert_index.html','utf8');
const certJs = readFileSync('/tmp/marketsphere-tos/cert_app.js','utf8');
const certCss = readFileSync('/tmp/marketsphere-tos/cert_styles.css','utf8');

function tos(req,res,path,rid){
  if(req.method!=='GET') return json(res,405,{error:'METHOD_NOT_ALLOWED'},rid);
  if(path==='/health/live') return json(res,200,{status:'live',component:'marketsphere-schwab-tos-adapter',version:'0.1.1'},rid);
  if(path==='/health/ready') return json(res,200,{status:'ready',feed_gate:adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data}).mode},rid);
  if(path==='/api/v1/feed/status') return json(res,200,adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data}),rid);
  if(path==='/api/v1/feed/proof') return json(res,adapter.state.firstDataProof?200:425,adapter.state.proof(),rid);
  if(path==='/api/v1/feed/contract') return json(res,200,{source:'SCHWAB_TOS',required_for_live:['auth=VERIFIED','subscription=ACK','socket=CONNECTED','heartbeat fresh','received data evidence'],state_machine:['DISABLED','AUTH_REQUIRED','AUTHENTICATING','CONNECTING','LIVE','DEGRADED','STALE','DISCONNECTED'],trading_authority:'NONE',production_mutation:false},rid);
  return json(res,404,{error:'NOT_FOUND'},rid);
}

function cmeStatus(){
  const credentials=isTrue(process.env.CME_CREDENTIALS_PRESENT)||isTrue(process.env.CME_ENTITLED);
  const auth=isTrue(process.env.CME_CERT_AUTHENTICATED);
  const stream=isTrue(process.env.CME_STREAM_VERIFIED);
  const heartbeat=isTrue(process.env.CME_HEARTBEAT_STABLE);
  const sequence=isTrue(process.env.CME_SEQUENCE_INTEGRITY_PASS);
  const timestamp=isTrue(process.env.CME_TIMESTAMP_INTEGRITY_PASS);
  const fully=credentials&&auth&&stream&&heartbeat&&sequence&&timestamp;
  return {source_id:'CME',connection_state:fully?'LIVE':credentials?'UNVERIFIED':'AWAITING_CREDENTIALS',certification:fully?'CERTIFIED':'NOT_CERTIFIED',source_ts:null,recv_ts:null,age_ms:null,heartbeat_age_ms:null,messages_received:null,sequence_gaps:null,provenance:'CME declaration state only; real packet evidence required',declared_gates:{credentials,auth,stream,heartbeat,sequence,timestamp}};
}
function schwabStatus(){
  const s=adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data});
  return {source_id:'SCHWAB_TOS',connection_state:s.mode,certification:s.proof_available?'EMPIRICAL_PROOF_AVAILABLE':'NOT_CERTIFIED',source_ts:null,recv_ts:s.last_data_at,age_ms:s.data_age_ms,heartbeat_age_ms:s.heartbeat_age_ms,messages_received:s.data_messages,sequence_gaps:s.sequence_gaps,provenance:'Charles Schwab Trader API adapter state machine',details:{auth:s.auth,subscription:s.subscription,socket:s.socket,events_received:s.events_received,heartbeats:s.heartbeats,reconnects:s.reconnects,proof_available:s.proof_available,trading_authority:s.trading_authority}};
}
function syntheticStatus(){ const age=certState.synthAt?Date.now()-Date.parse(certState.synthAt):null; return {source_id:'SYNTHETIC_CERT',connection_state:certState.synthMessages?'SIMULATED':'OFFLINE',certification:certState.synthMessages?'SIMULATED_PASS':'NOT_RUN',source_ts:certState.synthAt,recv_ts:certState.synthAt,age_ms:age,heartbeat_age_ms:age,messages_received:certState.synthMessages,sequence_gaps:0,provenance:'MarketSphere application-certification self-test',warning:'Synthetic evidence is never eligible for LIVE market-data certification.'}; }
function readiness(){
  const s=schwabStatus(), c=cmeStatus();
  const browserRecent=certState.browserProofAt && Date.now()-Date.parse(certState.browserProofAt)<86400000;
  const ownerRecent=certState.ownerAuthPassAt && Date.now()-Date.parse(certState.ownerAuthPassAt)<86400000;
  return {app:'MarketSphere',version:'4.5.0-cert-stage',maturity:'APPLICATION_CERTIFICATION',boot_id:BOOT_ID,gates:{runtime:'PASS',staging_storage:'EPHEMERAL',browser_interactivity:browserRecent?'PASS':'UNVERIFIED',owner_auth:ownerRecent?'PASS':ownerConfigured()?'CONFIGURED_UNVERIFIED':'NOT_CONFIGURED',schwab:s.certification,cme:c.certification,real_market_ingestion:(s.certification==='EMPIRICAL_PROOF_AVAILABLE'||c.certification==='CERTIFIED')?'EVIDENCE_PRESENT':'WAITING_EXTERNAL_SOURCE',source_quorum:'WAITING_MULTIPLE_CERTIFIED_SOURCES',t0:'LOCKED',capital_authority:'NONE'},evidence:{last_browser_proof_at:certState.browserProofAt,owner_auth_last_pass_at:certState.ownerAuthPassAt,schwab_mode:s.connection_state,schwab_messages:s.messages_received},attribution:ATTRIBUTION,generated_at:now()};
}

function cert(req,res,path,rid){
  if(req.method==='GET' && (path==='/'||path==='')) return text(res,200,certHtml,'text/html; charset=utf-8',rid);
  if(req.method==='GET' && path==='/app.js') return text(res,200,certJs,'application/javascript; charset=utf-8',rid);
  if(req.method==='GET' && path==='/styles.css') return text(res,200,certCss,'text/css; charset=utf-8',rid);
  if(req.method==='GET' && path==='/api/health') return json(res,200,{status:'ok',app:'MarketSphere',version:'4.5.0-cert-stage',boot_id:BOOT_ID,t0:'LOCKED',capital_authority:'NONE',time:now()},rid);
  if(req.method==='GET' && path==='/api/readiness') return json(res,200,readiness(),rid);
  if(req.method==='GET' && path==='/api/sources') return json(res,200,{sources:[cmeStatus(),schwabStatus(),syntheticStatus()],generated_at:now()},rid);
  if(req.method==='POST' && path==='/api/browser-proof'){ certState.browserProofAt=now(); return json(res,200,{browser_interactivity:'PASS',proof_at:certState.browserProofAt,request_id:rid},rid); }
  if(req.method==='GET' && path==='/api/whoami'){
    if(!ownerConfigured()) return json(res,503,{authenticated:false,role:'NONE',reason:'OWNER_AUTH_NOT_CONFIGURED',capital_authority:'NONE'},rid);
    if(!isOwner(req)) return json(res,401,{authenticated:false,role:'NONE',capital_authority:'NONE'},rid);
    certState.ownerAuthPassAt=now();
    return json(res,200,{authenticated:true,role:'OWNER',session_state:'ACTIVE',permissions:{configuration:true,source_promotion:true,certification_selftest:true,capital_authority:false},capital_authority:'NONE',t0:'LOCKED'},rid);
  }
  if(req.method==='POST' && path==='/api/selftest'){
    if(!isOwner(req)) return json(res,ownerConfigured()?401:503,{error:ownerConfigured()?'UNAUTHORIZED':'OWNER_AUTH_NOT_CONFIGURED'},rid);
    certState.synthMessages++; certState.synthSequence++; certState.synthAt=now();
    return json(res,200,{result:'PASS',classification:'SIMULATED',sequence:certState.synthSequence,persistence:'EPHEMERAL_STAGING',warning:'Validates application plumbing only; cannot certify a real market-data source.'},rid);
  }
  if(req.method==='POST' && path.startsWith('/api/capital')) return json(res,403,{error:'CAPITAL_AUTHORITY_DISABLED',capital_authority:'NONE',t0:'LOCKED'},rid);
  return json(res,404,{error:'NOT_FOUND'},rid);
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
  const rid=crypto.randomUUID(); const started=process.hrtime.bigint();
  const originalEnd=res.end; res.end=function(...args){ const latency=Number(process.hrtime.bigint()-started)/1e6; console.log(JSON.stringify({event:'cert_gateway_request',request_id:rid,timestamp:now(),method:req.method,path:(req.url||'').split('?')[0],status:res.statusCode||200,latency_ms:Number(latency.toFixed(3)),session_class:isOwner(req)?'OWNER':'PUBLIC',boot_id:BOOT_ID})); return originalEnd.apply(this,args); };
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/cert') return cert(req,res,'/',rid);
  if(u.pathname.startsWith('/cert/')) return cert(req,res,u.pathname.slice(5)||'/',rid);
  if(u.pathname.startsWith('/tos/')) return tos(req,res,u.pathname.slice(4)||'/',rid);
  const headers={...req.headers,host:`127.0.0.1:${INTERNAL_PORT}`};
  delete headers.authorization;
  const p=http.request({hostname:'127.0.0.1',port:INTERNAL_PORT,path:req.url,method:req.method,headers},pr=>{res.writeHead(pr.statusCode||502,pr.headers);pr.pipe(res)});
  p.on('error',()=>json(res,502,{error:'QTRUST_UPSTREAM_UNAVAILABLE'},rid)); req.pipe(p);
});

gateway.listen(EXTERNAL_PORT,'0.0.0.0',async()=>{
  await adapter.start();
  console.log(JSON.stringify({event:'qtrust_tos_cert_bridge_started',external_port:EXTERNAL_PORT,qtrust_internal_port:INTERNAL_PORT,cert_path:'/cert',tos_state:adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data}),trading_authority:'NONE',boot_id:BOOT_ID}));
});
const shutdown=()=>{adapter.stop();gateway.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref()}; process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
