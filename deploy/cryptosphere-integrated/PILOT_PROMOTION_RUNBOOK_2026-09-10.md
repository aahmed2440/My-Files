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

## Mandatory promotion sequence
1. Replace the two damaged repository runtime ZIPs with the preserved exact Owner/Core bytes. Do not alter `SHA256.txt`.
2. Require CryptoSphere Pilot Certification to pass exact SHA-256, ZIP integrity, manifest, structure, syntax/compile, Docker build, integrated readiness, browser/API, security-header, and trusted-identity gates.
3. Require Public Repository Release Guard to remain green on the exact promoted commit.
4. Attach only the certified Pilot branch/commit to the isolated Railway Pilot service.
5. Keep `CRYPTOSPHERE_ASSETS_JSON=[]` for first hosted boot. Do not enable an external canary yet.
6. Generate the Pilot domain only after the deployment is healthy.
7. Run `pilot-hosted-smoke.sh` against the hosted service and require all fail-closed identity and advisory-only checks to pass.
8. Only after hosted acceptance, authorize exactly one explicitly approved public HTTPS:443 metadata-only canary and set `CRYPTOSPHERE_PILOT_EXTERNAL_CANARY_ALLOWED=true` for that controlled window.
9. Review evidence and record an explicit human GO/HOLD decision before setting `CRYPTOSPHERE_PILOT_PROMOTION_ALLOWED=true`.

## Non-negotiable authority boundary
- `production_execution=false`
- `ADVISORY_ONLY`
- human governance required
- no autonomous policy activation or mutation
- no automatic evidence collection
- no automatic scheduling
- no private-key access or decryption
- no production mutation

## Rollback / abort conditions
Immediately HOLD if artifact hashes diverge, ZIP integrity fails, identity does not fail closed, an unapproved target becomes reachable, security headers regress, Core leaves advisory-only mode, production execution becomes possible, or hosted health is not deterministic.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
