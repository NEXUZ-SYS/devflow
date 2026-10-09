---
type: plan
name: "Roteamento de modelos do DevFlow"
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-10-08-model-routing.md. Spec em docs/superpowers/specs/2026-10-08-model-routing-design.md.
planSlug: model-routing
scope: LARGE
autonomy: supervised
status: filled
progress: 0
generated: "2026-10-08"
scaffoldVersion: "2.0.0"
summary: "Escolhe modelo e esforço da sessão principal (por fase do PREVC e skill) e dos subagentes (por agente, fase e tier da task do plano), sempre abaixo do modelo e do esforço do usuário, com escalada por rubrica e medição por ledger. Lib única com tier abstrato e três adaptadores: mod (function hooks), fallback clássico PreToolUse e omp. Opt-in por models.enabled. Jev avaliado e descartado na v1."
requiredSignals: [unit, integration, e2e, lint]
sources:
  spec: docs/superpowers/specs/2026-10-08-model-routing-design.md
  plan: docs/superpowers/plans/2026-10-08-model-routing.md
  adrs:
    - .context/engineering/adrs/011-devflow-config-single-parser-v1.0.0.md
    - .context/engineering/adrs/014-session-resume-fresh-context-v1.0.0.md
    - .context/engineering/adrs/005-observability-otel-genai-v1.1.0.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Brainstorming com o operador a partir de dois docs sobre Jev/jev-router. Linha de base medida nos transcripts (general-purpose do SDD responde por ~3/4 da saída dos subagentes; todos herdam Opus/xhigh). Fatos do Claude Code aterrados no binário 2.1.294 e nos tipos de function hooks; doc da TypeSafe indexada no docs-mcp. Decisões D1–D17: sessão por fase (sticky) + subagentes, teto na escolha do usuário, opt-in, três adaptadores, Jev removido em favor da rubrica do controlador e de $.model.complete. Spec e plano de 13 tasks aprovados; plano verificado por dry-run (libs puras 43/43, parser 85/85, CLI 9/9, hook clássico 6/6). Execução: subagent-driven."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: in_progress
    summary: "Architect e security-auditor APROVADO-COM-RESSALVAS (15 + 10 achados; segurança com PoCs: link para /dev/zero levou o processo a 3,9 GB, FIFO trava o hook, decisor em loop, valor livre no ledger, protótipo poluído; 3.840 combinações de rubrica sem furar o teto). Sondas R-1..R-10 no Claude Code 2.1.294 (claude -p + plugin de sonda): hooks+modules juntos; mod exige CLAUDE_CODE_ENABLE_FUNCTION_HOOKS; turn.step exige ID completo; e.model/parentModel = modelo do usuário; skill.prompt qualificado; updatedInput sem permissionDecision; $.fs.stat com realPath; trocar só o esforço não invalida cache. Decisões do operador: corrigir dentro da R; D18 opt-in duplo (repo + DEVFLOW_MODEL_ROUTING=1); D19 escalada no meio desligada por padrão, perguntada no init/config; D20 omp via --runtime omp com teto. D21 derivada da sonda (alias no Agent, ID no turn.step). Spec e plano revisados; dry-run do plano revisado 163/163 + validate do mod + claude plugin test 5/5. Achados do próprio dry-run: kit só lê *.test.ts; stubs de op event respondem { value }/{ deny }. Pendente: aprovação R→E pelo operador."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - lint
      - unit
      - integration
      - e2e
    required_artifacts:
      - handoff-summary
    summary: "Tasks 1–5 e 7: libs puras (tiers, parser models:, resolvedores, escalada, ledger/relatório, router-core). Task 6: CLI model-route. Task 8: adaptador mod. Task 9: fallback clássico. Task 10: adaptador omp. Task 11: skills (tier no plano, escalada entre tentativas). Task 12: doctor, guia pós-update, passo no devflow:config. Task 13: ADR e docs. Revisão leve por task; pesada (security-auditor) nas Tasks 8 e 9."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    required_sensors:
      - lint
      - unit
      - integration
      - e2e
    required_artifacts:
      - validation-summary
    summary: "Sinais unit, integration, e2e e lint observados no ledger pelo verify-run (ADR-013). Verificação real: sessão com o mod ativo atravessando P→E (uma troca de modelo da sessão, subagente no modelo roteado, teto respeitado) e sessão sem o mod (fallback clássico pelo meta.json), com model-route report sobre as duas."
lastUpdated: "2026-10-09T01:19:24.294Z"
---

# Roteamento de modelos do DevFlow — Plano (dotcontext tracking)

> Este arquivo é o **tracking** dotcontext. O plano executável canônico (13 tasks, teste antes do código, gate de 8 sondas na fase R) está em [`docs/superpowers/plans/2026-10-08-model-routing.md`](../../docs/superpowers/plans/2026-10-08-model-routing.md). O desenho aprovado está em [`docs/superpowers/specs/2026-10-08-model-routing-design.md`](../../docs/superpowers/specs/2026-10-08-model-routing-design.md).

## Objetivo

Reduzir o consumo da cota da assinatura escolhendo modelo e esforço conforme o que o DevFlow sabe do trabalho em curso, sem nunca passar do modelo e do esforço que o usuário escolheu.

## Decisões principais

1. **D1/D11** — sessão principal por fase do PREVC, trocando só na fronteira (uma troca por workflow no default); subagentes por agente, fase e tier da task.
2. **D4** — uma lib com tier abstrato (`cheap/standard/capable/top`), três adaptadores: mod, fallback clássico, omp.
3. **D5** — teto = modelo e esforço do usuário; teto ilegível → não roteia.
4. **D6** — opt-in por `models.enabled`; `agents/*.md` não ganham `model:`.
5. **D7/D14** — escalada por rubrica: entre tentativas, o controlador responde e o CLI combina; no meio (só mod), `$.model.complete` em Haiku; no máximo uma troca por subagente, nunca para baixo.
6. **D16** — sem Jev na v1; interface de decisor pronta para um decisor externo.

## Evidências

- Spec e plano: commit `355ea53` na branch `feature/model-routing`.
- Dry-run do plano no scratchpad da sessão: libs puras 43/43, parser + regressão 85/85, CLI 9/9, hook clássico 6/6.

## Execution History

> Last updated: 2026-10-09T01:19:24.294Z | Progress: 0%
