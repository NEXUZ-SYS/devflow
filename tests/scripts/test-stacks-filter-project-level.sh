#!/usr/bin/env bash
# tests/scripts/test-stacks-filter-project-level.sh
# STK-P3 (decisão A = doc): a seleção de stacks é project-level por design
# (detectada pelas deps do projeto), NÃO uma filtragem semântica por task como
# knowledge-filter/adr-filter. Isso deve estar documentado no lib e na skill,
# para não prometer "filtragem por task".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/scripts/lib/stacks-filter.mjs"
SKILL="$ROOT/skills/stack-filter/SKILL.md"

grep -qiE "n[íi]vel de projeto|project-level" "$LIB" || {
  echo "FALHA: stacks-filter.mjs não documenta o design 'nível de projeto'"; exit 1; }
grep -qiE "n[íi]vel de projeto|project-level" "$SKILL" || {
  echo "FALHA: stack-filter SKILL não esclarece que a seleção é 'nível de projeto' (não por task semântica)"; exit 1; }
echo "OK test-stacks-filter-project-level"
