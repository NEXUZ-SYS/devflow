---
type: plan
name: "ID verificado do tier antes da primeira troca da sessão"
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-10-10-routing-session-tier-ids.md. Spec em docs/superpowers/specs/2026-10-10-routing-session-tier-ids-design.md.
planSlug: routing-session-tier-ids
scope: LARGE
autonomy: supervised
status: filled
progress: 0
generated: "2026-10-10"
scaffoldVersion: "2.0.0"
summary: "D21 v1.2: a sessão do roteamento só trocava de tier depois de aprender o ID completo por um subagente. Agora resolve candidatos (cache por usuário, models.ids, tabela padrão) e verifica cada um com uma sonda de 1 token ($.model.complete) antes de usar no turn.step. Ledger com probe/idPending/idSource; relatório e INV-SESS do laboratório explicam a causa. ADR-017 v1.2.0. Sonda R-11 + 9 tasks TDD (rev. 2 após a fase R)."
requiredSignals: [unit, integration, e2e, lint, standards]
review:
  verdict: PROCEED
  reviewers: [architect, security-auditor]
  date: "2026-10-10"
sources:
  spec: docs/superpowers/specs/2026-10-10-routing-session-tier-ids-design.md
  plan: docs/superpowers/plans/2026-10-10-routing-session-tier-ids.md
  adrs:
    - .context/engineering/adrs/017-model-routing-v1.1.0.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Brainstorming supervisionado: abordagem 'cadeia + sonda' escolhida pelo operador (aprendido → cache → models.ids → tabela, sempre com sonda antes do turn.step). Spec e plano aprovados."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: completed
    summary: "Architect REVISE (15 achados, 2 BLOCK) e security-auditor REPROVADO (10 achados, 1 BLOCK), desenho mantido; tudo incorporado (1cecfe2): ADR-017 antes do código, isTierId com uma família, cache com proveniência e realPath, 400 = erro, sonda no relógio, sonda R-11 antes da E. env do settings do projeto → backlog (risco aceito). Operador aprovou PROCEED."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - lint
    steps:
      - order: 1
        description: "Task 0 — sonda R-11 no engine real (controlador)"
        assignee: "architect"
      - order: 2
        description: "Task 1 — ADR-017 v1.2.0 antes do código"
        assignee: "architect"
      - order: 3
        description: "Task 2 — isTierId no domínio"
        assignee: "backend-specialist"
      - order: 4
        description: "Task 3 — ledger: chaves novas e cache de IDs"
        assignee: "backend-specialist"
      - order: 5
        description: "Task 4 — config: models.ids e IDs candidatos da tabela"
        assignee: "backend-specialist"
      - order: 6
        description: "Task 5 — core: candidatos, sonda e ID pendente"
        assignee: "backend-specialist"
      - order: 7
        description: "Task 6 — adaptador: sonda agendada, cache contido e ledger"
        assignee: "backend-specialist"
      - order: 8
        description: "Task 7 — relatório: sondas e ID pendente"
        assignee: "backend-specialist"
      - order: 9
        description: "Task 8 — CHANGELOG, guia, skill de config e achados"
        assignee: "documentation-writer"
      - order: 10
        description: "Task 9 — laboratório: allowlist e causa no INV-SESS"
        assignee: "backend-specialist"
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
  - id: "phase-4"
    name: "Confirmation"
    prevc: "C"
    status: pending
lastUpdated: "2026-10-11T00:13:08.765Z"
---

# ID verificado do tier antes da primeira troca da sessão

Tracking do workflow `routing-session-tier-ids`. O conteúdo canônico está na
[spec](../../docs/superpowers/specs/2026-10-10-routing-session-tier-ids-design.md) e no
[plano](../../docs/superpowers/plans/2026-10-10-routing-session-tier-ids.md).

Origem: campanha do laboratório 2026-10-10 (v3.8.1). No braço D-stress a sessão ficou em opus durante toda a fase E
(`INV-SESS` 27/130 MISS) e só trocou para sonnet 27 s depois do primeiro subagente sonnet, na fase V. No braço B, 41/98
MISS sem nenhuma troca.

## Riscos

| Risco | Mitigação |
|---|---|
| ID errado no `turn.step` derruba o turno | nenhum candidato vai ao `turn.step` sem sonda ok na sessão |
| Cache de outra conta ou provedor | o cache é só candidato; sempre re-sondado |
| Repositório aponta um tier para modelo mais caro | filtro `tierOf(id) === tier` em config, cache e tabela |
| Sonda gasta cota | 1 token de saída, por tier, por sessão, só quando falta ID |
| Testes antigos do adaptador contam `model.complete` | filtrar por `prompt !== "ok"`, sem afrouxar asserção |

## Execution History

> Last updated: 2026-10-11T00:13:08.765Z | Progress: 0%
