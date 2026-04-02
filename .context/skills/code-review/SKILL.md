---
type: skill
name: Code Review
description: Review DevFlow content (skills, agents, hooks) for quality, consistency, and dotcontext v2 compliance
skillSlug: code-review
phases: [R, V]
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

## When to Use

- After creating or modifying a skill SKILL.md file
- After creating or modifying an agent playbook
- After modifying hook scripts
- Before merging changes that affect `.context/` generated files
- When verifying dotcontext v2 frontmatter compliance

## Instructions

1. Load the template for the content type being reviewed (`templates/agents/scaffold.md` or `templates/skills/scaffold.md`)
2. Check all YAML frontmatter fields are present: type, name, description, status, scaffoldVersion
3. Verify required sections exist: 11 for agents, 4 for skills
4. Validate cross-references point to existing files in the repository
5. Check naming conventions: kebab-case for files, consistent with `references/skills-map.md`
6. For hook scripts: verify idempotency and no unintended side effects
7. Report findings categorized as critical, warning, or suggestion

## Examples

- Reviewing a new agent playbook: check 11 sections, frontmatter fields, real project paths in Repository Starting Points
- Reviewing a skill update: check 4 sections, phase declarations, examples use actual project patterns
- Reviewing hook changes: verify `hooks.json` registration matches, test edge cases

## Guidelines

- Use `templates/` as the canonical reference for expected structure
- Cross-check `references/skills-map.md` for skill inventory consistency
- Frontmatter `scaffoldVersion` must always be `"2.0.0"`
- Status must be `filled` or `unfilled` (never missing or other values)
- All file paths referenced in content must exist in the repository
