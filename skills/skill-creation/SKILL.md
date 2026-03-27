---
name: skill-creation
description: "Use when creating new DevFlow skills — follows TDD-for-docs methodology from superpowers with devflow conventions"
---

# Skill Creation

Create new DevFlow skills using TDD applied to documentation — test that agents follow the skill before shipping it.

**Announce at start:** "I'm using the devflow:skill-creation skill to create a new skill."

## When to Use

- Adding a new capability to DevFlow
- Codifying a recurring process into a reusable skill
- Extending PREVC phases with domain-specific guidance
- Creating project-specific skills

## Skill Structure

Every skill lives in `skills/<skill-name>/SKILL.md`:

```yaml
---
name: <skill-name>
description: "<CSO-optimized description — what triggers this skill>"
---

# Skill Title

[One-line purpose statement]

**Announce at start:** "I'm using the devflow:<skill-name> skill to [action]."

## When to Use
[Explicit triggers — when should the agent invoke this?]

## Checklist
[Ordered steps the agent must follow]

## [Process sections]
[Detailed instructions per step]

## Mode Integration
[How behavior changes across Full/Lite/Minimal modes]

## Anti-Patterns
[Table of rationalizations and their rebuttals]
```

## TDD for Skills

Adapted from `superpowers:writing-skills`:

### RED: Agent fails without the skill
1. Define a test scenario (a task the agent should handle)
2. Run a subagent on the scenario WITHOUT the skill
3. Document how it fails (skips steps, wrong approach, etc.)

### GREEN: Agent succeeds with the skill
1. Write the skill
2. Run the same subagent WITH the skill loaded
3. Verify it follows the process correctly

### REFACTOR: Close rationalization loopholes
1. Identify excuses the agent might use to skip the skill
2. Add anti-rationalization table
3. Add hard gates where compliance is mandatory
4. Re-run test scenarios to verify

## Checklist

1. **Identify the gap** — what process is missing or inconsistent?
2. **Write test scenario** — a concrete task to test the skill against
3. **RED** — verify agent fails without the skill
4. **Write the skill** — follow the structure above
5. **GREEN** — verify agent succeeds with the skill
6. **REFACTOR** — add anti-patterns, close loopholes
7. **Integrate** — add to skills-map.md, update using-devflow if needed

## CSO: Claude Search Optimization

The `description` field in frontmatter is how agents find skills. Optimize it:

- **Start with "Use when..."** — maps to agent decision-making
- **Include trigger words** — the exact phrases users say
- **Be specific** — "Use when designing REST APIs" > "API skill"
- **Include related terms** — "endpoints, contracts, versioning"

## DevFlow Conventions

### Mode Integration
Every skill MUST include a "Mode Integration" section showing behavior in Full/Lite/Minimal modes.

### Agent References
If the skill relates to a specialist agent, include how to invoke it in each mode.

### PREVC Phase Mapping
Specify which PREVC phases the skill applies to in the skills-map.md entry.

### Anti-Rationalization Table
Every skill MUST end with an anti-patterns table. Format:
```markdown
| Pattern | Problem |
|---------|---------|
| "I don't need this" | [Why they do] |
```

## Superpowers Integration

For the full TDD-for-docs methodology, invoke `superpowers:writing-skills` which provides:
- Detailed pressure testing framework
- Subagent test harness
- Persuasion principles for skill writing
- Graphviz conventions for process flows

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| Writing skills without testing | Untested skills are ignored or misapplied |
| Vague description field | Agent won't find the skill when it's needed |
| No anti-rationalization table | Agent will rationalize skipping the skill |
| Too long | Skills over 200 lines lose agent attention |
| No mode integration | Skill fails silently in Lite/Minimal mode |
