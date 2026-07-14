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

echo "run-verify-runners: $PASS pass, $FAIL fail"
[ "$FAIL" -eq 0 ]
