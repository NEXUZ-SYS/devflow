#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-standards-guard.sh — o guard da catraca (ADR-015 D6/D8) chega ao
# hook e sai por emit_decision: deny no baseline, ask ao enfraquecer, nada na edição neutra.
# Também: deny posterior (branch protegida) prevalece sobre o ask da catraca; FIFO no lugar de
# um arquivo da catraca não trava o hook; CLI do guard quebrado cai no fallback lexical.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
P="$TMP/proj"; S="$P/.context/engineering/standards"; mkdir -p "$S" "$P/docs"
printf 'git:\n  strategy: trunk-based\n' > "$P/.context/.devflow.yaml"
printf -- '---\nid: std-a\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  level: block\n---\n' > "$S/std-a.md"

# run <dir> <tool> <tool_input-json> [PATH] → "<decisão>|<segundos>" (decisão vazia = allow)
run() {
  python3 - "$1" "$2" "$3" "$REPO_ROOT/hooks/pre-tool-use" "${4:-$PATH}" <<'PY'
import json, os, subprocess, sys, time
d, tool, ti, hook, path = sys.argv[1:6]
ev = {"tool_name": tool, "cwd": d, "tool_input": json.loads(ti)}
env = dict(os.environ, PATH=path)
t = time.monotonic()
r = subprocess.run(["bash", hook], input=json.dumps(ev), capture_output=True, text=True, cwd=d, env=env, timeout=20)
dt = time.monotonic() - t
s = r.stdout.strip()
dec = json.loads(s)["hookSpecificOutput"].get("permissionDecision", "") if s else ""
print(f"{dec}|{dt:.2f}")
PY
}
dec() { local o; o=$(run "$@"); printf '%s' "${o%%|*}"; }
fail() { echo "FAIL: $*"; exit 1; }

