#!/usr/bin/env bash
# tests/skills/test-frontend-design-refs.sh
# Grupo B / B2: as 23 referências de modo da skill frontend-design devem existir e seguir
# a convenção: (1) os 23 arquivos presentes, (2) cada um com `## Objetivo` e `## Passos`,
# (3) live.md documenta o hard-gate de feature branch e NÃO instala marcador de pre-tool-use
# (decisão da Revisão R: o gate vive na bridge), (4) init.md descreve o bootstrap via
# detect-frontend e a gravação de design.register no .devflow.yaml.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REF="$ROOT/skills/frontend-design/references"

MODES="craft shape init document extract critique audit polish bolder quieter distill harden onboard animate colorize typeset layout delight overdrive clarify optimize adapt live"

# (1) os 23 arquivos existem
for m in $MODES; do
  if [ ! -f "$REF/$m.md" ]; then
    echo "FALHA: falta references/$m.md"; exit 1
  fi
done

# (2) cada ref tem ## Objetivo e ## Passos
for m in $MODES; do
  if ! grep -qE "^## Objetivo" "$REF/$m.md"; then
    echo "FALHA: $m.md sem seção '## Objetivo'"; exit 1
  fi
  if ! grep -qE "^## Passos" "$REF/$m.md"; then
    echo "FALHA: $m.md sem seção '## Passos'"; exit 1
  fi
  if ! grep -qE "^## Quando usar" "$REF/$m.md"; then
    echo "FALHA: $m.md sem seção '## Quando usar'"; exit 1
  fi
done

# (3) live.md — hard-gate de feature branch, e SEM marcador de pre-tool-use
if ! grep -qiE "hard-gate" "$REF/live.md"; then
  echo "FALHA: live.md não menciona o hard-gate"; exit 1
fi
if ! grep -qiE "feature branch|branch de feature|branch protegida" "$REF/live.md"; then
  echo "FALHA: live.md não menciona o gate de feature branch"; exit 1
fi
if grep -qiE "pre-tool-use" "$REF/live.md"; then
  echo "FALHA: live.md menciona marcador de pre-tool-use (Revisão R: gate vive na bridge)"; exit 1
fi
# live é execução de terceiros via bridge, consent-gated
if ! grep -qiE "live-bridge\.mjs" "$REF/live.md"; then
  echo "FALHA: live.md não referencia a bridge scripts/design/live-bridge.mjs"; exit 1
fi

# (4) init.md — detect-frontend + design.register
if ! grep -qiE "detect-frontend" "$REF/init.md"; then
  echo "FALHA: init.md não menciona detect-frontend"; exit 1
fi
if ! grep -qE "design\.register" "$REF/init.md"; then
  echo "FALHA: init.md não menciona design.register no .devflow.yaml"; exit 1
fi

# (5) refs de avaliação/refino carregam a seção de Regras guidance (17 regras guidance)
for m in critique audit colorize typeset layout polish; do
  if ! grep -qE "^## Regras guidance" "$REF/$m.md"; then
    echo "FALHA: $m.md sem seção '## Regras guidance'"; exit 1
  fi
done

echo "OK test-frontend-design-refs"
