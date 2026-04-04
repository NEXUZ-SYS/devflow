---
name: prevc-validation
description: "Use during PREVC Validation phase — comprehensive verification including tests, security audit, and spec compliance check"
---

# PREVC Validation Phase

Comprehensive verification that the implementation matches the spec, tests pass, and no security or quality issues exist.

**Announce at start:** "I'm using the devflow:prevc-validation skill for the Validation phase."

## Checklist

1. **Run full test suite** — all tests must pass
2. **Spec compliance check** — implementation matches the approved design
3. **ADR guardrails compliance** — implementation respects active ADR guardrails
4. **Test coverage review** — verify adequate coverage for new code
5. **Security validation** — check for OWASP top 10 and domain-specific risks
6. **Performance check** — no obvious regressions (if applicable)
7. **Gate check** — all validations pass = ready to advance

## Step 1: Run Full Test Suite

**REQUIRED SUB-SKILL:** Invoke `superpowers:verification-before-completion`

Run the full test suite, not just new tests. Verify:
- All existing tests still pass (no regressions)
- All new tests pass
- No flaky tests introduced

## Step 2: Spec Compliance

Compare the implementation against the design spec point by point:

- [ ] Every requirement in the spec is implemented
- [ ] No requirements were silently dropped
- [ ] No features were added that aren't in the spec
- [ ] Architecture matches the approved design
- [ ] Data flow matches the spec
- [ ] Error handling covers specified scenarios

### Full Mode
```
agent({ action: "orchestrate", phase: "V", task: "spec-compliance" })
```
The code-reviewer agent performs structured spec compliance.

### Lite Mode
Read `.context/agents/code-reviewer.md` and apply its checklist against the spec.

## Step 2.5: ADR Guardrails Compliance

Check if the implementation complies with active ADR guardrails.

### When to run
Only if `.context/docs/adrs/README.md` exists and has active ADRs.

### Process

1. Read `.context/docs/adrs/README.md` — get list of active ADRs
2. For each ADR with status `Aprovado`:
   a. Read the **Guardrails** section
   b. For each guardrail rule (SEMPRE/NUNCA/QUANDO):
      - Check if the implementation violates the rule
      - For code guardrails: scan relevant files for violations
      - For architecture guardrails: verify structure matches
   c. For each **Enforcement** item:
      - Verify if the enforcement mechanism exists (CI check, lint rule, etc.)
3. Report findings:

```markdown
### ADR Compliance: PASS/FAIL

| ADR | Guardrails | Violations | Status |
|-----|-----------|------------|--------|
| 001 - SOLID Python | 8 | 0 | PASS |
| 002 - TDD Python | 5 | 1 | FAIL |
| 003 - AWS Data Lake | 8 | 0 | PASS |

**Violations:**
- ADR 002, rule "NUNCA usar mocks para banco": found mock in `tests/test_user.py:45`
```

4. If any violations found: return to Execution phase to fix.

### Full Mode
```
agent({ action: "orchestrate", agents: ["code-reviewer"], task: "adr-compliance" })
```
The code-reviewer agent performs ADR compliance checking against the guardrails.

## Step 3: Test Coverage Review

### Full Mode
```
agent({ action: "orchestrate", agents: ["test-writer"], task: "coverage-review" })
```

### All Modes

#### Test Type Adequacy Check

<HARD-GATE>
Verify that the correct test TYPES exist for the code that was written. "All tests passing" is insufficient — the right tests must EXIST first.

| Implementation area | Required test types | Gate blocks if missing |
|--------------------|--------------------|-----------------------|
| Pure functions, utilities | Unit tests | Yes |
| API endpoints, DB queries | Unit + Integration | Yes |
| Auth, payments, registration | Unit + Integration + E2E | Yes |
| CLI tools, shell scripts | Unit + E2E (real execution) | Yes |
| UI components | Unit + Snapshot | Yes |

**E2E is mandatory when the task touches:**
- Authentication or authorization flows
- Payment or financial transactions
- User registration, onboarding, or account management
- Data export, import, or deletion
- CLI tools or hooks that users execute directly

**What counts as an E2E test:**
- Executes the REAL script/binary/hook (not a mock)
- Tests the full input→output path
- Validates actual output format (JSON, exit codes, file contents)
- Uses realistic fixtures, not toy data

If E2E tests are required but missing, **return to Execution phase** to add them before proceeding.
</HARD-GATE>

#### Coverage Checklist

Verify:
- [ ] Happy path tested for every new feature
- [ ] Edge cases tested (empty input, boundary values, null, circular deps)
- [ ] Error paths tested (invalid input, failures, timeouts, missing files)
- [ ] Integration points tested (API calls, DB queries, external services)
- [ ] E2E tests exist for critical flows (see table above)
- [ ] Tests written BEFORE implementation (TDD verified — check git log for test commits preceding impl commits)

## Step 4: Security Validation

Skip for QUICK scale or tasks that don't touch security surfaces.

### Full Mode
```
agent({ action: "orchestrate", agents: ["security-auditor"], task: "security-validation" })
```

### All Modes — Security Checklist
- [ ] No command injection (user input not passed to shell)
- [ ] No XSS (user input properly escaped in output)
- [ ] No SQL injection (parameterized queries used)
- [ ] No secrets in code (API keys, passwords, tokens)
- [ ] Input validated at system boundaries
- [ ] Auth/authz checks in place for protected resources
- [ ] Dependencies have no known critical vulnerabilities

## Step 5: Performance Check

Skip unless the task involves:
- Database queries (check for N+1, missing indexes)
- API endpoints (check response time expectations)
- UI rendering (check for unnecessary re-renders)
- Data processing (check for O(n^2) or worse)

### Full Mode
```
agent({ action: "orchestrate", agents: ["performance-optimizer"], task: "perf-check" })
```

## Step 6: Gate Check

The Validation phase gate requires:
- All tests passing (zero failures)
- Test type adequacy verified (unit + integration + E2E where applicable)
- TDD ordering verified (test commits precede implementation commits)
- Spec compliance verified
- ADR compliance verified (if ADRs active)
- Security checklist cleared (if applicable)
- No blocking issues identified

Present validation summary:
```markdown
## Validation Summary

### Tests: PASS (X passed, 0 failed)
### Test Types: Unit ✓ | Integration ✓/N/A | E2E ✓/N/A
### TDD Ordering: VERIFIED / VIOLATION (list files without test-first)
### Spec Compliance: PASS/FAIL
### ADR Compliance: PASS/N/A (X guardrails checked, Y violations)
### Security: PASS/N/A
### Performance: PASS/N/A

### Result: VALIDATED / ISSUES FOUND
```

If ISSUES FOUND: return to Execution phase to fix, then re-validate.

**When gate is met:**

Full mode:
```
plan({ action: "commitPhase", phase: "V" })
workflow-advance()  # Moves to C phase
```

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "Tests pass, we're done" | Tests are step 1 of 5. Spec compliance and security remain. |
| "Security is someone else's job" | Every developer validates security at implementation time. |
| "Performance testing is overkill" | Only skip if the task literally can't affect performance. |
| "The code reviewer already checked this" | R phase reviewed the plan. V phase validates the implementation. |
