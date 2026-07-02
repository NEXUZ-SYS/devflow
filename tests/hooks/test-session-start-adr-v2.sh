#!/usr/bin/env bash
# tests/hooks/test-session-start-adr-v2.sh
# Achado-mãe (path-drift DDC v2): session-start deve injetar ADRs do path
# canônico v2 (.context/engineering/adrs), não só dos paths legados
# (.context/adrs, .context/docs/adrs). O hook usa PWD como project_root, então
# a fixture é exercida via `cd` (mesmo harness do teste dual-read existente).
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/session-start"

run_hook() { ( cd "$1" && echo '{}' | "$HOOK" ) 2>/dev/null || true; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.context/engineering/adrs"
cat > "$tmp/.context/engineering/adrs/001-money-cents.md" <<'EOF'
---
name: Dinheiro em centavos
status: Aprovado
stack: typescript
---
## Guardrails
- Nunca usar float para dinheiro. Sempre inteiros (centavos).
EOF

out=$(run_hook "$tmp")

echo "$out" | grep -q "ADR_GUARDRAILS" || { echo "FALHA: ADR_GUARDRAILS ausente para ADR em engineering/adrs"; exit 1; }
echo "$out" | grep -q "centavos" || { echo "FALHA: guardrail da ADR não injetado"; exit 1; }
echo "OK test-session-start-adr-v2"
