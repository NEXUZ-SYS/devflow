---
type: plan
name: "check harness-sensors + catálogo derivado do contrato verify"
description: "Tracking dotcontext. Encerra o workflow-advance --force fazendo o gate do harness observar a mesma fonte do gate do ADR-013 — um catálogo de sensores derivado do contrato verify, mais um check no doctor que detecta ausência e drift."
planSlug: doctor-harness-sensors
scope: SMALL
autonomy: supervised
status: filled
progress: 0
generated: "2026-07-22"
scaffoldVersion: "2.0.0"
summary: "O gate de fase exige os sensores tests/lint, que não existem: nunca definimos .context/config/sensors.json e os built-ins do dotcontext assumem npm/TS (este repo não tem package.json na raiz). Resultado: workflow-advance --force em TODO avanço — 4x só na sessão que originou este plano — não por teste faltando (os sinais ficam verdes no ledger E no CI), mas por contabilidade do harness divergindo da evidência. Solução: gerador que deriva o catálogo do verify: (parser único, ADR-011; reusa VERIFY_ALLOWLIST) com fail-closed em metacaractere de shell e espaço em argumento, mais um check no doctor. ACHADO: o catálogo roda com promisify(exec) — sh -c — enquanto os built-ins usam spawn shell:false. Mas esse caminho é do dotcontext e PRÉ-EXISTENTE (qualquer sensors.json já é executado assim; quem tem escrita no repo pode criá-lo hoje), então gerar não cria a capacidade: superfície marginal ~zero e o arquivo é versionado, revisado em PR. A validação estrita é guard de CORRETUDE (round-trip argv<->string), não fronteira de segurança."
sources:
  spec: docs/superpowers/specs/2026-07-22-doctor-harness-sensors-design.md
  plan: docs/superpowers/plans/2026-07-22-doctor-harness-sensors-impl.md
  gap: docs/superpowers/plans/2026-07-22-harness-sensors-catalog-gap.md
requiredSignals:
  - unit
  - lint
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Spec aprovado. Achado que mudou o design: o sensors.json é executado com promisify(exec) (sh -c), diferente dos built-ins (spawn, shell:false) — conflito aparente com o ADR-013, resolvido ao verificar que o caminho de shell é pré-existente do dotcontext e alcançável independentemente de gerarmos o arquivo. Refinamento acrescentado no design: só tests e lint nascem bloqueantes, porque espelhar e2e como bloqueante custaria minutos por avanço de fase e levaria o operador a desligar tudo."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - tests
      - lint
    required_artifacts:
      - handoff-summary
    summary: "TDD RED→GREEN em 3 tasks. Task 1: sensors-from-verify.mjs (assertShellSafe + buildCatalog, 8 testes). Task 2: check harness-sensors no array CHECKS do doctor (5 testes). Task 3: dogfood — gerar o catálogo deste repo e confirmar que o check vira OK. CHANGELOG com o enquadramento honesto do risco."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    summary: "Sinais unit e lint observados no ledger do verify-gate (ADR-013). 8 + 5 testes novos; sem regressão nos demais checks do doctor. Verificação decisiva: este é o primeiro workflow cujo avanço de fase NÃO deve precisar de force."
lastUpdated: "2026-07-22T00:00:00.000Z"
---

# Check `harness-sensors` + catálogo derivado do `verify:` — tracking

> **Spec:** [`docs/superpowers/specs/2026-07-22-doctor-harness-sensors-design.md`](../../docs/superpowers/specs/2026-07-22-doctor-harness-sensors-design.md)
> **Plano executável:** [`docs/superpowers/plans/2026-07-22-doctor-harness-sensors-impl.md`](../../docs/superpowers/plans/2026-07-22-doctor-harness-sensors-impl.md)
> **Levantamento do gap:** [`docs/superpowers/plans/2026-07-22-harness-sensors-catalog-gap.md`](../../docs/superpowers/plans/2026-07-22-harness-sensors-catalog-gap.md)

## Problema

O gate de fase exige `tests` e `lint`. Nenhum existe — nunca definimos `.context/config/sensors.json`, e os built-ins do dotcontext (`i18n-coverage`, `tests-passing`, `typecheck-clean`) assumem npm/TS num repo que não tem `package.json` na raiz.

Consequência: `workflow-advance --force` em todo avanço, **4 vezes só na sessão que originou este plano**. Não é teste faltando — os sinais rodam verdes no ledger e no CI. É contabilidade do harness divergindo da evidência real, e forçar virou rotina, normalizando o bypass que o ADR-013 existe para impedir.

## O achado sobre shell, e por que não bloqueia

| caminho | execução |
|---|---|
| built-ins (`tests-passing`) | `spawn(exe, args, { shell: false })` |
| catálogo (`sensors.json`) | `promisify(child_process.exec)` — **`/bin/sh -c`** |

Parecia conflito com o ADR-013 (argv-only). **Não é**, porque o caminho de shell é do dotcontext e **pré-existente**: qualquer `sensors.json`, em qualquer projeto DevFlow, já é executado assim. Quem tem escrita no repo pode criar o arquivo hoje — gerar não cria a capacidade, e um atacante editaria o JSON à mão em vez de passar pelo gerador.

Portanto a validação estrita **não é fronteira de segurança**; é guard de **corretude** contra nós mesmos: o harness re-tokeniza a string por espaços, então um argumento com espaço quebraria o comando em silêncio. Controle adicional: `.context/config/` não está no `.gitignore` — o catálogo entra versionado e passa por revisão de PR.

## Decisões

- **D1** — gerador derivando do `verify:` (parser único, ADR-011; `VERIFY_ALLOWLIST` reusada, não redefinida), **fail-closed** em metacaractere de shell, espaço em argumento ou `argv[0]` fora da allowlist.
- **D2** — só `tests` e `lint` nascem `blocking: true` (são os que o `phase-defaults` auto-exige). Espelhar `e2e` como bloqueante custaria ~2min por avanço de fase e levaria o operador a desligar tudo, reintroduzindo o problema. `tests` recebe o comando do `unit`; sem sinal `unit`, não é emitido — não inventamos comando.
- **D3** — o doctor **diagnostica**, não repara (`scripts/doctor.mjs`: *"NEVER applies repairs"*). O `repair` é texto; o gerador é script separado e **não escreve por padrão** (sem flag imprime; `write` grava).

## Fora de escopo

Corrigir o bootstrap do dotcontext (upstream); auto-executar o reparo sem consentimento; substituir o `verify:` pelo catálogo — é por **espelhar**, não por substituir, que o `force` acaba.

## Guardrails de ADR

| ADR | Aplicação |
|---|---|
| 011 | `verify:` lido só via `devflow-config.mjs` (`readVerify`/`readVerifyFromPath`); `VERIFY_ALLOWLIST` importada. |
| 013 | O executor do DevFlow segue argv-only e intocado. O objetivo é fazer o gate do harness observar **a mesma fonte** do gate da fase V. |
| 009 | O caminho de execução do catálogo foi lido no código do `@dotcontext/cli`, não recuperado de memória. |

## Execution History

> Last updated: 2026-07-22 | Progress: 0%
