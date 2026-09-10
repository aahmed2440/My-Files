# CryptoSphere PRIMETIME Gate

Status: **HOLD / evidence-building**

This gate intentionally separates **service availability** from **production certification**. A healthy recovery shell or gateway is not evidence that the full CryptoSphere runtime is certified.

## P0 — Must pass before any production promotion

- [ ] Authoritative CryptoSphere source is held in a private repository with least-privilege access.
- [ ] Release bytes are reproducible and SHA-256 identities match the approved Owner Console, gateway, and Core artifacts.
- [ ] Integrated Owner Console + Analytical Core runtime boots from source/artifacts without recovery-shell substitution.
- [ ] `/health` and `/api/health` return expected product/version/mode and fail closed when either child runtime is unavailable.
- [ ] Production boundary remains `ADVISORY_ONLY`; `production_execution=false`; `production_mutation=false`.
- [ ] Gateway permits only passive reads plus explicitly allowlisted, bounded non-mutating analytical/check capabilities; all unapproved or state-changing capabilities fail closed until a separately reviewed and signed human GO authorizes a new capability boundary.
- [ ] One explicitly allowlisted public HTTPS:443 target is validated; unauthorized or unknown targets return 401/403/deny behavior as designed.
- [ ] SSO/OIDC authentication and RBAC are enforced before privileged access.
- [ ] MFA is enforced by the enterprise identity provider for privileged roles.
- [ ] Audit events are centralized, tamper-resistant, correlated by request ID, and retained according to the approved retention policy.
- [ ] Secrets are not stored in source, logs, browser storage, build output, or downloadable artifacts.
- [ ] TLS, security headers, CSP, cookie settings, proxy trust, and CORS posture are independently verified.
- [ ] Dependency and container vulnerability scans contain no unresolved Critical/High findings accepted without documented risk treatment.
- [ ] Backup/restore is tested when persistent production data is introduced.
- [ ] Canary passes functional, security, failure, rollback, and observability checks.
- [ ] Independent review is complete and a named human owner signs GO.

## Current forensic findings — 2026-09-10

- The manifest-approved SHA-256 values remain:
  - Owner Console: `6d58d4023eedbf319a162f15541628c512acb9751a06d47dcc049d5d988dd146`
  - Analytical Core: `bc2c527f358174715b569c32f10d9a28f85d8d8724fcbae407963c9922a1b997`
- CI observed different SHA-256 values for the currently checked-in archives; therefore current bytes are not approved release bytes.
- The original `cryptosphere-prod-20260907` Owner Console V1.4.1 cutover commit references Git blob `efeea8f328944b206a6e907248cf2d1efb2a28f4` for `cryptosphere-owner-runtime.zip`.
- The original `cryptosphere-core-prod-20260907` Core V0.90.1 cutover commit references Git blob `3970a1f659d57089b0bdcd8d779dd06d87c577e4` for `cryptosphere-core-runtime.zip`.
- Those are the same Git blob identities used by the current integrated package, so the historical cutover branches do **not** provide alternate known-good archive bytes.
- A full reachable-history provenance hunt found no copy matching either manifest-approved SHA-256 identity. Continued blind search for a hidden Git copy is therefore closed as a primary recovery strategy.
- Bounded forensic recovery identified complete CRC-verified source records, but the Owner archive truncates at `app.js` and the Core archive truncates during `capacity_robustness.py`.
- Archive reconstruction/testing is forensic only. Reconstructed bytes must never be silently promoted, re-manifested, or treated as the approved release artifacts.
- The primary recovery path is now: recover intact source evidence, reconstruct missing source from documented contracts, establish a source-first deterministic build, assign new reviewed release identities, and re-certify the integrated runtime.

## P1 — Production architecture target

- HTTPS ingress with controlled proxy trust.
- At least two application replicas for production availability when state is externalized.
- Shared PostgreSQL with TLS verification (`sslmode=verify-full`) when persistence is enabled.
- Enterprise OIDC/SSO + RBAC + least privilege.
- Central telemetry/SIEM and long-lived immutable/tamper-resistant audit records.
- External signer/key custody for any future signing authority; no private signing keys embedded in application runtime.
- Tested rollback and restore procedures.

## Current branch invariants

The PRIMETIME hardening branch keeps CryptoSphere deliberately bounded:

- Passive gateway methods are `GET`, `HEAD`, and `OPTIONS`.
- `POST` is permitted only for exact, explicitly allowlisted non-mutating capabilities required by the existing product contract: Owner read-only allowlisted check (`/api/check`) and Core mission-proportional analysis (`/core/api/v1/renewal/mission-proportional`).
- Allowed analytical/check request bodies are bounded; arbitrary POST routes and all unapproved/state-changing capabilities fail closed.
- Core is forced to `ADVISORY_ONLY`.
- No production execution or mutation authority.
- No arbitrary scanning.
- External proxy-chain headers are stripped before internal proxying.
- External CryptoSphere identity-assertion headers are stripped until a separately trusted SSO/identity-proxy boundary is integrated; privileged configured checks therefore fail closed rather than trust internet-supplied assertions.
- Request IDs and structured audit events are generated without logging authorization or cookie values.
- Child-process failure terminates the gateway so the hosting platform can restart the complete unit atomically.
- Search-engine indexing is discouraged at the gateway.
- Static PRIMETIME governance CI is independently separable from legacy artifact identity so a known-bad package cannot mask current control quality.

## Promotion rule

**No deploy, merge-to-production, capability expansion, manifest rewrite, or mutation enablement solely because CI is green.** Promotion requires P0 evidence plus explicit human GO.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
