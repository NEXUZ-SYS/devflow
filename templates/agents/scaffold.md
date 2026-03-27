# Agent Scaffold Template (dotcontext v2 compatible)

Use this template when scaffolding project-specific agent playbooks in `.context/agents/`.

## Frontmatter

```yaml
---
type: agent
name: <agent-type>
description: <one-line description>
role: <developer|reviewer|specialist|architect>
generated: <YYYY-MM-DD>
status: <filled|unfilled>
scaffoldVersion: "2.0.0"
---
```

## Required Sections (11 total, in order)

```markdown
# <Agent Title> Agent Playbook

## Mission
<!-- Describe how this agent supports the team and when to engage it. -->
<!-- FILL WITH: project-specific mission based on codebase analysis -->

## Responsibilities
<!-- List specific responsibilities. Be concrete about tasks it performs. -->
<!-- FILL WITH: actual tasks relevant to this project -->

## Best Practices
<!-- List best practices and guidelines for this agent to follow. -->
<!-- FILL WITH: project-specific conventions discovered during scan -->

## Key Project Resources
<!-- Link to documentation index, agent handbook, AGENTS.md, contributor guide. -->
<!-- FILL WITH: actual doc paths from this project -->

## Repository Starting Points
<!-- List top-level directories relevant to this agent with brief descriptions. -->
<!-- FILL WITH: actual directories from the project -->

## Key Files
<!-- List entry points, pattern implementations, and service files. -->
<!-- FILL WITH: actual files relevant to this agent's domain -->

## Architecture Context
<!-- For each architectural layer, describe directories, symbol counts, key exports. -->
<!-- FILL WITH: actual architecture layers discovered during scan -->

## Key Symbols for This Agent
<!-- List symbols (classes, functions, types) most relevant to this agent. -->
<!-- FILL WITH: actual symbols from the codebase -->

## Documentation Touchpoints
<!-- Link to relevant documentation files this agent should reference. -->
<!-- FILL WITH: actual doc files from the project -->

## Collaboration Checklist
<!-- Numbered checklist for agent workflow. -->
<!-- FILL WITH: project-specific workflow steps -->
1. [ ] Confirm assumptions with existing code before making changes
2. [ ] Review related tests before modifying behavior
3. [ ] Update documentation after completing work
4. [ ] Verify CI passes before marking task complete
5. [ ] Capture learnings in hand-off notes

## Hand-off Notes
<!-- Summarize outcomes, remaining risks, and suggested follow-up actions. -->
<!-- FILL WITH: typical handoff context for this project -->
```

## Agent Types Reference

| name | role | description |
|------|------|------------|
| architect-specialist | architect | System architecture design and technical decisions |
| feature-developer | developer | Implement new features according to specifications |
| bug-fixer | developer | Root cause analysis and targeted fixes |
| code-reviewer | reviewer | Code quality, patterns, and best practices review |
| test-writer | developer | Test coverage, design, and testing strategy |
| documentation-writer | developer | API docs, README, and project context maintenance |
| refactoring-specialist | developer | Code restructuring without behavior changes |
| performance-optimizer | specialist | Bottleneck identification and optimization |
| security-auditor | specialist | Vulnerability assessment and compliance |
| backend-specialist | specialist | Server-side architecture and APIs |
| frontend-specialist | specialist | UI development and user experience |
| database-specialist | specialist | Schema design and query optimization |
| devops-specialist | specialist | CI/CD and infrastructure |
| mobile-specialist | specialist | iOS/Android development |
