#!/usr/bin/env bash
# tests/hooks/test-session-start-adr-dualread.sh
# Verifies hooks/session-start reads ADR_GUARDRAILS from BOTH paths during
# v1.0.x dual-read window, with canonical winning on filename conflict.
# Also verifies N6 LEGACY warning when only legacy contributes ADRs.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/session-start"
mkdir -p "$PROJECT_ROOT/tests/validation/tmp"

ADR_FRONTMATTER='---
status: Aprovado
name: NAME
stack: universal
---

## Guardrails

- RULE'

run_hook() {
  local cwd="$1"
  # The hook uses PWD as project_root; cd into the test fixture, then run.
  ( cd "$cwd" && echo "{}" | "$HOOK" ) 2>&1
}

# ─── Test 1: ADRs from both paths appear in output, canonical wins ─────────
TMP1=$(mktemp -d "$PROJECT_ROOT/tests/validation/tmp/sshook-both-XXXXXX")
trap "rm -rf $TMP1 \${TMP2:-} \${TMP3:-}" EXIT
mkdir -p "$TMP1/.context/adrs" "$TMP1/.context/docs/adrs"
echo "${ADR_FRONTMATTER//NAME/new-rule}" | sed 's/RULE/canonical rule/' > "$TMP1/.context/adrs/001-new.md"
echo "${ADR_FRONTMATTER//NAME/legacy-only}" | sed 's/RULE/legacy-only rule/' > "$TMP1/.context/docs/adrs/099-legacy.md"

out1=$(run_hook "$TMP1")
if ! echo "$out1" | grep -q "canonical rule"; then
  echo "FAIL [test 1]: canonical-path ADR not loaded"
  echo "Output: $out1"
  exit 1
fi
if ! echo "$out1" | grep -q "legacy-only rule"; then
  echo "FAIL [test 1]: legacy-path ADR not loaded"
  echo "Output: $out1"
  exit 1
fi
# When canonical exists, NO legacy warning
if echo "$out1" | grep -q "LEGACY"; then
  echo "FAIL [test 1]: should not warn when canonical exists"
  echo "Output: $out1"
  exit 1
fi
echo "PASS [test 1]: both paths contribute, no legacy warning when canonical exists"

# ─── Test 2: only legacy → loads + emits LEGACY warning ────────────────────
TMP2=$(mktemp -d "$PROJECT_ROOT/tests/validation/tmp/sshook-legacy-XXXXXX")
mkdir -p "$TMP2/.context/docs/adrs"
echo "${ADR_FRONTMATTER//NAME/old-rule}" | sed 's/RULE/legacy rule/' > "$TMP2/.context/docs/adrs/001-old.md"

out2=$(run_hook "$TMP2")
if ! echo "$out2" | grep -q "legacy rule"; then
  echo "FAIL [test 2]: legacy-only ADR not loaded"
  echo "Output: $out2"
  exit 1
fi
if ! echo "$out2" | grep -qE "LEGACY|legacy path"; then
  echo "FAIL [test 2]: expected LEGACY warning when only legacy path exists"
  echo "Output: $out2"
  exit 1
fi
echo "PASS [test 2]: legacy-only loads ADRs and emits LEGACY warning"

# ─── Test 3: only canonical → loads cleanly without warning ────────────────
TMP3=$(mktemp -d "$PROJECT_ROOT/tests/validation/tmp/sshook-canon-XXXXXX")
mkdir -p "$TMP3/.context/adrs"
echo "${ADR_FRONTMATTER//NAME/canonical-only}" | sed 's/RULE/canon rule/' > "$TMP3/.context/adrs/001-canonical.md"

out3=$(run_hook "$TMP3")
if ! echo "$out3" | grep -q "canon rule"; then
  echo "FAIL [test 3]: canonical-only ADR not loaded"
  exit 1
fi
if echo "$out3" | grep -q "LEGACY"; then
  echo "FAIL [test 3]: should not emit LEGACY warning"
  echo "Output: $out3"
  exit 1
fi
echo "PASS [test 3]: canonical-only loads cleanly"

echo ""
echo "ALL PASS: session-start dual-read + N6 legacy warning"
