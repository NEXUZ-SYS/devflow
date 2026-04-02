# Autonomous Loop — Design Spec

**Date:** 2026-04-02
**Status:** Approved
**Scale:** LARGE (P → R → E → V → C)

## Problem

DevFlow assumes a human is present throughout the session. There is no mechanism for continuous, unattended execution of multiple stories. Users who want to "set it and run overnight" must leave the session or use external tools like Ralph.

## Solution

Add autonomy modes to DevFlow's PREVC workflow, enabling a spectrum from fully supervised to fully autonomous execution, with intelligent escalation between modes.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Loop mechanism | **Hybrid** — internal skill + external Node.js runner | Skill gives rich integration (agents, gates, TDD); runner is safety net for session death |
| Escalation model | **Bidirectional** | Downgrades on failure, upgrades on success streak; human can override anytime |
| Story tracking | **stories.yaml** | Consistent with existing status.yaml; supports rich metadata (attempts, agent, duration) |
| Runner technology | **Node.js (Agent SDK)** | DevFlow lives in Claude Code/Node ecosystem; Agent SDK gives real control |
| Per-story PREVC | **Adaptive** — E→V per story, mini-P on retry | Full PREVC per story is overkill; plan already exists from parent workflow |
| Escalation threshold | **Moderate** — 2 retries/story, 3 consecutive failures, security immediate | Balances autonomy with safety; catches both per-story and systemic failures |

## Autonomy Modes

### `supervised` (default)
Current behavior. Human approves each phase transition. No changes needed.

### `assisted`
- **P + R:** Human involved (brainstorming, review)
- **E:** Autonomous loop processes stories without intervention
- **V + C:** Human reviews final validation and confirms PR

### `autonomous`
- **P:** Auto-generates spec + plan + stories.yaml (no human questions)
- **R:** Agent architect + code-reviewer validate (escalates only on BLOCK)
- **E:** Autonomous loop with full agent dispatch
- **V:** Agent code-reviewer does final review (escalates only on critical findings)
- **C:** Auto-creates PR with summary, updates PRD if exists

## Architecture

```
/devflow autonomy:autonomous "feature X"
    │
    ▼
┌─ PREVC Workflow (parent) ─────────────────────┐
│  P: Planning ──► generates stories.yaml       │
│  R: Review ──► agents validate plan           │
│  E: Execution ──► AUTONOMOUS LOOP             │
│    │                                          │
│    │  ┌─ Pick next story (priority + deps)    │
│    │  ├─ Dispatch specialist agent            │
│    │  ├─ Execute with TDD                     │
│    │  ├─ Quality gates (tests + typecheck)    │
│    │  ├─ Pass? → commit, update yaml, next    │
│    │  ├─ Fail? → retry with mini-P            │
│    │  ├─ Fail 2x? → escalate to human         │
│    │  └─ All done? → exit loop                │
│    │                                          │
│  V: Validation ──► final review of all work   │
│  C: Confirmation ──► PR + docs + PRD update   │
└───────────────────────────────────────────────┘
    │
    ▼ (optional)
┌─ devflow-runner.mjs ──────────────────────────┐
│  Reads stories.yaml, re-spawns Claude Code    │
│  if session dies. Safety net only.            │
└───────────────────────────────────────────────┘
```

## Component: stories.yaml

Located at `.context/workflow/stories.yaml`. Generated during Planning phase.

```yaml
feature: "CRUD de produtos"
autonomy: autonomous
created: 2026-04-02T14:00:00Z
escalation:
  max_retries_per_story: 2
  max_consecutive_failures: 3
  security_immediate: true
  upgrade_after_streak: 5
stats:
  total: 6
  completed: 0
  failed: 0
  escalated: 0
  consecutive_failures: 0
stories:
  - id: S1
    title: "Criar model Product com validações"
    description: "Model com campos name, price, category. Validações de required e range."
    agent: backend-specialist
    priority: 1
    status: pending
    attempts: 0
    blocked_by: []
  - id: S2
    title: "Endpoint POST /products"
    agent: backend-specialist
    priority: 2
    status: pending
    attempts: 0
    blocked_by: [S1]
```

### Status lifecycle

```
pending → in_progress → completed
                      → failed (retrying)
                      → escalated (human needed)
```

### Fields per story

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique ID (S1, S2, ...) |
| title | string | Short description |
| description | string | What to implement (fits in 1 context window) |
| agent | string | Specialist agent to dispatch |
| priority | int | Execution order (lower = first) |
| status | enum | pending, in_progress, completed, failed, escalated |
| attempts | int | Number of execution attempts |
| blocked_by | list | Story IDs that must complete first |
| duration_s | int | Time taken (filled after completion) |
| error | string | Last error message (filled on failure) |
| completed_at | datetime | Timestamp (filled on completion) |

