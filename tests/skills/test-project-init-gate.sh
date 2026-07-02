#!/usr/bin/env bash
# tests/skills/test-project-init-gate.sh
# Disciplina (GAP-INIT-1): o HARD-GATE green-field do project-init deve
# reconhecer projeto DDC v2 populado (engineering/business/product/operations),
# não só .context/docs/ — senão re-inicializa projeto que já tem contexto.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/project-init/SKILL.md"

# Extrai o PRIMEIRO bloco <HARD-GATE>...</HARD-GATE> (o gate green-field).
gate=$(awk '/<HARD-GATE>/{f=1} f{buf=buf $0 "\n"} /<\/HARD-GATE>/{if(f){printf "%s", buf; exit}}' "$SKILL")

for layer in engineering business product operations; do
  if ! printf '%s' "$gate" | grep -q "\.context/${layer}"; then
    echo "FALHA: HARD-GATE green-field não considera a camada DDC v2 .context/${layer}/"; exit 1
  fi
done
printf '%s' "$gate" | grep -q "context-sync" || { echo "FALHA: gate não delega a context-sync"; exit 1; }
echo "OK test-project-init-gate"
