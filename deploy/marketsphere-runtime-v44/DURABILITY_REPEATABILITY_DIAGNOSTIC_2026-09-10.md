# MarketSphere v4.4 Durability Repeatability Diagnostic

Date: 2026-09-10
Posture: isolated certification only. T0 disabled. Funded routing locked. Capital authority NONE.

## Purpose
Document a transient Railway 0/1 residency event observed during an additional cold-recovery run, and the fail-closed bisection used to determine whether it represented evidence-store drift.

## Baseline already certified
The canonical v4.4 non-empty WAL recovery campaign had already passed:
- seed: `e5af7b3f-7eeb-4502-9cda-dbe52bdb1307` — 2,400 deterministic synthetic events;
- durable recovery: `f26fdd36-25e4-4b0b-8ee5-107ae2b96fbd` — FILESYSTEM_VOLUME recovery with exact equality of store identity, replay digest, event count, checkpoint hash, and lane counts.

## Transient repeat attempt
Deployment: `edafdd55-9cf1-4f95-98ec-f266b2508de4`

Railway marked the deployment `SUCCESS`, but the environment-status view reported `0 running / 0 crashed / 1 total`. Deploy logs showed repeated volume-mount messages and no useful application stdout.

This deployment is **not counted as a certification PASS**.

## Diagnostic bisection
The isolated durability service was then tested with progressively stronger fail-closed assertions.

### A. Proof persistence / readability
Deployment: `82edaa0f-92a6-4b03-8e49-737b27ed145f`

Before remaining resident, the process required:
- `WAL_CERT_PROOF_PATH` exists;
- proof parses as JSON;
- non-empty store instance ID;
- non-empty replay digest;
- exactly 2,400 events;
- non-empty checkpoint hash.

Observed: `1 running / 0 crashed / 1 total`.

Conclusion: the frozen proof remained present and readable after restart.

### B. Current canonical runtime/replay contract, without proof comparison
Deployment: `0b73613b-4e46-4741-a727-6961f3206d76`

Before remaining resident, canonical v4.4 required:
- `DURABLE_VERIFIED`;
- backend `FILESYSTEM_VOLUME`;
- path class `PERSISTENT_VOLUME`;
- exactly 2,400 events;
- deterministic replay;
- matching live store instance ID / replay digest / checkpoint hash between status and replay endpoints;
- T0 `LOCKED_PRE_CREDENTIAL`;
- `/api/order` HTTP 403;
- capital authority NONE.

Observed: `1 running / 0 crashed / 1 total`.

Conclusion: current durable store and replay state remained healthy independently of the frozen proof comparison.

### C. Full seven-field equality restored
Deployment: `5f09fb8d-8b9f-462b-94a3-f03c300860f5`

The complete recovery contract was restored. Residency required exact equality between the current durable store and frozen proof for:
- store instance ID;
- replay digest;
- events;
- checkpoint hash;
- accepted count;
- quarantine count;
- dead-letter count;
plus all durable/replay/T0/order/capital-authority invariants above.

Observed: `1 running / 0 crashed / 1 total`.

## Conclusion
No evidence-store drift was found. Proof persistence, current canonical durable/replay state, and complete seven-field cross-restart equality all passed independently and then passed together again.

The earlier `edafdd55...` 0/1 event is classified as a transient Railway service/mount/start anomaly rather than a certified MarketSphere data-continuity failure. It remains recorded as a non-pass observation and is not deleted from the evidence history.

## Engineering action
A reusable source-controlled harness, `deploy/marketsphere-runtime-v44/durability_cert.cjs`, was added so future seed/recovery certification can be expressed as version-controlled logic instead of long ad-hoc Railway inline assertions.

## Remaining durability gates
- intentional interruption during an active WAL/checkpoint write;
- crash-consistency / partial-write recovery;
- multi-replica and region-failover consistency;
- backup/restore and disaster recovery.

No result in this campaign enables T0 or capital authority.
