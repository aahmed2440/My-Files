# CryptoSphere PRIMETIME Forensic Findings — 2026-09-10

Status: **HOLD — artifact identity / archive integrity mismatch**

This document records evidence observed by the GitHub Actions certification lane. It does not authorize deployment or change the approved artifact identities.

## Approved manifest identities

From `SHA256.txt`:

- Owner runtime expected SHA-256: `6d58d4023eedbf319a162f15541628c512acb9751a06d47dcc049d5d988dd146`
- Core runtime expected SHA-256: `bc2c527f358174715b569c32f10d9a28f85d8d8724fcbae407963c9922a1b997`

## Checked-in bytes observed by CI

On 2026-09-10, the PR certification runner computed:

- Owner runtime observed SHA-256: `109f8ba60ae01c7686d7fd12a1065fc721fb90e7eecc8852ae32ffb76bfa050a`
- Core runtime observed SHA-256: `6ec209baf3c7bbe6c2d2f741a69341d77e7ae98275cb59179f06c1362ac04f90`
- Owner runtime size: `7509` bytes
- Core runtime size: `15008` bytes

Both observed identities differ from the approved manifest.

## Structural validation result

The artifact diagnostics workflow also reported that the checked-out archive could not be opened as a complete ZIP by Python `zipfile` (`BadZipFile`). This is consistent with incomplete/corrupted ZIP structure or missing end/central-directory records; it must not be treated as a valid release archive solely because the byte stream begins with a ZIP local-header signature.

## Risk-off interpretation

1. The approved manifest and the checked-in artifacts are not a valid release pair.
2. Updating `SHA256.txt` to the observed values would merely bless unapproved bytes and is therefore prohibited.
3. Reconstructing a damaged archive may be useful as a forensic/recovery experiment, but the reconstructed SHA-256 identity is a *new artifact identity* and cannot inherit approval from the original manifest.
4. Any recovered runtime must remain isolated, read-only/advisory, and non-production until independently verified against authoritative source/release evidence.
5. Production promotion remains prohibited until exact approved release bytes are restored or a new artifact set is deliberately rebuilt, reviewed, signed/attested, and approved under the PRIMETIME gate.

## Recovery decision tree

### Path A — Restore exact approved release bytes (preferred)

Locate authoritative copies matching the approved SHA-256 values. Verify hashes before extraction, validate archive paths/CRC, build the integrated image, and run full certification.

### Path B — Rebuild from authoritative source

If exact release bytes cannot be recovered, rebuild Owner Console and Analytical Core from authoritative source with pinned dependencies. Produce new immutable hashes, provenance/SBOM evidence, security results, and a deliberate human approval record. Do **not** reuse the old hashes.

### Path C — Archive reconstruction (forensics only)

Use ZIP repair/reconstruction solely to determine whether the contained runtime remains recoverable. Any resulting archive is evidence, not a release artifact, unless it subsequently completes Path B-level review and approval.

## Current production boundary

No production change is authorized by this finding. `cryptosphere-prod` remains on the controlled recovery posture with production execution and mutation disabled.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
