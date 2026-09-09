# MarketSphere Evidence Certification Runtime

This is a maintainable, source-controlled certification runtime for MarketSphere. It is intentionally **read-only** with respect to capital authority.

## Purpose

Close the application-side certification gates before Schwab/CME credentials arrive:

- browser delivery and same-origin interactivity proof
- structured, sanitized request observability
- `/api/health` process liveness
- `/api/readiness` machine-readable certification gates
- `/api/sources` explicit source state, freshness, heartbeat and provenance fields
- `/api/whoami` server-side Owner authentication using `MS_OWNER_TOKEN`
- append-only JSON evidence records under `<DURABLE_STORE_PATH>/evidence`
- SHA-256 per-record integrity plus chained manifest entries
- `/api/evidence/integrity` integrity verification
- `/api/evidence/manifest` bounded Owner-only evidence inventory
- `/api/certification/recovery` restart/persistence proof
- `/api/certification/snapshot` evidence-backed readiness/source snapshot
- `/api/certification/bundle` downloadable certification bundle
- synthetic plumbing self-test that is permanently labeled `SIMULATED`
- hard deny for `/api/capital/*`; T0 remains locked

## Evidence model

Each evidence record carries:

- evidence ID and UTC timestamp
- event type and classification
- request ID and actor class
- app version, build SHA, deployment ID, instance ID and boot ID
- previous evidence hash
- governance boundary (`T0: LOCKED`, `capital_authority: NONE`)
- event-specific payload
- SHA-256 hash

The manifest is append-only JSONL and preserves the hash chain. The integrity endpoint verifies file presence, record hashes, manifest hashes and chain continuity.

## Required production secret

Configure `MS_OWNER_TOKEN` in Railway secret storage. Do **not** commit or paste the value into source control or chat.

## Optional source-declaration variables

The runtime recognizes existing CME declaration flags plus `SCHWAB_API_APPROVED`, `SCHWAB_OAUTH_VERIFIED`, and `SCHWAB_STREAM_VERIFIED`. Declarations do not substitute for empirical packet evidence.

## Run

```bash
npm test
npm start
```

## Key endpoints

- Health: `/api/health`
- Readiness: `/api/readiness`
- Sources: `/api/sources`
- Owner identity: `/api/whoami`
- Browser proof: `POST /api/browser-proof`
- Evidence integrity: `/api/evidence/integrity`
- Evidence manifest: `/api/evidence/manifest`
- Recovery proof: `/api/certification/recovery`
- Snapshot: `POST /api/certification/snapshot`
- Certification bundle: `/api/certification/bundle`

## Governance

`Owner != capital authority`. This runtime returns `capital_authority: NONE` and `t0: LOCKED`, and explicitly rejects `/api/capital/*`.

**Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale**
