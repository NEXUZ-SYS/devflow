---
name: memory-recall
description: "Search MemPalace for project memories — agent diaries, PREVC decisions, and historical context"
---

# Memory Recall

On-demand deep-dive into MemPalace memories. Use when auto-recall budget is insufficient or when you need to explore historical context.

**Announce at start:** "I'm using the devflow:memory-recall skill to search project memories."

## Pre-requisite

Check if MemPalace MCP is available:
- If `mempalace: true` in session context → proceed
- If not → inform: "MemPalace not configured. Run `/devflow init` to set it up."

## Checklist

1. **Parse query** — extract search terms from user request
2. **Determine scope** — project wing (default) or global (if `--global` flag)
3. **Search palace** — call MemPalace MCP search tool with query
4. **Format results** — group by type (agent diaries, decisions, artifacts)
5. **Present** — show results with timestamps and source context
6. **Refine** — offer to narrow down ("filter by phase R", "more from architect")

## Step 1: Parse Query

Accept natural language queries:
- "o que decidimos sobre auth?" → search "auth decisions"
- "qual o raciocínio do architect?" → search "architect diary"
- "memórias sobre caching" → search "caching"

## Step 2: Determine Scope

Read mempalace config from `.context/.devflow.yaml`:

```yaml
mempalace:
  palace: ~/.mempalace/palace    # palace path
  wing: auto                     # project wing (auto = repo name)
```

Default: search within project wing only.
If user passes `--global` or asks for cross-project context, search all wings.

## Step 3: Search Palace

Call MemPalace MCP search tool:
- Query: user's search terms
- Wing filter: project wing (unless global)
- No token budget limit (this is the deep-dive path)

## Step 4: Format Results

Group results by type:

### Agent Diaries
```
[2026-04-08 14:30] architect (Planning)
  Summary: Defined hybrid MCP-first architecture for mempalace integration
  Decisions: MCP-first without CLI fallback, 500 token budget for auto-recall
  Artifacts: docs/superpowers/specs/2026-04-08-mempalace-design.md
  → Handed off to: code-reviewer
```

### PREVC Decisions
```
[2026-04-08 15:00] Review phase — mempalace-integration
  Approved: MCP-first approach, no Python dependency
  Flagged: Consider token budget monitoring
```

### Timeline
Chronological view when user asks for "history" or "timeline".

## Step 5: Refine

After presenting results, offer refinement:
- "Filtrar por fase?" (P/R/E/V/C)
- "Mais resultados de um agent específico?"
- "Buscar em outros projetos?" (→ global search)

## Guidelines

- Always show timestamps and source agent/phase
- Truncate long diary entries to ~200 words with "... [ver completo]" option
- If no results found, suggest broader search terms or global scope
- This skill does NOT write to the palace — only reads
