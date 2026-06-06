#!/usr/bin/env bash
# E2E DISCRIMINANTE da injeção de contexto via before_agent_start.
#
# Prova que o canário (uma linha única em .context/napkin.md, injetada pelo
# hook session-start através da extensão omp) só chega à conversa COM a extensão.
#
# DESCOBERTAS (omp v15.9.5 — investigação Task 7):
#  - A mensagem de before_agent_start é entregue como role:"custom" no transcript
#    (confirmado inspecionando --mode json: o customType "devflow-context" e o
#    bloco <NAPKIN_RUNBOOK> aparecem na sessão COM a extensão).
#  - PORÉM `--no-tools` é OBRIGATÓRIO no teste: sem ele, o omp é um agente com
#    ferramentas de filesystem e LÊ o napkin do disco sozinho, contaminando o
#    braço WITHOUT (teste deixaria de ser discriminante).
#  - ARMADILHA: `--no-extensions` NÃO mantém o `-e` explícito funcionando nesta
#    versão (contraria a doc). Ele SUPRIME a injeção da extensão `-e`. Por isso o
#    braço WITH NÃO usa `--no-extensions`; o braço WITHOUT usa (mata auto-discovery).
#  - O canário usa nanossegundos (date +%s%N): com +%s dois runs no mesmo segundo
#    colidem e o WITHOUT "encontra" o canário do run anterior (falso positivo).
#  - Asserção via --mode json (transcript estruturado), NÃO via texto do modelo:
#    o modelo trata conteúdo role:"custom" como suspeito e se recusa a ecoá-lo,
#    o que tornaria a asserção por resposta não-determinística.
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context/engineering/standards"
echo "git: { strategy: trunk-based }" > "$TMP/.context/.devflow.yaml"
# Canário único (nanossegundos) dentro do napkin — o session-start injeta como <NAPKIN_RUNBOOK>:
CANARY="OMPCANARY-$(date +%s%N)-z9q"
printf '%s\n' "$CANARY" > "$TMP/.context/napkin.md"

# COM a extensão: -e carrega a extensão; --no-tools impede o agente de ler o disco;
# --mode json expõe o transcript estruturado (onde a mensagem injetada aparece).
WITH=$(cd "$TMP" && omp -e "$REPO_ROOT/omp/extension.mjs" --no-tools --mode json -p "diga ok" 2>/dev/null || true)
# SEM a extensão: --no-extensions mata auto-discovery; sem -e; --no-tools; json.
WITHOUT=$(cd "$TMP" && omp --no-extensions --no-tools --mode json -p "diga ok" 2>/dev/null || true)

W_HITS=$(printf '%s' "$WITH" | grep -c "$CANARY" || true)
WO_HITS=$(printf '%s' "$WITHOUT" | grep -c "$CANARY" || true)
echo "WITH (canário no transcript): ${W_HITS}x"
echo "WITHOUT (canário no transcript): ${WO_HITS}x"

[ "$W_HITS" -ge 1 ] || { echo "FALHA: canário NÃO injetado COM a extensão (before_agent_start não entregou ao transcript)"; exit 1; }
[ "$WO_HITS" -eq 0 ] || { echo "FALHA: canário apareceu SEM a extensão (teste não-discriminante / vazamento)"; exit 1; }
echo "OK"
