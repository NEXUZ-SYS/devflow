---
type: adr
name: default-standards-library
description: Conjunto curado de linters default estendido de 4 → 13 (SI-4 origin-aware) — enforcement nativo sem eject
scope: organizational
source: local
stack: universal
category: principios-codigo
status: Aprovado
version: 2.1.0
created: 2026-06-04
supersedes: ["007-default-standards-library-v2.0.0"]
refines: ["002-adopt-standards-triple-layer-v1.0.0"]
protocol_contract: null
decision_kind: firm
summary: "Evolução minor da v2.0.0 (estende, não reverte): amplia o conjunto curado de linters bundlados de 4 → 13 linters de arquivo auto-disparados (security, error-handling, secret-conventions, test-discipline + data-modeling, schemas, observability, migration, performance, naming-conventions, runtime-validation, api-conventions, typescript-strict). std-typescript-strict é a única exceção stack-scoped (applyTo TS-only). commit-hygiene NÃO é linter de arquivo — é canal opt-in via hooks/commit-msg-guard.mjs (Conventional Commits) e não conta nos 13. Cada novo linter passou a barra de FP (regex conservadora + sample conforme + ReDoS < 2s). Status promovido a Aprovado."
---

# ADR 007 — Conjunto curado de linters default estendido (4 → 13, SI-4 origin-aware, enforcement sem eject)

## Contexto

A v2.0.0 desta ADR aceitou que defaults **podem** trazer linter executável bundlado no plugin (`assets/standards/machine/std-<id>.js`), executado pelo sandbox SI-4 com 2º allowlist root origin-aware e trust-anchor por marker. O conjunto inicial **curado** (baixo falso-positivo) foi deliberadamente pequeno — 4 concerns: `security`, `error-handling`, `secret-conventions`, `test-discipline` — para validar o mecanismo antes de ampliar a superfície de enforcement.

Validado o mecanismo, a fricção residual passou a ser a **cobertura**: a maioria dos concerns de engenharia (modelagem de dados, schemas, observabilidade, migrations, performance, naming, validação em runtime, contratos de API, rigor TypeScript) continuava warn-only, sem enforcement automático. Esta v2.1.0 é uma **evolução minor** (estende, **não reverte** a v2.0.0): mantém intactos todos os invariantes de segurança SI-4 e amplia o conjunto curado para **13 linters de arquivo auto-disparados**, sob a mesma barra de falso-positivo.

## Decisão

A v2.1.0 **estende o conjunto curado** de linters default bundlados de 4 para **13 linters de arquivo auto-disparados** (via PostToolUse, resolvidos por `loadStandardsMerged` com origem `default`):

1. `security` — original (v2.0.0), agora também estendido
2. `error-handling` — original (v2.0.0), agora também estendido
3. `secret-conventions` — original (v2.0.0), agora também estendido
4. `test-discipline` — original (v2.0.0), agora também estendido
5. `data-modeling`
6. `schemas`
7. `observability`
8. `migration`
9. `performance`
10. `naming-conventions`
11. `runtime-validation`
12. `api-conventions`
13. `typescript-strict`

`std-typescript-strict` é a **única exceção stack-scoped** do conjunto default: seu `applyTo` é TS-only (`**/*.{ts,tsx}`), enquanto os demais 12 são universais ou multi-stack. Todos os outros defaults permanecem stack-agnósticos.

**commit-hygiene NÃO é linter de arquivo** e, portanto, **não conta nos 13**. Não há `std-commit-hygiene.js` disparado por edição de arquivo via PostToolUse. A higiene de commit é enforçada por um **canal opt-in separado** — `hooks/commit-msg-guard.mjs` — que valida mensagens de commit contra Conventional Commits no momento do commit (advisory/opt-in, fora do caminho SI-4 de linter de arquivo). O `std-commit-hygiene.md` permanece como standard documental, com nota apontando para esse canal.

O mecanismo de resolução (loader origin-aware, 2º allowlist root, trust-anchor, fail-closed, bundled-only) é **exatamente** o da v2.0.0 — nada nele muda. O que muda é o **conteúdo curado** servido por esse mecanismo.

## Alternativas Consideradas

- **Manter só os 4 da v2.0.0** — deixa a maioria dos concerns warn-only, não cobre os concerns mais frequentes (schemas, naming, runtime-validation); rejeitado.
- **Tratar commit-hygiene como o 14º linter de arquivo** — commit não é edição de arquivo; um linter PostToolUse não enxerga a mensagem de commit. Modelar como linter de arquivo seria semanticamente errado e geraria FP. Rejeitado em favor do canal `commit-msg-guard.mjs` opt-in.
- **Tornar typescript-strict universal** (rodar em todo arquivo) — gera FP massivo em projetos não-TS; rejeitado em favor de `applyTo` TS-only (única exceção stack-scoped).
- **Estender o conjunto curado para 13, cada um sob a barra de FP, mantendo SI-4 intacto** ✓ — amplia cobertura sem relaxar segurança nem o critério de qualidade.

