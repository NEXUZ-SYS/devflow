---
type: skill
name: Refactoring
description: Safe restructuring of DevFlow content — consolidate duplication, standardize patterns, update formats
skillSlug: refactoring
phases: [E]
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

## When to Use

- When multiple skills contain duplicated logic or sections
- When naming conventions drift from established patterns
- When dotcontext version changes require format migration
- When skill composition chains become overly complex

## Instructions

1. Identify the refactoring target and scope
2. Document current behavior (what the user sees, what output is produced)
3. Make structural changes while preserving external behavior
4. Verify dotcontext v2 frontmatter compliance after changes
5. Update `references/skills-map.md` if skill structure changed
6. Run code-review skill to validate changes

## Examples

- Consolidating duplicated gate-check logic from multiple PREVC phase skills into a shared pattern
- Standardizing frontmatter across all agent playbooks to match template exactly
- Restructuring a skill that grew too large into focused sub-skills

## Guidelines

- Never change user-facing behavior during refactoring
- Validate dotcontext v2 compatibility after every change
- Keep all 11 agent sections and 4 skill sections intact
- Update cross-references when files move or rename
- Commit refactoring separately from feature changes
