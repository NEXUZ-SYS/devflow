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
summary: "O restart de sessão apaga o contexto do PREVC. Lib pura workflow-resume.mjs + session-start injeta estado/última fase/alerta de pendurado + PONTEIRO para handoff fresco (nunca a prosa — o conteúdo é entregável por clone). Inclui fix do escape_for_json (C0 apagava todo o DEVFLOW_CONTEXT). ADR-014."
sources:
  spec: docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md
  plan: docs/superpowers/plans/2026-07-16-workflow-resume-session.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Brainstorming socrático. Spec v1 (43ce798) BLOQUEADA na fase R: 3 erros de fato + modelo de ameaça invertido. Spec v2 corrige (D1-D9), reduz escopo (corta o pre-compact) e adota o ponteiro. ADR-014 decidida (create). Plano test-first reescrito."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: in_progress
    summary: "1ª rodada: architect REVISE (2 BLOCKs) + security BLOCK (3 achados com PoC). Correções aplicadas na spec v2 + plano v2. Aguardando re-review."
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
    summary: "3 sinais verdes via verify-run (unit/e2e/lint); gate de V lê o ledger; auditoria de segurança independente (re-testar os PoCs do drive-by/symlink/breakout); ADR-014 audit; compliance da spec."
lastUpdated: "2026-07-16T23:00:51.870Z"
---

# Retomada de workflow no SessionStart — Plano (dotcontext tracking)

> Este arquivo é o **tracking** dotcontext. O plano executável canônico (6 task groups TDD-first, com código real) vive em [`docs/superpowers/plans/2026-07-16-workflow-resume-session.md`](../../docs/superpowers/plans/2026-07-16-workflow-resume-session.md). O design está em [`docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md`](../../docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md) (**v2** — a v1 foi bloqueada na fase R).

## Objetivo

O restart de sessão **apaga o contexto do PREVC** — o agente acorda cego. O `session-start` passa a injetar o estado do workflow (incluindo **supervised**, hoje invisível), alertar workflow pendurado e **sinalizar** um handoff fresco.

## Escopo (v2 — reduzido pela fase R)

Lib pura `workflow-resume.mjs` (`readWorkflowState`, `detectDangling`, `handoffStatus`, `renderResume`) + `session-start` **lê** (~150 tokens, 1×/sessão) + **fix do `escape_for_json`** + ADR-014 + CHANGELOG.

**Fora:** o `pre-compact` (cortado — o canal não entrega); a escrita do handoff (follow-up).

## Achados que moldaram o design

1. **O `post-tool-use` é o único hook com `async: true`** (stdout descartado). O `handoff.md` morreu por estar pendurado justamente nele.
2. **`async: false` ≠ aceita `additionalContext`.** O `PreCompact` é `false` e **não** aceita (só `decision: block` + stderr). Confundir os dois matou o D5 da v1 — a feature teria recriado o bug que existe para consertar.
3. **Handoff velho é pior que nenhum** — contexto errado com aparência de autoridade; o agente age sobre ele.
4. **E handoff hostil é pior ainda.** O `.gitignore` **não** é fronteira de confiança: o atacante controla o repo dele e commita `prevc.json` + `handoff.md`. No clone, o `mtime` (checkout) sempre vence o `started` → o guard de frescor **carimbaria o payload como curado**. Sob adversário o guard não é defesa: é o habilitador, porque arbitra comparando dois valores que o atacante controla. Daí o **ponteiro** (D4).
5. **Silêncio apodrece:** o handoff não morreu por decisão — morreu porque ninguém viu. Stale é **denunciado**, não silenciado (mesma lição da ADR-013).
6. **O `session-start` pula supervised explicitamente** (`if [ "$autonomy_mode" != "supervised" ]`) — o modo padrão é invisível.
7. **`detectDangling` não é `phase === "C"`**: scale 1/2 nascem com `C: skipped` e param em **V**. Verificado nos arquivos reais — `config-release-scaffold` está em `phase=V`, não em C. A regra é **nenhuma fase em curso**.
8. **Bug pré-existente na main:** o `escape_for_json` trata só `\ " \n \r \t`. Um byte C0 invalida o JSON e o Claude Code **descarta todo o `<DEVFLOW_CONTEXT>`** — inclusive o `<GROUNDING_MODE>`. Kill-switch de 1 byte, fail-**open**.

## Mapa de fases PREVC

### Phase P — Planning (em curso)
- Brainstorming socrático completo; spec v1 aprovada pelo operador (`43ce798`) e depois **bloqueada** na fase R.
- Spec **v2**: corrige 3 erros de fato, inverte o modelo de ameaça, reduz escopo (D1–D9).
- ADR-014 decidida via `adr-decision.mjs` (4/4 → create), a criar em TG1 com os guardrails **corrigidos**.

### Phase R — Review (2ª rodada)
1ª rodada: architect **REVISE** (2 BLOCKs) + security **BLOCK** (3 achados com PoC executado). Correções aplicadas. Re-review pendente.

### Phase E — Execution (pendente)
TG1 ADR-014 · TG2 lib base · TG3 lib render/ponteiro · TG4 fix do escape C0 · TG5 session-start · TG6 CHANGELOG+suíte.

### Phase V — Validation (pendente)
3 sinais verdes; gate de V lê o ledger; auditoria independente **re-testando os PoCs**; ADR-014 audit.

## Fora de escopo
Consertar o `async:true` do `post-tool-use` (follow-up: 5 controles legados mortos). Ressuscitar a **escrita** do handoff (sem canal provado — sem prova seria repetir o erro que esta feature existe para consertar).

## Evidências
- Spec v2: `docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md`
- Plano canônico v2: `docs/superpowers/plans/2026-07-16-workflow-resume-session.md`
- Branch: `feature/workflow-resume-session`

## Execution History

> Last updated: 2026-07-16T23:00:51.870Z | Progress: 0%
