#!/usr/bin/env bash
# tests/skills/test-command-design.sh
# Grupo B / B3: o comando /devflow:design (commands/design.md) deve rotear para a skill
# devflow:frontend-design, reconhecer os subcomandos init e live, e listar os modos.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CMD="$ROOT/commands/design.md"

if [ ! -f "$CMD" ]; then
  echo "FALHA: commands/design.md não existe (→ /devflow:design)"; exit 1
fi
if ! grep -qiE "devflow:frontend-design|frontend-design" "$CMD"; then
  echo "FALHA: comando não roteia para a skill frontend-design"; exit 1
fi
if ! grep -qiE "\binit\b" "$CMD"; then
  echo "FALHA: comando não reconhece o subcomando init"; exit 1
fi
if ! grep -qiE "\blive\b" "$CMD"; then
  echo "FALHA: comando não reconhece o subcomando live"; exit 1
fi
if ! grep -qiE "craft|critique|polish" "$CMD"; then
  echo "FALHA: comando não lista os modos de design"; exit 1
fi
echo "OK test-command-design"
