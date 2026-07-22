---
type: plan
name: Signpost de release pendente na Confirmation
description: Tracking dotcontext. Plano autoritativo em docs/superpowers/plans/2026-07-08-fix-confirmation-autofinish-honor.md (Camada B). Sob versioning:pipeline, o Step 8 da prevc-confirmation sinaliza o release pendente em vez de deixá-lo órfão e silencioso.
planSlug: confirmation-release-signpost
scope: SMALL
autonomy: supervised
status: filled
progress: 0
generated: "2026-07-20"
scaffoldVersion: "2.0.0"
summary: "Camada B do fix-confirmation-autofinish-honor (Camada A já na main, 9b8a6af). Sob versioning:pipeline + [Unreleased] não-vazio, o Step 8 emite um bloco RELEASE PENDENTE: comando gh workflow run release.yml -f bump=<derivado dos conventional commits>, fluxo release PR→tag-release, fricção action_required. + anti-pattern. + helper puro suggest-bump.mjs (test-first). Sinalizar, nunca auto-disparar (release é outward-facing; bump é julgamento)."
sources:
  plan: docs/superpowers/plans/2026-07-08-fix-confirmation-autofinish-honor.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Análise das 2 camadas concluída; design decidido pelo operador (sinalizar, não auto-disparar; estender o WIP). Camada A já entregue na main. Plano test-first escrito para a Camada B."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - tests-passing
    required_artifacts:
      - handoff-summary
    summary: "TDD: suggest-bump.mjs (unit) + Step 8 da SKILL.md (signpost condicional) + anti-pattern + teste .sh do signpost. Nota: sensor tests-passing incompatível (repo usa node --test); evidência real = suggest-bump unit + skill grep."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    summary: "Testes verdes (suggest-bump unit + skill grep); signpost condicional a pipeline+[Unreleased] não-vazio; sem regressão no test-confirmation-autofinish.sh (Camada A)."
lastUpdated: "2026-07-20T19:59:57.206Z"
---

# Signpost de release pendente na Confirmation — tracking

> Plano autoritativo (test-first, com o contrato do signpost): [`docs/superpowers/plans/2026-07-08-fix-confirmation-autofinish-honor.md`](../../docs/superpowers/plans/2026-07-08-fix-confirmation-autofinish-honor.md) — Task 2 (Camada B).

## Problema
Sob `versioning: pipeline`, a `prevc-confirmation` mergeia a feature, declara "Workflow Complete" e deixa o **release órfão e silencioso** — o `release.yml` é `workflow_dispatch` (manual) e a skill não o dispara nem o menciona. `autoFinish: true` fica estruturalmente inalcançável para o release.

## Solução (decidida)
**Sinalizar, não auto-disparar.** O Step 8 passa a emitir, sob `versioning: pipeline` + `[Unreleased]` não-vazio, um bloco RELEASE PENDENTE com o comando exato + o bump sugerido (derivado dos conventional commits) + o fluxo em 2 passos + a fricção `action_required`. Release permanece decisão humana.

## Fora de escopo
Auto-disparo (`git.autoRelease` opt-in); GitLab/`glab`; roteamento prevc-flow→prevc-confirmation (Camada 0). Ver o plano autoritativo.

## Execution History

> Last updated: 2026-07-20T19:59:57.206Z | Progress: 0%
