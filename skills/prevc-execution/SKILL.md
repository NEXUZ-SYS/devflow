---
name: prevc-execution
description: "Use during PREVC Execution phase — implements the approved plan using subagent-driven development, TDD iron law, and agent handoffs"
---

# PREVC Execution Phase

Implements the approved plan task-by-task using subagent-driven development with TDD enforcement and agent-guided handoffs.

<HARD-GATE>
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST. Code written before tests must be deleted — no exceptions. This is the TDD iron law inherited from superpowers.
</HARD-GATE>

**Announce at start:** "I'm using the devflow:prevc-execution skill for the Execution phase."

## Checklist

1. **Set up workspace** — git worktree for isolation
2. **Load plan** — read and validate the implementation plan
3. **Determine execution strategy** — SDD (subagents) or sequential
4. **Execute tasks** — one by one, TDD, with 2-stage review
5. **Agent handoffs** — transition between specialist agents per task group
6. **Track progress** — update plan status after each task
7. **Gate check** — all tasks complete + all tests pass = ready to advance

## Step 1: Set Up Workspace

**REQUIRED SUB-SKILL:** Invoke `superpowers:using-git-worktrees`

Create an isolated worktree for this feature. Never implement on main/master without explicit user consent.

## Step 2: Load Plan

Read the implementation plan from the Planning phase. Review critically:
- Are steps still valid given current codebase state?
- Any concerns? Raise with user before starting.
- Create a task list from plan steps.

## Step 3: Execution Strategy

### If subagents are available (Claude Code, Codex)
**REQUIRED SUB-SKILL:** Invoke `superpowers:subagent-driven-development`

Dispatch one fresh subagent per task. Each subagent:
1. Gets the task description + relevant context
2. Follows TDD iron law (RED → GREEN → REFACTOR)
3. Undergoes 2-stage review:
   - Stage 1: Spec compliance — does the code match the plan?
   - Stage 2: Code quality — is the code clean, tested, idiomatic?

### If no subagents (Cursor, Windsurf)
**REQUIRED SUB-SKILL:** Invoke `superpowers:executing-plans`

Execute tasks sequentially with self-review checkpoints.

## Step 4: Agent-Guided Execution

For each task group in the plan, consult the annotated agent role:

### Full Mode
```
agent({ action: "getSequence", task: "<task-group-description>" })
```
Follow the handoff sequence. Example:
```
backend-specialist → frontend-specialist → test-writer
```

Between handoffs:
```
workflow-manage({ action: "handoff", from: "backend-specialist", to: "frontend-specialist" })
```

### Lite Mode
Read the relevant agent playbook before starting each task group:
- `.context/agents/<agent-name>.md`
- Apply the agent's workflow steps and best practices

### Minimal Mode
Execute tasks per superpowers SDD/executing-plans without agent guidance.

## Step 5: TDD Per Task

Every task follows this exact sequence:

```
1. Write the failing test          ← RED
2. Run it — confirm it fails
3. Write minimal code to pass      ← GREEN
4. Run tests — confirm all pass
5. Refactor if needed              ← REFACTOR
6. Run tests — confirm still pass
7. Commit
```

**Violations that require deleting code:**
- Production code written without a failing test
- Test written after production code
- "I'll write the test after" — delete the code, write the test first

## Step 6: Track Progress

### Full Mode
After each task completes:
```
plan({ action: "updateStep", stepId: "<id>", status: "completed" })
```

### Lite/Minimal Mode
Update task list checkboxes in the plan document.

## Step 7: Gate Check

The Execution phase gate requires:
- All plan tasks completed
- All tests passing
- No unresolved review findings from 2-stage reviews
- Code committed to feature branch

**When gate is met:**

Full mode:
```
workflow-advance()  # Moves to V phase
```

## LARGE Scale: Checkpoints

For LARGE scale workflows, add checkpoints every 3-5 tasks:
- Pause execution
- Present progress summary to user
- Get approval to continue
- Adjust remaining plan if needed

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "I'll write tests at the end" | TDD iron law. Delete the code. Write the test first. |
| "This task is too simple for a subagent" | Fresh context prevents contamination. Use subagents when available. |
| "Agent handoffs are overhead" | Specialists catch domain-specific issues generalists miss. |
| "The plan changed, I'll adapt on the fly" | Update the plan document first. Then execute the updated plan. |
| "Tests pass, move on" | 2-stage review comes after tests. Spec compliance + code quality. |
