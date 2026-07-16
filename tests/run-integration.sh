#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mapfile -t FILES < <(git ls-files -- 'tests/integration/*.mjs' \
  | grep -E '(^|/)(test-[^/]*|[^/]*\.test)\.mjs$')
[ "${#FILES[@]}" -eq 0 ] && { echo "run-integration: nenhum arquivo"; exit 0; }
exec node --test "${FILES[@]}"
