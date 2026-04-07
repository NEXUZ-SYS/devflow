#!/usr/bin/env bash
# Tests for MSG_NO_CONFIG i18n message in all locale files
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PASS=0
FAIL=0

assert_defined() {
  local desc="$1" locale="$2"
  local file="${REPO_ROOT}/locales/${locale}/messages.sh"
  local val
  val=$(bash -c "source '${file}' && echo \"\${MSG_NO_CONFIG:-}\"")
  if [ -n "$val" ]; then
    printf '  PASS: %s\n' "$desc"
    PASS=$((PASS + 1))
  else
    printf '  FAIL: %s — MSG_NO_CONFIG not defined or empty in %s\n' "$desc" "$locale"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" locale="$2" expected="$3"
  local file="${REPO_ROOT}/locales/${locale}/messages.sh"
  local val
  val=$(bash -c "source '${file}' && echo \"\${MSG_NO_CONFIG:-}\"")
  if printf '%s' "$val" | grep -q "$expected"; then
    printf '  PASS: %s\n' "$desc"
    PASS=$((PASS + 1))
  else
    printf '  FAIL: %s — expected to find \"%s\" in MSG_NO_CONFIG\n' "$desc" "$expected"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== MSG_NO_CONFIG Locale Tests ==="

# Test 1-3: MSG_NO_CONFIG defined in all locales
echo "Test 1: en-US has MSG_NO_CONFIG"
assert_defined "en-US MSG_NO_CONFIG is defined" "en-US"

echo "Test 2: pt-BR has MSG_NO_CONFIG"
assert_defined "pt-BR MSG_NO_CONFIG is defined" "pt-BR"

echo "Test 3: es-ES has MSG_NO_CONFIG"
assert_defined "es-ES MSG_NO_CONFIG is defined" "es-ES"

# Test 4-6: All locales reference /devflow config
echo "Test 4: en-US references /devflow config"
assert_contains "en-US mentions /devflow config" "en-US" "/devflow config"

echo "Test 5: pt-BR references /devflow config"
assert_contains "pt-BR mentions /devflow config" "pt-BR" "/devflow config"

echo "Test 6: es-ES references /devflow config"
assert_contains "es-ES mentions /devflow config" "es-ES" "/devflow config"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] || exit 1
