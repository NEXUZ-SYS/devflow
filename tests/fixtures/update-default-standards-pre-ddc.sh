#!/usr/bin/env bash
# Refresh the vendored assets/standards/*.md snapshot from the standalone
# standards repo over HTTPS.
#
# Usage (production — no arguments needed):
#   bash scripts/update-default-standards.sh
#
# Usage (from /devflow update Step 4d):
#   bash "${CLAUDE_PLUGIN_ROOT}/scripts/update-default-standards.sh"
#
# Usage (tests — internal override):
#   bash scripts/update-default-standards.sh --standards-dir <path>
#   DEVFLOW_STANDARDS_BASE_TEST="file:///..." bash scripts/update-default-standards.sh --standards-dir <path>
#
# Security revisions implemented:
#
#   R3 — Guarded fetch + hardcoded host:
#     Base URL is the HARDCODED constant below. DEVFLOW_STANDARDS_BASE_TEST
#     is a test-only seam (documented as such) — it is NEVER read in
#     production and is intentionally ignored when unset.
#     Before fetching any std file, a HEAD request is sent to
#     <base>/MANIFEST.txt. If it fails (404 / network error), the script
#     prints exactly one stderr line and exits 0 (clean no-op, bundled
#     snapshot preserved).
#
#   R4 — MANIFEST line validation (anti path-traversal / supply-chain):
#     The LOCAL assets/standards/MANIFEST.txt is the trusted source for the
#     file list (the remote content is NOT trusted). Each entry is validated
#     against ^std-[a-z][a-z0-9-]+\.md$. Any entry that does not match is
#     skipped with a warning on stderr. The write target is built as
#     <standards_dir>/$(basename "$entry") using ONLY the validated basename
#     — raw MANIFEST lines are NEVER interpolated into paths.
#
#   R6 — SI-6 sanitization of fetched bodies:
#     sanitize-snippet.mjs is a module-only export (no CLI entrypoint).
#     Sanitization is therefore implemented inline in shell using grep -vE
#     with the same patterns as the module: role markers
#     (^\s*(SYSTEM|ASSISTANT|USER|HUMAN)\s*:) and the ignore-instructions
#     phrase (ignore (the )?(previous|above|all) (instructions|context|rules)).
#     The stripped body is written atomically (temp file + mv).
#
# Atomic write per file: each file is written to a .new sibling first;
# on success it is promoted via mv. On any network error the .new file is
# cleaned up and the existing snapshot is left untouched.
#
# Offline / repo-not-live: always a clean no-op (exit 0).

set -uo pipefail

# ─── Hardcoded base URL (R3) ─────────────────────────────────────────────────
# This is the ONLY authoritative source. No env var or arg can override it
# in production. DEVFLOW_STANDARDS_BASE_TEST is ONLY for the test suite
# (documented above). In CI/production this var is never set.
readonly PROD_BASE="https://raw.githubusercontent.com/NEXUZ-SYS/devflow-standards/main"

# Test seam: if DEVFLOW_STANDARDS_BASE_TEST is set, use it instead of PROD_BASE.
# This variable is NEVER documented for end-users and must ONLY appear in the
# test harness. Normal runs of this script will never have it set.
if [ -n "${DEVFLOW_STANDARDS_BASE_TEST:-}" ]; then
  BASE_URL="${DEVFLOW_STANDARDS_BASE_TEST}"
else
  BASE_URL="${PROD_BASE}"
fi

# ─── Argument parsing ────────────────────────────────────────────────────────
# --standards-dir <path>   override the standards directory (tests only)

STANDARDS_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --standards-dir)
      STANDARDS_DIR="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Resolve default: detect plugin root or fall back relative to script location
if [ -z "$STANDARDS_DIR" ]; then
  SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # If running from within the plugin, SCRIPT_PATH is <plugin>/scripts/
  PLUGIN_ROOT="$(cd "${SCRIPT_PATH}/.." && pwd)"
  STANDARDS_DIR="${PLUGIN_ROOT}/assets/standards"
