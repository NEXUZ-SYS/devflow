#!/usr/bin/env bash
# tests/skills/test-frontend-design.sh
# Grupo B / B1: a skill frontend-design deve ter (1) name correto, (2) fronteira de
# trigger explícita (invocação/delegação — NÃO catch-all de UI, para não competir com
# o agente frontend-specialist), (3) grounding obrigatório no knowledge de negócio,
# (4) roteamento dos 23 modos, (5) atribuição Apache-2.0 ao impeccable.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/frontend-design/SKILL.md"

if [ ! -f "$SKILL" ]; then
  echo "FALHA: skills/frontend-design/SKILL.md não existe"; exit 1
fi

# (1) name
if ! grep -qE "^name:[[:space:]]*frontend-design[[:space:]]*$" "$SKILL"; then
  echo "FALHA: frontmatter sem 'name: frontend-design'"; exit 1
fi

# (2) fronteira de trigger — cita invocação/delegação e o comando
if ! grep -qiE "/devflow:design|invocad|delega" "$SKILL"; then
  echo "FALHA: description/skill sem fronteira de trigger (invocação/delegação /devflow:design)"; exit 1
fi
# (2b) NÃO catch-all: deve dizer explicitamente que não intercepta prompts genéricos de UI
if ! grep -qiE "n[ãa]o intercepta|n[ãa]o.*catch-all|prompts gen[ée]ricos|frontend-specialist" "$SKILL"; then
  echo "FALHA: skill não delimita que NÃO intercepta prompts genéricos de UI"; exit 1
fi

# (3) grounding no knowledge
if ! grep -qE "@\.context/product/product-design-system\.md" "$SKILL"; then
  echo "FALHA: skill não faz grounding em @.context/product/product-design-system.md"; exit 1
fi
if ! grep -qiE "tone-of-voice" "$SKILL"; then
  echo "FALHA: skill não referencia tone-of-voice no grounding"; exit 1
fi
if ! grep -qiE "business-icp|icp" "$SKILL"; then
  echo "FALHA: skill não referencia o ICP no grounding"; exit 1
fi

# (4) 23 modos / roteamento
if ! grep -qiE "craft|critique|polish|colorize|animate" "$SKILL"; then
  echo "FALHA: skill não roteia os modos (craft/critique/polish/...)"; exit 1
fi

# (5) atribuição Apache-2.0 ao impeccable
if ! grep -qiE "impeccable" "$SKILL"; then
  echo "FALHA: skill sem atribuição ao impeccable (Apache-2.0)"; exit 1
fi

echo "OK test-frontend-design"
