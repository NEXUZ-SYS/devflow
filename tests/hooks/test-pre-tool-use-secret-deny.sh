#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-secret-deny.sh
# ADV-7: pre-tool-use aplica o baseline default-deny de segredos MESMO sem
# permissions.yaml (evaluator sempre invocado). Read/Write de .env, *.pem, etc.
# → permissionDecision deny; arquivo comum → NÃO deny (comportamento preservado).
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$PROJECT_ROOT/hooks/pre-tool-use"

run_hook() {
  local cwd="$1" tool="$2" file="$3" input
  input=$(printf '{"tool_name":"%s","cwd":"%s","tool_input":{"file_path":"%s"}}' "$tool" "$cwd" "$file")
  ( cd "$cwd" && printf '%s' "$input" | "$HOOK" ) 2>&1 || true
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.context"                       # SEM permissions.yaml
( cd "$tmp" && git init -q 2>/dev/null || true )

out=$(run_hook "$tmp" "Read" ".env")
echo "$out" | grep -q '"permissionDecision": "deny"' || {
  echo "FALHA: Read de .env não foi negado sem permissions.yaml"; echo "$out"; exit 1; }

out=$(run_hook "$tmp" "Write" "config/secrets/db.pem")
echo "$out" | grep -q '"permissionDecision": "deny"' || {
  echo "FALHA: Write de *.pem sob secrets/ não foi negado"; echo "$out"; exit 1; }

# Arquivo comum: baseline não casa; Read não é Edit/Write → não deve negar.
out=$(run_hook "$tmp" "Read" "src/foo.ts")
if echo "$out" | grep -q '"permissionDecision": "deny"'; then
  echo "FALHA: arquivo comum src/foo.ts foi negado indevidamente"; echo "$out"; exit 1
fi

echo "OK test-pre-tool-use-secret-deny"
