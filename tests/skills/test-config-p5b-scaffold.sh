#!/usr/bin/env bash
# tests/skills/test-config-p5b-scaffold.sh
# Task E do plano config-release-scaffold: a P5b da skill `config` avisa quando
# `versioning: pipeline` é escolhido sem CI e oferece o scaffold verbatim.
#
# NOTA DE HONESTIDADE: estes são grep-asserts sobre PROSA. Eles provam que a
# skill INSTRUI o agente corretamente; não provam enforcement. O enforcement
# mecânico vive no código e é testado em tests/lib/release-scaffold*.test.mjs:
#   (i) proibido em autônomo   -> C.9b (release-scaffold.mjs)
#   (k) .github/** via Write   -> C.9c
#   (h) nunca sobrescrever     -> C.12
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/config/SKILL.md"

fails=0
fail() { echo "FALHA [$1]: $2"; fails=$((fails + 1)); }
need() { # need <id> <regex> <mensagem>
  grep -qiE "$2" "$SKILL" || fail "$1" "$3"
}

[ -f "$SKILL" ] || { echo "FALHA: $SKILL ausente"; exit 1; }

# Recorta a região da P5b para asserções de escopo (da P5b até a P6).
P5B=$(awk '/\*\*P5b:/{f=1} /\*\*P6:/{f=0} f' "$SKILL")
[ -n "$P5B" ] || { echo "FALHA: não encontrei a seção P5b"; exit 1; }
p5b_has() { printf '%s' "$P5B" | grep -qiE "$1"; }

# (a) pipeline rotulado RECOMENDADO
p5b_has 'pipeline.*\(recomendado\)|recomendado.*pipeline' \
  || fail a "a opção 'Pipeline de release' não está rotulada como RECOMENDADO"

# (b) `local` descrito como solo/simples E com os riscos explícitos
p5b_has 'solo|projeto simples' || fail b "a opção 'local' não é enquadrada como solo/projeto simples"
for risco in 'conflito|bump na branch' 'tag' 'changelog'; do
  p5b_has "$risco" || fail b "a opção 'local' não expõe o risco: $risco"
done

# (c) detecção de pipeline de release já existente
p5b_has 'HAS_RELEASE_CI|\.github/workflows' || fail c "não detecta pipeline de release existente"

# (d) AVISA (não recusa) quando pipeline é escolhido sem CI
#
# Só asserções POSITIVAS aqui. Um grep negativo sobre prosa é auto-derrotante:
# a frase que PROÍBE o comportamento contém o próprio comportamento
# ("Nunca recuse a escolha" casa com /recuse a escolha/).
p5b_has 'aviso|avise|avisa' || fail d "não avisa quando pipeline é escolhido sem CI"
p5b_has 'no-op|silencios' || fail d "não explica que o bump vira no-op silencioso sem CI"
p5b_has 'nunca recuse a escolha|não recuse a escolha' \
  || fail d "a skill não instrui explicitamente a NÃO recusar a escolha de pipeline"

# (e) a oferta do scaffold é condicionada a git + GitHub
p5b_has 'checkGate|git.*github|github.*remote' || fail e "a oferta não é condicionada a git+remote GitHub"

# (f) confirmação estruturada: enumera os 3 arquivos + aviso de permissões da CI
for arquivo in '\.github/workflows/release\.yml' 'scripts/bump-version\.sh' 'scripts/lib/changelog-cut\.mjs'; do
  p5b_has "$arquivo" || fail f "a confirmação não enumera o arquivo: $arquivo"
done
p5b_has 'contents *: *write' || fail f "a confirmação não avisa sobre contents:write"
p5b_has 'pull-requests *: *write' || fail f "a confirmação não avisa sobre pull-requests:write"
p5b_has 'sua ci|na CI do usuário|roda na' || fail f "a confirmação não deixa claro que o workflow roda na CI do usuário"

# (g) mostrar o conteúdo e rodar --dry-run antes da 1ª escrita
p5b_has 'dry-?run' || fail g "não roda dry-run antes da primeira escrita"
p5b_has 'mostr|exib|conteúdo' || fail g "não mostra o conteúdo antes de escrever"

# (h) nunca sobrescrever
p5b_has 'nunca sobrescrev|não sobrescrev|preserv' || fail h "não afirma 'nunca sobrescrever' arquivo existente"

# (i) proibido em modo autônomo (a skill afirma; o enforcement é C.9b)
p5b_has 'autônom|autonomous' || fail i "não proíbe o scaffold em modo autônomo"

# (j) branch protegida → work branch
p5b_has 'branch protegida' || fail j "não trata branch protegida"
p5b_has 'work branch|branch de trabalho|feature/' || fail j "não manda criar work branch em branch protegida"

# (k) [D7b] a skill grava .github/workflows/** pela ferramenta Write
p5b_has 'mustWriteViaTool' || fail k "a skill não consome mustWriteViaTool"
p5b_has 'ferramenta .?Write|tool .?Write' || fail k "a skill não diz que grava o workflow pela ferramenta Write"
p5b_has 'verifyWritten' || fail k "a skill não chama verifyWritten após gravar o workflow (N6a)"
if p5b_has 'applier escreve o workflow|node:fs.*\.github'; then
  fail k "a skill deixa o applier escrever .github/** por node:fs"
fi

# (l) [N4] a confirmação avisa que o v1 não tem changelog-guard
p5b_has 'changelog-guard' || fail l "a confirmação não avisa que o pipeline v1 não tem changelog-guard"

# Higiene: a skill não pode instruir escrita de .github/** por Bash (vetor residual)
if p5b_has 'cat > \.github|printf.*> *\.github|cp .*\.github/workflows'; then
  fail higiene "a skill instrui escrever .github/** por Bash, contornando o gate de permissões"
fi

# SI-1: a skill invoca a CLI do release-scaffold, nunca `node -e`.
p5b_has 'node scripts/lib/release-scaffold\.mjs (gate|plan|apply|verify)' \
  || fail si1 "a P5b não invoca a CLI do release-scaffold.mjs"
if printf '%s' "$P5B" | grep -q 'node -e'; then
  fail si1 "a P5b usa 'node -e' (viola SI-1/achado 16 — use a CLI .mjs)"
fi

if [ "$fails" -ne 0 ]; then
  echo "test-config-p5b-scaffold: $fails falha(s)"
  exit 1
fi
echo "OK test-config-p5b-scaffold"
