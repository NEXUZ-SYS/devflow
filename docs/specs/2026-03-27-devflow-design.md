# DevFlow — Embedded Bridge Design Spec

> **For agentic workers:** This is a design document, not an implementation plan.

**Goal:** Create a pure Markdown + shell framework that unifies superpowers (discipline/tools) and dotcontext (agents/workflow/context) via a plugin layer that modifies neither project.

**Architecture:** Option D (bridge plugin) with graceful degradation across 3 modes.

---

## 1. Operating Modes

DevFlow detects available systems at session start and operates in the highest available mode:

| Mode | Requirements | Capabilities |
|------|-------------|-------------|
| **Full** | superpowers installed + dotcontext MCP running | PREVC workflow, 14 agents with MCP orchestration, semantic context, multi-tool sync |
| **Lite** | superpowers installed + `.context/` directory exists | PREVC workflow, agent playbooks (direct read), plans, no semantic/sync |
| **Minimal** | superpowers installed (or standalone) | Brainstorming, TDD, SDD, code review — linear flow without PREVC |

Detection logic in `hooks/session-start`:
1. Check if `superpowers:brainstorming` skill is resolvable → superpowers available
2. Check if dotcontext MCP tools respond → Full mode
3. Check if `.context/` directory exists → Lite mode
4. Otherwise → Minimal mode

## 2. PREVC Phase Mapping

Each PREVC phase maps to specific superpowers skills + dotcontext capabilities:

### P — Planning
- **Superpowers:** `brainstorming` (9-step socrático), `writing-plans`
- **dotcontext (Full):** `context.buildSemantic` feeds brainstorm, `plan.scaffold` + `plan.link`
- **dotcontext (Lite):** Read `.context/docs/project-overview.md` for context
- **Minimal fallback:** Pure superpowers brainstorming → spec → plan

### R — Review
- **Superpowers:** `requesting-code-review`, anti-rationalization enforcement
- **dotcontext (Full):** `agent.orchestrate(phase:"R")` → architect + code-reviewer agents
- **dotcontext (Lite):** Read architect + code-reviewer playbooks, apply manually
- **Minimal fallback:** Superpowers code-review only

### E — Execution
- **Superpowers:** `subagent-driven-development`, `test-driven-development` (iron law)
- **dotcontext (Full):** `agent.getSequence` for handoff order, `plan.updateStep` for tracking
- **dotcontext (Lite):** Read agent playbooks for role-specific guidance
- **Minimal fallback:** Pure SDD + TDD per superpowers

### V — Validation
- **Superpowers:** `verification-before-completion`
- **dotcontext (Full):** test-writer + security-auditor agents, `plan.commitPhase("V")`
- **dotcontext (Lite):** Read test-writer + security-auditor playbooks
- **Minimal fallback:** Superpowers verification only

### C — Confirmation
- **Superpowers:** `finishing-a-development-branch`, `using-git-worktrees`
- **dotcontext (Full):** documentation-writer agent, `sync.exportContext`
- **dotcontext (Lite):** Read documentation-writer playbook
- **Minimal fallback:** Superpowers branch finishing only

## 3. Scale-Adaptive Routing

Adopted from dotcontext, determines which PREVC phases are required:

| Scale | Trigger | Phases |
|-------|---------|--------|
| **QUICK** | Bug fix, typo, config change | E → V |
| **SMALL** | Simple feature, single component | P → E → V |
| **MEDIUM** | Multi-component feature | P → R → E → V → C |
| **LARGE** | System-wide change, new subsystem | P → R → E → V → C (with checkpoints) |

Scale is auto-detected from task description or explicitly set via `/devflow scale:MEDIUM`.

## 4. Skill Architecture

All skills follow superpowers format (YAML frontmatter with `name` + `description`):

### Meta Skills
- **using-devflow** — Entry point. Loaded at session start. Explains the unified system, mode detection, available skills.
- **prevc-flow** — Main orchestrator. Routes to phase-specific skills based on current phase and scale.

### Phase Skills
- **prevc-planning** — Wraps superpowers brainstorming + writing-plans with dotcontext context enrichment
- **prevc-review** — Wraps superpowers code-review with dotcontext agent orchestration
- **prevc-execution** — Wraps superpowers SDD + TDD with dotcontext agent sequencing
- **prevc-validation** — Wraps superpowers verification with dotcontext test/security agents
- **prevc-confirmation** — Wraps superpowers branch-finishing with dotcontext docs/sync

