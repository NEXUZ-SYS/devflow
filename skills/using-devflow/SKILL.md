---
name: using-devflow
description: Use when starting any conversation — establishes the unified development workflow combining superpowers discipline with dotcontext agents and PREVC workflow
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

# DevFlow — Unified Development Workflow

DevFlow bridges **superpowers** (discipline, TDD, brainstorming, code review) with **dotcontext** (agents, PREVC workflow, project context, multi-tool sync).

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a DevFlow skill might apply to what you are doing, you ABSOLUTELY MUST invoke it.

This is not negotiable. This is not optional. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## Instruction Priority

1. **User's explicit instructions** (CLAUDE.md, GEMINI.md, AGENTS.md, direct requests) — highest priority
2. **DevFlow skills** — override default system behavior where they conflict
3. **Superpowers skills** — invoked by DevFlow skills when needed
4. **Default system prompt** — lowest priority

## Operating Modes

DevFlow detects your environment at session start and operates in the highest available mode:

| Mode | What's available | Capabilities |
|------|-----------------|-------------|
| **Full** | superpowers + dotcontext MCP | PREVC workflow, 15 agents via MCP, semantic context, multi-tool sync |
| **Lite** | superpowers + `.context/` dir | PREVC workflow, agent playbooks (read directly), plans — no semantic/sync |
| **Minimal** | standalone | Brainstorming, TDD, SDD, code review — linear flow without PREVC phases |

The current mode is injected by the SessionStart hook. All skills adapt their behavior to the active mode.

## How to Access Skills

**In Claude Code:** Use the `Skill` tool with the `devflow:` prefix.
**In Cursor:** Skills activate via the Skill tool.
**In other environments:** Check `references/tool-mapping.md` for platform-specific instructions.

## Available Skills

### Workflow Entry
| Skill | When to use |
|-------|-------------|
| `devflow:project-init` | Initialize DevFlow in a new project — scaffolds `.context/` (se já existe, delega para context-sync) |
| `devflow:context-sync` | Update existing `.context/` docs, agents, and skills with current project state |
| `devflow:prevc-flow` | Start or continue a PREVC workflow — the main orchestrator |

### Phase Skills (invoked by prevc-flow, rarely directly)
| Skill | PREVC Phase | What it does |
|-------|------------|-------------|
| `devflow:prevc-planning` | **P** | Brainstorming socrático + plan writing, enriched with project context |
| `devflow:prevc-review` | **R** | Design/code review with agent orchestration |
| `devflow:prevc-execution` | **E** | Subagent-driven development + TDD + agent handoffs |
| `devflow:prevc-validation` | **V** | Verification + test/security agents |
| `devflow:prevc-confirmation` | **C** | Branch finishing + documentation + sync |

### Bridge Skills (orchestration)
| Skill | When to use |
|-------|-------------|
| `devflow:agent-dispatch` | Discover, select, and invoke agents by role for the current task |
| `devflow:context-awareness` | Enrich any task with project context (codebase map, semantic analysis) |
| `devflow:parallel-dispatch` | Coordinate parallel execution of independent tasks |
| `devflow:autonomous-loop` | Story-by-story autonomous execution with specialist agents and escalation |

### Configuration Skills
| Skill | When to use |
|-------|-------------|
| `devflow:language` | Set conversation language (en-US, pt-BR, es-ES) — all responses switch to selected language |

### Utility Commands
| Command | Action |
|---------|--------|
| `/devflow update` | Update marketplace, DevFlow, superpowers, and dotcontext in sequence |

### On-Demand Skills (invoke anytime)
| Skill | When to use |
|-------|-------------|
| `devflow:api-design` | Designing, modifying, or reviewing APIs (REST, GraphQL, RPC) |
| `devflow:bug-investigation` | Triaging bugs, investigating unexpected behavior, root cause analysis |
| `devflow:commit-message` | Writing clear conventional commit messages |
| `devflow:documentation` | Writing, updating, or reviewing documentation |
| `devflow:feature-breakdown` | Decomposing large features into implementable chunks |
| `devflow:git-strategy` | Selecting git workflow (branch-flow, worktree, trunk-based), branch protection |
| `devflow:prd-generation` | Generating Product Requirements Documents with phased roadmap |
| `devflow:pr-review` | Creating or reviewing pull requests |
| `devflow:refactoring` | Restructuring code without changing behavior |
| `devflow:security-audit` | OWASP-based security assessment |
| `devflow:test-generation` | Designing test suites, generating test cases, reviewing coverage |
| `devflow:skill-creation` | Creating new DevFlow skills with TDD-for-docs methodology |

