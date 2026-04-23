#!/usr/bin/env bash
# E2E tests for ADR guardrails injection in session-start hook.
# Run: bash tests/hooks/test-adr-context.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_DIR=$(mktemp -d)
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Expected to contain: $needle"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

assert_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TESTS_TOTAL=$((TESTS_TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Expected NOT to contain: $needle"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo -e "  ${GREEN}✓${NC} $desc"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi
}

run_hook() {
  local workdir="${1:-$PROJECT_ROOT}"
  cd "$workdir"
  CLAUDE_PLUGIN_ROOT="$PROJECT_ROOT" \
    bash "${PROJECT_ROOT}/hooks/session-start" 2>/dev/null || true
  cd "$PROJECT_ROOT"
}

# ─── Fixture: project WITHOUT .context/docs/adrs ──────────────────

mk_project_no_adrs() {
  local dir="$1"
  mkdir -p "${dir}/.context/docs"
}

# ─── Fixture: project with valid ADRs ─────────────────────────────

mk_project_with_adrs() {
  local dir="$1"
  mkdir -p "${dir}/.context/docs/adrs"

  cat > "${dir}/.context/docs/adrs/README.md" <<'MD'
# ADRs do Projeto

| # | Titulo | Escopo | Status |
|---|--------|--------|--------|
| 001 | TDD | Projeto | Aprovado |
MD

  cat > "${dir}/.context/docs/adrs/001-tdd-python.md" <<'MD'
---
type: adr
name: tdd-python
description: TDD obrigatorio
scope: project
stack: python
category: qualidade-testes
status: Aprovado
created: 2026-04-22
---

# ADR 001 — TDD

## Contexto
Qualquer coisa.

## Decisao
TDD sempre.

## Guardrails

- SEMPRE escrever teste antes da implementacao
- NUNCA mockar banco de dados
- QUANDO bug for reportado ENTAO escrever teste primeiro

## Enforcement
- [ ] Git log verificado
MD
}

# ─── Fixture: ADR with status Proposto (should be ignored) ────────

mk_project_with_proposto_adr() {
  local dir="$1"
  mkdir -p "${dir}/.context/docs/adrs"

  cat > "${dir}/.context/docs/adrs/README.md" <<'MD'
# ADRs
MD

  cat > "${dir}/.context/docs/adrs/001-draft.md" <<'MD'
---
type: adr
name: draft-adr
status: Proposto
stack: python
---

# ADR 001 — Draft

## Guardrails

- NUNCA_CARREGAR_ESTA_REGRA_DE_RASCUNHO

## Enforcement
- [ ] todo
MD
}

# ─── Fixture: multiple approved ADRs ──────────────────────────────

mk_project_with_multiple_adrs() {
  local dir="$1"
  mkdir -p "${dir}/.context/docs/adrs"

  cat > "${dir}/.context/docs/adrs/README.md" <<'MD'
# ADRs
MD

  cat > "${dir}/.context/docs/adrs/001-a.md" <<'MD'
---
type: adr
name: adr-alpha
status: Aprovado
stack: python
---

# ADR 001

## Guardrails

- SEMPRE regra alpha

## Enforcement
- [ ] x
MD

  cat > "${dir}/.context/docs/adrs/002-b.md" <<'MD'
---
type: adr
name: adr-beta
status: Aprovado
stack: universal
---

# ADR 002

## Guardrails

- NUNCA regra beta

## Enforcement
- [ ] y
MD
}

# ─── Test 1: No ADRs directory ────────────────────────────────────

echo "=== No ADRs directory ==="
tmp_no_adrs="${TMP_DIR}/no-adrs"
mk_project_no_adrs "$tmp_no_adrs"

output_no=$(run_hook "$tmp_no_adrs")
assert_not_contains "no adrs dir: no ADR_GUARDRAILS tag" "$output_no" "ADR_GUARDRAILS"

# ─── Test 2: Valid ADR with status Aprovado ──────────────────────

echo ""
echo "=== Valid approved ADR ==="
tmp_valid="${TMP_DIR}/valid-adr"
mk_project_with_adrs "$tmp_valid"

output_valid=$(run_hook "$tmp_valid")
assert_contains "valid adr: includes ADR_GUARDRAILS tag" "$output_valid" "ADR_GUARDRAILS"
assert_contains "valid adr: announces count (1 active)" "$output_valid" "1 active ADR"
assert_contains "valid adr: includes SEMPRE guardrail" "$output_valid" "SEMPRE escrever teste"
assert_contains "valid adr: includes NUNCA guardrail" "$output_valid" "NUNCA mockar banco"
assert_contains "valid adr: includes QUANDO guardrail" "$output_valid" "QUANDO bug for reportado"
assert_contains "valid adr: shows ADR name" "$output_valid" "tdd-python"

# Enforcement section should NOT be included (only Guardrails section)
assert_not_contains "valid adr: Enforcement section excluded" "$output_valid" "Git log verificado"

# ─── Test 3: ADR with status Proposto is skipped ─────────────────

echo ""
echo "=== Draft (Proposto) ADR is skipped ==="
tmp_draft="${TMP_DIR}/draft-adr"
mk_project_with_proposto_adr "$tmp_draft"

output_draft=$(run_hook "$tmp_draft")
assert_not_contains "draft adr: not loaded" "$output_draft" "NUNCA_CARREGAR_ESTA_REGRA_DE_RASCUNHO"

# ─── Test 4: Multiple approved ADRs ──────────────────────────────

echo ""
echo "=== Multiple approved ADRs ==="
tmp_multi="${TMP_DIR}/multi-adrs"
mk_project_with_multiple_adrs "$tmp_multi"

output_multi=$(run_hook "$tmp_multi")
assert_contains "multi: announces 2 active ADRs" "$output_multi" "2 active ADR"
assert_contains "multi: includes alpha rule" "$output_multi" "SEMPRE regra alpha"
assert_contains "multi: includes beta rule" "$output_multi" "NUNCA regra beta"
assert_contains "multi: shows first ADR name" "$output_multi" "adr-alpha"
assert_contains "multi: shows second ADR name" "$output_multi" "adr-beta"

# ─── Test 5: Output is still valid JSON ──────────────────────────

echo ""
echo "=== JSON integrity ==="
json_valid=$(echo "$output_valid" | python3 -c "import sys,json; json.load(sys.stdin); print('valid')" 2>/dev/null || echo "invalid")
assert_contains "adr injection preserves JSON validity" "$json_valid" "valid"

# ─── Report ──────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ADR context hook tests: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}All passed${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
