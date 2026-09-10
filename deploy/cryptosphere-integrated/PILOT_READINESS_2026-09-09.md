# CryptoSphere Pilot Readiness — 2026-09-09

## Verified locally
- Preserved integrated Owner artifact SHA-256 matches repository manifest exactly.
- Preserved integrated Core artifact SHA-256 matches repository manifest exactly.
- Both preserved ZIP archives pass integrity tests and unpack cleanly.
- Owner Console 1.4.1 starts and reports `SERVICE_READY`.
- Default/no-allowlist Owner posture is `DEMO_ONLY` and performs no external contact.
- External identity mode rejects unauthenticated, spoofed-without-proxy-key, and unprivileged requests.
- External identity mode returns configured asset metadata without target URL disclosure for a valid trusted OWNER envelope.
- Unknown asset IDs fail closed with HTTP 403 before any target contact.
- Analytical Core 0.90.1 starts ready in `ADVISORY_ONLY` mode.
- Core status reports a 52/52 regression baseline and no execution/auto-policy/auto-collection/auto-scheduling authority.
- Core UI bootstrap and mission-proportional analysis endpoint execute successfully.
- Integrated gateway serves Owner at `/`, Core at `/core/`, aggregate `/health`, and Core API paths through `/core/api/v1/`.
- Browser API path transform works under `/core/`.
- Gateway security headers are present.

## Pilot-hardened gateway candidate — local certification
A separate, non-production candidate was built and syntax-checked locally. Candidate SHA-256: `5bacbada0c2163a89e3f3feaa8ac01714b3ee5dd04c8fc302a4c37d601ca573e`.

With external identity mode enabled and an empty configured asset list, the following acceptance checks passed without contacting a real external target:
- `/health` => 200 and reports `TRUSTED_EXTERNAL_REQUIRED`, Core limits, `production_execution=false`, and human governance.
- Core unauthenticated request => 401.
- Spoofed OWNER headers without the deployment proxy key => 401.
- VIEWER with the correct test proxy key => 401.
- Verified OWNER envelope with the correct test proxy key => 200.
- Owner configured-assets request unauthenticated => 401.
- Owner configured-assets request with verified OWNER envelope => 200.
- Core OpenAPI surface => 404.
- Unsupported Core `DELETE` => 405.
- Valid mission-proportional analytical POST => 200 while preserving `production_execution=false` and `human_governance_required=true`.
- Request exceeding the configured Core Pilot body limit => 413.
- Security headers include HSTS, frame denial, MIME-sniffing protection, referrer policy, permissions policy, COOP, and CORP.

The candidate also includes bounded Core request-body, concurrency, per-principal rate, and upstream-timeout controls. **This candidate is not yet the repository gateway and is not deployed.** Repository promotion remains HOLD until the exact reviewed gateway change is present in the Pilot branch and CI exercises it.

## P0 blockers before hosted Pilot GO
1. Replace the truncated/corrupt GitHub integrated runtime ZIPs with the preserved exact bytes; never change the manifest to bless damaged bytes.
2. Promote the reviewed trusted-external-identity Core gateway hardening into the Pilot branch and rerun the encoded fail-closed CI checks.
3. Promote and verify bounded request-body/rate/concurrency/timeout guardrails for analytical Core endpoints before Internet exposure.
4. Promote only after CI rebuilds the exact integrated image from validated artifacts.
5. Configure `CRYPTOSPHERE_OWNER_AUTH_MODE=external` and a deployment-only high-entropy `CRYPTOSPHERE_IDENTITY_PROXY_KEY`.
6. Configure exactly one explicitly authorized public HTTPS:443 canary in `CRYPTOSPHERE_ASSETS_JSON`.
7. Hosted verification: health, auth, URL non-disclosure, unknown asset 403, canary TLS/HTTP metadata, and security headers.
8. Owner review of canary evidence, followed by an explicit Pilot GO/HOLD decision.

## Governance boundary
- `production_execution=false`
- `automatic_policy_activation=false`
- `automatic_policy_mutation=false`
- `automatic_evidence_collection=false`
- `automatic_scheduling=false`
- `human_governance_required=true`

## Disposition
**HOLD for public Pilot; READY for continued local/integration certification work.**
