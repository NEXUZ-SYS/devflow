---
type: plan
name: "Status do roteamento mostra as sondas de ID do tier"
description: Plano curto (escala SMALL, caminho bounded do brainstorming; design aprovado no chat em 2026-10-14).
planSlug: routing-status-probes
scope: SMALL
autonomy: supervised
status: filled
progress: 0
generated: "2026-10-14"
scaffoldVersion: "2.0.0"
summary: "/devflow-route status troca 'IDs conhecidos' por um bloco por tier: ID e origem (sonda ok, aprendido de subagente) ou o estado da sonda (em voo com o candidato, desistiu com rejeitados e erros), mais o estado do cache de IDs. Função pura idStatusLines no router-core; nextProbe guarda o candidato em voo."
requiredSignals: [unit, integration, e2e, lint, standards]
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Design bounded aprovado pelo operador no chat."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - lint
    steps:
      - order: 1
        description: "Task 1 — core: idStatusLines e candidato em voo (TDD)"
        assignee: "backend-specialist"
      - order: 2
        description: "Task 2 — mod: status usa idStatusLines (TDD de integração)"
        assignee: "backend-specialist"
      - order: 3
        description: "Task 3 — guia e CHANGELOG"
        assignee: "documentation-writer"
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
lastUpdated: "2026-10-14T13:50:52.829Z"
---

# Status do roteamento mostra as sondas de ID do tier

> **DevFlow workflow:** routing-status-probes | **Scale:** SMALL | **Phase:** P→E

**Goal:** o `/devflow-route status` explica, sem abrir o ledger, por que a sessão trocou ou não de tier.
**Architecture:** formatador puro no `router-core` sobre o estado que já existe (`ids`, `idSource`, `probes`); o mod só passa se o cache de IDs está ligado.
**Tech Stack:** Node ESM, `node --test`.
**Agents:** backend-specialist, documentation-writer.

Origem: backlog das campanhas do laboratório (2026-10-12/13). No braço B de 2026-10-10 a sessão não trocou de tier e só o ledger explicava a causa.

## Saída esperada

```
teto: opus · xhigh
IDs por tier:
  standard: claude-sonnet-5-5 (sonda ok)
  cheap: claude-haiku-5-5 (aprendido de subagente)
  capable: sem ID · sonda em voo (claude-opus-5-5)
  standard: sem ID · desistiu · rejeitados: x, y · erros: 3/3
cache de IDs: ligado
```

Só os tiers com ID ou sonda nesta sessão aparecem. Sem nenhum: `IDs por tier: — (nenhuma sonda nesta sessão)`. Cache: `ligado` ou `desligado (caminho recusado ou roteamento desligado)`. Tier sem ID e sonda nem em voo nem desistida: `sem ID · aguardando sonda` (com `rejeitados`/`erros` quando houver).

## Task 1 — core: `idStatusLines` e candidato em voo

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** unit · **Standards:** std-commit-hygiene, std-pre-commit-hygiene

- Teste: `tests/lib/router-core.test.mjs`.
- [ ] Escrever testes que falham: lista vazia; ID por sonda; ID aprendido; sonda em voo mostra o candidato; desistiu com rejeitados e erros; aguardando com rejeitado; `nextProbe` grava `current` e `onProbeResult` limpa; linha do cache ligado/desligado.
- [ ] Rodar e ver falhar.
- [ ] Implementar `idStatusLines(state, { cacheOn })` (retorna array de strings) e `p.current` em `nextProbe`/`onProbeResult`.
- [ ] Rodar e ver passar; commit.

## Task 2 — mod: status usa `idStatusLines`

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** integration (mod com engine falso) · **Standards:** std-commit-hygiene, std-pre-commit-hygiene

- Teste: `tests/integration/test-router-mod.mjs`.
- [ ] Escrever testes que falham: `status` depois de sonda ok mostra `standard: <id> (sonda ok)`; depois de sonda rejeitada até esgotar mostra `desistiu · rejeitados`; sem sonda mostra `nenhuma sonda`.
- [ ] Rodar e ver falhar.
- [ ] `onCommand`: tirar "IDs conhecidos" da linha do teto e anexar `...idStatusLines(S.core, { cacheOn: !!S.idsCachePath })`.
- [ ] Rodar e ver passar; commit.

## Task 3 — guia e CHANGELOG

**Agent:** documentation-writer · **Tier:** cheap · **Tests:** — (doc) · **Standards:** std-commit-hygiene

- [ ] `docs/model-routing.md`: a linha do `/devflow-route` descreve o bloco das sondas.
- [ ] `CHANGELOG.md`: entrada em `Added` no `[Unreleased]`.
- [ ] Commit.

## Fora do escopo

Ler o ledger no status; subcomando novo; sondar no `turn.start` (outro item do backlog).

## Execution History

> Last updated: 2026-10-14T13:50:52.829Z | Progress: 0%
