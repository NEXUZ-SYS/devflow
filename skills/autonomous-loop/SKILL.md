---
name: autonomous-loop
description: "Use during PREVC Execution phase when autonomy is assisted or autonomous — manages story-by-story loop with specialist agent dispatch, TDD enforcement, and bidirectional escalation"
---

# Autonomous Loop — Story Execution Engine

Processes stories from `stories.yaml` one at a time, dispatching specialist agents, enforcing quality gates, and escalating to human when needed.

<HARD-GATE>
This skill is ONLY invoked by `devflow:prevc-execution` when the workflow has `autonomy: assisted` or `autonomy: autonomous`. Never invoke this skill directly for supervised workflows.
</HARD-GATE>

**Announce at start:** "I'm using the devflow:autonomous-loop skill to execute stories autonomously."

## Prerequisites

- `stories.yaml` exists at `.context/workflow/stories.yaml`
- Implementation plan exists and was approved (P phase complete)
- Workspace is set up (git branch created via git-strategy)

## Algorithm

### Step 1: Load Stories

Read `.context/workflow/stories.yaml`. Validate:
- File exists and is valid YAML
- At least one story with `status: pending`
- `escalation` config is present

If validation fails, escalate to human immediately.

### Step 1.5: Max Iteration Guard

Track the total number of story execution attempts in the loop. If the total exceeds a hard ceiling (default: 50 iterations), exit the loop and generate the final report. This prevents infinite loops from stories that flip-flop between `failed` and `in_progress`.

### Step 2: Story Selection

Select the next story to execute using this priority:
1. Stories with `status: in_progress` (session died mid-execution — treat as retry)
2. Stories with `status: failed` and `attempts < max_retries_per_story` (retry)
3. Stories with `status: pending` (new work)
4. Among candidates, pick the one with lowest `priority` value
5. Skip stories whose `blocked_by` contains any story not yet `completed`
6. If `blocked_by` references a non-existent story ID, treat as an error and escalate that story

If no story is selectable (all blocked, escalated, or completed): exit loop.

**Distinguish exit reasons** for the final report:
- All stories `completed` → "All stories complete"
- Some stories `escalated`, rest `completed` → "Loop paused, N stories escalated"
- Remaining stories all `blocked` (circular deps or deps on escalated stories) → "All remaining stories are blocked. Unblock dependencies or re-plan."

### Step 3: Execute Story

For the selected story:

**3a. Update status:**
```yaml
# In stories.yaml
status: in_progress
attempts: <current + 1>
```

**3b. Update checkpoint:**
Write to `.context/workflow/.checkpoint/handoff.md`:
```
## Autonomous Loop Progress
- Feature: <feature name>
- Current story: <story.id> — <story.title>
- Attempt: <story.attempts>
- Completed: <stats.completed>/<stats.total>
- Mode: <current_autonomy>
```

**3c. Dispatch specialist agent:**

Use `devflow:agent-dispatch` to load the agent specified in `story.agent`.

Priority chain:
1. Full mode: `agent({ action: "getInfo", agent: "<story.agent>" })`
2. Lite mode: Read `.context/agents/<story.agent>.md`
3. Minimal: Read bundled `agents/<story.agent>.md`

**3d. Execute with TDD enforced:**
The agent must follow this sequence:
1. Write failing test for the story's requirements
2. Run test — confirm it fails
3. Implement minimal code to pass
4. Run full test suite — confirm all pass
5. Refactor if needed (tests must still pass)

**3e. Quality gates:**
After implementation:
1. **Typecheck** — run project's typecheck command (if applicable)
2. **Test suite** — run full test suite, not just new tests
3. **Security scan** — if story touches auth, data, or API endpoints, invoke `devflow:security-audit` (lightweight mode)

### Step 4: Evaluate Result

**If all gates pass:**
1. Commit changes:
   ```
   git add -A
   git commit -m "feat(<story.id>): <story.title>"
   ```
2. Update stories.yaml:
   ```yaml
   status: completed
   completed_at: "<ISO 8601>"
   duration_s: <elapsed seconds>
   ```
3. Update stats:
   ```yaml
   stats.completed: <+1>
   stats.consecutive_failures: 0
   ```
