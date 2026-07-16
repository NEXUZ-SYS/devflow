---
type: plan
name: Retomada de workflow no SessionStart
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-07-16-workflow-resume-session.md. Spec em docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md.
planSlug: workflow-resume-session
scope: MEDIUM
autonomy: supervised
status: filled
progress: 0
generated: "2026-07-16"
scaffoldVersion: "2.0.0"
summary: "O restart de sessão apaga o contexto do PREVC. Lib pura workflow-resume.mjs + session-start injeta estado/última fase/alerta de pendurado + pre-compact pede a curadoria do handoff. Guard de frescor: handoff stale é denunciado, nunca injetado. ADR-014."
sources:
  spec: docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md
  plan: docs/superpowers/plans/2026-07-16-workflow-resume-session.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Brainstorming socrático (diagnóstico c+a do handoff morto; achado 'handoff velho é pior que nenhum'). Spec aprovada (D1-D7, 43ce798). ADR-014 decidida (create). Plano test-first escrito."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: pending
    summary: "Revisão do plano por architect + security. Foco: os hooks rodam em TODA sessão de TODO projeto — risco de crash/ruído; sanitização dos outputs (prompt injection); guard de frescor."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - tests-passing
    required_artifacts:
      - handoff-summary
    summary: "TG1-TG6 em TDD (ver plano autoritativo). Nota: o sensor tests-passing é incompatível com este repo (roda npm test esperando jest); a evidência real é o contrato verify: da ADR-013 (verify-run + gate)."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    required_sensors:
      - tests-passing
    required_artifacts:
      - handoff-summary
    summary: "4 sinais verdes via verify-run; gate de V lê o ledger; auditoria de segurança (hooks + sanitização); ADR-014 audit; compliance da spec."
---

# Retomada de workflow no SessionStart — Plano (dotcontext tracking)

> Este arquivo é o **tracking** dotcontext. O plano executável canônico (6 task groups TDD-first, com código real) vive em [`docs/superpowers/plans/2026-07-16-workflow-resume-session.md`](../../docs/superpowers/plans/2026-07-16-workflow-resume-session.md). O design aprovado está em [`docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md`](../../docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md).

## Objetivo

O restart de sessão **apaga o contexto do PREVC** — o agente acorda cego. O `session-start` passa a injetar o estado do workflow (incluindo **supervised**, hoje invisível), alertar workflow pendurado, e o `handoff.md` volta a viver num canal que entrega.

## Escopo

Lib pura `workflow-resume.mjs` (lê `prevc.json`, `detectDangling`, `isHandoffFresh`, `renderResume`) + `session-start` **lê** (~150 tokens, 1×/sessão) + `pre-compact` **pede** a curadoria + ADR-014 + CHANGELOG.

## Achados que moldaram o design

1. **O `post-tool-use` é o ÚNICO hook com `async: true`** (stdout descartado). O `handoff.md` morreu por estar pendurado justamente nele. Todos os outros (`SessionStart`/`PreCompact`/`PostCompact`/`PreToolUse`) entregam.
2. **Handoff velho é pior que nenhum** — contexto errado com aparência de autoridade; o agente age sobre ele. Daí o guard de frescor (`mtime > started`).
3. **Diagnóstico do handoff morto:** causa raiz = cadência (artefato de curadoria com cadência de log, pedido a cada TaskUpdate); causa proximal = canal quebrado.
4. **Silêncio apodrece:** o handoff não morreu por decisão — morreu porque ninguém viu. Stale é **denunciado**, não silenciado (mesma lição da ADR-013).
5. **O `session-start` pula supervised explicitamente** (`if [ "$autonomy_mode" != "supervised" ]`) — o modo padrão é invisível.

## Mapa de fases PREVC

### Phase P — Planning (em curso)
- Brainstorming socrático completo (9 passos); spec aprovada pelo operador (`43ce798`).
- ADR-014 decidida via `adr-decision.mjs` (4/4 → create), a criar em TG1.
- Plano test-first: `docs/superpowers/plans/2026-07-16-workflow-resume-session.md`.

### Phase R — Review (pendente)
Architect + security-auditor. Risco central: os hooks rodam em **toda sessão de todo projeto** — crash, ruído e prompt injection via `outputs`.

### Phase E — Execution (pendente)
TG1 ADR-014 · TG2 lib base · TG3 lib render/frescor · TG4 session-start · TG5 pre-compact · TG6 CHANGELOG+suíte.

### Phase V — Validation (pendente)
4 sinais verdes; gate de V lê o ledger; auditoria independente; ADR-014 audit.

## Fora de escopo
Consertar o `async:true` do `post-tool-use` (follow-up: 5 controles legados mortos). Esta feature **contorna** o canal quebrado usando os que funcionam — não finge tê-lo consertado.

## Evidências
- Spec: `docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md`
- Plano canônico: `docs/superpowers/plans/2026-07-16-workflow-resume-session.md`
- Branch: `feature/workflow-resume-session`
