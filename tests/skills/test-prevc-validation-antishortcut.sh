#!/usr/bin/env bash
# tests/skills/test-prevc-validation-antishortcut.sh
# B8: a fase V deve proibir EXPLICITAMENTE satisfazer o gate removendo/skippando
# testes ou desativando o linter, e exigir verificação de que a contagem de
# testes não regrediu vs a base (git diff/HEAD).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/prevc-validation/SKILL.md"

if ! grep -qi "PROIBIDO" "$SKILL"; then
  echo "FALHA: falta proibição explícita (PROIBIDO) de atalho no gate da fase V"; exit 1
fi
if ! grep -qiE "remov[ea]|apagar|skip.*test|desativ.*linter|enfraquec" "$SKILL"; then
  echo "FALHA: não proíbe remover/skippar testes ou desativar o linter"; exit 1
fi
if ! grep -qiE "contagem de testes|n[úu]mero de testes|não pode cair|test count|não pode regredir" "$SKILL"; then
  echo "FALHA: não exige verificar que a contagem de testes não caiu vs a base"; exit 1
fi
if ! grep -qiE "git diff|no-op|assert" "$SKILL"; then
  echo "FALHA: não referencia verificação mecânica (git diff / asserts não viram no-op)"; exit 1
fi
echo "OK test-prevc-validation-antishortcut"
