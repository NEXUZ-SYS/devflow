---
type: plan
name: Importador Reversa evidência-primeiro
description: Trocar o importador Reversa → DevFlow de transpiler-de-plano para carga de evidência classificada, com o PREVC Planning autorando o plano.
planSlug: import-reversa-evidence-first
summary: "O importador deixa de derivar plano (PRD/stories.yaml/plans.json) e passa a carregar evidência classificada; o plano nasce na fase P do PREVC. Detalhamento TDD em docs/superpowers/plans/2026-07-23-import-reversa-evidence-first.md"
agents:
  - type: "architect-specialist"
    role: "Validar a fronteira entre carga de evidência e autoria de plano"
  - type: "test-writer"
    role: "Perfis de fixture derivados dos Reversa reais e cobertura TDD"
  - type: "security-auditor"
    role: "Auditar o enquadramento do corpus de terceiro como dado, nunca instrução"
  - type: "code-reviewer"
    role: "Revisar a remoção de comportamento publicado e a migração de contrato"
  - type: "documentation-writer"
    role: "SKILL.md, contrato lib-skill e nota de breaking no CHANGELOG"
docs:
  - "architecture.md"
  - "testing-strategy.md"
  - "security.md"
  - "development-workflow.md"
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    summary: "Spec aprovada com 7 decisoes (D1-D7) e plano TDD de 12 tarefas escrito. Achado que reorganizou o design - o Reversa ja produz um handoff.md canonico (template + checklist + frontmatter tipado), que e o indice que o design anterior propunha construir do zero."
    deliverables:
      - "docs/superpowers/specs/2026-07-23-import-reversa-evidence-first-design.md"
      - "docs/superpowers/plans/2026-07-23-import-reversa-evidence-first.md"
    steps:
      - order: 1
        description: "Brainstorming - 7 decisoes fechadas com o operador"
        assignee: "architect-specialist"
        deliverables:
          - "spec aprovada"
      - order: 2
        description: "Plano TDD de 12 tarefas, 61 passos, sem placeholders"
        assignee: "test-writer"
        deliverables:
          - "plano detalhado"
  - id: "phase-2"
    name: "Review"
    prevc: "R"
    summary: "Revisar a remocao de comportamento publicado (PRD/stories/plans desde v1.31.0), o enquadramento de seguranca do handoff como dado, e a perda de automacao no modo forward (os marcos M1-M7 do attio sao reais na fonte e dao lugar a curadoria)."
    required_sensors:
      - tests
      - lint
    required_artifacts:
      - handoff-summary
    deliverables:
      - "aprovacao do design e do corte de escopo"
      - "revisao de seguranca do enquadramento anti-injecao"
    steps:
      - order: 1
        description: "Revisar a mudanca de contrato e seu impacto em quem usa o modo forward"
        assignee: "code-reviewer"
        deliverables:
          - "parecer sobre o breaking"
      - order: 2
        description: "Auditar o tratamento do corpus de terceiro - a ancora contem imperativos enderecados a agente de codificacao"
        assignee: "security-auditor"
        deliverables:
          - "parecer de seguranca"
  - id: "phase-3"
    name: "Execution"
    prevc: "E"
    summary: "12 tarefas TDD RED-GREEN-REFACTOR. Ordem - fixtures (causa-raiz), handoff, classify, ledger, adrs, preserve, index, IR/consistency, rewire+remocoes, write, SKILL.md, CHANGELOG. Task 1 primeiro de proposito - a divida de fixture e o motivo de 101/101 verde sobre defeitos reais."
    required_sensors:
      - tests
      - lint
    required_artifacts:
      - handoff-summary
    deliverables:
      - "3 unidades novas - handoff.mjs, classify.mjs, ledger.mjs"
      - "3 reescritas - emitters/adrs.mjs, emitters/preserve.mjs, consistency.mjs"
      - "5 remocoes - emitters/prd, emitters/stories, emitters/plans, map.mjs, readiness.mjs"
      - "4 perfis de fixture derivados dos Reversa reais"
    steps:
      - order: 1
        description: "Tasks 1-4 - fixtures, handoff, classify, ledger"
        assignee: "test-writer"
        deliverables:
          - "codigo + testes"
      - order: 2
        description: "Tasks 5-8 - adrs, preserve, index, IR/consistency"
        assignee: "feature-developer"
        deliverables:
          - "codigo + testes"
      - order: 3
        description: "Tasks 9-12 - rewire + remocoes, write layout-aware, SKILL.md, CHANGELOG"
        assignee: "refactoring-specialist"
        deliverables:
          - "codigo + testes + docs"
  - id: "phase-4"
    name: "Validation"
    prevc: "V"
    summary: "Suite verde sem regressao. Medicao contra os dois corpora Reversa reais (so-leitura) deve substituir o baseline - 0 ADRs para 5 no OKR, 0,0% dos bytes preservados para espelho estrutural completo, features-fantasma para 0. Conferir que nenhum projeto-fonte foi tocado."
    required_sensors:
      - tests
      - lint
    required_artifacts:
      - handoff-summary
    deliverables:
      - "test-report"
      - "medicao de contraste contra o baseline"
      - "prova de que a fonte permanece intocada"
    steps:
      - order: 1
        description: "Suite completa - run-unit.sh e run-lint.sh"
        assignee: "test-writer"
        deliverables:
          - "test-report"
      - order: 2
        description: "Medicao read-only contra attio e OKR, conferindo origem intocada"
        assignee: "code-reviewer"
        deliverables:
          - "contraste vs baseline"
  - id: "phase-5"
    name: "Confirmation"
    prevc: "C"
    summary: "Finalizacao pela pipeline de autoFinish - README/CHANGELOG, commit, push, PR, merge, cleanup. Versionamento por pipeline (release.yml manual), entao signpost de release, nunca auto-dispatch."
    deliverables:
      - "PR mergeado na main"
      - "signpost de release emitido"
    steps:
      - order: 1
        description: "Abrir PR com nota de breaking e aguardar checks obrigatorios"
        assignee: "documentation-writer"
        deliverables:
          - "PR"
      - order: 2
        description: "Merge, cleanup de branch e signpost de release (bump minor)"
        assignee: "devops-specialist"
        deliverables:
          - "merge + signpost"
