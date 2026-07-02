#!/usr/bin/env bash
# tests/skills/test-adr-filter-paths.sh
# Disciplina (família path-drift DDC v2): o SKILL adr-filter deve resolver o
# diretório de ADRs pelo canônico engineering/adrs (via context-paths CLI), e
# NÃO virar no-op só porque o README legado .context/adrs/README.md falta.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/adr-filter/SKILL.md"

if ! grep -q "engineering/adrs" "$SKILL"; then
  echo "FALHA: adr-filter não cita o path canônico v2 (engineering/adrs)"; exit 1
fi
if ! grep -q "resolve-read adrs" "$SKILL"; then
  echo "FALHA: adr-filter não resolve ADRs via context-paths CLI (resolve-read adrs)"; exit 1
fi
# SI-1 / achado 16: proibido node -e interpolado
if grep -q "node -e" "$SKILL"; then
  echo "FALHA: adr-filter usa 'node -e' interpolado (viola SI-1/achado 16)"; exit 1
fi
echo "OK test-adr-filter-paths"
