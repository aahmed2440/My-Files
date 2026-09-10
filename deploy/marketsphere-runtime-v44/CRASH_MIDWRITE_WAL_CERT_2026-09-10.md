# MarketSphere v4.4 — Crash Mid-Write WAL Certification

## Scope
Isolated Railway certification only. The certified clean 2,400-event store at `/data/marketsphere/v44-wal-campaign` was not modified.

## Crash injection
Deployment `abfbddf5-6f5b-4484-80cf-a4a7a7332e01` copied the clean store to `/data/marketsphere/v44-crash-midwrite`, opened the copied `evidence.wal.jsonl` in append mode, wrote an intentionally incomplete event 2401 JSON record, called `fs.fsyncSync`, closed the descriptor, and exited with code 137 under `restartPolicyType=NEVER`.

Observed post-injection residency: 0 running / 0 crashed / 1 total. This is the expected non-resident crash phase.

## Recovery behavior
Deployment `ffe29943-7d41-4619-b126-705dde0b9829` booted the canonical v4.4 runtime against the crash-test copy under `FILESYSTEM_VOLUME`.

Residency was allowed only if all of the following held:
- `/api/durable/status` returned HTTP 200 with `state=BLOCK`, `durable=true`, backend `FILESYSTEM_VOLUME`, a parse/integrity error, and `capital_authority=NONE`;
- `/api/durable/replay` returned HTTP 409 with `state=BLOCK` and `capital_authority=NONE`;
- `/api/t0/certification` remained `LOCKED_PRE_CREDENTIAL` with promotion disabled;
- `/api/order` returned HTTP 403;
- `T0_PROMOTION_ENABLED=false` and `CAPITAL_AUTHORITY=NONE` remained enforced.

Observed recovery residency: 1 running / 0 crashed / 1 total.

## Result
PASS — a durably fsynced torn WAL append is not accepted as durable evidence. Canonical v4.4 fails closed, blocks replay, preserves governance locks, and does not expand capital authority.

## Claim boundary
This certifies fail-closed handling of an intentionally incomplete WAL append on an isolated copy. It does not yet certify automatic truncation/repair, transactional checkpoint+WAL commit, multi-region failover, or backup/restore.
