---
name: devflow-dispatch
description: Dispatch a specialist agent or get a recommendation for the current task
user_invocable: true
---

# /devflow-dispatch

Dispatch a specialist agent or get a recommendation based on the current context.

## Usage

```
/devflow-dispatch                      # Recommend best agent for current task
/devflow-dispatch <role>               # Dispatch a specific agent
```

## Behavior

### `/devflow-dispatch` (no args — recommend)
Analyze current task and phase, then recommend agents:

```
Current: E (Execution) — "add JWT authentication"

Recommended sequence:
  1. backend-specialist    → implement auth middleware
  2. test-writer           → generate test suite
  3. security-auditor      → review token handling

Dispatch one with: /devflow-dispatch backend-specialist
```

### `/devflow-dispatch <role>`
1. Invoke `devflow:agent-dispatch` skill
2. Load the specified agent's playbook from `.context/agents/` or bundled `agents/`
3. Apply agent's workflow to current task

```
Dispatching backend-specialist...
Loaded playbook: backend-specialist.md
Context: "add JWT authentication" (E phase, MEDIUM scale)
```

## Available Roles

```
architect               product-manager         feature-developer
bug-fixer               code-reviewer           test-writer
documentation-writer    refactoring-specialist  performance-optimizer
security-auditor        backend-specialist      frontend-specialist
database-specialist     devops-specialist       mobile-specialist
```

## Mode Behavior

- **Full mode:** Uses MCP `agent({ action: "orchestrate" })` for recommendations
- **Lite mode:** Reads playbooks from `.context/agents/`
- **Minimal mode:** Uses bundled playbooks from `agents/`
