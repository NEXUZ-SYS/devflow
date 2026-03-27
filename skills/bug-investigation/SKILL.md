---
name: bug-investigation
description: "Use when triaging bugs, investigating unexpected behavior, or performing root cause analysis before fixing"
---

# Bug Investigation

Structured bug triage and investigation process. Bridges superpowers' systematic-debugging with dotcontext's bug-fixer agent.

**Announce at start:** "I'm using the devflow:bug-investigation skill to investigate this bug."

## When to Use

- Triaging a new bug report
- Investigating unexpected behavior
- Before attempting any fix (understand first, fix second)
- When a fix didn't resolve the issue

## Checklist

1. **Reproduce** — create a reliable reproduction case
2. **Isolate** — narrow down the affected component
3. **Trace** — follow the execution path to the fault
4. **Root cause** — identify the actual cause (not symptoms)
5. **Document** — record findings before fixing

## Investigation Process

### Step 1: Reproduce
- Get exact steps to reproduce
- Identify: does it always happen? Only under certain conditions?
- Create a minimal reproduction case
- If you can't reproduce, gather more data (logs, environment, timing)

### Step 2: Isolate
- Which component is affected?
- When did it start? (check `git log` for recent changes)
- Does it happen in all environments?
- What changed since it last worked?

### Step 3: Trace
- Follow the execution path from input to unexpected output
- Add strategic logging if needed (remove after investigation)
- Check: data flow, state mutations, race conditions, error swallowing

### Step 4: Root Cause
Ask "why?" 5 times (5-Whys technique):
```
Bug: User sees blank page
Why? → Component throws during render
Why? → API returns null for required field
Why? → Database migration didn't run
Why? → Deploy script skips migrations in staging
Why? → Migration step was added after deploy script was written
Root cause: Deploy script doesn't run new migrations
```

### Step 5: Document
Before fixing, record:
- **Symptom:** What the user sees
- **Root cause:** The actual fault
- **Affected scope:** What else might be impacted
- **Fix approach:** What to change and why

## Superpowers Integration

For complex bugs, invoke `superpowers:systematic-debugging` which provides:
- Phase 1: Observe and gather evidence
- Phase 2: Form hypotheses
- Phase 3: Test hypotheses systematically
- Phase 4: Identify root cause

## Mode Integration

### Full Mode
```
agent({ action: "orchestrate", agents: ["bug-fixer"], task: "<bug-description>" })
```

### Lite Mode
Read `.context/agents/bug-fixer.md` for project-specific investigation procedures.

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| Fix without reproducing | You might fix a different bug |
| Fix the symptom, not the cause | Bug will resurface differently |
| Change multiple things at once | Can't tell what actually fixed it |
| Skip documentation | Next person hits the same bug with no context |
| Blame the framework/library | 95% of the time it's your code |
