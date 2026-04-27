---
type: doc
name: project-overview
description: High-level overview of DevFlow, a unified development workflow plugin that bridges superpowers and dotcontext
category: overview
generated: 2026-04-14
status: filled
scaffoldVersion: "2.0.0"
---

## Project Overview

DevFlow is a plugin system and workflow orchestrator for Claude Code (and compatible IDEs: Cursor, Codex, Gemini CLI). It bridges two foundational systems — **superpowers** (discipline: TDD, brainstorming, code review, SDD) and **dotcontext** (agent orchestration, project context management) — into a cohesive **PREVC workflow** (Planning → Review → Execution → Validation → Confirmation).

The plugin provides 32 skills, 16 specialist agent playbooks, 6 CLI commands, and a hook-based lifecycle system. It operates in three modes (Full, Lite, Minimal) with graceful degradation. Optional MemPalace integration adds persistent semantic memory across sessions.

## Codebase Reference

- **Repository**: https://github.com/NEXUZ-SYS/devflow
- **License**: MIT (NEXUZ-SYS 2026)
- **Version**: 0.10.5

## Quick Facts

| Key | Value |
|-----|-------|
| Type | Plugin system + Workflow orchestrator |
| Primary language | Markdown (skills/agents/docs) + Bash (hooks) + JSON (config) |
| Runtime deps | Node.js 20+, Git 2.x+, Claude Code |
| Plugin deps | superpowers (required), dotcontext (optional for Full mode) |
| Skills | 32 (PREVC phases + bridge + on-demand) |
| Agents | 16 specialist playbooks |
| Commands | 6 (`/devflow`, `/devflow-sync`, `/devflow-status`, `/devflow-next`, `/devflow-dispatch`, `/devflow-recall`) |

## Entry Points

| Entry Point | Description |
|-------------|-------------|
| `commands/devflow.md` | Main `/devflow` command dispatcher — routes to init, prevc-flow, prd, help |
| `skills/using-devflow/SKILL.md` | Meta-skill loaded at session start — system entry point |
| `hooks/session-start` | Bash hook: detects operating mode (Full/Lite/Minimal), injects context |
| `skills/prevc-flow/SKILL.md` | PREVC orchestrator: routes tasks through phases with gate checks |

## Key Exports

DevFlow exports no runtime code. It provides:
- **Skills** — Markdown-based workflow instructions loaded by Claude Code's skill system
- **Agents** — Specialist playbooks that guide AI subagents
- **Commands** — Slash commands for user interaction
- **Hooks** — Lifecycle hooks for mode detection, checkpointing, and state rehydration

## File Structure

```
devflow/
├── commands/           — 6 slash command definitions (/devflow, /devflow-sync, etc.)
├── skills/             — 32 skill directories, each with SKILL.md
├── agents/             — 16 specialist agent playbooks (architect, backend, security, memory, etc.)
├── templates/          — Scaffold templates for agents, skills, and docs
├── hooks/              — 7 lifecycle hooks (session-start, pre/post-compact, pre/post-tool-use)
├── references/         — Skills map + tool compatibility matrix
├── scripts/            — Version bump + pre-commit validation
├── docs/               — Additional documentation (tutorial, etc.)
├── .claude-plugin/     — Plugin manifest + marketplace registration
├── .cursor-plugin/     — Cursor IDE plugin manifest
├── .context/           — Per-project generated context (agents, skills, docs, plans, workflow)
├── README.md           — Complete setup + usage guide
└── LICENSE             — MIT
```

## Technology Stack Summary

- **Markdown + YAML frontmatter** — All content (skills, agents, commands, docs)
- **Bash** — Hooks and utility scripts
- **JSON** — Plugin manifests, MCP config, checkpoint state
- **dotcontext v2** — Context format standard (scaffoldVersion: "2.0.0")
- **Claude Code Plugin System** — Runtime environment

## Getting Started Checklist

1. Install superpowers plugin: `claude plugin install superpowers@claude-plugins-official --scope user`
2. Add DevFlow to marketplace: `claude plugin marketplace add NEXUZ-SYS/devflow`
3. Install DevFlow: `claude plugin install devflow@NEXUZ-SYS --scope user`
4. (Optional) Install dotcontext for Full mode: `npm i -g @dotcontext/cli && dotcontext mcp:install claude --local`
5. Run `/devflow init` in your project to scaffold `.context/`
6. Start a workflow: `/devflow <task description>`

## ADR System v2

Since v0.13.0, DevFlow ships an ADR (Architecture Decision Records) subsystem (template v2.1.0):

- **Skill `devflow:adr-builder`** — 3 modes: CREATE (guided/free/prefilled), AUDIT (12 deterministic checks), EVOLVE (patch/minor/major/refine).
- **Lib Node (zero deps, stdlib only)** — `scripts/adr-audit.mjs`, `adr-update-index.mjs`, `adr-evolve.mjs`, plus `lib/adr-frontmatter.mjs`, `adr-graph.mjs`, `adr-semver.mjs`. Cross-project compatible — no `package.json` introduced.
- **Active integration** — `prevc-planning` Step 3.5 detects architectural decisions and offers ADR creation; `prevc-validation` Step 2.6 audits touched ADRs via gate; `adr-filter` reads v2 schema (14-column README) and emits Kind tags.
- **Filename convention** — `NNN-<slug>-v<major>.<minor>.<patch>.md` (semver in filename; rename on patch/minor; new file on major with `supersedes`).
- **Commands** — `/devflow adr:new`, `/devflow adr:audit`, `/devflow adr:evolve`. See `skills/adr-builder/SKILL.md` for details.

## Next Steps

- Use `/devflow <description>` to start a PREVC workflow
- Use `/devflow prd` to generate a product roadmap
- Use `/devflow adr:new` to register an architectural decision
- Use `/devflow-dispatch` to see available specialist agents
- Use `/devflow-sync` to update `.context/` after significant changes
