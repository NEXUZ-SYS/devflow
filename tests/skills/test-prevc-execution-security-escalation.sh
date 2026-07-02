#!/usr/bin/env bash
# tests/skills/test-prevc-execution-security-escalation.sh
# B6(b): a skill de execução deve instruir ESCALAR decisões de segurança
# (injection, autorização, secrets, cripto) em vez de decidir silenciosamente.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/prevc-execution/SKILL.md"

grep -qiE "decis(ã|a)o de segurança|padr(ã|a)o de segurança|security-sensitive" "$SKILL" || { echo "FALHA: falta guardrail de decisão de segurança"; exit 1; }
grep -qi "escal" "$SKILL" || { echo "FALHA: não instrui escalar a decisão de segurança"; exit 1; }
grep -qiE "injection|inje(ç|c)" "$SKILL" || { echo "FALHA: não cita injection"; exit 1; }
grep -qiE "authz|autoriza" "$SKILL" || { echo "FALHA: não cita autorização/authz"; exit 1; }
grep -qiE "secret|cripto|crypto" "$SKILL" || { echo "FALHA: não cita secrets/cripto"; exit 1; }
echo "OK test-prevc-execution-security-escalation"
