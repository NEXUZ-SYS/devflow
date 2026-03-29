#!/usr/bin/env bash
# bump-version.sh — Bump plugin version across all manifest files
# Usage: ./scripts/bump-version.sh [patch|minor|major]
#        Default: patch

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

FILES=(
  "$REPO_ROOT/.claude-plugin/plugin.json"
  "$REPO_ROOT/.claude-plugin/marketplace.json"
  "$REPO_ROOT/.cursor-plugin/plugin.json"
)

BUMP_TYPE="${1:-patch}"

# Extract current version from plugin.json (source of truth)
CURRENT=$(grep -oP '"version"\s*:\s*"\K[0-9]+\.[0-9]+\.[0-9]+' "$REPO_ROOT/.claude-plugin/plugin.json" | head -1)

if [[ -z "$CURRENT" ]]; then
  echo "ERROR: Could not read current version from .claude-plugin/plugin.json"
  exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *)
    echo "Usage: $0 [patch|minor|major]"
    exit 1
    ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"

for file in "${FILES[@]}"; do
  if [[ -f "$file" ]]; then
    sed -i "s/\"version\": \"[0-9]*\.[0-9]*\.[0-9]*\"/\"version\": \"$NEW_VERSION\"/" "$file"
    echo "  $file -> $NEW_VERSION"
  fi
done

echo ""
echo "Bumped: $CURRENT -> $NEW_VERSION ($BUMP_TYPE)"
