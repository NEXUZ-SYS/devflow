---
type: skill
name: Commit Message
description: Write conventional commit messages for DevFlow changes — skills, agents, hooks, and docs
skillSlug: commit-message
phases: [C]
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

## When to Use

- After completing a feature, fix, or refactoring in DevFlow
- When committing changes to skills, agents, commands, or hooks
- When updating documentation or references

## Instructions

1. Identify the type: `feat` (new skill/agent/command), `fix` (bug fix), `docs` (documentation), `refactor` (restructuring), `chore` (maintenance)
2. Identify the scope: skill name, agent name, hook name, or general area
3. Write a concise subject line: `<type>(<scope>): <description>` (under 72 chars)
4. Add body if the change is non-trivial: explain why, not what
5. Reference related issues or PRs if applicable

## Examples

- `feat(prevc-flow): add checkpoint save on phase transitions`
- `fix(session-start): handle missing .context/ directory gracefully`
- `docs(README): update agent list to include mobile-specialist`
- `refactor(hooks): consolidate pre-tool-use validation logic`
- `feat(agents): add database-specialist playbook with project-specific content`

## Guidelines

- Subject line: imperative mood, no period, under 72 characters
- Scope should match the directory or file being changed
- Body explains motivation, not mechanics (the diff shows mechanics)
- Breaking changes: add `BREAKING CHANGE:` footer
- Version bumps handled separately by `scripts/bump-version.sh`
