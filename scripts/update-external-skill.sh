#!/usr/bin/env bash
# Update an externally-sourced skill by fetching raw files from a base URL.
#
# Usage:
#   update-external-skill.sh <skill_name> <base_url> <file1> [<file2> ...]
#
# Behavior:
#   - No-op (exit 0) if the skill directory does not exist locally.
#   - Atomic: all files are fetched to .new siblings first; only if every
#     fetch succeeds are they moved into place.
#   - Silent on failure: network/URL errors emit a warning on stderr but
#     the script exits 0 so that an orchestrating update pipeline is not
#     interrupted by a single skill's fetch failure.
#   - Unrelated files in the skill directory are left untouched.
#
# Env:
#   EXTERNAL_SKILLS_DIR  Override the root skills dir (default: ~/.claude/skills)
#                        Primarily used by tests.

set -uo pipefail

skill_name="${1:-}"
base_url="${2:-}"
shift 2 || true
files=("$@")

if [ -z "$skill_name" ] || [ -z "$base_url" ] || [ ${#files[@]} -eq 0 ]; then
  echo "usage: update-external-skill.sh <skill> <base_url> <file1> [<file2> ...]" >&2
  exit 2
fi

skills_root="${EXTERNAL_SKILLS_DIR:-${HOME}/.claude/skills}"
skill_dir="${skills_root}/${skill_name}"

# No-op if skill not installed locally — updates never auto-install
if [ ! -d "$skill_dir" ]; then
  exit 0
fi

cleanup_new_files() {
  for f in "${files[@]}"; do
    rm -f "${skill_dir}/${f}.new"
  done
}

# Fetch all files to .new siblings. Abort on first failure.
fetch_failed=""
for f in "${files[@]}"; do
  url="${base_url}/${f}"
  target="${skill_dir}/${f}.new"
  if ! curl -fsSL "$url" -o "$target" 2>/dev/null; then
    fetch_failed="$f"
    break
  fi
done

if [ -n "$fetch_failed" ]; then
  echo "warning: failed to fetch ${fetch_failed} from ${base_url}; ${skill_name} skill not updated" >&2
  cleanup_new_files
  exit 0
fi

# All fetched successfully — promote .new files atomically
for f in "${files[@]}"; do
  mv "${skill_dir}/${f}.new" "${skill_dir}/${f}"
done

exit 0
