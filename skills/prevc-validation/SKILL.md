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
3. **Test coverage review** — verify adequate coverage for new code
4. **Security validation** — check for OWASP top 10 and domain-specific risks
5. **Performance check** — no obvious regressions (if applicable)
6. **Gate check** — all validations pass = ready to advance

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

## Step 3: Test Coverage Review

### Full Mode
```
agent({ action: "orchestrate", agents: ["test-writer"], task: "coverage-review" })
```

### All Modes
Verify:
- [ ] Happy path tested for every new feature
- [ ] Edge cases tested (empty input, boundary values, null)
- [ ] Error paths tested (invalid input, failures, timeouts)
- [ ] Integration points tested (API calls, DB queries, external services)

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
- Spec compliance verified
- Security checklist cleared (if applicable)
- No blocking issues identified

Present validation summary:
```markdown
## Validation Summary

### Tests: PASS (X passed, 0 failed)
### Spec Compliance: PASS/FAIL
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
