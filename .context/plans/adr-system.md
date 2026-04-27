---
status: superseded
superseded_by: adr-system-v2
superseded_on: 2026-04-25
generated: 2026-04-03
agents:
  - type: "documentation-writer"
    role: "Create ADR templates (21 files) across 5 categories"
  - type: "architect-specialist"
    role: "Modify 5 skills to integrate ADR system into PREVC workflow"
  - type: "test-writer"
    role: "Write structural validation tests for ADR templates and skill integration"
  - type: "code-reviewer"
    role: "Review ADR content quality and skill modifications"
docs:
  - "project-overview.md"
  - "development-workflow.md"
  - "testing-strategy.md"
phases:
  - id: "phase-1"
    name: "Tests & Template Structure"
    prevc: "E"
    agent: "test-writer"
  - id: "phase-2"
    name: "ADR Templates (21 files)"
    prevc: "E"
    agent: "documentation-writer"
  - id: "phase-3"
    name: "Skill Modifications & Integration"
    prevc: "E"
    agent: "architect-specialist"
  - id: "phase-4"
    name: "Validation & Final Tests"
    prevc: "V"
    agent: "test-writer"
---

# Sistema de ADRs como Guardrails para IA — Plan

> Sistema de ADRs em duas camadas (organizacionais + projeto) integrado ao DevFlow. Templates segmentados por stack em `.context/templates/adrs/`, instanciados em `.context/docs/adrs/` via `/devflow prd`. Guardrails ativos lidos pela IA no Planning phase, validados no Validation phase.

## Task Snapshot

- **Primary goal:** Implementar sistema de ADRs que transforma decisoes arquiteturais em guardrails ativos para IA
- **Success signal:** Todos os 21 templates existem com frontmatter valido, 5 skills modificados referenciam ADRs, testes estruturais passam
- **Key references:**
  - [Design Spec](../../docs/superpowers/specs/2026-04-03-adr-system-design.md)
  - [Implementation Plan](../../docs/superpowers/plans/2026-04-03-adr-system.md)
  - [Documentation Index](../docs/README.md)

## Agent Lineup

| Agent | Role in this plan | Playbook | First responsibility focus |
| --- | --- | --- | --- |
| Test Writer | Escrever testes estruturais TDD-first | [Test Writer](../agents/test-writer.md) | `tests/validation/test-adr-structural.mjs` |
| Documentation Writer | Criar 21 ADR templates + scaffold de repo | [Documentation Writer](../agents/documentation-writer.md) | `.context/templates/adrs/` |
| Architect Specialist | Modificar 5 skills para integrar ADRs | [Architect Specialist](../agents/architect-specialist.md) | `skills/prd-generation/SKILL.md` |
| Code Reviewer | Revisar qualidade dos templates e integracoes | [Code Reviewer](../agents/code-reviewer.md) | Review phase |

## Documentation Touchpoints

| Guide | File | What changes |
| --- | --- | --- |
| Development Workflow | [development-workflow.md](../docs/development-workflow.md) | Adicionar referencia a ADRs como parte do workflow |
| Testing Strategy | [testing-strategy.md](../docs/testing-strategy.md) | Adicionar testes estruturais de ADR ao escopo |

## Risk Assessment

### Identified Risks

| Risk | Probability | Impact | Mitigation Strategy | Owner (Agent) |
| --- | --- | --- | --- | --- |
| Templates com guardrails genericos demais | Medium | Medium | Cada template tem exemplos de codigo concretos | `documentation-writer` |
| Skill modifications quebram testes existentes | Low | High | Rodar suite existente apos cada modificacao | `test-writer` |

### Assumptions

- `.context/templates/adrs/` nao existe ainda (confirmado via Glob)
- Templates sao Markdown puro, sem logica executavel
- Skills existentes aceitam extensoes sem breaking changes

## Working Phases

### Phase 1 — Tests & Template Structure (Tasks 1-2)

> **Primary Agent:** `test-writer` - [Playbook](../agents/test-writer.md)

**Objective:** Criar testes estruturais TDD-first e a estrutura de diretorios.

| # | Task | Agent | Status | Deliverable |
|---|------|-------|--------|-------------|
| 1.1 | Escrever `test-adr-structural.mjs` | `test-writer` | pending | Testes que validam frontmatter, diretorios, README, skills |
| 1.2 | Criar estrutura de diretorios + README index | `documentation-writer` | pending | `.context/templates/adrs/` com 5 subdiretorios + README |

**Commit Checkpoint:** `test(adr): add structural tests` + `feat(adr): create template structure`

---

### Phase 2 — ADR Templates (Tasks 3-8)

> **Primary Agent:** `documentation-writer` - [Playbook](../agents/documentation-writer.md)

**Objective:** Criar os 21 templates ADR organizacionais em 5 categorias.

| # | Task | Agent | Status | Deliverable |
|---|------|-------|--------|-------------|
| 2.1 | Principios de Codigo (6 templates) | `documentation-writer` | pending | SOLID + Clean Code para Python/TS/Go |
| 2.2 | Qualidade & Testes (4 templates) | `documentation-writer` | pending | TDD Python/TS/Go + Code Review |
| 2.3 | Arquitetura (3 templates) | `documentation-writer` | pending | Layered, Hexagonal, Micro vs Mono |
| 2.4 | Seguranca (3 templates) | `documentation-writer` | pending | OWASP, Secrets, Least Privilege |
| 2.5 | Infraestrutura (5 templates) | `documentation-writer` | pending | Terraform, CDK, GH Actions, GitLab CI, AWS Data Lake |
| 2.6 | Scaffold de repo externo | `documentation-writer` | pending | `templates/adr-repo-scaffold/` |

**Commit Checkpoint:** Um commit por categoria

---

### Phase 3 — Skill Modifications (Tasks 9-12)

> **Primary Agent:** `architect-specialist` - [Playbook](../agents/architect-specialist.md)

**Objective:** Integrar ADRs aos 5 skills do PREVC workflow.

| # | Task | Agent | Status | Deliverable |
|---|------|-------|--------|-------------|
| 3.1 | `prd-generation` — entrevista stack + ADR recommendation | `architect-specialist` | pending | Steps 4.5 e 9.5 adicionados |
| 3.2 | `prevc-planning` — leitura de ADR guardrails | `architect-specialist` | pending | Step 1 estendido |
| 3.3 | `prevc-validation` — compliance check | `architect-specialist` | pending | Step 2.5 adicionado |
| 3.4 | `context-awareness` + `context-sync` — ADR support | `architect-specialist` | pending | ADR directory no escopo |

**Commit Checkpoint:** Um commit por skill

---

### Phase 4 — Validation & Final Tests (Task 13)

> **Primary Agent:** `test-writer` - [Playbook](../agents/test-writer.md)

**Objective:** Verificar que todo o sistema funciona integrado.

| # | Task | Agent | Status | Deliverable |
|---|------|-------|--------|-------------|
| 4.1 | Rodar testes ADR estruturais (todos passam) | `test-writer` | pending | 100% pass |
| 4.2 | Rodar testes existentes (sem regressao) | `test-writer` | pending | 100% pass |
| 4.3 | Rodar suite completa | `test-writer` | pending | 100% pass |

**Commit Checkpoint:** `test(adr): verify full integration`

## Success Criteria

- 21 templates ADR com frontmatter valido e secoes Guardrails + Enforcement
- README index lista todos os templates
- 5 skills referenciam ADRs
- Testes estruturais passam
- Testes existentes sem regressao
- Scaffold de repo externo funcional
