# MarketSphere v4.5 Atomic-Durability Evidence — 2026-09-11

Posture: isolated certification only. Live beta untouched. `T0_PROMOTION_ENABLED=false`; funded routing disabled; `CAPITAL_AUTHORITY=NONE`.

## Provenance
- Runtime build: `4.5.0-beta`
- Exact runtime SHA-256: `98ec1321cd0bc1f9b6ea3eb6f80b94e9ea882672abadee2067b9d31c77903724`
- Fault-cert source commit: `61f0ecaa244153414b9bf757a075ecd5d52290a9`
- Fault-cert implementation blob: `dbf816566a9756771c558949da0bc2329c2277c9`
- Isolated Railway project: `MarketSphere Atomic Cert`
- Durability service: `marketsphere-v45-durability-git`
- Persistent volume: `a3c71ca2-00f5-4ac6-a4be-d74ad0ed95c3`
- Mount: `/data/marketsphere`

Evidence in this record applies only to the exact runtime SHA above. It must not be inherited by a changed runtime artifact.

## Directly verified evidence

### Clean final recovery — PASS
Deployment `a8087fe4-1af5-4ffe-94ee-887e92223c2a` emitted `MARKETSPHERE_V45_DURABILITY_CERT_PASS` in `recovery` mode with:
- `persistence_semantics=ATOMIC_FSYNC_RENAME_V1`
- store instance `e4e1b359-99fc-4e88-8bc9-9eb45d00d9d1`
- replay digest `5a3238b3fcd5c9303440d9839be177896520b4940d39294d39ce2d2b04b50281`
- events `2400`
- checkpoint hash `b436bb50ef35d17c55876d6831936c70e89f03c1b29914804599bea52c6af892`
- accepted `2372`; quarantine `17`; dead `11`
- funded routing `false`; capital authority `NONE`

### WAL pre-rename recovery — recovery half PASS
Deployment `bd1bc4a9-9dd5-4741-8c60-3d66bb6d1d2c` emitted `MARKETSPHERE_V45_FAULT_CERT_PASS` with:
- `mode=atomic_wal_recover`
- `result=LAST_COMMITTED_STATE_RECOVERED`
- expected orphan temp `.evidence.wal.jsonl.atomic-crash.tmp` present
- capital authority `NONE`

The recovery assertion in `fault_cert.cjs` requires exact equality against the preserved proof for: `store_instance_id`, `replay_digest`, `events`, `checkpoint_hash`, `accepted`, `quarantine`, and `dead`; deterministic replay must also match.

### Checkpoint pre-rename recovery — recovery half PASS
Deployment `f9805f22-e44f-4be7-a593-4ee6b7114ad4` emitted `MARKETSPHERE_V45_FAULT_CERT_PASS` with:
- `mode=atomic_checkpoint_recover`
- `result=LAST_COMMITTED_STATE_RECOVERED`
- expected orphan temp `.checkpoints.json.atomic-crash.tmp` present
- capital authority `NONE`

The same exact seven-field proof equality and deterministic replay checks apply.

### Torn-final fail-closed detection — PASS
Deployment `d9428eec-e9d3-4453-9bf3-8bfadada49b3` emitted `mode=wal_torn_final`, `result=BLOCK_DETECTED`, `capital_authority=NONE`.

Deployment `7129748f-797a-4447-b3d7-89bea50fbf68` emitted `mode=checkpoint_torn_final`, `result=BLOCK_DETECTED`, `capital_authority=NONE`.

## Preserved failures / falsifications
- Deployment `4837ad14-ba0e-4e01-a78f-da370f86d32c`: FAILED after container start; no fault-mode marker visible in retained Railway logs.
- Deployment `06d06df4-3084-479d-be89-a1ef60ef8392`: FAILED after container start; no fault-mode marker visible in retained Railway logs.

These failed runs are preserved as evidence. Their timing is consistent with the intended pre-rename crash campaign, but the retained logs do not directly bind either deployment ID to a specific `FAULT_MODE`. Therefore they are **not** counted as direct crash-half proof.

## Current certification disposition
- Atomic WAL pre-rename recovery behavior: **DIRECTLY VERIFIED**.
- Atomic checkpoint pre-rename recovery behavior: **DIRECTLY VERIFIED**.
- Explicit deployment-ID-to-pre-rename-crash-mode binding: **HOLD / not directly evidenced in retained logs**.
- Final clean recovery on the exact runtime SHA: **PASS**.
- v4.5 final certification verdict: **HOLD** pending direct crash-half binding (or a fresh, explicitly logged bounded rerun), then final evidence freeze/review.

No result in this file expands market-data authority, funded routing, T0 promotion, or capital authority.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.