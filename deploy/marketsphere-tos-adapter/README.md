# MarketSphere Schwab/TOS Read-Only Adapter v0.1.2

Purpose: prove a real Schwab/thinkorswim market-data stream with explicit provenance and heartbeat observability before MarketSphere labels the source LIVE.

## Safety / authority boundary
- Market data only.
- No order placement, cancellation, account mutation, or trading route exists in this service.
- `trading_authority` is hard-coded to `NONE`.
- `production_mutation` remains false.
- A healthy process is not treated as a healthy feed.
- Detailed feed diagnostics are disabled by default at the QTrust bridge.

## Feed states
`DISABLED -> AUTH_REQUIRED -> AUTHENTICATING -> CONNECTING -> LIVE`, with `DEGRADED`, `STALE`, and `DISCONNECTED` derived from heartbeat/data freshness.

## Required canary configuration
Set these as Railway secrets/variables, not in Git:
- `SCHWAB_TOS_ENABLED=true`
- `SCHWAB_ACCESS_TOKEN=<short-lived bearer token>`
- `SCHWAB_STREAM_HOST_ALLOWLIST=<approved streamer hostname or comma-separated hostnames>`
- `SCHWAB_TOS_SYMBOLS=SPY,QQQ`
- optional `SCHWAB_TOS_SERVICES=LEVELONE_EQUITIES`
- optional `SCHWAB_HEARTBEAT_STALE_MS=45000`
- optional `SCHWAB_DATA_STALE_MS=90000`
- optional `SCHWAB_PREF_RESPONSE_MAX_BYTES=524288`

The adapter will not begin authenticated streaming unless the streamer host allowlist is present. Streamer URLs must use `wss://`, contain no embedded username/password, use the default/443 port, and match the configured host allowlist exactly or by subdomain.

`SCHWAB_ACCESS_TOKEN` is intentionally a canary-only bootstrap in v0.1.2. Durable OAuth refresh-token rotation is a separate production gate so a secret-lifecycle shortcut cannot be mistaken for production readiness.

## QTrust bridge exposure controls
- `TOS_EXPOSE_DIAGNOSTICS=false` by default. When false, detailed `/tos/api/v1/feed/*` endpoints return 403.
- `QTRUST_BRIDGE_TRUST_FORWARD_HEADERS=false` by default. Spoofable forwarding/client-IP headers are removed before proxying to the internal QTrust runtime.
- Do not enable either control casually on a public endpoint; any change must be justified by the ingress trust model.

## Endpoints
Public-safe by default:
- `GET /tos/health/live` — process liveness
- `GET /tos/health/ready` — bounded readiness state

Detailed diagnostics, only when explicitly enabled:
- `GET /tos/api/v1/feed/status`
- `GET /tos/api/v1/feed/proof`
- `GET /tos/api/v1/feed/contract`

## Production proof criteria
MarketSphere may label the source `LIVE` only when all are observed:
1. Schwab user-preference call authenticated against the fixed HTTPS preference endpoint.
2. Returned streamer URL passes the configured host allowlist and `wss://` validation.
3. WebSocket connected.
4. ADMIN LOGIN returned code 0.
5. SUBS returned code 0.
6. Heartbeat is fresh.
7. At least one market-data event has been received and cryptographically fingerprinted.

## Remaining production gate
The current QTrust bridge still reconstructs/evaluates the underlying QTrust server from `SERVER_GZ_B64`. That executable-code-through-environment mechanism is a temporary staging boundary, not the target production architecture. Final production must use a source-controlled or immutable-image QTrust runtime with verifiable build provenance.

Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale
