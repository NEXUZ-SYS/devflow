---
type: plan
name: "Monitor do roteamento de modelos — faixa ao vivo por agente"
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-10-09-router-monitor-toolbar.md. Spec em docs/superpowers/specs/2026-10-09-router-monitor-toolbar-design.md.
planSlug: router-monitor-toolbar
scope: MEDIUM
autonomy: supervised
status: filled
progress: 0
generated: "2026-10-09"
scaffoldVersion: "2.0.0"
summary: "Faixa AbovePrompt com uma linha por agente em execução (sessão e subagentes): Modelo·esforço aplicados e origem (roteado|teto|router off) | Tempo | Falhas (streak de ferramenta) | Retentativas (redespachos tipo + id da task). Lib pura scripts/lib/monitor-core.mjs + módulo hooks/router-monitor.mjs; hooks/router.mjs só publica a decisão aplicada em $.state devflow.routing; contrato types/index.d.ts."
requiredSignals: [unit, integration, e2e, lint]
sources:
  spec: docs/superpowers/specs/2026-10-09-router-monitor-toolbar-design.md
  plan: docs/superpowers/plans/2026-10-09-router-monitor-toolbar.md
  adrs:
    - .context/engineering/adrs/017-model-routing-v1.0.0.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Brainstorming supervisionado (arquitetural), 4 seções aprovadas. Decisões M1–M7: linha Modelo·esforço (origem) | Tempo | Falhas | Retentativas; Falhas = streak do router; Retentativas = tipo + id da task (Task N na description do SDD, Current story: S<n> no prompt do autonomous-loop); faixa sempre visível com origem; abordagem A (lib pura + módulo próprio; router publica em $.state); módulo .mjs com h() global; monitor só observa. ADR-017 alinhada (sem oferta). Plano de 6 tasks com TDD."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: pending
    summary: "Revisão do plano + sondas das premissas da §8 da spec (.mjs com h global desenha AbovePrompt; $.state compartilhado entre módulos; timer usa $ capturado e cancel(); tool.call com agentId/isError; \"types\" no plugin.json × version-guard)."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - lint
    summary: "6 tasks em TDD na branch feature/router-monitor-toolbar."
    steps:
      - order: 1
        description: "Task 1 — monitor-core: estado das linhas, id da task e retentativas"
        assignee: "feature-developer"
      - order: 2
        description: "Task 2 — monitor-core: formatação da faixa"
        assignee: "feature-developer"
      - order: 3
        description: "Task 3 — router publica a decisão aplicada em devflow.routing (+ types, plugin.json)"
        assignee: "backend-specialist"
      - order: 4
        description: "Task 4 — módulo do monitor: eventos e cronômetro"
        assignee: "feature-developer"
      - order: 5
        description: "Task 5 — faixa AbovePrompt, registro no hooks.json e smoke do kit"
        assignee: "feature-developer"
      - order: 6
        description: "Task 6 — e2e do contrato, docs e CHANGELOG"
        assignee: "test-writer"
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    required_sensors:
      - tests
      - lint
    summary: "Sinais unit, integration, e2e, lint observados no ledger do verify:; verificação ao vivo manual (sessão interativa com --plugin-dir, rodada SDD curta, captura da faixa)."
  - id: "phase-4"
    name: "Confirmation"
    prevc: "C"
    status: pending
    summary: "PR para a main, docs e CHANGELOG [Unreleased]; release via pipeline só sinalizado."
---

# Monitor do roteamento de modelos — tracking

Plano executável: `docs/superpowers/plans/2026-10-09-router-monitor-toolbar.md`.
Spec: `docs/superpowers/specs/2026-10-09-router-monitor-toolbar-design.md`.
