# Documentation Scaffold Templates (dotcontext v2 compatible)

Use these templates when scaffolding project documentation in `.context/docs/`.

## Common Frontmatter

```yaml
---
type: doc
name: <doc-name>
description: <one-line description>
category: <overview|workflow|testing|tooling|security|architecture>
generated: <YYYY-MM-DD>
status: <filled|unfilled>
scaffoldVersion: "2.0.0"
---
```

---

## project-overview.md

```markdown
---
type: doc
name: project-overview
description: High-level overview of the project, its purpose, and key components
category: overview
generated: YYYY-MM-DD
status: filled
scaffoldVersion: "2.0.0"
---

# Project Overview

## Project Overview
<!-- Summarize in 2-3 sentences what problem this project solves. -->

## Codebase Reference
> **Detailed Analysis**: For complete file structure, see [`codebase-map.json`](./codebase-map.json).

## Quick Facts
- **Language(s):**
- **Framework(s):**
- **Database(s):**
- **Test Framework:**
- **Package Manager:**

## Entry Points
<!-- List main entry points with file paths -->

## Key Exports
<!-- List main public APIs or exports -->

## File Structure & Code Organization
<!-- Describe directory structure and organization pattern -->

## Technology Stack Summary
<!-- Key dependencies and their purpose -->

## Getting Started Checklist
1. [ ] Clone the repository
2. [ ] Install dependencies
3. [ ] Set up environment variables
4. [ ] Run tests
5. [ ] Start development server

## Next Steps
<!-- Suggested reading order for new contributors -->
```

---

## development-workflow.md

```markdown
---
type: doc
name: development-workflow
description: Development workflow, branching strategy, and coding conventions
category: workflow
generated: YYYY-MM-DD
status: filled
scaffoldVersion: "2.0.0"
---

# Development Workflow

## Branch Strategy
<!-- Describe branching model: trunk-based, gitflow, etc. -->

## Code Conventions
<!-- Naming, formatting, file organization patterns -->

## CI/CD Pipeline
<!-- Build, test, deploy stages -->

## Review Process
<!-- PR requirements, reviewers, merge strategy -->
```

---

## testing-strategy.md

```markdown
---
type: doc
name: testing-strategy
description: Testing approach, frameworks, and coverage expectations
category: testing
generated: YYYY-MM-DD
status: filled
scaffoldVersion: "2.0.0"
---

# Testing Strategy

## Test Framework
<!-- Which framework(s) and why -->

## Test Structure
<!-- Where tests live, naming conventions -->

## Coverage Expectations
<!-- Minimum coverage, what must be tested -->

## Testing Patterns
<!-- Common patterns: mocking strategy, fixtures, factories -->
```

---

## codebase-map.json Template

```json
{
  "version": "2.0.0",
  "generated": "YYYY-MM-DD",
  "stack": {
    "languages": [],
    "frameworks": [],
    "databases": [],
    "tools": []
  },
  "structure": {
    "directories": {
      "src/": "Source code",
      "tests/": "Test files"
    }
  },
  "keyFiles": [
    {
      "path": "src/index.ts",
      "description": "Main entry point"
    }
  ],
  "stats": {
    "totalFiles": 0,
    "totalDirectories": 0
  }
}
```

---

## Doc Types Reference

| name | category | description |
|------|----------|------------|
| project-overview | overview | High-level project overview |
| development-workflow | workflow | Branching, conventions, CI/CD |
| testing-strategy | testing | Test framework, patterns, coverage |
| tooling | tooling | Build tools, linters, formatters |
| architecture | architecture | System design, data flow, layers |
| security | security | Security model, auth, data protection |
| api-reference | architecture | API endpoints and contracts |
| onboarding | overview | New contributor guide |
