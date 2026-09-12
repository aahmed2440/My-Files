# CryptoSphere Pilot Hosting Boundary — 2026-09-10

## Purpose
Define the isolated hosted Pilot boundary before any public exposure or canary activity.

## Railway isolation
- Dedicated Railway project: `CryptoSphere Pilot`
- Project ID: `d97e67d0-aa94-43f1-b727-d63deadecbf0`
- Dedicated service: `cryptosphere-pilot`
- Service ID: `7c0e7b73-2e9b-41e0-9f78-4df4e9b0a52d`
- Environment ID: `813e5b56-edf8-413a-9725-47732474d61f`
- Service currently has no source attached and no deployment has been triggered.
- Existing CryptoSphere recovery/production service remains untouched.

## Pre-staged fail-closed configuration
The isolated service has been pre-staged, without deployment, with:
- `CRYPTOSPHERE_OWNER_AUTH_MODE=external`
- deployment-only high-entropy identity proxy secret
- `CRYPTOSPHERE_ASSETS_JSON=[]`
- `CRYPTOSPHERE_CORE_MODE=ADVISORY_ONLY`
- bounded Core concurrency, rate, request-body size, and upstream timeout
- `NODE_ENV=production`

The identity proxy secret value is intentionally not recorded in this repository document.

## Promotion invariant
No source attachment, public domain, external canary, or Pilot GO until the Pilot Certification workflow passes the exact release-byte, ZIP-integrity, manifest, package, compile, Docker-build, runtime, security-header, and trusted-identity gates.

## Authority invariant
- `production_execution=false`
- human governance required
- no autonomous policy activation
- no autonomous policy mutation
- no automatic evidence collection
- no automatic scheduling

## Current disposition
**HOSTING BOUNDARY READY / PILOT DEPLOYMENT HOLD** pending exact repository artifact repair and green certification.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
