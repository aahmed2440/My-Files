import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const HOST = '127.0.0.1';
const SERVER = new URL('./server.mjs', import.meta.url);

function assert(condition, code) {
  if (!condition) {
    const err = new Error(code);
    err.code = code;
    throw err;
  }
}

async function getJson(base, path, expectedStatus) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(3500) });
  const body = await response.json();
  assert(response.status === expectedStatus, `STATUS_${path}_${response.status}_EXPECTED_${expectedStatus}`);
  return body;
}

async function waitReady(base, attempts = 30) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(base + '/health/live', { signal: AbortSignal.timeout(750) });
      if (response.status === 200) return;
    } catch (err) {
      lastError = err;
    }
    await sleep(100);
  }
  throw lastError || new Error('SERVER_NOT_READY');
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(2500).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); })
  ]);
}

async function runCase({ name, port, env, verify }) {
  const child = spawn(process.execPath, [SERVER.pathname], {
    env: {
      ...process.env,
      PORT: String(port),
      T0_PROMOTION_ENABLED: 'false',
      CAPITAL_AUTHORITY: 'NONE',
      SCHWAB_TOS_ENABLED: 'false',
      SCHWAB_ACCESS_TOKEN: '',
      SCHWAB_STREAM_HOST_ALLOWLIST: '',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const base = `http://${HOST}:${port}`;

  try {
    await waitReady(base);
    await verify(base);
    assert(child.exitCode === null, `${name}_PROCESS_EXITED`);
    return { name, pass: true };
  } catch (err) {
    throw new Error(`${name}:${err.code || err.message}${stderr ? `:${stderr.slice(0, 300)}` : ''}`);
  } finally {
    await stopChild(child);
  }
}

const cases = [
  {
    name: 'disabled_baseline',
    port: 43101,
    env: { SCHWAB_TOS_ENABLED: 'false' },
    verify: async base => {
      const ready = await getJson(base, '/health/ready', 200);
      assert(ready.feed_gate === 'DISABLED', 'READY_NOT_DISABLED');
      assert(ready.source_certification_eligible === false, 'UNEXPECTED_CERT_ELIGIBILITY');
      assert(ready.automatic_live_promotion === false, 'AUTO_PROMOTION_NOT_FALSE');

      const status = await getJson(base, '/api/v1/feed/status', 200);
      assert(status.mode === 'DISABLED', 'STATUS_NOT_DISABLED');
      assert(status.auth === 'NOT_CONFIGURED', 'AUTH_NOT_NOT_CONFIGURED');
      assert(status.socket === 'DISCONNECTED', 'SOCKET_NOT_DISCONNECTED');
      assert(status.trading_authority === 'NONE', 'TRADING_AUTHORITY_NOT_NONE');
      assert(status.production_mutation === false, 'PRODUCTION_MUTATION_NOT_FALSE');
      assert(status.proof_available === false, 'PROOF_SHOULD_BE_UNAVAILABLE');

      const proof = await getJson(base, '/api/v1/feed/proof', 425);
      assert(proof.state === 'DISABLED', 'PROOF_STATE_NOT_DISABLED');
      assert(proof.eligible_for_governed_review === false, 'PROOF_UNEXPECTED_ELIGIBILITY');
      assert(proof.first_data === null, 'PROOF_FIRST_DATA_NOT_NULL');
    }
  },
  {
    name: 'enabled_missing_token',
    port: 43102,
    env: { SCHWAB_TOS_ENABLED: 'true', SCHWAB_ACCESS_TOKEN: '' },
    verify: async base => {
      const ready = await getJson(base, '/health/ready', 200);
      assert(ready.feed_gate === 'AUTH_REQUIRED', 'READY_NOT_AUTH_REQUIRED');
      const status = await getJson(base, '/api/v1/feed/status', 200);
      assert(status.mode === 'AUTH_REQUIRED', 'STATUS_NOT_AUTH_REQUIRED');
      assert(status.auth === 'MISSING_ACCESS_TOKEN', 'AUTH_NOT_MISSING_ACCESS_TOKEN');
      assert(status.socket === 'DISCONNECTED', 'SOCKET_NOT_DISCONNECTED');
      assert(status.proof_available === false, 'PROOF_SHOULD_BE_UNAVAILABLE');
      const proof = await getJson(base, '/api/v1/feed/proof', 425);
      assert(proof.authentication === 'MISSING_ACCESS_TOKEN', 'PROOF_AUTH_NOT_MISSING_ACCESS_TOKEN');
      assert(proof.eligible_for_governed_review === false, 'PROOF_UNEXPECTED_ELIGIBILITY');
    }
  },
  {
    name: 'enabled_missing_host_allowlist',
    port: 43103,
    env: {
      SCHWAB_TOS_ENABLED: 'true',
      SCHWAB_ACCESS_TOKEN: 'CERT_PLACEHOLDER_NOT_A_REAL_TOKEN',
      SCHWAB_STREAM_HOST_ALLOWLIST: ''
    },
    verify: async base => {
      const ready = await getJson(base, '/health/ready', 200);
      assert(ready.feed_gate === 'AUTH_REQUIRED', 'READY_NOT_AUTH_REQUIRED');
      const status = await getJson(base, '/api/v1/feed/status', 200);
      assert(status.mode === 'AUTH_REQUIRED', 'STATUS_NOT_AUTH_REQUIRED');
      assert(status.auth === 'STREAM_HOST_ALLOWLIST_REQUIRED', 'AUTH_NOT_ALLOWLIST_REQUIRED');
      assert(status.socket === 'DISCONNECTED', 'SOCKET_NOT_DISCONNECTED');
      assert(status.proof_available === false, 'PROOF_SHOULD_BE_UNAVAILABLE');
      const proof = await getJson(base, '/api/v1/feed/proof', 425);
      assert(proof.authentication === 'STREAM_HOST_ALLOWLIST_REQUIRED', 'PROOF_AUTH_NOT_ALLOWLIST_REQUIRED');
      assert(proof.eligible_for_governed_review === false, 'PROOF_UNEXPECTED_ELIGIBILITY');
    }
  }
];

const report = [];
for (const testCase of cases) report.push(await runCase(testCase));

assert(process.env.T0_PROMOTION_ENABLED !== 'true', 'PARENT_T0_PROMOTION_ENABLED');
assert(process.env.CAPITAL_AUTHORITY !== 'FUNDED', 'PARENT_CAPITAL_AUTHORITY_FUNDED');

console.log(JSON.stringify({
  event: 'MARKETSPHERE_DIRECT_PRE_CREDENTIAL_CERT_PASS',
  adapter_version: '0.2.0-cert',
  check_count: report.length,
  cases: report,
  automatic_live_promotion: false,
  capital_authority: 'NONE'
}));
