---
name: prd-generation
description: "Use to generate a complete product PRD with phased roadmap — supports new projects and retroactive PRD for existing codebases"
---

# PRD Generation

Generate a complete Product Requirements Document with all phases defined upfront. Supports two modes: new projects (Modo A) and existing codebases (Modo B). The PRD lives above the PREVC cycle — each phase becomes a separate PREVC run.

**Language:** All templates, interview questions, and announcements below are written in English as structural references. When executing this skill, use the user's configured language (see `devflow:language`) for ALL output: PRD content, section headers, labels, interview questions, and status announcements. Keep only technical terms (e.g., RICE, MoSCoW, MVP, PREVC) untranslated.

<HARD-GATE>
Do NOT skip the interview step. Codebase analysis alone cannot capture user intent, priorities, or constraints. The interview is mandatory in both modes.
</HARD-GATE>

**Announce at start:** "I'm using the devflow:prd-generation skill to generate the product PRD."

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Detect mode** — Modo A (new) or Modo B (existing)
2. **Gather context** — invoke `devflow:context-awareness`
3. **Analyze existing state** (Modo B only) — map what already exists
4. **Interview user** — Socratic process, one question at a time
5. **Interview STACK** — collect tech stack information
6. **Synthesize** — cross-reference code analysis with interview
7. **Generate PRD** — apply template, RICE, MoSCoW
8. **Decompose into phases** — invoke `devflow:feature-breakdown`
9. **Present for approval** — section by section
10. **Save PRD** — write to `.context/plans/<project>-prd.md`
11. **Interview ADRs** — recommend and instantiate organizational ADRs
12. **Handoff** — announce readiness for PREVC of first pending phase

## Step 1: Detect Mode

Auto-detect based on project state:

| Condition | Mode |
|---|---|
| `.context/docs/project-overview.md` exists with `status: filled` | **Modo B** (existing project) |
| `docs/superpowers/specs/` has spec files | **Modo B** (existing project) |
| Otherwise | **Modo A** (new project) |

Announce the detected mode: "Detected **Modo A/B** — [new project / existing codebase]."

## Step 2: Gather Context

Invoke `devflow:context-awareness` to map the project.

### Full Mode
```
context({ action: "buildSemantic" })
context({ action: "getMap" })
context({ action: "detectPatterns" })
```

### Lite Mode
Read in order:
- `.context/docs/project-overview.md`
- `.context/docs/codebase-map.json`
- `.context/docs/development-workflow.md`
- `.context/docs/testing-strategy.md`

### Minimal Mode
Explore project files, `README.md`, `package.json`/`Cargo.toml`/`go.mod`, recent git commits.

## Step 3: Analyze Existing State (Modo B only)

Without asking any questions yet, build a "Current State" picture:

1. Read `.context/plans/` — existing plans and their completion status
2. Read `docs/superpowers/specs/` — specs already generated
3. Analyze `git log --oneline -30` — recent features and milestones
4. Summarize: what components exist, what's complete, what's partially done

Output internally: a draft "Current State" section for the PRD.

## Step 4: Interview User

Socratic process — **one question at a time**. Prefer multiple choice when possible.

### Modo A Questions (new project)
1. "What is the end goal of this project? What problem does it solve?"
2. "Who is the target user?"
3. "What are the core capabilities that make this product valuable?"
4. "What's the minimum viable version? What must Phase 1 include?"
5. "What are the known constraints? (tech stack, timeline, dependencies)"
6. "Are there features you've already decided are out of scope?"

### Modo B Questions (existing project)
Present the "Current State" analysis first, then ask:
1. "Does this analysis of what exists match your understanding?"
2. "What do you consider already complete vs still in progress?"
3. "What's the end goal — what does the finished product look like?"
4. "What are the next deliverables in priority order?"
5. "Is there anything that needs to be redone or refactored?"
6. "What are the constraints? (time, tech, dependencies)"

Continue with follow-up questions as needed. Stop when you have enough to define all phases.

## Step 4.5: Entrevista STACK

Apos a entrevista do PRD, coletar informacoes sobre a stack tecnica do projeto.

**Perguntas (uma por vez, multipla escolha):**

1. "Quais sao as linguagens principais do projeto?"
   - (A) Python
   - (B) TypeScript
   - (C) Go
   - (D) Java
   - (E) Rust
   - (F) Outra (especificar)
   - Aceita multiplas respostas.

