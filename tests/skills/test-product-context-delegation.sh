#!/usr/bin/env bash
# tests/skills/test-product-context-delegation.sh
# Grupo B / C1: o agente product-context deve nomear a skill devflow:frontend-design
# como a "skill de design-system do projeto" à qual delega os detalhes de implementação.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AGENT="$ROOT/agents/product-context.md"

if ! grep -qiE "frontend-design" "$AGENT"; then
  echo "FALHA: product-context não delega para a skill frontend-design"; exit 1
fi
# a delegação deve preservar o princípio "design-system como princípios, não dump"
if ! grep -qiE "princ[íi]pios, n[ãa]o dump" "$AGENT"; then
  echo "FALHA: o princípio 'design-system como princípios, não dump' foi perdido"; exit 1
fi
echo "OK test-product-context-delegation"
