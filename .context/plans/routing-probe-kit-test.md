---
type: plan
name: "Teste de kit da sonda antecipada do ID do tier"
description: Plano curto (escala SMALL, caminho bounded; desenho aprovado no chat em 2026-10-15).
planSlug: routing-probe-kit-test
scope: SMALL
autonomy: supervised
status: filled
progress: 0
generated: "2026-10-15"
scaffoldVersion: "2.0.0"
summary: "Cobre no kit (claude plugin test, engine real e relógio em memória) a sonda antecipada e a espera de até 3 s do mod de roteamento, incluindo o prazo real de 3000 ms que a integração escala para 30 ms."
requiredSignals: [unit, integration, e2e, lint, standards]
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Desenho bounded aprovado pelo operador no chat (3 testes de kit, sem mudar o mod)."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - lint
    steps:
      - order: 1
        description: "Task 1 — kit: sonda antecipada, sonda no prazo e sonda acima do prazo"
        assignee: "backend-specialist"
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
lastUpdated: "2026-10-15T18:14:17.025Z"
---

# Teste de kit da sonda antecipada do ID do tier

> **DevFlow workflow:** routing-probe-kit-test | **Scale:** SMALL | **Phase:** P→E

**Goal:** provar no engine real que o 1º passo que pede um tier abaixo do teto espera a sonda por até 3 s e troca, e que acima do prazo segue só com esforço.
**Architecture:** só testes em `hooks/router.test.ts`. O `stubEnv` ganha troca de fase, `ids.standard` na tabela embutida e um `model.complete` controlável; o teste dispara `$.turn.step` e lê no fundo o modelo enviado; `mock.clock(on).advance` move o prazo real.
**Tech Stack:** `claude-code/testing` (`claude plugin test .`), roda em `tests/run-integration.sh`.
**Agents:** backend-specialist.

Origem: backlog da campanha D (v3.9.1, PR #123). Os testes de integração usam engine falso e escalam a espera de 3000 ms para 30 ms; o prazo real não tinha teste.

## Task 1 — kit: sonda antecipada e espera limitada

**Agent:** backend-specialist · **Tier:** standard · **Tests:** integration (kit, engine real) · **Standards:** std-commit-hygiene, std-pre-commit-hygiene

- Teste: `hooks/router.test.ts`.
- [ ] Escrever os 3 testes: (1) fase P → o 1º passo chama `model.complete` com o ID do standard e segue no teto; trocada para E, o 1º passo em E sai no ID sondado; (2) fase E, sonda responde em 1000 ms → o mesmo passo sai no ID sondado; (3) fase E, sonda acima de 3000 ms → o passo segue no teto, e depois da resposta o passo seguinte troca.
- [ ] Ver falhar com o mod quebrado de propósito (`PROBE_WAIT_MS = 0` e sonda antecipada desligada), sem commitar a quebra; reverter e ver passar.
- [ ] Rodar `claude plugin test .` e `bash tests/run-integration.sh`; commit.

## Fora do escopo

Mudar o mod. Se um teste revelar bug, parar e levar o achado ao operador.

## Execution History

> Last updated: 2026-10-15T18:14:17.025Z | Progress: 0%
