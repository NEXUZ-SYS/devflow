---
name: documentation
description: "Use when writing, updating, or reviewing documentation — API docs, README, inline comments, architecture docs"
---

# Documentation

Standards and process for maintaining accurate, useful documentation.

**Announce at start:** "I'm using the devflow:documentation skill to update docs."

## When to Use

- After implementing a feature (Confirmation phase)
- When APIs change
- When reviewing documentation freshness
- When onboarding needs improvement

## Checklist

1. **Identify scope** — what docs are affected by recent changes
2. **Update content** — make accurate, minimal changes
3. **Verify accuracy** — docs match current code behavior
4. **Remove stale content** — wrong docs are worse than no docs
5. **Check completeness** — new features have docs

## Documentation Layers

### 1. Inline Comments
- **When:** Logic is non-obvious, business rules, workarounds
- **Not when:** The code is self-explanatory
- **Rule:** Explain WHY, not WHAT

```typescript
// Good: explains why
// Retry 3 times because the payment API has transient 503s during deploys
await retry(chargeCard, { attempts: 3 });

// Bad: explains what (the code already says this)
// Call retry with 3 attempts
await retry(chargeCard, { attempts: 3 });
```

### 2. Function/Module Docs
- **When:** Public APIs, exported functions, complex interfaces
- **Include:** What it does, parameters, return value, errors, example

### 3. README
- **When:** Project entry point, setup instructions, key concepts
- **Keep updated:** Every user-facing feature change should be reflected

### 4. Architecture Docs
- **When:** System design, data flow, integration points
- **Format:** Short prose + diagrams. Not novels.

### 5. API Docs
- **When:** Any external or internal API
- **Format:** OpenAPI/Swagger for REST, schema docs for GraphQL

## Mode Integration

### Full Mode
```
agent({ action: "orchestrate", agents: ["documentation-writer"], task: "<description>" })
skill({ action: "getContent", skill: "documentation" })
```

### Lite Mode
Read `.context/agents/documentation-writer.md` and `.context/skills/documentation/SKILL.md`.

### Minimal Mode
Apply the checklist and layers above directly.

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| "I'll document later" | Later never comes. Document during Confirmation phase. |
| Documenting implementation details | Implementation changes; document behavior and contracts. |
| Copy-pasting code as examples | Examples should be simplified, self-contained. |
| No examples at all | One example beats three paragraphs of explanation. |
| Stale docs left in place | Wrong docs mislead worse than no docs. Remove or update. |
