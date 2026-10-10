---
type: plan
name: "Fase sincronizada no roteamento (H1) e gate de evidência por fase (D5)"
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-10-10-routing-phase-sync-and-evidence-gate.md. Spec em docs/superpowers/specs/2026-10-10-routing-phase-sync-and-evidence-gate-design.md.
planSlug: routing-phase-sync-and-evidence-gate
scope: LARGE
autonomy: supervised
status: filled
progress: 0
generated: "2026-10-10"
scaffoldVersion: "2.0.0"
summary: "H1: o mod de roteamento relê o prevc.json no turn.step e no agent.spawn quando (mtimeMs, size) muda (ADR-017 v1.1.0). D5: hook PreToolUse pre-tool-use-phase-gate nega o workflow-advance (MCP, force incluso, e a CLI do dotcontext) sem a evidência mínima da fase atual, em qualquer autonomia, configurável em prevc.evidenceGate block|warn|off (ADR-018). 9 tasks TDD."
requiredSignals: [unit, integration, e2e, lint, standards]
sources:
  spec: docs/superpowers/specs/2026-10-10-routing-phase-sync-and-evidence-gate-design.md
  plan: docs/superpowers/plans/2026-10-10-routing-phase-sync-and-evidence-gate.md
  adrs:
    - .context/engineering/adrs/017-model-routing-v1.0.0.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Brainstorming supervisionado com o operador: caminho arquitetural; gate mecânico (hook) em qualquer autonomia; matriz de evidência aprovada; evidenceGate block por padrão; ADR-018 nova e ADR-017 v1.1.0. dotcontext não tem 'skip' de fase: parar antes da C fica para o INV-PREVC do laboratório. Emenda: C prova entrega por commit novo numa branch protegida (cobre squash e merge sem remoto) ou branch publicada."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: pending
    summary: "Architect + security-auditor. Pendências: onde o plan link grava o vínculo; se o dotcontext preserva review: no frontmatter; formato do tool_input do workflow-advance."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - lint
    steps:
      - order: 1
        description: "Task 1 — core: onPhaseChange (H1)"
        assignee: "backend-specialist"
      - order: 2
        description: "Task 2 — adaptador: releitura da fase no turn.step e no agent.spawn (H1)"
        assignee: "backend-specialist"
      - order: 3
        description: "Task 3 — config: readEvidenceGate"
        assignee: "backend-specialist"
      - order: 4
        description: "Task 4 — lib pura: matriz de evidência"
        assignee: "backend-specialist"
      - order: 5
        description: "Task 5 — CLI coletor scripts/phase-gate.mjs"
        assignee: "backend-specialist"
      - order: 6
        description: "Task 6 — hook pre-tool-use-phase-gate + hooks.json"
        assignee: "backend-specialist"
      - order: 7
        description: "Task 7 — skills: contrato do review: e documentação do gate"
        assignee: "documentation-writer"
      - order: 8
        description: "Task 8 — ADR-018 nova e ADR-017 v1.1.0"
        assignee: "architect"
      - order: 9
        description: "Task 9 — CHANGELOG, achados da campanha e backlog"
        assignee: "documentation-writer"
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
  - id: "phase-4"
    name: "Confirmation"
    prevc: "C"
    status: pending
lastUpdated: "2026-10-10T19:00:00.000Z"
---

# Fase sincronizada no roteamento (H1) e gate de evidência por fase (D5)

Tracking do workflow `routing-phase-sync-and-autonomous-gates`. O conteúdo canônico está na
[spec](../../docs/superpowers/specs/2026-10-10-routing-phase-sync-and-evidence-gate-design.md) e no
[plano](../../docs/superpowers/plans/2026-10-10-routing-phase-sync-and-evidence-gate.md).

Origem: campanha do laboratório de roteamento (2026-10-09, v3.7.0). H1 confirmada no braço B
(`INV-PHASE-SYNC` 12/12 MISS, `INV-SESS` 45/102 MISS); D5 observada no braço C (PREVC nominal, sem commits
nem subagentes, com `autonomous: true` desligando os gates do dotcontext).

## Riscos

| Risco | Mitigação |
|---|---|
| Gate nega por falha de ambiente (git ausente) e trava o projeto | erro interno do coletor → aviso, nunca deny |
| `stories.yaml` de workflow anterior bloqueia a saída de E | só conta stories com `created` ≥ início do workflow |
| Squash merge ou projeto sem remoto impedem concluir a C | entrega = commit novo numa branch protegida (local ou remota) ou branch publicada |
| dotcontext reescreve o frontmatter do plano e perde `review:` | sonda na fase R antes da E |
| Releitura da fase por passo pesa no turno | só `stat`; leitura só quando `(mtimeMs, size)` muda |

## Execution History

> Last updated: 2026-10-10 | Progress: 0%
