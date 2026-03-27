---
name: pr-review
description: "Use when creating or reviewing pull requests — PR description, review checklist, merge readiness"
---

# PR Review

Standards for creating high-quality pull requests and performing thorough reviews.

**Announce at start:** "I'm using the devflow:pr-review skill."

## When to Use

- Creating a PR (Confirmation phase)
- Reviewing someone else's PR (Review phase)
- Assessing merge readiness

## Creating a PR

### Title
- Under 70 characters
- Imperative mood: "Add caching layer" not "Added caching layer"
- Include ticket/issue reference if applicable

### Description Template

```markdown
## Summary
[1-3 bullet points explaining WHAT and WHY]

## Changes
- [Key files/modules changed and why]

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing done (describe scenarios)

## Screenshots
[If UI changes — before/after]

## Breaking Changes
[Any breaking changes and migration path, or "None"]

## Related
- Closes #123
- Depends on #456
- Design spec: docs/specs/YYYY-MM-DD-feature.md
```

### PR Size Guidelines
- **Ideal:** Under 400 lines changed
- **Acceptable:** 400-800 lines
- **Split required:** Over 800 lines — decompose into stacked PRs

## Reviewing a PR

### Review Checklist

#### Correctness
- [ ] Code does what the PR description says
- [ ] Edge cases handled (null, empty, boundary values)
- [ ] Error paths don't silently fail
- [ ] No regressions to existing functionality

#### Quality
- [ ] Follows codebase conventions and patterns
- [ ] No unnecessary complexity or abstractions
- [ ] Names are clear and consistent
- [ ] No dead code or commented-out code

#### Testing
- [ ] New behavior has tests
- [ ] Tests test behavior, not implementation
- [ ] Edge cases are tested
- [ ] No flaky tests introduced

#### Security
- [ ] No secrets in code
- [ ] Input validated at boundaries
- [ ] No injection vulnerabilities
- [ ] Auth/authz appropriate

#### Documentation
- [ ] Public APIs documented
- [ ] Non-obvious logic has comments
- [ ] README updated if needed

### Review Feedback Format
```
**BLOCK:** [Must fix before merge]
Line 42: SQL injection via string concatenation — use parameterized query

**WARN:** [Should fix, not a blocker]
Line 78: This could be simplified with Array.filter()

**NOTE:** [Suggestion, take it or leave it]
Line 105: Consider extracting this to a helper if it's used elsewhere
```

## Mode Integration

### Full Mode
```
skill({ action: "getContent", skill: "pr-review" })
agent({ action: "orchestrate", agents: ["code-reviewer"], task: "pr-review" })
```

### Lite Mode
Read `.context/skills/pr-review/SKILL.md` and `.context/agents/code-reviewer.md`.

### Superpowers Integration
For detailed code review, invoke `superpowers:requesting-code-review` (as reviewer) or `superpowers:receiving-code-review` (processing feedback).

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| "LGTM" without reading | Rubber-stamp reviews catch nothing |
| Reviewing only the happy path | Bugs live in edge cases and error paths |
| Style nitpicks over substance | Focus on correctness and maintainability first |
| Giant PRs | Impossible to review thoroughly — split them |
| No description | Reviewer needs context to give useful feedback |
