'use strict';
const http=require('node:http');
const os=require('node:os');
const PORT=Number(process.env.PORT||8787);
const HOST=process.env.HOST||'0.0.0.0';
const started=Date.now();
const version='railway-recovery-2026-09-08';
const attribution='Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.';
function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body)}
const server=http.createServer((req,res)=>{
  const path=(req.url||'/').split('?')[0];
  if(path==='/api/live') return json(res,200,{ok:true,service:'TransitSphere Railway Recovery Runtime',version,uptimeSeconds:Math.floor((Date.now()-started)/1000),host:os.hostname(),time:new Date().toISOString()});
  if(path==='/api/ready') return json(res,200,{ok:true,serviceReady:true,productionCertified:false,version,mode:'SANITIZED_RECOVERY_STAGING',persistence:'NOT_CONFIGURED',operationalData:'NONE',externalConnectors:'DISABLED',edgeTelemetry:'DISABLED',checks:[{control:'Runtime',status:'PASS'},{control:'Railway ingress',status:'PASS'},{control:'Operational data',status:'PASS',detail:'No MTA operational data embedded'},{control:'Persistent storage',status:'WARN',detail:'Persistent /app/data volume not yet mounted'},{control:'Full TransitSphere source',status:'WARN',detail:'Validated v11.6.1 candidate intentionally withheld from public source repository'}]});
  if(path==='/api/health') return json(res,200,{ok:true,version,productionCertified:false});
  if(path==='/'){
    const body=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TransitSphere Railway Recovery</title><style>body{font-family:system-ui;margin:0;background:#0c1117;color:#e8eef5}main{max-width:860px;margin:8vh auto;padding:32px}.card{border:1px solid #334155;border-radius:16px;padding:28px;background:#111827}h1{margin-top:0}.ok{color:#7dd3fc}.warn{color:#fbbf24}code{background:#1f2937;padding:3px 7px;border-radius:6px}footer{margin-top:28px;color:#94a3b8;font-size:13px}</style></head><body><main><div class="card"><h1>TransitSphere — Railway Recovery</h1><p class="ok"><strong>RUNTIME ALIVE</strong></p><p>This is a sanitized recovery staging runtime. It contains no operational fleet data and has no external system connectors enabled.</p><p><span class="warn">Persistence gate remains open:</span> mount durable storage before accepting operational evidence.</p><p>Health: <code>/api/live</code> &nbsp; Readiness: <code>/api/ready</code></p><footer>${attribution}</footer></div></main></body></html>`;
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','x-content-type-options':'nosniff'});return res.end(body);
  }
  json(res,404,{error:'Not found'});
});
server.listen(PORT,HOST,()=>console.log(JSON.stringify({event:'listening',service:'TransitSphere Railway Recovery Runtime',host:HOST,port:PORT,version,time:new Date().toISOString()})));
