#!/usr/bin/env bash
# Tests for pre-tool-use hook — grounding web-block (doc-grounding mode).
# Verifies WebSearch/WebFetch are denied when grounding.mode != off + blockWeb,
# and that the existing branch-protection path is byte-untouched.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOK="${REPO_ROOT}/hooks/pre-tool-use"
PASS=0
FAIL=0

assert_contains() {
  local desc="$1" output="$2" expected="$3"
  if printf '%s' "$output" | grep -q "$expected"; then
    printf '  PASS: %s\n' "$desc"; PASS=$((PASS + 1))
  else
    printf '  FAIL: %s — expected "%s"\n  OUTPUT: %s\n' "$desc" "$expected" "$output"; FAIL=$((FAIL + 1))
  fi
}
assert_empty() {
  local desc="$1" output="$2"
  if [ -z "$output" ]; then printf '  PASS: %s\n' "$desc"; PASS=$((PASS + 1))
  else printf '  FAIL: %s — expected empty but got: %s\n' "$desc" "$output"; FAIL=$((FAIL + 1)); fi
}

# Sandbox on "main" with a grounding: section. Args: <mode> <blockWeb>
setup_sandbox() {
  local mode="$1" block_web="$2" dir
  dir=$(mktemp -d)
  (
    cd "$dir"
    git init -q -b main; git config user.email t@t; git config user.name t
    mkdir -p .context
    cat > .context/.devflow.yaml <<YAML
git:
  strategy: branch-flow
  protectedBranches: [main, develop]
  branchProtection: true
  prCli: gh
grounding:
  mode: ${mode}
  blockWeb: ${block_web}
  docsMcpServer: docs-mcp-server
YAML
    git add -A; git commit -q -m init
  )
  printf '%s' "$dir"
}

echo "=== Pre Tool Use Hook — Grounding Web-Block Tests ==="

# --- mode=docs-only, blockWeb=true → web tools DENIED ---
SB_STRICT=$(setup_sandbox "docs-only" "true")
trap 'rm -rf "$SB_STRICT"' EXIT

echo "Test 1: WebSearch denied under docs-only"
out=$(echo '{"tool_name":"WebSearch","tool_input":{"query":"odoo orm"},"cwd":"'"$SB_STRICT"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_contains "WebSearch → deny" "$out" '"permissionDecision": "deny"'
assert_contains "deny cita o MCP de docs" "$out" 'docs-mcp-server\|search_docs\|grounding'

echo "Test 2: WebFetch denied under docs-only"
out=$(echo '{"tool_name":"WebFetch","tool_input":{"url":"https://x"},"cwd":"'"$SB_STRICT"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_contains "WebFetch → deny" "$out" '"permissionDecision": "deny"'

echo "Test 3: branch-protection INALTERADA (Edit src em main ainda nega)"
out=$(echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$SB_STRICT"'/src/foo.js"},"cwd":"'"$SB_STRICT"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_contains "Edit src → deny (regressão)" "$out" '"permissionDecision": "deny"'
assert_contains "deny é o de branch-protection" "$out" 'BLOQUEADO\|BLOCKED\|protegida\|protected'

echo "Test 4: Read passa (não é web nem Edit)"
out=$(echo '{"tool_name":"Read","tool_input":{"file_path":"foo.js"},"cwd":"'"$SB_STRICT"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "Read silent allow" "$out"

# --- docs-first também bloqueia web ---
echo "Test 5: WebSearch denied under docs-first"
SB_FIRST=$(setup_sandbox "docs-first" "true")
out=$(echo '{"tool_name":"WebSearch","tool_input":{"query":"x"},"cwd":"'"$SB_FIRST"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_contains "docs-first também nega web" "$out" '"permissionDecision": "deny"'
rm -rf "$SB_FIRST"

# --- mode=off → web liberado (passthrough) ---
echo "Test 6: WebSearch liberado com mode=off"
SB_OFF=$(setup_sandbox "off" "true")
out=$(echo '{"tool_name":"WebSearch","tool_input":{"query":"x"},"cwd":"'"$SB_OFF"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "mode=off → web passa" "$out"
rm -rf "$SB_OFF"

# --- blockWeb=false → web liberado mesmo em docs-only ---
echo "Test 7: blockWeb=false libera web"
SB_NOBLOCK=$(setup_sandbox "docs-only" "false")
out=$(echo '{"tool_name":"WebSearch","tool_input":{"query":"x"},"cwd":"'"$SB_NOBLOCK"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "blockWeb=false → web passa" "$out"
rm -rf "$SB_NOBLOCK"

# --- grounding ausente (config só com git:) → web liberado (opt-in) ---
echo "Test 8: grounding ausente → web liberado"
SB_NOGROUND=$(mktemp -d)
( cd "$SB_NOGROUND"; git init -q -b main; git config user.email t@t; git config user.name t
  mkdir -p .context
  printf 'git:\n  strategy: branch-flow\n  protectedBranches: [main]\n  branchProtection: true\n' > .context/.devflow.yaml
  git add -A; git commit -q -m init )
out=$(echo '{"tool_name":"WebSearch","tool_input":{"query":"x"},"cwd":"'"$SB_NOGROUND"'"}' | bash "$HOOK" 2>/dev/null || true)
assert_empty "grounding ausente → web passa" "$out"
rm -rf "$SB_NOGROUND"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ]
