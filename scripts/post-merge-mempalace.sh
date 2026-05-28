#!/usr/bin/env bash
# devflow:mempalace-automine — git post-merge hook
#
# Keeps the project's MemPalace wing in sync with the integrated/canonical
# state: after a merge/pull that lands on a protected branch, it incrementally
# mines the repo and prunes orphan drawers — in the background, never blocking
# or failing the git operation.
#
# Opt-in: only runs when `.context/.devflow.yaml` has mempalace enabled and
# `mempalace.autoMine` is `post-merge` (the default) — set it to `off` to disable.
#
# Safety invariants:
#   - ALWAYS exits 0 (a hook failure must never break git pull/merge).
#   - No-op unless the current branch is a protected branch.
#   - No-op if the mempalace CLI is absent or autoMine is off.
#   - `wing` is validated against a safe charset and passed as a quoted
#     argument (never eval'd) — defends against injection via .devflow.yaml.

# Resolve repo root; bail safely if not in a work tree.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$ROOT" ] || exit 0

YAML="$ROOT/.context/.devflow.yaml"
[ -f "$YAML" ] || exit 0

# Current branch must be protected (default: main).
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
pb_line=$(grep -E '^[[:space:]]*protectedBranches:' "$YAML" | head -1)
protected=0
if [ -n "$pb_line" ]; then
  inside=$(printf '%s' "$pb_line" | sed -E 's/.*\[(.*)\].*/\1/')
  IFS=',' read -ra _pbs <<< "$inside"
  for b in "${_pbs[@]}"; do
    b=$(printf '%s' "$b" | xargs)
    [ "$b" = "$BRANCH" ] && protected=1
  done
else
  [ "$BRANCH" = "main" ] && protected=1
fi
[ "$protected" -eq 1 ] || exit 0

# mempalace CLI must be available.
command -v mempalace >/dev/null 2>&1 || exit 0

# Extract the mempalace block (lines under `mempalace:` until the next top-level key).
mp_block=$(awk '/^mempalace:/{f=1;next} /^[^[:space:]]/{f=0} f' "$YAML")
[ -n "$mp_block" ] || exit 0   # section absent => disabled

mp_get() {
  printf '%s\n' "$mp_block" \
    | grep -E "^[[:space:]]+$1:" | head -1 \
    | sed -E "s/^[[:space:]]*$1:[[:space:]]*//" \
    | sed -E 's/[[:space:]]*#.*$//' \
    | sed -E 's/[[:space:]]*$//' \
    | tr -d '"'\'
}

enabled=$(mp_get enabled)
[ "$enabled" = "false" ] && exit 0

automine=$(mp_get autoMine)
[ -z "$automine" ] && automine="post-merge"   # default
[ "$automine" = "post-merge" ] || exit 0

# Resolve wing: explicit name, or auto => repo basename.
wing=$(mp_get wing)
{ [ -z "$wing" ] || [ "$wing" = "auto" ]; } && wing=$(basename "$ROOT")
# Hard guard: only a safe charset may reach the shell command line.
printf '%s' "$wing" | grep -qE '^[A-Za-z0-9._-]+$' || exit 0

palace=$(mp_get palace)

LOG="$ROOT/.git/mempalace-automine.log"

# Detached, non-blocking. All output to the log; stdin from /dev/null so git
# never waits on an inherited descriptor.
if [ -n "$palace" ] && printf '%s' "$palace" | grep -qE '^[A-Za-z0-9._/~-]+$'; then
  {
    mempalace mine "$ROOT" --wing "$wing" --palace "$palace"
    mempalace sync --wing "$wing" --apply --palace "$palace"
  } >>"$LOG" 2>&1 </dev/null &
else
  {
    mempalace mine "$ROOT" --wing "$wing"
    mempalace sync --wing "$wing" --apply
  } >>"$LOG" 2>&1 </dev/null &
fi

exit 0
