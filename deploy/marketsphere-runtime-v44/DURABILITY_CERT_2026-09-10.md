# MarketSphere Isolated Durability Continuity Certification

Date: 2026-09-10
Posture: infrastructure/durability certification only. T0 promotion disabled. Capital authority NONE.

## Scope
This evidence certifies the Railway persistent-volume continuity primitive independently of the canonical MarketSphere v4.4 application runtime. It does not claim that the full v4.4 runtime has yet been certified against the persistent store.

## Isolated service
- Railway project: `MarketSphere Parity Cert`
- Service: `marketsphere-durable-cert`
- Volume ID: `1b25ec03-011c-493a-b0a6-7a524ef97566`
- Mount path: `/data/marketsphere`
- Region: `iad`
- Expected persistent instance ID: `a0bf2246-9856-42f3-ba0b-56fd533cb018`
- T0 promotion: disabled
- Capital authority: NONE

## Fail-closed two-boot proof
The sentinel process is intentionally fail-closed.

### Boot A — initialize persistent identity
Deployment: `595a04df-e385-4a17-b642-edf2e60fc5f1`

Required conditions before the process could remain resident:
- `DURABILITY_EXPECT_EXISTING=false`;
- proof path configured on the mounted volume;
- proof file must not already exist;
- process writes `instance_id=a0bf2246-9856-42f3-ba0b-56fd533cb018`;
- boot counter must be exactly 1 after atomic write/rename and read-back verification;
- `T0_PROMOTION_ENABLED=false`;
- `CAPITAL_AUTHORITY=NONE`.

Observed result:
- deployment SUCCESS;
- replica status: 1 running / 0 crashed / 1 total;
- volume active on service.

### Boot B — require prior persisted identity and advance counter
Deployment: `5b93c535-bd47-4924-94f3-64c8db12ef9e`

Only `DURABILITY_EXPECT_EXISTING` was changed to `true`; the same volume and proof path were retained.

Required conditions before the process could remain resident:
- proof file must already exist on the mounted volume;
- stored `instance_id` must exactly equal `a0bf2246-9856-42f3-ba0b-56fd533cb018`;
- stored boot counter must be an integer >=1;
- process increments and atomically rewrites the record;
- read-back `instance_id` must still match;
- read-back boot counter must equal the incremented value and be >=2;
- `T0_PROMOTION_ENABLED=false`;
- `CAPITAL_AUTHORITY=NONE`.

Observed result:
- deployment SUCCESS;
- replica status: 1 running / 0 crashed / 1 total;
- volume active on service.

Because the process exits before opening its HTTP server on any failed persistence assertion, Boot B residency constitutes fail-closed evidence that the identity created during Boot A survived the restart and the persisted boot counter advanced.

## Tooling caveat
Railway's container-file browsing helper produced inconsistent views of files under the mounted path during earlier diagnostics. Those helper results are not used as certification evidence. The decisive evidence is the fail-closed startup logic plus post-start 1/1 residency on both Boot A and Boot B.

## Certified conclusion
Railway persistent-volume identity continuity is PASS in the isolated MarketSphere durability lane.

## Still open
This evidence does NOT yet certify:
- canonical MarketSphere v4.4 application-level durable backend integration;
- deterministic application replay from the persistent store after process restart;
- application-level boot/instance metadata continuity;
- crash-consistency under interrupted writes;
- multi-replica durability semantics;
- backup/restore or disaster recovery;
- live market-source persistence;
- any T0 or capital authority.

Next gate: run the canonical v4.4 runtime against the isolated mounted store and prove its own durability/replay contract across restart without changing T0 or capital authority.
