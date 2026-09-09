# MarketSphere Application Certification Runtime

This is a maintainable, source-controlled certification runtime for MarketSphere. It is intentionally **read-only** with respect to capital authority.

## Purpose

Close the application-side certification gates before Schwab/CME credentials arrive:

- browser delivery and same-origin interactivity proof
- structured, sanitized request observability
- `/api/health` process liveness
- `/api/readiness` machine-readable certification gates
- `/api/sources` explicit source state, freshness, heartbeat and provenance fields
- `/api/whoami` server-side Owner authentication using `MS_OWNER_TOKEN`
- synthetic plumbing self-test that is permanently labeled `SIMULATED`
- durable boot/browser/auth/self-test evidence where a writable volume is mounted
- hard deny for `/api/capital/*`; T0 remains locked

## Required production secret

Configure `MS_OWNER_TOKEN` in Railway secret storage. Do **not** commit or paste the value into source control or chat.

## Optional source-declaration variables

The runtime recognizes existing CME declaration flags plus `SCHWAB_API_APPROVED`, `SCHWAB_OAUTH_VERIFIED`, and `SCHWAB_STREAM_VERIFIED`. Declarations do not substitute for empirical packet evidence.

## Run

```bash
npm test
npm start
```

Health: `/api/health`  
Readiness: `/api/readiness`  
Sources: `/api/sources`

## Governance

`Owner != capital authority`. This runtime returns `capital_authority: NONE` and `t0: LOCKED`, and explicitly rejects `/api/capital/*`.

**Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale**
