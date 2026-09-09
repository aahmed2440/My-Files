# MarketSphere Live Application-Certification Runbook

## Purpose
Deploy the MarketSphere evidence-certification runtime to an isolated live surface and produce the first defensible `MS-CERT-*` application evidence bundle without enabling funded trading or asserting real market-data certification.

## Preconditions

- isolated deployment surface is available;
- source revision is explicitly selected and CI is green;
- durable volume is mounted at the intended `DURABLE_STORE_PATH`;
- `MS_OWNER_TOKEN` is configured only in secret storage;
- `T0` remains locked;
- capital authority remains none;
- Schwab/CME secrets, if received, are not required for MS-L1 application certification;
- no real-source declaration may be represented as empirical evidence.

## Phase A — Deployment identity

Capture:

- Git commit SHA;
- deployment ID;
- environment/service ID;
- instance/replica ID;
- boot ID;
- runtime version;
- volume mount path.

Acceptance:

- deployment reaches healthy state;
- `/api/health` returns 200;
- response shows `capital_authority: NONE` and `t0: LOCKED`;
- evidence store is writable and below hard capacity.

Hard stop:

- deployment crash loop;
- missing/mis-mounted durable volume;
- capital authority not NONE;
- T0 not LOCKED;
- unexplained secret/configuration exposure.

## Phase B — Browser delivery

From a normal browser:

1. load the isolated certification URL;
2. verify HTML, CSS and JavaScript render;
3. refresh the readiness/source cards;
4. execute `Run browser proof` once;
5. capture request ID and generated evidence ID/hash.

Acceptance:

- root page 2xx;
- same-origin API calls 2xx;
- browser-proof result PASS;
- evidence write succeeds;
- readiness changes browser interactivity to PASS;
- no 4xx/5xx except intentionally tested cases;
- no client console/runtime error affecting operation.

Negative test:

- cross-origin browser-proof attempt must be rejected;
- repeated browser-proof writes must eventually return rate-limit backpressure.

## Phase C — Owner/RBAC

1. call `/api/whoami` without Owner credentials;
2. require denial;
3. verify Owner using the secret-storage value through the same-origin UI;
4. confirm role OWNER;
5. confirm capital authority remains false/NONE.

Acceptance:

- unauthenticated Owner path returns 401/appropriate denial;
- authenticated Owner path returns OWNER;
- evidence records exist for bounded denial/pass events;
- the Owner credential itself never appears in response, logs, evidence files or bundle.

Hard stop:

- public request receives Owner privileges;
- Owner session reports capital authority;
- credential appears in evidence/logs.

## Phase D — Synthetic application plumbing

Run the Owner-only simulated plumbing test.

Acceptance:

- result PASS;
- classification `SIMULATED`;
- synthetic source state explicitly reports `SIMULATED`/`SIMULATED_PASS`;
- no real source becomes LIVE/CERTIFIED.

Then exercise:

- HEALTHY;
- DEGRADED;
- STALE;
- OFFLINE;
- RESET.

Acceptance:

- every state is explicit and reversible;
- UI reflects the intended simulated state;
- every generated record remains classified simulated;
- real CME/Schwab source state is unchanged.

## Phase E — Evidence integrity and capacity

As Owner:

1. inspect evidence capacity;
2. verify integrity;
3. capture certification snapshot;
4. inspect bounded manifest tail.

Acceptance:

- evidence-store state PASS or documented WARN;
- integrity PASS;
- hash mismatch 0;
- chain breaks 0;
- chain-head mismatch 0;
- no missing evidence files.

Do not intentionally corrupt the live evidence volume. Tamper falsification is covered by CI/local certification tests.

## Phase F — Restart/persistence proof

1. capture pre-restart boot ID, evidence count and chain head;
2. perform one controlled service restart/redeploy without changing application revision;
3. allow volume remount and runtime recovery;
4. inspect `/api/certification/recovery`;
5. re-run evidence-integrity verification.

Acceptance:

- previous state found;
- current boot ID differs from previous boot ID;
- boot count increments;
- prior evidence remains present;
- evidence integrity remains PASS.

Hard stop:

- evidence/state disappears after restart;
- chain integrity fails;
- storage remount differs unexpectedly.

## Phase G — First live application bundle

Generate `/api/certification/bundle` as Owner.

Expected bundle identity:

`MS-CERT-YYYYMMDD-xxxxxxxx`

Validate that the bundle contains:

- readiness;
- sources;
- recovery state;
- evidence-capacity state;
- evidence-integrity result;
- bounded manifest tail;
- build/deployment/instance/boot identifiers;
- `T0: LOCKED`;
- `capital_authority: NONE`.

Validate that it does **not** contain:

- Owner token;
- Authorization header;
- cookies;
- Schwab/CME credentials;
- OAuth access/refresh tokens;
- brokerage account secrets.

## MS-L1 promotion decision

Promote to **MS-L1 Application Certified** only if Phases A–G pass with inspectable evidence.

This does not imply:

- real market-data certification;
- Schwab certification;
- CME certification;
- source quorum;
- trading/execution authorization.

## Later MS-L2 real-source gate

For Schwab or CME, require empirical adapter evidence for authentication, subscription acknowledgment, first market event, heartbeat, timestamp/freshness, sequence behavior, reconnect/recovery and provenance. Configuration flags alone are never sufficient.

## Rollback doctrine

If a new certification deployment fails any hard-stop criterion:

1. keep production unchanged;
2. do not promote the failed revision;
3. preserve evidence/logs from the failed attempt;
4. identify the failed gate and root cause;
5. correct in source control;
6. require CI PASS again;
7. repeat the isolated certification attempt.

**Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale**
