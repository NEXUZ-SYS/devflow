#!/usr/bin/env bash
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  PASS: $1"; PASS=$((PASS+1)); else echo "  FAIL: $1 (esperado $3, obtido $2)"; FAIL=$((FAIL+1)); fi; }

# run-unit sai 0 na suíte verde
bash "${REPO_ROOT}/tests/run-unit.sh" >/dev/null 2>&1
check "run-unit exit 0 (suíte verde)" "$?" "0"

# run-unit propaga falha quando um membro falha: sandbox com um teste vermelho plantado.
# git archive só traz arquivos rastreados — o run-unit.sh (ainda não commitado) é copiado
# do working tree; é ele que estamos testando.
SB=$(mktemp -d); trap 'rm -rf "$SB"' EXIT
git -C "$REPO_ROOT" archive HEAD | (mkdir -p "$SB" && tar -x -C "$SB")
cp "${REPO_ROOT}/tests/run-unit.sh" "$SB/tests/run-unit.sh"
mkdir -p "$SB/tests/lib"
printf "import{test}from'node:test';import a from'node:assert';test('x',()=>a.equal(1,2));\n" > "$SB/tests/lib/test-zzz-planted.mjs"
( cd "$SB" && git init -q -b main && git add -A && git -c user.email=t@t -c user.name=t commit -qm i ) >/dev/null 2>&1
( cd "$SB" && bash tests/run-unit.sh >/dev/null 2>&1 )
check "run-unit propaga vermelho" "$?" "1"

# SHOULD-FIX (code review V): a spec §11 promete que CADA runner propaga exit≠0.
# run-e2e e run-lint usam acumulação rc=1 (mais fácil de errar) — exercitá-los.

# run-e2e propaga quando um .sh membro falha (planta um test-*.sh vermelho)
SB2=$(mktemp -d); trap 'rm -rf "$SB" "$SB2" "$SB3"' EXIT
git -C "$REPO_ROOT" archive HEAD | (mkdir -p "$SB2" && tar -x -C "$SB2")
cp "${REPO_ROOT}"/tests/run-*.sh "$SB2/tests/"
printf '#!/usr/bin/env bash\nexit 1\n' > "$SB2/tests/test-zzz-planted.sh"
( cd "$SB2" && git init -q -b main && git add -A && git -c user.email=t@t -c user.name=t commit -qm i )
( cd "$SB2" && bash tests/run-e2e.sh >/dev/null 2>&1 )
check "run-e2e propaga vermelho" "$?" "1"

# run-lint propaga quando o verify: é inválido/inseguro (perna 3 do run-lint)
SB3=$(mktemp -d)
git -C "$REPO_ROOT" archive HEAD | (mkdir -p "$SB3" && tar -x -C "$SB3")
cp "${REPO_ROOT}"/tests/run-*.sh "$SB3/tests/"
mkdir -p "$SB3/.context"
printf 'git:\n  strategy: branch-flow\nverify:\n  unit: ["node","--eval","1"]\n' > "$SB3/.context/.devflow.yaml"
( cd "$SB3" && git init -q -b main && git add -A && git -c user.email=t@t -c user.name=t commit -qm i )
( cd "$SB3" && bash tests/run-lint.sh >/dev/null 2>&1 )
check "run-lint propaga vermelho (verify: inseguro)" "$?" "1"

echo "run-verify-runners: $PASS pass, $FAIL fail"
[ "$FAIL" -eq 0 ]
