---
type: plan
name: suggest-bump resolve a base pelo último release
description: Tracking dotcontext. Spec e plano autoritativos em docs/superpowers/. Corrige o helper que sugeria "patch" em toda entrega porque analisava origin/main..HEAD depois do merge, quando esse range já está vazio.
planSlug: suggest-bump-postmerge-base
scope: SMALL
autonomy: supervised
status: filled
progress: 0
generated: "2026-07-22"
scaffoldVersion: "2.0.0"
summary: "O Step 8.1 da prevc-confirmation roda DEPOIS do Step 4 (merge + git pull), quando HEAD == origin/main e o range origin/main..HEAD está vazio — o suggest-bump.mjs não tinha commit para classificar e caía sempre no fallback patch. Correção: resolveBase(cwd) deriva a base da última tag de release alcançável do HEAD via git describe em tiers de --match (v[0-9]* → [0-9]* → qualquer tag → origin/main). Os tiers também impedem que uma tag não-release (cli-v3.2.0 em monorepo) trunque o range — achado do probe empírico, além do que o backlog previa. O call site NÃO duplica a resolução (seria regressão: como argv[0] ela venceria o helper); ganha procedência no stderr, com stdout intacto como contrato."
sources:
  spec: docs/superpowers/specs/2026-07-21-suggest-bump-postmerge-base-design.md
  plan: docs/superpowers/plans/2026-07-21-suggest-bump-postmerge-base.md
  backlog: docs/superpowers/2026-07-21-suggest-bump-postmerge-gap.md
requiredSignals:
  - unit
  - lint
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Bug analisado e reproduzido; probe empírico do git describe revelou que a correção do backlog ainda erra com tag não-release. Spec aprovado pelo operador (D1 cascata de --match, D2 call site sem duplicação, D3 procedência no stderr) e plano test-first de 2 tasks escrito."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - tests
      - lint
    required_artifacts:
      - handoff-summary
    summary: "TDD RED→GREEN. Task 1: resolveBase() + default novo + stderr, com 6 testes de fixture git real em tmpdir (o teste do estado pós-merge é a regressão do bug). Task 2: Step 8.1 exibe a procedência + anti-pattern contra reintroduzir a resolução no call site + CHANGELOG. Guard finalize-pure precisa continuar verde (execFileSync com argv, nunca shell)."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    summary: "Sinais unit e lint observados no ledger do verify-gate (ADR-013 — observar, não afirmar). 14 testes no suggest-bump (8 originais intactos + 6 novos); finalize-pure verde; sem regressão no restante do run-unit.sh."
lastUpdated: "2026-07-22T00:00:00.000Z"
---

# `suggest-bump` resolve a base pelo último release — tracking

> **Spec:** [`docs/superpowers/specs/2026-07-21-suggest-bump-postmerge-base-design.md`](../../docs/superpowers/specs/2026-07-21-suggest-bump-postmerge-base-design.md)
> **Plano autoritativo (test-first):** [`docs/superpowers/plans/2026-07-21-suggest-bump-postmerge-base.md`](../../docs/superpowers/plans/2026-07-21-suggest-bump-postmerge-base.md)
> **Backlog de origem:** [`docs/superpowers/2026-07-21-suggest-bump-postmerge-gap.md`](../../docs/superpowers/2026-07-21-suggest-bump-postmerge-gap.md)

## Problema

No fluxo canônico da `devflow:prevc-confirmation`, o **Step 8.1** (signpost de release pendente) roda **depois** do **Step 4**, que termina com `gh pr merge … && git checkout main && git pull`. Nesse ponto `HEAD == origin/main`.

O helper usava `argv[0] || "origin/main"` e analisava `origin/main..HEAD` — vazio pós-merge. Sem commits para classificar, respondia **`patch`** em toda entrega. Prova na sessão do N0 do import-reversa: o range pós-merge dava `patch`, `v1.30.0..HEAD` dava `minor`, e o release correto foi **1.31.0**.

O bump é sugestão que o operador confirma, então nada foi publicado errado sozinho — mas o helper existe *exatamente* para acertar essa sugestão. Sempre responder `patch` o tornava inútil e induzia bump subestimado, pior sob `autonomy: autonomous`.

## Achado adicional (probe empírico)

Trocar o default para `git describe --tags --abbrev=0` **nu** — a correção que o backlog propunha — ainda erra em repositório com tag não-release, que é o terreno do DevFlow como plugin. Fixture `v1.0.0` → `feat:` → `cli-v3.2.0` → `feat:`: o `describe` nu escolhe `cli-v3.2.0` e trunca o range; com `--match 'v[0-9]*'` escolhe `v1.0.0`.

## Decisões

- **D1** — `resolveBase(cwd)` com tiers de `--match`: `v[0-9]*` → `[0-9]*` → qualquer tag → `origin/main`. **Rejeitado** `tagPattern` configurável (YAGNI; exigiria consumo via `devflow-config.mjs` por ADR-011 e criaria contrato público permanente).
- **D2** — o call site **não** duplica a resolução. A recomendação (a) do backlog é **regressão**: como `argv[0]`, a versão shell vence a do helper e anula a proteção contra tag não-release. Comando do Step 8.1 fica inalterado; anti-pattern novo barra a reintrodução.
- **D3** — procedência no `stderr` (`suggest-bump: base=v1.31.0 (source=tag, 2 commits)`); `stdout` permanece contrato puro `patch|minor|major`. Um range vazio passa a ser visível em vez de silencioso.

## Fora de escopo

`tagPattern` configurável; ramo `glab` do signpost (lacuna própria, já rastreada); auto-dispatch do release (decisão humana por design).

## Guardrails de ADR

| ADR | Aplicação |
|---|---|
| 011 | Nenhum campo novo de `.devflow.yaml` é lido; se `tagPattern` existir um dia, obrigatoriamente via `scripts/lib/devflow-config.mjs`. |
| 013 | `requiredSignals: [unit, lint]` declarados; a fase V observa o ledger do `verify-gate`, não afirma. |
| 009 | A semântica do `git describe` foi verificada empiricamente em repo descartável, não recuperada de memória. |

## Execution History

> Last updated: 2026-07-22 | Progress: 0%
