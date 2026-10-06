#!/usr/bin/env bash
# P0: knowledge casando + branch protegida → stdout é UM JSON com deny + additionalContext.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
git -C "$TMP" init -q -b main
git -C "$TMP" config user.email t@t; git -C "$TMP" config user.name t
mkdir -p "$TMP/.context/engineering" "$TMP/src"
printf 'git:\n  strategy: branch-flow\n  protectedBranches: [main]\n  branchProtection: true\n' > "$TMP/.context/.devflow.yaml"
cat > "$TMP/.context/engineering/architecture-overview.md" <<'EOF'
---
type: knowledge
layer: engineering
name: architecture-overview
description: como o sistema se organiza
activation: on-demand
owner: engineering-context
version: 1.0.0
---
Usamos arquitetura hexagonal com adapters na borda.
EOF
printf 'export const x = 1;\n' > "$TMP/src/foo.ts"
git -C "$TMP" add -A; git -C "$TMP" commit -qm init
for fp in "$TMP/src/foo.ts" "$(printf '%s/src/f\001oo.ts' "$TMP")"; do
  event=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Edit","tool_input":{"file_path":sys.argv[1]},"cwd":sys.argv[2]}))' "$fp" "$TMP")
  out=$(cd "$TMP" && printf '%s' "$event" | bash "$REPO_ROOT/hooks/pre-tool-use" 2>/dev/null)
  printf '%s' "$out" | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
d = json.loads(raw)["hookSpecificOutput"]
assert d["permissionDecision"] == "deny", d
assert "arquitetura hexagonal" in d.get("additionalContext", ""), "knowledge ausente do additionalContext"
'
done
echo "PASS: JSON único com deny + knowledge, inclusive com C0 no caminho"
