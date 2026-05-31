#!/usr/bin/env bash
# Tests for post-tool-use hook — PREVC handoff bypass detection (T20, ADR-006)
# When a plan file is written without an active PREVC workflow, a
# PREVC_HANDOFF_BYPASS reminder must be emitted (non-blocking, pt-BR).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOK="${REPO_ROOT}/hooks/post-tool-use"
HELPER="${REPO_ROOT}/scripts/lib/check-prevc-bypass.mjs"
PASS=0
FAIL=0

assert_contains() {
  local desc="$1" output="$2" expected="$3"
  if printf '%s' "$output" | grep -q "$expected"; then
    printf '  PASS: %s\n' "$desc"
    PASS=$((PASS + 1))
  else
    printf '  FAIL: %s — expected to find "%s"\n' "$desc" "$expected"
    printf '  (got: %s)\n' "$(printf '%s' "$output" | head -5)"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local desc="$1" output="$2" unexpected="$3"
  if printf '%s' "$output" | grep -q "$unexpected"; then
    printf '  FAIL: %s — found unexpected "%s"\n' "$desc" "$unexpected"
    FAIL=$((FAIL + 1))
  else
    printf '  PASS: %s\n' "$desc"
    PASS=$((PASS + 1))
  fi
}

# ── Helper: make a tmp project dir with minimal structure ──────────────────────
make_project() {
  local tmpdir
  tmpdir=$(mktemp -d)
  # Minimal git repo so the hook doesn't trip on git calls
  git -C "$tmpdir" init -q
  git -C "$tmpdir" config user.email "test@test.com"
  git -C "$tmpdir" config user.name "Test"
  echo "# project" > "$tmpdir/README.md"
  git -C "$tmpdir" add README.md
  git -C "$tmpdir" commit -q -m "init" --no-verify
  printf '%s' "$tmpdir"
}

# ── Helper: create prevc workflow file ────────────────────────────────────────
write_prevc_json() {
  local dir="$1" content="$2"
  mkdir -p "$dir/.context/harness/workflows"
  printf '%s' "$content" > "$dir/.context/harness/workflows/prevc.json"
}

# ── Helper: create plan file ──────────────────────────────────────────────────
write_plan_file() {
  local dir="$1" rel_path="$2"
  local full_path="$dir/$rel_path"
  mkdir -p "$(dirname "$full_path")"
  printf '# Plan\n' > "$full_path"
}

echo "=== Post Tool Use Hook — PREVC Handoff Bypass Tests ==="

# ── Test 1: Bypass warns when no prevc.json ────────────────────────────────────
echo "Test 1: Write to plan path without workflow → warns"
TMPDIR1=$(make_project)
write_plan_file "$TMPDIR1" "docs/superpowers/plans/foo.md"

output=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/docs/superpowers/plans/foo.md"},"cwd":"%s"}' \
  "$TMPDIR1" "$TMPDIR1" \
  | bash "$HOOK" 2>/dev/null)

assert_contains "bypass warning present" "$output" "PREVC_HANDOFF_BYPASS"
assert_contains "valid JSON" "$(printf '%s' "$output" | python3 -m json.tool > /dev/null 2>&1 && echo ok)" "ok"
rm -rf "$TMPDIR1"

# ── Test 2: Active workflow → no bypass warning ────────────────────────────────
echo "Test 2: Active PREVC workflow → no warning"
TMPDIR2=$(make_project)
write_plan_file "$TMPDIR2" "docs/superpowers/plans/bar.md"
write_prevc_json "$TMPDIR2" '{"name":"x","isComplete":false,"phases":{"E":{"status":"in_progress"}}}'

output=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/docs/superpowers/plans/bar.md"},"cwd":"%s"}' \
  "$TMPDIR2" "$TMPDIR2" \
  | bash "$HOOK" 2>/dev/null)

assert_not_contains "no bypass warning when active" "$output" "PREVC_HANDOFF_BYPASS"
rm -rf "$TMPDIR2"

# ── Test 3: Completed workflow → warns ────────────────────────────────────────
echo "Test 3: Completed workflow → warns (new plan after finished workflow)"
TMPDIR3=$(make_project)
write_plan_file "$TMPDIR3" ".context/plans/my-plan.md"
write_prevc_json "$TMPDIR3" '{"name":"x","isComplete":true}'

output=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/.context/plans/my-plan.md"},"cwd":"%s"}' \
  "$TMPDIR3" "$TMPDIR3" \
  | bash "$HOOK" 2>/dev/null)

assert_contains "bypass warning on completed workflow" "$output" "PREVC_HANDOFF_BYPASS"
rm -rf "$TMPDIR3"