4. **Upgrade check** (bidirectional escalation):
   - Count consecutive completed stories (no failures in between)
   - If count >= `escalation.upgrade_after_streak` AND current mode is `assisted`:
     - Announce: "Last <N> stories completed without issues. Want to switch to autonomous mode?"
     - If user approves: update `stats.current_autonomy: autonomous`
     - If no response (autonomous mode): continue silently
5. Continue to Step 2 (next story)

**If gates fail:**
1. Increment `stats.consecutive_failures`
2. Record error: `story.error: "<failure description>"`

3. **Security check:**
   - If the failure involves a security finding: immediately escalate (Step 5)
   - Set `story.status: escalated`

4. **Retry check:**
   - If `story.attempts < escalation.max_retries_per_story`:
     - Set `story.status: failed`
     - **Mini-replanning:** Analyze the error, identify root cause, adjust approach
     - Log: "Story <id> failed (attempt <n>/<max>). Retrying with adjusted approach."
     - Continue to Step 2 (will re-select this story due to priority)
   - If `story.attempts >= escalation.max_retries_per_story`:
     - Set `story.status: escalated`
     - Proceed to Step 5

5. **Circuit breaker check:**
   - If `stats.consecutive_failures >= escalation.max_consecutive_failures`:
     - Escalate ALL remaining stories
     - Proceed to Step 5

### Step 5: Escalate to Human

When escalation is triggered:

1. Update `stories.yaml` with current state
2. Save checkpoint (handoff.md + trigger PreCompact if available)
3. Update `stats.current_autonomy: assisted`
4. Present escalation report:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Autonomous Loop — Escalation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Reason: <reason>
  Story:  <story.id> — <story.title>
  Error:  <story.error>
  
  Progress: <completed>/<total> stories
  
  Suggestions:
  - <specific suggestion based on error>
  
  To resume: fix the issue and say "continue"
  To abort:  say "stop" or "/devflow-status"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

5. Wait for human input:
   - "continue" → fix applied, resume loop from Step 2
   - "continue autonomous" → resume + upgrade to autonomous mode
   - "stop" → exit loop, generate final report
   - Any other input → treat as guidance, apply to current story, resume

### Step 6: Final Report

When the loop exits (all stories processed or stopped):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Autonomous Loop — Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Feature:   <feature name>
  Completed: <n>/<total> stories
  Escalated: <n> stories
  Duration:  <total time>

  Stories:
  ✓ S1 — Create Product model (45s)
  ✓ S2 — POST /products endpoint (62s)
  ✗ S3 — ProductForm component (escalated)
  ⬚ S4 — Product list page (blocked by S3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Exit message depends on state:
- All stories `completed` → "All stories complete. Ready for Validation phase."
- Some `escalated` → "Loop paused. <n> stories need attention before Validation."
- Remaining all `blocked` → "All remaining stories are blocked. Unblock dependencies or re-plan."
- Max iteration ceiling reached → "Iteration limit reached. <n>/<total> completed. Review stories.yaml."

## Mode-Specific Behavior

### Full Mode
- Use dotcontext MCP for agent dispatch: `agent({ action: "orchestrate", task: "<story>" })`
- Update plan progress: `plan({ action: "updateStep", ... })`
- Track handoffs: `workflow-manage({ action: "handoff", ... })`

### Lite Mode
- Read agent playbooks from `.context/agents/<name>.md`
- Track progress by editing stories.yaml directly
- No MCP calls

### Minimal Mode
- Use bundled agent playbooks from plugin `agents/` directory
- Track via stories.yaml only

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "Skip TDD for small stories" | TDD is enforced for ALL stories. No exceptions. |
| "Retry indefinitely" | Max retries exist for a reason. Escalate and move on. |
| "Skip security for non-auth stories" | Security scan triggers are story-content-aware. Trust the gate. |
| "Push after each story" | Never push. Commit locally only. Push happens in Confirmation. |
| "Decompose a large story mid-loop" | If a story is too large, escalate. Re-planning happens in P phase. |
| "Run two sessions on the same stories.yaml" | No locking mechanism exists. Two sessions will pick up the same story. Use one session at a time. |
