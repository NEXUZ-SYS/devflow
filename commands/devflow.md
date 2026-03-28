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
  /devflow init               Initialize DevFlow in this project
  /devflow <desc>             Start workflow (auto-detects scale)
  /devflow-status             Show current phase, progress, and mode
  /devflow-next               Advance to next phase (checks gates)
  /devflow-dispatch           Recommend best agent for current task
  /devflow-dispatch <role>    Dispatch a specific specialist agent

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

AGENTS (14 specialists)
  architect               feature-developer       bug-fixer
  code-reviewer           test-writer             documentation-writer
  refactoring-specialist  performance-optimizer   security-auditor
  backend-specialist      frontend-specialist     database-specialist
  devops-specialist       mobile-specialist

ON-DEMAND CAPABILITIES (used automatically or via natural language)
  API Design              "design the API for user endpoints"
  Bug Investigation       "investigate the timeout in login"
  Commit Messages         "write a commit message for these changes"
  Context Enrichment      "what context is relevant for this task?"
  Documentation           "update the docs for the auth module"
  Feature Breakdown       "break down the caching feature"
  Git Strategy            "what branch strategy for this feature?"
  Parallel Dispatch       "run these tasks in parallel"
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
  Start a new feature           /devflow <description>
  Fix a bug                     /devflow scale:QUICK <desc>
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
  DevFlow v0.1.0 — https://github.com/NEXUZ-SYS/devflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### `/devflow init`
1. Invoke `devflow:project-init` skill
2. Scans the project (stack, structure, patterns)
3. Scaffolds `.context/` with project-aware agents, skills, and docs
4. Output is 100% dotcontext-compatible
5. Enables Lite mode automatically

### `/devflow [description]`
1. Parse the description and optional scale parameter
2. Invoke `devflow:prevc-flow` skill
3. The skill handles mode detection, scale routing, and phase orchestration

## Arguments

- `help` — display the full help reference
- `init` — triggers project initialization (devflow:project-init)
- `scale:X` — optional explicit scale (QUICK/SMALL/MEDIUM/LARGE)
- Everything else is passed as the task description to the PREVC flow orchestrator
