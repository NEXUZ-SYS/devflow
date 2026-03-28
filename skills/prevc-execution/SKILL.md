---
name: prevc-execution
description: "Use during PREVC Execution phase — implements the approved plan using dotcontext agent orchestration (Full Mode) or superpowers SDD/TDD (Lite/Minimal)"
---

# PREVC Execution Phase

Implements the approved plan task-by-task using dotcontext agent orchestration in Full Mode, or superpowers-driven development in Lite/Minimal Mode.

**Announce at start:** "I'm using the devflow:prevc-execution skill for the Execution phase."

## Checklist

1. **Set up workspace** — git strategy gate (devflow:git-strategy)
2. **Load plan** — read and validate the implementation plan
3. **Determine execution mode** — Full (dotcontext) or Lite/Minimal (superpowers)
4. **Execute tasks** — agent-orchestrated or SDD/sequential
5. **Track progress** — update plan status after each task
6. **Gate check** — all tasks complete + all tests pass = ready to advance

## Step 1: Set Up Workspace

**REQUIRED SUB-SKILL:** Invoke `devflow:git-strategy`

The git strategy skill checks branch protection and creates the appropriate isolation (worktree, branch, or none) based on the project's configured strategy.

## Step 2: Load Plan

### Full Mode
```
plan({ action: "getDetails", planSlug: "<slug>" })
```
Review the plan from dotcontext. Verify steps are still valid.

### Lite Mode
Read `.context/plans/<slug>.md` and review.

### Minimal Mode
Read `docs/superpowers/plans/<file>.md` and review.

In all modes: raise concerns with user before starting.

## Step 3: Execution Mode

### Full Mode (dotcontext owns execution)

**Step 3a — Get agent sequence:**
```
agent({ action: "getSequence", task: "<plan description>" })
```
Returns ordered sequence. Automatically includes:
- `test-writer` (if not present)
- `code-reviewer` (if includeReview is true, which is the default)
- `documentation-writer` (at the end)

**Step 3b — For each step, get agent:**
```
agent({ action: "orchestrate", task: "<step description>" })
```
Returns recommended agent(s) with docs and playbook path. Uses ONLY `task` parameter (do not combine with `role` or `phase`).

**Step 3c — Agent executes step following its playbook**

**Step 3d — Update progress (continuously, not just at completion):**

> `phaseId` and `stepIndex` are obtained from `plan({ action: "getDetails" })` response.

```
plan({ action: "updateStep", planSlug: "<slug>", phaseId: "<id>", stepIndex: <n>,
  status: "in_progress",
  notes: "<decisions made so far, what's next>"
})
```

On completion:
```
plan({ action: "updateStep", planSlug: "<slug>", phaseId: "<id>", stepIndex: <n>,
  status: "completed",
  output: "<step result>",
  notes: "<decisions, rationale, test results>"
})
```

**Step 3e — Handoff between agents (when agent changes between steps):**
```
workflow-manage({ action: "handoff", from: "<previous-agent>", to: "<next-agent>",
  artifacts: ["src/path/file.ts", "tests/path/test.ts"]
})
```

**Step 3f — After all steps complete:**
```
workflow-advance({ outputs: ["All steps completed", "N tests passing"] })
```
Returns orchestration + quickStart for the next phase.

### Lite Mode
Read the relevant agent playbook before each task group:
- `.context/agents/<agent-name>.md`
- Apply the agent's workflow steps and best practices
- Track progress by editing `.context/plans/<slug>.md`

### Minimal Mode
**REQUIRED SUB-SKILL:** Invoke `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` (sequential).

Execute tasks per superpowers workflow without agent guidance.

## Step 4: Gate Check

The Execution phase gate requires:
- All plan tasks completed
- All tests passing
- No unresolved review findings
- Code committed to feature branch

**When gate is met:**

### Full Mode
```
workflow-advance()  # Moves to V phase
```

### Lite Mode
Mark the plan as complete in `.context/plans/<slug>.md`. Update task checkboxes.

### Minimal Mode
Verify all superpowers review stages passed. Plan document updated with completion status.

## LARGE Scale: Checkpoints

For LARGE scale workflows, add checkpoints every 3-5 tasks:
- Pause execution
- Present progress summary to user
- Get approval to continue
- Adjust remaining plan if needed

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "I'll skip the agent sequence" | Agents catch domain-specific issues. Use orchestrate. |
| "Notes in updateStep are optional" | Notes are critical for rehydration after compaction. Always write them. |
| "Agent handoffs are overhead" | Handoffs with artifacts prevent context loss between specialists. |
| "The plan changed, I'll adapt on the fly" | Update the plan document first. Then execute the updated plan. |
