#!/usr/bin/env bash
# tests/hooks/test-post-tool-use-lint.sh — hook síncrono dos linters que podem bloquear (T14, D9).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
git -C "$TMP" init -q -b main
S="$TMP/.context/engineering/standards"; mkdir -p "$S/machine" "$TMP/src/deep"
node --input-type=module -e 'import("'"$REPO_ROOT"'/tests/helpers/standards-fixture.mjs").then(m=>m.isolateFromDefaults(process.argv[1]))' "$TMP"
std() { printf -- '---\nid: %s\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  linter: engineering/standards/machine/%s.js\n  level: %s\n---\n' "$1" "$1" "$2" > "$S/$1.md"; }
std std-demo block
cat > "$S/machine/std-demo.js" <<'EOF'
const c=require("fs").readFileSync(process.argv[2],"utf8");let h=0;c.split("\n").forEach((l,i)=>{if(l.includes("BAD")){h++;console.log("VIOLATION no-bad "+process.argv[2]+":"+(i+1)+" remova BAD")}});process.exit(h?1:0);
EOF
ev() { printf '{"tool_name":"Write","tool_input":{"file_path":"%s"},"cwd":"%s"}' "$1" "$2"; }
lint() { bash "$REPO_ROOT/hooks/post-tool-use-lint"; }
init_baseline() { (cd "$REPO_ROOT" && node --input-type=module -e 'import("./scripts/lib/standards-check-cli.mjs").then(async m=>process.exit(await m.runStandardsCommand("baseline",["init"],process.argv[1],{isInteractive:()=>true})))' "$TMP" >/dev/null); }

# 1) sem baseline: não bloqueia, avisa com o comando real
printf 'BAD\n' > "$TMP/src/a.js"
out=$(ev "$TMP/src/a.js" "$TMP" | lint)
printf '%s' "$out" | grep -q '"decision"' && { echo "FAIL: bloqueou sem baseline"; exit 1; }
printf '%s' "$out" | grep -q 'devflow-standards.mjs\\" baseline init\|devflow-standards.mjs baseline init' || { echo "FAIL: não sugeriu baseline init: $out"; exit 1; }

# 2) com baseline: violação nova bloqueia
(cd "$TMP" && git add -A); init_baseline
printf 'ok\nBAD\n' > "$TMP/src/b.js"
ev "$TMP/src/b.js" "$TMP" | lint | python3 -c '
import json,sys
d=json.loads(sys.stdin.read())
assert d["decision"]=="block" and "src/b.js:2" in d["reason"] and "no-bad" in d["reason"], d'

# 3) legado no baseline: silêncio
out=$(ev "$TMP/src/a.js" "$TMP" | lint); [ -z "$out" ] || { echo "FAIL: reclamou do legado: $out"; exit 1; }

# 4) cwd em subdiretório e caminho com .. continuam bloqueando
printf 'BAD\n' > "$TMP/src/c.js"
ev "$TMP/lib/../src/c.js" "$TMP/src/deep" | lint | grep -q '"decision": *"block"' || { echo "FAIL: cwd em subdiretório ou .. não bloqueou"; exit 1; }

# 5) fora de projeto e cwd vazio: nada
out=$(printf '{"tool_name":"Write","tool_input":{"file_path":"/tmp/x.js"},"cwd":""}' | (cd / && lint))
[ -z "$out" ] || { echo "FAIL: agiu fora de projeto: $out"; exit 1; }

# 6) std só warn: o síncrono nem roda o linter; o async roda
std std-demo warn
cat > "$S/machine/std-demo.js" <<EOF
require("fs").writeFileSync("$TMP/ran","1");process.exit(0);
EOF
ev "$TMP/src/a.js" "$TMP" | lint >/dev/null
[ ! -e "$TMP/ran" ] || { echo "FAIL: síncrono rodou linter de std warn"; exit 1; }
ev "$TMP/src/a.js" "$TMP" | DEVFLOW_PLUGIN_ROOT="$REPO_ROOT" node "$REPO_ROOT/scripts/lib/standards-hook-cli.mjs" --mode=async >/dev/null
[ -e "$TMP/ran" ] || { echo "FAIL: async não rodou o linter de std warn"; exit 1; }

# 7) baseline inválido: avisa, não bloqueia
std std-demo block
printf 'x' > "$S/baseline.json"
out=$(ev "$TMP/src/b.js" "$TMP" | lint)
printf '%s' "$out" | grep -q 'baseline inválido' || { echo "FAIL: não avisou baseline inválido: $out"; exit 1; }
printf '%s' "$out" | grep -q '"decision"' && { echo "FAIL: bloqueou com baseline inválido"; exit 1; }
rm "$S/baseline.json"

# 8) 20 linters travados terminam dentro do orçamento + 1s (C10: limite 2000ms)
for i in $(seq 1 20); do
  std "std-t$i" block
  printf 'setTimeout(()=>{},60000);\n' > "$S/machine/std-t$i.js"
done
start=$(date +%s%N)
out=$(ev "$TMP/src/a.js" "$TMP" | DEVFLOW_HOOK_BUDGET_MS=1000 lint)
ms=$(( ($(date +%s%N) - start) / 1000000 ))
[ "$ms" -lt 2000 ] || { echo "FAIL: levou ${ms}ms"; exit 1; }
printf '%s' "$out" | grep -q 'orçamento' || { echo "FAIL: não avisou o orçamento: $out"; exit 1; }
# 9) impressão digital do hook = a do CLI --all num clone em outro diretório (N1 da rodada 2)
for i in $(seq 1 20); do rm -f "$S/std-t$i.md" "$S/machine/std-t$i.js"; done
cat > "$S/machine/std-demo.js" <<'EOF'
const p=require("path").resolve(process.argv[2]);if(require("fs").readFileSync(p,"utf8").includes("BAD")){console.log("VIOLATION: 1 problema em "+p+".");process.exit(1)}
EOF
printf 'BAD\n' > "$TMP/src/fp.js"
rm -f "$S/baseline.json"
hook_fp=$(ev "$TMP/src/fp.js" "$TMP" | lint | python3 -c 'import json,sys,re; c=json.loads(sys.stdin.read())["hookSpecificOutput"]["additionalContext"]; print(re.search(r"problema em (\S+)\.", c).group(1))')
[ "$hook_fp" = "src/fp.js" ] || { echo "FAIL: mensagem do hook carrega o diretório: $hook_fp"; exit 1; }
(cd "$TMP" && git add -A && git -c user.email=t@t -c user.name=t commit -qm fp)
CL=$(mktemp -d); git clone -q "$TMP" "$CL/c"
# C9: o check sai com 1 (há violação block) — sob pipefail, o || true fica dentro do grupo.
a=$({ node "$REPO_ROOT/scripts/devflow-standards.mjs" check --all --json --project="$TMP" 2>/dev/null || true; } | head -1 | python3 -c 'import json,sys; print([f["fp"] for f in json.load(sys.stdin)["blocking"] if f["path"]=="src/fp.js"][0])')
b=$({ node "$REPO_ROOT/scripts/devflow-standards.mjs" check --all --json --project="$CL/c" 2>/dev/null || true; } | head -1 | python3 -c 'import json,sys; print([f["fp"] for f in json.load(sys.stdin)["blocking"] if f["path"]=="src/fp.js"][0])')
rm -rf "$CL"
[ "$a" = "$b" ] || { echo "FAIL: impressão digital varia por clone"; exit 1; }
echo "PASS: post-tool-use-lint (${ms}ms no caso travado)"
