# MarketSphere Direct-Feed Pre-Credential Certification Evidence

Date: 2026-09-10
Posture: read-only certification only. T0 promotion disabled. Funded routing absent. Capital authority NONE.

## Certified source
Pinned source commit: `bcc9a18a9e13263a9c6d34dc0550161052477d23`

SHA-256 manifest:
- `src/state.mjs` — `523c595077968c9574f16d16bc3a9c159b9f770cc8ca535c148f58d85c20d886`
- `src/adapter.mjs` — `16bdc5b24ab12bb366259a65f2ac2b1f39b6a144d2d413b22b116f9a0311bb05`
- `src/server.mjs` — `66aed001793d7a204d3d3ab436d5dc30fdd1182dcdd558fd86b5e21080ab349f`

## Isolated Railway certification lane
Project: `MarketSphere Direct Feed Cert`
Service: `marketsphere-direct-cert-clean`

### Source-integrity stage
Deployment `f6f48168-f50b-4c71-a63a-e9bb7b42da10`
- Pinned source fetch completed.
- All three SHA-256 checks passed.
- Replica result: 1 running / 0 crashed / 1 total.

### Adapter-core fail-closed stage
Deployment `b8b48684-56c3-436b-9069-79cfff723123`
- `SchwabTosAdapter` imported and instantiated.
- `start()` executed with `SCHWAB_TOS_ENABLED=false`.
- Required state assertions passed: `mode=DISABLED`, `auth=NOT_CONFIGURED`, `trading_authority=NONE`, `automatic_live_promotion=false`.
- Replica result: 1 running / 0 crashed / 1 total.

### Full server-wrapper stage
Deployment `b195c828-53c0-4a62-abbc-432ab70352b5`
- Certified `server.mjs` launched from SHA-verified pinned source.
- `/health/ready` configured.
- No startup errors detected.
- Replica result: 1 running / 0 crashed / 1 total.

### Unified pre-credential self-certification
Deployment `ed2e0330-2476-4bf3-8c80-6ebb4847bc39`
Fail-closed startup asserted all of the following before remaining resident:
- `/health/ready` => HTTP 200, `feed_gate=DISABLED`, `source_certification_eligible=false`, `automatic_live_promotion=false`.
- `/api/v1/feed/status` => HTTP 200, disabled/not-configured/disconnected state; `trading_authority=NONE`; `production_mutation=false`; `proof_available=false`; `automatic_live_promotion=false`.
- `/api/v1/feed/contract` => HTTP 200; automatic live promotion false; trading authority NONE; production mutation false; governed-review state exists in the state machine.
- `/api/v1/feed/proof` => HTTP 425 while no market-data proof exists; state DISABLED; governed-review eligibility false; first_data null; trading authority NONE.
- `T0_PROMOTION_ENABLED=false`.
- `CAPITAL_AUTHORITY=NONE`.
- Replica result: 1 running / 0 crashed / 1 total.

### Cold-redeploy repeatability
Deployment `4b4e6be7-21b4-4ab0-83c1-ec4b5753fc88`
- Same immutable source + SHA verification + fail-closed endpoint assertions.
- Deployment SUCCESS.
- Replica result: 1 running / 0 crashed / 1 total.

## Tooling caveat
Railway's container-file inspection helper did not expose the `/tmp` files used by the startup process during the cold redeploy, despite the service remaining 1/1 resident. This helper result is not used as certification evidence. Certification is based on the fail-closed startup command, deployment success, and post-start replica residency. Any SHA, source-fetch, endpoint assertion, T0 lock, or authority assertion failure exits the process.

## Certified conclusion
The MarketSphere Schwab/TOS adapter software path is certified through the pre-credential boundary: source integrity, adapter import/start, server wrapper, fail-closed disabled state, proof withholding, governance contract, repeatable cold deployment, and zero trading authority.

## Explicitly NOT certified by this evidence
The following require legitimate entitled source credentials and actual market-data observations and therefore remain open:
- credential authentication;
- account/feed entitlement verification;
- authoritative streamer endpoint resolution and host allowlist confirmation;
- login acknowledgement;
- subscription acknowledgement;
- first market-data evidence;
- heartbeat continuity;
- realtime-vs-delayed classification;
- timestamp integrity;
- sequence/continuity integrity;
- reconnect/recovery behavior under live source conditions;
- source quorum;
- real latency characterization;
- soak duration;
- governed source-certification review;
- final human T0 promotion approval.

No credential presence, entitlement claim, or software readiness state may be interpreted as T0 authority. No automatic live promotion is permitted.
