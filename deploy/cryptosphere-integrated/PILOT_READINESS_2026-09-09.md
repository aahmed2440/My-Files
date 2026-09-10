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

## P0 blockers before hosted Pilot GO
1. Replace the truncated/corrupt GitHub integrated runtime ZIPs with the preserved exact bytes; never change the manifest to bless damaged bytes.
2. Add trusted external identity enforcement to the `/core/*` gateway surface and verify direct/spoofed requests fail closed.
3. Add request-body/rate/concurrency guardrails to analytical Core endpoints before Internet exposure.
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
