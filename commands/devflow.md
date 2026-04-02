---
name: devflow
description: Start a PREVC development workflow, initialize project, or show help
user_invocable: true
---

# /devflow

Unified entry point for DevFlow. Start workflows, initialize projects, and get help.

## Usage

```
/devflow help                          # Show full help
/devflow init                          # Initialize DevFlow in this project
/devflow <description>                 # Auto-detect scale and start workflow
/devflow language                      # Set conversation language (en/pt/es)
/devflow language <code>               # Set language directly (e.g., pt-BR)
/devflow prd                           # Generate or update product PRD
/devflow prd --status                  # Show PRD phase status
/devflow scale:QUICK <description>     # Explicit scale
/devflow scale:SMALL <description>
/devflow scale:MEDIUM <description>
/devflow scale:LARGE <description>
```

## Related Commands

```
/devflow-status                        # Show current phase and progress
/devflow-next                          # Advance to next phase
/devflow-dispatch [role]               # Dispatch or recommend agents
/devflow-sync [docs|agents|skills]     # Update .context/ with current project state
```

## Behavior

### `/devflow help`
Display the help text below. Output it **exactly as-is** (formatted for terminal). Do not invoke any other skill — just print the help and stop.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DevFlow — Unified Development Workflow
  Bridges superpowers (discipline/TDD) + dotcontext (agents/context)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMANDS
  /devflow help               Show this help
  /devflow init               Initialize DevFlow (or sync if already exists)
  /devflow language           Set conversation language (en/pt/es)
  /devflow language <code>    Set language directly (en-US, pt-BR, es-ES)
  /devflow prd                Generate or update product PRD
  /devflow prd --status       Show PRD phase status
  /devflow <desc>             Start workflow (auto-detects scale)
  /devflow-status             Show current phase, progress, and mode
  /devflow-next               Advance to next phase (checks gates)
  /devflow-dispatch           Recommend best agent for current task
  /devflow-dispatch <role>    Dispatch a specific specialist agent
  /devflow-sync               Update .context/ with current project state
  /devflow-sync <scope>       Update only docs, agents, or skills

SCALE
  /devflow scale:QUICK <d>    Bug fix, typo         → E → V
  /devflow scale:SMALL <d>    Simple feature         → P → E → V
  /devflow scale:MEDIUM <d>   Multi-component        → P → R → E → V → C
  /devflow scale:LARGE <d>    System-wide change     → P → R → E → V → C + checkpoints

PHASES (PREVC)
  P  Planning       Brainstorming, context enrichment, plan writing
  R  Review         Design review, security pre-check, agent validation
  E  Execution      TDD, agent handoffs, subagent-driven development
  V  Validation     Tests, security audit, spec compliance
  C  Confirmation   Branch finish, docs update, PR creation

AGENTS (15 specialists)
  architect               product-manager         feature-developer
  bug-fixer               code-reviewer           test-writer
  documentation-writer    refactoring-specialist  performance-optimizer
  security-auditor        backend-specialist      frontend-specialist
  database-specialist     devops-specialist       mobile-specialist

ON-DEMAND CAPABILITIES (used automatically or via natural language)
  API Design              "design the API for user endpoints"
  Bug Investigation       "investigate the timeout in login"
  Commit Messages         "write a commit message for these changes"
  Context Enrichment      "what context is relevant for this task?"
  Documentation           "update the docs for the auth module"
  Feature Breakdown       "break down the caching feature"
  Git Strategy            "what branch strategy for this feature?"
  Parallel Dispatch       "run these tasks in parallel"
  PRD Generation          "generate a product roadmap"
  PR Review               "review this PR" / "create a PR"
  Refactoring             "refactor the payment module safely"
  Security Audit          "audit the auth code for vulnerabilities"
  Test Generation         "generate tests for the user service"
  Brainstorming           "let's brainstorm the search feature"
  TDD                     "implement with TDD"
  Debugging               "debug the memory leak in worker"
  Code Review             "review my implementation"

OPERATING MODES
  Full      dotcontext MCP + superpowers (agent orchestration, semantic analysis)
  Lite      .context/ files + superpowers (read-only agents, manual tracking)
  Minimal   superpowers only (brainstorming, TDD, code review)

  Mode is auto-detected at session start. Check with /devflow-status

