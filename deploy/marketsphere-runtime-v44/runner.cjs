const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const EXPECTED_RUNTIME_SHA256 = '0abf167159b1e0745cbc5f3b85ee22e09721c1ee755b15c828396da635d6e052';
const bundlePath = path.join(__dirname, 'runtime.gz.b64');
const encoded = fs.readFileSync(bundlePath, 'utf8').trim();
const runtime = zlib.gunzipSync(Buffer.from(encoded, 'base64'));
const actual = crypto.createHash('sha256').update(runtime).digest('hex');

if (actual !== EXPECTED_RUNTIME_SHA256) {
  console.error(JSON.stringify({event:'marketsphere_runtime_integrity_failure', expected:EXPECTED_RUNTIME_SHA256, actual}));
  process.exit(78);
}

const out = '/tmp/marketsphere-v44-canonical.cjs';
fs.writeFileSync(out, runtime, { mode: 0o440 });
console.log(JSON.stringify({event:'marketsphere_runtime_integrity_verified', build:'4.4.0-beta', sha256:actual, authority:'READ_ONLY', capital_authority:'NONE', automatic_t0_promotion:false}));
require(out);
