# MarketSphere v4.4 Non-Empty WAL Recovery Certification

Date: 2026-09-10
Posture: isolated synthetic durability certification only. T0 promotion disabled. Funded routing locked. Capital authority NONE.

## Scope
This campaign proves canonical MarketSphere v4.4 recovery of a non-empty 2,400-event evidence WAL from the same Railway persistent volume after switching from the synthetic PROCESS_LOCAL seeding mode to declared FILESYSTEM_VOLUME durable mode.

Canonical runtime SHA-256:
`0abf167159b1e0745cbc5f3b85ee22e09721c1ee755b15c828396da635d6e052`

Railway service: `marketsphere-durable-cert`
Volume ID: `1b25ec03-011c-493a-b0a6-7a524ef97566`
Volume mount: `/data/marketsphere`
Campaign store path: `/data/marketsphere/v44-wal-campaign`

## Phase A — deterministic synthetic seed
Deployment: `e5af7b3f-7eeb-4502-9cda-dbe52bdb1307`

Configuration:
- `DURABLE_BACKEND=PROCESS_LOCAL`
- store path located on the isolated mounted Railway volume;
- T0 promotion disabled;
- capital authority NONE.

Fail-closed requirements before residency:
- canonical runtime SHA must match;
- `/api/durable/status` must report `PROCESS_LOCAL_SANDBOX`, `durable=false`, backend `PROCESS_LOCAL`;
- event count must equal exactly 2,400;
- checkpoint count must be at least 1;
- store instance ID, replay digest, and checkpoint hash must be non-null;
- `/api/durable/replay` must report `DETERMINISTIC` with exactly 2,400 events and matching store identity/digest/checkpoint hash;
- `/api/t0/certification` must remain `LOCKED_PRE_CREDENTIAL` with promotion disabled;
- `/api/order` must return HTTP 403;
- capital authority must remain NONE.

After all checks passed, a proof snapshot was persisted containing:
- store instance ID;
- replay digest;
- event count;
- checkpoint hash;
- accepted count;
- quarantine count;
- dead-letter count.

Observed result:
- deployment SUCCESS;
- replica status: 1 running / 0 crashed / 1 total.

## Phase B — persistent FILESYSTEM_VOLUME recovery
Deployment: `f26fdd36-25e4-4b0b-8ee5-107ae2b96fbd`

Only the durability posture was promoted for the same store path:
- `DURABLE_BACKEND=FILESYSTEM_VOLUME`;
- same persistent Railway volume and campaign path retained.

Fail-closed requirements before residency:
- `/api/durable/status` must report `DURABLE_VERIFIED`, `durable=true`, backend `FILESYSTEM_VOLUME`, path class `PERSISTENT_VOLUME`;
- event count must remain exactly 2,400;
- checkpoint count must remain non-zero;
- replay must remain `DETERMINISTIC`;
- T0 must remain locked;
- `/api/order` must remain HTTP 403;
- capital authority must remain NONE;
- prior proof snapshot must exist;
- exact equality with the Phase-A proof is required for all of:
  - `store_instance_id`;
  - `replay_digest`;
  - `events`;
  - `checkpoint_hash`;
  - `accepted`;
  - `quarantine`;
  - `dead`.

Any mismatch exits the process before residency.

Observed result:
- deployment SUCCESS;
- replica status: 1 running / 0 crashed / 1 total;
- persistent volume active.

## Certified conclusion
Canonical MarketSphere v4.4 non-empty Railway WAL recovery: PASS.

The same 2,400-event synthetic evidence store survived the backend transition/restart and was recovered under `FILESYSTEM_VOLUME` with exact store identity, deterministic replay digest, checkpoint hash, and lane-count continuity.

## Boundaries
This is synthetic/certification evidence, not live entitled exchange data. It does not certify:
- crash during an in-flight WAL/checkpoint write;
- multi-replica or region-failover consistency;
- backup/restore disaster recovery;
- direct market-feed credentials, entitlement, subscription ACK, heartbeat, timestamp/sequence integrity, source quorum, real latency, or soak;
- any T0 or capital authority.

Storage integrity can only preserve or reduce confidence; it cannot expand market-data authority or capital authority.
