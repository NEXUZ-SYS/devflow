# Unified Skills Map

Complete index of all skills across DevFlow, superpowers, and dotcontext. Each skill is listed with its origin, invocation prefix, and which PREVC phases it applies to.

## Legend

- **Origin:** Which system provides the skill
- **Invoke as:** The prefix:name to use with the Skill tool
- **Phases:** PREVC phases where this skill is relevant (P/R/E/V/C or `any` for on-demand)
- **Mode:** Minimum DevFlow mode required (Full/Lite/Minimal)

---

## Workflow & Orchestration

| Skill | Origin | Invoke as | Phases | Mode | Description |
|-------|--------|-----------|--------|------|-------------|
| using-devflow | devflow | `devflow:using-devflow` | any | Minimal | Meta-skill: entry point for the unified system |
| prevc-flow | devflow | `devflow:prevc-flow` | any | Minimal | Main PREVC workflow orchestrator with scale routing |
| prevc-planning | devflow | `devflow:prevc-planning` | P | Minimal | Brainstorming + plan writing with context enrichment |
| prevc-review | devflow | `devflow:prevc-review` | R | Minimal | Design/code review with agent orchestration |
| prevc-execution | devflow | `devflow:prevc-execution` | E | Minimal | SDD + TDD + agent handoffs |
| prevc-validation | devflow | `devflow:prevc-validation` | V | Minimal | Verification + test/security agents |
| prevc-confirmation | devflow | `devflow:prevc-confirmation` | C | Minimal | Branch finishing + docs + sync |

## Discipline & Process (from superpowers)

| Skill | Origin | Invoke as | Phases | Mode | Description |
|-------|--------|-----------|--------|------|-------------|
| brainstorming | superpowers | `superpowers:brainstorming` | P | Minimal | 9-step Socratic design refinement |
| writing-plans | superpowers | `superpowers:writing-plans` | P | Minimal | Bite-sized implementation plans (2-5 min tasks) |
| executing-plans | superpowers | `superpowers:executing-plans` | E | Minimal | Sequential plan execution with checkpoints |
| subagent-driven-development | superpowers | `superpowers:subagent-driven-development` | E | Minimal | Fresh subagent per task + 2-stage review |
| test-driven-development | superpowers | `superpowers:test-driven-development` | E, V | Minimal | TDD iron law: RED → GREEN → REFACTOR |
| systematic-debugging | superpowers | `superpowers:systematic-debugging` | E | Minimal | 4-phase root cause analysis |
| requesting-code-review | superpowers | `superpowers:requesting-code-review` | R, V | Minimal | Structured code review requests |
| receiving-code-review | superpowers | `superpowers:receiving-code-review` | R, V | Minimal | Processing review feedback and applying fixes |
| dispatching-parallel-agents | superpowers | `superpowers:dispatching-parallel-agents` | E | Minimal | Parallel subagent dispatch for independent tasks |
| using-git-worktrees | superpowers | `superpowers:using-git-worktrees` | E | Minimal | Isolated workspaces for feature development |
| finishing-a-development-branch | superpowers | `superpowers:finishing-a-development-branch` | C | Minimal | Branch cleanup, merge strategy, final verification |
| verification-before-completion | superpowers | `superpowers:verification-before-completion` | V | Minimal | Pre-merge verification checklist |
| writing-skills | superpowers | `superpowers:writing-skills` | any | Minimal | TDD-driven skill creation methodology |

## Bridge Skills (devflow → both systems)

| Skill | Origin | Invoke as | Phases | Mode | Description |
|-------|--------|-----------|--------|------|-------------|
| agent-dispatch | devflow | `devflow:agent-dispatch` | any | Lite | Discover, select, and invoke specialist agents |
| context-awareness | devflow | `devflow:context-awareness` | any | Minimal | Enrich tasks with project context |
| api-design | devflow | `devflow:api-design` | P, E | Minimal | API design patterns, contracts, and documentation |
| bug-investigation | devflow | `devflow:bug-investigation` | E | Minimal | Structured bug triage and root cause analysis |
| commit-message | devflow | `devflow:commit-message` | E, C | Minimal | Conventional commit messages with context |
| documentation | devflow | `devflow:documentation` | C | Minimal | Documentation standards and maintenance |
| feature-breakdown | devflow | `devflow:feature-breakdown` | P | Minimal | Decompose features into implementable chunks |
| pr-review | devflow | `devflow:pr-review` | R, C | Minimal | Pull request review and creation standards |
| refactoring | devflow | `devflow:refactoring` | E | Minimal | Safe refactoring patterns with test preservation |
| security-audit | devflow | `devflow:security-audit` | R, V | Minimal | OWASP-based security assessment |
| test-generation | devflow | `devflow:test-generation` | E, V | Minimal | Test design, coverage strategy, and generation |
| parallel-dispatch | devflow | `devflow:parallel-dispatch` | E | Minimal | Coordinate parallel agent execution |
| skill-creation | devflow | `devflow:skill-creation` | any | Minimal | Create new devflow skills with TDD methodology |

