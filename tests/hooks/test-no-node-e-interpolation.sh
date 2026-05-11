#!/usr/bin/env bash
# tests/hooks/test-no-node-e-interpolation.sh
# Security invariant SI-1 regression — fails CI if any hook/script/skill
# uses `node -e` with interpolated user-controlled variables.
#
# Rationale: a hook that does `node -e "...${event.path}..."` is vulnerable
# to command injection via crafted paths. All hook→node bridges MUST use
# execFile('node', ['scripts/lib/<lib>.mjs', ...]) with arguments arrays
# OR pipe a JSON envelope to stdin.

set -euo pipefail

OFFENDERS=$(grep -rEn 'node -e.*\$\{|node -e.*"\$' hooks/ scripts/ skills/ 2>/dev/null || true)

if [ -n "$OFFENDERS" ]; then
  echo "FAIL [SI-1]: node -e with interpolated variables found:"
  echo "$OFFENDERS"
  echo ""
  echo "Fix: use execFile('node', ['scripts/lib/<lib>.mjs', arg1, arg2])"
  echo "or pipe JSON to stdin instead of constructing a -e script string."
  exit 1
fi

echo "PASS [SI-1]: no unsafe node -e interpolations found"
