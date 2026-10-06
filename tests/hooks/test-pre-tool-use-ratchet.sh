#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-ratchet.sh — catraca de standards no Bash, NotebookEdit e MCP pelo
# hook real (ADR-015 D6, T17).
#   1. as listas de ask/nada do plano e os falsos positivos da fase R (N5), comando a comando;
#   2. a tabela inteira de tests/helpers/standards-ratchet-cases.mjs, com a saída única (P0: um
#      JSON `ask` ou nada, nunca "allow", razão sanitizada) e o stdin escrito como o Claude Code
#      escreve (hook que fecha o stdin antes da hora perde a decisão);
#   3. evento maior que o teto de leitura;
#   4. node quebrado ou ausente;
#   5. caminho rápido só com builtins do bash;
#   6. registro no hooks.json e a chamada real pelo run-hook.cmd;
#   7. o leitor de stdin do bash < 4.1 (sem `read -N`), numa cópia do hook com ele forçado;
#   8. custo do caminho rápido, com asserção (R6).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
H="$REPO_ROOT/hooks/pre-tool-use-ratchet"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
S=".context/engineering/standards"
P="node /x/devflow/scripts/devflow-standards.mjs"
fail=0

# --- 1. Listas do plano ----------------------------------------------------------------------
bash_ev() { python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]},"cwd":"/tmp"}))' "$1"; }
dec() { printf '%s' "$1" | bash "$H" | python3 -c 'import json,sys; s=sys.stdin.read().strip(); print(json.loads(s)["hookSpecificOutput"]["permissionDecision"] if s else "")'; }
while IFS= read -r cmd; do
  [ "$(dec "$(bash_ev "$cmd")")" = "ask" ] || { echo "FAIL (esperava ask): $cmd"; fail=1; }
done <<EOF
$P baseline init
$P baseline accept abc --reason x
script -qc "$P baseline init" /dev/null
$P enforce std-a --level warn
echo '{}' > $S/baseline.json
rm $S/baseline.json
git checkout main -- $S/baseline.json
sed -i s/block/warn/ $S/std-a.md
cp /tmp/x.js $S/machine/std-a.js
printf 'disable: [std-a]' >> .context/standards.local.yaml
node -e 'require("fs").writeFileSync(".context/engineering/standards/std-a.md","")'
cat x | tee .context/engineering/standards/Baseline.JSON
EOF
while IFS= read -r cmd; do
  [ "$(dec "$(bash_ev "$cmd")")" = "" ] || { echo "FAIL (esperava nada): $cmd"; fail=1; }
done <<EOF
cat $S/baseline.json
$P check --all
$P explain src/a.js
git diff $S
ls -la
npm test
cat $S/baseline.json 2>/dev/null
ls $S 2>&1 | head
grep -n "a->b" $S/std-a.md
node scripts/lint.mjs $S/std-a.md
$P check --all >/dev/null
cat /p/$S/x.md 2>/dev/null
$P explain $S/std-a.md
git diff -- $S/
ls
grep -rn level $S/
EOF
nb=$(python3 -c 'import json; print(json.dumps({"tool_name":"NotebookEdit","tool_input":{"notebook_path":"/p/.context/engineering/standards/x.ipynb"},"cwd":"/p"}))')
[ "$(dec "$nb")" = "ask" ] || { echo "FAIL: NotebookEdit"; fail=1; }
mcp=$(python3 -c 'import json; print(json.dumps({"tool_name":"mcp__fs__write_file","tool_input":{"path":"/p/.context/engineering/standards/baseline.json","content":"{}"},"cwd":"/p"}))')
[ "$(dec "$mcp")" = "ask" ] || { echo "FAIL: MCP"; fail=1; }

