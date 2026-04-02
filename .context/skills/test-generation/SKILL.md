---
type: skill
name: Test Generation
description: Design verification strategies for DevFlow — gate checks, frontmatter validation, and hook testing
skillSlug: test-generation
phases: [E, V]
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

## When to Use

- When defining gate requirements for new PREVC phase transitions
- When creating checklists for new skills
- When validating hook scripts for edge cases
- When checking frontmatter compliance across the project

## Instructions

1. Identify the verification target (gate check, skill checklist, hook script, or frontmatter)
2. For gate checks: define explicit pass/fail criteria that map to observable conditions
3. For skill checklists: ensure each item maps to a TaskCreate/TaskUpdate operation
4. For hook scripts: test with empty state, missing files, and normal operation
5. For frontmatter: validate all required fields (type, name, description, status, scaffoldVersion)
6. Document verification results with pass/fail status per item

## Examples

- Gate check for E→V: "All tasks marked complete" + "No failing tests" + "Code compiles without errors"
- Skill checklist validation: each step in the skill's checklist produces a verifiable outcome
- Hook test: run `hooks/session-start` with no `.context/` directory — should detect Minimal mode

## Guidelines

- Gate checks must be objective (not "looks good" but "all tasks status=completed")
- Skill checklists should have 5-15 items (fewer = too coarse, more = too granular)
- Hook tests should cover: normal operation, missing dependencies, empty state
- Frontmatter validation should be automated where possible
