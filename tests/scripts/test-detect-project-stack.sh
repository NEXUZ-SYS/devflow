#!/usr/bin/env bash
# E2E tests for scripts/detect-project-stack.sh
# Run: bash tests/scripts/test-detect-project-stack.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HELPER="${PROJECT_ROOT}/scripts/detect-project-stack.sh"
TMP_DIR=$(mktemp -d)
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

assert_equals() {
  local desc="$1" expected="$2" actual="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    printf "    Expected: '%s'\n" "$expected"
    printf "    Got:      '%s'\n" "$actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

mk() { mkdir -p "${TMP_DIR}/$1"; }
touch_in() { touch "${TMP_DIR}/$1/$2"; }

# ─── Single-stack detections ───────────────────────────────────────

echo "=== Single-stack detections ==="

mk python-proj && touch_in python-proj pyproject.toml
result=$(bash "$HELPER" "${TMP_DIR}/python-proj")
assert_equals "python via pyproject.toml" "python" "$result"

mk python-req && touch_in python-req requirements.txt
result=$(bash "$HELPER" "${TMP_DIR}/python-req")
assert_equals "python via requirements.txt" "python" "$result"

mk python-setup && touch_in python-setup setup.py
result=$(bash "$HELPER" "${TMP_DIR}/python-setup")
assert_equals "python via setup.py" "python" "$result"

mk ts-proj && touch_in ts-proj package.json
result=$(bash "$HELPER" "${TMP_DIR}/ts-proj")
assert_equals "typescript via package.json" "typescript" "$result"

mk go-proj && touch_in go-proj go.mod
result=$(bash "$HELPER" "${TMP_DIR}/go-proj")
assert_equals "go via go.mod" "go" "$result"

mk rust-proj && touch_in rust-proj Cargo.toml
result=$(bash "$HELPER" "${TMP_DIR}/rust-proj")
assert_equals "rust via Cargo.toml" "rust" "$result"

# ─── Multi-stack (monorepo) ────────────────────────────────────────

echo ""
echo "=== Multi-stack monorepo ==="

mk monorepo
touch_in monorepo pyproject.toml
touch_in monorepo package.json
result=$(bash "$HELPER" "${TMP_DIR}/monorepo")
assert_equals "monorepo python+typescript, sorted" "python"$'\n'"typescript" "$result"

mk triple
touch_in triple pyproject.toml
touch_in triple package.json
touch_in triple go.mod
result=$(bash "$HELPER" "${TMP_DIR}/triple")
assert_equals "triple stack python+typescript+go, sorted" "go"$'\n'"python"$'\n'"typescript" "$result"

# ─── Deduplication ─────────────────────────────────────────────────

echo ""
echo "=== Deduplication ==="

mk dup-python
touch_in dup-python pyproject.toml
touch_in dup-python requirements.txt
touch_in dup-python setup.py
result=$(bash "$HELPER" "${TMP_DIR}/dup-python")
assert_equals "multiple python markers dedup to single 'python'" "python" "$result"

# ─── Empty/missing cases ───────────────────────────────────────────

echo ""
echo "=== Empty and missing cases ==="

mk empty-proj
result=$(bash "$HELPER" "${TMP_DIR}/empty-proj")
assert_equals "empty project returns empty output" "" "$result"

result=$(bash "$HELPER" "/tmp/nonexistent-abcxyz-$(date +%s)")
assert_equals "non-existent path returns empty (no error)" "" "$result"

# No arg — defaults to CWD (empty dir)
cd "${TMP_DIR}/empty-proj"
result=$(bash "$HELPER")
cd "$PROJECT_ROOT"
assert_equals "no argument defaults to CWD" "" "$result"

# ─── Exit code ─────────────────────────────────────────────────────

echo ""
echo "=== Exit code ==="

bash "$HELPER" "${TMP_DIR}/empty-proj" >/dev/null 2>&1
code=$?
TESTS_TOTAL=$((TESTS_TOTAL + 1))
if [ "$code" = "0" ]; then
  echo -e "  ${GREEN}✓${NC} always exits 0 (even with empty output)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "  ${RED}✗${NC} expected exit 0, got $code"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# ─── Report ────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  detect-project-stack tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}All passed${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