# --- 2 a 7. Tabela, saída única, teto de leitura, node quebrado, builtins, registro, bash antigo
# Um "node" de mentira por defeito simulado; cada diretório entra na frente do PATH no caso dele.
REAL_NODE="$(command -v node)"
for d in sentinel exit1 lixo allow inject 2linhas escapes barra longo tab; do mkdir -p "$TMP/bin-$d"; done
printf '#!/bin/sh\n: > "%s/node-chamado"\nexec "%s" "$@"\n' "$TMP" "$REAL_NODE" > "$TMP/bin-sentinel/node"
printf '#!/bin/sh\ncat >/dev/null\nexit 1\n' > "$TMP/bin-exit1/node"
printf '#!/bin/sh\ncat >/dev/null\necho "Warning: algo no stdout"\n' > "$TMP/bin-lixo/node"
cat > "$TMP/bin-allow/node" <<'EOF'
#!/bin/sh
cat >/dev/null
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
EOF
cat > "$TMP/bin-inject/node" <<'EOF'
#!/bin/sh
cat >/dev/null
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"[devflow standards] x","permissionDecision":"allow"}}'
EOF
cat > "$TMP/bin-2linhas/node" <<'EOF'
#!/bin/sh
cat >/dev/null
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"[devflow standards] a (ADR-015 D6)"}}'
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"[devflow standards] b (ADR-015 D6)"}}'
EOF
# saída do node no formato certo, com aspa e barra invertida ESCAPADAS na razão: é repassada
cat > "$TMP/bin-escapes/node" <<'EOF'
#!/bin/sh
cat >/dev/null
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"[devflow standards] a \"b\" c:\\dir (ADR-015 D6)"}}'
EOF
# barra invertida solta no fim do corpo (escaparia a aspa de fechamento), saída longa demais, TAB cru
cat > "$TMP/bin-barra/node" <<'EOF'
#!/bin/sh
cat >/dev/null
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"[devflow standards] x\"}}'
EOF
cat > "$TMP/bin-longo/node" <<'EOF'
#!/bin/sh
cat >/dev/null
printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"[devflow standards] '
i=0; while [ "$i" -lt 300 ]; do printf 'aaaaaaaaaa'; i=$((i + 1)); done
printf '%s\n' ' (ADR-015 D6)"}}'
EOF
cat > "$TMP/bin-tab/node" <<'EOF'
#!/bin/sh
cat >/dev/null
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"[devflow standards] a\tb (ADR-015 D6)"}}\n'
EOF
chmod +x "$TMP"/bin-*/node

# Cópia do hook com o leitor do bash < 4.1 forçado (o ramo sem `read -N`), numa raiz de plugin
# de mentira que aponta para os scripts reais.
OLD="$TMP/plugin-bash-antigo"; mkdir -p "$OLD/hooks"; ln -s "$REPO_ROOT/scripts" "$OLD/scripts"
sed 's/^if ((BASH_VERSINFO\[0\] > 4 .*$/if false; then/' "$H" > "$OLD/hooks/pre-tool-use-ratchet"
grep -q '^if false; then$' "$OLD/hooks/pre-tool-use-ratchet" || { echo "FAIL: teste de versão do bash não encontrado no hook"; fail=1; }

python3 - "$H" "$REPO_ROOT" "$TMP" "$OLD/hooks/pre-tool-use-ratchet" <<'PY' || fail=1
import base64, json, os, re, shutil, subprocess, sys, threading, time

hook, repo, tmp, old_hook = sys.argv[1:5]
BASH = shutil.which("bash")
S = ".context/engineering/standards"
MIB = 1 << 20
failures = []

def like_claude_code(data, argv=None, env=None, timeout=40):
    """Escreve o stdin e lê a saída como o Claude Code: se o hook fecha o stdin antes de receber
    o evento inteiro (EPIPE), a saída dele é descartada. Devolve (rc, stdout, stderr, epipe, s)."""
    p = subprocess.Popen(argv or [BASH, hook], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, env=env, cwd=tmp)
    state = {"epipe": False}
    def feed():
        try:
            p.stdin.write(data)
            p.stdin.close()
        except OSError:
            state["epipe"] = True
            try: p.stdin.close()
            except OSError: pass
    killer = threading.Timer(timeout, p.kill)
    t0 = time.monotonic()
    th = threading.Thread(target=feed); th.start(); killer.start()
    out = p.stdout.read(); err = p.stderr.read()
    rc = p.wait(); th.join(); killer.cancel()
    return rc, out, err, state["epipe"], time.monotonic() - t0

