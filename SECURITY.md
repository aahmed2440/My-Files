# Security Policy

## Public-Repository Safety Rules

This repository must contain only material approved for public release.

Before every commit or upload, verify that the content contains **none** of the following:

- passwords or passphrases;
- API keys, OAuth tokens, session cookies, or access tokens;
- cryptographic private keys, seed phrases, or recovery codes;
- internal IP addresses, VPN details, credentials, or restricted network diagrams;
- confidential employer, customer, vendor, or third-party information;
- personally identifiable information that should not be public;
- proprietary source code or documents without authorization;
- sensitive operational or security-control details.

## Recommended Controls

- Enable two-factor authentication on the GitHub account.
- Prefer passkeys or hardware-backed authentication where available.
- Enable GitHub secret-scanning and push-protection features when available.
- Use branch protection for important repositories as they mature.
- Require review before publishing high-impact security, infrastructure, or production material.
- Keep research/prototype claims clearly separated from production claims.

## If Sensitive Information Is Accidentally Committed

Treat the exposed credential or secret as compromised. Revoke or rotate it through the service that issued it, then remove the exposed content from the repository and history using GitHub's supported remediation workflow.
