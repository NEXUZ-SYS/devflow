#!/usr/bin/env bash
# tests/hooks/test-adr-guardrails-parity.sh — o JS extrai os mesmos guardrails que o session-start.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/.context/engineering/adrs"
printf -- '---\nname: x\nstatus: Aprovado\nstack: universal\n---\n## Guardrails\n- NUNCA A\n- Zona Z\n## Enforcement\n- e\n' > "$TMP/.context/engineering/adrs/001-x-v1.0.0.md"
ss=$(printf '{"source":"startup","cwd":"%s"}' "$TMP" | (cd "$TMP" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$REPO_ROOT/hooks/session-start") | python3 -c 'import json,sys,re; c=json.loads(sys.stdin.read())["hookSpecificOutput"]["additionalContext"]; m=re.search(r"<ADR_GUARDRAILS>(.*?)</ADR_GUARDRAILS>", c, re.S); print("\n".join(l for l in m.group(1).splitlines() if l.startswith("- ")))')
js=$(cd "$REPO_ROOT" && node --input-type=module -e 'import("./scripts/lib/adr-guardrails.mjs").then(m=>{for(const a of m.loadApprovedGuardrails(process.argv[1])) console.log(a.guardrails.split("\n").filter(l=>l.startsWith("- ")).join("\n"))})' "$TMP")
[ "$ss" = "$js" ] || { echo "FAIL: paridade"; echo "session-start: $ss"; echo "js: $js"; exit 1; }
echo "PASS: paridade dos guardrails de ADR"

# ─── Task 13b: ADRs sem stack:/name:/status: — mesma extração nos dois lados ───
TMP2=$(mktemp -d); trap 'rm -rf "$TMP" "$TMP2"' EXIT
mkdir -p "$TMP2/.context/engineering/adrs"
printf -- '---\nstatus: Aprovado\nstack: universal\n---\n## Guardrails\n- sem nome\n' > "$TMP2/.context/engineering/adrs/001-sem-nome.md"
printf -- '---\nname: Sem Stack\nstatus: Aprovado\n---\n## Guardrails\n- sem stack\n' > "$TMP2/.context/engineering/adrs/002-sem-stack.md"
printf -- '---\nname: Sem Status\nstack: universal\n---\n## Guardrails\n- sem status (nao deve aparecer)\n' > "$TMP2/.context/engineering/adrs/003-sem-status.md"

ss2=$(printf '{"source":"startup","cwd":"%s"}' "$TMP2" | (cd "$TMP2" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$REPO_ROOT/hooks/session-start") | python3 -c 'import json,sys,re; c=json.loads(sys.stdin.read())["hookSpecificOutput"]["additionalContext"]; m=re.search(r"<ADR_GUARDRAILS>(.*?)</ADR_GUARDRAILS>", c, re.S); print("\n".join(l for l in m.group(1).splitlines() if l.startswith("- ")))')
js2=$(cd "$REPO_ROOT" && node --input-type=module -e 'import("./scripts/lib/adr-guardrails.mjs").then(m=>{for(const a of m.loadApprovedGuardrails(process.argv[1])) console.log(a.guardrails.split("\n").filter(l=>l.startsWith("- ")).join("\n"))})' "$TMP2")
[ "$ss2" = "$js2" ] || { echo "FAIL: paridade com campos ausentes"; echo "session-start: $ss2"; echo "js: $js2"; exit 1; }
echo "PASS: paridade dos guardrails de ADR com stack/name/status ausentes (ADR sem status: excluida nos dois lados)"

# Coerência campo a campo no JS: name cai pro nome do arquivo quando ausente (igual
# ao bash: fm_field || "$fn"); stack ausente vira string vazia (o bash usa "-" só na
# hora de renderizar o header, igual session-norms.mjs faz com textField(...)||"-").
js_fields=$(cd "$REPO_ROOT" && node --input-type=module -e '
import("./scripts/lib/adr-guardrails.mjs").then(m => {
  const rows = m.loadApprovedGuardrails(process.argv[1]);
  console.log(rows.length);
  for (const r of rows) console.log(`${r.name}|${JSON.stringify(r.stack)}`);
})' "$TMP2")
expected_fields=$'2\n001-sem-nome.md|"universal"\nSem Stack|""'
[ "$js_fields" = "$expected_fields" ] || { echo "FAIL: coerencia de campos no JS (name/stack ausentes)"; echo "obtido: $js_fields"; echo "esperado: $expected_fields"; exit 1; }
echo "PASS: JS trata name/stack ausentes de forma coerente com o bash corrigido (fallback pro nome do arquivo; ADR sem status excluida)"
