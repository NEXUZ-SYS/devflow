#!/usr/bin/env bash
# E2E tests for session-start hook — executes the actual hook and validates output.
# Run: bash tests/hooks/test-session-start-e2e.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_DIR=$(mktemp -d)
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

assert_true() {
  local desc="$1" condition="$2"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if eval "$condition"; then
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Expected to contain: $needle"
    echo "    Got (first 200 chars): ${haystack:0:200}"
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

# ─── Helper: run hook with controlled environment ──────────────────

run_hook() {
  local workdir="${1:-$PROJECT_ROOT}"
  # Run hook with controlled PWD and environment
  cd "$workdir"
  # Set CLAUDE_PLUGIN_ROOT to match what Claude Code would set
  CLAUDE_PLUGIN_ROOT="$PROJECT_ROOT" \
    bash "${PROJECT_ROOT}/hooks/session-start" 2>/dev/null || true
  cd "$PROJECT_ROOT"
}

# ─── Test: hook produces valid JSON ────────────────────────────────

echo "=== Hook Output Validation ==="

output=$(run_hook "$PROJECT_ROOT")

# Check it's valid JSON (using python as jq may not be installed)
json_valid=$(echo "$output" | python3 -c "import sys,json; json.load(sys.stdin); print('valid')" 2>/dev/null || echo "invalid")
assert_true "hook output is valid JSON" '[ "$json_valid" = "valid" ]'

# Check it has the hookSpecificOutput key (Claude Code format)
assert_contains "output has hookSpecificOutput key" "$output" "hookSpecificOutput"
assert_contains "output has hookEventName" "$output" "SessionStart"
assert_contains "output has additionalContext" "$output" "additionalContext"

# ─── Test: hook includes DEVFLOW_CONTEXT ───────────────────────────

echo ""
echo "=== DEVFLOW_CONTEXT Injection ==="

assert_contains "output has DEVFLOW_CONTEXT tag" "$output" "DEVFLOW_CONTEXT"
assert_contains "output has DevFlow Mode" "$output" "DevFlow Mode"
assert_contains "output includes using-devflow skill content" "$output" "using-devflow"

# ─── Test: hook detects mode ───────────────────────────────────────

echo ""
echo "=== Mode Detection ==="

# Mode should be detectable from output
assert_contains "output has superpowers field" "$output" "superpowers:"
assert_contains "output has dotcontext MCP field" "$output" "dotcontext MCP:"
assert_contains "output has STATUS" "$output" "STATUS"

# ─── Test: hook with autonomous workflow active ────────────────────

echo ""
echo "=== Autonomous Workflow Detection ==="

# Create a temp project dir with stories.yaml
tmp_project="${TMP_DIR}/test-project"
mkdir -p "${tmp_project}/.context/workflow"
cat > "${tmp_project}/.context/workflow/stories.yaml" << 'YAML'
feature: "Test Feature"
autonomy: autonomous
escalation:
  max_retries_per_story: 2
stats:
  total: 5
  completed: 2
  failed: 0
  escalated: 0
  consecutive_failures: 0
  current_autonomy: "autonomous"
stories:
  - id: S1
    title: "Story one"
    status: completed
    priority: 1
    attempts: 1
    blocked_by: []
  - id: S2
    title: "Story two"
    status: completed
    priority: 2
    attempts: 1
    blocked_by: []
  - id: S3
    title: "Story three"
    status: pending
    priority: 3
    attempts: 0
    blocked_by: []
YAML

output_auto=$(run_hook "$tmp_project")
assert_contains "detects autonomous workflow" "$output_auto" "AUTONOMOUS WORKFLOW ACTIVE"
assert_contains "shows feature name" "$output_auto" "Test Feature"
assert_contains "shows progress" "$output_auto" "2/5"
assert_contains "shows mode" "$output_auto" "autonomous"

# ─── Test: supervised workflow does NOT inject ─────────────────────

echo ""
echo "=== Supervised Workflow Guard ==="

tmp_supervised="${TMP_DIR}/test-supervised"
mkdir -p "${tmp_supervised}/.context/workflow"
cat > "${tmp_supervised}/.context/workflow/stories.yaml" << 'YAML'
feature: "Supervised Feature"
autonomy: supervised
stats:
  total: 3
  completed: 0
stories:
  - id: S1
    title: "Story one"
    status: pending
    priority: 1
    blocked_by: []
YAML

output_sup=$(run_hook "$tmp_supervised")
assert_not_contains "supervised mode does not inject AUTONOMOUS" "$output_sup" "AUTONOMOUS WORKFLOW ACTIVE"

# ─── Test: missing stories.yaml does NOT inject ───────────────────

echo ""
echo "=== Missing stories.yaml ==="

tmp_empty="${TMP_DIR}/test-empty"
mkdir -p "${tmp_empty}/.context/workflow"
# No stories.yaml file

output_empty=$(run_hook "$tmp_empty")
assert_not_contains "missing stories.yaml does not inject AUTONOMOUS" "$output_empty" "AUTONOMOUS WORKFLOW ACTIVE"

# ─── Test: escape_for_json handles special chars ──────────────────

echo ""
echo "=== JSON Escaping ==="

# The hook should produce valid JSON even with special chars in skill content
# The skill files contain quotes, backslashes, newlines — all must be escaped
# We already validated JSON above, but let's verify specific chars are escaped

# JSON structural newlines (between keys) are valid — the important thing
# is that the VALUE strings don't contain unescaped newlines that break parsing.
# The valid-JSON test above already proves this, so we just verify the value
# is a single string (not split across lines)
json_value=$(echo "$output" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ctx = d.get('hookSpecificOutput',{}).get('additionalContext','')
print('has_content' if len(ctx) > 100 else 'empty')
" 2>/dev/null || echo "parse_error")
assert_true "additionalContext is a valid string value" '[ "$json_value" = "has_content" ]'

# ─── Test: hook exits 0 ───────────────────────────────────────────

echo ""
echo "=== Exit Code ==="

cd "$PROJECT_ROOT"
CLAUDE_PLUGIN_ROOT="$PROJECT_ROOT" bash "${PROJECT_ROOT}/hooks/session-start" >/dev/null 2>&1
exit_code=$?
assert_true "hook exits with code 0" '[ "$exit_code" -eq 0 ]'

# ─── Report ────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Session-start E2E tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}All passed${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
