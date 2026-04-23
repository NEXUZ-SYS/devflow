#!/usr/bin/env bash
# Detect programming-language stacks from filesystem markers at the project root.
#
# Usage:
#   detect-project-stack.sh [project_root]
#
# Output: newline-separated stack names, sorted, de-duplicated.
#   Empty output means no stacks detected — the caller should then apply
#   a precaution policy (e.g., include all stack-specific ADRs).
#
# Exit code: always 0. Missing path or empty result is not an error.
#
# Scope: only programming languages (python, typescript, go, rust).
# Platform/tool stacks (aws, terraform) are matched by task mention, not
# filesystem detection — they do not appear in this output.

set -uo pipefail
project_root="${1:-$PWD}"

if [ ! -d "$project_root" ]; then
  exit 0
fi

declare -A found=()

# Python — any of pyproject.toml, requirements.txt, setup.py
if [ -f "${project_root}/pyproject.toml" ] \
   || [ -f "${project_root}/requirements.txt" ] \
   || [ -f "${project_root}/setup.py" ]; then
  found[python]=1
fi

# TypeScript/JavaScript — package.json (both normalize to 'typescript',
# matching the ADR stack convention used by .context/templates/adrs/)
if [ -f "${project_root}/package.json" ]; then
  found[typescript]=1
fi

# Go — go.mod
if [ -f "${project_root}/go.mod" ]; then
  found[go]=1
fi

# Rust — Cargo.toml
if [ -f "${project_root}/Cargo.toml" ]; then
  found[rust]=1
fi

# Emit sorted, deduplicated
for stack in "${!found[@]}"; do
  echo "$stack"
done | sort
