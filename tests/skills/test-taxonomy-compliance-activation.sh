#!/usr/bin/env bash
# tests/skills/test-taxonomy-compliance-activation.sh
# F-build-3: o scaffold de business-compliance NÃO deve forçar activation: always
# — deve permitir on-demand (consistente com os demais docs de negócio opcionais,
# como business-model/business-metrics), evitando injeção eager compulsória.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAX="$ROOT/skills/knowledge/references/taxonomy-of-knowledge.yaml"

act=$(awk '/id: business-compliance/{f=1} f&&/activation:/{print $2; exit}' "$TAX")
[ "$act" = "on-demand" ] || {
  echo "FALHA: business-compliance activation='$act' (esperado 'on-demand' — F-build-3)"; exit 1; }
echo "OK test-taxonomy-compliance-activation"