## Consequências

**Positivas**
- Cobertura de enforcement default sobe de 4 para 13 concerns sem eject nem config.
- SI-4, trust-anchor, bundled-only e fail-closed permanecem byte-idênticos à v2.0.0.
- `typescript-strict` enforça rigor TS só onde faz sentido (TS-only), sem ruído em outros stacks.

**Negativas**
- Mais linters podem rodar por edição (custo de `execFile` por linter aplicável) — mitigado por `applyTo` realista e barra de ReDoS < 2s por linter.
- Linters SQL (data-modeling, migration, performance) só agregam valor com `applyTo` incluindo `**/*.sql`; configuração incompleta = sem cobertura nesses concerns.

**Riscos aceitos**
- Falso-positivo de qualquer um dos 13 linters em todo projeto — mitigado pela barra de FP aplicada a **cada** novo linter (regex conservadora + sample conforme + ReDoS < 2s) antes de entrar no conjunto curado.

## Guardrails

- SEMPRE carregar defaults via `loadStandardsMerged` — NUNCA ler `assets/standards/` diretamente em hook.
- SEMPRE manter as 5 verificações SI-4 para ambos os allowlist roots (validateLinterPath gate #1, startsWith allowlist, realpath, execFile, timeout 5s).
- NUNCA fetchar `.js`: `update-default-standards.sh` busca SÓ `.md`; `assets/standards/machine/*.js` é **bundled-only**, parte do TCB do plugin, nunca user-writable pós-install (anti-RCE).
- SEMPRE trust-anchorar `pluginRoot` pelo marker `.claude-plugin/plugin.json`, preferindo `--plugin` do `BASH_SOURCE` sobre o env; QUANDO não-verificado ENTÃO fail-closed para project-only.
- SEMPRE resolver o linter pela origem CARIMBADA pelo loader (`project`|`default`) — NUNCA ler `fm.origin`; origin fora do enum → fail-closed.
- SEMPRE manter a barra de falso-positivo (R14) para **cada um dos 13 linters**: regex conservadora + sample conforme (snippet não dispara FP) + ReDoS < 2s. NENHUM linter entra no conjunto curado sem passar essa barra.
- QUANDO o concern envolver SQL (data-modeling, migration, performance) ENTÃO o `applyTo` do std DEVE incluir `**/*.sql` — sem isso, esses linters não cobrem o concern.
- `std-typescript-strict` é a ÚNICA exceção stack-scoped: `applyTo` TS-only (`**/*.{ts,tsx}`); NUNCA torná-lo universal (FP em projetos não-TS).
- commit-hygiene NÃO é linter de arquivo e NÃO conta nos 13: é enforçado pelo canal opt-in `hooks/commit-msg-guard.mjs` (Conventional Commits), fora do caminho PostToolUse/SI-4.
- QUANDO customizar um default ENTÃO usar `eject` (`--with-linter` traz/cria o linter no caminho canônico; plain `eject` anula o `enforcement.linter`).
- SEMPRE aplicar sanitização SI-6 no conteúdo `.md` fetchado antes de gravar.

## Enforcement

- [ ] `tests/validation/test-default-linters.mjs` — FP bar dos linters do conjunto curado (array `CURATED` + extensões dos novos linters), com guard de ReDoS parametrizado (< 2s por linter).
- [ ] `tests/validation/test-applyto-sql-routing.mjs` — roteamento `applyTo` para `**/*.sql` nos linters SQL (data-modeling, migration, performance).
- [ ] `tests/validation/test-e2e-enriched-linters-hook.mjs` — E2E: os 13 linters disparam pelo hook real via `loadStandardsMerged`, origin-aware, sem eject.
- [ ] `tests/validation/test-commit-msg-guard.mjs` — validador Conventional Commits do canal opt-in `hooks/commit-msg-guard.mjs` (não é linter de arquivo).

## Evidências

**Referências internas:** spec/plano `docs/superpowers/plans/2026-06-04-standards-enrichment-linter-expansion.md` (Phase 8 — Task 8.1) · invariante SI-4 e trust-anchor herdados da v2.0.0 · ADR-002 (standards triple-layer). Evolução minor sobre `007-default-standards-library-v2.0.0` (file-per-version): estende o conjunto curado, não reverte o mecanismo.
