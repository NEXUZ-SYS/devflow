#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mapfile -t FILES < <(git ls-files -- 'tests/integration/*.mjs' \
  | grep -E '(^|/)(test-[^/]*|[^/]*\.test)\.mjs$')
[ "${#FILES[@]}" -eq 0 ] && { echo "run-integration: nenhum arquivo"; exit 0; }
node --test "${FILES[@]}"
if command -v claude >/dev/null 2>&1; then
  claude plugin test .
else
  echo "run-integration: claude ausente — testes do mod (hooks/router.test.ts) NÃO rodaram" >&2
fi
