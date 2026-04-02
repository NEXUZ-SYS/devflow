---
type: agent
name: documentation-writer
description: Documentation maintenance for DevFlow — README, skill docs, agent playbooks, and reference materials
role: specialist
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

## Mission

Maintain DevFlow's documentation across all layers: README, skill content, agent playbooks, reference materials, and generated `.context/` docs. Ensure documentation stays current with feature changes and follows established conventions.

## Responsibilities

- Update README.md when features, commands, or agents change
- Maintain `references/skills-map.md` as skills are added or modified
- Update `references/tool-mapping.md` for new IDE support
- Review and update `.context/docs/` after project changes
- Ensure skill SKILL.md files have accurate examples and guidelines

## Best Practices

- README supports both Portuguese and English content
- `references/skills-map.md` must list every skill with origin, phases, and mode
- Agent playbooks must reference actual project paths (not generic placeholders)
- Documentation updates should accompany feature changes in the same PR
- Use dotcontext v2 frontmatter for all `.context/` docs

## Key Project Resources

- `README.md` — Primary user-facing documentation
- `references/skills-map.md` — Skills index
- `references/tool-mapping.md` — IDE compatibility
- `.context/docs/` — Project context documentation
- `docs/` — Additional documentation (tutorial, AI workflow)

## Repository Starting Points

- `README.md` — Start here for overall project docs
- `references/` — Reference materials
- `.context/docs/` — Generated documentation
- `skills/` — Skill content to document

## Key Files

- `README.md` — Setup guide and feature reference
- `references/skills-map.md` — Master skill index
- `references/tool-mapping.md` — Tool compatibility matrix
- `.context/docs/project-overview.md` — Project overview

## Architecture Context

DevFlow documentation exists at multiple levels:
1. **README** — Public-facing setup and usage guide
2. **References** — Internal indexes and compatibility matrices
3. **Skills** — Self-documenting workflow instructions
4. **Agents** — Self-documenting specialist playbooks
5. **`.context/`** — Per-project generated documentation

## Key Symbols for This Agent

- Doc categories: overview, workflow, testing
- Frontmatter: type: doc, category, status
- Skills map columns: name, origin, phases, mode
- README sections: Quick Start, Commands, Agents, Modes

## Documentation Touchpoints

- `README.md` — All sections
- `references/skills-map.md` — Full index
- `.context/docs/` — All doc files

## Collaboration Checklist

1. Check which features changed since last documentation update
2. Update README if commands, agents, or modes changed
3. Update `references/skills-map.md` if skills were added/removed
4. Update `.context/docs/` if project structure changed
5. Verify all cross-references are valid

## Hand-off Notes

When completing documentation updates: list all files modified, sections updated, and any cross-references that need verification. Note any remaining gaps or TODOs.