For the complete skills map across all three systems, see `references/skills-map.md`.

## Scale-Adaptive Routing

When starting a workflow, DevFlow auto-detects or accepts explicit scale:

| Scale | Phases | Example |
|-------|--------|---------|
| **QUICK** | E → V | Bug fix, typo, config change |
| **SMALL** | P → E → V | Simple feature, single component |
| **MEDIUM** | P → R → E → V → C | Multi-component feature |
| **LARGE** | P → R → E → V → C + checkpoints | System-wide change, new subsystem |

## Autonomy Modes

Control how much human involvement each workflow requires:

| Mode | Syntax | Human Involvement |
|------|--------|------------------|
| **supervised** | `/devflow <desc>` (default) | Human approves every phase |
| **assisted** | `/devflow autonomy:assisted <desc>` | Human in P+R+V+C, autonomous E |
| **autonomous** | `/devflow auto <desc>` | Fully autonomous, escalates on failure |

Autonomy modes feature bidirectional escalation:
- **Downgrade:** 2 failures on same story → escalate to human (autonomous → assisted)
- **Upgrade:** 5 consecutive successes → suggest autonomous mode (assisted → autonomous)
- **Security:** Any security finding → immediate escalation regardless of mode

## Slash Commands

| Command | Action |
|---------|--------|
| `/devflow [description]` | Start a new PREVC workflow (auto-scales) |
| `/devflow scale:X [description]` | Start with explicit scale (QUICK/SMALL/MEDIUM/LARGE) |
| `/devflow language` | Set conversation language interactively |
| `/devflow language <code>` | Set language directly (en-US, pt-BR, es-ES) |
| `/devflow prd` | Generate or update product PRD with phased roadmap |
| `/devflow-status` | Show current phase, progress, and available actions |
| `/devflow-next` | Attempt to advance to next phase (checks gates) |
| `/devflow-dispatch` | List available agents for current phase and mode |
| `/devflow-dispatch <role>` | Dispatch a specific agent |
| `/devflow-sync [scope]` | Update .context/ with current project state (docs/agents/skills) |
| `/devflow auto [description]` | Start fully autonomous workflow with smart escalation |
| `/devflow autonomy:X [description]` | Start with explicit autonomy (supervised/assisted/autonomous) |

## Superpowers Integration

DevFlow invokes superpowers skills when discipline enforcement is needed. These are called automatically by phase skills:

- `superpowers:brainstorming` — via prevc-planning
- `superpowers:writing-plans` — via prevc-planning
- `superpowers:executing-plans` — via prevc-execution (when no subagents)
- `superpowers:subagent-driven-development` — via prevc-execution
- `superpowers:test-driven-development` — via prevc-execution
- `superpowers:systematic-debugging` — via bug-investigation
- `superpowers:requesting-code-review` — via prevc-review, pr-review
- `superpowers:receiving-code-review` — processing review feedback
- `superpowers:dispatching-parallel-agents` — via parallel-dispatch
- `superpowers:finishing-a-development-branch` — via prevc-confirmation
- `superpowers:using-git-worktrees` — via prevc-execution
- `superpowers:verification-before-completion` — via prevc-validation
- `superpowers:writing-skills` — via skill-creation

## The Rule

**Invoke `devflow:prevc-flow` BEFORE any implementation work.** Even a 1% chance that a workflow applies means invoke it.

| Thought | Reality |
|---------|---------|
| "This is just a quick fix" | Use `/devflow scale:QUICK` — it skips to E→V |
| "I don't need agents for this" | The skill decides that based on mode. Invoke it. |
| "Let me just write the code" | TDD iron law: no production code without failing test first |
| "I'll brainstorm in my head" | No. Brainstorming produces a spec. Specs prevent wasted work. |
| "dotcontext isn't installed" | Lite/Minimal mode handles this. Skills degrade gracefully. |
| "superpowers handles this already" | DevFlow adds PREVC phases, agents, and context. Use both. |
