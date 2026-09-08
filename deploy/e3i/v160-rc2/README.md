# E3I v160 RC2 — Production Cutover Source

This directory contains the curated production-source subset for E3I v160 RC2.

**Current state:** local verification passed; production remains fail-closed.

- Scientific state: `SOFTWARE_READY_PRE_EMPIRICAL`
- Empirical sessions: `0/5`
- Physical authority: `NONE`
- Deployment authority: `NONE`
- Production ready: `FALSE`
- Release freeze: `ON`

The Dockerfile is pinned to the Docker Hardened Images Node 22.23.2 / Alpine 3.24 digest.
DHI registry credentials must be supplied only through GitHub Actions secrets or Railway's supported private-registry credential mechanism. Never commit them.

Designed, Engineered, and Built by: Azad Ahmed — In Mission To Solve Intelligence At Civilizational Scale.
