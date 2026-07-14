#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SKIP_FILE="tests/.ci-skip.txt"
is_skipped() { [ -f "$SKIP_FILE" ] && grep -qxF "$1" "$SKIP_FILE"; }

rc=0
# 1) e2e .mjs
mapfile -t MJS < <(git ls-files -- 'tests/e2e/*.mjs' | grep -E '(^|/)(test-[^/]*|[^/]*\.test)\.mjs$')
if [ "${#MJS[@]}" -gt 0 ]; then node --test "${MJS[@]}" || rc=1; fi
# 2) todos os test-*.sh / e2e-*.sh (raiz + aninhados; exceto o próprio runner e os skipados)
while IFS= read -r sh; do
  case "$sh" in tests/run-*.sh) continue;; esac
  if is_skipped "$sh"; then echo "SKIP (ci-skip): $sh"; continue; fi
  echo "→ $sh"; bash "$sh" || rc=1
done < <(git ls-files -- 'tests/test-*.sh' 'tests/**/test-*.sh' 'tests/**/e2e-*.sh' | grep -vE '^tests/fixtures/' | sort -u)
exit "$rc"
