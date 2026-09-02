---
type: plan
name: Escopo de versão para stacks e standards de perfil
description: Stacks e standards de perfil passam a conhecer a versão do framework que o projeto realmente usa — resolvedor no nível do projeto, faixa appliesFrom/appliesUntil, e reconcile com poda.
planSlug: version-scoped-stacks-standards
summary: "Bug medido no nexuz/odoo_17: o init semeou as 7 séries odoo-12..odoo-18 no manifest e o linter std-odoo-version-api-hygiene deu 47 falso-positivos (46 <tree> + 1 attrs=, ambos regras do 18) num projeto exclusivamente 17. Sob grounding docs-only, série a mais vira resposta errada, não ruído de lint. Causa raiz dupla: não há resolução de versão no nível do projeto, e artefatos de perfil não podem declarar até quando valem (MIN_SERIES só modela a partir de quando). 12 tasks TDD: resolvedor declarativo por stack, faixa no frontmatter, predicado fail-closed no chokepoint findApplicableStandards, split do std com duas faixas, remoção das 4 cópias divergentes de odooTargetSeries, e reconcile com poda sob confirmação. Retrocompatibilidade é a propriedade de segurança principal, com teste dedicado nas fases de loader e predicado."
agents:
  - type: "backend-specialist"
    role: "Resolvedor de versão, loader de standards e lib de manifesto"
  - type: "devops-specialist"
    role: "Subcomando reconcile e fiação de project-init/context-sync"
  - type: "test-writer"
    role: "Fixtures de regressão odoo17/odoo12/ts-src e testes de retrocompatibilidade"
  - type: "security-auditor"
    role: "Revisão dos padrões regex das sondas e da operação destrutiva de poda"
  - type: "code-reviewer"
    role: "Revisão do plano e das 12 tasks contra a spec"
