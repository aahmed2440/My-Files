# CryptoSphere Pilot GO / HOLD Evidence Matrix

**Program:** CryptoSphere  
**Stage:** Pilot  
**Decision posture:** **HOLD** until every mandatory pre-deployment gate is green on the same reviewed source head.  
**Authority:** `ADVISORY_ONLY` — no production execution, autonomous policy change, autonomous deployment, or silent authority increase.

## Decision matrix

| Gate | Required evidence | Current state | Promotion effect | Abort / HOLD criterion |
|---|---|---:|---|---|
| Public repository release guard | Public-repository safety workflow succeeds | PASS | Necessary, not sufficient | Any secret/private/sensitive release finding |
| Pilot control plane | `PILOT_STATE.json`, manifest binding, authority and isolated Railway invariants verify | PASS | Necessary, not sufficient | Any authority increase, boundary drift, or manifest mismatch |
| Exact Owner artifact | 27,977 bytes; SHA-256 `6d58d4023eedbf319a162f15541628c512acb9751a06d47dcc049d5d988dd146`; valid ZIP | FAIL | Blocks downstream certification | Size/hash/ZIP mismatch |
| Exact Core artifact | 95,596 bytes; SHA-256 `bc2c527f358174715b569c32f10d9a28f85d8d8724fcbae407963c9922a1b997`; valid ZIP | FAIL/BLOCKED behind intake | Blocks downstream certification | Size/hash/ZIP mismatch |
| Release manifest | Exact artifacts agree with authoritative `SHA256.txt` | BLOCKED | Blocks build | Any manifest/artifact disagreement |
| Package structure | Required Owner/Core runtime contents present | BLOCKED | Blocks build | Missing/unexpected required runtime structure |
| Static compile / syntax | Node syntax and Python compilation pass | BLOCKED | Blocks image | Any compile/syntax failure |
| Integrated image build | Exact Docker image builds from certified inputs | BLOCKED | Blocks hosted boot | Build failure or unverified input substitution |
| Integrated runtime | Aggregate `/health` ready; Owner/Core ready; Core `ADVISORY_ONLY` | BLOCKED | Blocks hosted acceptance | Readiness failure or authority invariant failure |
| Trusted identity perimeter | Unauthenticated/spoofed/unprivileged requests rejected; verified privileged envelope read-only succeeds | BLOCKED | Blocks Internet exposure | Fail-open identity behavior |
| Isolated Railway boundary | Dedicated Pilot project/service only; production recovery service untouched | PASS / PRE-STAGED | Allows deployment only after certification | Wrong project/service, boundary drift, or production mutation |
| First hosted boot | `CRYPTOSPHERE_ASSETS_JSON=[]`; no external target contact | NOT STARTED | Required before domain/canary | Any external contact or unexpected asset configuration |
| Hosted acceptance | `pilot-hosted-smoke.sh` passes security/readiness checks | NOT STARTED | Required before canary | Any smoke/security failure |
| External canary | Exactly one explicitly authorized public HTTPS:443 metadata-only target | DISABLED | Controlled evidence step only after hosted acceptance | Unapproved target, non-443/non-HTTPS, or scope expansion |
| Human GO/HOLD | Human reviews complete evidence package | HOLD | Final Pilot promotion authority | Missing evidence, unresolved contradiction, or uncertainty above accepted bound |

## Current evidence snapshot

The Public Repository Release Guard and independent Pilot Control-Plane Gate pass. Artifact Intake and full Pilot Certification fail closed at the known repository artifact boundary. Downstream manifest, structure, compile, Docker, runtime, and hosted identity gates are **blocked/unobserved**, not treated as failed.

The repository currently contains truncated runtime objects (Owner observed 7,509 bytes; Core observed 15,008 bytes). The approved preserved artifacts are bound to the exact sizes and hashes above. The authoritative manifest must **not** be rewritten to bless damaged bytes.

Earlier identity-perimeter, Core resource-guardrail, isolated-hosting, hosted-smoke, machine-readable-state, and promotion-runbook engineering items are closed as independent P0 implementation blockers. They remain mandatory re-verification gates after exact artifact repair.

## Promotion sequence

`exact artifact repair → Artifact Intake PASS → full Pilot Certification PASS → Release Guard PASS + Control-Plane PASS on same reviewed head → isolated Railway deployment with assets=[] → hosted acceptance PASS → explicitly authorized metadata-only canary → human GO/HOLD`

No step may silently skip a predecessor. A later PASS cannot override an earlier FAIL, BLOCKED, or unobserved mandatory gate.

## Railway Pilot boundary

- Project: `d97e67d0-aa94-43f1-b727-d63deadecbf0`
- Environment: `813e5b56-edf8-413a-9725-47732474d61f`
- Service: `7c0e7b73-2e9b-41e0-9f78-4df4e9b0a52d`
- Source deployment: not started
- Public domain: disabled
- External canary: disabled
- Promotion: disabled

## Governing rule

> Increase intelligence. Increase evidence. Increase autonomy carefully. Never silently increase authority.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