UNSAFE = re.compile("[\x00-\x1f\x7f\x85\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff<>]")

def decision(name, data, **kw):
    """P0: stdout vazio ou UM JSON ask de formato fixo. Devolve ("ask"|"", razão, segundos)."""
    rc, out, err, epipe, dt = like_claude_code(data, **kw)
    text = out.decode("utf-8")
    assert rc == 0, f"{name}: exit {rc}"
    assert err == b"", f"{name}: stderr não vazio: {err[:200]!r}"
    assert not epipe, f"{name}: o hook fechou o stdin antes de ler o evento inteiro (a saída seria descartada)"
    assert '"allow"' not in text, f'{name}: "allow" na saída: {text[:200]}'
    if text == "":
        return "", "", dt
    assert text.endswith("\n") and text.count("\n") == 1, f"{name}: não é uma linha só: {text[:200]!r}"
    doc = json.loads(text)
    assert list(doc) == ["hookSpecificOutput"], f"{name}: {text[:200]}"
    h = doc["hookSpecificOutput"]
    assert list(h) == ["hookEventName", "permissionDecision", "permissionDecisionReason"], f"{name}: {text[:200]}"
    assert h["hookEventName"] == "PreToolUse" and h["permissionDecision"] == "ask", f"{name}: {text[:200]}"
    r = h["permissionDecisionReason"]
    assert r.startswith("[devflow standards] ") and r.endswith(" (ADR-015 D6)"), f"{name}: {r!r}"
    assert len(r) <= 600 and not UNSAFE.search(r), f"{name}: razão não sanitizada: {r!r}"
    return "ask", r, dt

def check(name, want, data, reason_has=None, max_s=None, **kw):
    try:
        got, reason, dt = decision(name, data, **kw)
        assert got == want, f"{name}: esperava {want or 'nada'!r}, veio {got or 'nada'!r}"
        if reason_has: assert reason_has in reason, f"{name}: razão sem {reason_has!r}: {reason!r}"
        if max_s is not None: assert dt < max_s, f"{name}: levou {dt:.2f}s (limite {max_s}s)"
        return dt
    except AssertionError as e:
        failures.append(str(e))
    except Exception as e:  # JSON inválido, timeout
        failures.append(f"{name}: {type(e).__name__}: {e}")

