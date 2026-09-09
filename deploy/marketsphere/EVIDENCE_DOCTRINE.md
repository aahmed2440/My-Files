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
- the persisted chain head agrees with the final manifest entry;
- the evidence classification is appropriate for the claim.

The falsification suite deliberately alters an evidence record, requires integrity `FAIL`, restores the exact original bytes, and requires `PASS` again.

`SIMULATED_APPLICATION_EVIDENCE` can validate plumbing and failure behavior but can never certify CME, Schwab, or any real provider as LIVE.

## Source-certification rule

A real market source may be called `CERTIFIED` only after empirical proof exists for authentication, subscription acknowledgement, packet receipt, heartbeat, timestamp integrity, sequence integrity, freshness and provenance.

**Environment/configuration declarations are not empirical source evidence.** Even if all CME or Schwab declaration flags are set, the application-certification runtime does not elevate those sources to `LIVE` or `CERTIFIED` without empirical adapter evidence.

## Failure-state rule

The Owner-only synthetic harness may exercise `HEALTHY`, `DEGRADED`, `STALE`, `OFFLINE`, and `RESET`. These states are permanently labeled simulated and cannot promote a real source.

## Recovery rule

Durability is proven by observation, not configuration alone. The minimum recovery proof is:

1. persist state/evidence;
2. record current boot ID;
3. stop/restart runtime;
4. rediscover prior state;
5. observe a distinct new boot ID;
6. preserve prior evidence and hash-chain integrity.

## Evidence-store availability rule

Evidence history is not silently deleted to recover disk space. The evidence store exposes bounded capacity telemetry using:

- `MS_EVIDENCE_WARN_BYTES` — readiness becomes `WARN` as the configured warning threshold is reached;
- `MS_EVIDENCE_HARD_BYTES` — nonessential evidence writes receive explicit backpressure at the hard threshold.

Essential boot/shutdown evidence remains best-effort. Physical storage exhaustion may still prevent writes and must be surfaced operationally rather than concealed.

## Abuse-resistance rule

Evidence-producing unauthenticated paths are treated as a storage-amplification surface. Browser-proof writes are same-origin checked when a browser supplies `Origin`, repeated browser-proof writes are rate-limited, Owner-auth denial evidence is independently throttled, and repeated capital-denial evidence is throttled while the deny decision itself remains enforced.

Rate controls supplement—not replace—network-edge controls. Reverse-proxy client-address trust must be explicitly reviewed before forwarded addresses are treated as authoritative identity or abuse signals.

## Identity and authority rule

Owner identity is distinct from capital authority. Owner authentication can authorize configuration, source-promotion review, evidence administration and certification tests, but it does not authorize capital action. MarketSphere remains `T0: LOCKED` and `capital_authority: NONE` until a separate governed promotion process is deliberately completed.

## Secret-handling rule

Evidence must never contain passwords, API secrets, OAuth access/refresh tokens, cookies, raw Authorization headers, private keys or brokerage credentials. Logs record only sanitized request metadata and bounded certification state.

## Public-source hygiene rule

The public repository certification lane combines current-tree release guarding with a high-confidence scan across all reachable Git history for dangerous credential/state filenames and recognizable secret formats. The MarketSphere certification workflow pins third-party GitHub Actions to immutable commit SHAs.

A passing high-confidence scan reduces risk; it does not prove the historical absence of every possible secret format. Newly discovered secret classes must be added to the guard and, if found, treated as exposed until rotated/revoked and repository history is remediated as appropriate.

## Certification bundle

The runtime can generate a machine-readable `MS-CERT-*` JSON bundle containing current readiness, source states, recovery status, evidence capacity, evidence-integrity result, recent manifest entries and governance state. A bundle represents the evidence available at generation time; it does not elevate an unverified source.

**Designed, Engineered, & Built By: Azad Ahmed - in a mission to solve intelligence at civilizational scale**