docs:
  - "project-overview.md"
  - "architecture.md"
  - "development-workflow.md"
  - "testing-strategy.md"
  - "security.md"
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    required_sensors: ["lint"]
    summary: "Spec aprovada em brainstorming e plano de implementação de 12 tasks escrito e validado contra o gate test-first."
    deliverables:
      - "docs/superpowers/specs/2026-09-02-version-scoped-stacks-standards-design.md"
      - "docs/superpowers/plans/2026-09-02-version-scoped-stacks-standards.md"
      - "12 tasks, todas com Step 1 test-first, sem placeholder proibido"
    steps:
      - order: 1
        description: "Spec com 3 decisões fechadas e evidência medida no nexuz/odoo_17"
        assignee: "architect-specialist"
        deliverables:
          - "spec aprovada, evolução da decisão 3 registrada"
      - order: 2
        description: "Plano de 12 tasks bite-sized com código real e requiredSignals declarados"
        assignee: "architect-specialist"
        deliverables:
          - "plano com File Structure, Interfaces por task e Self-Review de cobertura"
  - id: "phase-2"
    name: "Review"
    prevc: "R"
    required_sensors: ["lint"]
    summary: "Revisar o plano contra os 4 pontos de risco antes de escrever código."
    deliverables:
      - "veredito do code-reviewer sobre os 4 pontos"
      - "veredito do security-auditor sobre sondas e poda"
    steps:
      - order: 1
        description: "Avaliar o stub de readFrameworkVersions na Task 6 substituído na Task 7 — inversão de ordem aceitável?"
        assignee: "code-reviewer"
        deliverables:
          - "decisão registrada"
      - order: 2
        description: "Avaliar os regex das sondas do YAML como superfície de ReDoS e o walk de MAX_DEPTH 6"
        assignee: "security-auditor"
        deliverables:
          - "veredito sobre compile() devolvendo null e o custo do walk"
      - order: 3
        description: "Avaliar a poda: fail-closed cobre monorepo com séries misturadas?"
        assignee: "security-auditor"
        deliverables:
          - "confirmação de que sem versão resolvida nada é podado"
      - order: 4
        description: "Avaliar a exportação de writeManifest — ampliar a superfície pública da lib é aceitável?"
        assignee: "code-reviewer"
        deliverables:
          - "decisão registrada"
  - id: "phase-3"
    name: "Execution"
    prevc: "E"
    required_sensors: ["lint", "unit"]
    summary: "Implementar as 12 tasks em ordem, RED-GREEN-REFACTOR, commit por task."
    deliverables:
      - "tests/fixtures/version-scoped/{odoo17,odoo12,ts-src}"
      - "scripts/lib/framework-version.mjs"
      - "stackVersions em detect-framework.mjs; axis e versionDetect em profiles/odoo.yaml"
      - "appliesFrom/appliesUntil no standards-loader; check novo no standard-audit"
      - "predicado de faixa em findApplicableStandards, fail-closed e retrocompatível"
      - "readFrameworkVersions em devflow-config.mjs"
      - "split std-odoo-api-removed-17 e -18; 4 odooTargetSeries removidos"
      - "reconcileManifest e subcomando devflow stacks reconcile"
      - "project-init e context-sync delegando ao reconcile"
    steps:
      - order: 1
        description: "Tasks 1-3: fixtures de regressão, sondas declarativas, npmDep e resolveStackVersions"
        assignee: "test-writer"
        deliverables:
          - "framework-version.mjs verde; fixtures validados"
      - order: 2
        description: "Tasks 4-7: axis/versionDetect no perfil, faixa no loader e no audit, predicado no chokepoint, persistência"
        assignee: "backend-specialist"
        deliverables:
          - "retrocompatibilidade provada por teste dedicado em cada uma"
      - order: 3
        description: "Tasks 8-9: split do std com duas faixas e remoção das 4 cópias de odooTargetSeries"
        assignee: "refactoring-specialist"
        deliverables:
          - "as duas regressões da spec (odoo17 e odoo12) verdes"
      - order: 4
        description: "Tasks 10-12: reconcileManifest, subcomando reconcile e fiação dos skills"
        assignee: "devops-specialist"
        deliverables:
          - "poda só sob --yes; context-sync sem semeadura aditiva"
  - id: "phase-4"
    name: "Validation"
    prevc: "V"
    required_sensors: ["lint", "unit", "integration", "e2e"]
    summary: "Os quatro sinais observados no ledger e as regressões da spec provadas contra os fixtures."
    deliverables:
      - "run-lint, run-unit, run-integration e run-e2e observados com exit 0"
      - "regressão odoo17: nenhuma regra do 18 se aplica"
      - "regressão odoo12: nem as de 17 nem as de 18 se aplicam"
      - "retrocompatibilidade: perfil e standard sem faixa inalterados"
    steps:
      - order: 1
        description: "Rodar os quatro runners e registrar no ledger do contrato verify"
        assignee: "test-writer"
        deliverables:
          - "quatro sinais observados"
      - order: 2
        description: "Verificar cobertura da spec seção a seção contra as tasks entregues"
        assignee: "code-reviewer"
        deliverables:
          - "tabela de cobertura §1-§8 conferida"
      - order: 3
        description: "Confirmar que nenhum linter de perfil resolve versão por conta própria"
        assignee: "security-auditor"
        deliverables:
          - "grep de odooTargetSeries/MIN_SERIES vazio em assets/standards/profiles/"
  - id: "phase-5"
    name: "Confirmation"
    prevc: "C"
    required_sensors: ["lint"]
    summary: "Fechar a branch, atualizar CHANGELOG e abrir o PR."
    deliverables:
      - "CHANGELOG atualizado"
      - "PR aberto contra a main"
    steps:
      - order: 1
        description: "Atualizar CHANGELOG e docs afetadas"
        assignee: "documentation-writer"
        deliverables:
          - "seção [Unreleased] com a feature"
      - order: 2
        description: "Abrir PR e sinalizar o release pendente (versioning: pipeline)"
        assignee: "devops-specialist"
        deliverables:
          - "PR aberto; signpost de release emitido, nunca auto-disparado"
