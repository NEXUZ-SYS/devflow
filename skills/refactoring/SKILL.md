---
name: refactoring
description: "Use when restructuring code without changing behavior — safe patterns, test preservation, incremental steps"
---

# Refactoring

Safe, incremental code restructuring that preserves behavior and maintains all tests.

**Announce at start:** "I'm using the devflow:refactoring skill."

## When to Use

- Code duplication across 3+ call sites
- Complex functions that are hard to test
- Unclear naming or organization
- Preparing code for a new feature (make the change easy, then make the easy change)

## Iron Rules

1. **All tests must pass before AND after every refactoring step**
2. **Never refactor and change behavior in the same commit**
3. **If no tests exist, write them first** (then refactor)
4. **Each step must be independently reversible**

## Checklist

1. **Verify baseline** — all tests pass
2. **Identify target** — what specifically and why
3. **Write missing tests** — if coverage is insufficient
4. **Plan steps** — sequence of small, safe transformations
5. **Execute step by step** — test after each step, commit
6. **Verify final state** — all tests pass, behavior unchanged

## Safe Refactoring Patterns

### Extract Function
```
Before: 50-line function with 3 responsibilities
After:  3 focused functions, each 15-20 lines
When:   Function does more than one thing
```

### Extract Module/Class
```
Before: 500-line file with multiple concerns
After:  3 files, each with one responsibility
When:   File has multiple independent sections
```

### Rename
```
Before: x, temp, data, handleClick
After:  userId, pendingOrder, userProfile, onSubmitPayment
When:   Names don't communicate intent
```

### Simplify Conditionals
```
Before: if (a && !b || (c && d) && !e)
After:  if (isEligibleForDiscount(order))
When:   Conditional logic is hard to read
```

### Replace Magic Values
```
Before: if (retries > 3) or timeout: 30000
After:  if (retries > MAX_RETRIES) or timeout: REQUEST_TIMEOUT_MS
When:   Numbers/strings have no explanation
```

### Invert Dependencies
```
Before: Module A imports and calls Module B directly
After:  Module A depends on an interface, Module B implements it
When:   You need to test A without B, or swap B
```

## Mode Integration

### Full Mode
```
skill({ action: "getContent", skill: "refactoring" })
agent({ action: "orchestrate", agents: ["refactoring-specialist"], task: "<description>" })
```

### Lite Mode
Read `.context/agents/refactoring-specialist.md` for project-specific refactoring guidance.

### Superpowers Integration
TDD iron law applies during refactoring:
- If tests don't exist → write them first (`superpowers:test-driven-development`)
- Run tests after every step — no exceptions

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| "Big bang" refactor | Too many changes to verify correctness |
| Refactoring + features in same commit | Can't tell if behavior changed intentionally |
| Refactoring without tests | No way to verify behavior is preserved |
| Premature abstraction | 3 similar lines is fine — don't abstract for 2 call sites |
| Refactoring code you don't own | Refactor what you're modifying, not the whole codebase |
