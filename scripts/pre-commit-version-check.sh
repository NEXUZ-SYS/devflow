#!/usr/bin/env bash
# pre-commit-version-check.sh — VALIDA a consistência de versão (NÃO bumpa).
# Install: ln -sf ../../scripts/pre-commit-version-check.sh .git/hooks/pre-commit
#
# Desde a pipeline de versionamento controlada (release via GitHub Actions), o
# bump deixou de ser feito localmente a cada commit — era a causa do "pulo" de
# versão (ex.: 1.23.3 → 1.23.10 num único PR, ao acumular N auto-bumps; pior com
# múltiplos worktrees). Agora:
#   - O BUMP é feito UMA vez por release pela pipeline (.github/workflows/release.yml
#     → scripts/bump-version.sh → release PR).
#   - Este hook apenas VALIDA (via scripts/lib/version-guard.mjs): os 3 version
#     files devem concordar e a transição vs a base deve ser um único passo
#     válido (none/patch/minor/major). Pulo, salto ou regressão = commit barrado.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
GUARD="$REPO_ROOT/scripts/lib/version-guard.mjs"

# Sem o guard (deploy parcial) → não bloquear (fail-safe).
[ -f "$GUARD" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

# Detecta a base (default branch) para checar a transição.
base_branch() {
  local b
  b="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')"
  if [ -n "$b" ] && git rev-parse --verify -q "$b" >/dev/null 2>&1; then echo "$b"; return; fi
  local c
  for c in main master; do
    if git rev-parse --verify -q "$c" >/dev/null 2>&1; then echo "$c"; return; fi
  done
  echo ""
}

BASE_BRANCH="$(base_branch)"
BASE_REF=""
if [ -n "$BASE_BRANCH" ]; then
  BASE_REF="$(git merge-base HEAD "$BASE_BRANCH" 2>/dev/null || true)"
  [ -z "$BASE_REF" ] && BASE_REF="$BASE_BRANCH"
fi

if [ -n "$BASE_REF" ]; then
  node "$GUARD" --root "$REPO_ROOT" --base-ref "$BASE_REF" || exit 1
else
  node "$GUARD" --root "$REPO_ROOT" || exit 1
fi
