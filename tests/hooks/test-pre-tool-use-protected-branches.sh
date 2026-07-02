#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-protected-branches.sh
# L1-gap-3: confirma que TODAS as entradas de protectedBranches são enforçadas —
# não só a primeira (main). Edita em `develop` (2ª da lista, com o branch REAL
# em checkout) → deny; edita em branch não-listada → allow.
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/pre-tool-use"

run_hook() {
  local cwd="$1" file="$2" input
  input=$(printf '{"tool_name":"Write","cwd":"%s","tool_input":{"file_path":"%s"}}' "$cwd" "$file")
  ( cd "$cwd" && printf '%s' "$input" | "$HOOK" ) 2>&1 || true
}

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.context"
cat > "$tmp/.context/.devflow.yaml" <<'YAML'
git:
  strategy: branch-flow
  protectedBranches: [main, develop]
  branchProtection: true
YAML
(
  cd "$tmp"
  git init -q; git config user.email t@t; git config user.name t
  git commit -q --allow-empty -m init; git branch -M main
  git checkout -q -b develop
)

# Em develop (2ª protegida): editar source → deny
out=$(run_hook "$tmp" "src/app.ts")
echo "$out" | grep -q '"permissionDecision": "deny"' || {
  echo "FALHA: edição em 'develop' (2ª protegida) não foi negada"; echo "$out"; exit 1; }

# Em branch de trabalho não-listada → allow
( cd "$tmp" && git checkout -q -b release/1.0 )
out=$(run_hook "$tmp" "src/app.ts")
if echo "$out" | grep -q '"permissionDecision": "deny"'; then
  echo "FALHA: edição em branch não-protegida (release/1.0) foi negada"; echo "$out"; exit 1; fi

echo "OK test-pre-tool-use-protected-branches"
