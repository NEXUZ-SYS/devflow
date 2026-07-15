#!/usr/bin/env bash
# Garante que o doc de testing-strategy reflete o framework real (node:test + verify:),
# não a afirmação obsoleta de que não há framework de testes.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOC="${REPO_ROOT}/.context/docs/testing-strategy.md"
PASS=0; FAIL=0

if grep -q "verify-run.mjs" "$DOC"; then echo "  PASS: menciona verify-run.mjs"; PASS=$((PASS+1)); else echo "  FAIL: não menciona verify-run.mjs"; FAIL=$((FAIL+1)); fi
if grep -q "node:test" "$DOC"; then echo "  PASS: menciona node:test"; PASS=$((PASS+1)); else echo "  FAIL: não menciona node:test"; FAIL=$((FAIL+1)); fi
if grep -qi "no traditional unit test framework" "$DOC"; then echo "  FAIL: ainda contém a afirmação obsoleta"; FAIL=$((FAIL+1)); else echo "  PASS: sem a afirmação obsoleta"; PASS=$((PASS+1)); fi

echo "test-testing-strategy-doc: $PASS pass, $FAIL fail"
[ "$FAIL" -eq 0 ]
