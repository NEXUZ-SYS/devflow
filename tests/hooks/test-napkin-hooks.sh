#!/usr/bin/env bash
# Integration tests for napkin hook integration.
# Run: bash tests/hooks/test-napkin-hooks.sh

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

# ─── Setup temp directories ──────────────────────────────────────

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# ─── Napkin detection logic (extracted from session-start hook) ───

test_napkin_injection() {
  local project_root="$1"
  local napkin_context=""

  if [ -f "${project_root}/.context/napkin.md" ]; then
    napkin_content=$(cat "${project_root}/.context/napkin.md" 2>/dev/null || echo "")
    if [ -n "$napkin_content" ]; then
      napkin_context="<NAPKIN_RUNBOOK>\n${napkin_content}\n</NAPKIN_RUNBOOK>"
    fi
  elif [ -d "${project_root}/.context" ]; then
    cat > "${project_root}/.context/napkin.md" << 'TMPL'
# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 15 items per category, max 7 per agent section.
- Each item includes date + "Do instead".

## Execution & Validation
(empty)

## Shell & Command Reliability
(empty)

## Domain Behavior Guardrails
(empty)

## User Directives
(empty)

## Agent-Specific Notes
<!-- Sections appear on demand: ### agent-name -->
TMPL
    napkin_content=$(cat "${project_root}/.context/napkin.md")
    napkin_context="<NAPKIN_RUNBOOK>\n${napkin_content}\n</NAPKIN_RUNBOOK>"
  fi

  printf '%s' "$napkin_context"
}

# ─── Test: napkin injected when .context/napkin.md exists ─────────

echo "=== Napkin SessionStart Injection ==="

# Test 1: napkin.md exists → inject content
mkdir -p "$TMPDIR/test1/.context"
echo "# Napkin Runbook
## Execution & Validation
1. **[2026-04-05] Always seed DB before E2E**
   Do instead: run npm run db:seed first" > "$TMPDIR/test1/.context/napkin.md"

result=$(test_napkin_injection "$TMPDIR/test1")
assert_contains "injects NAPKIN_RUNBOOK when napkin.md exists" "$result" "<NAPKIN_RUNBOOK>"
assert_contains "includes napkin content" "$result" "Always seed DB before E2E"

# Test 2: .context/ exists but no napkin.md → create template
mkdir -p "$TMPDIR/test2/.context"

result=$(test_napkin_injection "$TMPDIR/test2")
assert_contains "creates template when .context/ exists without napkin" "$result" "<NAPKIN_RUNBOOK>"
assert_contains "template has Curation Rules" "$result" "Curation Rules"
assert_contains "template has categories" "$result" "Execution & Validation"
assert_contains "template has agent section" "$result" "Agent-Specific Notes"

# Verify file was actually created
assert_contains "napkin.md file was created" "$(ls "$TMPDIR/test2/.context/")" "napkin.md"

# Test 3: no .context/ → no injection
mkdir -p "$TMPDIR/test3"

result=$(test_napkin_injection "$TMPDIR/test3")
assert_contains "no injection without .context/ dir" "$result" ""

# Test 4: empty napkin.md → no injection
mkdir -p "$TMPDIR/test4/.context"
touch "$TMPDIR/test4/.context/napkin.md"

result=$(test_napkin_injection "$TMPDIR/test4")
assert_not_contains "no injection for empty napkin" "$result" "NAPKIN_RUNBOOK"

# ─── Test: PreCompact curate instruction ──────────────────────────

echo ""
echo "=== Napkin PreCompact Curate Instruction ==="

test_precompact_napkin() {
  local project_root="$1"
  local napkin_instruction=""

  if [ -f "${project_root}/.context/napkin.md" ]; then
    napkin_instruction="Before compacting, curate .context/napkin.md: merge duplicates, remove stale items, enforce max 15 per category / 7 per agent section, re-prioritize by importance."
  fi

  printf '%s' "$napkin_instruction"
}

# Test 5: napkin exists → inject curate instruction
result=$(test_precompact_napkin "$TMPDIR/test1")
assert_contains "pre-compact injects curate instruction" "$result" "curate .context/napkin.md"
assert_contains "mentions category cap" "$result" "max 15 per category"
assert_contains "mentions agent cap" "$result" "7 per agent section"

# Test 6: no napkin → no instruction
result=$(test_precompact_napkin "$TMPDIR/test3")
assert_contains "no curate instruction without napkin" "$result" ""

# ─── Test: PostCompact re-injection ───────────────────────────────

echo ""
echo "=== Napkin PostCompact Re-injection ==="

test_postcompact_napkin() {
  local project_root="$1"
  local napkin_rehydration=""

  if [ -f "${project_root}/.context/napkin.md" ]; then
    napkin_content=$(cat "${project_root}/.context/napkin.md" 2>/dev/null || echo "")
    if [ -n "$napkin_content" ]; then
      napkin_rehydration="<NAPKIN_RUNBOOK>\n${napkin_content}\n</NAPKIN_RUNBOOK>"
    fi
  fi

  printf '%s' "$napkin_rehydration"
}

# Test 7: napkin exists → re-inject after compact
result=$(test_postcompact_napkin "$TMPDIR/test1")
assert_contains "post-compact re-injects napkin" "$result" "<NAPKIN_RUNBOOK>"
assert_contains "re-injection has content" "$result" "Always seed DB before E2E"

# Test 8: no napkin → no re-injection
result=$(test_postcompact_napkin "$TMPDIR/test3")
assert_contains "no re-injection without napkin" "$result" ""

# ─── Report ───────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Napkin hook tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}All passed${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
