#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
export HOME="$TMP/home"; mkdir -p "$HOME/.omp/agent"
cat > "$HOME/.omp/agent/mcp.json" <<'JSON'
{ "mcpServers": { "dotcontext": { "command": "npx" }, "mempalace": { "command": "mempalace-mcp" } } }
JSON
mkdir -p "$TMP/proj"
OUT=$(cd "$TMP/proj" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$REPO_ROOT/hooks/session-start" startup 2>/dev/null || true)
# Assert on the detection-derived signals (mode-context lines), not on static
# skill text that always contains the words "mempalace"/"full".
echo "$OUT" | grep -qi "mempalace: true" || { echo "FALHA: mempalace não detectado via config omp"; exit 1; }
echo "$OUT" | grep -qi "DevFlow Mode: full" || { echo "FALHA: modo Full não detectado via dotcontext omp-global"; exit 1; }
echo "OK"
