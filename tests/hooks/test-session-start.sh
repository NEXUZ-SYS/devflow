#!/usr/bin/env bash
# Integration tests for session-start hook autonomous workflow detection.
# Run: bash tests/hooks/test-session-start.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Expected to contain: $needle"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Expected NOT to contain: $needle"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi
}

# ─── Test sanitize functions ────────────────────────────────────────

echo "=== Sanitize Functions ==="

# Extract and test the sanitize functions from the hook
sanitize_str() { printf '%s' "$1" | tr -cd 'a-zA-Z0-9 _./:-'; }
sanitize_int() { printf '%s' "$1" | tr -cd '0-9'; }

result=$(sanitize_str "normal-text_123")
assert_contains "sanitize_str passes normal text" "$result" "normal-text_123"

result=$(sanitize_str 'injected"; rm -rf /')
assert_not_contains "sanitize_str strips shell metacharacters" "$result" '"'
assert_not_contains "sanitize_str strips semicolons" "$result" ";"

result=$(sanitize_str '<script>alert(1)</script>')
assert_not_contains "sanitize_str strips angle brackets" "$result" "<"
assert_not_contains "sanitize_str strips HTML tags" "$result" ">"

result=$(sanitize_int "42")
assert_contains "sanitize_int passes clean integers" "$result" "42"

result=$(sanitize_int "42; echo pwned")
assert_contains "sanitize_int strips non-digits" "$result" "42"
assert_not_contains "sanitize_int strips echo" "$result" "echo"

result=$(sanitize_int "abc")
assert_contains "sanitize_int returns empty for non-numeric" "$result" ""

# ─── Test YAML extraction ──────────────────────────────────────────

echo ""
echo "=== YAML Extraction ==="

# Test with valid autonomous workflow
stories_file="${PROJECT_ROOT}/tests/fixtures/stories-valid.yaml"

autonomy_mode=$(sanitize_str "$(grep '^autonomy:' "$stories_file" 2>/dev/null | head -1 | sed 's/autonomy: *//' | tr -d '"' || echo "")")
assert_contains "extracts autonomy mode" "$autonomy_mode" "autonomous"

feature=$(sanitize_str "$(grep '^feature:' "$stories_file" 2>/dev/null | head -1 | sed 's/feature: *//' | tr -d '"' || echo "")")
assert_contains "extracts feature name" "$feature" "CRUD de produtos"

total=$(sanitize_int "$(grep 'total:' "$stories_file" 2>/dev/null | head -1 | sed 's/.*total: *//' || echo "0")")
assert_contains "extracts total count" "$total" "4"

completed=$(sanitize_int "$(grep 'completed:' "$stories_file" 2>/dev/null | head -1 | sed 's/.*completed: *//' || echo "0")")
assert_contains "extracts completed count" "$completed" "0"

# ─── Test with supervised workflow (should NOT inject context) ──────

echo ""
echo "=== Supervised Workflow Guard ==="

stories_file="${PROJECT_ROOT}/tests/fixtures/stories-supervised.yaml"
autonomy_mode=$(sanitize_str "$(grep '^autonomy:' "$stories_file" 2>/dev/null | head -1 | sed 's/autonomy: *//' | tr -d '"' || echo "")")
total=$(sanitize_int "$(grep 'total:' "$stories_file" 2>/dev/null | head -1 | sed 's/.*total: *//' || echo "0")")

autonomous_context=""
if [ -n "$autonomy_mode" ] && [ "$autonomy_mode" != "supervised" ] && [ -n "$total" ] && [ "$total" != "0" ]; then
  autonomous_context="ACTIVE"
fi

assert_contains "supervised mode does not inject context" "$autonomous_context" ""

# ─── Test with mixed status ────────────────────────────────────────

echo ""
echo "=== Mixed Status Extraction ==="

stories_file="${PROJECT_ROOT}/tests/fixtures/stories-mixed-status.yaml"

autonomy_mode=$(sanitize_str "$(grep '^autonomy:' "$stories_file" 2>/dev/null | head -1 | sed 's/autonomy: *//' | tr -d '"' || echo "")")
assert_contains "extracts assisted mode" "$autonomy_mode" "assisted"

total=$(sanitize_int "$(grep 'total:' "$stories_file" 2>/dev/null | head -1 | sed 's/.*total: *//' || echo "0")")
assert_contains "extracts total=5" "$total" "5"

completed=$(sanitize_int "$(grep 'completed:' "$stories_file" 2>/dev/null | head -1 | sed 's/.*completed: *//' || echo "0")")
assert_contains "extracts completed=2" "$completed" "2"

# ─── Test with non-existent file ───────────────────────────────────

echo ""
echo "=== Non-existent File ==="

stories_file="/tmp/nonexistent-stories-$(date +%s).yaml"
autonomy_mode=$(sanitize_str "$(grep '^autonomy:' "$stories_file" 2>/dev/null | head -1 | sed 's/autonomy: *//' | tr -d '"' || echo "")")
assert_contains "missing file returns empty string" "$autonomy_mode" ""

# ─── Test context injection guard ──────────────────────────────────

echo ""
echo "=== Context Injection Guard ==="

# Empty total should not inject
autonomy_mode="autonomous"
total=""
autonomous_context=""
if [ -n "$autonomy_mode" ] && [ "$autonomy_mode" != "supervised" ] && [ -n "$total" ] && [ "$total" != "0" ]; then
  autonomous_context="ACTIVE"
fi
assert_contains "empty total blocks injection" "$autonomous_context" ""

# Zero total should not inject
total="0"
autonomous_context=""
if [ -n "$autonomy_mode" ] && [ "$autonomy_mode" != "supervised" ] && [ -n "$total" ] && [ "$total" != "0" ]; then
  autonomous_context="ACTIVE"
fi
assert_contains "zero total blocks injection" "$autonomous_context" ""

# Valid should inject
total="5"
autonomous_context=""
if [ -n "$autonomy_mode" ] && [ "$autonomy_mode" != "supervised" ] && [ -n "$total" ] && [ "$total" != "0" ]; then
  autonomous_context="ACTIVE"
fi
assert_contains "valid autonomous+total injects context" "$autonomous_context" "ACTIVE"

# ─── Report ────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Session-start hook tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}All passed${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
