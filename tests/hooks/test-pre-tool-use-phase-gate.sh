#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-phase-gate.sh — gate de evidência por fase pelo hook real (D5, ADR-018).
#   1. advance (MCP, com e sem force) negado sem evidência; permitido com evidência;
#   2. CLI do dotcontext no Bash negada; Bash comum e commit citando o texto ficam calados;
#   3. modo warn e off;
#   4. saída sempre um JSON numa linha (ou nada), nunca "allow";
#   5. registro no hooks.json e chamada pelo run-hook.cmd, inclusive com o plugin por symlink;
#   6. node ausente → calado; evento maior que o teto com marcador → deny fixo;
#   7. custo do caminho rápido (Bash comum), com asserção.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
H="$REPO_ROOT/hooks/pre-tool-use-phase-gate"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
fail=0
export GIT_CONFIG_GLOBAL=/dev/null GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
unset CLAUDE_PROJECT_DIR DEVFLOW_EVIDENCE_GATE

mkrepo() { # $1 = dir, $2 = yaml extra
  mkdir -p "$1/.context/runtime/workflows"
  git -C "$1" init -q -b main
  printf 'git:\n  protectedBranches: [main]\n%s' "${2:-}" > "$1/.context/.devflow.yaml"
  echo seed > "$1/seed.txt"; git -C "$1" add seed.txt; git -C "$1" commit -q -m seed
  printf '{"status":{"project":{"current_phase":"P","started":"2026-01-01T00:00:00Z","plan":"x"},"phases":{"P":{"status":"in_progress"},"R":{},"E":{},"V":{},"C":{}}}}' > "$1/.context/runtime/workflows/prevc.json"
}
ev_mcp() { # $1 = cwd, $2 = tool_input em JSON (padrão {})
  local inp="${2:-}"; [ -n "$inp" ] || inp='{}'
  python3 -c 'import json,sys; print(json.dumps({"tool_name":"mcp__dotcontext__workflow-advance","tool_input":json.loads(sys.argv[2]),"cwd":sys.argv[1]}))' "$1" "$inp"
}
ev_bash() { python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[2]},"cwd":sys.argv[1]}))' "$1" "$2"; }
dec_with() { # $1 = hook, $2 = evento; imprime deny|warn|"" e acusa saída fora do formato
  local out; out=$(printf '%s' "$2" | bash "$1")
  [ -z "$out" ] && { echo ""; return; }
  [ "$(printf '%s\n' "$out" | wc -l)" -eq 1 ] || { echo "MULTILINE"; return; }
  printf '%s' "$out" | python3 -c 'import json,sys; o=json.loads(sys.stdin.read())["hookSpecificOutput"]; d=o.get("permissionDecision"); print("ALLOW" if d=="allow" else d or ("warn" if o.get("additionalContext") else ""))'
}
dec() { dec_with "$H" "$1"; }
expect() { [ "$1" = "$2" ] || { echo "FAIL ($3): esperava '$2', veio '$1'"; fail=1; }; }

# --- 1 e 2: sem evidência ------------------------------------------------------------------------
R="$TMP/r"; mkrepo "$R"
expect "$(dec "$(ev_mcp "$R")")" deny "advance sem plano"
expect "$(dec "$(ev_mcp "$R" '{"force":true}')")" deny "advance com force"
expect "$(dec "$(ev_bash "$R" 'npx -y @dotcontext/cli workflow advance')")" deny "CLI no Bash"
expect "$(dec "$(ev_bash "$R" 'ls -la')")" "" "Bash comum"
expect "$(dec "$(ev_bash "$R" 'git commit -m "docs: dotcontext workflow advance"')")" "" "commit citando o texto"

# --- 1: com evidência ----------------------------------------------------------------------------
mkdir -p "$R/.context/plans"
{ printf -- '---\ntype: plan\n---\n# Plano\n'; for i in $(seq 1 12); do echo "- [ ] tarefa $i com teste e implementação"; done; } > "$R/.context/plans/x.md"
expect "$(dec "$(ev_mcp "$R")")" "" "advance com plano"

# --- 3: warn e off --------------------------------------------------------------------------------
W="$TMP/w"; mkrepo "$W" $'prevc:\n  evidenceGate: warn\n'
expect "$(dec "$(ev_mcp "$W")")" warn "modo warn"
O="$TMP/o"; mkrepo "$O" $'prevc:\n  evidenceGate: off\n'
expect "$(dec "$(ev_mcp "$O")")" "" "modo off"

