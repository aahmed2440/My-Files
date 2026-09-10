# CryptoSphere Pilot Supply-Chain Policy — 2026-09-10

## Purpose
This policy closes the gap between successful CI evidence and an actual Pilot deployment. CryptoSphere Pilot promotion is fail-closed: a branch name, historical PASS, or mutable repository reference is never sufficient authorization to deploy.

## Observed repository posture
- The Pilot branch is currently not protected by GitHub branch protection.
- The repository currently has no repository rulesets.
- The current Pilot commits are not cryptographically signed/verified by GitHub.
- These facts do not invalidate the engineering evidence, but they require compensating controls before deployment.

## Mandatory compensating controls for Pilot
1. Keep PR #12 in DRAFT/HOLD until exact artifact repair and certification are complete.
2. Treat every new commit as invalidating deployment authorization until all mandatory CI gates have been re-observed on that exact head SHA.
3. Deploy only a recorded, reviewed commit SHA. Never authorize deployment from a branch name alone.
4. Immediately before source attachment/deployment, re-read the PR head SHA and require it to equal the reviewed/certified SHA.
5. Require on that same SHA:
   - Public Repository Release Guard: PASS
   - Pilot Control-Plane Gate: PASS
   - Artifact Intake Gate: PASS
   - Full Pilot Certification: PASS
6. Require the two runtime objects to match the authoritative manifest exactly:
   - Owner: 27,977 bytes; SHA-256 `6d58d4023eedbf319a162f15541628c512acb9751a06d47dcc049d5d988dd146`
   - Core: 95,596 bytes; SHA-256 `bc2c527f358174715b569c32f10d9a28f85d8d8724fcbae407963c9922a1b997`
7. Do not rewrite `SHA256.txt` to match unexpected bytes.
8. Keep Railway Pilot promotion and external-canary switches false through initial hosted acceptance.
9. If the PR head changes after certification but before deployment, abort and repeat same-head certification.
10. If the deployed revision cannot be proven to correspond to the certified SHA, HOLD and do not expose a public domain or canary.

## Production-grade follow-on
Before any production-grade release, add repository-level enforcement appropriate to the threat model: protected release branches/rulesets, required status checks, controlled review/merge policy, signed commits or signed release tags where practical, immutable build provenance/attestations, dependency/SBOM review, and least-privilege deployment credentials.

## Authority boundary
This policy grants no deployment authority. CryptoSphere remains `ADVISORY_ONLY`; production execution and autonomous deployment remain false; human governance remains mandatory.

> Increase intelligence. Increase evidence. Increase autonomy carefully. Never silently increase authority.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
