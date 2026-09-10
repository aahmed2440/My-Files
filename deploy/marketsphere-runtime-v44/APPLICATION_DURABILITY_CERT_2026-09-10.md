# MarketSphere v4.4 Canonical Application Durability Certification

Date: 2026-09-10
Posture: read-only certification; T0 promotion disabled; funded routing locked; capital authority NONE.

## Scope
This evidence certifies the canonical `marketsphere_rt_server_v44.js` runtime against an isolated Railway persistent filesystem volume. It is separate from the lower-level volume continuity proof.

Canonical runtime SHA-256:
`0abf167159b1e0745cbc5f3b85ee22e09721c1ee755b15c828396da635d6e052`

Durable backend contract:
- `DURABLE_BACKEND=FILESYSTEM_VOLUME`
- `DURABLE_STORE_PATH=/data/marketsphere/v44-app`
- Railway volume ID: `1b25ec03-011c-493a-b0a6-7a524ef97566`
- volume mount root: `/data/marketsphere`

## Runtime fail-closed requirements
Before remaining resident, the certification bootstrap verifies:
- runtime SHA matches the canonical v4.4 SHA;
- `/api/health` returns HTTP 200, `ok=true`, build `4.4.0-beta`, and `durable_store=DURABLE_VERIFIED`;
- `/api/durable/status` returns HTTP 200, `state=DURABLE_VERIFIED`, `durable=true`, `backend=FILESYSTEM_VOLUME`, `path_class=PERSISTENT_VOLUME`, a non-null `store_instance_id`, and `capital_authority=NONE`;
- `/api/durable/replay` returns HTTP 200, `state=DETERMINISTIC`, `durable=true`, and its store instance ID and replay digest exactly match `/api/durable/status`;
- `/api/t0/certification` remains `LOCKED_PRE_CREDENTIAL` with promotion disabled and capital authority NONE;
- `/api/order` returns HTTP 403;
- `T0_PROMOTION_ENABLED=false` and `CAPITAL_AUTHORITY=NONE`.

Any failed assertion exits the process before certification residency.

## Boot A — canonical durable initialization
Deployment: `10edbe66-a106-4d80-b479-04a62d51fc19`

Additional Boot-A rule:
- application durability proof file must not already exist;
- after all runtime assertions pass, the bootstrap persists a proof snapshot containing:
  - `store_instance_id`;
  - `replay_digest`;
  - `events`;
  - `checkpoint_hash`.

Observed result:
- deployment SUCCESS;
- replica status: 1 running / 0 crashed / 1 total;
- persistent volume active.

## Boot B — canonical restart/recovery continuity
Deployment: `a969663f-d5ce-43bd-9d35-79d1a6ec5356`

`APP_DURABILITY_EXPECT_EXISTING=true` was enabled while retaining the same canonical runtime, durable backend, durable path, and volume.

Additional Boot-B fail-closed rules:
- prior application proof must exist;
- current canonical runtime `store_instance_id` must exactly match Boot A;
- current replay digest must exactly match Boot A;
- current event count must exactly match Boot A;
- current checkpoint hash must exactly match Boot A;
- all durability, deterministic replay, T0-lock, funded-route, and capital-authority assertions must continue to pass.

Observed result:
- deployment SUCCESS;
- replica status: 1 running / 0 crashed / 1 total;
- persistent volume active.

Because the process exits on any continuity mismatch, Boot-B residency constitutes fail-closed evidence that canonical v4.4 recovered the same durable store identity and replay state across restart.

## Important boundary
The canonical v4.4 implementation intentionally does not seed the 2,400-record synthetic WAL when operating in declared `FILESYSTEM_VOLUME` mode on a new empty durable store. Therefore this certification proves persistent store identity and deterministic replay continuity for the actual durable runtime state, but it does not claim a non-empty live-market WAL recovery campaign in this isolated lane.

Historical v4.0 QA separately established non-empty 2,400-record WAL/checkpoint/replay recovery in controlled server QA; that prior evidence is not conflated with this Railway application-restart proof.

## Certified conclusion
Canonical MarketSphere v4.4 application-level persistent-store integration and cross-restart deterministic state continuity: PASS in the isolated Railway durability lane.

## Still open
- non-empty Railway durable WAL campaign under canonical v4.4;
- crash during active WAL/checkpoint write and atomic recovery;
- region failover / multi-replica durability semantics;
- backup/restore and disaster-recovery drills;
- live entitled market-source persistence;
- credential authentication, entitlement, source quorum, latency, soak;
- any final T0 promotion.

No durability result expands market-data authority or capital authority.
