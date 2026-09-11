'use strict';
const fs=require('fs'),zlib=require('zlib'),crypto=require('crypto');
const payload=process.env.RUNTIME_GZ_B64;if(!payload)throw new Error('RUNTIME_GZ_B64_REQUIRED');
const runtime=zlib.gunzipSync(Buffer.from(payload,'base64'));const sha=crypto.createHash('sha256').update(runtime).digest('hex');
if(sha!==process.env.RUNTIME_SHA256){console.error(JSON.stringify({event:'MARKETSPHERE_V45_RUNTIME_SHA_MISMATCH',expected:process.env.RUNTIME_SHA256,actual:sha}));process.exit(78)}
const path='/tmp/marketsphere-v45-canonical.cjs';fs.writeFileSync(path,runtime);console.log(JSON.stringify({event:'MARKETSPHERE_V45_RUNTIME_VERIFIED',build:'4.5.0-beta',sha256:sha,t0_promotion_enabled:false,capital_authority:'NONE'}));require(path);
