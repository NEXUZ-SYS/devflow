---
name: prevc-review
description: "Use during PREVC Review phase — validates design and plan through agent-driven review with superpowers code review discipline"
---

# PREVC Review Phase

Validates the design spec and implementation plan before any code is written. Uses agent orchestration to get multi-perspective review.

<HARD-GATE>
Do NOT begin implementation until the review phase produces approval. No code before review approval on MEDIUM+ scale workflows.
</HARD-GATE>

**Announce at start:** "I'm using the devflow:prevc-review skill for the Review phase."

## Checklist

1. **Select reviewers** based on task domain and available agents
2. **Architecture review** — structural soundness, scalability, patterns
3. **Feasibility review** — implementation plan is realistic and complete
4. **Security review** — identify attack surfaces early (if applicable)
5. **User approval** — present review findings, get go/no-go
6. **Gate check** — all reviews pass + user approves = ready to advance

## Step 1: Select Reviewers

### Full Mode
```
agent({ action: "orchestrate", phase: "R", task: "<task-description>" })
agent({ action: "getSequence", task: "<task-description>" })
```
MCP returns the optimal reviewer sequence. Typical: architect → code-reviewer → security-auditor.

### Lite Mode
Read these agent playbooks and apply their review checklists:
- `.context/agents/architect-specialist.md` — always
- `.context/agents/code-reviewer.md` — always
- `.context/agents/security-auditor.md` — if the task touches auth, data, or APIs

### Minimal Mode
Invoke `superpowers:requesting-code-review` for the plan (not code — the plan itself).

## Step 2: Architecture Review

Review the spec and plan for:
- **Isolation:** Each component has clear boundaries and interfaces
- **Testability:** Every component can be tested independently
- **Consistency:** Follows existing codebase patterns (from context)
- **Simplicity:** No premature abstractions, no over-engineering

### Full Mode
The architect agent provides structured feedback via MCP orchestration.

### Lite/Minimal Mode
Apply the architect checklist manually. Focus on the 4 criteria above.

## Step 3: Feasibility Review

Review the implementation plan for:
- **Completeness:** All steps from spec are covered
- **Ordering:** Dependencies between tasks are correct
- **TDD compliance:** Every task follows RED-GREEN-REFACTOR
- **Granularity:** Each step is 2-5 minutes (superpowers standard)
- **Agent annotations:** Correct roles assigned to task groups

## Step 4: Security Review (if applicable)

Skip for SMALL scale or tasks that don't touch security surfaces.

Review for:
- Input validation at system boundaries
- Authentication/authorization coverage
- Data exposure risks
- Dependency vulnerabilities

### Full Mode
```
agent({ action: "orchestrate", agents: ["security-auditor"], task: "<task-description>" })
```

### Lite Mode
Read `.context/agents/security-auditor.md` and apply its checklist.

## Step 5: Present Findings

Present all review findings to the user in a structured format:

```markdown
## Review Summary

### Architecture: PASS/FAIL
- [findings]

### Feasibility: PASS/FAIL
- [findings]

### Security: PASS/N/A
- [findings]

### Recommendation: PROCEED / REVISE / BLOCK
```

If REVISE: specify what needs to change and return to Planning phase.
If BLOCK: explain the fundamental issue and discuss with user.

## Step 6: Gate Check

The Review phase gate requires:
- All applicable reviews completed
- No BLOCK findings unresolved
- User explicitly approves advancement

**When gate is met:**

Full mode:
```
workflow-advance()  # Moves to E phase
```

Lite/Minimal mode: Update task tracking, proceed to Execution.

## Anti-Rationalization

| Thought | Reality |
|---------|---------|
| "The plan looks fine to me" | You wrote the plan. Review requires a different perspective. Apply agent checklists. |
| "Security doesn't apply here" | If the task touches data, APIs, auth, or user input — it applies. |
| "Review is slowing us down" | Review catches 80% of issues that would cost 10x to fix in Execution. |
| "Let me just start coding and review later" | That's not review, that's rework. Gate is non-negotiable. |
