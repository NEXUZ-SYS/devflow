---
name: napkin
description: "Persistent learning memory — curated runbook of mistakes, corrections, and patterns that work. Always active, every session."
---

# Napkin Runbook

Persistent learning memory for agents. Based on [blader/napkin v6.0.0](https://github.com/blader/napkin).

The napkin is a **continuously curated runbook**, NOT a chronological log. It's a live knowledge base for execution speed and reliability.

## Always Active

No trigger required. Every session, unconditionally:

1. Read `.context/napkin.md` before doing anything
2. Internalize and apply silently — do NOT announce "I read the napkin"
3. Immediately curate: re-prioritize, merge duplicates, remove stale items, enforce category caps

## Storage

File: `.context/napkin.md` (one per project, inside dotcontext directory).

- Requires `.context/` to exist (Full or Lite mode only)
- Can be gitignored (personal) or committed (shared with team)
- If the file does not exist but `.context/` does, create it using the template below

## Template

When creating a new napkin:

~~~markdown
# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 15 items per category, max 7 per agent section.
- Each item includes date + "Do instead".

## Execution & Validation
(empty)

## Shell & Command Reliability
(empty)

## Domain Behavior Guardrails
(empty)

## User Directives
(empty)

## Agent-Specific Notes
<!-- Sections appear on demand: ### agent-name -->
~~~

## Entry Format

Every entry MUST follow this format:

```markdown
1. **[YYYY-MM-DD] Short rule**
   Do instead: concrete repeatable action.
```

- Date added `[YYYY-MM-DD]`
- Short, descriptive rule title
- Explicit `Do instead:` line with concrete action
- Concise, action-oriented wording

## What Qualifies

- Frequent gotchas that waste time repeatedly
- User directives affecting repeated behavior
- Non-obvious tactics that work repeatedly
- Tool/environment surprises (APIs, return formats, CLI quirks)

## What Does NOT Qualify

- One-off timeline notes or session diaries
- Verbose postmortems without reusable action
- Pure mistake logs without "Do instead" guidance
- Anything already enforced by linters, tests, or CI

## Categories

Four fixed categories (max **15 items** each, sorted by importance descending):

| Category | What goes here |
|----------|---------------|
| **Execution & Validation** | Test failures, build gotchas, CI surprises, TDD patterns |
| **Shell & Command Reliability** | CLI quirks, command flags, PATH issues, tool-specific behavior |
| **Domain Behavior Guardrails** | Business logic traps, API contracts, data format surprises |
| **User Directives** | Explicit user preferences that affect repeated behavior |

### Agent-Specific Notes

Sub-sections under `## Agent-Specific Notes` for domain-specific learnings. Max **7 items** per agent. Sections appear on demand — no empty placeholders.

```markdown
## Agent-Specific Notes
### security-auditor
1. **[2026-04-05] Rule title**
   Do instead: action.

### database-specialist
1. **[2026-04-05] Rule title**
   Do instead: action.
```

## Curation Policy

On every read (session start, post-compact):

1. **Re-prioritize** — most impactful items first
2. **Merge duplicates** — combine similar entries
3. **Remove stale** — delete items no longer relevant (fixed bugs, deprecated APIs)
4. **Enforce caps** — max 15 per category, max 7 per agent section
5. **Fewer high-signal items** preferred over broad coverage

## Coexistence with MEMORY.md

Napkin and Claude Code's auto-memory (MEMORY.md) are independent:

- **Napkin** = execution runbook (mistakes, corrections, patterns)
- **MEMORY.md** = high-level context (user profile, project decisions, references)
- No deduplication, no cross-promotion
- Both are read at session start; both serve different purposes

## Mode Compatibility

| Mode | Available? | How |
|------|-----------|-----|
| Full | Yes | SessionStart hook injects; dotcontext MCP can read `.context/napkin.md` |
| Lite | Yes | SessionStart hook injects; direct file read |
| Minimal | No | No `.context/` directory — skill inactive |
