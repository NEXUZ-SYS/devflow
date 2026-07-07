---
type: plan
name: Integração impeccable → DevFlow (design de front-end para agentes)
description: Estratégia Híbrida (ADR-010) para absorver o impeccable (Apache-2.0) no DevFlow — regras→Standards nativos, guidance→skill que consome knowledge, live→bridge.
planSlug: integrate-impeccable-design-guide
scope: LARGE
autonomy: supervised
status: ready
generated: 2026-07-02
summary: "Absorver o impeccable via estratégia Híbrida (ADR-010). Autoritativo em docs/superpowers/. 7 task groups A–G, TDD test-first."
sources:
  spec: docs/superpowers/specs/2026-07-02-integrate-impeccable-design-guide-design.md
  plan: docs/superpowers/plans/2026-07-02-integrate-impeccable-design-guide.md
  adr: .context/engineering/adrs/010-external-design-toolkit-absorption-v1.0.0.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Brainstorming, spec (D1–D5), ADR-010, plano test-first."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors: [tests]
    required_artifacts: [handoff-summary]
    summary: "Task Groups A–G em TDD (ver plano autoritativo)."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    required_sensors: [tests]
    summary: "Testes (fixtures 45 regras), audit de std, security, spec compliance."
---

# Integração impeccable → DevFlow — Plano (tracking)

> **Plano autoritativo (execução):** `docs/superpowers/plans/2026-07-02-integrate-impeccable-design-guide.md`
> **Spec:** `docs/superpowers/specs/2026-07-02-integrate-impeccable-design-guide-design.md`
> **ADR:** `010-external-design-toolkit-absorption`

Este arquivo é o **bridge de tracking** do workflow PREVC. As tarefas bite-sized com código e TDD vivem no plano autoritativo acima.

## Decisões (D1–D5)
- **D1** Híbrido: absorve determinístico (Standards) + reaproveita guidance (skill) + live via bridge.
- **D2** Standards default-bundled, gated por globs de front-end.
- **D3** v1 = tudo (live via bridge; extensão referenciada).
- **D4** Ativação por auto-detecção de front-end (default-on; escritas anunciadas).
- **D5** `live` = `npx impeccable@<pinned>` efêmero, consent-gated (sem install global/oficial).

## Task Groups (fase E)
| Grupo | Entrega | Agente-guia |
|---|---|---|
| **A** | Standards — 45 regras portadas (4 a11y→std-accessibility, 14 quality→std-visual-quality, 27 slop→std-design-antipatterns) + concerns + MANIFEST + sync standalone | test-writer → backend-specialist |
| **B** | Skill `frontend-design` (23 modos + grounding no knowledge) + `/devflow:design` | documentation-writer → frontend-specialist |
| **C** | Wiring `product-context` (delegação) | documentation-writer |
| **D** | Init (`detect-frontend` + modo `init` + Step no `project-init`) | feature-developer |
| **E** | Brownfield (`post-update-guide` + `reconcile --from-impeccable`) | feature-developer |
| **F** | Live bridge (marcador no `pre-tool-use` + `live-bridge.mjs` + guarded update) | backend-specialist |
| **G** | Doc da extensão + `NOTICE` de atribuição | documentation-writer |

## Guardrails (do ADR-010)
- Regra determinística = linter de Standard (não motor/hook próprio).
- `.js` bundled-only; `.md` sincroniza com o standalone.
- Skill CONSOME o knowledge; nunca duplica.
- NUNCA auto-instalar dep externa; consent-gated; no-op se ausente.
- Não editar version files (bump só pela pipeline).
