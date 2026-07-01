#!/usr/bin/env bash
# Tests for post-tool-use hook — commit prompt and branch finish detection
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOK="${REPO_ROOT}/hooks/post-tool-use"
PASS=0
FAIL=0

assert_contains() {
  local desc="$1" output="$2" expected="$3"
  if printf '%s' "$output" | grep -q "$expected"; then
    printf '  PASS: %s\n' "$desc"
    PASS=$((PASS + 1))
  else
    printf '  FAIL: %s — expected to find "%s"\n' "$desc" "$expected"
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

echo "=== Post Tool Use Hook Tests ==="

# Test 1: Write tool → only handoff reminder
echo "Test 1: Write tool emits only handoff"
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":"foo.js"},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff reminder" "$output" "HANDOFF"
assert_not_contains "no commit prompt" "$output" "COMMIT"
assert_not_contains "no branch finish" "$output" "BRANCH FINISH"

# Test 2: TaskUpdate with status=in_progress → only handoff
echo "Test 2: TaskUpdate in_progress emits only handoff"
output=$(echo '{"tool_name":"TaskUpdate","tool_input":{"status":"in_progress","taskId":"1"},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff reminder" "$output" "HANDOFF"
assert_not_contains "no commit prompt" "$output" "COMMIT"
assert_not_contains "no branch finish" "$output" "BRANCH FINISH"

# Test 3: TaskUpdate with status=completed → emits commit or finish prompt
echo "Test 3: TaskUpdate completed emits conditional prompt"
output=$(echo '{"tool_name":"TaskUpdate","tool_input":{"status":"completed","taskId":"1"},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff reminder" "$output" "HANDOFF"
# Should have either COMMIT or BRANCH FINISH depending on git state
if printf '%s' "$output" | grep -qE "COMMIT|BRANCH FINISH"; then
  printf '  PASS: has conditional prompt (COMMIT or BRANCH FINISH)\n'
  PASS=$((PASS + 1))
else
  printf '  FAIL: missing conditional prompt\n'
  FAIL=$((FAIL + 1))
fi

# Test 4: Valid JSON output
echo "Test 4: Output is valid JSON"
json_output=$(echo '{"tool_name":"Write","tool_input":{},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
if printf '%s' "$json_output" | python3 -m json.tool > /dev/null 2>&1; then
  printf '  PASS: valid JSON\n'
  PASS=$((PASS + 1))
else
  printf '  FAIL: invalid JSON output\n'
  FAIL=$((FAIL + 1))
fi

# Test 5: Valid JSON output for TaskUpdate completed
echo "Test 5: TaskUpdate completed output is valid JSON"
json_output=$(echo '{"tool_name":"TaskUpdate","tool_input":{"status":"completed","taskId":"1"},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
if printf '%s' "$json_output" | python3 -m json.tool > /dev/null 2>&1; then
  printf '  PASS: valid JSON\n'
  PASS=$((PASS + 1))
else
  printf '  FAIL: invalid JSON output\n'
  FAIL=$((FAIL + 1))
fi

# Test 6: Empty stdin doesn't crash
echo "Test 6: Empty stdin graceful handling"
output=$(echo '{}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff on empty input" "$output" "HANDOFF"
if printf '%s' "$output" | python3 -m json.tool > /dev/null 2>&1; then
  printf '  PASS: valid JSON on empty input\n'
  PASS=$((PASS + 1))
else
  printf '  FAIL: invalid JSON on empty input\n'
  FAIL=$((FAIL + 1))
fi

# Test 7: TaskUpdate with status=deleted → only handoff
echo "Test 7: TaskUpdate deleted emits only handoff"
output=$(echo '{"tool_name":"TaskUpdate","tool_input":{"status":"deleted","taskId":"1"},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff reminder" "$output" "HANDOFF"
assert_not_contains "no commit prompt" "$output" "COMMIT"
assert_not_contains "no branch finish" "$output" "BRANCH FINISH"

# --- helpers: cwd temporário com git.versioning configurável ---
PTU_TMPDIRS=()
mk_cwd() { # $1 = valor de git.versioning ("" = ausente)
  local d; d=$(mktemp -d); PTU_TMPDIRS+=("$d")
  mkdir -p "$d/.context"
  if [ -n "${1:-}" ]; then
    printf 'git:\n  strategy: branch-flow\n  versioning: %s\n' "$1" > "$d/.context/.devflow.yaml"
  else
    printf 'git:\n  strategy: branch-flow\n' > "$d/.context/.devflow.yaml"
  fi
  echo "$d"
}
ptu_cleanup() { local d; for d in "${PTU_TMPDIRS[@]:-}"; do [ -n "$d" ] && rm -rf "$d"; done; return 0; }
trap ptu_cleanup EXIT

# Test 8: merge com versioning ausente (bump local) → emits bump warning
echo "Test 8: merge (versioning ausente) emits bump warning"
CWD8=$(mk_cwd "")
output=$(echo '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 7 --merge --delete-branch"},"cwd":"'"$CWD8"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "bump warning (versioning ausente)" "$output" "BUMP"

# Test 9: git merge com versioning: local → emits bump warning
echo "Test 9: merge (versioning: local) emits bump warning"
CWD9=$(mk_cwd "local")
output=$(echo '{"tool_name":"Bash","tool_input":{"command":"git merge feature/foo"},"cwd":"'"$CWD9"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "bump warning (versioning: local)" "$output" "BUMP"

# Test 9b: merge com versioning: pipeline → SEM bump warning (bump é da pipeline de release)
echo "Test 9b: merge (versioning: pipeline) suppresses bump warning"
CWD9B=$(mk_cwd "pipeline")
output=$(echo '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 7 --merge --delete-branch"},"cwd":"'"$CWD9B"'"}' | bash "$HOOK" 2>/dev/null)
assert_not_contains "sem bump warning (versioning: pipeline)" "$output" "BUMP"

# Test 10: comando não-merge → sem bump warning
echo "Test 10: non-merge command no bump warning"
CWD10=$(mk_cwd "")
output=$(echo '{"tool_name":"Bash","tool_input":{"command":"git status"},"cwd":"'"$CWD10"'"}' | bash "$HOOK" 2>/dev/null)
assert_not_contains "no bump warning (non-merge)" "$output" "BUMP"

# Test 11: Bash merge output is valid JSON
echo "Test 11: Bash merge output is valid JSON"
json_output=$(echo '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 1 --merge"},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
if printf '%s' "$json_output" | python3 -m json.tool > /dev/null 2>&1; then
  printf '  PASS: valid JSON\n'
  PASS=$((PASS + 1))
else
  printf '  FAIL: invalid JSON output\n'
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
