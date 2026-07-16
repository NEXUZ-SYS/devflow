---
type: doc
name: testing-strategy
description: Testing approach, verification mechanisms, and quality gates for DevFlow
category: testing
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

## Test Framework

DevFlow usa `node:test` (Node 20+, zero-dep) para ~1900 testes `.mjs` e Bash para ~60 testes
`.sh`. A suíte é declarada como **sinal verificável** no `.context/.devflow.yaml` (bloco `verify:`),
enumerada de forma reprodutível pelos runners `tests/run-*.sh` (`git ls-files` + convenção
`test-*.mjs`/`*.test.mjs`/`test-*.sh`), e arbitrada pelo CI `.github/workflows/test.yml`. A fase V
do PREVC **observa** um ledger (`.context/runtime/verify-ledger.jsonl`) em vez de afirmar — ver
ADR-013 (refina ADR-011).

**Comando canônico por sinal:** `node scripts/lib/verify-run.mjs <unit|integration|e2e|lint>`
(o executor lê o `verify:` e roda o argv declarado, gravando o resultado no ledger com um
`treeDigest`). O gate de V lê o ledger via `scripts/lib/verify-gate.mjs`.

Além dos testes, a qualidade é reforçada por:

1. **PREVC gate checks** — Hard gates between phases validate preconditions
2. **Skill checklists** — Each skill defines a step-by-step checklist tracked via TaskCreate/TaskUpdate
3. **User approval gates** — Explicit user approval required at key decision points
4. **Pre-commit validation** — `scripts/pre-commit-version-check.sh` ensures version consistency
5. **Guards anti-reward-hacking** — `test-weakening-guard.mjs` (não enfraquecer testes) e
   `verify-contract-guard-cli.mjs` (não neutralizar o contrato `verify:`), ambos no sinal `lint`.

## Test Structure

### Gate-Based Verification
```
Planning (P)
  ✓ Spec must be written and approved
  ✓ Plan must be complete with task breakdown

Review (R)
  ✓ Design approved by code-reviewer agent
  ✓ No critical security issues flagged

Execution (E)
  ✓ TDD discipline: failing test before implementation
  ✓ All tasks marked complete
  ✓ Code compiles/runs without errors

Validation (V)
  ✓ All tests passing
  ✓ Security audit passed
  ✓ Spec compliance verified

Confirmation (C)
  ✓ Branch clean (no uncommitted changes)
  ✓ Documentation updated
  ✓ PR ready for review
```

### Hook-Based Validation
- `hooks/pre-tool-use` — Validates git strategy before Edit/Write operations
- `hooks/session-start` — Detects and validates operating mode
- `scripts/pre-commit-version-check.sh` — Version bump validation

## Coverage Expectations

- Every skill must have a complete checklist of steps
- Every agent playbook must reference actual project paths and patterns
- Every PREVC phase transition must pass its gate requirements
- Generated `.context/` files must be dotcontext v2 compatible

## Testing Patterns

### For Projects Using DevFlow
DevFlow's `test-generation` skill guides test design per component:
- Identifies testable units based on project structure
- Recommends testing framework based on detected stack
- Enforces TDD discipline in Execution phase (RED → GREEN → REFACTOR)
- Reviews coverage in Validation phase

### Self-Verification
- Checkpoint system (`last.json`) preserves workflow state across context compression
- PostCompact hook rehydrates state after compression events
- Skills validate their own preconditions before executing
