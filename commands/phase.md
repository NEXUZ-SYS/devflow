---
name: phase
description: Show current PREVC phase status or advance to next phase
user_invocable: true
---

# /phase

Show the current PREVC workflow status or advance to the next phase.

## Usage

```
/phase              # Show current phase, progress, and available actions
/phase advance      # Attempt to advance to next phase (checks gates)
/phase status       # Detailed status of all phases
```

## Behavior

### `/phase` (no args)
Display:
- Current workflow name and scale
- Current phase (P/R/E/V/C) with progress
- Gate requirements for next phase
- Available actions

### `/phase advance`
1. Check gate requirements for current phase
2. If met: advance to next phase, invoke corresponding skill
3. If not met: list unmet requirements

### `/phase status`
Show all phases with their status:
```
P Planning      ✓ Complete
R Review        ✓ Complete
E Execution     ● In Progress (7/12 tasks)
V Validation    ○ Pending
C Confirmation  ○ Pending
```

## Mode Behavior

- **Full mode:** Uses `workflow-status()` and `workflow-advance()` MCP tools
- **Lite/Minimal mode:** Reads from task list tracking
