# DevFlow

Unified software development workflow that bridges [superpowers](https://github.com/obra/superpowers) (discipline, TDD, brainstorming) with [dotcontext](https://github.com/vinilana/dotcontext) (agents, PREVC workflow, project context).

Pure Markdown + shell. No runtime dependencies. Works as a plugin for Claude Code, Cursor, Codex, Gemini CLI, and OpenCode.

## What It Does

- **PREVC workflow** (from dotcontext): 5-phase gated process — Planning, Review, Execution, Validation, Confirmation
- **Scale-adaptive routing**: QUICK (E→V), SMALL (P→E→V), MEDIUM/LARGE (full P→R→E→V→C)
- **21 skills**: PREVC phases, on-demand expertise (API design, security audit, test generation...), and project initialization
- **14 specialist agents**: architect, feature-developer, bug-fixer, code-reviewer, test-writer, and 9 more
- **Project-aware scaffolding**: `/flow init` scans your project and generates project-specific agents, skills, and docs in `.context/` (100% dotcontext-compatible)
- **Discipline enforcement** (from superpowers): TDD iron law, Socratic brainstorming, 2-stage code review, anti-rationalization
- **Graceful degradation**: Works in Full (MCP), Lite (.context/ files), or Minimal (standalone) mode

## Installation

### Claude Code (plugin)

```bash
# From the Claude Code marketplace
/plugin install devflow

# Or manually
claude plugin add /path/to/devflow
```

### Cursor

Copy the `.cursor-plugin/` directory or install as a Cursor plugin.

### Other platforms

See `references/tool-mapping.md` for platform-specific setup.

## Prerequisites

### Required
- **superpowers** plugin installed (provides brainstorming, TDD, SDD, code review skills)

### Optional (enables Full mode)
- **dotcontext** MCP server running (`npx dotcontext mcp:install`)
- `.context/` directory initialized (`npx dotcontext init`)

### Standalone (Minimal mode)
DevFlow works without either dependency, but with reduced capabilities.

## Quick Start

```bash
# 1. Initialize DevFlow in your project (scaffolds .context/)
/flow init

# 2. Start a workflow
/flow add user authentication with OAuth

# 3. Or with explicit scale
/flow scale:QUICK fix typo in README
```

## Usage

```bash
# Workflow management
/flow init                              # Initialize project context
/flow [description]                     # Start workflow (auto-scale)
/flow scale:MEDIUM [description]        # Start with explicit scale

# Phase navigation
/phase                                  # Show current phase
/phase advance                          # Advance to next phase

# Agent management
/agents                                 # List available agents
/agents dispatch backend-specialist     # Dispatch specific agent
```

## Operating Modes

| Mode | What you need | What you get |
|------|--------------|-------------|
| **Full** | superpowers + dotcontext MCP | Everything: PREVC, agents via MCP, semantic context, multi-tool sync |
| **Lite** | superpowers + `.context/` dir | PREVC, agent playbooks (read directly), plans |
| **Minimal** | superpowers (or standalone) | Brainstorming, TDD, SDD, code review — linear flow |

Mode is auto-detected at session start.

## Structure

```
devflow/
├── skills/           # 21 skills (meta, PREVC phases, bridge, on-demand)
├── agents/           # 14 specialist agent playbooks (generic fallback)
├── templates/        # Scaffold templates for .context/ generation
├── hooks/            # SessionStart hook with mode detection
├── commands/         # /flow, /phase, /agents slash commands
├── references/       # Skills map + tool mapping
├── .claude-plugin/   # Claude Code plugin manifest
└── .cursor-plugin/   # Cursor plugin manifest
```

### Generated per-project (by `/flow init`)
```
your-project/
└── .context/         # dotcontext-compatible, project-specific
    ├── agents/       # Project-aware agent playbooks
    ├── skills/       # Project-aware skill guides
    ├── docs/         # Project documentation
    └── plans/        # PREVC workflow plans
```

## How It Bridges

```
┌─────────────────────────────────────────────┐
│                  DevFlow                     │
│         (skills + agents + hooks)            │
├──────────────────┬──────────────────────────┤
│   superpowers    │       dotcontext          │
│   (discipline)   │   (context + workflow)    │
├──────────────────┼──────────────────────────┤
│ brainstorming    │ PREVC phases             │
│ TDD iron law     │ 14 agent roles           │
│ SDD (subagents)  │ semantic analysis        │
│ 2-stage review   │ plan management          │
│ anti-rational.   │ multi-tool sync          │
│ git worktrees    │ scale-adaptive routing   │
└──────────────────┴──────────────────────────┘
```

## License

MIT
