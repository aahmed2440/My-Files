'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const EXPECTED_RUNTIME_SHA='98ec1321cd0bc1f9b6ea3eb6f80b94e9ea882672abadee2067b9d31c77903724';
const EXPECTED_PARITY_SHA='76c19b883a8fd4ba10cb0b7102aa3b8f7ca3bfc0185bc66da65aab8d9faf35ea';
const EXPECTED_DURABILITY_SHA='21957d607434680de739853d167a740d22a8c5ed5669cc87b2314521cea55a3d';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const runtimeB64=fs.readFileSync(path.join(__dirname,'runtime.gz.b64'),'utf8').trim();
const runtime=zlib.gunzipSync(Buffer.from(runtimeB64,'base64'));
if(sha(runtime)!==EXPECTED_RUNTIME_SHA){console.error(JSON.stringify({event:'MARKETSPHERE_V45_RUNTIME_SHA_MISMATCH',actual:sha(runtime)}));process.exit(78)}
const certMode=process.env.CERT_MODE||'parity';
const certName=certMode==='durability'?'durability_cert.cjs':'parity_cert.cjs';
const cert=fs.readFileSync(path.join(__dirname,certName));
const expectedCert=certMode==='durability'?EXPECTED_DURABILITY_SHA:EXPECTED_PARITY_SHA;
if(sha(cert)!==expectedCert){console.error(JSON.stringify({event:'MARKETSPHERE_V45_CERT_SHA_MISMATCH',mode:certMode,actual:sha(cert)}));process.exit(79)}
if(process.env.T0_PROMOTION_ENABLED!=='false'||process.env.CAPITAL_AUTHORITY!=='NONE'){console.error(JSON.stringify({event:'MARKETSPHERE_V45_GOVERNANCE_ENV_BLOCK'}));process.exit(80)}
const runtimePath='/tmp/marketsphere-v45-canonical.cjs';fs.writeFileSync(runtimePath,runtime);
console.log(JSON.stringify({event:'MARKETSPHERE_V45_BOOT_VERIFIED',build:'4.5.0-beta',runtime_sha256:EXPECTED_RUNTIME_SHA,cert_mode:certMode,t0_promotion_enabled:false,capital_authority:'NONE'}));
require(runtimePath);
require(path.join(__dirname,certName));
