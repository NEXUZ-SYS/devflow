#!/usr/bin/env bash
# tests/hooks/test-session-start-norms.sh — hook session-start-norms: JSON único ou nada,
# campo ≤ 10000 (o teto duro do Claude Code; o orçamento interno do módulo é ≤ 9000), e o
# índice (Camada 1) passa a mostrar o nível de cada std.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
TOTAL=0; FAILED=0
check() {
  TOTAL=$((TOTAL + 1))
  if "$@"; then
    echo -e "  ${GREEN}✓${NC} $DESC"
  else
    echo -e "  ${RED}✗${NC} $DESC"
    FAILED=$((FAILED + 1))
  fi
}

mkdir -p "$TMP/.context/engineering/standards" "$TMP/.context/business"
printf -- '---\nid: std-demo\nsource: local\napplyTo: ["src/**"]\n---\n## Princípios\n- p\n' > "$TMP/.context/engineering/standards/std-demo.md"
printf -- '---\ntype: knowledge\nlayer: business\nname: business-glossary\ndescription: g\nactivation: always\nowner: business-context\nversion: 1.0.0\n---\nWorkspace significa tenant.\n' > "$TMP/.context/business/business-glossary.md"

echo "=== hook produz um único JSON válido com as normas ==="
out=$(printf '{"source":"startup","cwd":"%s"}' "$TMP" | bash "$REPO_ROOT/hooks/session-start-norms")

DESC="stdout inteiro é um único JSON válido (sem texto antes/depois)"
check python3 -c '
import json,sys
d=json.loads(sys.argv[1])
assert d["hookSpecificOutput"]["hookEventName"] == "SessionStart"
' "$out"

DESC="additionalContext traz std-demo (block) e o knowledge always"
check python3 -c '
import json,sys
c=json.loads(sys.argv[1])["hookSpecificOutput"]["additionalContext"]
assert "std-demo (block)" in c, c
assert "Workspace significa tenant" in c, c
' "$out"

DESC="additionalContext ≤ 10000 (teto duro do Claude Code)"
check python3 -c '
import json,sys
c=json.loads(sys.argv[1])["hookSpecificOutput"]["additionalContext"]
assert len(c) <= 10000, len(c)
' "$out"

DESC="a moldura de dado do projeto está presente"
check python3 -c '
import json,sys
c=json.loads(sys.argv[1])["hookSpecificOutput"]["additionalContext"]
assert "<PROJECT_DATA id=" in c, c
' "$out"

echo ""
echo "=== índice mostra o nível de cada std ==="
idx=$(cd "$TMP" && node "$REPO_ROOT/scripts/lib/context-index-cli.mjs" --format=text --plugin="$REPO_ROOT" 2>/dev/null)
DESC="'std-demo · block' aparece na linha do índice"
check bash -c "printf '%s' \"\$1\" | grep -q 'std-demo · block'" _ "$idx"

echo ""
echo "=== sem normas/ADR/knowledge: stdout vazio (nunca texto solto) ==="
TMP2=$(mktemp -d)
mkdir -p "$TMP2/.context"
out2=$(printf '{"source":"startup","cwd":"%s"}' "$TMP2" | bash "$REPO_ROOT/hooks/session-start-norms")
DESC="stdout vazio quando não há nada a injetar"
check test -z "$out2"
rm -rf "$TMP2"

echo ""
echo "=== hook nunca falha (exit 0), mesmo sem cwd no payload ==="
set +e
out3=$(printf '{"source":"startup"}' | bash "$REPO_ROOT/hooks/session-start-norms")
ec3=$?
set -e
DESC="exit 0 com payload sem cwd"
check test "$ec3" -eq 0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAILED" -gt 0 ]; then
  echo -e "  ${RED}${FAILED}/${TOTAL} FAILED${NC}"
  exit 1
fi
echo -e "  ${GREEN}${TOTAL}/${TOTAL} passed${NC}"
echo "PASS: session-start-norms ≤ 10000 e nível no índice"
