# GitHub CI cutover path

## Required GitHub Actions secrets
Configure these in the repository UI. Do **not** place them in source code or chat:

- `DHI_USERNAME`
- `DHI_TOKEN` — use a read-only Docker Hardened Images token where possible.

The build workflow uses the repository `GITHUB_TOKEN` for GHCR publication; no personal GHCR write token is required by the workflow.

## Sequence
1. Dispatch **E3I v160 RC2 — Build, Scan, Publish**.
2. Require tests, `npm audit`, and the HIGH/CRITICAL image policy to pass.
3. Record the published GHCR digest and provenance attestation.
4. GHCR personal-account packages are private by default. If Railway is not on Pro, change the E3I container package visibility to **Public** in GitHub Package settings. Public GHCR containers can be pulled anonymously.
5. Point a Railway canary/new service at `ghcr.io/aahmed2440/e3i:v160-rc2`.
6. Run **E3I v160 RC2 — Railway Smoke Verification** against the canary URL.
7. Keep v156 as rollback until independent security review and the remaining production gates pass.

Production must remain FALSE and release freeze ON during this sequence.
