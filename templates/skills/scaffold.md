# Skill Scaffold Template (dotcontext v2 compatible)

Use this template when scaffolding project-specific skills in `.context/skills/<slug>/SKILL.md`.

## Frontmatter

```yaml
---
type: skill
name: <Skill Title>
description: <one-line description>
skillSlug: <slug>
phases: [P, R, E, V, C]
generated: <YYYY-MM-DD>
status: <filled|unfilled>
scaffoldVersion: "2.0.0"
---
```

## Required Sections (4 total, in order)

```markdown
# <Skill Title>

## When to Use
<!-- Describe when this skill should be activated. -->
<!-- FILL WITH: project-specific triggers and scenarios -->

## Instructions
<!-- Step-by-step instructions for executing this skill. -->
<!-- FILL WITH: project-specific steps referencing actual files and patterns -->
1. First step
2. Second step
3. Third step

## Examples
<!-- Concrete examples of how to use this skill in this project. -->
<!-- FILL WITH: real examples using actual project code/patterns -->

## Guidelines
<!-- Best practices and guidelines for using this skill effectively. -->
<!-- FILL WITH: project-specific conventions and standards -->
```

## Skill Types Reference

| skillSlug | name | phases | description |
|-----------|------|--------|------------|
| api-design | API Design | [P, E] | Design patterns, contracts, and documentation |
| bug-investigation | Bug Investigation | [E] | Structured triage and root cause analysis |
| code-review | Code Review | [R, V] | Code quality, patterns, and best practices |
| commit-message | Commit Message | [E, C] | Conventional commits with context |
| documentation | Documentation | [C] | Documentation standards and maintenance |
| feature-breakdown | Feature Breakdown | [P] | Decompose features into implementable chunks |
| pr-review | PR Review | [R, C] | Pull request creation and review |
| refactoring | Refactoring | [E] | Safe refactoring with test preservation |
| security-audit | Security Audit | [R, V] | OWASP-based security assessment |
| test-generation | Test Generation | [E, V] | Test design, coverage, and generation |
