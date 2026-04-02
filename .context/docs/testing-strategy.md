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

DevFlow is a meta-framework (Markdown + Bash + JSON), not application code. It has no traditional unit test framework. Instead, quality is ensured through:

1. **PREVC gate checks** — Hard gates between phases validate preconditions
2. **Skill checklists** — Each skill defines a step-by-step checklist tracked via TaskCreate/TaskUpdate
3. **User approval gates** — Explicit user approval required at key decision points
4. **Pre-commit validation** — `scripts/pre-commit-version-check.sh` ensures version consistency

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
