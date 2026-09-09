# MarketSphere — Schwab/TOS Adapter Certification Gap Analysis

## Status

The currently deployed staging bridge remains an **authentication-gated engineering adapter**, not a certified real-time market source.

Observed staging state before Schwab API approval/OAuth:

- mode: `AUTH_REQUIRED`
- auth: `MISSING_ACCESS_TOKEN`
- subscription: `NOT_SUBSCRIBED`
- socket: `DISCONNECTED`
- data messages: `0`
- heartbeats: `0`
- trading authority: `NONE`

## Findings in the current v0.1 adapter

### 1. Subscription ACK is currently allowed to set mode `LIVE`

The current adapter sets mode to `LIVE` when a `SUBS` response returns code 0. A successful subscription command is useful evidence, but it is not proof that market data has actually arrived.

**Required correction:** subscription ACK should move the adapter into an observing/subscribed state. A real-source certification decision must require first-data proof and the rest of the empirical source contract.

### 2. First-data proof exists but is not yet the MarketSphere source-proof contract

The state layer creates a SHA-256 proof when a data frame arrives. This proves that an observed data-frame summary existed, but the current proof does not yet include all MS-L2 fields such as entitlement verification, real-time/delayed status, heartbeat age, full timestamp/freshness assertions, continuity methodology and governed review decision.

### 3. Heartbeat is observed but not required for the initial LIVE transition

Heartbeat notifications are recorded. However, the current `SUBS` success path can mark the adapter LIVE before heartbeat evidence exists.

**Required correction:** heartbeat evidence must participate in eligibility/readiness, with an explicit freshness threshold.

### 4. Real-time versus delayed status is not tracked as a certification gate

Public streamer protocol mirrors show a `delayed` indicator in level-one market-data content. The current adapter records observed symbols but does not aggregate or expose the delayed/real-time status as a certification gate.

**Required correction:** real-time certification requires entitlement evidence and observed `delayed = false` for the instrument/service being certified. A delayed observation must never satisfy a real-time source claim.

### 5. Entitlement is not independently represented

Authentication proves the token/session is accepted; it does not by itself prove the specific data entitlement needed for the requested service/instrument.

**Required correction:** capture an explicit `entitlement_verified` result derived from provider behavior/metadata and the observed real-time status, without persisting credentials.

### 6. Sequence integrity is not empirically implemented

The state object contains `sequence_gaps`, but the current data handler does not derive that value from a demonstrated provider sequence field or another validated continuity mechanism.

Publicly available streamer protocol mirrors inspected during this review describe request IDs, subscription responses, heartbeat notifications, data timestamps and data content. They did not provide sufficient evidence here to assert a universal market-data sequence number.

**Required correction:** keep sequence integrity `UNVERIFIED` until authoritative Schwab documentation/portal material confirms a usable mechanism, or until a separately governed alternative continuity method is designed and empirically validated. Do not default sequence gaps to zero as proof.

### 7. Per-instrument/service certification is required

A connected stream can carry multiple services and symbols with different entitlement or delayed characteristics.

**Required correction:** certification evidence should be scoped to provider + service + instrument (or a rigorously defined homogeneous set), not merely the WebSocket connection.

### 8. Reconnect proof must be empirical

The adapter implements exponential reconnect logic and counts reconnects. That is architecture, not recovery proof.

**Required correction:** after credentials are available, deliberately observe disconnect/reconnect behavior and prove subscription restoration, heartbeat recovery, fresh data recovery and no false LIVE state during the gap.

## Target state machine

Recommended v0.2 certification state model:

1. `DISABLED`
2. `AUTH_REQUIRED`
3. `AUTHENTICATING`
4. `CONNECTING`
5. `SUBSCRIBED_AWAITING_DATA`
6. `DATA_OBSERVED`
7. `HEARTBEAT_VERIFIED`
8. `REALTIME_STATUS_VERIFIED`
9. `CONTINUITY_PENDING` or `CONTINUITY_VERIFIED`
10. `ELIGIBLE_FOR_GOVERNED_SOURCE_CERTIFICATION_REVIEW`
11. `DEGRADED`
12. `STALE`
13. `DISCONNECTED`

No state in this adapter grants capital authority or automatic live-source promotion.

## Mandatory proof contract

The adapter should emit normalized evidence conforming to:

- `SOURCE_EVIDENCE_CONTRACT.md`
- `schemas/source-evidence.schema.json`
- `lib/source-proof.js`

A valid proof only makes the source **eligible for governed review**.

## Governance

- Schwab credentials remain outside evidence artifacts.
- OAuth/access tokens are never logged or persisted into certification bundles.
- configuration flags are not empirical proof.
- subscription ACK is not first-data proof.
- Owner is not capital authority.
- `T0 = LOCKED`.
- `capital_authority = NONE`.

**Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale**
