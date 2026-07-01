#!/usr/bin/env bash
# Tests for the pre-commit version VALIDATION hook (scripts/pre-commit-version-check.sh).
# Run: bash tests/hooks/test-pre-commit-version-check.sh
#
# Comportamento novo (pipeline de versionamento controlada): o hook NÃO bumpa —
# o bump é feito uma vez por release pela GitHub Action. O hook só VALIDA:
#   - commit normal de feature não altera a versão (sem auto-bump);
#   - version files inconsistentes entre si → commit barrado;
#   - pulo/salto de versão (ex.: base+5) → commit barrado;
#   - um bump manual válido (base+1) → permitido.
#
# Segurança: repos git temporários descartáveis; .git real intocado.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOK_SCRIPT="${PROJECT_ROOT}/scripts/pre-commit-version-check.sh"
GUARD="${PROJECT_ROOT}/scripts/lib/version-guard.mjs"

TESTS_PASSED=0; TESTS_FAILED=0; TESTS_TOTAL=0
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if [ "$expected" = "$actual" ]; then echo -e "  ${GREEN}OK${NC} $desc"; TESTS_PASSED=$((TESTS_PASSED + 1));
  else echo -e "  ${RED}XX${NC} $desc"; echo "    Expected: $expected"; echo "    Got:      $actual"; TESTS_FAILED=$((TESTS_FAILED + 1)); fi
}

REPOS=()
cleanup() { for r in "${REPOS[@]:-}"; do [ -n "$r" ] && rm -rf "$r"; done; }
trap cleanup EXIT

ver() { grep -oE '"version": "[0-9]+\.[0-9]+\.[0-9]+"' "$1/.claude-plugin/plugin.json" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'; }

set_all() {
  local r="$1" v="$2"
  mkdir -p "$r/.claude-plugin" "$r/.cursor-plugin"
  printf '{\n  "name": "devflow",\n  "version": "%s"\n}\n' "$v" > "$r/.claude-plugin/plugin.json"
  printf '{\n  "plugins": [\n    {\n      "name": "devflow",\n      "version": "%s"\n    }\n  ]\n}\n' "$v" > "$r/.claude-plugin/marketplace.json"
  printf '{\n  "version": "%s"\n}\n' "$v" > "$r/.cursor-plugin/plugin.json"
}

setup_repo() {
  local v="$1"; local r; r="$(mktemp -d)"; REPOS+=("$r")
  git -c init.defaultBranch=main init -q "$r"
  git -C "$r" config user.email "t@t.t"; git -C "$r" config user.name "t"
  mkdir -p "$r/scripts/lib" "$r/skills"
  cp "$HOOK_SCRIPT" "$r/scripts/pre-commit-version-check.sh"
  cp "$GUARD" "$r/scripts/lib/version-guard.mjs"
  set_all "$r" "$v"; echo "seed" > "$r/skills/seed.md"
  git -C "$r" add -A; git -C "$r" commit -qm "init"
  ln -sf "../../scripts/pre-commit-version-check.sh" "$r/.git/hooks/pre-commit"
  echo "$r"
}

# tenta commitar; ecoa "ok" se commitou, "blocked" se o hook barrou
try_commit() { if git -C "$1" commit -qm "$2" >/dev/null 2>&1; then echo "ok"; else echo "blocked"; fi; }

echo "== pre-commit-version-check: VALIDA (não bumpa) =="

# --- Fluxo válido: feature não bumpa, e bump manual válido passa ---
W="$(setup_repo "1.0.0")"; git -C "$W" checkout -q -b feature/x
printf 'a\n' > "$W/skills/a.md"; git -C "$W" add -A
assert_eq "commit de feature tocando skills/ é permitido" "ok" "$(try_commit "$W" "feat: a")"
assert_eq "...e NÃO bumpa a versão (segue 1.0.0)" "1.0.0" "$(ver "$W")"

printf 'b\n' > "$W/skills/b.md"; git -C "$W" add -A
try_commit "$W" "feat: b" >/dev/null
assert_eq "2º commit também não bumpa (segue 1.0.0)" "1.0.0" "$(ver "$W")"

set_all "$W" "1.0.1"; printf 'c\n' > "$W/skills/c.md"; git -C "$W" add -A
assert_eq "bump manual válido (1.0.0→1.0.1, 3 files) é permitido" "ok" "$(try_commit "$W" "chore: bump patch")"
assert_eq "...versão agora 1.0.1" "1.0.1" "$(ver "$W")"

# --- Inconsistência entre os 3 files → barrado ---
W2="$(setup_repo "2.0.0")"; git -C "$W2" checkout -q -b feature/incons
printf '{\n  "version": "2.0.1"\n}\n' > "$W2/.cursor-plugin/plugin.json"  # só 1 file diverge
printf 'x\n' > "$W2/skills/x.md"; git -C "$W2" add -A
assert_eq "version files inconsistentes entre si → commit barrado" "blocked" "$(try_commit "$W2" "broken")"

# --- Pulo de versão (base+5) → barrado ---
W3="$(setup_repo "3.0.0")"; git -C "$W3" checkout -q -b feature/jump
set_all "$W3" "3.0.5"; printf 'y\n' > "$W3/skills/y.md"; git -C "$W3" add -A
assert_eq "pulo de versão (3.0.0→3.0.5) → commit barrado" "blocked" "$(try_commit "$W3" "jump")"

# --- Regressão/downgrade → barrado ---
W4="$(setup_repo "4.2.0")"; git -C "$W4" checkout -q -b feature/down
set_all "$W4" "4.1.0"; printf 'z\n' > "$W4/skills/z.md"; git -C "$W4" add -A
assert_eq "regressão (4.2.0→4.1.0) → commit barrado" "blocked" "$(try_commit "$W4" "down")"

echo ""
echo "Total: $TESTS_TOTAL | Passed: $TESTS_PASSED | Failed: $TESTS_FAILED"
[ "$TESTS_FAILED" -eq 0 ]
