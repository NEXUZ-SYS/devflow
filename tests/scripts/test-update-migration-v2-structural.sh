#!/usr/bin/env bash
# tests/scripts/test-update-migration-v2-structural.sh
# UPD-2: o Step 7 (detecção de drift v1→v2) NÃO deve sugerir migração quando o
# .context/ já é v2 estrutural (presença de .context/engineering/), mesmo sem o
# marcador .layout-version.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CMD="$ROOT/commands/devflow.md"

block=$(awk '/Step 7 — Structural drift detection/{f=1} f{print} /This command runs shell commands directly/{if(f)exit}' "$CMD")
[ -n "$block" ] || { echo "FALHA: não localizei o bloco do Step 7"; exit 1; }

printf '%s' "$block" | grep -q '\.context/engineering' || {
  echo "FALHA: Step 7 não considera o v2 estrutural (.context/engineering/) como sinal de já-migrado"; exit 1; }
printf '%s' "$block" | grep -q '\.layout-version' || {
  echo "FALHA: Step 7 deixou de considerar o marcador .layout-version"; exit 1; }
# deve haver uma variável/condição estrutural (não só o marcador)
printf '%s' "$block" | grep -qiE "STRUCTURAL_V2|estrutural|structurally v2" || {
  echo "FALHA: Step 7 não introduz a condição de v2 estrutural"; exit 1; }
echo "OK test-update-migration-v2-structural"
