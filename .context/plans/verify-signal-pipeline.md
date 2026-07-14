---
type: plan
name: Pipeline de Sinal Verificável
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-07-14-verify-signal-pipeline.md. Spec aprovada em docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md.
planSlug: verify-signal-pipeline
scope: LARGE
autonomy: supervised
status: filled
progress: 0
generated: "2026-07-14"
scaffoldVersion: "2.0.0"
summary: "Converte a fase V do PREVC de afirmação para observação de sinal externo. Escopo v1: contrato verify: + executor verify-run.mjs + ledger + runners + CI árbitro + gate de V + guards + ADR-013. LARGE, test-first, 11 task groups."
sources:
  spec: docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md
  plan: docs/superpowers/plans/2026-07-14-verify-signal-pipeline.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Spec aprovada (D1-D9). Revisão de viabilidade (architect): 3 correções de fato + achado do hook async. ADR-013 ofertada (extends 011/012). Plano test-first escrito."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: pending
    summary: "Revisão do plano por architect + security. Confirmar escopo v1 (loop no hook fora), guards, TG0 (zerar suíte)."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - tests-passing
    required_artifacts:
      - handoff-summary
    summary: "Task Groups 0-10 em TDD (ver plano autoritativo). Nota: o sensor tests-passing é incompatível com este repo (roda npm test esperando jest); a evidência real de teste é o próprio executor verify-run.mjs + gate que esta feature introduz."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    required_sensors:
      - tests-passing
    required_artifacts:
      - handoff-summary
    summary: "Suíte verde via os runners novos; gate de V lê o ledger; auditoria de segurança dos guards; ADR-013 audit; compliance da spec."
---

# Pipeline de Sinal Verificável — Plano (dotcontext tracking)

> Este arquivo é o **tracking** dotcontext. O plano executável canônico (11 task groups TDD-first, com código real) vive em [`docs/superpowers/plans/2026-07-14-verify-signal-pipeline.md`](../../docs/superpowers/plans/2026-07-14-verify-signal-pipeline.md). O design aprovado está em [`docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md`](../../docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md).

## Objetivo

Converter o estágio Test (fase V) do PREVC de **afirmação do agente** para **observação de um sinal externo** produzido por código e arbitrado por CI. Fecha o defeito nomeado na spec §1.3: hoje "a fase V afirma 'testes passam'" é asserção do agente, não observação.

## Escopo v1

Contrato `verify:` (parser único ADR-011) + executor `verify-run.mjs` (`execFile` + `treeDigest` anti-livelock + ledger JSONL) + runners reprodutíveis (`git ls-files` + convenção) + CI árbitro `test.yml` (matriz 4 sinais) + gate de leitura na fase V (warn-only sem `verify:`, fail-closed com — D9) + `requiredSignals` no plano + guard anti-enfraquecimento de testes + guard do contrato `verify:` + ADR-013. Precedido do **Task Group 0** que zera a suíte para o CI nascer verde.

## Achados da revisão de viabilidade (architect) que moldaram o plano

1. **Hook `async:true` descarta o `additionalContext`** → o loop de RED da spec §7 nunca chega ao agente. Confirmado por execução (o hook emite; a sessão nunca recebe). **Loop no hook fica FORA do escopo v1** (follow-up, bug de produção que afeta todo projeto).
2. **Pin project-scoped 1.23.1** sombreia o user 1.28.0 → o repo devflow não roda o próprio código; hook/skills vêm do cache. Executor e CI dogfoodam do checkout; hook não.
3. **Suíte já vermelha** (8 falhas, 6 causas). TG0 zera antes do CI. Baseline reprodutível medido: unit 1867/2 falhas, integration 106/2-3, e2e 13/0.
4. **`unit` = toda a suíte .mjs** (~24s), não `tests/lib` (8%). Cobrir 8% reconstruiria o modo de falha do `tests-passing`.
5. **`treeDigest` anti-livelock**: exclui `.context/workflow/` e `.context/runtime/` (estado que muta ao avançar de fase).
6. **Guard do contrato**: `verify.*` é neutralizável por dentro → estender `devflow-config-guard` (adicionado ao escopo).

## Mapa de fases PREVC

### Phase P — Planning (em curso)
- Spec aprovada (D1–D9), commit `b9d0d9d`.
- Revisão de viabilidade concluída (architect): 3 correções de fato na spec + achado do hook.
- ADR-013 decidida (extends ADR-011 + ADR-012), a criar na fase E (TG10).
- Plano test-first escrito: `docs/superpowers/plans/2026-07-14-verify-signal-pipeline.md`.

### Phase R — Review (pendente)
Revisão do plano por architect + security-auditor: validar escopo v1, o corte do loop-no-hook, os dois guards, e o TG0.

### Phase E — Execution (pendente)
11 task groups na ordem, TDD por grupo, branch `feature/verify-signal-pipeline`.

### Phase V — Validation (pendente)
Suíte verde via os runners; gate de V lê o ledger (dogfooding); auditoria de segurança dos guards e do argv-contract; audit da ADR-013; compliance da spec.

## Follow-ups explícitos (fora do escopo v1)
1. Conserto do hook `async:true` (`asyncRewake`+`exit 2`+stderr) — bug de produção, ciclo próprio.
2. Loop rápido local no hook (depende de 1).
3. Pin project-scoped obsoleto → `--plugin-dir` como procedimento de dogfooding.
4. Deploy verificado; sinal por worker do AO (spec §2).

## Evidências
- Spec: `docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md`
- Plano canônico: `docs/superpowers/plans/2026-07-14-verify-signal-pipeline.md`
- Branch: `feature/verify-signal-pipeline`
