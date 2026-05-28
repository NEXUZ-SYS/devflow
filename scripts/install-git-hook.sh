#!/usr/bin/env bash
# install-git-hook.sh — install the DevFlow mempalace post-merge hook into a repo.
#
# Usage: install-git-hook.sh <target-repo-root> [<source-hook-script>]
#   <source-hook-script> defaults to scripts/post-merge-mempalace.sh next to this file.
#
# Behavior:
#   - No existing post-merge hook        -> install (copy + chmod +x).
#   - Existing hook with our marker      -> overwrite (idempotent).
#   - Existing FOREIGN post-merge hook   -> never clobber; warn + manual steps, exit 1.

set -euo pipefail

MARKER="devflow:mempalace-automine"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

TARGET="${1:-}"
SOURCE="${2:-$SCRIPT_DIR/post-merge-mempalace.sh}"

if [ -z "$TARGET" ]; then
  echo "Usage: install-git-hook.sh <target-repo-root> [<source-hook-script>]" >&2
  exit 2
fi
if [ ! -f "$SOURCE" ]; then
  echo "Source hook script not found: $SOURCE" >&2
  exit 2
fi

# Resolve the repo's hooks dir (handles non-default git-dir / worktrees).
gitdir=$(git -C "$TARGET" rev-parse --git-dir 2>/dev/null) || {
  echo "Not a git repository: $TARGET" >&2
  exit 1
}
case "$gitdir" in
  /*) ;;
  *) gitdir="$TARGET/$gitdir" ;;
esac
hooks_dir="$gitdir/hooks"
mkdir -p "$hooks_dir"
dest="$hooks_dir/post-merge"

if [ -f "$dest" ] && ! grep -q "$MARKER" "$dest" 2>/dev/null; then
  echo "⚠️  An existing (non-DevFlow) post-merge hook is present: $dest" >&2
  echo "    Not overwriting. To chain the auto-mine, append this line to it:" >&2
  echo "      \"$SOURCE\" \"\$@\"" >&2
  exit 1
fi

cp "$SOURCE" "$dest"
chmod +x "$dest"
echo "✓ Installed DevFlow mempalace post-merge hook: $dest"