generated: "2026-07-23"
status: filled
scaffoldVersion: "2.0.0"
---

# Importador Reversa evidência-primeiro

> O importador deixa de derivar plano e passa a carregar evidência classificada.
> O plano nasce na fase P do PREVC, com brainstorming e humano no loop.

**Detalhamento TDD tarefa a tarefa:** [`docs/superpowers/plans/2026-07-23-import-reversa-evidence-first.md`](../../docs/superpowers/plans/2026-07-23-import-reversa-evidence-first.md)
**Spec:** [`docs/superpowers/specs/2026-07-23-import-reversa-evidence-first-design.md`](../../docs/superpowers/specs/2026-07-23-import-reversa-evidence-first-design.md)

## Task Snapshot

- **Primary goal:** o `import-reversa` carrega evidência do corpus Reversa e entrega o planejamento à fase P do PREVC, em vez de derivar PRD/stories/plans por regex.
- **Success signal:** contra os dois corpora Reversa reais, o importador passa de 0 ADRs e 0,0–1,2% dos bytes preservados para conversão dos ADRs reais e espelho estrutural completo — sem features-fantasma e sem PRD vazio.
- **Escopo de mudança:** apenas o plugin DevFlow (`scripts/reversa-import/**`, `skills/import-reversa/**`, `tests/reversa-import/**`). Os projetos Reversa são corpus **só-leitura** para medição; as fixtures são **derivadas**, nunca cópias.

## Decisões (D1–D7)

| # | Decisão | Escolha |
|---|---|---|
| D1 | O que o importador emite sozinho | Híbrido — converte só o 1:1 real (ADRs); o resto é evidência |
| D2 | Onde a evidência aterrissa | Espelho imutável + promoção curada às camadas DDC |
| D3 | Seam com o PREVC | Fluxo contínuo — termina invocando o Planning |
| D4 | Ledger de confiança | Vira restrição do plano, observada na fase V (ADR-013) |
| D5 | Vale para os dois modos | Uniforme — o modo vira metadado de proveniência |
| D6 | Conflitos internos do corpus | Detecta e apresenta como primeira pauta; não bloqueia |
| D7 | Camada de design | Âncora + RC e parity tests estruturados (registrar ≠ converter) |

## Baseline medido (2026-07-23)

| | attio (forward) | OKR (reverse) |
|---|---|---|
| features | 20 | 8 (**todas fantasma**) |
| milestones | 7 | **0** |
| ADRs emitidos | **0** | **0** |
| PRD | 1571 B | **211 B** (vazio) |
| bytes preservados | **1,2%** | **0,0%** |

Suíte atual: **101 testes, 0 falhas** — sobre um fixture sintético que modela só o forward idealizado. Essa é a causa-raiz de todos os defeitos acima terem passado despercebidos.

## Riscos

| Risco | Probabilidade | Impacto | Mitigação | Owner |
|---|---|---|---|---|
| Remoção de comportamento publicado (PRD/stories/plans desde v1.31.0) quebra uso existente | Alta (é certo) | Médio | Nota de breaking no CHANGELOG; o importador passa a invocar o Planning, que produz os mesmos artefatos com curadoria | `code-reviewer` |
| Perda de automação no forward — os marcos M1–M7 do attio são reais na fonte | Média | Médio | Aceito conscientemente (D5): manter dois pipelines custa duas suítes e duas fixtures, e a dívida de fixture é a causa-raiz | `architect-specialist` |
| Corpus de terceiro contém imperativos endereçados a agente de codificação | Alta (confirmado no handoff real) | Alto | `stripInjection` + enquadramento explícito como rascunho sob revisão + teste dedicado de que a moldura sobrevive | `security-auditor` |
| Corpus Reversa é vivo (207→475 KB em 2 dias) e re-importação vira caso comum | Alta | Baixo | Manifesto schema 2 com hash por artefato + `diffSourceAgainstManifest` + teste de round-trip | `test-writer` |

## Premissas

- O layout do handoff (`kind: handoff` em frontmatter) é estável na v1.2.43 do Reversa. Se mudar, a cascata degrada para `_plan/` e depois `reconstruction-plan.md` — e a ausência total é resultado de primeira classe, não erro.
- O destino de ADRs é detectado (`.context/engineering/adrs/` no DDC v2), nunca hardcoded.

## Evidência a coletar

- `bash tests/run-unit.sh` e `bash tests/run-lint.sh` verdes ao fim de cada tarefa
- Medição read-only contra os dois corpora reais, contrastando com o baseline acima
- Prova de que nenhum arquivo dos projetos Reversa foi criado, alterado ou removido

## Follow-up

| Ação | Owner | Quando |
|---|---|---|
| Doc drift: `adr-builder/SKILL.md` diz `.context/adrs/` "NEVER elsewhere", mas a migração v2 move para `engineering/adrs/` | `documentation-writer` | feature separada |
| Promoção curada da evidência às camadas DDC via `devflow:knowledge` | `architect-specialist` | sob demanda, pós-merge |
