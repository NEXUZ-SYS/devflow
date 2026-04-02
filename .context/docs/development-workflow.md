---
type: doc
name: development-workflow
description: Development workflow, branching strategy, PREVC phases, and coding conventions for DevFlow
category: workflow
generated: 2026-04-02
status: filled
scaffoldVersion: "2.0.0"
---

## Branch Strategy

DevFlow uses a **trunk-based** approach on `main`:
- Feature work is done on short-lived branches or via git worktrees (for isolation)
- The `git-strategy` skill auto-detects and recommends branching strategy per task
- Pre-tool-use hooks validate git strategy before allowing Edit/Write operations
- Version bumps are enforced via `scripts/pre-commit-version-check.sh`

## Code Conventions

### Content Format
- All skills, agents, commands, and docs use **Markdown with YAML frontmatter**
- Frontmatter must include: `type`, `name`, `description`, `status`, `scaffoldVersion: "2.0.0"`
- Agent playbooks require **11 sections** (Mission through Hand-off Notes)
- Skill files require **4 sections** (When to Use, Instructions, Examples, Guidelines)

### Naming Conventions
- Skills: `kebab-case` directory with `SKILL.md` inside (e.g., `skills/prevc-flow/SKILL.md`)
- Agents: `kebab-case.md` in `agents/` (e.g., `agents/backend-specialist.md`)
- Commands: `kebab-case.md` in `commands/` (e.g., `commands/devflow-status.md`)
- Hooks: no extension, executable bash scripts in `hooks/`

### Content Quality
- Agent playbooks must reference actual project paths, patterns, and conventions
- Skills must provide actionable instructions, not generic templates
- All generated `.context/` files must be dotcontext v2 compatible

## CI/CD Pipeline

- No formal CI/CD pipeline (plugin distributed via marketplace)
- Version management: `scripts/bump-version.sh` auto-updates version on content changes
- Pre-commit: `scripts/pre-commit-version-check.sh` validates version consistency

## Review Process

DevFlow uses its own PREVC workflow for self-development:
1. **Planning** — Brainstorm via superpowers, write plan with context enrichment
2. **Review** — Design review via code-reviewer agent, security pre-check
3. **Execution** — TDD discipline (test before implementation), agent handoffs
4. **Validation** — Gate checks (tests passing, security audit, spec compliance)
5. **Confirmation** — Branch finish, docs update, PR creation

### Phase Gates
| Transition | Requirements |
|-----------|--------------|
| P → R | Spec approved + plan written |
| R → E | Review approved + no critical security issues |
| E → V | All tasks complete + tests passing |
| V → C | All validation passed + spec compliance verified |
