#!/usr/bin/env bash
# E2E tests for scripts/update-external-skill.sh
# Uses file:// URLs to simulate remote fetches without network.
# Run: bash tests/scripts/test-update-external-skill.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HELPER="${PROJECT_ROOT}/scripts/update-external-skill.sh"
TMP_DIR=$(mktemp -d)
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cleanup() { rm -rf "$TMP_DIR"; }
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

assert_file_contains() {
  local desc="$1" path="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ -f "$path" ] && grep -qF "$needle" "$path"; then
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Path: $path (exists: $([ -f "$path" ] && echo yes || echo no))"
    echo "    Expected to contain: $needle"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# ─── Set up fake upstream directory (served via file://) ────────────

upstream_dir="${TMP_DIR}/upstream"
mkdir -p "$upstream_dir"
cat > "${upstream_dir}/SKILL.md" <<'MD'
---
name: fake-skill
version: 6.0.0
---
# Upstream v6 content
MD
cat > "${upstream_dir}/README.md" <<'MD'
# Upstream README v6
MD
cat > "${upstream_dir}/LICENSE" <<'MD'
MIT upstream v6
MD

upstream_url="file://${upstream_dir}"

# ─── Set up fake skills directory ──────────────────────────────────

fake_skills="${TMP_DIR}/fake-skills"
mkdir -p "${fake_skills}/fake-skill"
cat > "${fake_skills}/fake-skill/SKILL.md" <<'MD'
---
name: fake-skill
version: 5.0.0
---
# Old v5 content
MD
cat > "${fake_skills}/fake-skill/README.md" <<'MD'
# Old README v5
MD
cat > "${fake_skills}/fake-skill/LICENSE" <<'MD'
MIT old v5
MD
# A customization file the user might have added — must NOT be deleted
cat > "${fake_skills}/fake-skill/user-notes.md" <<'MD'
My personal notes, not part of the package
MD

# ─── Test 1: Happy path — all files get updated atomically ─────────

echo "=== Happy path ==="
EXTERNAL_SKILLS_DIR="$fake_skills" bash "$HELPER" \
  fake-skill "$upstream_url" SKILL.md README.md LICENSE 2>&1

assert_file_contains "SKILL.md updated to v6" \
  "${fake_skills}/fake-skill/SKILL.md" "Upstream v6 content"
assert_file_contains "README.md updated to v6" \
  "${fake_skills}/fake-skill/README.md" "Upstream README v6"
assert_file_contains "LICENSE updated to v6" \
  "${fake_skills}/fake-skill/LICENSE" "MIT upstream v6"

# Unrelated files must be preserved
assert_file_contains "user-notes.md preserved" \
  "${fake_skills}/fake-skill/user-notes.md" "My personal notes"

# No stray .new files left behind
assert_true "no .new temp files left" \
  '[ -z "$(find "${fake_skills}/fake-skill" -name "*.new" 2>/dev/null)" ]'

# ─── Test 2: Target dir doesn't exist — silent no-op ───────────────

echo ""
echo "=== Missing target dir (no-op) ==="

empty_skills="${TMP_DIR}/empty-skills"
mkdir -p "$empty_skills"
# Note: fake-skill directory does NOT exist here

exit_code=0
EXTERNAL_SKILLS_DIR="$empty_skills" bash "$HELPER" \
  fake-skill "$upstream_url" SKILL.md 2>&1 || exit_code=$?

assert_true "script exits 0 when target dir missing" '[ "$exit_code" -eq 0 ]'
assert_true "no files created when target missing" \
  '[ ! -d "${empty_skills}/fake-skill" ]'

# ─── Test 3: Bad URL — atomic failure, old files preserved ─────────

echo ""
echo "=== Fetch failure is atomic ==="

atomic_skills="${TMP_DIR}/atomic-skills"
mkdir -p "${atomic_skills}/fake-skill"
cat > "${atomic_skills}/fake-skill/SKILL.md" <<'MD'
# Original content — must survive
MD
cat > "${atomic_skills}/fake-skill/README.md" <<'MD'
# Original README — must survive
MD

bad_url="file:///nonexistent-upstream-dir-xyz123"

exit_code=0
EXTERNAL_SKILLS_DIR="$atomic_skills" bash "$HELPER" \
  fake-skill "$bad_url" SKILL.md README.md 2>&1 || exit_code=$?

assert_true "script exits 0 even on fetch failure (silent)" '[ "$exit_code" -eq 0 ]'
assert_file_contains "SKILL.md unchanged after failed fetch" \
  "${atomic_skills}/fake-skill/SKILL.md" "Original content — must survive"
assert_file_contains "README.md unchanged after failed fetch" \
  "${atomic_skills}/fake-skill/README.md" "Original README — must survive"
assert_true "no .new files leaked from failed fetch" \
  '[ -z "$(find "${atomic_skills}/fake-skill" -name "*.new" 2>/dev/null)" ]'

# ─── Test 4: Partial failure — any file failing aborts all writes ──

echo ""
echo "=== Partial failure is atomic (all-or-nothing) ==="

partial_skills="${TMP_DIR}/partial-skills"
mkdir -p "${partial_skills}/fake-skill"
cat > "${partial_skills}/fake-skill/SKILL.md" <<'MD'
# Original SKILL
MD
cat > "${partial_skills}/fake-skill/README.md" <<'MD'
# Original README
MD

exit_code=0
# SKILL.md exists upstream, MISSING_FILE.md does not
EXTERNAL_SKILLS_DIR="$partial_skills" bash "$HELPER" \
  fake-skill "$upstream_url" SKILL.md MISSING_FILE.md 2>&1 || exit_code=$?

assert_true "script exits 0 on partial failure (silent)" '[ "$exit_code" -eq 0 ]'
assert_file_contains "SKILL.md NOT updated when sibling file fails" \
  "${partial_skills}/fake-skill/SKILL.md" "Original SKILL"

# ─── Report ────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  update-external-skill tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}All passed${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