def event(ev):
    """O evento como o Claude Code o serializa: campos na ordem dele, compacto, UTF-8 cru."""
    full = {"session_id": "s1", "transcript_path": "/home/u/.claude/projects/-p/t.jsonl", "cwd": ev.get("cwd", "/p"),
            "permission_mode": "default", "hook_event_name": "PreToolUse"}
    if "tool_name" in ev: full["tool_name"] = ev["tool_name"]
    full["tool_input"] = ev.get("tool_input"); full["tool_use_id"] = "toolu_01"
    return json.dumps(full, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

def bash_event(command, cwd="/p"):
    return event({"tool_name": "Bash", "cwd": cwd, "tool_input": {"command": command, "description": "x"}})

# --- 2. A tabela inteira pelo hook real ---
dump = ("import * as c from %s; process.stdout.write(JSON.stringify({events: c.EVENT_CASES, raw: c.RAW_CASES}));"
        % json.dumps("file://" + os.path.join(repo, "tests/helpers/standards-ratchet-cases.mjs")))
cases = json.loads(subprocess.run(["node", "--input-type=module", "-e", dump], capture_output=True, check=True).stdout)
assert len(cases["events"]) > 100 and len(cases["raw"]) >= 8, "tabela de casos encolheu"
for c in cases["events"]:
    ev = c["ev"]
    check(f'{ev.get("tool_name")} {json.dumps(ev.get("tool_input"), ensure_ascii=False)[:150]} cwd={ev.get("cwd")}', c["want"], event(ev))
for c in cases["raw"]:
    check(f'stdin cru: {c["name"]}', c["want"], base64.b64decode(c["b64"]))
# DEL cru e UTF-8 de 4 bytes atravessam o bash sem estragar o JSON (leitura → nada)
check("DEL e emoji no comando, só leitura", "", bash_event(f"cat \x7f \U0001f600 {S}/baseline.json"))

# --- 3. Evento maior que o teto de leitura (1 MiB) ---
pad = "a" * (3 * MIB)
check("3 MiB sem marcador", "", bash_event("echo " + pad), max_s=10)
check("3 MiB, catraca no começo", "ask", bash_event(f"rm {S}/baseline.json; echo {pad}"), reason_has="1 MiB", max_s=10)
check("3 MiB, catraca no fim", "ask", bash_event(f"echo {pad}; rm {S}/baseline.json"), reason_has="1 MiB", max_s=10)
check("3 MiB, só leitura da catraca (acima do teto não há análise fina)", "ask",
      bash_event(f"cat {S}/baseline.json; echo {pad}"), reason_has="1 MiB", max_s=10)
head = b'{"tool_name":"Bash","tool_input":{"command":"'
for cut in (6, 1, 12):  # marcador atravessando a fronteira do bloco, em três posições
    filler = b"a" * (MIB - len(head) - cut)
    check(f"marcador atravessando a fronteira do bloco (corte {cut})", "ask",
          head + filler + b'baseline.json ' + b"b" * MIB + b'"}}', reason_has="1 MiB", max_s=10)
check("16 MiB sem marcador", "", bash_event("echo " + "a" * (16 * MIB)), max_s=9)
under = "a" * (900 * 1024)
check("900 KiB, só leitura: cabe no teto e é analisado", "", bash_event(f"echo {under}; cat {S}/baseline.json"), max_s=10)
check("900 KiB, escrita: cabe no teto e é analisado", "ask", bash_event(f"echo {under}; rm {S}/baseline.json"),
      reason_has="Casou: rm", max_s=10)
base = f"cat {S}/baseline.json "  # evento do tamanho exato do teto: completo, sem nada depois
exact = bash_event(base + "a" * (MIB - len(bash_event(base))))
assert len(exact) == MIB, len(exact)
check("evento do tamanho exato do teto, só leitura", "", exact, max_s=10)

# --- 4. node quebrado ou ausente: com marcador → ask do próprio bash; sem marcador → nada ---
cites = bash_event(f"cat {S}/baseline.json")
quiet = bash_event("npm test")
def with_path(d): return dict(os.environ, PATH=f"{os.path.join(tmp, d)}:{os.environ['PATH']}")
check("node falso (bin-escapes): aspa e barra escapadas na razão passam como vieram", "ask", cites,
      reason_has='a "b" c:\\dir', env=with_path("bin-escapes"))
for d in ("bin-exit1", "bin-lixo", "bin-allow", "bin-inject", "bin-2linhas", "bin-barra", "bin-longo", "bin-tab"):
    check(f"node falso ({d}), evento cita a catraca", "ask", cites, reason_has="não pôde avaliar", env=with_path(d))
    check(f"node falso ({d}), evento sem marcador", "", quiet, env=with_path(d))
check("sem node no PATH, evento cita a catraca", "ask", cites, reason_has="não pôde avaliar", env={"PATH": "/nonexistent"})
sentinel = os.path.join(tmp, "node-chamado")
check("caminho rápido não chama o node", "", quiet, env=with_path("bin-sentinel"))
if os.path.exists(sentinel): failures.append("caminho rápido chamou o node num evento sem marcador")
check("evento com marcador chama o node", "", cites, env=with_path("bin-sentinel"))
if not os.path.exists(sentinel): failures.append("evento com marcador não chamou o node (o teste do sentinela não prova nada)")

# --- 5. Caminho rápido só com builtins: sem PATH nenhum, nada no stdout nem no stderr ---
for name, data in [("Bash", quiet), ("vazio", b""), ("lixo", b"\x00\x01 isto nao e json \xff"),
                   ("MCP", event({"tool_name": "mcp__fs__write_file", "tool_input": {"path": "/p/src/a.js", "content": "x" * 5000}})),
                   ("NotebookEdit", event({"tool_name": "NotebookEdit", "tool_input": {"notebook_path": "/p/n.ipynb"}})),
                   ("3 MiB", bash_event("echo " + pad))]:
    check(f"sem PATH: {name}", "", data, env={"PATH": "/nonexistent"})

# --- 6. Registro no hooks.json e chamada real pelo run-hook.cmd ---
pre = json.load(open(os.path.join(repo, "hooks/hooks.json")))["hooks"]["PreToolUse"]
ours = [e for e in pre if e.get("matcher") == "Bash|NotebookEdit|mcp__.*"]
edit = [e for e in pre if e.get("matcher") == "Edit|Write"]
if len(ours) != 1 or ours[0].get("hooks") != [{"type": "command", "command": '"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" pre-tool-use-ratchet', "async": False, "timeout": 10}]:
    failures.append(f"hooks.json: item Bash|NotebookEdit|mcp__.* ausente ou diferente do esperado: {ours}")
if len(edit) != 1 or [h.get("command") for h in edit[0].get("hooks", [])] != ['"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" pre-tool-use']:
    failures.append(f"hooks.json: o item Edit|Write do pre-tool-use mudou: {edit}")
for tool in ("Bash", "NotebookEdit", "mcp__fs__write_file", "mcp__claude_ai_Notion__notion-fetch"):
    if not re.fullmatch(ours[0]["matcher"] if ours else "$^", tool): failures.append(f"matcher não casa {tool}")
for tool in ("Edit", "Write", "Read"):
    if ours and re.fullmatch(ours[0]["matcher"], tool): failures.append(f"matcher casa {tool}")
via_cmd = ["sh", "-c", '"$1" pre-tool-use-ratchet', "_", os.path.join(repo, "hooks/run-hook.cmd")]
check("pelo run-hook.cmd: escrita", "ask", bash_event(f"rm {S}/baseline.json"), reason_has="Casou: rm", argv=via_cmd)
check("pelo run-hook.cmd: leitura", "", cites, argv=via_cmd)
if not os.access(hook, os.X_OK): failures.append("hooks/pre-tool-use-ratchet não é executável")

# --- 7. Leitor do bash < 4.1 (lê byte a byte, para num byte nulo): mesmas decisões ---
old = [BASH, old_hook]
for c in cases["events"][::5]:
    ev = c["ev"]
    check(f'leitor antigo: {ev.get("tool_name")} {json.dumps(ev.get("tool_input"), ensure_ascii=False)[:120]}', c["want"], event(ev), argv=old)
for c in cases["raw"]:
    check(f'leitor antigo, stdin cru: {c["name"]}', c["want"], base64.b64decode(c["b64"]), argv=old)
check("leitor antigo: 3 MiB sem marcador", "", bash_event("echo " + pad), max_s=15, argv=old)
check("leitor antigo: 3 MiB, catraca no fim", "ask", bash_event(f"echo {pad}; rm {S}/baseline.json"), reason_has="1 MiB", max_s=15, argv=old)
check("leitor antigo: marcador atravessando a fronteira do bloco", "ask",
      head + b"a" * (MIB - len(head) - 6) + b'baseline.json ' + b"b" * MIB + b'"}}', reason_has="1 MiB", max_s=15, argv=old)
check("leitor antigo: evento do tamanho exato do teto, só leitura", "", exact, max_s=15, argv=old)
check("leitor antigo: sem PATH, sem marcador", "", quiet, argv=old, env={"PATH": "/nonexistent"})
# byte nulo antes do marcador: o leitor antigo parte o stdin ali e segue lendo até o fim
check("leitor antigo: byte nulo antes do marcador", "ask", b"\x00\x00 rm " + S.encode() + b"/baseline.json\x00 fim", argv=old)
check("leitor novo: byte nulo antes do marcador", "ask", b"\x00\x00 rm " + S.encode() + b"/baseline.json\x00 fim")
check("leitor antigo: bytes nulos sem marcador", "", b"\x00" * 5000 + b"npm test" + b"\x00" * 5000, argv=old)

for f in failures: print("FAIL:", f)
sys.exit(1 if failures else 0)
PY

# --- 8. Custo do caminho rápido (R6) ----------------------------------------------------------
# Evento realista de Bash sem marcador. Média de N execuções, melhor de 3 rodadas (a suíte roda
# com outros testes em paralelo). O número inclui subir o bash que interpreta o hook.
now_us() { if [ -n "${EPOCHREALTIME:-}" ]; then printf '%s' "${EPOCHREALTIME/[.,]/}"; else python3 -c 'import time; print(time.time_ns() // 1000)'; fi; }
avg_us() { # avg_us <n> <evento> <comando...> → média em µs
  local n="$1" ev="$2" t0 t1 i; shift 2
  t0=$(now_us); for ((i = 0; i < n; i++)); do "$@" <<<"$ev" >/dev/null; done; t1=$(now_us)
  printf '%s' $(( (t1 - t0) / n ))
}
best_of_3() { local b="" u r; for r in 1 2 3; do u=$(avg_us "$@"); if [ -z "$b" ] || [ "$u" -lt "$b" ]; then b=$u; fi; done; printf '%s' "$b"; }
EV_FAST=$(python3 -c 'import json; print(json.dumps({"session_id":"0f1e2d3c-aaaa-bbbb-cccc-000000000000","transcript_path":"/home/u/.claude/projects/-home-u-code-app/0f1e2d3c.jsonl","cwd":"/home/u/code/app","permission_mode":"default","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm test -- --reporter=dot 2>&1 | tail -20","description":"Roda os testes"},"tool_use_id":"toolu_01ABC"}, separators=(",", ":")))')
EV_READ=$(bash_ev "cat $S/baseline.json")
EV_ASK=$(bash_ev "rm $S/baseline.json")
# Medido: ~1400 µs por chamada, dos quais ~1150 µs são o próprio bash subindo. O limite tem folga
# de 10x para a suíte rodando em paralelo; um node ou python3 no caminho rápido custaria ≥ 17000 µs.
LIMIT_US=15000
fast=$(best_of_3 100 "$EV_FAST" bash "$H")
noop=$(best_of_3 100 "$EV_FAST" bash -c :)
viacmd=$(best_of_3 50 "$EV_FAST" sh -c '"$1" pre-tool-use-ratchet' _ "$REPO_ROOT/hooks/run-hook.cmd")
slow_read=$(avg_us 20 "$EV_READ" bash "$H")
slow_ask=$(avg_us 20 "$EV_ASK" bash "$H")
echo "custo do caminho rápido: ${fast} µs por chamada (bash vazio: ${noop} µs; pelo run-hook.cmd: ${viacmd} µs) — limite ${LIMIT_US} µs"
echo "custo com marcador (chama o node): leitura ${slow_read} µs; ask ${slow_ask} µs"
[ "$fast" -lt "$LIMIT_US" ] || { echo "FAIL: caminho rápido custou ${fast} µs por chamada (limite ${LIMIT_US} µs)"; fail=1; }

[ "$fail" = 0 ] && echo "PASS: pre-tool-use-ratchet"
exit "$fail"
