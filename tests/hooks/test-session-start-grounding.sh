#!/usr/bin/env bash
# E2E test — session-start injects <GROUNDING_MODE> directive when doc-grounding
# is active in .context/.devflow.yaml, and omits it when off/absent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOK="${PROJECT_ROOT}/hooks/session-start"
PASS=0
FAIL=0

assert_contains() {
  local desc="$1" output="$2" expected="$3"
  if printf '%s' "$output" | grep -q "$expected"; then
    printf '  PASS: %s\n' "$desc"; PASS=$((PASS + 1))
  else
    printf '  FAIL: %s — expected "%s"\n' "$desc" "$expected"; FAIL=$((FAIL + 1))
  fi
}
assert_not_contains() {
  local desc="$1" output="$2" unexpected="$3"
  if printf '%s' "$output" | grep -q "$unexpected"; then
    printf '  FAIL: %s — found unexpected "%s"\n' "$desc" "$unexpected"; FAIL=$((FAIL + 1))
  else
    printf '  PASS: %s\n' "$desc"; PASS=$((PASS + 1))
  fi
}

# Sandbox with a grounding: section. Arg: <mode> (or "none" = no grounding key)
make_sandbox() {
  local mode="$1" dir
  dir=$(mktemp -d)
  mkdir -p "$dir/.context"
  if [ "$mode" = "none" ]; then
    printf 'git:\n  strategy: branch-flow\n  protectedBranches: [main]\n' > "$dir/.context/.devflow.yaml"
  else
    cat > "$dir/.context/.devflow.yaml" <<YAML
git:
  strategy: branch-flow
  protectedBranches: [main]
grounding:
  mode: ${mode}
  docsMcpServer: docs-mcp-server
  failClosed: true
YAML
  fi
  printf '%s' "$dir"
}

run_hook() {
  local workdir="$1"
  ( cd "$workdir"; CLAUDE_PLUGIN_ROOT="$PROJECT_ROOT" bash "$HOOK" 2>/dev/null || true )
}

echo "=== Session-Start — Grounding Directive Tests ==="

echo "Test 1: mode=docs-only injeta <GROUNDING_MODE>"
SB=$(make_sandbox "docs-only")
out=$(run_hook "$SB")
assert_contains "bloco GROUNDING_MODE presente" "$out" "GROUNDING_MODE"
assert_contains "cita o server canônico" "$out" "docs-mcp-server"
assert_contains "declara fail-closed / não-de-memória" "$out" "mem.ria\|fail-closed\|n.o vou responder\|PARE"
rm -rf "$SB"

echo "Test 2: mode=docs-first também injeta"
SB=$(make_sandbox "docs-first")
out=$(run_hook "$SB")
assert_contains "GROUNDING_MODE presente em docs-first" "$out" "GROUNDING_MODE"
rm -rf "$SB"

echo "Test 3: mode=off NÃO injeta"
SB=$(make_sandbox "off")
out=$(run_hook "$SB")
assert_not_contains "sem GROUNDING_MODE com off" "$out" "GROUNDING_MODE"
rm -rf "$SB"

echo "Test 4: grounding ausente NÃO injeta"
SB=$(make_sandbox "none")
out=$(run_hook "$SB")
assert_not_contains "sem GROUNDING_MODE sem a seção" "$out" "GROUNDING_MODE"
rm -rf "$SB"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ]