SETUP (one-time, no terminal)
  1. claude plugin install superpowers@claude-plugins-official --scope user
  2. claude plugin marketplace add NEXUZ-SYS/devflow
  3. claude plugin install devflow@NEXUZ-SYS --scope user
  4. npm install -g @dotcontext/cli          (optional, enables Full mode)

  Ou dentro do Claude Code (sem "claude" na frente):
  1. /plugin install superpowers@claude-plugins-official --scope user
  2. /plugin marketplace add NEXUZ-SYS/devflow
  3. /plugin install devflow@NEXUZ-SYS --scope user

EXAMPLES
  /devflow init
    → Scans project, scaffolds .context/ with agents, skills, and docs
    → If .context/ already exists, runs sync to update existing content

  /devflow-sync
    → Updates all .context/ docs, agents, and skills with current project state

  /devflow-sync docs
    → Updates only .context/docs/ files

  /devflow fix the login timeout bug
    → Auto-detects QUICK, runs E → V

  /devflow add user profile page with avatar upload
    → Auto-detects MEDIUM, runs P → R → E → V → C

  /devflow scale:LARGE migrate from REST to GraphQL
    → Full PREVC with checkpoints and parallel agent dispatch

  /devflow-status
    → E Execution ● In Progress (7/12 tasks) — Full mode

  /devflow-dispatch security-auditor
    → Dispatches the security auditor for the current task

  /devflow-dispatch
    → Recommends: backend-specialist → test-writer (based on context)

  /devflow-next
    → Gate check passed. Advancing to V (Validation)...

QUICK REFERENCE
  I want to...                  Use this
  ─────────────────────────────────────────────────────
  Change language               /devflow language
  Define product roadmap        /devflow prd
  Check roadmap progress        /devflow prd --status
  Start a new feature           /devflow <description>
  Fix a bug                     /devflow scale:QUICK <desc>
  Update project context        /devflow-sync
  Check current progress        /devflow-status
  Advance to next phase         /devflow-next
  List available agents         /devflow-dispatch
  Dispatch a specialist         /devflow-dispatch <role>
  Design an API                 "design the API for X"
  Write tests                   "generate tests for X"
  Review code                   "review the implementation"
  Check security                "audit X for vulnerabilities"
  Debug a tricky issue          "debug the X issue"
  Break down a big feature      "break down the X feature"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DevFlow v0.6.0 — https://github.com/NEXUZ-SYS/devflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### `/devflow language [code]`
1. Invoke `devflow:language` skill
2. If code provided (e.g., `pt-BR`, `es`, `português`), skip the interactive menu
3. Saves `.devflow-language` in project root (or `~/.devflow-language` for global)
4. Switches conversation language immediately
5. Hook messages switch on next session start

### `/devflow prd`
1. Invoke `devflow:prd-generation` skill
2. Auto-detects Modo A (new project) vs Modo B (existing codebase)
3. Generates complete PRD with phased roadmap in `.context/plans/<project>-prd.md`

### `/devflow prd --status`
1. Read `.context/plans/*-prd.md`
2. If found: display phase summary with status indicators (✓ ⏳ ⬚)
3. If not found: suggest running `/devflow prd` first

### `/devflow init`
1. Invoke `devflow:project-init` skill
2. Se `.context/docs/` já existe → delega para `devflow:context-sync` (atualização)
3. Se não existe → scaffolds `.context/` com agents, skills, e docs do zero
4. Output é 100% dotcontext-compatible
5. Enables Lite mode automatically

### `/devflow-sync [scope]`
1. Invoke `devflow:context-sync` skill
2. Atualiza `.context/` existente com o estado atual do projeto
3. Scope opcional: `docs`, `agents`, `skills` (default: tudo)
4. Usa dotcontext MCP (Full) ou scan standalone (Lite)

### `/devflow [description]`
1. Parse the description and optional scale parameter
2. Invoke `devflow:prevc-flow` skill
3. The skill handles mode detection, scale routing, and phase orchestration

## Arguments

- `help` — display the full help reference
- `init` — triggers project initialization (devflow:project-init)
- `prd` — generate or update product PRD (devflow:prd-generation)
- `language` — interactive language selection (devflow:language)
- `language <code>` — set language directly (en-US, pt-BR, es-ES)
- `prd --status` — display PRD phase status
- `scale:X` — optional explicit scale (QUICK/SMALL/MEDIUM/LARGE)
- Everything else is passed as the task description to the PREVC flow orchestrator
