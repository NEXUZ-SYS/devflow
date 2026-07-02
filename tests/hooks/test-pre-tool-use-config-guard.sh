#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-config-guard.sh
# ADV-8/B9 (integração): editar .devflow.yaml para enfraquecer git.* numa branch
# protegida → deny; mudança não-sensível → allow; em branch de trabalho → allow.
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/pre-tool-use"

BASE='git:
  strategy: branch-flow
  protectedBranches: [main, develop]
  branchProtection: true
'

run_write_hook() {
  local cwd="$1" content="$2" input
  input=$(python3 - "$cwd" "$content" <<'PY'
import json, sys
cwd, content = sys.argv[1], sys.argv[2]
print(json.dumps({"tool_name": "Write", "cwd": cwd,
  "tool_input": {"file_path": cwd + "/.context/.devflow.yaml", "content": content}}))
PY
)
  ( cd "$cwd" && printf '%s' "$input" | "$HOOK" ) 2>&1 || true
}

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.context"
printf '%s' "$BASE" > "$tmp/.context/.devflow.yaml"
( cd "$tmp"; git init -q; git config user.email t@t; git config user.name t; git add -A; git commit -q -m init; git branch -M main )

WEAK=$(printf '%s' "$BASE" | sed 's/branchProtection: true/branchProtection: false/')
OKCHANGE="${BASE}mempalace:
  budget: 2000
"

# main (protegida): enfraquecer branchProtection → deny
out=$(run_write_hook "$tmp" "$WEAK")
echo "$out" | grep -q '"permissionDecision": "deny"' || { echo "FALHA: enfraquecer branchProtection em main não foi negado"; echo "$out"; exit 1; }

# main: mudança não-sensível → não deny
out=$(run_write_hook "$tmp" "$OKCHANGE")
if echo "$out" | grep -q '"permissionDecision": "deny"'; then echo "FALHA: mudança não-sensível negada indevidamente"; echo "$out"; exit 1; fi

# feature branch: enfraquecer → não deny (branch não protegida)
( cd "$tmp" && git checkout -q -b feature/y )
out=$(run_write_hook "$tmp" "$WEAK")
if echo "$out" | grep -q '"permissionDecision": "deny"'; then echo "FALHA: enfraquecer em feature branch negado (não deveria)"; echo "$out"; exit 1; fi

echo "OK test-pre-tool-use-config-guard"
