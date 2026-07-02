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

# Corte do CHANGELOG (atômico com o bump): [Unreleased] -> [NEW_VERSION] + data,
# com um [Unreleased] novo e vazio no topo. Mantém version-files e CHANGELOG
# consistentes. Se o [Unreleased] estava vazio, o changelog-guard (via
# version-guard) falha o release PR — fail-loud, não publica release sem notas.
if [ -f "$REPO_ROOT/CHANGELOG.md" ] && [ -f "$REPO_ROOT/scripts/lib/changelog-cut.mjs" ]; then
  node "$REPO_ROOT/scripts/lib/changelog-cut.mjs" "$NEW_VERSION" --date "$(date -u +%F)" --file "$REPO_ROOT/CHANGELOG.md"
fi

# Atualiza o registry de hashes históricos com os artefatos da versão nova (provenance-sync).
if [ -f "$REPO_ROOT/scripts/lib/gen-known-hashes.mjs" ]; then
  node "$REPO_ROOT/scripts/lib/gen-known-hashes.mjs" --append || echo "WARN: falha ao atualizar known-hashes.json"
fi
