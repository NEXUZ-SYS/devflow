---
name: commit-message
description: "Use when writing git commit messages — follows conventional commits with context-aware scope and body"
---

# Commit Message

Write clear, conventional commit messages that explain the "why" behind changes.

**Note:** This skill is invoked automatically during PREVC Execution and Confirmation phases.

## When to Use

- After completing a task in the implementation plan
- When committing any code change
- When amending or rewriting commit history

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat` — New feature (correlates with MINOR in SemVer)
- `fix` — Bug fix (correlates with PATCH)
- `docs` — Documentation only
- `style` — Formatting, no code change
- `refactor` — Code restructuring, no behavior change
- `test` — Adding or updating tests
- `chore` — Build, CI, tooling changes
- `perf` — Performance improvement

### Scope
Use the component or area affected: `auth`, `api`, `ui`, `db`, `config`, etc.

### Subject
- Imperative mood: "add" not "added" or "adds"
- No period at the end
- Under 50 characters
- Focus on WHAT changed

### Body
- Explain WHY the change was made
- Include context that isn't obvious from the diff
- Wrap at 72 characters
- Separate from subject with blank line

### Footer
- `BREAKING CHANGE: <description>` for breaking changes
- `Closes #123` for issue references
- `Co-Authored-By:` for pair programming

## Examples

```
feat(auth): add OAuth2 login with Google provider

Users requested social login to reduce signup friction.
Implements the authorization code flow with PKCE.
Tokens are stored in httpOnly cookies, not localStorage.

Closes #456
```

```
fix(api): handle null response from payment gateway

The Stripe webhook occasionally sends null amounts for
refund events. Previously this crashed the handler.
Now we validate and skip null amounts with a warning log.
```

```
refactor(db): extract repository pattern from controllers

Controllers were directly querying the database, making
unit testing impossible without a real DB connection.
Extracted to repository classes with interface contracts.
```

## Mode Integration

### Full Mode
```
skill({ action: "getContent", skill: "commit-message" })
```
Loads project-specific commit conventions from dotcontext.

### Lite Mode
Read `.context/skills/commit-message/SKILL.md` if it exists.

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| "fix stuff" | Tells nothing about what was fixed or why |
| "WIP" | Commits should be complete units of work |
| "update file.ts" | The diff shows what file changed — say what and why |
| Giant commits | One commit per logical change, not per session |
| Missing body on non-obvious changes | Future you needs the context |
