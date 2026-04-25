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

## ADR System (v2.1.0)

ADRs (Architecture Decision Records) live in `.context/docs/adrs/NNN-<slug>-v<semver>.md` with frontmatter v2.1.0 schema (13 fields including `version`, `supersedes`, `refines`, `protocol_contract`, `decision_kind`).

### Commands

```
/devflow adr:new [título]          Create new ADR (guided/free/prefilled)
/devflow adr:audit <alvo>          Audit existing ADR (12 checks, inline)
/devflow adr:evolve <alvo>         Evolve ADR (patch/minor/major/refine)
```

Resolution: `001`, `001-tdd-python`, `001-tdd-python-v1.0.0`, or path.

### Determinism

`adr-audit.mjs` runs the 12 checks via Node lib (zero deps) — output is stable, exit codes feed CI gates. `adr-update-index.mjs` regenerates the README in 14-column schema. `adr-evolve.mjs` orchestrates patch/minor/major/refine transitions atomically.

### PREVC Integration

- **Step 3.5 of `prevc-planning`** — detects architectural decisions during brainstorming and offers `/devflow adr:new --mode=prefilled` (4 simultaneous signals; opt-out via `skip_adr_offer`).
- **Step 2.6 of `prevc-validation`** — audits ADRs touched in the workflow via `git diff` (matrix by status: Proposto/Aprovado/Substituido). `adr-audit.mjs --enforce-gate` blocks V phase on FIX-INTERVIEW.
- **`adr-filter` skill** — reads README index (v2 schema), filters by status (rejects Substituido/Descontinuado) and Kind (firm/gated/reversible), emits `[firm]/[gated]/[experimental]/[proposto]` tags inline.

### Hard Rules (ADR template)

12 non-negotiables in the template. Most-violated by humans:
- ≥ 2 alternatives considered (not just the chosen one)
- Guardrails as `SEMPRE/NUNCA/QUANDO…ENTÃO` (not "best practices")
- ≥ 1 Enforcement mechanism (concrete tool + rule)
- No `## Relacionamentos` section in prose (links live in frontmatter `supersedes`/`refines`)
- 80-120 lines (180 with tabular exception)
- Status `Proposto` on creation; `Aprovado` only after human review

See `skills/adr-builder/SKILL.md` for full skill behavior, `skills/adr-builder/assets/TEMPLATE-ADR.md` for the canonical template.
