# MarketSphere Evidence Doctrine

## Objective

MarketSphere must be able to prove every material operational claim with timestamped, attributable, reproducible evidence. A dashboard state is not a certification result unless the underlying evidence can be inspected and its integrity verified.

## Evidence classes

1. **Build evidence** — source commit, app version, CI outcome.
2. **Deployment evidence** — deployment ID, instance ID, boot ID, startup time.
3. **Browser evidence** — request ID, browser-proof event, same-origin API success.
4. **Identity evidence** — Owner denied/pass records without storing secrets.
5. **Persistence evidence** — prior state found after restart; boot continuity verified.
6. **Source evidence** — provider, source timestamp, receive timestamp, sequence, heartbeat, freshness and provenance.
7. **Failure evidence** — degraded, stale, offline, reconnect and recovery transitions.
8. **Governance evidence** — T0 state, capital-authority boundary and explicit denials.

## Record contract

Every evidence record includes an evidence ID, UTC timestamp, event type, classification, request ID where applicable, actor class, MarketSphere version, build SHA, deployment ID, instance ID, boot ID, previous evidence hash, governance boundary, payload and SHA-256 digest.

Records are stored as append-only JSON files. The manifest is append-only JSONL. Each manifest entry points to the record hash and the prior hash, providing a simple tamper-evident chain.

## Integrity rule

A certification claim is valid only when:

- the referenced evidence files exist;
- the SHA-256 digest recomputes correctly;
- the manifest hash matches the record hash;
- the previous-hash chain is continuous;
- the evidence classification is appropriate for the claim.

`SIMULATED_APPLICATION_EVIDENCE` can validate plumbing but can never certify CME, Schwab, or any real provider as LIVE.

## Source-certification rule

A real market source may be called `CERTIFIED` only after empirical proof exists for authentication, subscription acknowledgement, packet receipt, heartbeat, timestamp integrity, sequence integrity, freshness and provenance. Environment-variable declarations are not empirical proof.

## Recovery rule

Durability is proven by observation, not configuration alone. The minimum recovery proof is:

1. persist state/evidence;
2. record current boot ID;
3. stop/restart runtime;
4. rediscover prior state;
5. observe a distinct new boot ID;
6. preserve prior evidence and hash-chain integrity.

## Identity and authority rule

Owner identity is distinct from capital authority. Owner authentication can authorize configuration, source promotion review and certification tests, but it does not authorize capital action. MarketSphere remains `T0: LOCKED` and `capital_authority: NONE` until a separate governed promotion process is deliberately completed.

## Secret-handling rule

Evidence must never contain passwords, API secrets, OAuth access/refresh tokens, cookies, raw Authorization headers, private keys or brokerage credentials. Logs record only sanitized request metadata and bounded certification state.

## Certification bundle

The runtime can generate a machine-readable `MS-CERT-*` JSON bundle containing current readiness, source states, recovery status, evidence-integrity result, recent manifest entries and governance state. A bundle represents the evidence available at generation time; it does not elevate an unverified source.

**Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale**
