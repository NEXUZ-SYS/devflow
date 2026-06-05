---
type: adr
name: default-standards-library
description: Standards default podem trazer linter bundlado (SI-4 origin-aware) — enforcement nativo sem eject
scope: organizational
source: local
stack: universal
category: principios-codigo
status: Substituido
version: 2.0.0
created: 2026-06-04
supersedes: ["007-default-standards-library-v1.0.0"]
refines: ["002-adopt-standards-triple-layer-v1.0.0"]
protocol_contract: null
decision_kind: firm
summary: "Reverte a postura warn-only da v1.0.0: defaults PODEM trazer linter executável BUNDLADO no plugin (assets/standards/machine/std-<id>.js), executado pelo sandbox SI-4 com 2o allowlist root origin-aware. Enforcement de default é nativo (sem eject). Linters são bundled-only (nunca fetchados — invariante TCB anti-RCE). pluginRoot trust-anchored por marker. eject passa a ser só para customizar."
---

# ADR 007 — Standards default com linter bundlado (SI-4 origin-aware, enforcement sem eject)

## Contexto

A v1.0.0 desta ADR fixou defaults **warn-only** (`enforcement.linter: null`) com enforcement **opt-in por eject**. Na prática, um projeto que consome os defaults como vêm **não recebia nenhum enforcement automático** — o hook PostToolUse só rodava linters de standards do projeto (`loadStandards`, project-only), e os defaults não traziam linter. Exigir eject + escrever linter + religar `enforcement.linter` para cada concern é fricção que mata a adoção do enforcement.

A v1 rejeitou "linter bundlado no plugin" por exigir estender o sandbox SI-4. Esta v2 aceita conscientemente essa extensão — de forma origin-aware e trust-anchored — para entregar enforcement de default **sem eject**, preservando os invariantes de segurança.

## Decisão

Defaults **podem** trazer um linter executável **bundlado no plugin** em `assets/standards/machine/std-<id>.js`, com `enforcement.linter: machine/std-<id>.js`. O runner (`run-linter.mjs`) usa `loadStandardsMerged(projectRoot, pluginRoot)` e resolve o linter pela **origem carimbada pelo loader**: `project` → base `.context/` (allowlist `.context/engineering/standards/machine/`); `default` → base `<pluginRoot>/assets/standards/` (2o allowlist root `<pluginRoot>/assets/standards/machine/`). As 5 verificações SI-4 (validateLinterPath gate #1, allowlist, realpath, execFile, timeout) valem para ambos os roots.

`pluginRoot` é **trust-anchored**: verificado pelo marker `.claude-plugin/plugin.json`, preferindo `--plugin=<path>` derivado do `BASH_SOURCE` do hook sobre o env `CLAUDE_PLUGIN_ROOT` (envenenável). Não-verificado → **fail-closed** para project-only. Linters default são **bundled-only**: `update-default-standards.sh` busca **só `.md`**, nunca `.js`. Conjunto inicial curado (baixo falso-positivo): `security`, `error-handling`, `test-discipline`, `secret-conventions`; os demais seguem warn-only. Customização continua via **eject** (`--with-linter` traz o linter ao projeto; plain `eject` anula o `enforcement.linter` para não deixar referência pendurada).

## Alternativas Consideradas

- **Manter warn-only (v1.0.0)** — não atende o objetivo de enforçar sem eject; rejeitado.
- **Só trocar o loader (`loadStandardsMerged` no runner) sem shippar linters** — não enforça nada (defaults seguem `linter: null`); rejeitado.
- **Confiar no env `CLAUDE_PLUGIN_ROOT` para resolver linters default** — env é envenenável → RCE via dir falso; rejeitado em favor do trust-anchor por marker.
- **Linter bundlado + SI-4 origin-aware + trust-anchor + bundled-only** ✓ — enforça defaults nativamente sem relaxar o mecanismo SI-4 (estende a superfície com um 2o root disjunto e confiável).

## Consequências

**Positivas**
- Projetos recebem enforcement dos concerns curados sem eject nem config.
- SI-4 preservado: roots disjuntos selecionados por origem confiável; project nunca alcança o plugin e vice-versa.
- Override por id continua (projeto vence o default homônimo).

**Negativas**
- Mais linters rodam por edição (custo de `execFile` por linter aplicável) — mitigado por conjunto curado e `applyTo` realista.
- Plain eject de um default enforçado anula o linter (projeto vira warn-only até `--with-linter`).

**Riscos aceitos**
- Falso-positivo de linter default em todo projeto — mitigado pela barra de FP (regex conservadora + snippet conforme + sign-off de segurança).

## Guardrails

- SEMPRE carregar defaults via `loadStandardsMerged` — NUNCA ler `assets/standards/` diretamente em hook.
- Defaults PODEM trazer linter bundlado em `assets/standards/machine/std-<id>.js`; QUANDO trazem ENTÃO o arquivo deve existir no plugin (sem referência pendurada).
- NUNCA fetchar `.js`: `update-default-standards.sh` busca SÓ `.md`; `assets/standards/machine/*.js` é **bundled-only**, parte do TCB do plugin, nunca user-writable pós-install (anti-RCE).
- SEMPRE resolver o linter pela origem CARIMBADA pelo loader (`project`|`default`) — NUNCA ler `fm.origin`; origin fora do enum → fail-closed.
- SEMPRE trust-anchorar `pluginRoot` pelo marker `.claude-plugin/plugin.json`, preferindo `--plugin` do `BASH_SOURCE` sobre o env; QUANDO não-verificado ENTÃO fail-closed para project-only.
- SEMPRE manter as 5 verificações SI-4 para ambos os allowlist roots (validateLinterPath gate #1, startsWith allowlist, realpath, execFile, timeout 5s).
- QUANDO customizar um default ENTÃO usar `eject` (`--with-linter` traz/cria o linter no caminho canônico; plain `eject` anula o `enforcement.linter`).
- SEMPRE aplicar sanitização SI-6 no conteúdo `.md` fetchado antes de gravar.

## Enforcement

- [ ] `tests/validation/test-run-linter-si4-origin.mjs` — resolução origin-aware + fail-closed S1/S2/S5/S7.
- [ ] `tests/validation/test-run-linter-merged.mjs` — enforcement de default via runner + override + R11 (validateSubset).
- [ ] `tests/validation/test-run-linter-plugin-trust.mjs` — trust-anchor por marker; degrade sem verificação.
- [ ] `tests/validation/test-run-linter-cli-plugin.mjs` — CLI repassa `--plugin`; hook relaxa gate + passa token argv.
- [ ] `tests/validation/test-default-linters.mjs` — FP bar dos 4 linters + guard de ReDoS.
- [ ] `tests/validation/test-default-standards-content.mjs` — release-time: `enforcement.linter` declarado resolve para arquivo em `machine/`.
- [ ] `tests/scripts/test-update-default-standards.sh` — anti-RCE: fetch nunca grava `.js`; `machine/` byte-idêntico.
- [ ] `tests/validation/test-eject-with-linter.mjs` — `--with-linter` traz/cria linter; plain eject anula.

## Evidências

**Referências internas:** spec `docs/superpowers/specs/2026-06-02-standards-default-enforcement-design.md` · plano `docs/superpowers/plans/2026-06-02-standards-default-enforcement.md` · invariante SI-4 em ADR-002. Review multi-agente: architect (REVISE→resolvido) + security-auditor (PROCEED com S1–S8; ReDoS corrigido).
