# MarketSphere v4.5 Atomic Durability Candidate

Date: 2026-09-10
Status: CANDIDATE / RECERTIFICATION REQUIRED
Base: certified v4.4 package on `hardening/marketsphere-v44-parity-clean-20260910`

## Immutable identities
- Build: `4.5.0-beta`
- Runtime SHA-256: `98ec1321cd0bc1f9b6ea3eb6f80b94e9ea882672abadee2067b9d31c77903724`
- Parity cert SHA-256: `76c19b883a8fd4ba10cb0b7102aa3b8f7ca3bfc0185bc66da65aab8d9faf35ea`
- Durability cert SHA-256: `21957d607434680de739853d167a740d22a8c5ed5669cc87b2314521cea55a3d`
- Runner SHA-256: `1ebe5736e2b3283f6903f5bf7b1996af8886bd046f814c57443ad1b600e61378`
- Persistence semantics: `ATOMIC_FSYNC_RENAME_V1`

## Delta from v4.4
The candidate keeps the governed read-only API posture while replacing direct durable metadata/checkpoint/full-WAL replacement writes with:
1. temporary file creation in the target directory;
2. complete write;
3. file `fsync`;
4. atomic rename onto the target;
5. parent-directory `fsync`;
6. temporary-file cleanup on failure.

The candidate also traps durable-store initialization parse/read failures and exposes them as explicit `BLOCK` state rather than allowing a module-load exception to terminate the service before evidence status is available.

`/api/health` and `/api/durable/status` self-identify `atomic_persistence=true` and `persistence_semantics=ATOMIC_FSYNC_RENAME_V1`.

## Local pre-deployment certification — PASS
Exact candidate runtime was syntax-checked under Node 22 and passed:
- governed 10-endpoint parity posture;
- process-local deterministic 2,400-event seed;
- persistent-volume-mode restart simulation with exact seven-field continuity;
- WAL-chain corruption -> `BLOCK` / replay 409;
- syntactically torn WAL -> explicit `BLOCK` / replay 409;
- syntactically torn checkpoint -> explicit `BLOCK` / replay 409;
- zero leaked temporary files after successful commits;
- T0 promotion disabled;
- funded order route locked / HTTP 403;
- capital authority `NONE`.

Local proof fields for this run included 2,400 events and deterministic replay; local instance IDs are non-authoritative test artifacts and are not used as production identity.

## Claim boundary
This file does not promote v4.5 to canonical or production. Railway parity, non-empty persistent recovery, corruption detection, crash-midwrite, and clean-restoration campaigns must pass against this exact runtime SHA before promotion review.

This work does not enable trading. `T0_PROMOTION_ENABLED=false`; funded routing remains locked; `CAPITAL_AUTHORITY=NONE`.
