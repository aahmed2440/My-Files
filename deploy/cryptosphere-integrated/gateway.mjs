import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8080);
const OWNER_PORT = 3001;
const CORE_PORT = 8001;
const CORE_PYTHON = process.env.CORE_PYTHON || 'python3';
const OWNER_DIR = process.env.CRYPTOSPHERE_OWNER_DIR || '/app/owner';
const CORE_DIR = process.env.CRYPTOSPHERE_CORE_DIR || '/app/core';
const UPSTREAM_TIMEOUT_MS = 10000;
const HOP_BY_HOP = new Set([
  'connection','keep-alive','proxy-authenticate','proxy-authorization',
  'te','trailer','transfer-encoding','upgrade'
]);

const children = [];
let server;
let shuttingDown = false;

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

function failFast(reason, details={}) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(JSON.stringify({event:'gateway_fail_fast', reason, ...details}));
  stopChildren();
  if (server) server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 1500).unref();
}

function launch(command, args, options={}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.push(child);
  child.on('error', error => {
    failFast('child_spawn_error', {command, message:error.message});
  });
  child.on('exit', (code, signal) => {
    console.error(JSON.stringify({event:'child_exit', command, code, signal}));
    if (!shuttingDown) failFast('child_exit', {command, code, signal});
  });
  return child;
}

launch('node', ['server.mjs'], {
  cwd: OWNER_DIR,
  env: {...process.env, PORT: String(OWNER_PORT)}
});
launch(CORE_PYTHON, ['-m','uvicorn','server:app','--host','127.0.0.1','--port',String(CORE_PORT)], {
  cwd: CORE_DIR,
  env: {...process.env, CRYPTOSPHERE_CORE_MODE:'ADVISORY_ONLY'}
});

function requestJson(port, path, timeout=1800) {
  return new Promise(resolve => {
    const req=http.request({host:'127.0.0.1',port,path,method:'GET',timeout}, res=>{
      const chunks=[];
      res.on('data',c=>chunks.push(c));
      res.on('end',()=>{
        try {
          resolve({ok:res.statusCode===200,statusCode:res.statusCode,json:JSON.parse(Buffer.concat(chunks).toString('utf8'))});
        } catch {
          resolve({ok:false,statusCode:res.statusCode});
        }
      });
    });
    req.on('timeout',()=>req.destroy(new Error('timeout')));
    req.on('error',()=>resolve({ok:false,statusCode:0}));
    req.end();
  });
}

function gatewayHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security','max-age=31536000');
}

function sanitizedRequestHeaders(reqHeaders,targetPort) {
  const headers={};
  for (const [k,v] of Object.entries(reqHeaders)) {
    if (v!==undefined && !HOP_BY_HOP.has(k.toLowerCase())) headers[k]=v;
  }
  headers.host=`127.0.0.1:${targetPort}`;
  return headers;
}

function copyResponseHeaders(upstream,res) {
  for (const [k,v] of Object.entries(upstream.headers)) {
    if (v!==undefined && !HOP_BY_HOP.has(k.toLowerCase())) res.setHeader(k,v);
  }
}

async function health(res) {
  const [owner, core] = await Promise.all([
    requestJson(OWNER_PORT,'/api/health'),
    requestJson(CORE_PORT,'/health/ready')
  ]);
  const ready = owner.ok && core.ok && core.json?.status === 'ready';
  res.statusCode = ready ? 200 : 503;
  gatewayHeaders(res);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify({
    status: ready ? 'ready' : 'not_ready',
    product:'CryptoSphere',
    owner_console:{version:'1.4.1',ready:owner.ok},
    analytical_core:{version:'0.90.1',ready:core.ok,mode:'ADVISORY_ONLY'},
    production_execution:false,
    human_governance_required:true
  }));
}

function proxy(req,res,targetPort,targetPath) {
  const p=http.request({
    host:'127.0.0.1',
    port:targetPort,
    path:targetPath,
    method:req.method,
    headers:sanitizedRequestHeaders(req.headers,targetPort)
  }, upstream=>{
    res.statusCode=upstream.statusCode||502;
    copyResponseHeaders(upstream,res);
    gatewayHeaders(res);
    upstream.pipe(res);
  });
  p.setTimeout(UPSTREAM_TIMEOUT_MS,()=>p.destroy(new Error('upstream_timeout')));
  p.on('error',error=>{
    if(res.headersSent){res.destroy();return;}
    res.statusCode=error.message==='upstream_timeout'?504:502;
    gatewayHeaders(res);
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify({status:error.message==='upstream_timeout'?'UPSTREAM_TIMEOUT':'UPSTREAM_UNAVAILABLE'}));
  });
  req.on('aborted',()=>p.destroy(new Error('client_aborted')));
  req.pipe(p);
}

server=http.createServer(async(req,res)=>{
  let u;
  try {
    u=new URL(req.url||'/','http://gateway.local');
  } catch {
    res.statusCode=400;
    gatewayHeaders(res);
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({status:'INVALID_REQUEST_TARGET'}));
  }
  if(u.pathname==='/health') return health(res);
  if(u.pathname==='/core') {
    res.statusCode=308;
    res.setHeader('Location','/core/');
    gatewayHeaders(res);
    return res.end();
  }
  if(u.pathname.startsWith('/core/')) {
    const stripped=u.pathname.slice('/core'.length) || '/';
    return proxy(req,res,CORE_PORT,stripped+u.search);
  }
  return proxy(req,res,OWNER_PORT,u.pathname+u.search);
});

server.headersTimeout=10000;
server.requestTimeout=15000;
server.keepAliveTimeout=5000;
server.maxHeadersCount=64;
server.listen(PORT,'0.0.0.0',()=>console.log(JSON.stringify({event:'gateway_listening',port:PORT,owner_port:OWNER_PORT,core_port:CORE_PORT})));

function shutdown(){
  if (shuttingDown) return;
  shuttingDown=true;
  stopChildren();
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0),3000).unref();
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
