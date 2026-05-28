#!/usr/bin/env bash
# Tests for the post-merge mempalace auto-mine hook + its installer.
# Run: bash tests/hooks/test-post-merge-mempalace.sh
#
# Safety: every test runs against a throwaway temp git repo with a MOCK
# `mempalace` on PATH (records args, never embeds). The real palace
# (~/.mempalace) and the real .git are never touched.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOK_SCRIPT="${PROJECT_ROOT}/scripts/post-merge-mempalace.sh"
INSTALL_SCRIPT="${PROJECT_ROOT}/scripts/install-git-hook.sh"

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    echo -e "  ${GREEN}✓${NC} $desc"; TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"; echo "    Expected to contain: $needle"; echo "    Got: $haystack"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_empty() {
  local desc="$1" value="$2"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ -z "$value" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"; TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"; echo "    Expected empty, got: $value"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_file_exists() {
  local desc="$1" path="$2"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ -f "$path" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"; TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"; echo "    Expected file: $path"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_file_absent() {
  local desc="$1" path="$2"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ ! -e "$path" ]; then
    echo -e "  ${GREEN}✓${NC} $desc"; TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"; echo "    Expected absent: $path"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT

# Mock mempalace: records each invocation's args to $MOCK_CALLS_FILE.
MOCKBIN="$TMPROOT/mockbin"
mkdir -p "$MOCKBIN"
cat > "$MOCKBIN/mempalace" << 'MOCK'
#!/usr/bin/env bash
echo "$*" >> "$MOCK_CALLS_FILE"
[ -n "${MOCK_FAIL:-}" ] && exit 1
exit 0
MOCK
chmod +x "$MOCKBIN/mempalace"

# Create a throwaway git repo on a given branch with a given .devflow.yaml body.
# Usage: make_repo <branch> <devflow_yaml_or_empty>
make_repo() {
  local branch="$1" yaml="$2"
  local repo; repo=$(mktemp -d "$TMPROOT/repo.XXXXXX")
  git -C "$repo" init -q -b main
  git -C "$repo" config user.email t@t.t
  git -C "$repo" config user.name t
  echo "seed" > "$repo/seed.txt"
  git -C "$repo" add -A && git -C "$repo" commit -q -m seed
  [ "$branch" != "main" ] && git -C "$repo" checkout -q -b "$branch"
  if [ -n "$yaml" ]; then
    mkdir -p "$repo/.context"
    printf '%s\n' "$yaml" > "$repo/.context/.devflow.yaml"
  fi
  printf '%s' "$repo"
}

# Run the hook inside repo; with_mock=yes prepends the mock mempalace to PATH.
# Polls the calls file briefly so the detached miner has time to record.
run_hook() {
  local repo="$1" with_mock="$2"
  local calls="$repo/.git/mock-calls.log"
  rm -f "$calls"
  local path="$PATH"
  [ "$with_mock" = "yes" ] && path="$MOCKBIN:$PATH"
  ( cd "$repo" && MOCK_CALLS_FILE="$calls" PATH="$path" bash "$HOOK_SCRIPT" ) >/dev/null 2>&1
  # Wait up to ~1s for the backgrounded miner to write (positive cases finish in ms).
  local t=0
  while [ ! -s "$calls" ] && [ "$t" -lt 20 ]; do sleep 0.05; t=$((t + 1)); done
  sleep 0.15  # settle so both the mine and sync lines land
  cat "$calls" 2>/dev/null || true
}

DEVFLOW_ON=$'git:\n  protectedBranches: [main, develop]\nmempalace:\n  enabled: true\n  autoMine: post-merge'

echo "=== post-merge hook: behavior ==="

# 1. main + autoMine post-merge → mines + syncs the wing (basename)
repo=$(make_repo main "$DEVFLOW_ON")
out=$(run_hook "$repo" yes)
wing=$(basename "$repo")
assert_contains "runs mine with project wing on main" "$out" "mine"
assert_contains "mine passes --wing <repo basename>" "$out" "--wing $wing"
assert_contains "runs sync --apply for the wing" "$out" "sync --wing $wing --apply"

# 2. branch guard — feature branch → no-op
repo=$(make_repo feature/x "$DEVFLOW_ON")
out=$(run_hook "$repo" yes)
assert_empty "no mining on non-protected branch" "$out"

# 3. mempalace not on PATH → no-op, must still exit 0
repo=$(make_repo main "$DEVFLOW_ON")
out=$(run_hook "$repo" no)
assert_empty "no-op when mempalace CLI is absent" "$out"

# 4. autoMine: off → no-op
repo=$(make_repo main $'mempalace:\n  enabled: true\n  autoMine: off')
out=$(run_hook "$repo" yes)
assert_empty "no mining when autoMine: off" "$out"

# 5. mempalace section absent → no-op (disabled)
repo=$(make_repo main $'git:\n  strategy: branch-flow')
out=$(run_hook "$repo" yes)
assert_empty "no mining when mempalace section absent" "$out"

# 6. wing injection — malicious wing must NOT execute and must NOT mine
repo=$(make_repo main $'mempalace:\n  enabled: true\n  autoMine: post-merge\n  wing: evil; touch pwned')
out=$(run_hook "$repo" yes)
assert_empty "rejects wing with shell metacharacters (no mine)" "$out"
assert_file_absent "no command injection via wing" "$repo/pwned"

# 7. fail-safe — mempalace failing must not make the hook fail
repo=$(make_repo main "$DEVFLOW_ON")
( cd "$repo" && MOCK_CALLS_FILE="$repo/.git/mc.log" MOCK_FAIL=1 PATH="$MOCKBIN:$PATH" bash "$HOOK_SCRIPT" ) >/dev/null 2>&1
rc=$?
TESTS_TOTAL=$((TESTS_TOTAL + 1))
if [ "$rc" -eq 0 ]; then echo -e "  ${GREEN}✓${NC} hook exits 0 even if mempalace errors"; TESTS_PASSED=$((TESTS_PASSED + 1));
else echo -e "  ${RED}✗${NC} hook exits 0 even if mempalace errors (got $rc)"; TESTS_FAILED=$((TESTS_FAILED + 1)); fi

echo ""
echo "=== install-git-hook.sh ==="

# 8. clean install → post-merge created, executable, carries marker
repo=$(make_repo main "$DEVFLOW_ON")
bash "$INSTALL_SCRIPT" "$repo" >/dev/null 2>&1
assert_file_exists "installs .git/hooks/post-merge" "$repo/.git/hooks/post-merge"
TESTS_TOTAL=$((TESTS_TOTAL + 1))
if [ -x "$repo/.git/hooks/post-merge" ]; then echo -e "  ${GREEN}✓${NC} installed hook is executable"; TESTS_PASSED=$((TESTS_PASSED + 1));
else echo -e "  ${RED}✗${NC} installed hook is executable"; TESTS_FAILED=$((TESTS_FAILED + 1)); fi
assert_contains "installed hook carries the DevFlow marker" "$(cat "$repo/.git/hooks/post-merge")" "devflow:mempalace-automine"

# 9. idempotent re-install over our own hook → succeeds (rc 0)
bash "$INSTALL_SCRIPT" "$repo" >/dev/null 2>&1
rc=$?
TESTS_TOTAL=$((TESTS_TOTAL + 1))
if [ "$rc" -eq 0 ]; then echo -e "  ${GREEN}✓${NC} idempotent re-install over our hook"; TESTS_PASSED=$((TESTS_PASSED + 1));
else echo -e "  ${RED}✗${NC} idempotent re-install over our hook (got $rc)"; TESTS_FAILED=$((TESTS_FAILED + 1)); fi

# 10. no-clobber — foreign post-merge hook is preserved
repo=$(make_repo main "$DEVFLOW_ON")
mkdir -p "$repo/.git/hooks"
printf '#!/usr/bin/env bash\necho FOREIGN\n' > "$repo/.git/hooks/post-merge"
chmod +x "$repo/.git/hooks/post-merge"
install_out=$(bash "$INSTALL_SCRIPT" "$repo" 2>&1 || true)
assert_contains "foreign hook is preserved" "$(cat "$repo/.git/hooks/post-merge")" "FOREIGN"
assert_contains "installer warns about existing foreign hook" "$install_out" "existing"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  post-merge mempalace tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; exit 1
else
  echo -e "  ${GREEN}All passed${NC}"; echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi
