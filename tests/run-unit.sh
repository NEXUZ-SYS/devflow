#!/usr/bin/env bash
# Enumera testes unit (git ls-files + convenção), exclui integration/e2e. Reprodutível.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mapfile -t FILES < <(git ls-files -- '*.mjs' \
  | grep -E '(^|/)(test-[^/]*|[^/]*\.test)\.mjs$' \
  | grep -vE '^tests/(integration|e2e)/')
[ "${#FILES[@]}" -eq 0 ] && { echo "run-unit: nenhum arquivo"; exit 0; }
exec node --test "${FILES[@]}"