generated: "2026-09-02"
status: filled
progress: 0
scaffoldVersion: "2.0.0"
lastUpdated: "2026-09-02T21:19:45.377Z"
---

# Escopo de versão para stacks e standards de perfil

> **Plano detalhado (fonte da verdade para execução):** `docs/superpowers/plans/2026-09-02-version-scoped-stacks-standards.md`
> **Spec:** `docs/superpowers/specs/2026-09-02-version-scoped-stacks-standards-design.md`

## Task Snapshot

- **Objetivo:** stacks e standards de perfil passam a conhecer a versão do framework que o projeto realmente usa.
- **Sinal de sucesso:** no fixture Odoo 17, o manifesto contém só `odoo-17` e nenhuma regra exclusiva do 18 dispara. No fixture Odoo 12, nem as regras de 17 nem as de 18 disparam. Projetos sem faixa declarada comportam-se exatamente como hoje.
- **Evidência de origem:** 47 falso-positivos em 589 arquivos do `nexuz/odoo_17`; 46 `<tree>` (correto no 17, renomeado só no 18) e 1 `attrs=` (removido só no 18). Aplicando um gate `series >= 18` manualmente: 47 → 0.

## Restrições globais

| Restrição | Origem |
|---|---|
| Apenas `node:*` — nenhuma dependência npm nova | Dependency Policy do repo |
| Retrocompatibilidade: sem faixa = comportamento de hoje | Propriedade de segurança principal da spec |
| Standard default (`source: devflow-default`) não declara faixa | Spec §3 |
| Fail-closed no runtime; pergunta no init | Decisão 2 da spec |
| Empate em `majority` → `ambiguous`, nunca desempate arbitrário | Spec §2 |
| Evidência é lista `[{probe, value, source}]`, nunca booleano | Spec §2 — opacidade tornou o bug invisível |
| Só o eixo série é persistido em `.devflow.yaml` | Spec §8 |
| Poda é destrutiva: sempre sob confirmação | Decisão 3 da spec |
| Todo acesso a `.devflow.yaml` pelo parser único | ADR-011 |
| SI-5 em globs, SI-4 em linters | ADR-002, ADR-007 |

## Os dois eixos

| Eixo | Semântica | Resolver significa | Filtro aplicado |
|---|---|---|---|
| **série** (`axis: series`) | `odoo-12`…`odoo-18` são alternativas da mesma coisa; exatamente uma vale | escolher uma, descartar o resto | na **semeadura** (reconcile com poda) |
| **composição** (default) | `react`, `typescript`, `zustand` coexistem | manter todos, pinar cada um na versão real | re-pin, nunca poda |

## Assimetria deliberada do momento do filtro

| Artefato | Momento | Razão |
|---|---|---|
| **Standards** | na hora de **aplicar** | baratos de ter; ao migrar 17→18 os do 18 passam a valer sem re-sync |
| **Stacks** | na hora de **semear** | dispara scrape externo caro e é a superfície de recuperação: série errada = resposta errada |

## Fora de escopo

- Override de versão por caminho (monorepo multi-versão) — YAGNI até aparecer o caso.
- Adicionar `expo`/`react-native` aos stacks default.
- Revisar os pins de curadoria dos ~22 defaults (`react: "19"`, `typescript: "6"`, `next: "16"`) — este plano os torna *resolvíveis*; revisar cada um é decisão à parte.

## Evidência a coletar

- Saída dos quatro runners com exit 0, registrada no ledger do contrato `verify:`.
- `grep -r "odooTargetSeries\|MIN_SERIES" assets/standards/profiles/` vazio.
- Manifesto do fixture Odoo 17 contendo exatamente `odoo-17` após `reconcile --yes`.

## Execution History

> Last updated: 2026-09-02T21:19:45.377Z | Progress: 0%
