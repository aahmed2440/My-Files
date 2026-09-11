'use strict';

const ALLOWED_MODES = new Set([
  'wal_corrupt',
  'wal_torn_final',
  'checkpoint_torn_final',
  'atomic_wal_prerename_crash',
  'atomic_wal_recover',
  'atomic_checkpoint_prerename_crash',
  'atomic_checkpoint_recover',
]);

const mode = process.env.FAULT_MODE;
const runtimeSha = '98ec1321cd0bc1f9b6ea3eb6f80b94e9ea882672abadee2067b9d31c77903724';

function fail(code, reason, details = {}) {
  console.error(JSON.stringify({
    event: 'MARKETSPHERE_V45_FAULT_RUN_ATTESTATION_FAIL',
    code,
    reason,
    mode: mode || null,
    runtime_sha: runtimeSha,
    ...details,
  }));
  process.exit(code);
}

if (!mode) fail(86, 'FAULT_MODE_REQUIRED');
if (!ALLOWED_MODES.has(mode)) fail(87, 'FAULT_MODE_NOT_ALLOWED');
if (process.env.T0_PROMOTION_ENABLED !== 'false') fail(88, 'T0_PROMOTION_MUST_REMAIN_DISABLED');
if (process.env.CAPITAL_AUTHORITY !== 'NONE') fail(89, 'CAPITAL_AUTHORITY_MUST_REMAIN_NONE');

console.log(JSON.stringify({
  event: 'MARKETSPHERE_V45_FAULT_RUN_START',
  mode,
  runtime_sha: runtimeSha,
  t0_promotion_enabled: false,
  capital_authority: 'NONE',
  funded_order_routing: false,
  attestation_version: 1,
}));

require('./fault_cert.cjs');