# --- 5: registro, run-hook.cmd e plugin por symlink ------------------------------------------------
python3 - "$REPO_ROOT/hooks/hooks.json" <<'PY' || { echo "FAIL: hooks.json sem o phase-gate"; fail=1; }
import json, sys
pre = json.load(open(sys.argv[1]))["hooks"]["PreToolUse"]
hit = [e for e in pre if any("pre-tool-use-phase-gate" in h["command"] for h in e["hooks"])]
assert len(hit) == 1 and hit[0]["matcher"] == "Bash|mcp__dotcontext__workflow-advance", hit
PY
# run-hook.cmd precisa ACHAR o hook: sem evidência exige deny (saída vazia não prova nada), com evidência exige vazio.
RH() { printf '%s' "$2" | CLAUDE_PLUGIN_ROOT="$REPO_ROOT" "$REPO_ROOT/hooks/run-hook.cmd" "${1:-pre-tool-use-phase-gate}"; }
NE="$TMP/r-sem-plano"; mkrepo "$NE"
OUT=$(RH pre-tool-use-phase-gate "$(ev_mcp "$NE")")
case "$OUT" in *'"permissionDecision":"deny"'*) ;; *) echo "FAIL: run-hook.cmd sem evidência deveria negar: '$OUT'"; fail=1;; esac
OUT=$(RH pre-tool-use-phase-gate "$(ev_mcp "$R")")
[ -z "$OUT" ] || { echo "FAIL: run-hook.cmd com evidência deveria ficar calado: $OUT"; fail=1; }
OUT=$(RH pre-tool-use-phase-gate "$(ev_mcp "$TMP/r-sem")" || true)
[ -z "$OUT" ] || { echo "FAIL: run-hook.cmd sem workflow deveria ficar calado: $OUT"; fail=1; }
ln -s "$REPO_ROOT" "$TMP/plugin-link"
S="$TMP/s"; mkrepo "$S"
expect "$(dec_with "$TMP/plugin-link/hooks/pre-tool-use-phase-gate" "$(ev_mcp "$S")")" deny "plugin por symlink"
[ -x "$H" ] || { echo "FAIL: hook não executável"; fail=1; }

# --- 6: node ausente e evento acima do teto ---------------------------------------------------------
OUT=$(ev_mcp "$S" | env PATH="/nonexistent" /bin/bash "$H" || true)
[ -z "$OUT" ] || { echo "FAIL: sem node o hook deveria ficar calado: $OUT"; fail=1; }
BIG=$(python3 -c 'import json; print(json.dumps({"tool_name":"Bash","tool_input":{"command":"x"*1100000+" ; dotcontext workflow advance"},"cwd":"/tmp"}))')
expect "$(dec "$BIG")" deny "evento acima do teto com marcador"
BIGQ=$(python3 -c 'import json; print(json.dumps({"tool_name":"Bash","tool_input":{"command":"x"*1100000},"cwd":"/tmp"}))')
expect "$(dec "$BIGQ")" "" "evento acima do teto sem marcador"

# marcador atravessando a fronteira de 1 MiB (sobreposição de 64 bytes entre blocos)
CROSS=$(python3 - <<'PY'
import json
# "dotcontext" começa em 1048576-5 (cortado ao meio): o marcador atravessa o corte dos blocos de 1 MiB
head = '{"tool_name":"Bash","tool_input":{"command":"'
cmd = "x" * (1048576 - 5 - len(head)) + "dotcontext workflow advance" + "y" * 2000
ev = head + cmd + '"},"cwd":"/tmp"}'
assert ev.index("dotcontext") < 1048576 < ev.index("dotcontext") + len("dotcontext")
json.loads(ev)
print(ev)
PY
)
expect "$(dec "$CROSS")" deny "marcador cruzando a fronteira de 1 MiB"

# --- 7: custo do caminho rápido -------------------------------------------------------------------
EV=$(ev_bash "$R" 'ls -la')
START=$(date +%s%N)
for _ in $(seq 1 50); do printf '%s' "$EV" | bash "$H" >/dev/null; done
MS=$(( ($(date +%s%N) - START) / 1000000 ))
[ "$MS" -lt 5000 ] || { echo "FAIL: caminho rápido lento (${MS} ms para 50 eventos)"; fail=1; }

[ "$fail" -eq 0 ] && echo "OK test-pre-tool-use-phase-gate" || exit 1
