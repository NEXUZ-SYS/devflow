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

# Test 3: TaskUpdate completed em SANDBOX de estado conhecido (branch feature + árvore suja)
# → emite COMMIT. Antes usava cwd=$REPO_ROOT (estado da árvore real), o que falhava num
# checkout limpo de CI (HEAD destacado, sem mudanças → só HANDOFF). Sandbox torna determinístico.
echo "Test 3: TaskUpdate completed emits conditional prompt (sandboxed)"
SB3=$(mktemp -d)
(
  cd "$SB3"
  git init -q -b main
  mkdir -p .context
  printf 'git:\n  autoFinish: false\n' > .context/.devflow.yaml
  echo "orig" > file.txt
  git -c user.email=t@t -c user.name=t add -A
  git -c user.email=t@t -c user.name=t commit -q -m init
  git checkout -q -b feature/x
  echo "changed" > file.txt   # tracked-modified → git diff mostra → HAS_CHANGES=true → COMMIT prompt
)
output=$(echo '{"tool_name":"TaskUpdate","tool_input":{"status":"completed","taskId":"1"},"cwd":"'"$SB3"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff reminder" "$output" "HANDOFF"
assert_contains "has commit prompt (dirty tree)" "$output" "COMMIT"
rm -rf "$SB3"

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
mk_cwd() { # $1 = git.versioning ("" = ausente) ; $2 = has_bump (1 = cria scripts/bump-version.sh)
  local d; d=$(mktemp -d); PTU_TMPDIRS+=("$d")
  mkdir -p "$d/.context"
  if [ -n "${1:-}" ]; then
    printf 'git:\n  strategy: branch-flow\n  versioning: %s\n' "$1" > "$d/.context/.devflow.yaml"
  else
    printf 'git:\n  strategy: branch-flow\n' > "$d/.context/.devflow.yaml"
  fi
  if [ "${2:-0}" = "1" ]; then
    mkdir -p "$d/scripts"
    printf '#!/usr/bin/env bash\necho stub\n' > "$d/scripts/bump-version.sh"
  fi
  echo "$d"
}
ptu_cleanup() { local d; for d in "${PTU_TMPDIRS[@]:-}"; do [ -n "$d" ] && rm -rf "$d"; done; return 0; }
trap ptu_cleanup EXIT

# Test 8: merge, versioning ausente + tem mecanismo de bump → emits bump warning
echo "Test 8: merge (versioning ausente, com mecanismo) emits bump warning"
CWD8=$(mk_cwd "" 1)
output=$(echo '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 7 --merge --delete-branch"},"cwd":"'"$CWD8"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "bump warning (ausente + mecanismo)" "$output" "BUMP"

# Test 9: git merge, versioning: local + mecanismo → emits bump warning
echo "Test 9: merge (versioning: local, com mecanismo) emits bump warning"
CWD9=$(mk_cwd "local" 1)
output=$(echo '{"tool_name":"Bash","tool_input":{"command":"git merge feature/foo"},"cwd":"'"$CWD9"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "bump warning (local + mecanismo)" "$output" "BUMP"

# Test 9b: merge, versioning: pipeline → SEM bump warning (bump é da pipeline)
echo "Test 9b: merge (versioning: pipeline) suppresses bump warning"
CWD9B=$(mk_cwd "pipeline" 1)
output=$(echo '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 7 --merge --delete-branch"},"cwd":"'"$CWD9B"'"}' | bash "$HOOK" 2>/dev/null)
assert_not_contains "sem bump warning (pipeline)" "$output" "BUMP"

# Test 9c: merge, versioning: none → SEM bump warning (projeto não versiona)
echo "Test 9c: merge (versioning: none) suppresses bump warning"
CWD9C=$(mk_cwd "none" 1)
output=$(echo '{"tool_name":"Bash","tool_input":{"command":"gh pr merge 7 --merge --delete-branch"},"cwd":"'"$CWD9C"'"}' | bash "$HOOK" 2>/dev/null)
assert_not_contains "sem bump warning (none)" "$output" "BUMP"

# Test 9d: merge, versioning ausente + SEM mecanismo de bump → SEM bump warning (falso positivo eliminado)
echo "Test 9d: merge (ausente, sem mecanismo) suppresses bump warning"
CWD9D=$(mk_cwd "" 0)
output=$(echo '{"tool_name":"Bash","tool_input":{"command":"git merge feature/foo"},"cwd":"'"$CWD9D"'"}' | bash "$HOOK" 2>/dev/null)
assert_not_contains "sem bump warning (sem mecanismo)" "$output" "BUMP"

# Test 10: comando não-merge → sem bump warning
echo "Test 10: non-merge command no bump warning"
CWD10=$(mk_cwd "" 1)
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
