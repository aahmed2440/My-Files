# CryptoSphere Pilot Readiness — evidence refresh 2026-09-10

## Current disposition
**HOLD for hosted Pilot.** The remaining P0 blocker is exact repository artifact intake. No Railway source deployment, public domain, external canary, promotion, production execution, autonomous policy change, or autonomous deployment is authorized.

## Verified engineering baseline
- Preserved Owner runtime: 27,977 bytes; SHA-256 `6d58d4023eedbf319a162f15541628c512acb9751a06d47dcc049d5d988dd146`; ZIP integrity PASS.
- Preserved Core runtime: 95,596 bytes; SHA-256 `bc2c527f358174715b569c32f10d9a28f85d8d8724fcbae407963c9922a1b997`; ZIP integrity PASS.
- Owner Console 1.4.1 local readiness PASS; empty allowlist remains `DEMO_ONLY` and performs no external contact.
- Analytical Core 0.90.1 local readiness PASS in `ADVISORY_ONLY`; production execution remains false and human governance remains required.
- Hardened integrated gateway is committed on the Pilot branch. Trusted-external-identity rejection/acceptance behavior and bounded body/concurrency/rate/timeout controls passed controlled local acceptance.
- Hosted acceptance harness is committed and is explicitly non-executing/non-autonomous.
- Dedicated isolated Railway Pilot boundary is provisioned and fail-closed; source deployment has not started.

## CI evidence at branch head before this refresh
- Public Repository Release Guard: **PASS**.
- Pilot Control-Plane Gate: **PASS**.
- Artifact Intake Gate: **FAIL**, as designed, because repository runtime ZIP copies remain truncated/corrupt.
- Full Pilot Certification: **FAIL/HOLD at exact release bytes + ZIP integrity**; downstream manifest/structure/compile/image/runtime/identity gates are blocked or skipped and must not be represented as failed observations.

## Exact repository blocker
Observed repository copies remain:
- Owner runtime: 7,509 bytes instead of approved 27,977 bytes.
- Core runtime: 15,008 bytes instead of approved 95,596 bytes.

Required repair is deliberately narrow: replace only
- `deploy/cryptosphere-integrated/cryptosphere-owner-runtime.zip`
- `deploy/cryptosphere-integrated/cryptosphere-core-runtime.zip`

with the preserved exact approved bytes. **Do not modify `SHA256.txt` to match damaged bytes.**

## Gates already closed
The earlier gateway identity-perimeter, resource-guardrail, hosted-isolation, deployment-configuration, machine-readable-state, artifact-verifier, and control-plane-governance workstreams are no longer independent P0 blockers. They remain subject to full CI and hosted re-verification after exact artifact repair.

## Promotion sequence
1. Exact artifact repair.
2. Artifact Intake Gate GREEN.
3. Full Pilot Certification GREEN, including manifest, structure, syntax/compile, Docker build, integrated runtime/browser/API/security, and trusted identity fail-closed checks.
4. Public Repository Release Guard GREEN and Pilot Control-Plane Gate GREEN on the same reviewed head.
5. Deploy only to the isolated Railway Pilot boundary with `CRYPTOSPHERE_ASSETS_JSON=[]`.
6. Hosted smoke/security acceptance with no external canary.
7. Only after hosted acceptance, configure exactly one explicitly authorized public HTTPS:443 metadata-only canary and separately enable the canary switch.
8. Review evidence and make an explicit human Pilot GO/HOLD decision before promotion is allowed.

## Governance boundary
- authority mode: `ADVISORY_ONLY`
- `production_execution=false`
- `autonomous_policy_change=false`
- `autonomous_deployment=false`
- `human_governance_required=true`

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
