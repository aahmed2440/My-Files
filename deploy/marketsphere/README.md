# MarketSphere Evidence Certification Runtime

This is a maintainable, source-controlled certification runtime for MarketSphere. It is intentionally **read-only with respect to capital authority**.

## Current version

`4.7.0-evidence-hardening`

## Purpose

Close application/evidence certification gates before Schwab/CME credentials arrive:

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
- `/api/evidence/capacity` evidence-store utilization and hard-cap telemetry
- `/api/certification/recovery` restart/persistence proof
- `/api/certification/snapshot` evidence-backed readiness/source snapshot
- `/api/certification/bundle` downloadable certification bundle
- synthetic plumbing self-test permanently labeled `SIMULATED`
- Owner-only synthetic `HEALTHY / DEGRADED / STALE / OFFLINE / RESET` failure-state harness
- cross-origin rejection on browser-proof evidence writes
- per-client throttles on unauthenticated evidence-producing paths
- evidence-capacity backpressure: nonessential writes stop at the hard ceiling; history is not auto-deleted
- hard deny for `/api/capital/*`; T0 remains locked

## Evidence doctrine

Each evidence record carries an evidence ID, UTC timestamp, event type/classification, request/actor context, app/build/deployment/instance/boot identifiers, previous evidence hash, governance boundary, event payload, and SHA-256 hash.

The manifest is append-only JSONL. Integrity verification checks file presence, record hash, manifest hash-chain continuity, and chain-head agreement with persisted state. The falsification suite alters an evidence file, requires integrity `FAIL`, restores the original bytes, and requires `PASS` again.

## Critical source-certification rule

**Environment/configuration declarations are not empirical market-data evidence.** Even when CME or Schwab declaration flags are set, this runtime does not mark those sources `LIVE` or `CERTIFIED` without empirical packet evidence from the real adapter certification path.

## Abuse and resource hardening

The evidence ledger itself is treated as a protected resource:

- browser-proof writes are same-origin checked when an Origin header is present
- repeated browser-proof writes are rate limited
- unauthenticated Owner-denial evidence is independently throttled
- repeated capital-denial evidence is throttled while the deny decision remains enforced
- `MS_EVIDENCE_WARN_BYTES` and `MS_EVIDENCE_HARD_BYTES` control evidence-capacity thresholds
- at the hard threshold, nonessential evidence writes return backpressure rather than deleting history

## Required production secret

Configure `MS_OWNER_TOKEN` only in secret storage. Do **not** commit or paste the value into source control or chat.

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
- Evidence capacity: `/api/evidence/capacity`
- Recovery proof: `/api/certification/recovery`
- Simulated plumbing: `POST /api/certification/selftest`
- Simulated failure state: `POST /api/certification/simulate-state`
- Snapshot: `POST /api/certification/snapshot`
- Certification bundle: `/api/certification/bundle`

## Certification artifacts

- `EVIDENCE_DOCTRINE.md` — evidence and governance rules
- `LIVE_CERT_RUNBOOK.md` — exact isolated-live MS-L1 certification and rollback sequence
- `CERTIFICATION_MATRIX.json` — machine-readable MS-L0 through MS-L4 gates/status

## Verification status

Latest verified branch head before this documentation refresh: `e2f95ef2436e2c251ce0f705f901980d4042984d`.

Independent GitHub Actions results on that head:

- **MarketSphere Certification:** PASS
- **Public Repository Release Guard:** PASS
- immutable checkout/setup actions: PASS
- full-history high-confidence secret/path scan: PASS
- MarketSphere certification + hardening suites: PASS

The test corpus consists of the 10 baseline certification tests plus 5 focused hardening tests.

These results certify the **source-controlled application/evidence implementation**, not a live browser deployment. MS-L1 remains `PENDING_LIVE_DEPLOYMENT_EVIDENCE` until the live runbook is completed on an isolated deployed surface with durable storage.

## Governance

`Owner != capital authority`. This runtime returns `capital_authority: NONE` and `t0: LOCKED`, and explicitly rejects `/api/capital/*`.

**Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale**
