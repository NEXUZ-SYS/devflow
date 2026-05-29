#!/usr/bin/env bash
# tests/hooks/test-session-start-routines.sh
# Verifies SessionStart injects <DEVFLOW_ROUTINES_DUE> only when a routine is
# due-to-suggest, respecting snooze and the 1x/day guard. Date is injected via
# DEVFLOW_TODAY so the test is deterministic. Runs in tmp project dirs — never
# touches real .context/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TESTS_PASSED=0; TESTS_FAILED=0; TESTS_TOTAL=0
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

assert_contains() {
  local desc="$1" hay="$2" needle="$3"; TESTS_TOTAL=$((TESTS_TOTAL+1))
  if printf '%s' "$hay" | grep -qF -- "$needle"; then echo -e "  ${GREEN}✓${NC} $desc"; TESTS_PASSED=$((TESTS_PASSED+1))
  else echo -e "  ${RED}✗${NC} $desc"; echo "    expected: $needle"; TESTS_FAILED=$((TESTS_FAILED+1)); fi
}
assert_not_contains() {
  local desc="$1" hay="$2" needle="$3"; TESTS_TOTAL=$((TESTS_TOTAL+1))
  if printf '%s' "$hay" | grep -qF -- "$needle"; then echo -e "  ${RED}✗${NC} $desc"; echo "    must NOT contain: $needle"; TESTS_FAILED=$((TESTS_FAILED+1))
  else echo -e "  ${GREEN}✓${NC} $desc"; TESTS_PASSED=$((TESTS_PASSED+1)); fi
}

TMPROOT=$(mktemp -d); trap 'rm -rf "$TMPROOT"' EXIT

mkrepo() { # $1 = routines.json body
  local d; d=$(mktemp -d "$TMPROOT/proj.XXXXXX"); mkdir -p "$d/.context"
  printf '%s' "$1" > "$d/.context/routines.json"; printf '%s' "$d"
}
run_hook() { # $1 = workdir, $2 = today
  ( cd "$1" && DEVFLOW_TODAY="$2" CLAUDE_PLUGIN_ROOT="$PROJECT_ROOT" bash "${PROJECT_ROOT}/hooks/session-start" 2>/dev/null || true )
}

DUE='{"routines":[{"id":"context-maintenance","description":"doctor","enabled":true,"frequency":"7d","nextRun":null,"prompts":[{"type":"command","value":"/devflow:devflow-doctor"}]}]}'
SNOOZED='{"routines":[{"id":"context-maintenance","enabled":true,"frequency":"7d","nextRun":null,"snoozeUntil":"2026-12-31"}]}'
FUTURE='{"routines":[{"id":"context-maintenance","enabled":true,"frequency":"7d","nextRun":"2026-12-31"}]}'

echo "=== SessionStart routines suggestion ==="

repo=$(mkrepo "$DUE")
out=$(run_hook "$repo" "2026-05-28")
assert_contains "injects DEVFLOW_ROUTINES_DUE when a routine is due" "$out" "DEVFLOW_ROUTINES_DUE"
assert_contains "names the due routine id" "$out" "context-maintenance"

repo=$(mkrepo "$SNOOZED")
out=$(run_hook "$repo" "2026-05-28")
assert_not_contains "no suggestion while snoozed" "$out" "DEVFLOW_ROUTINES_DUE"

repo=$(mkrepo "$FUTURE")
out=$(run_hook "$repo" "2026-05-28")
assert_not_contains "no suggestion when not yet due" "$out" "DEVFLOW_ROUTINES_DUE"

# 1x/day: after the first session marks it suggested, a second same-day session is silent.
repo=$(mkrepo "$DUE")
run_hook "$repo" "2026-05-28" >/dev/null
out=$(run_hook "$repo" "2026-05-28")
assert_not_contains "no re-suggestion same day (1x/day guard)" "$out" "DEVFLOW_ROUTINES_DUE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SessionStart routines tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
[ "$TESTS_FAILED" -gt 0 ] && { echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"; exit 1; } || echo -e "  ${GREEN}All passed${NC}"
