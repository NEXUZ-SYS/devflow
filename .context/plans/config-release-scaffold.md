---
type: plan
name: "Config: aviso + scaffold de pipeline de release"
description: devflow:config avisa quando versioning:pipeline é escolhido sem CI e oferece scaffold verbatim de uma pipeline de release (v1 = 3 arquivos), com enforcement real.
planSlug: config-release-scaffold
scope: MEDIUM
autonomy: supervised
status: filled
progress: 0
generated: "2026-07-09"
scaffoldVersion: "2.0.0"
summary: "Scaffold de CI verbatim + proveniência (ADR-012). Autoritativo em docs/superpowers/. 8 tasks (0, A–G), TDD test-first."
sources:
  spec: docs/superpowers/specs/2026-07-09-config-release-scaffold-design.md
  plan: docs/superpowers/plans/2026-07-09-config-release-scaffold.md
  adr: .context/engineering/adrs/012-ci-scaffold-verbatim-provenance-v1.0.0.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Brainstorming, spec, ADR-012 (gate 13/13), plano test-first."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: completed
    summary: "3 rodadas (architect + security). HIGH fechado por D7a+D7b. Veredito PROCEED."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: in_progress
    required_sensors: [tests-passing]
    required_artifacts: [handoff-summary]
    summary: "Tasks 0, A–G em TDD (ver plano autoritativo)."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    required_sensors: [tests-passing]
    summary: "Suite verde, auditoria de contenção/gate/higiene E2E, compliance ADR-012 v1.1.0."
lastUpdated: "2026-07-09T22:18:08.744Z"
---

# Config: aviso + scaffold de pipeline de release — Plano (dotcontext tracking)

> Este arquivo é o **tracking** dotcontext. O plano executável canônico (8 tasks TDD-first, com código real) vive em [`docs/superpowers/plans/2026-07-09-config-release-scaffold.md`](../../docs/superpowers/plans/2026-07-09-config-release-scaffold.md). O design aprovado está em [`docs/superpowers/specs/2026-07-09-config-release-scaffold-design.md`](../../docs/superpowers/specs/2026-07-09-config-release-scaffold-design.md).

## Objetivo

`devflow:config` avisa quando `versioning: pipeline` é escolhido sem CI (o bump vira no-op silencioso) e oferece scaffold **verbatim** de uma pipeline de release (v1 = 3 arquivos), com **enforcement real** (confirmação humana + dry-run + contenção por allowlist), rebaixando `versioning: local`.

## Decisões fechadas (Planning + Review)

1. **Verbatim, nunca interpolado.** Cópia byte-a-byte do asset; a configuração por projeto vem de **detecção em runtime** dentro do próprio `bump-version.sh`.
2. **Escopo v1 = 3 arquivos** (`release.yml`, `bump-version.sh`, `lib/changelog-cut.mjs`). `tag-release.yml`/`version-guard`/`changelog-guard` não são genericizáveis sem `detect-version.mjs` → v2.
3. **Applier e sync próprios.** `provenance-sync.applySync` é contido a `.context/`; reusar só as funções puras `loadRegistry` + `decideArtifact`.
4. **D7b é o controle mecânico:** `.github/workflows/**` é gravado pela ferramenta `Write` (passa pelo gate de permissões), nunca por `node:fs`.
5. **D7a é auxiliar e auto-contornável:** guard de autonomia lê `.context/workflow/status.yaml` (fonte real, a mesma de `hooks/post-tool-use`), não o `.devflow.yaml`.
6. **`verifyWritten` (N6a):** o workflow é o único artefato que roda em CI e o único cujo conteúdo transita pelo LLM → hash(dest) === hash(asset) fail-loud.
7. ADR-012 evolui → v1.1.0 e é promovida a `Aprovado` (guardrail é inerte na governança enquanto `Proposto`).

## Mapa de fases PREVC

### Phase P — Planning (✅ completo)
- Spec aprovado pelo operador.
- ADR-012 criada, gate 13/13 (`3ad8bbf`).
- Plano canônico test-first commitado (`6fa5730`).

### Phase R — Review (✅ completo — 3 rodadas)
- 1ª: architect emitiu 6 BLOCKs (escopo, contenção do applier, assertiva falsa de proveniência) + security HIGH (applier escreve por `node:fs`, invisível ao `pre-tool-use`).
- 2ª: HIGH fechado mecanicamente (D7a + D7b); N1–N4 endereçados.
- 3ª: **PROCEED**. Condições vinculantes N6a (`verifyWritten`) e N6b (spec lia `.devflow.yaml` → corrigido p/ `status.yaml`; ao pé da letra o D7a falharia aberto).
- Enquadramento honesto registrado: D7b mecânico, D7a auxiliar.

### Phase E — Execution (em curso)
Executar as 8 tasks na ordem, TDD por task, commits na branch `feature/config-release-scaffold`:
- **Task 0** — ADR-012 → v1.1.0 + `Aprovado` + `## Enforcement` linkando os testes.
- **Task A** — `assets/release-scaffold/bump-version.sh` genérico e endurecido (`sed` ancorado, `^X.Y.Z$` fail-loud, `$GITHUB_OUTPUT`).
- **Task B** — assets v1 + guard-tests (anti-hardcode, sem `pull_request_target`, `env:`-indireção).
- **Task C** — `release-scaffold.mjs`: `checkGate` / `planScaffold` / `applyScaffold` / `verifyWritten`.
- **Task D** — `syncScaffold` (update seguro, diff+confirmação p/ classe-CI) + `gen-known-hashes` (walk separado).
- **Task E** — `skills/config/SKILL.md` P5b + confirmação estruturada.
- **Task F** — `/devflow update` chama `syncScaffold` (código, não prosa).
- **Task G** — E2E isolado (fixture fora da árvore, `origin` = path local bare).

### Phase V — Validation
- Suite completa verde (`node --test` + `tests/scripts/*.sh` + `tests/skills/*.sh`).
- Auditoria de segurança: contenção (symlink/`..`/pai-symlink), gate de host ancorado, higiene E2E (nenhum `git push`/`gh`).
- Compliance com os guardrails da ADR-012 v1.1.0.

## Vetor residual conhecido (pré-existente, global)
Um agente não-cooperativo escreve `.github/**` por **Bash** (`printf >`, `cp`), contornando D7a **e** D7b: o `hooks/pre-tool-use` só guarda `git push|gh pr merge|git commit` em Bash e faz `exit 0` para `TOOL_NAME != Edit/Write`. **Não é introduzido por esta feature.** Follow-up de produto: endurecer `permissions.yaml` contra escrita em `.github/**` via Bash.

## Evidências
- Spec: `docs/superpowers/specs/2026-07-09-config-release-scaffold-design.md`
- Plano canônico: `docs/superpowers/plans/2026-07-09-config-release-scaffold.md`
- ADR: `.context/engineering/adrs/012-ci-scaffold-verbatim-provenance-v1.0.0.md`
- Branch: `feature/config-release-scaffold` (commits `3ad8bbf`, `6fa5730`, `1af933d`, `dc78ea8`, `93eb6da`)

## Execution History

> Last updated: 2026-07-09T22:18:08.744Z | Progress: 0%