2. "Qual cloud provider?"
   - (A) AWS
   - (B) GCP
   - (C) Azure
   - (D) Nenhum / on-premise

3. "Qual padrao de arquitetura?"
   - (A) Layered (Controller-Service-Repository)
   - (B) Hexagonal (Ports & Adapters)
   - (C) Microservices
   - (D) Monolith modular
   - (E) Event-Driven
   - (F) Ainda nao definido

4. "Usa Infrastructure as Code?"
   - (A) Terraform
   - (B) AWS CDK
   - (C) Pulumi
   - (D) Nenhum

5. "Qual CI/CD?"
   - (A) GitHub Actions
   - (B) GitLab CI
   - (C) Jenkins
   - (D) Nenhum / outro

Salvar as respostas como secao **Stack** no PRD:

```markdown
## Stack

| Aspecto | Escolha |
|---------|---------|
| Linguagens | Python, TypeScript |
| Cloud | AWS |
| Arquitetura | Layered |
| IaC | Terraform |
| CI/CD | GitHub Actions |
```

## Step 5: Synthesize

Cross-reference codebase analysis with interview answers:

1. Map features mentioned in interview to existing code (Modo B)
2. Identify gaps between current state and product vision
3. Group related features into logical phases
4. Determine dependencies between phases
5. Apply **RICE scoring** to each phase:
   - **Reach:** How many users/components affected
   - **Impact:** massive (3x) / high (2x) / medium (1x) / low (0.5x) / minimal (0.25x)
   - **Confidence:** high (100%) / medium (80%) / low (50%)
   - **Effort:** person-months estimate (xl/l/m/s/xs)
6. Apply **MoSCoW** classification:
   - **Must Have:** Critical for MVP / next release
   - **Should Have:** Important but not blocking
   - **Could Have:** Nice to have
   - **Won't Have:** Explicitly out of scope

## Step 6: Generate PRD

Choose the template that matches the project scope, then apply it:

| Template | When to Use | Typical Scope |
|---|---|---|
| **Standard PRD** | Complex products with multiple phases | 6+ weeks |
| **One-Page PRD** | Simple features or small products | 2-4 weeks |
| **Feature Brief** | Exploration / pre-PRD validation | ~1 week |
| **Agile Epic** | Sprint-based delivery teams | Variable |

Default to **Standard PRD** unless the user requests otherwise or scope is clearly small.

### Template: Standard PRD

Apply the Standard PRD template structure adapted for phased delivery:

```markdown
---
type: plan
name: <project>-prd
description: Product Requirements Document
category: prd
generated: YYYY-MM-DD
status: active
scaffoldVersion: "2.0.0"
---

# PRD: <Project Name>

## Executive Summary
- **Problem:** [2-3 sentences]
- **Solution:** [2-3 sentences]
- **Business Impact:** [3 bullet points]

## Product Vision
[End goal, differentiation, target users]

## Current State
[Modo B: what already exists. Modo A: "Greenfield project."]

## Phased Roadmap

### Phase 1: <name> — MVP
- **Scope:** [what it includes]
- **Depends on:** —
- **RICE Score:** [calculated score]
- **MoSCoW:** Must Have
- **Done Criteria:** [specific, measurable criteria]
- **Spec:** (generated when phase starts)
- **Plan:** (generated when phase starts)
- **Status:** ⬚ Pending

### Phase 2: <name>
- **Scope:** [what it includes]
- **Depends on:** Phase 1
- **RICE Score:** [calculated score]
- **MoSCoW:** [Must/Should/Could]
- **Done Criteria:** [specific, measurable criteria]
- **Status:** ⬚ Pending

### Phase N: <name>
...

## Out of Scope
[Won't Have items — explicitly listed]

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| ... | ... | ... | ... |

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| ... | ... | ... |
```

### Template: One-Page PRD

For simple features or small products (2-4 weeks scope):

```markdown
# One-Page PRD: <Feature Name>

**Problem:** [2-3 sentences — what pain exists today]
**Solution:** [2-3 sentences — what we're building]
**Target User:** [who benefits]
**Success Metrics:** [2-3 measurable outcomes]

## Scope
- **In:** [bullet list of what's included]
- **Out:** [bullet list of what's explicitly excluded]

## Requirements
1. [Requirement with acceptance criteria]
2. [Requirement with acceptance criteria]
3. ...

## Risks
- [Risk → mitigation]

## Timeline
- **Target:** [date or sprint]
- **Dependencies:** [what must exist first]
```

