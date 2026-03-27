---
name: agent-dispatch
description: "Use when you need to discover, select, or invoke a specialist agent for a specific task or PREVC phase"
---

# Agent Dispatch

Discovers and invokes specialist agents based on task requirements and current PREVC phase. Adapts to available mode (Full/Lite/Minimal).

**Announce at start:** "I'm using the devflow:agent-dispatch skill to select agents for this task."

## Available Agents

DevFlow provides 14 specialist agents, each with defined roles and phase participation:

| Agent | Role | Phases | When to use |
|-------|------|--------|-------------|
| architect | architect | P, R | System design, technical decisions, scalability review |
| feature-developer | developer | E | Feature implementation following specs |
| bug-fixer | developer | E | Root cause analysis and targeted fixes |
| code-reviewer | reviewer | R, V | Code quality, patterns, best practices review |
| test-writer | developer | E, V | Test coverage, test design, testing strategy |
| documentation-writer | developer | C | API docs, README, inline docs maintenance |
| refactoring-specialist | developer | E | Code restructuring, pattern improvements |
| performance-optimizer | specialist | V | Bottleneck identification, optimization |
| security-auditor | specialist | R, V | Vulnerability assessment, security review |
| backend-specialist | specialist | E | Server-side architecture, APIs, databases |
| frontend-specialist | specialist | E | UI development, components, state management |
| database-specialist | specialist | E | Schema design, query optimization, migrations |
| devops-specialist | specialist | E, C | CI/CD, infrastructure, deployment |
| mobile-specialist | specialist | E | iOS/Android development, mobile UX |

## Dispatch Process

### Step 1: Identify Needed Agents

Based on the current task and phase:

**Full Mode:**
```
agent({ action: "orchestrate", phase: "<current-phase>", task: "<task-description>" })
```
Returns the optimal agent selection with reasoning.

**Lite Mode:**
Match task keywords to agent roles:
- "API", "endpoint", "server" → backend-specialist
- "UI", "component", "CSS" → frontend-specialist
- "test", "coverage", "spec" → test-writer
- "schema", "migration", "query" → database-specialist
- "deploy", "CI", "docker" → devops-specialist
- "security", "auth", "vulnerability" → security-auditor
- "performance", "optimize", "slow" → performance-optimizer
- "refactor", "restructure", "clean up" → refactoring-specialist
- "docs", "README", "API docs" → documentation-writer
- "architecture", "design", "system" → architect

**Minimal Mode:**
No agent dispatch — proceed with general-purpose approach.

### Step 2: Load Agent Playbook

**Full Mode:**
```
agent({ action: "getInfo", agent: "<agent-name>" })
agent({ action: "getDocs", agent: "<agent-name>" })
```

**Lite Mode:**
Read the agent playbook:
```
Read .context/agents/<agent-name>.md
```

If `.context/agents/` doesn't exist, read from DevFlow's bundled playbooks:
```
Read <devflow-root>/agents/<agent-name>.md
```

### Step 3: Apply Agent Guidance

The agent playbook provides:
- **Mission** — what this agent focuses on
- **Responsibilities** — specific duties
- **Workflow Steps** — how the agent approaches tasks
- **Best Practices** — domain-specific quality standards
- **Collaboration Checklist** — what to verify before handoff

Apply this guidance while executing the current task.

### Step 4: Handoff (if multi-agent)

When transitioning between agents in a task group:

**Full Mode:**
```
workflow-manage({ action: "handoff", from: "<agent-a>", to: "<agent-b>" })
```

**Lite/Minimal Mode:**
Log the handoff and switch guidance:
```
Handoff: backend-specialist → frontend-specialist
Reason: API layer complete, moving to UI integration
```

## Handoff Protocol

Between agents, verify:
- [ ] Previous agent's work is committed
- [ ] Tests from previous agent pass
- [ ] Handoff notes describe: what was done, what's next, any concerns
- [ ] New agent's playbook is loaded before continuing

## Common Sequences

| Task Type | Agent Sequence |
|-----------|---------------|
| Full-stack feature | architect → backend → frontend → test-writer |
| API endpoint | architect → backend → test-writer |
| UI feature | architect → frontend → test-writer |
| Bug fix | bug-fixer → test-writer |
| Refactoring | refactoring-specialist → test-writer → code-reviewer |
| Database change | database-specialist → backend → test-writer |
| Security fix | security-auditor → backend/frontend → test-writer |
| Performance issue | performance-optimizer → backend/frontend → test-writer |

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "I don't need an agent for this" | In Minimal mode, that's fine. In Full/Lite, agents add domain expertise. |
| "I'll skip the handoff protocol" | Handoffs prevent context loss between specialists. Always follow it. |
| "One agent can do everything" | Specialists catch domain-specific issues. Use the right agent. |
| "Agent playbooks are just suggestions" | Playbooks encode proven domain expertise. Follow their workflow. |
