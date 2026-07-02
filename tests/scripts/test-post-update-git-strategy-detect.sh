#!/usr/bin/env bash
# tests/scripts/test-post-update-git-strategy-detect.sh
# UPD-1: a detecção de git strategy no post-update-guide deve casar o schema
# aninhado git.strategy (indentado sob git:), não o inexistente gitStrategy:.
# Extrai a linha de detecção do guide e a roda contra fixtures reais.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUIDE="$ROOT/references/post-update-guide.md"

if grep -q 'gitStrategy:' "$GUIDE"; then
  echo "FALHA: guide ainda usa 'gitStrategy:' (chave inexistente no schema)"; exit 1
fi

DETECT=$(grep -E 'grep .*\.devflow\.yaml' "$GUIDE" | grep -iE 'strateg' | head -1)
[ -n "$DETECT" ] || { echo "FALHA: não achei a linha de detecção de git strategy no guide"; exit 1; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.context"

# positivo: schema real (git.strategy aninhado) → detecta
printf 'git:\n  strategy: branch-flow\n  protectedBranches: [main]\n' > "$tmp/.context/.devflow.yaml"
if ( cd "$tmp" && eval "$DETECT" ); then :; else
  echo "FALHA: detecção não casou o git.strategy aninhado (schema real)"; exit 1
fi

# negativo: sem strategy → não detecta
printf 'mempalace:\n  budget: 1000\n' > "$tmp/.context/.devflow.yaml"
if ( cd "$tmp" && eval "$DETECT" ); then
  echo "FALHA: detecção casou indevidamente um arquivo sem strategy"; exit 1
fi

echo "OK test-post-update-git-strategy-detect"
