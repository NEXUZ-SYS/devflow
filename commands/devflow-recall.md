---
name: devflow-recall
description: Search MemPalace for project memories
user_invocable: true
---

# /devflow-recall

Search MemPalace for project memories — agent diaries, PREVC decisions, and historical context.

## Usage

```
/devflow-recall <query>            # Search within project wing
/devflow-recall --global <query>   # Search across all projects
```

## Behavior

1. Parse the query and optional `--global` flag
2. Invoke `devflow:memory-recall` skill
3. The skill handles MCP detection, search, and result formatting

## Arguments

- `--global` — search across all wings (default: project wing only)
- Everything else is the search query

## Examples

```
/devflow-recall o que decidimos sobre auth
/devflow-recall architect diary última sessão
/devflow-recall --global caching strategy
```
