---
type: plan
name: "Roteamento de modelos do DevFlow"
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-10-08-model-routing.md. Spec em docs/superpowers/specs/2026-10-08-model-routing-design.md.
planSlug: model-routing
scope: LARGE
autonomy: supervised
status: filled
progress: 100
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
    status: completed
    summary: "Architect e security-auditor APROVADO-COM-RESSALVAS (15 + 10 achados; segurança com PoCs: link para /dev/zero levou o processo a 3,9 GB, FIFO trava o hook, decisor em loop, valor livre no ledger, protótipo poluído; 3.840 combinações de rubrica sem furar o teto). Sondas R-1..R-10 no Claude Code 2.1.294 (claude -p + plugin de sonda): hooks+modules juntos; mod exige CLAUDE_CODE_ENABLE_FUNCTION_HOOKS; turn.step exige ID completo; e.model/parentModel = modelo do usuário; skill.prompt qualificado; updatedInput sem permissionDecision; $.fs.stat com realPath; trocar só o esforço não invalida cache. Decisões do operador: corrigir dentro da R; D18 opt-in duplo (repo + DEVFLOW_MODEL_ROUTING=1); D19 escalada no meio desligada por padrão, perguntada no init/config; D20 omp via --runtime omp com teto. D21 derivada da sonda (alias no Agent, ID no turn.step). Spec e plano revisados; dry-run do plano revisado 163/163 + validate do mod + claude plugin test 5/5. Achados do próprio dry-run: kit só lê *.test.ts; stubs de op event respondem { value }/{ deny }. Aprovação R→E pelo operador em 2026-10-09."
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
    steps:
      - order: 1
        description: "Task 1 — núcleo de tiers, esforço e opt-in (scripts/lib/model-routing.mjs)"
        assignee: "backend-specialist"
      - order: 2
        description: "Task 2 — bloco models: no parser único (yaml-block, models-config, devflow-config)"
        assignee: "backend-specialist"
      - order: 3
        description: "Task 3 — routes.json e resolvedores de sessão e subagente"
        assignee: "backend-specialist"
      - order: 4
        description: "Task 4 — rubrica e combinação da escalada (escalation.mjs)"
        assignee: "backend-specialist"
      - order: 5
        description: "Task 5 — ledger com valores validados e relatório (routing-ledger, routing-report)"
        assignee: "backend-specialist"
      - order: 6
        description: "Task 6 — CLI model-route (resolve, escalate, report) com leitura segura"
        assignee: "backend-specialist"
      - order: 7
        description: "Task 7 — router-core, máquina de estado pura do mod"
        assignee: "backend-specialist"
      - order: 8
        description: "Task 8 — adaptador mod hooks/router.mjs (revisão pesada)"
        assignee: "security-auditor"
      - order: 9
        description: "Task 9 — fallback clássico PreToolUse da ferramenta Agent (revisão pesada)"
        assignee: "security-auditor"
      - order: 10
        description: "Task 10 — adaptador omp com teto"
        assignee: "backend-specialist"
      - order: 11
        description: "Task 11 — skills: tier no plano e escalada entre tentativas"
        assignee: "documentation-writer"
      - order: 12
        description: "Task 12 — doctor, guia pós-update, passo no config e no init"
        assignee: "backend-specialist"
      - order: 13
        description: "Task 13 — ADR e documentação"
        assignee: "architect-specialist"
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
lastUpdated: "2026-10-09T03:16:44.728Z"
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

> Last updated: 2026-10-09T03:16:44.728Z | Progress: 100%

### phase-2 [DONE]
- Started: 2026-10-09T01:58:34.711Z
- Completed: 2026-10-09T03:16:44.728Z

- [x] Step 1: Task 1 — núcleo de tiers, esforço e opt-in (scripts/lib/model-routing.mjs) *(2026-10-09T02:01:20.851Z)*
  - Output: 54c13eb + 1c4079b — scripts/lib/model-routing.mjs (núcleo puro) e tests/lib/model-routing.test.mjs (11 testes)
  - Notes: Revisão: 1 Important (toAlias/toRole com chave herdada) corrigido na rodada 1; 3 Minor adiados no ledger. Sensor unit verde.
- [x] Step 2: Task 2 — bloco models: no parser único (yaml-block, models-config, devflow-config) *(2026-10-09T02:03:16.702Z)*
  - Output: f94b5c8 — yaml-block.mjs, models-config.mjs (readModels), devflow-config.mjs reexporta + read-models; 85/85 com regressão do parser
  - Notes: Revisão aprovada sem achados bloqueantes; 1 Minor adiado (import sem uso). Sensor unit verde.
- [x] Step 3: Task 3 — routes.json e resolvedores de sessão e subagente *(2026-10-09T02:05:10.625Z)*
  - Output: 1d67173 — assets/model-routing/routes.json + resolveSubagentRoute/resolveSessionRoute/agentName; 13 testes (+11 da Task 1)
  - Notes: Revisão aprovada (D5, D21, D3 conferidos); 2 Minor adiados. Sensor unit verde.
- [x] Step 4: Task 4 — rubrica e combinação da escalada (escalation.mjs) *(2026-10-09T02:06:52.170Z)*
  - Output: f7e24b9 — scripts/lib/escalation.mjs (rubricPrompt, parseAnswers, combine); 8 testes, incluindo propriedade de teto
  - Notes: Revisão aprovada; 3 Minor adiados (limiares parciais, current inválido, delimitador). Sensor unit verde.
