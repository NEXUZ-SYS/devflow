---
name: devflow-next
description: Advance to the next PREVC phase after checking gate requirements
user_invocable: true
---

# /devflow-next

Advance the workflow to the next phase.

## Usage

```
/devflow-next
```

## Behavior

1. Check gate requirements for the current phase
2. If met: advance to next phase, invoke corresponding phase skill
3. If not met: list unmet requirements

### Gate passed:
```
✓ Gate check passed for E (Execution)
  → Advancing to V (Validation)...
```

### Gate not met:
```
✗ Cannot advance from E (Execution). Unmet requirements:
  - 3 tasks still pending
  - Tests not passing (2 failures)
```

### Already complete:
```
✓ Workflow complete. All phases done.
  Run /devflow <description> to start a new workflow.
```

## Mode Behavior

- **Full mode:** Uses `workflow-advance()` MCP tool
- **Lite/Minimal mode:** Checks task list and test status
