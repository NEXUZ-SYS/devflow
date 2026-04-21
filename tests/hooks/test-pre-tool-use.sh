#!/usr/bin/env bash
# Tests for pre-tool-use hook — branch protection gate with ASK exceptions
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOK="${REPO_ROOT}/hooks/pre-tool-use"
PASS=0
FAIL=0

assert_contains() {
  local desc="$1" output="$2" expected="$3"
  if printf '%s' "$output" | grep -q "$expected"; then
    printf '  PASS: %s\n' "$desc"
    PASS=$((PASS + 1))
  else
    printf '  FAIL: %s — expected to find "%s"\n  OUTPUT: %s\n' "$desc" "$expected" "$output"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local desc="$1" output="$2" unexpected="$3"
  if printf '%s' "$output" | grep -q "$unexpected"; then
    printf '  FAIL: %s — found unexpected "%s"\n  OUTPUT: %s\n' "$desc" "$unexpected" "$output"
    FAIL=$((FAIL + 1))
  else
    printf '  PASS: %s\n' "$desc"
    PASS=$((PASS + 1))
  fi
}

assert_empty() {
  local desc="$1" output="$2"
  if [ -z "$output" ]; then
    printf '  PASS: %s\n' "$desc"
    PASS=$((PASS + 1))
  else
    printf '  FAIL: %s — expected empty output but got: %s\n' "$desc" "$output"
    FAIL=$((FAIL + 1))
  fi
}

# Create a sandbox git repo on "main" with .devflow.yaml configured
setup_sandbox() {
  local dir
  dir=$(mktemp -d)
  (
    cd "$dir"
    git init -q -b main
    git config user.email test@test
    git config user.name test
    mkdir -p .context
    cat > .context/.devflow.yaml <<'YAML'
git:
  strategy: branch-flow
  protectedBranches: [main, develop]
  branchProtection: true
  prCli: gh
YAML
    git add -A
    git commit -q -m init
  )
  printf '%s' "$dir"
}

echo "=== Pre Tool Use Hook Tests ==="

SANDBOX=$(setup_sandbox)
trap 'rm -rf "$SANDBOX"' EXIT

# Test 1: Non-Edit/Write tools pass through silently
echo "Test 1: Read tool passes through"
output=$(echo '{"tool_name":"Read","tool_input":{"file_path":"foo.js"},"cwd":"'"$SANDBOX"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "Read produces no output" "$output"

# Test 2: Allowlist paths bypass on protected branch (silent allow)
echo "Test 2: .context/workflow/ bypasses silently"
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":"'"$SANDBOX"'/.context/workflow/status.yaml"},"cwd":"'"$SANDBOX"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "workflow file silent allow" "$output"

echo "Test 3: .context/plans/ bypasses silently"
output=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$SANDBOX"'/.context/plans/foo.md"},"cwd":"'"$SANDBOX"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "plans file silent allow" "$output"

echo "Test 4: docs/superpowers/ bypasses silently"
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":"'"$SANDBOX"'/docs/superpowers/specs/x.md"},"cwd":"'"$SANDBOX"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "superpowers file silent allow" "$output"

# Test 5: Arbitrary source file on protected branch → DENY
echo "Test 5: Arbitrary source file on main DENIED"
output=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$SANDBOX"'/src/foo.js"},"cwd":"'"$SANDBOX"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_contains "emits deny decision" "$output" '"permissionDecision": "deny"'
assert_contains "mentions branch protection" "$output" "BLOQUEADO\\|BLOCKED\\|protegida\\|protected"

# Test 6: Auto-memory path on protected branch → ASK (not deny)
echo "Test 6: Auto-memory file on main emits ASK"
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":"/home/user/.claude/projects/-home-user-proj/memory/note.md"},"cwd":"'"$SANDBOX"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_contains "emits ask decision" "$output" '"permissionDecision": "ask"'
assert_not_contains "does not emit deny" "$output" '"permissionDecision": "deny"'

# Test 7: .context/napkin.md on protected branch → ASK
echo "Test 7: .context/napkin.md on main emits ASK"
output=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$SANDBOX"'/.context/napkin.md"},"cwd":"'"$SANDBOX"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_contains "emits ask decision" "$output" '"permissionDecision": "ask"'
assert_not_contains "does not emit deny" "$output" '"permissionDecision": "deny"'

# Test 8: Non-protected branch → allow everything
echo "Test 8: On feature branch, arbitrary file passes"
(
  cd "$SANDBOX"
  git checkout -q -b feature/test
)
output=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$SANDBOX"'/src/foo.js"},"cwd":"'"$SANDBOX"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "feature branch silent allow" "$output"

# Test 9: Memory file on non-protected branch → allow (no ask needed)
echo "Test 9: Memory file on feature branch passes silently"
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":"/home/user/.claude/projects/-home-user-proj/memory/note.md"},"cwd":"'"$SANDBOX"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "memory file silent allow on feature" "$output"

# Back to main for remaining tests
(
  cd "$SANDBOX"
  git checkout -q main
)

# Test 10: No config → deny with config instruction
echo "Test 10: Missing .devflow.yaml denies with config message"
NOCONFIG=$(mktemp -d)
(
  cd "$NOCONFIG"
  git init -q -b main
  git config user.email t@t
  git config user.name t
  git commit -q --allow-empty -m init
)
output=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$NOCONFIG"'/foo.js"},"cwd":"'"$NOCONFIG"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_contains "denies on missing config" "$output" '"permissionDecision": "deny"'
rm -rf "$NOCONFIG"

echo ""
echo "=== Results ==="
printf 'PASS: %d\n' "$PASS"
printf 'FAIL: %d\n' "$FAIL"
exit $((FAIL > 0 ? 1 : 0))
