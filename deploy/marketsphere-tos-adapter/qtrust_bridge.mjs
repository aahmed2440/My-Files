import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { SchwabTosAdapter } from './adapter.mjs';

const require = createRequire(import.meta.url);
const EXTERNAL_PORT = Number(process.env.PORT || 3000);
const INTERNAL_PORT = Number(process.env.QTRUST_INTERNAL_PORT || 3002);
const adapter = new SchwabTosAdapter();
const hb = Number(process.env.SCHWAB_HEARTBEAT_STALE_MS || 45000);
const data = Number(process.env.SCHWAB_DATA_STALE_MS || 90000);
const json = (res,code,body) => { const b=Buffer.from(JSON.stringify(body)); res.writeHead(code,{'content-type':'application/json; charset=utf-8','content-length':b.length,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}); res.end(b); };

function tos(req,res,path){
  if(req.method!=='GET') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(path==='/health/live') return json(res,200,{status:'live',component:'marketsphere-schwab-tos-adapter',version:'0.1.1'});
  if(path==='/health/ready') return json(res,200,{status:'ready',feed_gate:adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data}).mode});
  if(path==='/api/v1/feed/status') return json(res,200,adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data}));
  if(path==='/api/v1/feed/proof') return json(res,adapter.state.firstDataProof?200:425,adapter.state.proof());
  if(path==='/api/v1/feed/contract') return json(res,200,{source:'SCHWAB_TOS',required_for_live:['auth=VERIFIED','subscription=ACK','socket=CONNECTED','heartbeat fresh','received data evidence'],state_machine:['DISABLED','AUTH_REQUIRED','AUTHENTICATING','CONNECTING','LIVE','DEGRADED','STALE','DISCONNECTED'],trading_authority:'NONE',production_mutation:false});
  return json(res,404,{error:'NOT_FOUND'});
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
  const headers={...req.headers,host:`127.0.0.1:${INTERNAL_PORT}`};
  const p=http.request({hostname:'127.0.0.1',port:INTERNAL_PORT,path:req.url,method:req.method,headers},pr=>{res.writeHead(pr.statusCode||502,pr.headers);pr.pipe(res)});
  p.on('error',()=>json(res,502,{error:'QTRUST_UPSTREAM_UNAVAILABLE'})); req.pipe(p);
});

gateway.listen(EXTERNAL_PORT,'0.0.0.0',async()=>{
  await adapter.start();
  console.log(JSON.stringify({event:'qtrust_tos_bridge_started',external_port:EXTERNAL_PORT,qtrust_internal_port:INTERNAL_PORT,tos_state:adapter.state.snapshot({heartbeatStaleMs:hb,dataStaleMs:data}),trading_authority:'NONE'}));
});
const shutdown=()=>{adapter.stop();gateway.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref()}; process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