fi

# ─── R3: HEAD guard on MANIFEST.txt ─────────────────────────────────────────
# Send a HEAD request only. If it fails (any non-2xx, network error, timeout),
# emit exactly one stderr line and exit 0 — never attempt per-file fetches.

manifest_head_url="${BASE_URL}/MANIFEST.txt"
if ! curl -fsSI "$manifest_head_url" -o /dev/null 2>/dev/null; then
  echo "[devflow] standards repo not yet live — using bundled snapshot" >&2
  exit 0
fi

# ─── R4: Read and validate the LOCAL MANIFEST (trusted source) ───────────────
# The local manifest is the authority on which files to fetch. Remote manifest
# is never used for the file list.

local_manifest="${STANDARDS_DIR}/MANIFEST.txt"
if [ ! -f "$local_manifest" ]; then
  echo "[devflow] no local MANIFEST.txt found at ${local_manifest} — nothing to update" >&2
  exit 0
fi

# Valid entry pattern: std-<letter><alnum/hyphen>.md  (no traversal, no subdirs)
ENTRY_RE='^std-[a-z][a-z0-9-]+\.md$'

# ─── Fetch + sanitize + atomic-write each file ───────────────────────────────
#
# R6 inline sanitization patterns (matches sanitize-snippet.mjs):
#   ROLE_MARKER:        ^\s*(SYSTEM|ASSISTANT|USER|HUMAN)\s*:
#   IGNORE_INSTR:       ignore (the )?(previous|above|all) (instructions|context|rules)
#                       (case-insensitive)
#
# sanitize-snippet.mjs is a module-only export with no CLI entrypoint,
# so we implement the strip inline here using grep -vE (two passes).

SANITIZE_ROLE='^\s*(SYSTEM|ASSISTANT|USER|HUMAN)\s*:'
SANITIZE_IGNORE='ignore (the )?(previous|above|all) (instructions|context|rules)'

any_failed=0

while IFS= read -r raw_entry || [ -n "$raw_entry" ]; do
  # Strip leading/trailing whitespace
  entry="${raw_entry#"${raw_entry%%[![:space:]]*}"}"
  entry="${entry%"${entry##*[![:space:]]}"}"

  # Skip blank lines and comments
  [ -z "$entry" ] && continue
  [[ "$entry" == \#* ]] && continue

  # R4: validate against allowlist pattern (anti path-traversal)
  if ! echo "$entry" | grep -qE "$ENTRY_RE"; then
    echo "[devflow] MANIFEST entry rejected (invalid name): ${entry}" >&2
    continue
  fi

  # R4: build paths using ONLY the validated basename — never the raw line
  safe_name="$(basename "$entry")"
  fetch_url="${BASE_URL}/${safe_name}"
  target="${STANDARDS_DIR}/${safe_name}"
  tmp_target="${target}.new"

  # Fetch to a temp file
  if ! curl -fsSL "$fetch_url" -o "$tmp_target" 2>/dev/null; then
    echo "[devflow] warning: failed to fetch ${safe_name} — skipping" >&2
    rm -f "$tmp_target"
    any_failed=1
    continue
  fi

  # R6: sanitize in-place (pipe through grep -vE, write sanitized version)
  sanitized="${tmp_target}.sanitized"
  grep -vEi "$SANITIZE_ROLE" "$tmp_target" \
    | grep -vEi "$SANITIZE_IGNORE" \
    > "$sanitized" 2>/dev/null || true
  mv "$sanitized" "$tmp_target"

  # Atomic promotion
  mv "$tmp_target" "$target"

done < "$local_manifest"

# Suppress the any_failed variable usage warning; exit 0 regardless
# (fail-safe: partial fetches still exit 0 to not break the update pipeline)
: "${any_failed}"
exit 0