# ── Test 4: Non-plan file → no warning ────────────────────────────────────────
echo "Test 4: Write to non-plan file → no warning"
TMPDIR4=$(make_project)

output=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/src/foo.ts"},"cwd":"%s"}' \
  "$TMPDIR4" "$TMPDIR4" \
  | bash "$HOOK" 2>/dev/null)

assert_not_contains "no bypass warning for non-plan file" "$output" "PREVC_HANDOFF_BYPASS"
rm -rf "$TMPDIR4"

# ── Test 5: Edit tool also triggers check ─────────────────────────────────────
echo "Test 5: Edit to plan path without workflow → warns"
TMPDIR5=$(make_project)
write_plan_file "$TMPDIR5" "docs/superpowers/plans/baz.md"

output=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/docs/superpowers/plans/baz.md"},"cwd":"%s"}' \
  "$TMPDIR5" "$TMPDIR5" \
  | bash "$HOOK" 2>/dev/null)

assert_contains "bypass warning on Edit to plan path" "$output" "PREVC_HANDOFF_BYPASS"
rm -rf "$TMPDIR5"

# ── Test 6: status=completed in prevc.json → treat as finished → warns ────────
echo "Test 6: Workflow with status=completed → warns"
TMPDIR6=$(make_project)
write_plan_file "$TMPDIR6" "docs/superpowers/plans/plan.md"
write_prevc_json "$TMPDIR6" '{"name":"x","status":"completed","phases":{"C":{"status":"completed"}}}'

output=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/docs/superpowers/plans/plan.md"},"cwd":"%s"}' \
  "$TMPDIR6" "$TMPDIR6" \
  | bash "$HOOK" 2>/dev/null)

assert_contains "bypass warning when status=completed" "$output" "PREVC_HANDOFF_BYPASS"
rm -rf "$TMPDIR6"

# ── Test 7: phases.C.status=completed → warns ─────────────────────────────────
echo "Test 7: Workflow phases.C.status=completed → warns"
TMPDIR7=$(make_project)
write_plan_file "$TMPDIR7" "docs/superpowers/plans/plan7.md"
write_prevc_json "$TMPDIR7" '{"name":"x","isComplete":false,"phases":{"C":{"status":"completed"}}}'

output=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/docs/superpowers/plans/plan7.md"},"cwd":"%s"}' \
  "$TMPDIR7" "$TMPDIR7" \
  | bash "$HOOK" 2>/dev/null)

assert_contains "bypass warning when C.status=completed" "$output" "PREVC_HANDOFF_BYPASS"
rm -rf "$TMPDIR7"

# ── Test 8: Malformed prevc.json → treats as not active → warns ───────────────
echo "Test 8: Malformed prevc.json → treats as not active → warns"
TMPDIR8=$(make_project)
write_plan_file "$TMPDIR8" "docs/superpowers/plans/plan8.md"
write_prevc_json "$TMPDIR8" '{not valid json'

output=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/docs/superpowers/plans/plan8.md"},"cwd":"%s"}' \
  "$TMPDIR8" "$TMPDIR8" \
  | bash "$HOOK" 2>/dev/null)

assert_contains "bypass warning on malformed prevc.json" "$output" "PREVC_HANDOFF_BYPASS"
rm -rf "$TMPDIR8"

# ── Test 9: .context/plans path also triggers ─────────────────────────────────
echo "Test 9: .context/plans path also triggers bypass check"
TMPDIR9=$(make_project)
write_plan_file "$TMPDIR9" ".context/plans/another.md"

output=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/.context/plans/another.md"},"cwd":"%s"}' \
  "$TMPDIR9" "$TMPDIR9" \
  | bash "$HOOK" 2>/dev/null)

assert_contains "bypass warning on .context/plans path" "$output" "PREVC_HANDOFF_BYPASS"
rm -rf "$TMPDIR9"

# ── Test 10: Hook output always valid JSON ─────────────────────────────────────
echo "Test 10: Output is always valid JSON (with bypass warning)"
TMPDIR10=$(make_project)
write_plan_file "$TMPDIR10" "docs/superpowers/plans/json-test.md"

json_output=$(printf '{"tool_name":"Write","tool_input":{"file_path":"%s/docs/superpowers/plans/json-test.md"},"cwd":"%s"}' \
  "$TMPDIR10" "$TMPDIR10" \
  | bash "$HOOK" 2>/dev/null)

if printf '%s' "$json_output" | python3 -m json.tool > /dev/null 2>&1; then
  printf '  PASS: valid JSON with bypass warning\n'
  PASS=$((PASS + 1))
else
  printf '  FAIL: invalid JSON when bypass warning present\n'
  FAIL=$((FAIL + 1))
fi
rm -rf "$TMPDIR10"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
