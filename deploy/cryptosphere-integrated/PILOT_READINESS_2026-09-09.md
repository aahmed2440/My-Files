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
- Pilot supply-chain policy now requires exact same-head certification and immediate pre-deployment PR-head revalidation. A branch name or historical CI result is never deployment authorization.

## Verified CI evidence — head b11ab7ddc70bb10f26347e326e1b504367bab0d2
The complete observed CI cycle for this exact head is:
- Public Repository Release Guard run `34542047623`: **PASS**.
- Pilot Control-Plane Gate run `34542047395`: **PASS**.
- Artifact Intake Gate run `34542047389`: **FAIL**, as designed, because repository runtime ZIP copies remain truncated/corrupt.
- Full Pilot Certification run `34542047420`: **FAIL/HOLD at exact release bytes + ZIP integrity**; downstream manifest/structure/compile/image/runtime/identity gates remain blocked or unobserved and must not be represented as failed observations.

This evidence is bound only to the exact head above. Any later commit must earn every mandatory gate again. Historical PASS results are evidence, not authorization for a newer head.

## Exact repository blocker
Observed repository copies remain:
- Owner runtime: 7,509 bytes instead of approved 27,977 bytes.
- Core runtime: 15,008 bytes instead of approved 95,596 bytes.

Required repair is deliberately narrow: replace only
- `deploy/cryptosphere-integrated/cryptosphere-owner-runtime.zip`
- `deploy/cryptosphere-integrated/cryptosphere-core-runtime.zip`

with the preserved exact approved bytes. **Do not modify `SHA256.txt` to match damaged bytes.**

## Gates already closed as implementation blockers
The gateway identity perimeter, resource guardrails, hosted isolation, deployment configuration, machine-readable state, artifact verifier, control-plane governance, promotion runbook, GO/HOLD matrix, and same-head supply-chain policy are no longer independent P0 implementation blockers. They remain subject to full CI and hosted re-verification after exact artifact repair.

## Promotion sequence
1. Exact artifact repair.
2. Artifact Intake Gate GREEN.
3. Full Pilot Certification GREEN, including manifest, structure, syntax/compile, Docker build, integrated runtime/browser/API/security, and trusted identity fail-closed checks.
4. Public Repository Release Guard GREEN and Pilot Control-Plane Gate GREEN on the same exact reviewed head SHA.
5. Immediately re-read PR #12 and prove its current head equals the certified SHA. Any movement means HOLD and recertify.
6. Deploy only that certified revision to the isolated Railway Pilot boundary with `CRYPTOSPHERE_ASSETS_JSON=[]`.
7. Prove deployed-revision provenance and run hosted smoke/security acceptance with no external canary.
8. Only after hosted acceptance, configure exactly one explicitly authorized public HTTPS:443 metadata-only canary and separately enable the canary switch.
9. Review evidence and make an explicit human Pilot GO/HOLD decision before promotion is allowed.

## Governance boundary
- authority mode: `ADVISORY_ONLY`
- `production_execution=false`
- `autonomous_policy_change=false`
- `autonomous_deployment=false`
- `human_governance_required=true`
- no silent authority increase

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
