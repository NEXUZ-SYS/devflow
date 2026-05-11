---
type: adr
name: permissions-vendor-neutral
description: Gramática deny-first portável entre Claude Code, Cursor, Codex, Gemini CLI, OpenCode
scope: organizational
source: local
stack: universal
category: seguranca
status: Aprovado
version: 1.0.0
created: 2026-05-06
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ".context/permissions.yaml em ordem deny → allow → mode → callback; SI-3 valida URLs de callback, SI-5 rejeita extglob/negação. git-strategy hook continua para Claude Code; permissions é a fonte de verdade vendor-neutral."
---

# ADR 004 — Permissions vendor-neutral (deny-first grammar)

- **Data:** 2026-05-06
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Segurança

---

## Contexto

DevFlow atualmente delega controle de permissões a hooks específicos do Claude Code: `git-strategy` (branch protection), `pre-tool-use` (deny patterns hardcoded). Essa abordagem é Claude-Code-específica e não portável para Cursor, Codex, Gemini CLI, OpenCode (as outras 4 plataformas alvo). O context-layer-v2 introduz operações sensíveis (linters em PostToolUse, scrape pipeline com fetch externo) que precisam de modelo de permissão **uniforme** em todas as plataformas.

## Drivers

- **Portabilidade**: 5 plataformas alvo precisam do mesmo modelo de permissão
- **Auditabilidade**: deny-list explícita em arquivo versionado (vs. lógica espalhada em hooks)
- **Defense-in-depth com git-strategy**: hook continua, mas permissions.yaml é fonte de verdade — hook é compat shim
- **Composability**: novas operações (Gap 4 OTel, futuras Gap N) podem declarar permissões sem modificar hooks

## Decisão

`.context/permissions.yaml` (spec `devflow-permissions/v0`) declara permissões em 4 camadas avaliadas em ordem fixa: **deny** (hard, nunca overridden) → **allow** (explícito) → **mode** (default `prompt`/`accept`/`deny` para unmatched) → **callback** (HTTP opcional para decisões complexas, URL validada via SI-3). Cada categoria tem 3 dimensões: `fs` (path globs), `exec` (command patterns), `net` (CIDR/hostname patterns); `allow.tool` adicional para MCP tool wildcards. `claudeCodeCompat: { preserveGitStrategyHook, preserveBranchProtectionExceptions }` mantém hooks Claude-Code rodando em paralelo durante a transição.

`scripts/lib/permissions-evaluator.mjs` é a engine. Recebe `{ tool, path?, command? }` e retorna `allow` | `deny` | `prompt`. Glob matching usa `scripts/lib/glob.mjs` (SI-5 subset). URLs de callback via `validateUrl()` (SI-3).

## Alternativas Consideradas

- **Manter status quo (hooks Claude-Code-específicos)** — rejeitado: não portável; cada plataforma re-implementa do zero
- **Adotar Cursor `rules.json` como spec** — rejeitado: Cursor-specific, não cobre `exec`/`net`/`tool` granular
- **Adotar OpenCode `permissions.toml`** — rejeitado: TOML adiciona dep externa; YAML já é stack
- **JSON Schema com vendor extensions** — rejeitado: complexidade premature para v1.0
- **YAML deny→allow→mode→callback** ✓ — escolhido: simples, portável, alinhado a SI-3/SI-5/SI-7 já existentes

## Consequências

**Positivas**
- Permissões em arquivo único versionado em git — code review trivial
- Mesma config funciona em 5 plataformas (cada plataforma adapta seu hook a esta gramática)
- `claudeCodeCompat` preserva git-strategy + auto-memory exceptions sem regressão
- `mode: prompt` (default) mantém UX familiar do Claude Code

**Negativas**
- Outras plataformas precisam adapter para consumir `permissions.yaml` (não fornecemos hooks Cursor/Codex em v1.0 — só Claude Code)
- Callback HTTP adiciona latency em cada PreToolUse se ativado (mitigado: opt-in, default null)
- Glob subset (SI-5) é menos expressivo que micromatch full — documentado no authoring guide

**Riscos aceitos**
- Permissions desatualizadas vs. hook git-strategy podem divergir em comportamento (mitigação: testes de paridade `tests/hooks/test-pre-tool-use-permissions.sh`)
- Mode `accept` em projeto com deny pequena pode permitir mais que o desejado (mitigação: defaultar `mode: prompt`)

## Guardrails

- SEMPRE manter deny coverage mínimo: `**/.env*`, `**/.ssh/**`, `**/secrets/**`, `**/*.pem`, `**/*.key`, force-push patterns, cloud metadata IPs
- SEMPRE validar callback URLs via `validateUrl()` (SI-3) — rejeita cloud metadata, RFC1918, file://, etc.
- SEMPRE rejeitar globs com extglob ou negação (SI-5) no schema validator
- NUNCA permitir `allow.exec: ["*"]` ou `allow.fs.write: ["**/*"]` sem mode:deny
- QUANDO `claudeCodeCompat.preserveGitStrategyHook: true`, ENTÃO o hook git-strategy roda em paralelo (defense-in-depth) — não substituí-lo até v1.2
- QUANDO callback URL é configurada, ENTÃO logar invocação no audit trail (`actions.jsonl`)

## Enforcement

- [ ] Code review: PRs que tocam `permissions.yaml` requerem aprovação explícita do owner do projeto
- [ ] Lint: `tests/validation/test-permissions-evaluator.mjs` cobre 12 cenários (deny-first ordering, mode variants, callback SI-3, glob SI-5)
- [ ] Test: `tests/hooks/test-pre-tool-use-permissions.sh` integration test com fixture
- [ ] Gate CI/PREVC: PreToolUse hook chama `evaluatePermissions(event, projectRoot)` antes de qualquer outra lógica
- [ ] Schema validator rejeita extglob/negação em globs de deny e allow

## Evidências / Anexos

- Plano de implementação: `.context/plans/context-layer-v2.md` Task Groups 3.0 a 3.3
- Spec original: `docs/devflow-context-layer-validation-v2-pt-br.md` §5.4 (template completo)
- Lib relacionada: `scripts/lib/permissions-evaluator.mjs` (Task 3.1)
- Security invariants exercitados: SI-3 (url-validator), SI-5 (glob subset)
- ADRs relacionadas: ADR-001 (path migration), ADR-002 (standards), ADR-003 (stacks)
