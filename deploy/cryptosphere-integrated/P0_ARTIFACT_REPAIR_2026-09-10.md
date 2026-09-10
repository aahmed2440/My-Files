# CryptoSphere P0 Artifact Repair — 2026-09-10

## Purpose
Restore the two exact approved runtime archives in the Pilot branch without changing the release manifest or weakening provenance.

## Scope
Replace **only** these repository objects on branch `cryptosphere/pilot-hardening-2026-09-09`:

- `deploy/cryptosphere-integrated/cryptosphere-owner-runtime.zip`
- `deploy/cryptosphere-integrated/cryptosphere-core-runtime.zip`

Do **not** edit `deploy/cryptosphere-integrated/SHA256.txt`.

## Approved Owner artifact
- Filename: `cryptosphere-owner-runtime.zip`
- Exact size: `27,977` bytes
- SHA-256: `6d58d4023eedbf319a162f15541628c512acb9751a06d47dcc049d5d988dd146`
- ZIP integrity: required PASS

## Approved Core artifact
- Filename: `cryptosphere-core-runtime.zip`
- Exact size: `95,596` bytes
- SHA-256: `bc2c527f358174715b569c32f10d9a28f85d8d8724fcbae407963c9922a1b997`
- ZIP integrity: required PASS

## Current known-bad repository observations
- Owner repository object: `7,509` bytes — invalid/truncated.
- Core repository object: `15,008` bytes — invalid/truncated.

These objects must not be reused, repackaged, recompressed, regenerated, or blessed by changing the manifest.

## Required repair procedure
1. Use the preserved approved Owner and Core ZIP files exactly as recovered.
2. Replace only the two target ZIP objects above on the Pilot branch.
3. Preserve filenames exactly.
4. Preserve `SHA256.txt` unchanged.
5. Commit the binary replacements as one narrowly scoped repair commit when practical.
6. Do not add unrelated code, configuration, documentation, or deployment changes to that repair commit.

## Automatic acceptance after replacement
The new PR head must independently earn all four mandatory gates on the **same exact SHA**:

1. Public Repository Release Guard — PASS.
2. Pilot Control-Plane Gate — PASS.
3. Artifact Intake Gate — PASS.
4. Full Pilot Certification — PASS.

Artifact Intake must prove exact byte counts, exact SHA-256 values, ZIP integrity, and manifest binding. Full Pilot Certification must then prove package structure, syntax/compile, Docker image build, integrated Owner/Core readiness, browser/API surfaces, security headers, `ADVISORY_ONLY`, no production execution, human governance, and fail-closed trusted identity behavior.

## Promotion boundary
Even after 4/4 GREEN:
- no production/recovery service mutation;
- deploy only to the isolated CryptoSphere Pilot Railway boundary;
- first boot with `CRYPTOSPHERE_ASSETS_JSON=[]`;
- no external canary until hosted acceptance passes;
- no promotion until explicit human GO/HOLD review.

## Abort conditions
HOLD immediately if either artifact size/hash differs, ZIP integrity fails, `SHA256.txt` changes to match bad bytes, the PR head moves after certification, or any mandatory gate is not green on the exact reviewed SHA.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
