#!/usr/bin/env bash
# tests/skills/test-config-crosscheck.sh
# B5 (#4): o devflow:config deve fazer cross-check do par contraditório
# autoFinish.bump:true + versioning ∈ {pipeline,none} (double-bump/drift).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/config/SKILL.md"

# (1) menciona o conflito entre autoFinish.bump e versioning pipeline/none
if ! grep -qiE "autoFinish.*bump.*true.*versioning|bump.*true.*(pipeline|none)|par contradit" "$SKILL"; then
  echo "FALHA(1): config não faz cross-check do par autoFinish.bump:true × versioning pipeline/none"; exit 1
fi
# (2) instrui a recusar/avisar (não gerar em silêncio)
if ! grep -qiE "recusar|avisar|conflit|contradit" "$SKILL"; then
  echo "FALHA(2): config não recusa/avisa o par contraditório"; exit 1
fi
# (3) explica o porquê (double-bump/drift)
if ! grep -qiE "double.?bump|drift" "$SKILL"; then
  echo "FALHA(3): não explica o motivo (double-bump/drift)"; exit 1
fi
echo "OK test-config-crosscheck"