## Component: Skill `devflow:autonomous-loop`

New skill at `skills/autonomous-loop/SKILL.md`.

### Algorithm

```
function autonomousLoop(storiesPath):
    stories = readYaml(storiesPath)
    consecutiveFailures = 0

    while hasIncompleteStories(stories):
        story = selectNext(stories)  # priority + deps resolved + not escalated
        if story == null:
            break  # all remaining are blocked or escalated

        story.status = "in_progress"
        story.attempts += 1
        writeYaml(stories)

        result = executeStory(story)

        if result.passed:
            story.status = "completed"
            story.completed_at = now()
            story.duration_s = elapsed()
            consecutiveFailures = 0
            commit(story)
            updateCheckpoint(story)

            # Upgrade check (bidirectional)
            if autonomy == "assisted" and completedStreak >= 5:
                suggestUpgrade("autonomous")

        else:  # failed
            consecutiveFailures += 1
            story.error = result.error

            if result.securityIssue:
                story.status = "escalated"
                escalateToHuman("Security issue detected", story)
                return

            if story.attempts >= maxRetries:
                story.status = "escalated"
                escalateToHuman("Max retries exceeded", story)
                consecutiveFailures = 0  # reset after escalation
            else:
                story.status = "failed"
                miniReplanning(story, result.error)
                # loop continues, will retry this story

            if consecutiveFailures >= maxConsecutive:
                escalateToHuman("Circuit breaker: consecutive failures", stories)
                return

        writeYaml(stories)

    generateReport(stories)
```

### executeStory(story)

```
1. Load agent playbook (via agent-dispatch priority chain)
2. Set up context: story description + relevant files + plan excerpt
3. Execute with TDD enforced:
   a. Agent writes failing test
   b. Agent implements to pass test
   c. Agent refactors if needed
4. Run quality gates:
   a. Typecheck (if applicable)
   b. Test suite (full, not just new tests)
   c. Security scan (if story touches auth/data/APIs)
5. Return { passed: bool, error?: string, securityIssue?: bool }
```

### escalateToHuman(reason, context)

```
1. Update stories.yaml with current state
2. Save checkpoint (handoff.md + last.json)
3. Print escalation message with:
   - Reason for escalation
   - Story that failed + error details
   - Suggestions for resolution
   - How to resume: "Fix the issue and say 'continue' to resume autonomous mode"
4. Switch autonomy mode to "assisted"
5. Wait for human input
```

## Component: devflow-runner.mjs

Optional external script using Claude Code Agent SDK.

```
node scripts/devflow-runner.mjs --stories .context/workflow/stories.yaml [--max-iterations 20]
```

### Behavior

1. Read `stories.yaml` to determine state
2. Find next pending/failed story
3. Build prompt with: story context + project state + instruction to continue loop
4. Spawn Claude Code instance via Agent SDK
5. Monitor completion (story marked completed/escalated in yaml)
6. If session dies mid-story: detect via timeout, re-spawn
7. Repeat until all stories done/escalated or max iterations reached
8. Print final report

### When to use

- Long-running features (20+ stories) where session may die
- Overnight/unattended execution
- CI/CD integration (future)

The internal skill handles everything else. The runner is purely a resilience layer.

## Integration with Existing DevFlow

### Modified files

| File | Change |
|------|--------|
| `skills/prevc-flow/SKILL.md` | Parse `autonomy:X` parameter; pass mode to phase skills |
| `skills/prevc-execution/SKILL.md` | When `autonomy != supervised`: delegate to `autonomous-loop` skill |
| `skills/prevc-planning/SKILL.md` | Generate `stories.yaml` as additional output alongside plan |
| `commands/devflow.md` | Document `autonomy:X` parameter and `auto` alias |
| `hooks/session-start` | Detect active autonomous workflow, inject loop context |
| `skills/using-devflow/SKILL.md` | Document autonomy modes in help and quick reference |

### New files

| File | Purpose |
|------|---------|
| `skills/autonomous-loop/SKILL.md` | Core loop skill |
| `scripts/devflow-runner.mjs` | External safety net |
| `templates/stories-schema.yaml` | Reference schema for stories.yaml |

## Constraints

- **No auto-push** — commits locally only; never pushes without human approval
- **Security immediate** — any security finding escalates instantly, no retries
- **Max iterations** — default 20, prevents infinite loops
- **Context window** — each story must fit in 1 context window; oversized stories get auto-decomposed during planning
- **Clean rollback** — circuit breaker produces a status report and stops cleanly
- **Backward compatible** — default mode is `supervised`, existing workflows unchanged