### Template: Feature Brief

For exploration / pre-PRD validation (~1 week scope):

```markdown
# Feature Brief: <Topic>

## Hypothesis
We believe that [building this feature]
for [these users]
will [achieve this outcome].
We'll know we're right when [measurable metric].

## Problem Evidence
- [Data point or user quote supporting the problem]
- [Data point or user quote]

## Proposed Exploration
- [ ] [Investigation or prototype task]
- [ ] [Investigation or prototype task]

## Decision Criteria
After exploration, proceed to full PRD if:
- [Condition 1]
- [Condition 2]
```

### Template: Agile Epic

For sprint-based delivery teams:

```markdown
# Epic: <Name>

**Goal:** [what this epic achieves]
**Owner:** [who drives it]
**Target Sprint(s):** [sprint range]

## User Stories
- As a [user], I want [capability] so that [benefit]
- As a [user], I want [capability] so that [benefit]

## Acceptance Criteria
- [ ] [Testable criterion]
- [ ] [Testable criterion]

## Dependencies
- [Upstream dependency]

## Definition of Done
- [ ] All stories completed
- [ ] Tests passing
- [ ] Documentation updated
```

## Discovery & Metrics Frameworks

Use these frameworks during Steps 4-5 (Interview and Synthesis) to enrich the PRD.

### Hypothesis Template

Use when validating whether a phase or feature is worth building:

```
We believe that [building this feature]
for [these users]
will [achieve this outcome].
We'll know we're right when [measurable metric].
```

### Opportunity Solution Tree

Use when mapping multiple solutions to a desired outcome:

```
Outcome (North Star goal)
├── Opportunity 1 (user problem)
│   ├── Solution A
│   └── Solution B
└── Opportunity 2 (user problem)
    ├── Solution C
    └── Solution D
```

Each phase in the PRD roadmap should trace back to an opportunity.

### North Star Metric Framework

Use when defining Success Metrics in the PRD:

1. **Identify Core Value:** What's the #1 value delivered to users?
2. **Make it Measurable:** Quantifiable and trackable
3. **Ensure It's Actionable:** Teams can directly influence it
4. **Check Leading Indicator:** Does it predict business success?

### Feature Success Metrics

Use when defining Done Criteria and Success Metrics per phase:

| Metric | Definition | How to Measure |
|---|---|---|
| **Adoption** | % of users using the feature | Usage analytics |
| **Frequency** | Usage per user per time period | Event tracking |
| **Depth** | % of feature capability used | Feature coverage |
| **Retention** | Continued usage over time | Cohort analysis |
| **Satisfaction** | User perception of value | NPS/CSAT/feedback |

### Value vs Effort Matrix

Use alongside RICE when a quick visual prioritization is needed:

```
         Low Effort    High Effort

High     QUICK WINS    BIG BETS
Value    [Prioritize]  [Strategic]

Low      FILL-INS      TIME SINKS
Value    [Maybe]       [Avoid]
```

## Step 7: Decompose Phases

For each phase, invoke `devflow:feature-breakdown` to validate:
- Phase scope is independently deliverable
- Dependencies between phases are correct
- Each phase produces testable, working software
- No circular dependencies

Do NOT generate detailed specs or plans for future phases. Only the phase scope, dependencies, and done criteria.

## Step 8: Present for Approval

Present the PRD section by section to the user:

1. Executive Summary + Product Vision → approve?
2. Current State (Modo B) → accurate?
3. Phased Roadmap (each phase) → approve scope and order?
4. Out of Scope → anything missing?
5. Risks & Success Metrics → approve?

Revise sections based on feedback before moving on.

## Step 9: Save PRD

Save the approved PRD to `.context/plans/<project>-prd.md`.

If `.context/plans/` doesn't exist, create it.

## Step 9.5: Entrevista ADRs

Apos salvar o PRD, oferecer adocao de ADRs organizacionais.

### Pergunta fonte

"Sua equipe ja possui um repositorio padrao de ADRs (Architecture Decision Records)?"

