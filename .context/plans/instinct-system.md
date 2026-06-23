---
status: filled
generated: 2026-06-17
prevc_scale: MEDIUM
canonical_spec: docs/superpowers/specs/2026-06-17-instinct-system-design.md
canonical_plan: docs/superpowers/plans/2026-06-17-instinct-system.md
related_adr: .context/engineering/adrs/005-observability-otel-genai-v1.1.0.md
phases:
  - id: "phase-P"
    name: "Planning"
    prevc: "P"
    status: completed
  - id: "phase-R"
    name: "Review"
    prevc: "R"
    status: completed
  - id: "phase-E"
    name: "Execution"
    prevc: "E"
    status: completed
  - id: "phase-V"
    name: "Validation"
    prevc: "V"
    status: completed
---

# Instinct System (MVP) — Plano (dotcontext tracking)

> Este arquivo é o **tracking** dotcontext. O plano executável canônico (13 tasks TDD-first, com código real) vive em [`docs/superpowers/plans/2026-06-17-instinct-system.md`](../../docs/superpowers/plans/2026-06-17-instinct-system.md). O design aprovado está em [`docs/superpowers/specs/2026-06-17-instinct-system-design.md`](../../docs/superpowers/specs/2026-06-17-instinct-system-design.md).

## Objetivo

Loop de aprendizado automático: observar tool-use via hooks → destilar instincts atômicos pontuados por confiança (0.3→0.9) num store próprio Node zero-dep (XDG project-scoped) → recall no SessionStart → pontes que **propõem** napkin/MemPalace. **MVP sem** evolução automática instinct→skill (fase 2).

## Decisões fechadas (Planning)

1. Store próprio leve + pontes (não 4º silo; MemPalace é opcional).
2. XDG fora do repo, project-scoped por hash do git remote (privacidade ADR-005).
3. Motor em Node zero-dep `.mjs` (padrão `adr-*` lib).
4. Análise LLM in-session (fronteira de sessão + comando), sem daemon.
5. ADR-005 evoluída → v1.1.0 (disciplina opt-in/local/redação agora consumer-agnostic).

## Mapa de fases PREVC

### Phase P — Planning (✅ completo)
- Spec aprovado pelo usuário (5 seções).
- Review do architect incorporado (C1/C2/I1–I4/N1–N4).
- ADR-005 → v1.1.0 (extends).
- Plano canônico escrito (13 tasks TDD-first, gate test-first 13/13 OK).

### Phase R — Review (próximo)
- Revisar o plano canônico: boundaries das 6 unidades, contratos de função entre tasks, cobertura do spec, riscos de concorrência (withLock) e privacidade.
- Agente sugerido: code-reviewer + security-auditor (foco em redação/credenciais e injection nos hooks).

### Phase E — Execution
- Executar as 13 tasks na ordem (store → captura → recall → mining → pontes → config → e2e), TDD por task, commits frequentes na branch `feature/instinct-system`.

### Phase V — Validation
- Suite completa verde (`node --test scripts/lib/*.test.mjs scripts/instinct-cli.test.mjs tests/instinct/*.mjs`).
- Auditoria de segurança (redação nunca vaza credencial; hooks `exit 0`).
- Compliance com guardrails da ADR-005 v1.1.0.

## Evidências
- Spec: `docs/superpowers/specs/2026-06-17-instinct-system-design.md`
- Plano canônico: `docs/superpowers/plans/2026-06-17-instinct-system.md`
- ADR: `.context/engineering/adrs/005-observability-otel-genai-v1.1.0.md`
- Branch: `feature/instinct-system` (commits fe318b4, d102476, 33ec552 + plano)
- Origem da feature: análise do repo `affaan-m/ECC` (skill `continuous-learning-v2`).
