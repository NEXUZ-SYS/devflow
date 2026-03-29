#!/usr/bin/env bash
# pre-commit-version-check.sh — Auto-bump patch version when plugin content changes
# Install: ln -sf ../../scripts/pre-commit-version-check.sh .git/hooks/pre-commit

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && git rev-parse --show-toplevel)"

# Directories that require a version bump when changed
WATCHED_DIRS="commands/ skills/ agents/ hooks/ templates/"

# Check if any staged file is in a watched directory
NEEDS_BUMP=false
for dir in $WATCHED_DIRS; do
  if git diff --cached --name-only | grep -q "^${dir}"; then
    NEEDS_BUMP=true
    break
  fi
done

if [[ "$NEEDS_BUMP" != "true" ]]; then
  exit 0
fi

# Check if version files are already staged (manual bump)
if git diff --cached --name-only | grep -q "\.claude-plugin/plugin.json"; then
  exit 0
fi

# Auto-bump patch version
echo "[devflow] Plugin content changed — auto-bumping patch version..."
"$REPO_ROOT/scripts/bump-version.sh" patch

# Stage the bumped files
git add "$REPO_ROOT/.claude-plugin/plugin.json" \
       "$REPO_ROOT/.claude-plugin/marketplace.json" \
       "$REPO_ROOT/.cursor-plugin/plugin.json"

echo "[devflow] Version bumped and staged."
