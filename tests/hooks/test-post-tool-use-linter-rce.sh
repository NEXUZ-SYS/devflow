#!/usr/bin/env bash
# tests/hooks/test-post-tool-use-linter-rce.sh
# Verifies SI-4: poisoned linter paths are rejected, NOT executed.
# Tests 3 attack vectors: path traversal, absolute path, shell metacharacters.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/post-tool-use"
TMP_ROOT="$PROJECT_ROOT/tests/validation/tmp"
mkdir -p "$TMP_ROOT"

ADR_FRONTMATTER='---
id: std-poison
description: Poisoned linter test
version: 1.0.0
applyTo: ["**/*.ts"]
enforcement:
  linter: LINTER_PATH
---

# poison
'

run_hook() {
  local cwd="$1" tool_input="$2"
  local input
  input=$(printf '{"tool_name":"Edit","tool_input":%s}' "$tool_input")
  ( cd "$cwd" && printf '%s' "$input" | "$HOOK" ) 2>&1
}

# Mark the file system to prove no execution happened
CANARY_FILE="/tmp/devflow-rce-canary-$$"

# ─── Test 1: path traversal ─────────────────────────────────────────────────
TMP1=$(mktemp -d "$TMP_ROOT/rce-traverse-XXXXXX")
trap "rm -rf $TMP1 \${TMP2:-} \${TMP3:-} $CANARY_FILE 2>/dev/null || true" EXIT
mkdir -p "$TMP1/.context/standards/machine"
# Write the standard that points outside machine/
echo "${ADR_FRONTMATTER//LINTER_PATH/../../../tmp/evil.sh}" > "$TMP1/.context/standards/std-poison.md"
# Plant a "would-have-been-executed" canary outside; if linter ran, it would touch CANARY_FILE
cat > /tmp/evil.sh <<EOF
#!/usr/bin/env bash
touch "$CANARY_FILE"
EOF
chmod +x /tmp/evil.sh

# Run hook simulating Edit on a .ts file
out1=$(run_hook "$TMP1" '{"file_path":"src/foo.ts"}')

# Verify linter was NOT executed (canary doesn't exist)
if [ -f "$CANARY_FILE" ]; then
  echo "FAIL [test 1]: poisoned linter EXECUTED (path traversal succeeded)"
  exit 1
fi
# Verify hook returned successfully (didn't crash)
if [ -z "$out1" ]; then
  echo "FAIL [test 1]: hook returned empty output"
  exit 1
fi
rm -f /tmp/evil.sh
echo "PASS [test 1]: path traversal linter rejected"

# ─── Test 2: absolute path ──────────────────────────────────────────────────
TMP2=$(mktemp -d "$TMP_ROOT/rce-abs-XXXXXX")
mkdir -p "$TMP2/.context/standards/machine"
echo "${ADR_FRONTMATTER//LINTER_PATH//etc/passwd}" > "$TMP2/.context/standards/std-poison.md"

out2=$(run_hook "$TMP2" '{"file_path":"src/foo.ts"}')
if [ -f "$CANARY_FILE" ]; then
  echo "FAIL [test 2]: absolute-path linter EXECUTED"
  exit 1
fi
echo "PASS [test 2]: absolute path linter rejected"

# ─── Test 3: shell metacharacters ───────────────────────────────────────────
TMP3=$(mktemp -d "$TMP_ROOT/rce-shell-XXXXXX")
mkdir -p "$TMP3/.context/standards/machine"
# Quoted because YAML — but pattern with semicolon
poisoned='"foo.js; touch '"$CANARY_FILE"'"'
echo "${ADR_FRONTMATTER//LINTER_PATH/$poisoned}" > "$TMP3/.context/standards/std-poison.md"

out3=$(run_hook "$TMP3" '{"file_path":"src/foo.ts"}')
if [ -f "$CANARY_FILE" ]; then
  echo "FAIL [test 3]: shell-metachar linter EXECUTED"
  exit 1
fi
echo "PASS [test 3]: shell metacharacter linter rejected"

echo ""
echo "ALL PASS: SI-4 rejects 3 poisoned linter vectors"
