# MarketSphere v4.4 Railway WAL-Chain Fault Injection Certification

Date: 2026-09-10
Posture: isolated synthetic fault-injection certification. T0 promotion disabled. Funded routing locked. Capital authority NONE.

## Purpose
Verify that canonical MarketSphere v4.4 fails closed when the integrity chain of a persisted 2,400-event WAL is corrupted on Railway, without mutating the certified clean store.

Canonical runtime SHA-256:
`0abf167159b1e0745cbc5f3b85ee22e09721c1ee755b15c828396da635d6e052`

## Isolation
Clean certified source store:
`/data/marketsphere/v44-wal-campaign`

Fault-copy target:
`/data/marketsphere/v44-fault-wal-chain`

The deployment removed/recreated only the fault target, copied the clean source recursively, and then altered only the first non-empty WAL row in the copied `evidence.wal.jsonl` by replacing its `prev_hash` with `FAULT_INJECTED_PREV_HASH`.

The source clean store was not modified by the command.

## Fault-injection deployment
Deployment: `c9e6e129-9652-4fa0-a614-dd0ad9b8b26c`

Before remaining resident, canonical v4.4 was required to report all of the following against the corrupted copy:
- `/api/durable/status` HTTP 200;
- `state=BLOCK`;
- `durable=true`;
- `backend=FILESYSTEM_VOLUME`;
- `invariants.WAL_CHAIN_INTEGRITY=false`;
- `capital_authority=NONE`;
- `/api/durable/replay` HTTP 409 with `state=BLOCK`;
- `/api/t0/certification` remains `LOCKED_PRE_CREDENTIAL` with promotion disabled;
- `/api/order` remains HTTP 403;
- environment T0 promotion remains false;
- capital authority remains NONE.

Observed result:
- deployment SUCCESS;
- replica status: 1 running / 0 crashed / 1 total.

Because any unexpected non-BLOCK or authority-expanding state exits before residency, the resident deployment constitutes fail-closed evidence that canonical v4.4 detected the WAL chain corruption and refused deterministic replay certification.

## Clean-store restoration
After the isolated fault campaign, the service was returned to the original clean store and full seven-field recovery contract.

Restoration deployment: `ff760898-b557-46ed-898d-9a580fbba71b`

Required before residency:
- `DURABLE_VERIFIED`;
- FILESYSTEM_VOLUME / PERSISTENT_VOLUME;
- exactly 2,400 events;
- deterministic replay;
- exact equality to the frozen clean proof for store instance ID, replay digest, events, checkpoint hash, accepted, quarantine, and dead-letter counts;
- T0 locked;
- `/api/order` HTTP 403;
- capital authority NONE.

Observed result:
- deployment SUCCESS;
- replica status: 1 running / 0 crashed / 1 total.

## Certified conclusion
Canonical v4.4 Railway WAL-chain corruption detection: PASS.

A corrupted copy of the certified 2,400-event store forced `BLOCK` and replay HTTP 409 without enabling T0 or capital authority. The original clean store then re-certified with exact proof equality.

## Boundary
This test injects deterministic post-write corruption into a copied WAL. It does not yet reproduce process termination during an in-flight filesystem write. That active-write crash-consistency gate remains open.
