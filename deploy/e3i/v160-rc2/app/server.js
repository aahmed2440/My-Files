const http=require("http"),fs=require("fs"),path=require("path"),{performance}=require("perf_hooks");
const port=Number(process.env.PORT||8080);
const html=fs.readFileSync(path.join(__dirname,"..","public","index.html"));
const css=fs.readFileSync(path.join(__dirname,"..","public","style.css"));
const truth=v=>String(v??"false").toLowerCase()==="true";

const MAX_URL_LENGTH=2048;
const RATE_WINDOW_MS=60000;
const RATE_LIMIT=120;
const MAX_BUCKETS=10000;
const buckets=new Map();

function cleanPath(raw){
  return String(raw||"/").split("?",1)[0].slice(0,256);
}
function clientKey(req){
  const xff=String(req.headers["x-forwarded-for"]||"").split(",").map(x=>x.trim()).filter(Boolean);
  return xff.length ? xff[xff.length-1] : String(req.socket.remoteAddress||"unknown");
}
function pruneBuckets(now){
  if(buckets.size<MAX_BUCKETS) return;
  for(const [k,v] of buckets){
    if(now-v.start>=RATE_WINDOW_MS) buckets.delete(k);
  }
  while(buckets.size>=MAX_BUCKETS){
    const first=buckets.keys().next();
    if(first.done) break;
    buckets.delete(first.value);
  }
}
function securityEvent(kind,req,extra={}){
  console.log(JSON.stringify({
    event:"security_event",
    kind,
    release:process.env.E3I_RELEASE||"v160-rc2",
    method:req.method,
    path:cleanPath(req.url),
    ...extra
  }));
}
function productionState(){
  const gates={
    LIVE_IDP_MFA:truth(process.env.E3I_IDENTITY_GATE_LIVE),
    SECRET_MANAGER_LIVE:truth(process.env.E3I_SECRET_MANAGER_LIVE),
    MANAGED_POSTGRES_LIVE:truth(process.env.E3I_MANAGED_POSTGRES_LIVE),
    MIGRATION_APPLIED:truth(process.env.E3I_MIGRATION_APPLIED),
    SERVER_AUDIT_LIVE:truth(process.env.E3I_SERVER_AUDIT_LIVE),
    BACKUP_RESTORE_VALIDATED:truth(process.env.E3I_BACKUP_RESTORE_VALIDATED),
    VULNERABILITY_SCAN_PASS:truth(process.env.E3I_VULNERABILITY_SCAN_PASS),
    INDEPENDENT_SECURITY_REVIEW:truth(process.env.E3I_SECURITY_REVIEW_COMPLETE),
    PRODUCTION_RELEASE_APPROVED:truth(process.env.E3I_PRODUCTION_RELEASE_APPROVED)
  };
  const failed=Object.entries(gates).filter(([,v])=>!v).map(([k])=>k);
  const freeze=truth(process.env.E3I_RELEASE_FREEZE??"true");
  return {ready:failed.length===0&&!freeze,failed,freeze};
}
const headers={
 "content-security-policy":"default-src 'none'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
 "strict-transport-security":"max-age=31536000",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer",
 "x-frame-options":"DENY",
 "permissions-policy":"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
 "cross-origin-opener-policy":"same-origin",
 "cross-origin-resource-policy":"same-origin",
 "cache-control":"no-store",
 "x-robots-tag":"noindex, nofollow, noarchive"
};
function send(req,res,status,type,body,extra={}){
  res.writeHead(status,{...headers,"content-type":type,...extra});
  if(req.method==="HEAD") return res.end();
  res.end(body);
}
function checkRate(req,res){
  const now=Date.now();
  pruneBuckets(now);
  const key=clientKey(req);
  let b=buckets.get(key);
  if(!b||now-b.start>=RATE_WINDOW_MS){b={start:now,count:0};buckets.set(key,b);}
  b.count++;
  if(b.count>RATE_LIMIT){
    securityEvent("RATE_LIMIT",req,{count:b.count});
    send(req,res,429,"application/json",JSON.stringify({status:"blocked",reason:"RATE_LIMIT"}),{"retry-after":"60"});
    return false;
  }
  return true;
}
function rejectUnsupportedBody(req,res){
  const te=req.headers["transfer-encoding"];
  const rawLen=req.headers["content-length"];
  if(te){
    securityEvent("BODY_NOT_ALLOWED",req,{reason:"TRANSFER_ENCODING"});
    send(req,res,400,"application/json",JSON.stringify({status:"blocked",reason:"BODY_NOT_ALLOWED"}));
    return true;
  }
  if(rawLen!==undefined){
    if(!/^\d+$/.test(String(rawLen))){
      securityEvent("INVALID_CONTENT_LENGTH",req);
      send(req,res,400,"application/json",JSON.stringify({status:"blocked",reason:"INVALID_CONTENT_LENGTH"}));
      return true;
    }
    if(Number(rawLen)>0){
      securityEvent("BODY_NOT_ALLOWED",req,{content_length:Number(rawLen)});
      send(req,res,400,"application/json",JSON.stringify({status:"blocked",reason:"BODY_NOT_ALLOWED"}));
      return true;
    }
  }
  return false;
}

