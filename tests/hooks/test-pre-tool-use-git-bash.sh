#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-git-bash.sh
# ADV-6: pre-tool-use nega git push / gh pr merge / git commit direto numa branch
# protegida (via git-op-guard); libera em branch de trabalho e comandos inócuos.
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/pre-tool-use"

run_bash_hook() {
  local cwd="$1" cmd="$2" input
  input=$(printf '{"tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"}}' "$cwd" "$cmd")
  ( cd "$cwd" && printf '%s' "$input" | "$HOOK" ) 2>&1 || true
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.context"
cat > "$tmp/.context/.devflow.yaml" <<'YAML'
git:
  strategy: branch-flow
  protectedBranches: [main, develop]
  branchProtection: true
YAML
(
  cd "$tmp"
  git init -q
  git config user.email t@t; git config user.name t
  git commit -q --allow-empty -m init
  git branch -M main
)

# Na main (protegida): git push → deny
out=$(run_bash_hook "$tmp" "git push origin main")
echo "$out" | grep -q '"permissionDecision": "deny"' || { echo "FALHA: git push em main não foi negado"; echo "$out"; exit 1; }

# Na main: gh pr merge → deny
out=$(run_bash_hook "$tmp" "gh pr merge --auto")
echo "$out" | grep -q '"permissionDecision": "deny"' || { echo "FALHA: gh pr merge em main não foi negado"; echo "$out"; exit 1; }

# Comando inócuo na main → não deny
out=$(run_bash_hook "$tmp" "git status")
if echo "$out" | grep -q '"permissionDecision": "deny"'; then echo "FALHA: git status em main negado indevidamente"; echo "$out"; exit 1; fi

# Branch de trabalho: git push → não deve negar
( cd "$tmp" && git checkout -q -b feature/x )
out=$(run_bash_hook "$tmp" "git push origin feature/x")
if echo "$out" | grep -q '"permissionDecision": "deny"'; then echo "FALHA: git push em feature branch negado indevidamente"; echo "$out"; exit 1; fi

echo "OK test-pre-tool-use-git-bash"
