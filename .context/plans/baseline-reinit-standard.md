---
type: plan
name: "baseline reinit: refazer o baseline de um standard"
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-10-08-baseline-reinit-standard.md. Spec em docs/superpowers/specs/2026-10-08-baseline-reinit-standard-design.md.
planSlug: baseline-reinit-standard
scope: MEDIUM
autonomy: supervised
status: filled
progress: 0
generated: "2026-10-08"
scaffoldVersion: "2.0.0"
summary: "Subcomando do operador que troca as entradas de um standard no baseline pelos achados atuais, com justificativa, só em terminal interativo. Função pura reinitStandard mais um ramo reinit no CLI; gate do CI e guards não mudam. Primeiro de dois subprojetos; o segundo é a migração dos 21 linters do protocolo antigo."
requiredSignals: [unit, integration, e2e, lint]
sources:
  spec: docs/superpowers/specs/2026-10-08-baseline-reinit-standard-design.md
  plan: docs/superpowers/plans/2026-10-08-baseline-reinit-standard.md
  adrs:
    - .context/engineering/adrs/015-deterministic-standards-enforcement-v1.1.0.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Brainstorming com o operador: comando próprio para a transição, nome reinit, vale para qualquer standard, dois PRs com o comando primeiro. Spec aprovada, ADR-015 evoluída para v1.1.0 (Proposto, reaprovação do dono pendente), plano de 3 tasks aprovado, execução inline."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: pending
    summary: "Revisão por architect e security-auditor. A peça é de garantia (aumenta o baseline): a revisão de segurança tenta derrubar, com prova de conceito sobre o código existente, o que a tabela da seção 7 da spec diz que segura cada ameaça."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - lint
      - unit
      - integration
      - e2e
    required_artifacts:
      - handoff-summary
    summary: "Task 1: função pura reinitStandard com 5 testes unit. Task 2: ramo reinit em cmdBaseline com 13 testes pelo CLI real e a asserção do guard de Bash. Task 3: guia, CHANGELOG, pendências e item de enforcement da ADR-015."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    required_sensors:
      - lint
      - unit
      - integration
      - e2e
    required_artifacts:
      - validation-summary
    summary: "Sinais unit, integration, e2e, lint e standards observados no ledger pelo verify-run, com o verify-gate em exit 0. Auditoria da ADR tocada. Revisão de segurança da implementação com prova de conceito."
lastUpdated: "2026-10-08T00:00:00.000Z"
---

# `baseline reinit` — Plano (dotcontext tracking)

> Este arquivo é o **tracking** dotcontext. O plano executável canônico (3 tasks, teste antes do código) está em [`docs/superpowers/plans/2026-10-08-baseline-reinit-standard.md`](../../docs/superpowers/plans/2026-10-08-baseline-reinit-standard.md). O desenho aprovado está em [`docs/superpowers/specs/2026-10-08-baseline-reinit-standard-design.md`](../../docs/superpowers/specs/2026-10-08-baseline-reinit-standard-design.md).

## Objetivo

Dar ao operador um caminho para refazer o baseline de **um** standard quando o linter dele muda de regra ou de mensagem, sem tocar nas entradas dos outros.

## Decisões do operador

1. A transição ganha comando próprio, em vez de só uma receita documentada.
2. O comando se chama `reinit` e vale para qualquer standard.
3. Dois subprojetos e dois PRs; o comando vem antes da migração dos 21 linters.
4. A ADR-015 registra o segundo caminho do operador (v1.1.0).
5. Execução inline, pelo próprio agente da sessão.

## Tasks

| # | Entrega | Testes |
|---|---|---|
| 1 | `reinitStandard` em `scripts/lib/standards-baseline.mjs` | 5 unit (um de propriedade) |
| 2 | Ramo `reinit` em `cmdBaseline`, uso e ajuda | 13 pelo CLI real + 1 do guard de Bash |
| 3 | Guia, CHANGELOG, pendências, ADR-015 | sinais existentes |

## Evidências

- Spec: commit `a045ac9`
- ADR-015 v1.1.0: commit `8c9b15a`
- Plano: commit `eb72e18`
- Branch: `feature/baseline-reinit-standard`
