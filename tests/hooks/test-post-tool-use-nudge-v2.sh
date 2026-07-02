#!/usr/bin/env bash
# tests/hooks/test-post-tool-use-nudge-v2.sh
# Camada 2 nudge (família path-drift DDC v2): um projeto com standards em
# .context/engineering/standards/ (sem .context/standards/ legado) deve
# produzir o nudge ao editar um arquivo coberto. O hook usa PWD como raiz do
# projeto, então exercitamos a fixture via `cd` (mesmo harness dos demais).
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/post-tool-use"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.context/engineering/standards"
cat > "$tmp/.context/engineering/standards/std-demo.md" <<'EOF'
---
id: std-demo
description: Demo standard para o teste do nudge v2
version: 1.0.0
applyTo:
  - "**/*.ts"
enforcement:
  linter: machine/std-demo.js
---
# Demo
Corpo.
EOF

event='{"tool_name":"Edit","tool_input":{"file_path":"src/foo.ts"},"cwd":"'"$tmp"'"}'
out=$( ( cd "$tmp" && printf '%s' "$event" | bash "$HOOK" ) 2>/dev/null || true )

echo "$out" | grep -q "std-demo" || {
  echo "FALHA: nudge não citou o std aplicável (std-demo) para projeto DDC v2"
  echo "--- saída ---"; echo "$out"; exit 1
}
echo "OK test-post-tool-use-nudge-v2"