- [x] Step 5: Task 5 — ledger com valores validados e relatório (routing-ledger, routing-report) *(2026-10-09T02:08:34.051Z)*
  - Output: ba13a3f — routing-ledger.mjs (buildEntry/projectKey/ledgerDirFrom) e routing-report.mjs (aggregate com Map/renderMarkdown); 8 testes
  - Notes: Revisão aprovada; 4 Minor adiados (regex SAFE, base do ledgerDir, escape no markdown, testes de usage). Sensor unit verde.
- [x] Step 6: Task 6 — CLI model-route (resolve, escalate, report) com leitura segura *(2026-10-09T02:14:39.935Z)*
  - Output: 3cd1a50 + af6e661 — scripts/model-route.mjs (resolve/escalate/report, leitura segura, --runtime omp, --transcripts); 11 testes e2e
  - Notes: Revisão aprovada após fix round 1 (exit 0 no report com --transcripts inválido); 3 Minor adiados. Sensores unit e e2e verdes.
- [x] Step 7: Task 7 — router-core, máquina de estado pura do mod *(2026-10-09T02:17:02.170Z)*
  - Output: 187176f + c05bcae — scripts/lib/router-core.mjs (máquina de estado pura do mod); 12 testes
  - Notes: Revisão: 2 Important de D5 na escalada no meio (/model após escalada; maxTier) corrigidos na rodada 1; applyMidRun ganhou 4º parâmetro maxTier; ruling para a Task 8 chamar learnId(e.model) na sessão. Sensor unit verde.
- [x] Step 8: Task 8 — adaptador mod hooks/router.mjs (revisão pesada) *(2026-10-09T02:42:48.047Z)*
  - Output: bcd7aea + 675e479 — hooks/router.mjs (adaptador mod), hooks/router.test.ts (smoke do kit), tests/integration/test-router-mod.mjs (8 testes reais), modules no hooks.json, kit no run-integration
  - Notes: Revisão pesada (security-auditor/opus, PoCs): segurança confirmada; 3 Important + 1 ⚠️ corrigidos na rodada 1 (teste node do mod; skill via tool.call; raiz pelo cwd da sessão; esforço no teto). Risco aberto: hooks.json com "modules" em Claude Code antigo — decisão do operador. Sensores unit e integration verdes.
- [x] Step 9: Task 9 — fallback clássico PreToolUse da ferramenta Agent (revisão pesada) *(2026-10-09T02:57:43.242Z)*
  - Output: 503b963 + 463e611 — hooks/pre-tool-use-agent + scripts/lib/agent-route-hook.mjs (fallback clássico) + matcher Agent no hooks.json; 11 testes de integração
  - Notes: Revisão pesada (security-auditor/opus, PoCs com o hook real): sem travar/inchar; 1 Important (exclusão mútua só com "1") + contenção realpath na raiz corrigidos na rodada 1. Sensores unit e integration verdes.
- [x] Step 10: Task 10 — adaptador omp com teto *(2026-10-09T03:02:15.896Z)*
  - Output: scripts/lib/omp-enrich-project-agents.mjs — adaptador omp (tier → role com teto); commits afeea96 + 2a1e8a6
  - Notes: Revisão leve + 1 fix round (teto = model: do próprio agente fora do yaml; sem model → intocado). Minor adiado para a revisão final: parseFrontmatter lança em âncora YAML antes de checar a rota e aborta o laço. Sensor unit verde.
- [x] Step 11: Task 11 — skills: tier no plano e escalada entre tentativas *(2026-10-09T03:07:16.242Z)*
  - Output: Skills prevc-planning (Tier), prevc-execution e autonomous-loop (resolve/escalate sem --ceiling) + tests/e2e/test-skill-model-route-commands.mjs; commit bbb6d23
  - Notes: Revisão leve aprovada; 2 Minor adiados para a revisão final (role sob omp no escalate; assert de action no E2E). Sensor e2e verde.
- [x] Step 12: Task 12 — doctor, guia pós-update, passo no config e no init *(2026-10-09T03:09:47.517Z)*
  - Output: Check model-routing no doctor + post-update-guide + passo 2.7 no config + item 9 no project-init; functionHooksOn exportada de model-routing.mjs; commit 2280760
  - Notes: Revisão leve aprovada; 3 Minor adiados (provável fix: config §3/§5.3 não citam models: — regeneração pode descartar o bloco). Sensor unit verde.
- [x] Step 13: Task 13 — ADR e documentação *(2026-10-09T03:16:44.728Z)*
  - Output: ADR 017 (gated, sondas 2.1.294), docs/model-routing.md, README, spec §10 corrigida, teste do clássico sem fase; commits eefe70b + d1f3dcb
  - Notes: Revisão + fix round 1 (sondas R-4/R-6/R-7 na ADR; flags no guia; teste de fase nula). URLs de Evidências conferidas por WebFetch. Minor adiados: drift R-2/R-8 ADR×spec×guia. Sensores lint + integration verdes. Todas as 13 tasks concluídas; próximo = revisão final da branch (opus).
