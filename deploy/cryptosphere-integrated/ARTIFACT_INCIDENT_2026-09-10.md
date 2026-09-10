# CryptoSphere Artifact Integrity Incident — 2026-09-10

Status: **OPEN / PROD promotion blocked**

## Scope

The CryptoSphere PRIMETIME certification workflow detected that the checked-in Owner Console and Analytical Core runtime archives do not match their committed SHA-256 release manifest and are not currently parseable as valid ZIP archives by Python's standard ZIP implementation.

## Evidence

Committed manifest values:

- `cryptosphere-owner-runtime.zip`: `6d58d4023eedbf319a162f15541628c512acb9751a06d47dcc049d5d988dd146`
- `cryptosphere-core-runtime.zip`: `bc2c527f358174715b569c32f10d9a28f85d8d8724fcbae407963c9922a1b997`

CI-observed values from the PR checkout:

- `cryptosphere-owner-runtime.zip`: `109f8ba60ae01c7686d7fd12a1065fc721fb90e7eecc8852ae32ffb76bfa050a` — 7509 bytes
- `cryptosphere-core-runtime.zip`: `6ec209baf3c7bbe6c2d2f741a69341d77e7ae98275cb59179f06c1362ac04f90` — 15008 bytes

Both archives were rejected by the initial release-identity gate. The diagnostic job then raised `zipfile.BadZipFile: File is not a zip file` while opening the Owner archive.

The standalone `deploy/cryptosphere-owner` and `deploy/cryptosphere-core` folders reference the same Git blob identities as the integrated copies, so copying those files would reproduce the same evidence condition rather than repair it.

The archives and manifest were introduced together in commit `ed5753c8d4f04e4e3f335c31a1a73156545000a7` (`Add integrated CryptoSphere one-slot production runtime`). Therefore this is not being treated as ordinary drift introduced by the current PRIMETIME hardening branch.

## Risk-off disposition

- Do **not** update the committed manifest merely to match the observed hashes.
- Do **not** represent the current archive bytes as approved release artifacts.
- Do **not** merge or deploy the integrated runtime while artifact provenance is unresolved.
- Keep the live Railway service on the controlled recovery shell with production execution/mutation disabled.
- Permit reconstruction only in ephemeral CI scratch space for forensic analysis; reconstructed bytes are evidence, not automatically trusted release artifacts.

## Exit criteria

This incident may close only after one of the following produces a traceable, independently verifiable source of truth:

1. recover the exact originally approved artifacts and verify their expected SHA-256 identities; or
2. rebuild Owner Console and Core from authoritative source using a deterministic pipeline, generate a new signed/provenanced manifest, and pass the full PRIMETIME certification suite.

In either case, production promotion still requires the remaining P0 gates: private authoritative source, identity/RBAC/SSO controls, security review, canary, rollback evidence, and explicit human GO.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