**(A)** Sim, tenho um repositorio
   → Solicitar URL do repositorio git (ex: `github.com/org/context-adrs-nexuz`)
   → Clonar/copiar templates do repositorio para `.context/templates/adrs/`
   → Usar como fonte de templates

**(B)** Nao, quero usar os templates padrao do DevFlow
   → Verificar se `.context/templates/adrs/` existe
   → Se nao existe, copiar de `templates/` do DevFlow (kit inicial)
   → Usar templates locais

**(C)** Nao, quero criar um repositorio de ADRs para meu time (em breve)
   → Gerar scaffold usando `templates/adr-repo-scaffold/` como base
   → Perguntar nome do time para o repo: `context-adrs-<team>`
   → Perguntar se quer publicar no GitHub (`gh repo create`)
   → Apos criar, usar o scaffold como fonte

**(D)** Nao quero usar ADRs neste projeto
   → Pular para Step 10 (Handoff)

### Recomendacao

Apos definir a fonte de templates:

1. Ler todos os templates disponiveis em `.context/templates/adrs/`
2. Cruzar com a Stack do PRD (Step 4.5):
   - Para cada template, verificar se `stack` do frontmatter corresponde a alguma resposta da stack
   - Templates com `stack: universal` sao sempre recomendados
3. Apresentar lista com checkbox:
   ```
   Com base no seu PRD (Python + AWS + Terraform), recomendo estas ADRs:
   ✅ SOLID para Python — principios de codigo
   ✅ Clean Code para Python — legibilidade
   ✅ TDD para Python — qualidade obrigatoria
   ✅ OWASP Top 10 — seguranca baseline
   ✅ Secrets Management — gestao de segredos
   ✅ IaC com Terraform — infraestrutura
   ✅ AWS Data Lake — padroes Lakehouse
   ⬜ Hexagonal Architecture — nao detectado no PRD
   ```
4. Usuario aceita/rejeita cada uma

### Instanciacao

Para cada template aceito:
1. Copiar para `.context/adrs/` com numeracao sequencial (001, 002, ...)
2. Gerar `.context/adrs/README.md` com indice:
   ```markdown
   # ADRs do Projeto

   Decisoes arquiteturais ativas neste projeto.
   A IA consulta este indice durante o context gathering do PREVC Planning.

   ## ADRs Ativas

   | # | Titulo | Escopo | Status | Guardrails | Stack |
   |---|--------|--------|--------|------------|-------|
   | 001 | SOLID para Python | Organizacional | Aprovado | 8 regras | Python |
   | ... | ... | ... | ... | ... | ... |

   ## Como a IA usa estas ADRs

   1. No inicio do Planning phase, a IA le este README
   2. Identifica ADRs relevantes pela stack e categoria
   3. Le os guardrails das ADRs aplicaveis
   4. Aplica como restricoes durante brainstorming, design e implementacao
   5. No Validation phase, verifica compliance com os guardrails
   ```
3. Adicionar referencia no PRD:
   ```markdown
   ## ADRs Associados
   - [001 - SOLID para Python](.context/adrs/001-solid-python.md)
   - [002 - TDD para Python](.context/adrs/002-tdd-python.md)
   ```

## Step 10: Handoff

Announce readiness:

> "PRD saved to `.context/plans/<project>-prd.md`. Phase 1 (<name>) is ready for PREVC. Start planning Phase 1 now?"

If user says yes → invoke `devflow:prevc-flow` with Phase 1 scope as the task description.

## Mode Integration

### Full Mode
```
context({ action: "scaffoldPlan", planName: "<project>-prd", title: "PRD: <project>", summary: "<PRD content>", semantic: true, autoFill: true })
```

### Lite Mode
Write directly to `.context/plans/<project>-prd.md`.

### Minimal Mode
Write to `.context/plans/<project>-prd.md` (create directory if needed).

## Anti-Patterns

| Pattern | Problem |
|---|---|
| "Detail all phases now" | Only the current phase gets a detailed spec; future phases stay at macro scope |
| "The PRD is the spec" | PRD is the roadmap; spec is the technical detail of one phase |
| "Skip the interview in Modo B" | Code analysis doesn't capture intent or priority |
| "Phases without done criteria" | Every phase needs a clear, measurable definition of done |
| "One giant phase" | If a phase touches 5+ components, decompose further |
| "Reorder phases ignoring dependencies" | RICE scores guide priority, but dependencies constrain order |
