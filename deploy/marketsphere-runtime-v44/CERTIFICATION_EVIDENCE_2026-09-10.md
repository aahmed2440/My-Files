# MarketSphere v4.4 Runtime Parity Certification Evidence

Date: 2026-09-10
Posture: read-only certification; no T0 promotion; no funded order routing; capital authority NONE.

## Canonical artifacts

- Runtime build: `4.4.0-beta`
- Canonical runtime SHA-256: `0abf167159b1e0745cbc5f3b85ee22e09721c1ee755b15c828396da635d6e052`
- Unified parity certification module: `deploy/marketsphere-runtime-v44/parity_cert.cjs`
- Unified parity certification module SHA-256: `382fdf2cb7f5266f8b1992f874d1525472d0a5ad59386e619ccc7acb5aae6a78`
- Certification module source commit: `551eceb5fd5c858c6184ea4fe9d96869b375b9e7`

## Isolated Railway certification environment

- Project: `MarketSphere Parity Cert`
- Project ID: `8bf5cf0b-bca8-4beb-83cf-8897cf451ed5`
- Service: `marketsphere-parity-smoke`
- Service ID: `e8907da4-2e88-4f60-9a32-96b14b4d4ea1`
- Environment ID: `2f6f3a76-ca5c-44de-9f42-3fa050f12c49`
- Runtime image: `node:22-alpine`
- Healthcheck: `/api/health`
- Restart policy: `ALWAYS`
- T0 promotion: disabled
- Durable mode for parity certification: `PROCESS_LOCAL` / non-authoritative sandbox

## 10/10 parity matrix

The unified parity module fails closed by exiting the process when any assertion fails. The following assertions are required:

1. `/api/health` -> HTTP 200; `ok=true`; build `4.4.0-beta`.
2. `/api/global/readiness` -> HTTP 200; state `NO_LIVE_T0 / CERTIFICATION_ONLY`; funded routing false; capital authority NONE.
3. `/api/cme/readiness` -> HTTP 200; `tier0_authorized=false`; build `4.4.0-beta`.
4. `/api/durable/status` -> HTTP 200; `PROCESS_LOCAL_SANDBOX`; durable false; capital authority NONE.
5. `/api/durable/replay` -> HTTP 200; deterministic replay; durable false; capital authority NONE.
6. `/api/quorum/status` -> HTTP 200; `tier0_live=0`; funded routing false; capital authority NONE.
7. `/api/reference/status` -> HTTP 200; `tier0_authority=false`; capital authority NONE.
8. `/api/cme/preflight` -> HTTP 200; promotion disabled; `tier0_authorized=false`; state `CREDENTIALS_PENDING`; capital authority NONE.
9. `/api/t0/certification` -> HTTP 200; promotion disabled; state `LOCKED_PRE_CREDENTIAL`; capital authority NONE.
10. `/api/order` -> HTTP 403; funded route remains locked.

## Empirical certification passes

### Split-block proof

- Deployment `72b93618-8029-4479-8c55-ad5fdf2e7572`: Block A (checks 1-5) PASS; service remained 1/1 resident.
- Deployment `6f0e8910-1b57-4c1d-96f0-8547abdd1437`: Block B (checks 6-10) PASS; service remained 1/1 resident.

Both block deployments used the same canonical runtime SHA.

### Unified 10/10 proof

- Deployment `023c8122-834e-4740-bd39-379eaae72e59`: SHA-verified canonical runtime + SHA-verified unified certification module; deployment SUCCESS; environment status 1 running / 0 crashed / 1 total after certification window.
- Cold redeploy `f6ac88b6-0fb0-4567-ad31-b249defc301d`: identical start command and immutable certification source; deployment SUCCESS; environment status 1 running / 0 crashed / 1 total after certification window.

Because `parity_cert.cjs` terminates the process on any failed assertion, sustained 1/1 residency after the certification window is the fail-closed success criterion.

## Safety and governance conclusions

- No live T0 source is authorized by this certification.
- No credential or entitlement claim is created by this certification.
- No funded order route is enabled.
- Lower-tier/reference sources do not gain T0 authority.
- Capital authority remains `NONE`.
- Human promotion remains a separate explicit gate.

## Known infrastructure finding

New image services created inside older MarketSphere Railway projects were observed in a false-green condition: deployment status `SUCCESS` while environment status showed 0/1 resident. A fresh isolated Railway project using the same runtime image/service pattern reached 1/1 residency. Therefore, deployment status alone is not accepted as certification evidence; replica residency must be checked independently.

This evidence freezes runtime/API parity only. It does not certify entitlement-bearing direct feeds, source authentication, subscription ACK, heartbeat continuity, timestamp/sequence integrity, source quorum, real latency, soak, or final T0 promotion.
