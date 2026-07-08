#!/usr/bin/env bash
# tests/skills/test-confirmation-autofinish.sh
# Fix: prevc-confirmation deve honrar git.autoFinish:true — auto-executar a finalização
# (incl. sincronizar base defasada via rebase) sem menu; pausar só por risco irreversível
# específico; e nunca rotular "concluído" antes do merge.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/prevc-confirmation/SKILL.md"

# (1) autoFinish:true sincroniza base defasada automaticamente (fetch + rebase sobre origin/main)
if ! grep -qiE "fetch" "$SKILL" || ! grep -qiE "rebase.*origin/main|rebase sobre .*origin/main" "$SKILL"; then
  echo "FALHA(1): autoFinish não especifica sincronizar base defasada (fetch + rebase sobre origin/main)"; exit 1
fi
if ! grep -qiE "base defasada|atr[áa]s de origin/main|behind origin" "$SKILL"; then
  echo "FALHA(1b): não menciona o caso de base defasada"; exit 1
fi

# (2) única exceção de pausa = risco irreversível específico; proíbe menu genérico no modo autoFinish
if ! grep -qiE "risco irrevers|irrevers[íi]vel" "$SKILL"; then
  echo "FALHA(2): não define a única exceção de pausa (risco irreversível)"; exit 1
fi
if ! grep -qiE "motivo espec[íi]fico" "$SKILL"; then
  echo "FALHA(2b): a exceção não exige motivo específico (vs menu genérico)"; exit 1
fi

# (3) mergeStrategy: quando a config não define, respeitar convenção do repo (não assumir --squash cego)
if ! grep -qiE "conven[çc][ãa]o do repo" "$SKILL"; then
  echo "FALHA(3): não detecta mergeStrategy pela convenção do repo quando a config não define"; exit 1
fi

# (4) Step 0 cobre commits fora-de-escopo na branch (não só working-tree)
if ! grep -qiE "fora-de-escopo|fora de escopo" "$SKILL"; then
  echo "FALHA(4): Step 0 não cobre commits fora-de-escopo na branch"; exit 1
fi
if ! grep -qiE "origin/main\.\.HEAD|merge-base.*HEAD" "$SKILL"; then
  echo "FALHA(4b): não inspeciona commits da branch (origin/main..HEAD)"; exit 1
fi

# (5) anti-pattern: nunca rotular "concluído" antes do merge
if ! grep -qiE "conclu[íi]do.*(antes|somente|só|apenas).*(do )?merge|antes do merge.*conclu" "$SKILL"; then
  echo "FALHA(5): falta o anti-pattern 'concluído só após o merge'"; exit 1
fi

echo "OK test-confirmation-autofinish"
