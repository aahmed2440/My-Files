# MarketSphere Schwab/TOS Read-Only Adapter v0.1

Purpose: prove a real Schwab/thinkorswim market-data stream with explicit provenance and heartbeat observability before MarketSphere labels the source LIVE.

## Safety / authority boundary
- Market data only.
- No order placement, cancellation, account mutation, or trading route exists in this service.
- `trading_authority` is hard-coded to `NONE`.
- A healthy process is not treated as a healthy feed.

## Feed states
`DISABLED -> AUTH_REQUIRED -> AUTHENTICATING -> CONNECTING -> LIVE`, with `DEGRADED`, `STALE`, and `DISCONNECTED` derived from heartbeat/data freshness.

## Required canary configuration
Set these as Railway secrets/variables, not in Git:
- `SCHWAB_TOS_ENABLED=true`
- `SCHWAB_ACCESS_TOKEN=<short-lived bearer token>`
- `SCHWAB_TOS_SYMBOLS=SPY,QQQ`
- optional `SCHWAB_TOS_SERVICES=LEVELONE_EQUITIES`
- optional `SCHWAB_HEARTBEAT_STALE_MS=45000`
- optional `SCHWAB_DATA_STALE_MS=90000`

`SCHWAB_ACCESS_TOKEN` is intentionally a canary-only bootstrap in v0.1. Durable OAuth refresh-token rotation is a separate production gate so a secret-lifecycle shortcut cannot be mistaken for production readiness.

## Endpoints
- `GET /health/live` — process liveness
- `GET /health/ready` — process readiness plus feed gate state
- `GET /api/v1/feed/status` — provenance/heartbeat status
- `GET /api/v1/feed/proof` — 200 only after data evidence; 425 before evidence
- `GET /api/v1/feed/contract` — state/authority contract

## Production proof criteria
MarketSphere may label the source `LIVE` only when all are observed:
1. Schwab user-preference call authenticated.
2. WebSocket connected.
3. ADMIN LOGIN returned code 0.
4. SUBS returned code 0.
5. Heartbeat is fresh.
6. At least one market-data event has been received and cryptographically fingerprinted.

Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale
