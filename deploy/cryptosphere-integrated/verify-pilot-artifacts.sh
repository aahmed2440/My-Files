#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

OWNER="cryptosphere-owner-runtime.zip"
CORE="cryptosphere-core-runtime.zip"
OWNER_SHA="6d58d4023eedbf319a162f15541628c512acb9751a06d47dcc049d5d988dd146"
CORE_SHA="bc2c527f358174715b569c32f10d9a28f85d8d8724fcbae407963c9922a1b997"
OWNER_SIZE=27977
CORE_SIZE=95596

fail() { printf 'PILOT ARTIFACT GATE: FAIL — %s\n' "$*" >&2; exit 1; }
pass() { printf 'PILOT ARTIFACT GATE: PASS — %s\n' "$*"; }

for f in "$OWNER" "$CORE" SHA256.txt; do
  [[ -f "$f" ]] || fail "missing $f"
done

owner_size=$(wc -c < "$OWNER" | tr -d ' ')
core_size=$(wc -c < "$CORE" | tr -d ' ')
[[ "$owner_size" == "$OWNER_SIZE" ]] || fail "$OWNER size $owner_size != approved $OWNER_SIZE"
[[ "$core_size" == "$CORE_SIZE" ]] || fail "$CORE size $core_size != approved $CORE_SIZE"
pass "approved byte counts"

owner_actual=$(sha256sum "$OWNER" | awk '{print $1}')
core_actual=$(sha256sum "$CORE" | awk '{print $1}')
[[ "$owner_actual" == "$OWNER_SHA" ]] || fail "$OWNER SHA-256 mismatch"
[[ "$core_actual" == "$CORE_SHA" ]] || fail "$CORE SHA-256 mismatch"
pass "approved SHA-256 digests"

unzip -tqq "$OWNER" || fail "$OWNER ZIP integrity"
unzip -tqq "$CORE" || fail "$CORE ZIP integrity"
pass "ZIP integrity"

grep -Fq "$OWNER_SHA  $OWNER" SHA256.txt || fail "manifest owner digest mismatch"
grep -Fq "$CORE_SHA  $CORE" SHA256.txt || fail "manifest core digest mismatch"
pass "manifest binds exact approved bytes"

printf '\nCryptoSphere PILOT ARTIFACT INTAKE: GREEN\n'
printf 'No deployment or authority change was performed.\n'