## dotcontext MCP Skills (Full mode only)

These skills are provided by dotcontext's MCP server. In Full mode, they are called via MCP tools. In Lite/Minimal mode, the DevFlow bridge skills above provide equivalent guidance from Markdown.

| Skill | Invoke via MCP | Phases | Description |
|-------|---------------|--------|-------------|
| api-design | `skill({ action: "getContent", skill: "api-design" })` | P, E | API design patterns and contracts |
| bug-investigation | `skill({ action: "getContent", skill: "bug-investigation" })` | E | Bug triage and investigation |
| code-review | `skill({ action: "getContent", skill: "code-review" })` | R, V | Code quality review |
| commit-message | `skill({ action: "getContent", skill: "commit-message" })` | E, C | Commit message standards |
| documentation | `skill({ action: "getContent", skill: "documentation" })` | C | Documentation maintenance |
| feature-breakdown | `skill({ action: "getContent", skill: "feature-breakdown" })` | P | Feature decomposition |
| pr-review | `skill({ action: "getContent", skill: "pr-review" })` | R, C | PR review process |
| refactoring | `skill({ action: "getContent", skill: "refactoring" })` | E | Refactoring patterns |
| security-audit | `skill({ action: "getContent", skill: "security-audit" })` | R, V | Security assessment |
| test-generation | `skill({ action: "getContent", skill: "test-generation" })` | E, V | Test design and generation |

## How Skills Compose

```
User runs /flow "add caching layer"
  │
  ├─ devflow:prevc-flow (orchestrator)
  │   ├─ Scale: MEDIUM → P → R → E → V → C
  │   │
  │   ├─ P: devflow:prevc-planning
  │   │   ├─ devflow:context-awareness (gather codebase context)
  │   │   ├─ devflow:feature-breakdown (decompose the feature)
  │   │   ├─ superpowers:brainstorming (9-step Socratic design)
  │   │   ├─ devflow:api-design (if API changes needed)
  │   │   └─ superpowers:writing-plans (create implementation plan)
  │   │
  │   ├─ R: devflow:prevc-review
  │   │   ├─ devflow:pr-review (review plan as if it were a PR)
  │   │   ├─ devflow:security-audit (early security check)
  │   │   └─ superpowers:requesting-code-review (structured review)
  │   │
  │   ├─ E: devflow:prevc-execution
  │   │   ├─ superpowers:subagent-driven-development (task dispatch)
  │   │   ├─ superpowers:test-driven-development (TDD per task)
  │   │   ├─ devflow:test-generation (test strategy per component)
  │   │   ├─ devflow:refactoring (if code restructuring needed)
  │   │   ├─ devflow:commit-message (per-task commits)
  │   │   ├─ devflow:agent-dispatch (specialist handoffs)
  │   │   └─ devflow:parallel-dispatch (independent tasks in parallel)
  │   │
  │   ├─ V: devflow:prevc-validation
  │   │   ├─ superpowers:verification-before-completion
  │   │   ├─ devflow:test-generation (coverage review)
  │   │   ├─ devflow:security-audit (implementation review)
  │   │   └─ devflow:bug-investigation (if issues found)
  │   │
  │   └─ C: devflow:prevc-confirmation
  │       ├─ superpowers:finishing-a-development-branch
  │       ├─ devflow:documentation (update docs)
  │       ├─ devflow:pr-review (create/review PR)
  │       └─ devflow:commit-message (final commit)
```

## Quick Reference: Which Skill Do I Need?

| I want to... | Use this skill |
|--------------|---------------|
| Start a new feature | `devflow:prevc-flow` → auto-routes |
| Fix a bug | `devflow:prevc-flow` scale:QUICK or `devflow:bug-investigation` |
| Design an API | `devflow:api-design` |
| Write tests | `devflow:test-generation` + `superpowers:test-driven-development` |
| Review code | `devflow:pr-review` or `superpowers:requesting-code-review` |
| Refactor safely | `devflow:refactoring` |
| Check security | `devflow:security-audit` |
| Write a commit | `devflow:commit-message` |
| Create a PR | `devflow:pr-review` |
| Update docs | `devflow:documentation` |
| Run tasks in parallel | `devflow:parallel-dispatch` |
| Create a new skill | `devflow:skill-creation` |
| Debug a tricky issue | `superpowers:systematic-debugging` + `devflow:bug-investigation` |
| Break down a big feature | `devflow:feature-breakdown` |
