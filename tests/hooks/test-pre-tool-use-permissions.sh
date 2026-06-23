#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-permissions.sh
# Verifies hooks/pre-tool-use applies .context/permissions.yaml deny-first
# before any other logic. Tests deny on .env*, allow fallthrough to branch
# protection, and no-config (empty permissions) preserves existing behavior.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/pre-tool-use"
TMP_ROOT="$PROJECT_ROOT/tests/validation/tmp"
mkdir -p "$TMP_ROOT"

run_hook() {
  local cwd="$1" tool="$2" file="$3"
  local input
  input=$(printf '{"tool_name":"%s","cwd":"%s","tool_input":{"file_path":"%s"}}' "$tool" "$cwd" "$file")
  ( cd "$cwd" && printf '%s' "$input" | "$HOOK" ) 2>&1 || true
}

# ─── Test 1: deny on .env* file ─────────────────────────────────────────────
TMP1=$(mktemp -d "$TMP_ROOT/perm-deny-XXXXXX")
trap "rm -rf $TMP1 \${TMP2:-} \${TMP3:-} \${TMP4:-}" EXIT

mkdir -p "$TMP1/.context"
cat > "$TMP1/.context/permissions.yaml" <<'EOF'
spec: devflow-permissions/v0
deny:
  fs:
    - "**/.env*"
allow:
  fs:
    write:
      - "**/*"
mode: accept
EOF

cd "$TMP1" && git init -q 2>/dev/null; cd - >/dev/null
out1=$(run_hook "$TMP1" "Write" ".env.production")
if ! echo "$out1" | grep -q '"permissionDecision": "deny"'; then
  echo "FAIL [test 1]: expected deny on .env.production"
  echo "Output: $out1"
  exit 1
fi
echo "PASS [test 1]: deny rule blocks .env.production"

# ─── Test 2: no permissions.yaml → existing behavior preserved ─────────────
TMP2=$(mktemp -d "$TMP_ROOT/perm-empty-XXXXXX")
mkdir -p "$TMP2/.context"
# No permissions.yaml — hook should fall through to legacy logic
cd "$TMP2" && git init -q 2>/dev/null; cd - >/dev/null

out2=$(run_hook "$TMP2" "Read" "src/foo.ts")
# For Read tool with no permissions.yaml, the hook should exit 0 (no output
# because Read isn't Edit/Write — legacy logic lets it through silently)
if echo "$out2" | grep -q '"permissionDecision": "deny"'; then
  echo "FAIL [test 2]: should not deny Read without permissions.yaml"
  echo "Output: $out2"
  exit 1
fi
echo "PASS [test 2]: no permissions.yaml preserves existing behavior"

# ─── Test 3: deny in permissions.yaml wins over allow in legacy/devflow.yaml ──
# Verifies deny-first ordering: even with .devflow.yaml configured (legacy
# branch-protection would allow), permissions.yaml deny still blocks.
TMP3=$(mktemp -d "$TMP_ROOT/perm-deny-overrides-XXXXXX")
mkdir -p "$TMP3/.context"
cat > "$TMP3/.context/permissions.yaml" <<'EOF'
spec: devflow-permissions/v0
deny:
  fs:
    - "src/secret.ts"
allow:
  fs:
    write: ["src/**"]
mode: accept
EOF
cat > "$TMP3/.context/.devflow.yaml" <<'EOF'
spec: devflow/v1
git:
  strategy: branch-flow
  protectedBranches: []
  branchProtection: false
EOF
cd "$TMP3" && git init -q 2>/dev/null && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init 2>/dev/null; cd - >/dev/null

out3=$(run_hook "$TMP3" "Write" "src/secret.ts")
if ! echo "$out3" | grep -q '"permissionDecision": "deny"'; then
  echo "FAIL [test 3]: deny rule should block src/secret.ts (deny precedes allow)"
  echo "Output: $out3"
  exit 1
fi
if ! echo "$out3" | grep -q "permissions.yaml"; then
  echo "FAIL [test 3]: deny reason should mention permissions.yaml source"
  echo "Output: $out3"
  exit 1
fi
echo "PASS [test 3]: deny in permissions.yaml takes precedence over allow"

# ─── Test 4: legacy permissions.yaml → actionable, JSON-parseable deny ──────
# GAP-PERM-ROOT/GAP-OBS-1: a legacy-format file (version:0, list deny/allow,
# mode:{default}) must fail-closed AND surface an actionable reason that points
# to migration — not the opaque "mode: deny". Output must be valid JSON.
TMP4=$(mktemp -d "$TMP_ROOT/perm-legacy-XXXXXX")
mkdir -p "$TMP4/.context"
cat > "$TMP4/.context/permissions.yaml" <<'EOF'
version: 0
deny:
  - path: "**/.env*"
allow:
  - path: "src/**"
mode:
  default: ask
EOF
cd "$TMP4" && git init -q 2>/dev/null; cd - >/dev/null

out4=$(run_hook "$TMP4" "Write" "src/foo.ts")

# 4a — output is valid JSON (multiline reason must be properly escaped)
if ! printf '%s' "$out4" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
  echo "FAIL [test 4a]: hook output is not valid JSON"
  echo "Output: $out4"
  exit 1
fi
echo "PASS [test 4a]: legacy config → hook emits valid JSON"

# 4b — decision is deny (fail-closed preserved)
if ! echo "$out4" | grep -q '"permissionDecision": "deny"'; then
  echo "FAIL [test 4b]: expected deny on legacy permissions.yaml"
  echo "Output: $out4"
  exit 1
fi
echo "PASS [test 4b]: legacy config fails closed (deny)"

# 4c — reason is actionable: mentions legacy/migration, not just "mode: deny"
reason4=$(printf '%s' "$out4" | python3 -c "import json,sys; print(json.load(sys.stdin)['hookSpecificOutput']['permissionDecisionReason'])" 2>/dev/null || echo "")
if ! printf '%s' "$reason4" | grep -qiE "legado|migre|devflow config|devflow init"; then
  echo "FAIL [test 4c]: deny reason is not actionable (no migration hint)"
  echo "Reason: $reason4"
  exit 1
fi
echo "PASS [test 4c]: legacy config → actionable deny reason ($(printf '%s' "$reason4" | head -1 | cut -c1-60)...)"

echo ""
echo "ALL PASS: pre-tool-use applies permissions.yaml deny-first"
