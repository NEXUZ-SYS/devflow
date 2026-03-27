---
name: parallel-dispatch
description: "Use when multiple independent tasks can be executed simultaneously — coordinates parallel agent/subagent dispatch"
---

# Parallel Dispatch

Coordinate parallel execution of independent tasks across multiple agents or subagents.

**Announce at start:** "I'm using the devflow:parallel-dispatch skill to parallelize these tasks."

## When to Use

- Implementation plan has independent task groups
- Feature breakdown identified parallelizable chunks
- Multiple specialists need to work on unrelated components
- Need to maximize throughput during Execution phase

## Prerequisites

- Tasks must be **truly independent** (no shared state, no data dependencies)
- Each task must have clear inputs and expected outputs
- Merge strategy defined for combining results

## Process

### Step 1: Identify Parallel Candidates

From the implementation plan, find task groups where:
- [ ] No data flows between tasks
- [ ] No shared files being modified
- [ ] No ordering requirement
- [ ] Each task is self-contained

### Step 2: Prepare Dispatch

For each parallel task, define:
```markdown
Task: [description]
Agent: [which specialist]
Inputs: [files to read, context needed]
Outputs: [files to create/modify]
Verification: [how to verify completion]
```

### Step 3: Dispatch

#### With subagents (Claude Code, Codex)
```
superpowers:dispatching-parallel-agents

Dispatch each task to a fresh subagent with:
- Task description
- Relevant file context
- TDD requirement
- Expected output
```

Use the Agent tool with `isolation: "worktree"` for file-level isolation.

#### Without subagents (Cursor, Windsurf)
Execute tasks sequentially but in optimal order:
- Independent tasks first (unblock dependents)
- Group by file proximity (reduce context switching)

### Step 4: Merge Results

After all parallel tasks complete:
1. Verify each task's output independently
2. Check for unintended conflicts (same files modified)
3. Resolve any merge conflicts
4. Run full test suite to verify integration
5. Commit the merged result

## Parallelization Patterns

### By Component
```
Task A: Backend API     → backend-specialist (worktree-a)
Task B: Frontend UI     → frontend-specialist (worktree-b)
Task C: Database schema → database-specialist (worktree-c)
```

### By Feature Slice
```
Task A: User CRUD       → feature-developer (worktree-a)
Task B: Admin dashboard → feature-developer (worktree-b)
Task C: Email service   → backend-specialist (worktree-c)
```

### By Test Type
```
Task A: Unit tests      → test-writer (worktree-a)
Task B: Integration tests → test-writer (worktree-b)
Task C: E2E tests       → test-writer (worktree-c)
```

## Mode Integration

### Full Mode
```
agent({ action: "getSequence", task: "<description>" })
```
dotcontext identifies parallelizable agents and provides handoff sequences.

### Superpowers Integration
`superpowers:dispatching-parallel-agents` handles the actual subagent dispatch mechanics.
`superpowers:using-git-worktrees` provides isolated workspaces per parallel task.

## Anti-Patterns

| Pattern | Problem |
|---------|---------|
| Parallelizing dependent tasks | Race conditions and merge conflicts |
| No merge verification | Silent integration failures |
| Shared file modifications | Git conflicts and overwritten changes |
| Skipping TDD in parallel tasks | Each subagent must follow TDD independently |
| No integration test after merge | Parallel tasks may work alone but fail together |
