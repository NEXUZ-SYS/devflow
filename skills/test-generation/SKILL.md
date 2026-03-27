---
name: test-generation
description: "Use when designing test suites, generating test cases, or reviewing test coverage — covers unit, integration, and E2E strategies"
---

# Test Generation

Design and generate comprehensive test suites that catch real bugs and document behavior.

**Announce at start:** "I'm using the devflow:test-generation skill."

## When to Use

- Planning test strategy for a new feature
- Generating test cases for existing code
- Reviewing test coverage gaps
- Deciding between unit, integration, and E2E tests

## Test Pyramid

```
        /  E2E  \        Few, slow, expensive — critical user flows only
       /----------\
      / Integration \    Moderate — component boundaries, API contracts
     /----------------\
    /     Unit Tests    \  Many, fast, cheap — business logic, pure functions
   /____________________\
```

## Checklist

1. **Identify test subjects** — what functions/components/endpoints need tests
2. **Choose test types** — unit, integration, E2E based on what's being tested
3. **Design test cases** — happy path, edge cases, error paths
4. **Write tests** — following TDD (RED → GREEN → REFACTOR)
5. **Review coverage** — are all critical paths covered?

## Test Case Design

### For Each Function/Component, Cover:

#### Happy Path
- Normal input produces expected output
- Common use cases work correctly

#### Edge Cases
- Empty input (null, undefined, "", [], {})
- Boundary values (0, -1, MAX_INT, empty string)
- Single element (array with 1 item, string with 1 char)
- Unicode, special characters, very long strings

#### Error Paths
- Invalid input (wrong type, missing required fields)
- Network failures (timeout, 500, connection refused)
- Resource not found (404, null result from DB)
- Permission denied (401, 403)
- Concurrent modifications (race conditions)

#### State Transitions
- Initial state → after action → expected state
- Multiple sequential operations
- Rollback on failure

## Test Case Template

```
describe("<Subject>")
  it("should <expected behavior> when <condition>")
    Given: <setup/preconditions>
    When:  <action>
    Then:  <assertion>
```

### Example: User Registration

```
describe("UserRegistration")
  // Happy path
  it("should create user with valid email and password")
  it("should hash password before storing")
  it("should return user ID and email (not password)")

  // Edge cases
  it("should trim whitespace from email")
  it("should accept emails with + and . variants")
  it("should accept unicode names")

  // Error paths
  it("should reject duplicate email with 409")
  it("should reject password shorter than 8 chars")
  it("should reject invalid email format")
  it("should reject missing required fields with 400")

  // Integration
  it("should send welcome email after creation")
  it("should create default settings for new user")
```

## When to Use Each Test Type

| Test Type | Use For | Mock? |
|-----------|---------|-------|
| **Unit** | Pure functions, business logic, utilities | Mock external deps |
| **Integration** | API endpoints, DB queries, service interactions | Real DB, mock external APIs |
| **E2E** | Critical user flows (login, checkout, signup) | Nothing mocked |
| **Snapshot** | UI component rendering (use sparingly) | N/A |

## Superpowers Integration

**TDD iron law applies:** `superpowers:test-driven-development`
- Write the test FIRST (RED)
- Confirm it fails for the RIGHT reason
- Write minimal code to pass (GREEN)
- Refactor (REFACTOR)

## Mode Integration

### Full Mode
```
agent({ action: "orchestrate", agents: ["test-writer"], task: "<description>" })
skill({ action: "getContent", skill: "test-generation" })
```

### Lite Mode
Read `.context/agents/test-writer.md` and `.context/skills/test-generation/SKILL.md`.
Read `.context/docs/testing-strategy.md` for project-specific test conventions.

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| Testing implementation, not behavior | Tests break on refactoring |
| 100% coverage as a goal | Coverage measures lines hit, not bugs caught |
| Tests with shared mutable state | Flaky, order-dependent failures |
| `expect(result).toBeTruthy()` | Asserts nothing useful — be specific |
| Copy-pasting tests with minor changes | Extract parameterized/table-driven tests |
| Only happy-path tests | Bugs cluster at edges and error paths |
