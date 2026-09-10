# CryptoSphere PRIMETIME Gate

Status: **HOLD / evidence-building**

This gate intentionally separates **service availability** from **production certification**. A healthy recovery shell or gateway is not evidence that the full CryptoSphere runtime is certified.

## P0 — Must pass before any production promotion

- [ ] Authoritative CryptoSphere source is held in a private repository with least-privilege access.
- [ ] Release bytes are reproducible and SHA-256 identities match the approved Owner Console, gateway, and Core artifacts.
- [ ] Integrated Owner Console + Analytical Core runtime boots from source/artifacts without recovery-shell substitution.
- [ ] `/health` and `/api/health` return expected product/version/mode and fail closed when either child runtime is unavailable.
- [ ] Production boundary remains `ADVISORY_ONLY`; `production_execution=false`; `production_mutation=false`.
- [ ] Gateway rejects mutation methods until a separately reviewed and signed human GO authorizes a new capability boundary.
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

- Read-only HTTP gateway methods only (`GET`, `HEAD`, `OPTIONS`).
- Core forced to `ADVISORY_ONLY`.
- No production execution or mutation authority.
- No arbitrary scanning.
- Proxy-chain identity headers from external callers are stripped before internal proxying.
- Request IDs and structured audit events are generated without logging authorization or cookie values.
- Child-process failure terminates the gateway so the hosting platform can restart the complete unit atomically.
- Search-engine indexing is discouraged at the gateway.

## Promotion rule

**No deploy, merge-to-production, capability expansion, or mutation enablement solely because CI is green.** Promotion requires P0 evidence plus explicit human GO.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
