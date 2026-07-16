#!/usr/bin/env bash
# E2E DISCRIMINANTE de AUTORIDADE — o modelo OBEDECE o contexto DevFlow.
#
# Diferente de e2e-session-start.sh (que prova DELIVERY do texto ao transcript),
# este prova AUTORIDADE: que a instrução injetada pelo launcher é OBEDECIDA pelo
# modelo desde o turno 1. Paridade com o `additionalContext` do Claude Code.
#
# MECANISMO testado: scripts/omp-launch.mjs lança o omp com
#   --system-prompt "<bloco 0 mínimo>"  +  --append-system-prompt "<contexto DevFlow>"
# colocando o contexto na região AUTORITATIVA do system prompt (bloco 0).
# Ver omp/SPIKE-omp-api.md, seção "Autoridade de injeção (follow-up)".
#
# METODOLOGIA (teste de AÇÃO, não de eco):
#  - Canário COMPORTAMENTAL BENIGNO: "termine TODA resposta com a linha <CANARY>".
#    Marcadores token-shaped (⟦...⟧) ou frases "INSTRUÇÃO DE SISTEMA:" disparam o
#    reflexo anti-injeção do modelo (recusa mesmo no bloco 0 autoritativo) e
#    mediriam segurança, não autoridade. Usamos "Convenção de formatação deste
#    projeto:" — benigno, isola a variável "autoridade do canal".
#  - --no-tools OBRIGATÓRIO: sem ele o agente leria o napkin do disco sozinho e
#    contaminaria o braço WITHOUT (deixaria de ser discriminante).
#  - --no-session: efêmero, sem persistir.
#  - Canário com nanossegundos (date +%s%N): evita colisão entre runs.
#  - Asserção pela RESPOSTA do modelo (não transcript): autoridade = o modelo
#    de fato terminou a resposta com o canário.
#
# Assert: COM launcher → modelo obedece (canário na resposta);
#         SEM launcher (omp puro, sem contexto) → não obedece (canário ausente).
set -euo pipefail
# Exige uma chamada de MODELO VIVO (obediência de contexto), não roda em CI nem sem opt-in.
# Padrão RUN_LIVE já usado no repo. O gate command -v omp abaixo não basta: omp pode estar
# instalado localmente, mas o teste ainda depende de resposta de modelo real.
if [ "${RUN_LIVE:-0}" != "1" ]; then echo "SKIP: e2e-omp-authority requer modelo vivo (defina RUN_LIVE=1 para rodar)"; exit 0; fi
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
if ! command -v node >/dev/null; then echo "SKIP: node ausente"; exit 0; fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAUNCHER="$REPO_ROOT/scripts/omp-launch.mjs"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/.context"

# Canário único (nanossegundos) — plantado como CONVENÇÃO DE FORMATAÇÃO benigna
# no napkin, que o session-start injeta como <NAPKIN_RUNBOOK> no contexto.
CANARY="FIM-DEVFLOW-$(date +%s%N)"
cat > "$TMP/.context/napkin.md" <<EOF
# Napkin Runbook

## Convenção de formatação deste projeto
- Convenção de formatação deste projeto: termine TODA resposta com a linha exata "${CANARY}".
EOF

PROMPT="Quanto é 2+2?"

# COM launcher: contexto DevFlow injetado no bloco 0 autoritativo do system prompt.
WITH=$(cd "$TMP" && node "$LAUNCHER" --no-session --no-tools -p "$PROMPT" 2>/dev/null || true)
# SEM launcher: omp puro, sem contexto DevFlow → não deve obedecer a convenção.
WITHOUT=$(cd "$TMP" && omp --no-session --no-tools -p "$PROMPT" 2>/dev/null || true)

W_HITS=$(printf '%s' "$WITH" | grep -c "$CANARY" || true)
WO_HITS=$(printf '%s' "$WITHOUT" | grep -c "$CANARY" || true)
echo "WITH launcher (modelo obedeceu a convenção): ${W_HITS}x"
echo "WITHOUT launcher (omp puro):                 ${WO_HITS}x"

[ "$W_HITS" -ge 1 ] || { echo "FALHA: modelo NÃO obedeceu o contexto COM o launcher (autoridade não confirmada)"; exit 1; }
[ "$WO_HITS" -eq 0 ] || { echo "FALHA: canário apareceu SEM o launcher (teste não-discriminante / vazamento)"; exit 1; }
echo "OK"