const server=http.createServer((req,res)=>{
  const started=performance.now();
  const rel=process.env.E3I_RELEASE||"v160-rc2";
  let status=404;

  if(String(req.url||"").length>MAX_URL_LENGTH){
    status=414; securityEvent("URL_TOO_LONG",req);
    send(req,res,status,"application/json",JSON.stringify({status:"blocked",reason:"URL_TOO_LONG"}));
    return;
  }
  if(req.method!=="GET"&&req.method!=="HEAD"){
    status=405; securityEvent("METHOD_NOT_ALLOWED",req);
    send(req,res,status,"application/json",JSON.stringify({status:"blocked",reason:"METHOD_NOT_ALLOWED"}),{"allow":"GET, HEAD"});
    return;
  }
  if(rejectUnsupportedBody(req,res)) return;
  if(!checkRate(req,res)) return;

  const hosted=truth(process.env.E3I_HOSTED_BETA_ENABLED);
  const freeze=truth(process.env.E3I_RELEASE_FREEZE??"true");
  const pstate=productionState();

  if(req.url==="/health"){
    status=200;send(req,res,status,"application/json",JSON.stringify({status:"ok",release:rel}));
  } else if(req.url==="/ready"){
    status=pstate.ready?200:503;
    send(req,res,status,"application/json",JSON.stringify({
      status:pstate.ready?"ready":"not_ready",
      release:rel,
      production_ready:pstate.ready
    }));
  } else if(req.url==="/version"){
    status=200;send(req,res,status,"application/json",JSON.stringify({release:rel}));
  } else if(req.url==="/meta"){
    status=200;send(req,res,status,"application/json",JSON.stringify({
      release:rel,
      scientific_state:"SOFTWARE_READY_PRE_EMPIRICAL",
      empirical_sessions:"0/5",
      physical_authority:"NONE",
      deployment_authority:"NONE",
      production_ready:pstate.ready
    }));
  } else if(req.url==="/robots.txt"){
    status=200;send(req,res,status,"text/plain; charset=utf-8","User-agent: *\nDisallow: /\n");
  } else if(req.url==="/favicon.ico"){
    status=204;send(req,res,status,"image/x-icon","");
  } else if(req.url==="/style.css"){
    status=200;send(req,res,status,"text/css; charset=utf-8",css);
  } else if(req.url==="/beta"){
    if(!hosted){status=403;send(req,res,status,"application/json",JSON.stringify({status:"blocked",reason:"HOSTED_BETA_DISABLED"}));}
    else if(freeze){status=423;send(req,res,status,"application/json",JSON.stringify({status:"blocked",reason:"RELEASE_FROZEN"}));}
    else {status=501;send(req,res,status,"application/json",JSON.stringify({status:"not_implemented",reason:"IDENTITY_GATE_REQUIRED"}));}
  } else if(req.url==="/"||req.url==="/index.html"){
    status=200;send(req,res,status,"text/html; charset=utf-8",html);
  } else {
    status=404;send(req,res,status,"text/plain; charset=utf-8","Not Found");
  }

  console.log(JSON.stringify({
    event:"http_request",
    release:rel,
    method:req.method,
    path:cleanPath(req.url),
    status,
    duration_ms:Number((performance.now()-started).toFixed(2))
  }));
});

server.headersTimeout=10000;
server.requestTimeout=10000;
server.keepAliveTimeout=5000;
server.maxHeadersCount=50;
server.listen(port,"0.0.0.0",()=>console.log(JSON.stringify({event:"startup",release:process.env.E3I_RELEASE||"v160-rc2",port})));
