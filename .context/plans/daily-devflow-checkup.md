---
type: plan
name: "Checkup de início de dia do DevFlow"
description: "Tracking dotcontext. Plano e spec canônicos vivem em docs/superpowers/."
planSlug: daily-devflow-checkup
summary: "Verifica, na 1ª sessão do dia em cada máquina, se os plugins declarados pelo projeto estão instalados, no escopo certo e atualizados. Definição versionada; estado de execução por máquina."
agents:
  - type: "devops-specialist"
    role: "Hook session-start, CLI de routines e seed incremental"
  - type: "test-writer"
    role: "Suítes unit e E2E, todas RED antes da implementação"
  - type: "code-reviewer"
    role: "Fase R: revisar as 7 notas de atenção do plano"
docs:
  - "project-overview.md"
  - "development-workflow.md"
  - "testing-strategy.md"
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    summary: "Spec e plano de implementação escritos, revisados e aprovados."
    required_sensors: ["lint"]
    deliverables:
      - "docs/superpowers/specs/2026-09-01-daily-devflow-checkup-design.md"
      - "docs/superpowers/plans/2026-09-01-daily-devflow-checkup.md"
    steps:
      - order: 1
        description: "Brainstorming socrático: 4 decisões fechadas com o usuário (D1-D4)"
        assignee: "architect-specialist"
        deliverables:
          - "spec aprovada em seções"
      - order: 2
        description: "Plano TDD de 9 tasks com código real e testes RED"
        assignee: "architect-specialist"
        deliverables:
          - "plano com 9 tasks, sem placeholder"
  - id: "phase-2"
    name: "Review"
    prevc: "R"
    summary: "Revisar o plano contra as 7 notas de atenção antes de escrever código."
    required_sensors: ["lint"]
    deliverables:
      - "veredito do code-reviewer sobre as 7 notas"
    steps:
      - order: 1
        description: "Avaliar installedFor sob git worktree (risco de FAIL falso-positivo)"
        assignee: "code-reviewer"
        deliverables:
          - "decisão registrada"
      - order: 2
        description: "Avaliar se markRun deve consumir o dia quando o resultado é SKIP"
        assignee: "code-reviewer"
        deliverables:
          - "decisão registrada"
      - order: 3
        description: "Avaliar o HOME real usado por test-doctor.mjs e test-doctor-cli.mjs"
        assignee: "code-reviewer"
        deliverables:
          - "decisão registrada"
  - id: "phase-3"
    name: "Execution"
    prevc: "E"
    summary: "Implementar as 9 tasks em ordem, RED-GREEN-REFACTOR, commit por task."
    required_sensors: ["lint", "unit"]
    deliverables:
      - "scripts/lib/plugin-env.mjs"
      - "scripts/lib/routines-seed.mjs"
      - "4 checks novos em scripts/lib/doctor.mjs"
      - "status SKIP em scripts/doctor.mjs"
      - "estado de routines em .context/runtime/routines-state.json"
      - "bloco DEVFLOW_ENV_CHECKUP em hooks/session-start"
    steps:
      - order: 1
        description: "Tasks 1-4: leitor de ambiente, ctx.home, 4 checks de plugin e status SKIP"
        assignee: "devops-specialist"
        deliverables:
          - "checks visíveis em /devflow:devflow-doctor"
      - order: 2
        description: "Tasks 5-6: separar estado do versionado e passo type:check"
        assignee: "devops-specialist"
        deliverables:
          - "migração idempotente, suíte de routines verde"
      - order: 3
        description: "Tasks 7-9: hook, routine versionada, docs e seed incremental"
        assignee: "devops-specialist"
        deliverables:
          - "bootstrap fala, dia seguinte silencioso"
  - id: "phase-4"
    name: "Validation"
    prevc: "V"
    summary: "Suíte completa verde, sem regressão nas suítes preexistentes."
    required_sensors: ["lint", "unit", "e2e"]
    deliverables:
      - "run-lint, run-unit e run-e2e observados com exit 0"
    steps:
      - order: 1
        description: "Rodar os três runners e registrar no ledger do contrato verify"
        assignee: "test-writer"
        deliverables:
          - "sinais unit, e2e e lint observados"
      - order: 2
        description: "Confirmar que test-session-start-routines.sh e test-doctor.mjs não regrediram"
        assignee: "test-writer"
        deliverables:
          - "suítes preexistentes verdes"
generated: "2026-09-01"
status: filled
scaffoldVersion: "2.0.0"
---

# Checkup de início de dia do DevFlow — tracking

> Este arquivo é o **tracking** do dotcontext. Os artefatos canônicos são:
> - spec: [`docs/superpowers/specs/2026-09-01-daily-devflow-checkup-design.md`](../../docs/superpowers/specs/2026-09-01-daily-devflow-checkup-design.md)
> - plano: [`docs/superpowers/plans/2026-09-01-daily-devflow-checkup.md`](../../docs/superpowers/plans/2026-09-01-daily-devflow-checkup.md)

## Objetivo

Na primeira sessão do dia em cada máquina, verificar automaticamente se o ambiente de plugins
corresponde ao que o projeto declara em `.claude/settings.json` — incluindo se estão atualizados —
reportando apenas quando houver divergência. A definição do checkup viaja no repositório e replica
entre dispositivos; o estado de execução é por máquina.

## Os três defeitos que motivam a entrega

1. O `doctor` tem 9 checks e **nenhum** olha instalação, escopo ou versão de plugin, embora o
   PR #97 tenha movido o devflow para escopo de projeto.
2. A routine `context-maintenance` **nunca executou**: criada em 2026-07-22 (`0d46a69`) com
   `lastRun: null`, segue `null` 41 dias depois. Sugerir não sobrevive à concorrência com a
   tarefa real do usuário.
3. O estado de execução das routines mora no arquivo **versionado**, o que numa cadência diária
   faz uma máquina silenciar a outra e suja o working tree a cada sessão.

## Decisões

| # | Decisão |
|---|---|
| D1 | "Nuvem" = o repositório git: definição versionada, estado de execução local |
| D2 | O hook **executa** os checks; não sugere |
| D3 | Silencioso quando está tudo certo, exceto no bootstrap pós-clone |
| D4 | Gatilho duplo: bootstrap no primeiro contato + re-check diário |
| D5 | "Atualizado" cobre todos os plugins declarados, não só o devflow |
| D6 | O schema de routines ganha passos executáveis por código (`type: check`) |
| D7 | O checkup nunca age: aponta `/devflow update`, não o executa |
| D8 | Os 4 checks vivem no `doctor.mjs`, reaproveitados por `/devflow:devflow-doctor` |
| D9 | `SKIP` vira o 4º status do doctor, sem alterar o exit code |

## Sinais exigidos

`requiredSignals: [unit, e2e, lint]` — `e2e` é obrigatório porque a mudança toca um hook.