### Bridge Skills
- **agent-dispatch** — Resolves and invokes agents by role, with mode-aware fallback
- **context-awareness** — Detects project context, enriches prompts with codebase knowledge

## 5. Agent Playbooks

14 agents from dotcontext, adapted to reference superpowers skills. Format:

```yaml
---
type: agent
name: <agent-name>
description: <one-line>
role: <developer|reviewer|specialist|architect>
phases: [P, R, E, V, C]  # which PREVC phases this agent participates in
skills: [list of devflow skills this agent uses]
---
```

Sections: Mission, Responsibilities, Workflow Steps, Skills Integration, Handoff Protocol.

## 6. Hook System

### hooks.json
```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|clear|compact",
      "hooks": [{
        "type": "command",
        "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
        "async": false
      }]
    }]
  }
}
```

### session-start
1. Detect superpowers installation
2. Detect dotcontext MCP availability (try calling `context` tool)
3. Detect `.context/` directory
4. Set mode (Full/Lite/Minimal)
5. Inject `using-devflow` skill content with mode info

## 7. Slash Commands

- `/devflow [description]` — Start a new PREVC workflow (auto-scales)
- `/devflow scale:X [description]` — Start with explicit scale
- `/devflow-status` — Show current phase and progress
- `/devflow-next` — Attempt to advance to next phase (checks gates)
- `/devflow-dispatch` — List available agents for current phase
- `/devflow-dispatch <role>` — Dispatch specific agent

## 8. File Structure

```
devflow/
├── skills/
│   ├── using-devflow/SKILL.md
│   ├── prevc-flow/SKILL.md
│   ├── prevc-planning/SKILL.md
│   ├── prevc-review/SKILL.md
│   ├── prevc-execution/SKILL.md
│   ├── prevc-validation/SKILL.md
│   ├── prevc-confirmation/SKILL.md
│   ├── agent-dispatch/SKILL.md
│   └── context-awareness/SKILL.md
├── agents/
│   ├── architect.md
│   ├── feature-developer.md
│   ├── bug-fixer.md
│   ├── code-reviewer.md
│   ├── test-writer.md
│   ├── documentation-writer.md
│   ├── refactoring-specialist.md
│   ├── performance-optimizer.md
│   ├── security-auditor.md
│   ├── backend-specialist.md
│   ├── frontend-specialist.md
│   ├── database-specialist.md
│   ├── devops-specialist.md
│   └── mobile-specialist.md
├── hooks/
│   ├── hooks.json
│   ├── run-hook.cmd
│   └── session-start
├── commands/
│   ├── flow.md
│   ├── phase.md
│   └── agents.md
├── references/
│   └── tool-mapping.md
├── .claude-plugin/
│   └── plugin.json
├── .cursor-plugin/
│   └── plugin.json
└── README.md
```

## 9. Integration Points

### With superpowers (skill references)
DevFlow skills invoke superpowers skills via the standard `superpowers:<skill-name>` prefix:
- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `superpowers:executing-plans`
- `superpowers:subagent-driven-development`
- `superpowers:test-driven-development`
- `superpowers:systematic-debugging`
- `superpowers:requesting-code-review`
- `superpowers:finishing-a-development-branch`
- `superpowers:using-git-worktrees`
- `superpowers:verification-before-completion`

### With dotcontext (MCP tool calls)
In Full mode, DevFlow skills call dotcontext MCP tools:
- `context({ action: "buildSemantic" })`
- `agent({ action: "orchestrate", phase: "X" })`
- `agent({ action: "getSequence", task: "..." })`
- `plan({ action: "scaffold" })`, `plan({ action: "link" })`
- `plan({ action: "updateStep" })`, `plan({ action: "commitPhase" })`
- `sync({ action: "exportContext" })`
- `workflow-init`, `workflow-advance`, `workflow-status`

### Fallback chain
Each integration point follows: MCP tool → direct file read → skip gracefully.

## 10. Anti-Rationalization (inherited from superpowers)

All enforcement mechanisms from superpowers are preserved:
- TDD iron law (no production code without failing test)
- Hard gates (no code before design approval)
- Anti-pattern tables in each skill
- 2-stage code review (spec compliance + code quality)
- Subagent isolation (fresh context per task)

These apply regardless of operating mode.
