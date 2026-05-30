#!/usr/bin/env bash
# Test: pre-tool-use hook injects on-demand knowledge bodies (Stage-2).
#
# Contract confirmed by reading hooks/pre-tool-use:
#   - Event arrives via stdin as JSON
#   - tool_name: "Edit" | "Write"
#   - tool_input.file_path: the file being edited
#   - cwd: project root
#
# The hook only acts on Edit/Write; cwd must point to a dir with
# .context/.devflow.yaml so branch-protection logic doesn't deny/block first.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT

# --- Scaffold a minimal project so the hook doesn't deny due to missing config ---
mkdir -p "$TMP/.context/engineering" "$TMP/src"

# Minimal .devflow.yaml with trunk-based (no branch protection) so the hook
# passes through to knowledge injection without blocking on branch checks.
cat > "$TMP/.context/.devflow.yaml" <<'YAML'
git:
  strategy: trunk-based
YAML

# Create an on-demand knowledge doc in the engineering layer.
cat > "$TMP/.context/engineering/architecture-overview.md" <<'EOF'
---
type: knowledge
layer: engineering
name: architecture-overview
description: como o sistema se organiza
activation: on-demand
owner: engineering-context
version: 1.0.0
---
Usamos arquitetura hexagonal com adapters na borda.
EOF

# Create source file being edited.
printf 'export const x = 1;\n' > "$TMP/src/foo.ts"

# --- Build the event JSON ---
# The hook reads stdin as JSON with tool_name, tool_input.file_path, and cwd.
event=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s/src/foo.ts"},"cwd":"%s"}' "$TMP" "$TMP")

# --- Run the hook ---
out=$(cd "$TMP" && printf '%s' "$event" | bash "$REPO_ROOT/hooks/pre-tool-use" 2>&1 || true)

# --- Assert knowledge body was injected ---
if printf '%s' "$out" | grep -q "arquitetura hexagonal"; then
  echo "PASS: corpo knowledge on-demand injetado"
else
  echo "FAIL: corpo knowledge on-demand não injetado"
  echo "--- hook output ---"
  printf '%s\n' "$out"
  exit 1
fi
