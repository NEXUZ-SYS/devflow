#!/usr/bin/env bash
# tests/scripts/test-stacks-eject-warns-no-plugin-root.sh
# F-build-2: `eject` avisa (stderr) quando CLAUDE_PLUGIN_ROOT não está definido e
# cai no fallback de pluginRoot derivado do próprio script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# Sem CLAUDE_PLUGIN_ROOT; lib de formato válido mas inexistente → não copia nada,
# mas o aviso (emitido antes da busca) deve aparecer no stderr.
err=$(cd "$tmp" && env -u CLAUDE_PLUGIN_ROOT node "$ROOT/scripts/devflow-stacks.mjs" eject nonexistentlib --project="$tmp" 2>&1 1>/dev/null || true)

echo "$err" | grep -qiE "CLAUDE_PLUGIN_ROOT" || {
  echo "FALHA: eject não avisou sobre CLAUDE_PLUGIN_ROOT ausente"; echo "--- stderr ---"; echo "$err"; exit 1; }
echo "OK test-stacks-eject-warns-no-plugin-root"
