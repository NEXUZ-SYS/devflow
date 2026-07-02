#!/usr/bin/env bash
# tests/skills/test-git-strategy-selfprotect.sh
# B9: o skill git-strategy deve RECUSAR e ESCALAR ao operador qualquer pedido de
# alterar a própria configuração de proteção (git.strategy/protectedBranches/
# branchProtection), nunca aplicando autonomamente. Referencia a rede mecânica (2.3).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/git-strategy/SKILL.md"

grep -qi "proteção da própria config" "$SKILL" || { echo "FALHA: falta a seção 'Proteção da própria configuração'"; exit 1; }
grep -qi "recus" "$SKILL" || { echo "FALHA: não instrui RECUSAR a mutação da própria config"; exit 1; }
grep -qi "escal" "$SKILL" || { echo "FALHA: não instrui ESCALAR ao operador"; exit 1; }
grep -qiE "autonom" "$SKILL" || { echo "FALHA: não proíbe aplicar autonomamente"; exit 1; }
grep -qE "protectedBranches" "$SKILL" || { echo "FALHA: não cita protectedBranches"; exit 1; }
grep -qE "branchProtection" "$SKILL" || { echo "FALHA: não cita branchProtection"; exit 1; }
# referencia a rede mecânica do pre-tool-use (config-guard / ADV-8/B9)
grep -qiE "config-guard|pre-tool-use|ADV-8|B9" "$SKILL" || { echo "FALHA: não referencia a rede mecânica (config-guard/pre-tool-use)"; exit 1; }
echo "OK test-git-strategy-selfprotect"
