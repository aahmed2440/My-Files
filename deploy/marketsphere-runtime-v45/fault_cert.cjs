'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const RUNTIME_SHA='98ec1321cd0bc1f9b6ea3eb6f80b94e9ea882672abadee2067b9d31c77903724';
const ROOT='/data/marketsphere';
const CLEAN=path.join(ROOT,'v45-store');
const PROOF=path.join(ROOT,'v45-proof.json');
const MODE=process.env.FAULT_MODE||'wal_corrupt';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function die(code,reason,details={}){console.error(JSON.stringify({event:'MARKETSPHERE_V45_FAULT_CERT_FAIL',mode:MODE,code,reason,...details}));process.exit(code)}
function copyClean(dst){if(!fs.existsSync(CLEAN))die(91,'CLEAN_STORE_MISSING');fs.rmSync(dst,{recursive:true,force:true});fs.cpSync(CLEAN,dst,{recursive:true});}
function fsyncWrite(file,data,flags='w'){const fd=fs.openSync(file,flags,0o600);try{fs.writeSync(fd,data,null,'utf8');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function runtimeBytes(){const b64=fs.readFileSync('/app/runtime.gz.b64','utf8').trim();const r=zlib.gunzipSync(Buffer.from(b64,'base64'));if(sha(r)!==RUNTIME_SHA)die(78,'RUNTIME_SHA_MISMATCH',{actual:sha(r)});return r}
function boot(store){process.env.DURABLE_BACKEND='FILESYSTEM_VOLUME';process.env.DURABLE_STORE_PATH=store;const p='/tmp/marketsphere-v45-fault.cjs';fs.writeFileSync(p,runtimeBytes());require(p)}
async function get(p){const r=await fetch('http://127.0.0.1:'+(process.env.PORT||3000)+p,{signal:AbortSignal.timeout(5000)});let j={};try{j=await r.json()}catch{}return{status:r.status,body:j}}
function govEnv(){if(process.env.T0_PROMOTION_ENABLED!=='false'||process.env.CAPITAL_AUTHORITY!=='NONE')die(80,'GOVERNANCE_ENV_BLOCK')}
async function assertBlocked(extra){const d=await get('/api/durable/status'),rp=await get('/api/durable/replay'),t=await get('/api/t0/certification'),o=await get('/api/order');if(d.status!==200||d.body.state!=='BLOCK'||d.body.durable!==true||d.body.backend!=='FILESYSTEM_VOLUME'||d.body.capital_authority!=='NONE')die(101,'BLOCK_STATUS_FAILED',{d});if(extra&&!extra(d.body))die(102,'BLOCK_EXTRA_ASSERTION_FAILED',{d});if(rp.status!==409||rp.body.state!=='BLOCK'||rp.body.capital_authority!=='NONE')die(103,'BLOCK_REPLAY_FAILED',{rp});if(t.status!==200||t.body.state!=='LOCKED_PRE_CREDENTIAL'||t.body.promotion_enabled!==false||t.body.capital_authority!=='NONE')die(104,'T0_FAILED',{t});if(o.status!==403)die(105,'ORDER_NOT_LOCKED',{o});console.log(JSON.stringify({event:'MARKETSPHERE_V45_FAULT_CERT_PASS',mode:MODE,result:'BLOCK_DETECTED',capital_authority:'NONE'}))}
async function assertClean(store,tmpName){if(!fs.existsSync(PROOF))die(111,'PROOF_MISSING');const prior=JSON.parse(fs.readFileSync(PROOF,'utf8'));const d=await get('/api/durable/status'),rp=await get('/api/durable/replay'),t=await get('/api/t0/certification'),o=await get('/api/order');if(d.status!==200||d.body.state!=='DURABLE_VERIFIED'||d.body.atomic_persistence!==true||d.body.persistence_semantics!=='ATOMIC_FSYNC_RENAME_V1'||d.body.events!==2400||d.body.capital_authority!=='NONE')die(112,'CLEAN_STATUS_FAILED',{d});for(const k of ['store_instance_id','replay_digest','events','checkpoint_hash','accepted','quarantine','dead'])if(prior[k]!==d.body[k])die(113,'PROOF_MISMATCH',{field:k,prior:prior[k],current:d.body[k]});if(rp.status!==200||rp.body.state!=='DETERMINISTIC'||rp.body.digest!==d.body.replay_digest||rp.body.store_instance_id!==d.body.store_instance_id||rp.body.checkpoint_hash!==d.body.checkpoint_hash)die(114,'CLEAN_REPLAY_FAILED',{rp});if(t.body.state!=='LOCKED_PRE_CREDENTIAL'||t.body.promotion_enabled!==false||t.body.capital_authority!=='NONE'||o.status!==403)die(115,'GOVERNANCE_FAILED',{t,o});if(tmpName&&!fs.existsSync(path.join(store,tmpName)))die(116,'EXPECTED_ORPHAN_TEMP_MISSING',{tmpName});console.log(JSON.stringify({event:'MARKETSPHERE_V45_FAULT_CERT_PASS',mode:MODE,result:'LAST_COMMITTED_STATE_RECOVERED',orphan_temp:tmpName||null,capital_authority:'NONE'}))}
async function main(){govEnv();
 if(MODE==='wal_corrupt'){
  const dst=path.join(ROOT,'v45-fault-wal');copyClean(dst);const wal=path.join(dst,'evidence.wal.jsonl');const lines=fs.readFileSync(wal,'utf8').split(/\n/);const i=lines.findIndex(Boolean);if(i<0)die(92,'EMPTY_WAL');const row=JSON.parse(lines[i]);row.prev_hash='FAULT_INJECTED_PREV_HASH';lines[i]=JSON.stringify(row);fs.writeFileSync(wal,lines.join('\n'));boot(dst);return setTimeout(()=>assertBlocked(b=>b.invariants?.WAL_CHAIN_INTEGRITY===false).catch(e=>die(120,'UNHANDLED',{error:e.message})),1800);
 }
 if(MODE==='wal_torn_final'){
  const dst=path.join(ROOT,'v45-torn-wal-final');copyClean(dst);fsyncWrite(path.join(dst,'evidence.wal.jsonl'),'{"seq":2401,"id":"TORN_FINAL"','a');boot(dst);return setTimeout(()=>assertBlocked().catch(e=>die(121,'UNHANDLED',{error:e.message})),1800);
 }
 if(MODE==='checkpoint_torn_final'){
  const dst=path.join(ROOT,'v45-torn-checkpoint-final');copyClean(dst);fsyncWrite(path.join(dst,'checkpoints.json'),'[{"id":"CP_TORN_FINAL","wal_seq":2400,"wal_hash":"PARTIAL');boot(dst);return setTimeout(()=>assertBlocked().catch(e=>die(122,'UNHANDLED',{error:e.message})),1800);
 }
 if(MODE==='atomic_wal_prerename_crash'){
  const dst=path.join(ROOT,'v45-atomic-wal-prerename');copyClean(dst);const tmp='.evidence.wal.jsonl.atomic-crash.tmp';fsyncWrite(path.join(dst,tmp),'PARTIAL_TEMP_WAL');process.exit(137);
 }
 if(MODE==='atomic_wal_recover'){
  const dst=path.join(ROOT,'v45-atomic-wal-prerename');boot(dst);return setTimeout(()=>assertClean(dst,'.evidence.wal.jsonl.atomic-crash.tmp').catch(e=>die(123,'UNHANDLED',{error:e.message})),1800);
 }
 if(MODE==='atomic_checkpoint_prerename_crash'){
  const dst=path.join(ROOT,'v45-atomic-checkpoint-prerename');copyClean(dst);const tmp='.checkpoints.json.atomic-crash.tmp';fsyncWrite(path.join(dst,tmp),'[{"id":"PARTIAL_TEMP_CHECKPOINT"');process.exit(137);
 }
 if(MODE==='atomic_checkpoint_recover'){
  const dst=path.join(ROOT,'v45-atomic-checkpoint-prerename');boot(dst);return setTimeout(()=>assertClean(dst,'.checkpoints.json.atomic-crash.tmp').catch(e=>die(124,'UNHANDLED',{error:e.message})),1800);
 }
 die(90,'UNKNOWN_MODE',{mode:MODE});
}
main().catch(e=>die(199,'UNHANDLED_TOP',{error:e.message}));
