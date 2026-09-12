#!/usr/bin/env bash
set -euo pipefail

: "${CRYPTOSPHERE_PILOT_URL:?Set CRYPTOSPHERE_PILOT_URL, e.g. https://<pilot-host>.up.railway.app}"
: "${CRYPTOSPHERE_IDENTITY_PROXY_KEY:?Set deployment-only identity proxy key in the local shell/session}"

BASE="${CRYPTOSPHERE_PILOT_URL%/}"
OWNER_PRINCIPAL="${CRYPTOSPHERE_OWNER_PRINCIPAL:-pilot.owner}"
VIEWER_PRINCIPAL="${CRYPTOSPHERE_VIEWER_PRINCIPAL:-pilot.viewer}"
ASSURANCE="${CRYPTOSPHERE_ASSURANCE:-PHISHING_RESISTANT}"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

status_code() {
  local outfile="$1"; shift
  curl -sS -o "$outfile" -w '%{http_code}' "$@"
}

# 1) Aggregate readiness must be public/read-only and report no execution authority.
curl -fsS "${BASE}/health" -o /tmp/cs-pilot-health.json
python3 - <<'PY'
import json
from pathlib import Path
h=json.loads(Path('/tmp/cs-pilot-health.json').read_text())
assert h.get('status') == 'ready', h
assert h.get('product') == 'CryptoSphere', h
assert h.get('owner_console', {}).get('ready') is True, h
assert h.get('analytical_core', {}).get('ready') is True, h
assert h.get('analytical_core', {}).get('mode') == 'ADVISORY_ONLY', h
assert h.get('production_execution') is False, h
assert h.get('human_governance_required') is True, h
print('PASS: aggregate health + governance invariants')
PY

# 2) Security headers on hosted boundary.
headers="$(curl -fsSI "${BASE}/health" | tr -d '\r')"
grep -qi '^x-content-type-options: nosniff$' <<<"${headers}" || fail 'X-Content-Type-Options'
grep -qi '^x-frame-options: DENY$' <<<"${headers}" || fail 'X-Frame-Options'
grep -qi '^referrer-policy: no-referrer$' <<<"${headers}" || fail 'Referrer-Policy'
grep -qi '^strict-transport-security: max-age=31536000$' <<<"${headers}" || fail 'HSTS'
pass 'security headers'

# 3) Fail closed for unauthenticated and spoofed privileged requests.
code="$(status_code /tmp/cs-core-unauth.json "${BASE}/core/api/v1/status")"
[[ "${code}" == '401' ]] || fail "unauthenticated Core expected 401, got ${code}"
pass 'unauthenticated Core rejected'

code="$(status_code /tmp/cs-core-spoof.json \
  -H 'x-cryptosphere-principal: spoofed.client' \
  -H 'x-cryptosphere-role: OWNER' \
  -H "x-cryptosphere-assurance: ${ASSURANCE}" \
  "${BASE}/core/api/v1/status")"
[[ "${code}" == '401' ]] || fail "spoofed privileged envelope expected 401, got ${code}"
pass 'spoofed privileged envelope rejected'

# 4) Correct proxy key does not elevate an unprivileged role.
code="$(status_code /tmp/cs-core-viewer.json \
  -H "x-cryptosphere-principal: ${VIEWER_PRINCIPAL}" \
  -H 'x-cryptosphere-role: VIEWER' \
  -H "x-cryptosphere-assurance: ${ASSURANCE}" \
  -H "x-cryptosphere-proxy-key: ${CRYPTOSPHERE_IDENTITY_PROXY_KEY}" \
  "${BASE}/core/api/v1/status")"
[[ "${code}" == '401' ]] || fail "VIEWER expected 401, got ${code}"
pass 'unprivileged identity rejected'

# 5) Verified privileged identity may access read-only Owner/Core surfaces.
code="$(status_code /tmp/cs-core-owner.json \
  -H "x-cryptosphere-principal: ${OWNER_PRINCIPAL}" \
  -H 'x-cryptosphere-role: OWNER' \
  -H "x-cryptosphere-assurance: ${ASSURANCE}" \
  -H "x-cryptosphere-proxy-key: ${CRYPTOSPHERE_IDENTITY_PROXY_KEY}" \
  "${BASE}/core/api/v1/status")"
[[ "${code}" == '200' ]] || fail "verified OWNER Core expected 200, got ${code}"

code="$(status_code /tmp/cs-owner-assets.json \
  -H "x-cryptosphere-principal: ${OWNER_PRINCIPAL}" \
  -H 'x-cryptosphere-role: OWNER' \
  -H "x-cryptosphere-assurance: ${ASSURANCE}" \
  -H "x-cryptosphere-proxy-key: ${CRYPTOSPHERE_IDENTITY_PROXY_KEY}" \
  "${BASE}/api/assets")"
[[ "${code}" == '200' ]] || fail "verified OWNER assets expected 200, got ${code}"
pass 'verified privileged read-only surfaces'

# 6) Sensitive/dev surfaces remain hidden.
code="$(status_code /tmp/cs-openapi.json \
  -H "x-cryptosphere-principal: ${OWNER_PRINCIPAL}" \
  -H 'x-cryptosphere-role: OWNER' \
  -H "x-cryptosphere-assurance: ${ASSURANCE}" \
  -H "x-cryptosphere-proxy-key: ${CRYPTOSPHERE_IDENTITY_PROXY_KEY}" \
  "${BASE}/core/api/v1/openapi.json")"
[[ "${code}" == '404' ]] || fail "Core OpenAPI expected 404, got ${code}"
pass 'developer schema surface hidden'

echo
echo 'CryptoSphere hosted Pilot acceptance: PASS'
echo 'No production execution or autonomous authority was exercised by this harness.'
