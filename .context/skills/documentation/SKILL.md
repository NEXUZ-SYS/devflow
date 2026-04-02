---
type: skill
name: Documentation
description: Update DevFlow documentation — README, skills-map, tool-mapping, and .context/ docs
skillSlug: documentation
phases: [C]
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

## When to Use

- After adding new skills, agents, or commands
- After changing operating modes or phase logic
- When updating IDE compatibility
- During Confirmation (C) phase of any PREVC workflow

## Instructions

1. Identify what changed (new skill, modified agent, new command, etc.)
2. Update `references/skills-map.md` with new/modified skill entries
3. Update `README.md` if user-facing features changed
4. Update `.context/docs/project-overview.md` if project structure changed
5. Update `references/tool-mapping.md` if IDE compatibility changed
6. Verify all cross-references are valid

## Examples

- After adding a new skill: add entry to `references/skills-map.md`, update README command/skill table
- After adding a new agent: update README agent list, update `.context/docs/project-overview.md` stats
- After modifying a hook: update `hooks/hooks.json` if event registration changed

## Guidelines

- README supports Portuguese and English — update both language sections
- `references/skills-map.md` must list every skill with origin, phases, and mode
- Documentation updates should accompany feature changes in the same commit/PR
- Use dotcontext v2 frontmatter for all `.context/` doc files
