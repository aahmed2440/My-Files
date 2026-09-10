# CryptoSphere Pilot Promotion Runbook — 2026-09-10

## Current state
**HOLD.** The isolated Railway Pilot boundary is configured but has no source attached and no deployment. Promotion and external-canary switches are explicitly false.

## Railway deployment contract
- Project: `CryptoSphere Pilot`
- Service: `cryptosphere-pilot`
- Root directory: `/deploy/cryptosphere-integrated`
- Builder: Dockerfile
- Dockerfile: `Dockerfile`
- Health check: `/health`
- Health-check timeout: 120 seconds
- Restart policy: on failure, maximum 3 retries
- Watch scope: `deploy/cryptosphere-integrated/**`
- Runtime: V2
- Pilot promotion switch: `CRYPTOSPHERE_PILOT_PROMOTION_ALLOWED=false`
- External canary switch: `CRYPTOSPHERE_PILOT_EXTERNAL_CANARY_ALLOWED=false`

## Supply-chain deployment invariant
The Pilot branch is presently unprotected and the repository has no rulesets. Therefore a branch name or historical CI result is never deployment authorization. Before source attachment/deployment, record the exact reviewed PR head SHA, require all mandatory gates to be green on that same SHA, re-read the PR head immediately before deployment, and abort if it moved. See `PILOT_SUPPLY_CHAIN_POLICY_2026-09-10.md`.

## Mandatory promotion sequence
1. Replace the two damaged repository runtime ZIPs with the preserved exact Owner/Core bytes. Do not alter `SHA256.txt`.
2. Require Artifact Intake to pass exact approved byte counts, SHA-256 values, ZIP integrity, and manifest binding.
3. Require CryptoSphere Pilot Certification to pass manifest, structure, syntax/compile, Docker build, integrated readiness, browser/API, security-header, advisory-only, and trusted-identity gates.
4. Require Public Repository Release Guard and Pilot Control-Plane Gate to be green on the **same exact reviewed head SHA** as Artifact Intake and Pilot Certification.
5. Immediately before deployment, re-read PR #12 head SHA and require exact equality with the certified SHA. Any movement => HOLD and recertify.
6. Attach/deploy only the certified revision to the isolated Railway Pilot boundary. Never use the existing recovery/production service.
7. Keep `CRYPTOSPHERE_ASSETS_JSON=[]` for first hosted boot. Do not enable an external canary yet.
8. Generate the Pilot domain only after the deployment is healthy and the deployed revision is proven to correspond to the certified revision.
9. Run `pilot-hosted-smoke.sh` against the hosted service and require all fail-closed identity and advisory-only checks to pass.
10. Only after hosted acceptance, authorize exactly one explicitly approved public HTTPS:443 metadata-only canary and separately set `CRYPTOSPHERE_PILOT_EXTERNAL_CANARY_ALLOWED=true` for that controlled window.
11. Review evidence and record an explicit human GO/HOLD decision before setting `CRYPTOSPHERE_PILOT_PROMOTION_ALLOWED=true`.

## Non-negotiable authority boundary
- `production_execution=false`
- `ADVISORY_ONLY`
- human governance required
- no autonomous policy activation or mutation
- no autonomous deployment
- no automatic evidence collection
- no automatic scheduling
- no private-key access or decryption
- no production mutation

## Rollback / abort conditions
Immediately HOLD if artifact hashes diverge, ZIP integrity fails, the certified SHA differs from the current PR head, deployed revision provenance is ambiguous, identity does not fail closed, an unapproved target becomes reachable, security headers regress, Core leaves advisory-only mode, production execution becomes possible, or hosted health is not deterministic.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
