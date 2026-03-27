---
name: agents
description: List available agents or dispatch a specialist for the current task
user_invocable: true
---

# /agents

List available agents or dispatch a specialist for the current task.

## Usage

```
/agents                          # List all agents with phase participation
/agents dispatch <role>          # Dispatch a specific agent
/agents recommend                # Get agent recommendation for current task
```

## Behavior

### `/agents` (no args)
Display all 14 agents with their roles and phase participation:
```
Agent                  Role         Phases
architect              architect    P, R
feature-developer      developer    E
bug-fixer              developer    E
code-reviewer          reviewer     R, V
test-writer            developer    E, V
...
```

### `/agents dispatch <role>`
1. Invoke `devflow:agent-dispatch` skill
2. Load the specified agent's playbook
3. Apply agent's workflow to current task

### `/agents recommend`
Based on the current task and phase, recommend which agents to use:
1. Analyze current task description
2. Match to agent capabilities
3. Suggest sequence with handoff order

## Mode Behavior

- **Full mode:** Uses MCP `agent({ action: "orchestrate" })` for recommendations
- **Lite mode:** Reads playbooks from `.context/agents/` or bundled `agents/`
- **Minimal mode:** Lists agents but notes that dispatch uses bundled playbooks only
