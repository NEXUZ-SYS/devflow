#!/usr/bin/env bash
# tests/skills/test-context-sync-scaffold.sh
# Task F do plano config-release-scaffold: o /devflow update sincroniza o
# scaffold de release FORA do provenance-sync.applySync.
#
# As garantias de comportamento são provadas em CÓDIGO
# (tests/lib/release-scaffold-sync.test.mjs: F.1 recusa fora de .context/,
# F.2 auto-overwrite sem gate). Aqui só travamos o WIRING da skill.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/context-sync/SKILL.md"

fails=0
fail() { echo "FALHA [$1]: $2"; fails=$((fails + 1)); }

[ -f "$SKILL" ] || { echo "FALHA: $SKILL ausente"; exit 1; }

# Recorta a seção do scaffold (até a próxima seção `### ` ou `## `).
SEC=$(awk '/^### Sync do scaffold de release/{f=1;next} /^#{2,3} /{if(f)exit} f' "$SKILL")
[ -n "$SEC" ] || { echo "FALHA: seção 'Sync do scaffold de release' ausente do context-sync"; exit 1; }
has() { printf '%s' "$SEC" | grep -qiE "$1"; }

# invoca a CLI própria, não o provenance-sync
# (o markdown real tem aspas/backticks entre o .mjs e o subcomando)
has 'release-scaffold\.mjs.{0,3} sync' || fail wiring "não invoca 'release-scaffold.mjs sync'"
if printf '%s' "$SEC" | grep -qE 'provenance-sync\.mjs apply'; then
  fail wiring "roteia o scaffold pelo 'provenance-sync.mjs apply' (que recusaria os dests)"
fi
has 'fora do|não passam pelo' || fail wiring "não deixa explícito que roda fora do provenance-sync"

# reporta os 4 buckets do contrato
for bucket in updated preserved skipped needsConfirm; do
  has "$bucket" || fail contrato "não reporta o bucket '$bucket'"
done

# não recria ausentes
has 'não recrie|nunca recria|opt-in' || fail skipped "não diz que artefato ausente NÃO é recriado"

# classe-CI só atualiza após confirmação, com diff
has 'confirm' || fail confirm "não exige confirmação para atualizar"
has 'diff' || fail confirm "não mostra o diff antes de confirmar"
has 'nada é escrito|não escreve' || fail confirm "não afirma que sem confirmação nada é escrito"

# D7b + N6a continuam valendo no update
has 'mustWriteViaTool' || fail d7b "não consome mustWriteViaTool no update"
has 'ferramenta .{0,4}Write' || fail d7b "não grava .github/** pela ferramenta Write"
has 'verify' || fail n6a "não roda verify após gravar o workflow"

# contenção reportada
has 'refused|contenção' || fail contencao "não reporta refused/contenção"

if [ "$fails" -ne 0 ]; then
  echo "test-context-sync-scaffold: $fails falha(s)"
  exit 1
fi
echo "OK test-context-sync-scaffold"
