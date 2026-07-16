#!/usr/bin/env bash
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WF="${REPO_ROOT}/.github/workflows/test.yml"
PASS=0; FAIL=0
has() { if grep -qF "$2" "$WF"; then echo "  PASS: $1"; PASS=$((PASS+1)); else echo "  FAIL: $1"; FAIL=$((FAIL+1)); fi; }

[ -f "$WF" ] || { echo "FAIL: test.yml ausente"; exit 1; }
if python3 -c "import yaml,sys; yaml.safe_load(open('$WF'))" 2>/dev/null; then echo "  PASS: YAML válido"; PASS=$((PASS+1)); else echo "  FAIL: YAML inválido"; FAIL=$((FAIL+1)); fi
has "roda em pull_request" "pull_request"
has "fetch-depth 0 (merge-base dos guards)" "fetch-depth: 0"
has "matriz dos 4 sinais" "[unit, integration, e2e, lint]"
has "usa o executor verify-run (que lê o .devflow.yaml → runners)" "verify-run.mjs"
has "passa BASE_REF aos guards" "BASE_REF"
has "permissões read-only (não pull_request_target)" "contents: read"
# V4: os guards devem rodar num passo DEDICADO, independente de verify.lint (que é editável no
# .devflow.yaml — repontar lint silenciaria os guards se eles só rodassem via run-lint.sh).
has "guard de enfraquecimento invocado direto no CI" "test-weakening-guard.mjs"
has "guard do contrato invocado direto no CI" "verify-contract-guard-cli.mjs"
echo "test-ci-workflow: $PASS pass, $FAIL fail"
[ "$FAIL" -eq 0 ]
