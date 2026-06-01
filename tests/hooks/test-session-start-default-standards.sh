#!/usr/bin/env bash
# tests/hooks/test-session-start-default-standards.sh
# TDD (RED → GREEN): verifies that session-start emits the standards index
# even when the project has NO .context/standards directory — as long as
# PLUGIN_ROOT ships assets/standards/ (which devflow always does).
#
# Also verifies that --plugin is forwarded to context-index-cli.mjs from
# within the hook invocation, and that [default] tags appear in output.
#
# Run: bash tests/hooks/test-session-start-default-standards.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_DIR=$(mktemp -d)
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Expected to contain: $needle"
    echo "    Got (first 400 chars): ${haystack:0:400}"
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

# ─── Helper: run hook with controlled environment ──────────────────────────────
# The hook self-determines PLUGIN_ROOT from SCRIPT_DIR, so we can't override it
# externally.  CLAUDE_PLUGIN_ROOT is the env var for the CLI --plugin fallback
# in loadStandardsMerged — distinct from PLUGIN_ROOT used inside the hook.

run_hook() {
  local workdir="$1"
  (
    cd "$workdir"
    bash "${PROJECT_ROOT}/hooks/session-start" 2>/dev/null || true
  )
}

# ─── Test 1: project with NO .context/standards — index fires via PLUGIN_ROOT ──

echo "=== Default standards gate: no project standards → PLUGIN_ROOT defaults ==="

tmp_project="${TMP_DIR}/project-no-standards"
mkdir -p "$tmp_project"
# Deliberately NO .context/standards directory
# Also no .context/stacks/manifest.yaml

output=$(run_hook "$tmp_project")

assert_contains \
  "hook emits DEVFLOW_CONTEXT_INDEX when plugin ships defaults and project has none" \
  "$output" \
  "DEVFLOW_CONTEXT_INDEX"

assert_contains \
  "index includes default standards from PLUGIN_ROOT/assets/standards" \
  "$output" \
  "DEVFLOW_CONTEXT_INDEX"

assert_contains \
  "index marks devflow-bundled defaults with [default]" \
  "$output" \
  "[default]"

# ─── Test 2: project with project standards (canonical path) + plugin defaults ─

echo ""
echo "=== Default standards gate: project standards (canonical path) + plugin defaults ==="

tmp_project2="${TMP_DIR}/project-with-standards"
# DDC canonical: .context/engineering/standards/
std_dir="${tmp_project2}/.context/engineering/standards"
mkdir -p "$std_dir"
cat > "${std_dir}/std-typescript.md" << 'MD'
---
id: "std-typescript"
description: "TypeScript conventions"
version: "1.0.0"
applyTo: ["**/*.ts"]
---

# Standard TypeScript
MD

output2=$(run_hook "$tmp_project2")

assert_contains \
  "hook emits index with project standards (canonical path)" \
  "$output2" \
  "std-typescript"

assert_contains \
  "hook also emits plugin defaults alongside project standards" \
  "$output2" \
  "[default]"

# ─── Test 3: project std overrides default with same id — only one entry ───────

echo ""
echo "=== Override: project std with same id as default → single entry ==="

tmp_project3="${TMP_DIR}/project-override"
std_dir3="${tmp_project3}/.context/engineering/standards"
mkdir -p "$std_dir3"
# Write a project-level std-security that overrides the bundled default
cat > "${std_dir3}/std-security.md" << 'MD'
---
id: "std-security"
description: "Project-level security override"
version: "2.0.0"
applyTo: ["**/*.ts"]
---

# Security — project override
MD

# Use CLI directly (not the hook) to test override behavior precisely
cli_output3=$(
  node "${PROJECT_ROOT}/scripts/lib/context-index-cli.mjs" \
    --project="$tmp_project3" \
    --plugin="${PROJECT_ROOT}" \
    --format=text \
    2>/dev/null || true
)

# Project override: std-security should appear without [default] tag
assert_not_contains \
  "project override removes [default] tag from std-security" \
  "$cli_output3" \
  "[default] std-security"

assert_contains \
  "project override for std-security still appears in index" \
  "$cli_output3" \
  "std-security"

# ─── Test 4: plugin dir without assets/standards/ passes --plugin → empty defaults ─

echo ""
echo "=== --plugin dir without assets/standards → no extra defaults ==="

tmp_project4="${TMP_DIR}/project-no-defaults"
mkdir -p "$tmp_project4"

tmp_plugin_empty="${TMP_DIR}/plugin-empty"
mkdir -p "$tmp_plugin_empty"
# No assets/standards/ inside

cli_output4=$(
  node "${PROJECT_ROOT}/scripts/lib/context-index-cli.mjs" \
    --project="$tmp_project4" \
    --plugin="$tmp_plugin_empty" \
    --format=text \
    2>/dev/null || true
)

assert_not_contains \
  "empty plugin dir produces no default standards in text" \
  "$cli_output4" \
  "[default]"

# ─── Test 5: --plugin flag forwarded to CLI produces [default] in output ─────

echo ""
echo "=== CLI: --plugin flag produces [default] markers ==="

cli_output5=$(
  node "${PROJECT_ROOT}/scripts/lib/context-index-cli.mjs" \
    --project="$tmp_project" \
    --plugin="${PROJECT_ROOT}" \
    --format=text \
    2>/dev/null || true
)

assert_contains \
  "CLI --plugin=PROJECT_ROOT produces text with [default] markers" \
  "$cli_output5" \
  "[default]"

# JSON output also carries origin field
json_output5=$(
  node "${PROJECT_ROOT}/scripts/lib/context-index-cli.mjs" \
    --project="$tmp_project" \
    --plugin="${PROJECT_ROOT}" \
    2>/dev/null || true
)

# Verify at least one standard has origin=default in JSON
has_default_origin=$(echo "$json_output5" | python3 -c "
import sys, json
d = json.load(sys.stdin)
defaults = [s for s in d.get('standards', []) if s.get('origin') == 'default']
print('yes' if defaults else 'no')
" 2>/dev/null || echo "parse_error")

TESTS_TOTAL=$((TESTS_TOTAL + 1))
if [ "$has_default_origin" = "yes" ]; then
  echo -e "  ${GREEN}✓${NC} JSON output carries origin='default' for bundled standards"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo -e "  ${RED}✗${NC} JSON output carries origin='default' for bundled standards"
  echo "    python3 check returned: $has_default_origin"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# ─── Test 6: session-start hook — [default] marker present in injected context ──

echo ""
echo "=== Session-start hook injects [default] marker in context ==="

tmp_project6="${TMP_DIR}/project-for-hook-test"
mkdir -p "$tmp_project6"

output6=$(run_hook "$tmp_project6")

assert_contains \
  "hook output contains [default] marker from bundled standards" \
  "$output6" \
  "[default]"

# ─── Report ────────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Default standards session-start tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}All passed${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
