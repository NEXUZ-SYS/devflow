---
type: plan
name: "Sonda antecipada e espera curta do ID do tier da sessão"
description: Plano curto (escala SMALL, caminho bounded; design aprovado no chat em 2026-10-14).
planSlug: routing-probe-ahead
scope: SMALL
autonomy: supervised
status: filled
progress: 0
generated: "2026-10-14"
scaffoldVersion: "2.0.0"
summary: "Fecha o MISS restante do INV-SESS (campanha D v3.9.0, 2/142): o mod sonda os tiers da tabela de sessão abaixo do teto já no 1º passo, e o passo que precisa de um tier com sonda em voo espera o resultado por até 3 s."
requiredSignals: [unit, integration, e2e, lint, standards]
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Design bounded aprovado pelo operador no chat (partes 1 e 2, espera de 3 s)."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - lint
    steps:
      - order: 1
        description: "Task 1 — core: sessionProbeTiers e neededTier (TDD)"
        assignee: "backend-specialist"
      - order: 2
        description: "Task 2 — mod: sonda antecipada e espera limitada (TDD de integração)"
        assignee: "backend-specialist"
      - order: 3
        description: "Task 3 — guia e CHANGELOG"
        assignee: "documentation-writer"
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
lastUpdated: "2026-10-14T18:47:55.039Z"
---

# Sonda antecipada e espera curta do ID do tier da sessão

> **DevFlow workflow:** routing-probe-turn-start | **Scale:** SMALL | **Phase:** P→E

**Goal:** a 1ª mensagem que precisa de um tier abaixo do teto já sai nele, em vez de sair no teto enquanto a sonda roda.
**Architecture:** o core ganha duas funções puras (tiers a sondar; tier pedido sem ID). O mod sonda esses tiers no 1º passo da sessão e, quando o passo pede um tier com sonda em voo, espera a sonda por até 3 s (relógio do engine) antes de resolver a rota.
**Tech Stack:** Node ESM, `node --test`.
**Agents:** backend-specialist, documentation-writer.

Origem: campanha D de 2026-10-14 (v3.9.0), INV-SESS MISS 2/142. Processo 1: a fase muda de R para E no meio do único turno do `claude -p` e a sonda só começava nesse passo. Processo 2: a retomada já começa em V e a sonda disparava no mesmo passo. Sondar no `turn.start` não resolve: em `-p` há um turno por processo, aberto na fase P (teto).

## Mudança de comportamento declarada

Com a espera, o 1º passo que pede um tier com sonda rápida já sai no ID sondado. Testes de integração que afirmavam "1º passo no teto, troca no seguinte" passam a afirmar a troca no 1º passo quando a sonda responde no prazo; o caso "sonda acima do prazo → 1º passo só esforço" ganha teste próprio.

## Task 1 — core: `sessionProbeTiers` e `neededTier`

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** unit · **Standards:** std-commit-hygiene, std-pre-commit-hygiene

- Teste: `tests/lib/router-core.test.mjs`.
- [ ] Testes que falham: teto capable → `["standard"]` (tabela E/V/C=standard); teto standard → `[]`; `maxTier: cheap` → `["cheap"]`; tier com ID já conhecido sai da lista; sem `userModel` ou roteamento desligado → `[]`. `neededTier`: fase E sem ID → `standard`; com ID → null; fase P (teto) → null.
- [ ] Rodar e ver falhar; implementar; ver passar; commit.

## Task 2 — mod: sonda antecipada e espera limitada

**Agent:** backend-specialist · **Tier:** standard · **Tests:** integration (mod com engine falso) · **Standards:** std-commit-hygiene, std-pre-commit-hygiene

- Teste: `tests/integration/test-router-mod.mjs`.
- [ ] Testes que falham: fase P → a sonda do standard sai no 1º passo; depois de mudar para E, o 1º passo em E troca para o ID sem `idPending`; fase E com sonda rápida → o 1º passo já troca; sonda que não responde em 3 s → o passo segue só com esforço e troca depois; roteamento desligado ou `session off` → nenhuma sonda antecipada nem espera.
- [ ] `startProbe` guarda a promessa da sonda por tier; `routerTurnStep` sonda `sessionProbeTiers` e, se `neededTier` tem sonda em voo, espera `Promise.race` com `$.clock.after(3000)`.
- [ ] Ajustar os testes antigos que dependiam do 1º passo no teto (ver "Mudança de comportamento declarada").
- [ ] Rodar e ver passar; commit.

## Task 3 — guia e CHANGELOG

**Agent:** documentation-writer · **Tier:** cheap · **Tests:** — (doc) · **Standards:** std-commit-hygiene

- [ ] `docs/model-routing.md`: sonda antecipada e espera de até 3 s.
- [ ] `CHANGELOG.md`: entrada em `Fixed` no `[Unreleased]`.
- [ ] Commit.

## Fora do escopo

Usar o cache entre processos sem sonda (contraria a D21); sonda de subagente; prazo configurável.

## Execution History

> Last updated: 2026-10-14T18:47:55.039Z | Progress: 0%
