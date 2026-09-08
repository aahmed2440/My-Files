import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 8080);
const OWNER_PORT = 3001;
const CORE_PORT = 8001;
const CORE_PYTHON = process.env.CORE_PYTHON || 'python3';
const OWNER_DIR = process.env.CRYPTOSPHERE_OWNER_DIR || '/app/owner';
const CORE_DIR = process.env.CRYPTOSPHERE_CORE_DIR || '/app/core';

const children = [];
function launch(command, args, options={}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  children.push(child);
  child.on('exit', (code, signal) => {
    console.error(JSON.stringify({event:'child_exit', command, code, signal}));
    if (!signal && code !== 0) process.exitCode = 1;
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
      const chunks=[]; res.on('data',c=>chunks.push(c));
      res.on('end',()=>{try{resolve({ok:res.statusCode===200,statusCode:res.statusCode,json:JSON.parse(Buffer.concat(chunks).toString('utf8'))})}catch{resolve({ok:false,statusCode:res.statusCode})}});
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
  const headers={...req.headers, host:`127.0.0.1:${targetPort}`};
  delete headers['content-length'];
  const p=http.request({host:'127.0.0.1',port:targetPort,path:targetPath,method:req.method,headers}, upstream=>{
    res.statusCode=upstream.statusCode||502;
    for (const [k,v] of Object.entries(upstream.headers)) if(v!==undefined && !['connection','transfer-encoding'].includes(k.toLowerCase())) res.setHeader(k,v);
    gatewayHeaders(res);
    upstream.pipe(res);
  });
  p.on('error',()=>{
    if(res.headersSent){res.destroy();return}
    res.statusCode=502; gatewayHeaders(res); res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({status:'UPSTREAM_UNAVAILABLE'}));
  });
  req.pipe(p);
}

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url||'/','http://gateway.local');
  if(u.pathname==='/health') return health(res);
  if(u.pathname==='/core') { res.statusCode=308; res.setHeader('Location','/core/'); gatewayHeaders(res); return res.end(); }
  if(u.pathname.startsWith('/core/')) {
    const stripped=u.pathname.slice('/core'.length) || '/';
    return proxy(req,res,CORE_PORT,stripped+u.search);
  }
  return proxy(req,res,OWNER_PORT,u.pathname+u.search);
});

server.listen(PORT,'0.0.0.0',()=>console.log(JSON.stringify({event:'gateway_listening',port:PORT,owner_port:OWNER_PORT,core_port:CORE_PORT})));

function shutdown(){
  server.close(()=>process.exit(0));
  for(const c of children) if(!c.killed) c.kill('SIGTERM');
  setTimeout(()=>process.exit(0),3000).unref();
}
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
