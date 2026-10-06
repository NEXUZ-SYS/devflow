#!/usr/bin/env bash
# tests/hooks/test-subagent-start.sh — SubagentStart entrega as normas ao subagente (T11).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/.context/engineering/standards"
printf -- '---\nid: std-b\nsource: local\ndescription: d\napplyTo: ["src/**"]\n---\n## Princípios\n- dura\n' > "$TMP/.context/engineering/standards/std-b.md"
out=$(printf '{"cwd":"%s","agent_type":"backend-specialist","agent_id":"a1","session_id":"s1"}' "$TMP" | bash "$REPO_ROOT/hooks/subagent-start")
printf '%s' "$out" | python3 -c '
import json,sys
d=json.loads(sys.stdin.read())["hookSpecificOutput"]
assert d["hookEventName"]=="SubagentStart" and "std-b (block)" in d["additionalContext"]
assert len(d["additionalContext"]) <= 10000'
out=$(printf '{"cwd":"/","agent_type":"x"}' | bash "$REPO_ROOT/hooks/subagent-start")
[ -z "$out" ] || { echo "FAIL: fora de projeto emitiu contexto"; exit 1; }
echo "PASS: subagente recebe as normas; fora de projeto, nada"
