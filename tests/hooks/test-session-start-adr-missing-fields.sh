#!/usr/bin/env bash
# tests/hooks/test-session-start-adr-missing-fields.sh
# Task 13b: hooks/session-start roda com `set -euo pipefail`. No laço de ADRs, cada
# campo do frontmatter é lido com `grep -m1 '^campo:' "$adr_file" | sed ...`. Quando o
# campo não existe, o grep sai com 1; sob pipefail isso propaga para a atribuição, e
# set -e derruba o hook INTEIRO — exit 1, stdout vazio, SessionStart sem contexto
# nenhum (nem PREVC, nem standards, nem knowledge). Basta UMA ADR sem `stack:`,
# `name:` ou `status:` em .context/engineering/adrs/ para isso acontecer.
#
# Cobre 4 casos: ADR aprovada sem stack:, ADR aprovada sem name: (fallback pro nome
# do arquivo), ADR sem status: (deve ser ignorada, não travar) e um controle com ADR
# completa (comportamento intacto).
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/session-start"

# Roda o hook de verdade, gravando o stdout em $2. Chamada DIRETA (nunca dentro de
# $(...)) para que $? logo depois reflita o exit code real do hook — capturar via
# command substitution rodaria isto num subshell e perderia o exit code no chamador.
run_hook_capture() {
  local cwd="$1" outfile="$2"
  ( cd "$cwd" && echo '{"source":"startup"}' | "$HOOK" ) >"$outfile" 2>/dev/null
}

assert_valid_json() {
  local desc="$1" json="$2"
  if ! printf '%s' "$json" | python3 -c 'import json,sys; json.loads(sys.stdin.read())' >/dev/null 2>&1; then
    echo "FAIL [$desc]: stdout não é JSON válido"
    echo "stdout: $json"
    exit 1
  fi
}

mk_project() {
  mkdir -p "$1/.context/engineering/adrs"
}

T1=$(mktemp -d); T2=$(mktemp -d); T3=$(mktemp -d); T4=$(mktemp -d)
trap 'rm -rf "$T1" "$T2" "$T3" "$T4"' EXIT

# ─── Caso 1: ADR aprovada SEM stack: ───────────────────────────────────────
mk_project "$T1"
cat > "$T1/.context/engineering/adrs/001-sem-stack.md" <<'EOF'
---
name: Sem Stack
status: Aprovado
---
## Guardrails
- Regra sem stack
EOF

set +e
run_hook_capture "$T1" "$T1/out.json"
rc1=$?
set -e
out1=$(cat "$T1/out.json")
[ "$rc1" -eq 0 ] || { echo "FAIL [caso 1]: hook saiu com $rc1 (esperado 0), stdout vazio ou truncado"; echo "stdout: $out1"; exit 1; }
assert_valid_json "caso 1" "$out1"
echo "$out1" | grep -q "Regra sem stack" || { echo "FAIL [caso 1]: guardrail da ADR sem stack: não apareceu no contexto"; echo "$out1"; exit 1; }
echo "PASS [caso 1]: ADR aprovada sem stack: não derruba o hook"

# ─── Caso 2: ADR aprovada SEM name: (fallback pro nome do arquivo) ─────────
mk_project "$T2"
cat > "$T2/.context/engineering/adrs/002-sem-nome.md" <<'EOF'
---
status: Aprovado
stack: universal
---
## Guardrails
- Regra sem nome
EOF

set +e
run_hook_capture "$T2" "$T2/out.json"
rc2=$?
set -e
out2=$(cat "$T2/out.json")
[ "$rc2" -eq 0 ] || { echo "FAIL [caso 2]: hook saiu com $rc2 (esperado 0), stdout vazio ou truncado"; echo "stdout: $out2"; exit 1; }
assert_valid_json "caso 2" "$out2"
echo "$out2" | grep -q "Regra sem nome" || { echo "FAIL [caso 2]: guardrail da ADR sem name: não apareceu no contexto"; echo "$out2"; exit 1; }
echo "$out2" | grep -q "002-sem-nome.md" || { echo "FAIL [caso 2]: rótulo de fallback (nome do arquivo) ausente"; echo "$out2"; exit 1; }
echo "PASS [caso 2]: ADR aprovada sem name: cai para o nome do arquivo"

# ─── Caso 3: ADR SEM status: (deve ser ignorada, não travar o hook) ────────
mk_project "$T3"
cat > "$T3/.context/engineering/adrs/003-sem-status.md" <<'EOF'
---
name: Sem Status
stack: universal
---
## Guardrails
- Regra sem status
EOF

set +e
run_hook_capture "$T3" "$T3/out.json"
rc3=$?
set -e
out3=$(cat "$T3/out.json")
[ "$rc3" -eq 0 ] || { echo "FAIL [caso 3]: hook saiu com $rc3 (esperado 0), stdout vazio ou truncado"; echo "stdout: $out3"; exit 1; }
assert_valid_json "caso 3" "$out3"
if echo "$out3" | grep -q "Regra sem status"; then
  echo "FAIL [caso 3]: ADR sem status: foi tratada como aprovada (deveria ser ignorada)"
  echo "$out3"
  exit 1
fi
echo "PASS [caso 3]: ADR sem status: é ignorada, sem derrubar o hook"

# ─── Caso 4 (controle): ADR completa — comportamento intacto ──────────────
mk_project "$T4"
cat > "$T4/.context/engineering/adrs/004-completa.md" <<'EOF'
---
name: Completa
status: Aprovado
stack: typescript
---
## Guardrails
- Regra completa
EOF

set +e
run_hook_capture "$T4" "$T4/out.json"
rc4=$?
set -e
out4=$(cat "$T4/out.json")
[ "$rc4" -eq 0 ] || { echo "FAIL [caso 4]: hook saiu com $rc4 (esperado 0)"; echo "stdout: $out4"; exit 1; }
assert_valid_json "caso 4" "$out4"
echo "$out4" | grep -q "### Completa (stack: typescript)" || { echo "FAIL [caso 4]: cabeçalho da ADR completa mudou de formato"; echo "$out4"; exit 1; }
echo "$out4" | grep -q "Regra completa" || { echo "FAIL [caso 4]: guardrail da ADR completa não apareceu"; echo "$out4"; exit 1; }
echo "PASS [caso 4]: ADR completa mantém o comportamento (controle)"

echo ""
echo "ALL PASS: session-start sobrevive a ADR sem campo de frontmatter"