# 1. Os três casos do plano.
[ "$(dec "$P" Write "{\"file_path\":\"$S/baseline.json\",\"content\":\"{}\"}")" = "deny" ] || fail "baseline não negado"
[ "$(dec "$P" Edit "{\"file_path\":\"$S/std-a.md\",\"old_string\":\"level: block\",\"new_string\":\"level: warn\"}")" = "ask" ] || fail "rebaixar não pediu ask"
[ "$(dec "$P" Edit "{\"file_path\":\"$S/std-a.md\",\"old_string\":\"source: local\",\"new_string\":\"source: local\\nx: 1\"}")" = "" ] || fail "edição neutra pediu decisão"

# 2. Symlink fora de standards/ para o baseline (alvo ainda inexistente) → deny pelo realpath.
ln -s "$S/baseline.json" "$P/docs/bl.json"
[ "$(dec "$P" Write "{\"file_path\":\"$P/docs/bl.json\",\"content\":\"{}\"}")" = "deny" ] || fail "symlink para o baseline não negado"

# 3. Deny posterior prevalece: na branch protegida o ask da catraca não abre a edição.
G="$TMP/git"; mkdir -p "$G/.context/engineering/standards"
cp "$S/std-a.md" "$G/.context/engineering/standards/"
printf 'git:\n  strategy: branch-flow\n  protectedBranches: [main]\n  branchProtection: true\n' > "$G/.context/.devflow.yaml"
git init -q -b main "$G"
git -C "$G" -c user.email=t@t -c user.name=t commit -q --allow-empty -m i
[ "$(dec "$G" Edit "{\"file_path\":\"$G/.context/engineering/standards/std-a.md\",\"old_string\":\"level: block\",\"new_string\":\"level: warn\"}")" = "deny" ] \
  || fail "ask da catraca sobrepôs o deny da branch protegida"
git -C "$G" checkout -q -b feat
[ "$(dec "$G" Edit "{\"file_path\":\"$G/.context/engineering/standards/std-a.md\",\"old_string\":\"level: block\",\"new_string\":\"level: warn\"}")" = "ask" ] \
  || fail "fora da branch protegida o rebaixamento não pediu ask"

# 4. FIFO no lugar de um arquivo da catraca: o hook termina em < 2 s e pede ask.
F="$TMP/fifo"; mkdir -p "$F/.context/engineering/standards"
cp "$S/std-a.md" "$F/.context/engineering/standards/"
printf 'git:\n  strategy: trunk-based\n' > "$F/.context/.devflow.yaml"
mkfifo "$F/.context/engineering/standards/std-f.md" "$F/.context/standards.local.yaml"
for ti in \
  "{\"file_path\":\"$F/.context/engineering/standards/std-f.md\",\"old_string\":\"a\",\"new_string\":\"b\"}" \
  "{\"file_path\":\"$F/.context/standards.local.yaml\",\"old_string\":\"a\",\"new_string\":\"b\"}" \
  "{\"file_path\":\"$F/.context/engineering/standards/std-a.md\",\"old_string\":\"level: block\",\"new_string\":\"level: warn\"}"; do
  o=$(run "$F" Edit "$ti")
  python3 -c 'import sys; d, t = sys.argv[1].split("|"); sys.exit(0 if d == "ask" and float(t) < 2.0 else 1)' "$o" \
    || fail "FIFO: esperava ask em < 2 s, veio '$o' para $ti"
done
rm -f "$F/.context/.devflow.yaml"; mkfifo "$F/.context/.devflow.yaml"
for tool_ti in "Edit|{\"file_path\":\"$F/.context/.devflow.yaml\",\"old_string\":\"a\",\"new_string\":\"b\"}" \
               "Write|{\"file_path\":\"$F/.context/.devflow.yaml\",\"content\":\"git: {}\\n\"}"; do
  o=$(run "$F" "${tool_ti%%|*}" "${tool_ti#*|}")
  python3 -c 'import sys; d, t = sys.argv[1].split("|"); sys.exit(0 if d == "ask" and float(t) < 2.0 else 1)' "$o" \
    || fail "FIFO no .devflow.yaml: esperava ask em < 2 s, veio '$o' (${tool_ti%%|*})"
done

# 5. CLI do guard quebrado (node falha só para ele): fallback lexical no hook.
mkdir -p "$TMP/bin"; REAL_NODE="$(command -v node)"
cat > "$TMP/bin/node" <<EOF
#!/usr/bin/env bash
case "\$*" in *standards-guard-cli.mjs*) exit 1 ;; esac
exec "$REAL_NODE" "\$@"
EOF
chmod +x "$TMP/bin/node"
BROKEN="$TMP/bin:$PATH"
[ "$(dec "$P" Write "{\"file_path\":\"$S/Baseline.JSON\",\"content\":\"{}\"}" "$BROKEN")" = "deny" ] || fail "fallback: baseline não negado"
[ "$(dec "$P" Edit "{\"file_path\":\"$S/std-a.md\",\"old_string\":\"- p\",\"new_string\":\"- q\"}" "$BROKEN")" = "ask" ] || fail "fallback: std não pediu ask"
[ "$(dec "$P" Edit "{\"file_path\":\"$P/src/a.ts\",\"old_string\":\"a\",\"new_string\":\"b\"}" "$BROKEN")" = "" ] || fail "fallback: código comum pediu decisão"

# 6. Rodada 1 — o Edit do Claude Code com new_string vazio emenda a linha seguinte
#    (old + "\n" é trocado quando existe): os 3 PoCs da revisão pelo hook real.
E="$TMP/emenda"; ES="$E/.context/engineering/standards"; mkdir -p "$ES/machine"
printf 'git:\n  strategy: trunk-based\n' > "$E/.context/.devflow.yaml"
printf -- '---\nid: std-v\nversion: 1.0.0\nsource: local\napplyTo: ["src/**"]\n---\n' > "$ES/std-v.md"
printf -- '---\n# nota\nid: std-n\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  level: block\n---\n' > "$ES/std-n.md"
printf -- '---\nid: std-d\nsource: local\napplyTo: ["src/**"]\ndescription: regra do projeto\nenforcement:\n  linter: engineering/standards/machine/std-d.js\n  level: block\n---\n' > "$ES/std-d.md"
[ "$(dec "$E" Edit "{\"file_path\":\"$ES/std-v.md\",\"old_string\":\"1.0.0\",\"new_string\":\"\"}")" = "ask" ] || fail "emenda: version engolindo o source não pediu ask"
[ "$(dec "$E" Edit "{\"file_path\":\"$ES/std-n.md\",\"old_string\":\"nota\",\"new_string\":\"\"}")" = "ask" ] || fail "emenda: '# nota' comentando o id não pediu ask"
[ "$(dec "$E" Edit "{\"file_path\":\"$ES/std-d.md\",\"old_string\":\"do projeto\",\"new_string\":\"\"}")" = "ask" ] || fail "emenda: description engolindo o enforcement não pediu ask"

# 7. Rodada 1 — caminho normalizado como texto (como o Claude Code): docs/sdir/../sdir/… com
#    sdir → standards é o baseline (o kernel resolveria o ".." fisicamente para outro lugar).
ln -s "$S" "$P/docs/sdir"
[ "$(dec "$P" Write "{\"file_path\":\"$P/docs/sdir/../sdir/baseline.json\",\"content\":\"{}\"}")" = "deny" ] || fail "sdir/../sdir/baseline.json não negado"

# 8. Rodada 1 (M1) — ask pendente da catraca + ask de memória/napkin: as duas razões chegam.
N="$TMP/napkin"; mkdir -p "$N/.context/engineering/standards"
cp "$S/std-a.md" "$N/.context/engineering/standards/"
printf 'git:\n  strategy: branch-flow\n  protectedBranches: [main]\n  branchProtection: true\n' > "$N/.context/.devflow.yaml"
git init -q -b main "$N"
git -C "$N" -c user.email=t@t -c user.name=t commit -q --allow-empty -m i
ln -s "$N/.context/engineering/standards/std-a.md" "$N/.context/napkin.md"
reason=$(python3 - "$N" "$REPO_ROOT/hooks/pre-tool-use" <<'PY2'
import json, subprocess, sys
d, hook = sys.argv[1:3]
ev = {"tool_name": "Edit", "cwd": d, "tool_input": {"file_path": d + "/.context/napkin.md", "old_string": "level: block", "new_string": "level: warn"}}
out = subprocess.run(["bash", hook], input=json.dumps(ev), capture_output=True, text=True, cwd=d, timeout=20).stdout.strip()
h = json.loads(out)["hookSpecificOutput"] if out else {}
print(h.get("permissionDecision", "") + "|" + h.get("permissionDecisionReason", "").replace("\n", " "))
PY2
)
case "$reason" in ask\|*"[devflow standards]"*"nível block → warn"*) ;; *) fail "M1: ask do napkin perdeu a razão da catraca: $reason" ;; esac

# 9. Rodada 2 — a visão da ferramenta: CRLF normalizado (N1/N1b), espaço final tirado do
#    new_string fora de .md (N2) e trim() no file_path (N7), pelo hook real.
R="$TMP/r2"; RS="$R/.context/engineering/standards"; mkdir -p "$RS"
printf 'git:\n  strategy: trunk-based\n' > "$R/.context/.devflow.yaml"
printf -- '---\r\nid: std-v\r\nversion: 1.0.0\r\nsource: local\r\napplyTo: ["src/**"]\r\n---\r\n' > "$RS/std-v.md"
printf -- '---\r\n# nota\r\nid: std-n\r\nsource: local\r\napplyTo: ["src/**"]\r\nenforcement:\r\n  level: block\r\n---\r\n' > "$RS/std-n.md"
printf -- '---\nid: std-a\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  level: block\n---\n' > "$RS/std-a.md"
printf 'disable: [a, sZZ\ntd-a]\n' > "$R/.context/standards.local.yaml"
[ "$(dec "$R" Edit "{\"file_path\":\"$RS/std-v.md\",\"old_string\":\"1.0.0\",\"new_string\":\"\"}")" = "ask" ] || fail "N1: CRLF version engolindo o source não pediu ask"
[ "$(dec "$R" Edit "{\"file_path\":\"$RS/std-n.md\",\"old_string\":\"nota\",\"new_string\":\"\"}")" = "ask" ] || fail "N1b: CRLF '# nota' comentando o id não pediu ask"
[ "$(dec "$R" Edit "{\"file_path\":\"$R/.context/standards.local.yaml\",\"old_string\":\"ZZ\",\"new_string\":\" \"}")" = "ask" ] || fail "N2: espaço final emendando o disable não pediu ask"
[ "$(dec "$R" Write "{\"file_path\":\" $RS/std-a.md\",\"content\":\"---\\nid: std-a\\nsource: local\\napplyTo: [\\\"src/**\\\"]\\nenforcement:\\n  level: warn\\n---\\n\"}")" = "ask" ] || fail "N7: caminho com espaço inicial não pediu ask"
[ "$(dec "$R" Edit "{\"file_path\":\"$RS/std-a.md\",\"old_string\":\"source: local\",\"new_string\":\"source: local\\nx: 1\"}")" = "" ] || fail "controle LF: edição neutra pediu decisão"

# 10. Rodada 3 (N8) — standards.local.yaml de fim de linha misto com disable dormente: qualquer
#     Edit faz a ferramenta regravar tudo em LF (ela olha só os primeiros 4096 caracteres).
M="$TMP/n8"; mkdir -p "$M/.context/engineering/standards"
printf 'git:\n  strategy: trunk-based\n' > "$M/.context/.devflow.yaml"
printf -- '---\nid: std-a\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  level: block\n---\n' > "$M/.context/engineering/standards/std-a.md"
python3 -c 'import sys; open(sys.argv[1], "w", newline="").write("marca: 1\n" + "# a\n" * 1000 + "# b\r\n" * 1200 + "disable:\r\n  - std-a\r\n")' "$M/.context/standards.local.yaml"
[ "$(dec "$M" Edit "{\"file_path\":\"$M/.context/standards.local.yaml\",\"old_string\":\"marca: 1\",\"new_string\":\"marca: 2\"}")" = "ask" ] || fail "N8: Edit no local.yaml misto não pediu ask"

echo "PASS: guard da catraca no pre-tool-use"
