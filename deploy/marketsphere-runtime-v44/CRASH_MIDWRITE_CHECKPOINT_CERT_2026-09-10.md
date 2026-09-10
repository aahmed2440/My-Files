# MarketSphere v4.4 — Crash Mid-Write Checkpoint Certification

## Scope
Isolated Railway certification only. The certified clean 2,400-event store at `/data/marketsphere/v44-wal-campaign` was not modified.

## Crash injection
Deployment `e3a92794-1863-43f0-8a3c-d84d194bd8bf` copied the clean store to `/data/marketsphere/v44-crash-checkpoint`, opened the copied `checkpoints.json` for overwrite, wrote intentionally incomplete checkpoint JSON, called `fs.fsyncSync`, closed the descriptor, and exited with code 137 under `restartPolicyType=NEVER`.

Observed crash-phase residency: 0 running / 0 crashed / 1 total.

## Recovery behavior
Deployment `566130b9-99e2-4913-91c9-3f8dace42746` booted the canonical v4.4 runtime against the checkpoint-torn copy under `FILESYSTEM_VOLUME`.

Residency was allowed only if:
- `/api/durable/status` returned HTTP 200 with `state=BLOCK`, `durable=true`, backend `FILESYSTEM_VOLUME`, an error, and `capital_authority=NONE`;
- `/api/durable/replay` returned HTTP 409 with `state=BLOCK` and `capital_authority=NONE`;
- `/api/t0/certification` remained `LOCKED_PRE_CREDENTIAL` with promotion disabled;
- `/api/order` returned HTTP 403;
- `T0_PROMOTION_ENABLED=false` and `CAPITAL_AUTHORITY=NONE` remained enforced.

Observed recovery residency: 1 running / 0 crashed / 1 total.

## Clean restoration
Deployment `16a4fcde-170b-4511-859d-3e63a43a12a4` restored the certification service to the clean `/data/marketsphere/v44-wal-campaign` store and passed `DURABLE_VERIFIED`, deterministic 2,400-event replay, exact seven-field proof equality, T0 lock, order 403, and capital authority NONE at 1/0/1 residency.

## Result
PASS — a durably fsynced torn checkpoint is not accepted as durable evidence. Canonical v4.4 fails closed and clean evidence remains recoverable and unchanged.

## Engineering implication
Current v4.4 correctly detects torn WAL/checkpoint writes but does not yet prevent them through atomic persistence semantics. The next hardening step is temp-file + fsync + atomic rename + directory fsync for replace-style metadata/checkpoint writes, and fsynced append semantics for WAL records, followed by a new runtime SHA and full recertification.
