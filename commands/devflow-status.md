---
name: devflow-status
description: Show current PREVC phase, progress, operating mode, and available actions
user_invocable: true
---

# /devflow-status

Show the current state of the PREVC workflow at a glance.

## Usage

```
/devflow-status
```

## Behavior

Display:
- Current workflow name and scale
- Operating mode (Full/Lite/Minimal)
- All phases with their status:

```
DevFlow Mode: full | superpowers ✓ | dotcontext MCP ✓

Workflow: "add user authentication with JWT" (MEDIUM)

P Planning      ✓ Complete
R Review        ✓ Complete
E Execution     ● In Progress (7/12 tasks)
V Validation    ○ Pending
C Confirmation  ○ Pending

Current: E (Execution) — 7 of 12 tasks done
Next gate: all tasks complete + tests passing → V (Validation)
```

## Mode Behavior

- **Full mode:** Uses `workflow-status()` MCP tool
- **Lite/Minimal mode:** Reads from task list tracking

## PRD Status

If `.context/plans/*-prd.md` exists, display PRD phase overview **above** the current workflow status:

```
PRD: DevFlow Plugin
  Phase 1: Core Framework          ✓ Completed
  Phase 2: Superpowers Integration  ✓ Completed
  Phase 3: Agent Orchestration      ⏳ In Progress ← current
  Phase 4: Documentation & Polish   ⬚ Pending

Active Phase: 3 of 4
```

If both PRD and active workflow exist, show both:

```
PRD: DevFlow Plugin
  Phase 1: Core Framework          ✓ Completed
  Phase 2: Superpowers Integration  ✓ Completed
  Phase 3: Agent Orchestration      ⏳ In Progress ← current
  Phase 4: Documentation & Polish   ⬚ Pending

Workflow: "Phase 3 — Agent Orchestration" (MEDIUM)
  P Planning      ✓ Complete
  R Review        ✓ Complete
  E Execution     ● In Progress (7/12 tasks)
  V Validation    ○ Pending
  C Confirmation  ○ Pending
```

If `/devflow prd --status` is used, show only the PRD section.

## No Active Workflow

If no workflow is active, display:

```
DevFlow Mode: full | superpowers ✓ | dotcontext MCP ✓

No active workflow. Start one with:
  /devflow <description>
  /devflow prd              (generate product roadmap)
```
