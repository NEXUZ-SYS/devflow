# Fix GAP-PERM-ROOT — permissions schema drift → deny opaco

> **DevFlow workflow:** fix-permissions-schema-drift | **Scale:** MEDIUM | **Phase:** P→R

**Goal:** Tornar o fail-closed do permissions-evaluator *acionável* (não mais um `mode: deny` opaco repo-wide) e detectar/sinalizar explicitamente `permissions.yaml` em formato legado, além de corrigir o menu da skill `config` que excede o cap de 4 opções do `AskUserQuestion`.
**Architecture:** Vendor-neutral deny-first permissions (ADR-004). O `reason` trafega `evaluatePermissions` → `permissions-cli` (stdout) → `hooks/pre-tool-use` (prefixa `[devflow permissions.yaml]` e imprime). Só stderr é descartado pelo hook — logo a correção de observabilidade vive no evaluator.
**Tech Stack:** Node `node:*` puro (evaluator/CLI), Bash+python3 (hook), node:test + bash para testes.
**Agents:** bug-fixer (lead) · test-writer (TDD) · security-auditor (review V — toca o gate de permissões).

**Fonte (spec):** `/home/walterfrey/Documentos/code/devflow-e2e-sandbox/docs/validation/2026-06-18-bug-permissions-schema-drift.md`

## Causa-raiz
`loadPermissions` → schema inválido → `console.error` (stderr) + `return {...cfg, mode:"deny"}`. Hook descarta stderr (`2>/dev/null`), `evaluatePermissions` retorna `reason:"mode: deny"` genérico (L233). `permissions.yaml` legado (`version:0`, `deny/allow` listas, `mode:{default:ask}`) reprova porque `mode` é objeto. Deny independe do path → lockout total.

## Decisões fechadas
- **Fix 1 (GAP-OBS-1):** `__denyReason` acionável anexado no fail-close; `evaluatePermissions` usa `cfg.__denyReason || "mode: deny"`. Sem mudar lógica do hook.
- **Fix 2 (GAP-PERM 6.2):** `detectLegacySchema(cfg)` (deny/allow Array, mode objeto, `version:` presente) → erro "formato legado — migre"; check genérico de `mode` restrito a string.
- **Fix 3 (GAP-PORT-1):** split 3+2 num único `AskUserQuestion` (preserva docs-mcp-server selecionável sem grounding). [decisão do usuário]
- **Fix 4 (6.4):** verify-only — sem exemplos legados de `permissions.yaml` em docs/skills/templates.

## Hardening pós-Review (security-auditor — REVISE→PROCEED)
> Achados absorvidos. Estes são **invariantes load-bearing de segurança** — sem eles, a Fix 2 pode inverter fail-closed→fail-OPEN.

- **[CRIT/HIGH] Anti-fail-open.** `detectLegacySchema` é **disjuntivo** (qualquer 1 marcador dispara) e inclui o fallback **`mode` presente e não-string ⇒ marcador sempre** (fecha o edge E1: `mode` objeto sem `version`). O check genérico de `mode` só roda para `typeof === "string"`. Invariante testável obrigatório: *config legado ⇒ `validatePermissionsSchema` ≥1 erro ⇒ `loadPermissions().mode === "deny"`* (não só checar `__denyReason`).
- **[MED] Anti-injeção de prompt.** `__denyReason` (trafega via stdout→LLM) é montado **só com marcadores DevFlow-controlados** por `buildDenyReason(cfg)`; **nunca** interpola valores crus do YAML do usuário (`String(cfg.mode)`, globs). O erro técnico cru (`got '[object Object]'`) vai **só** para `console.error` (stderr, descartado). Invariante: reason **não** contém sentinela injetada no fixture.
- **[MED] Semântica de `version`.** Marcador próprio: "campo 'version' não pertence ao v0 (use 'spec')". `version === undefined` (config válido v0) **não** é sinal.
- **[LOW] Mensagens distintas.** parse-error ("YAML não parseável") ≠ schema/legado ("migre p/ v0"). `$CLAUDE_PLUGIN_ROOT` **não** é expandido literal — texto estático ("rode /devflow config").
- **[LOW] Hook E2E.** Assertar saída **JSON-parseável** (`json.loads`) com reason multilinha, não só `grep`.
- **[LOW] Fix 3.** Assertar que permanece **um único call** (2 perguntas no mesmo bloco).

---

## Task Group 1: Detecção de schema legado (evaluator)
**Agent:** bug-fixer · **Tests:** unit
**Test:** `tests/validation/test-permissions-evaluator.mjs`

- [ ] T1.1 — Escrever testes RED: `detectLegacySchema` (disjuntivo) retorna ≥1 marcador p/ **cada** sinal isolado: `deny` lista, `allow` lista, `mode` objeto, `mode` não-string (número/array), `version` presente; e config v0 canônico → `[]`.
- [ ] T1.2 — **[CRIT] Invariante anti-fail-open RED:** `validatePermissionsSchema(legacyCfg)` ≥1 erro **e** `loadPermissions(<dir c/ arquivo legado>).mode === "deny"`; idem p/ config com **só** `mode` objeto sem `version` (edge E1). Rodar → confirmar falha (função inexistente).
- [ ] T1.3 — Implementar `detectLegacySchema(cfg)` **disjuntivo** export (inclui fallback `mode` presente e não-string); integrar em `validatePermissionsSchema` (erro estático "formato legado/não-conforme — migre para devflow-permissions/v0 (rode /devflow init ou /devflow config)" + marcadores controlados); restringir check genérico de `mode` a `typeof === "string"`.
- [ ] T1.4 — `loadPermissions`: threadar `version: parsed.version` no `cfg` (`undefined` em config válido não é sinal). Rodar → GREEN.

## Task Group 2: Deny acionável (observabilidade)
**Agent:** bug-fixer · **Tests:** unit + e2e(hook)
**Test:** `tests/validation/test-permissions-evaluator.mjs` + `tests/hooks/test-pre-tool-use-permissions.sh`

- [ ] T2.1 — Testes RED: `loadPermissions` em arquivo legado → `mode:"deny"` **e** `__denyReason` casa `/legado|migre/`; `evaluatePermissions` com `__denyReason` → `reason` é o acionável; **regressão 1**: `mode:deny` explícito (config válido) → `__denyReason === undefined` → `reason:"mode: deny"`; **regressão 2**: config **válido** → `__denyReason === undefined`.
- [ ] T2.2 — **[MED] Invariante anti-injeção RED:** fixture legado com sentinela (`deny: [{path:"ZZINJECTZZ"}]` e `mode:{default:"ZZINJECTZZ"}`) → `__denyReason` **não** contém `ZZINJECTZZ`. **E3 RED:** parse-error (YAML quebrado) → `__denyReason` distinto (menciona "parse"/"YAML", não "legado"). Rodar → falha.
- [ ] T2.3 — Implementar `buildDenyReason(cfg)` (só marcadores controlados, sem valores do YAML); anexar `__denyReason` nos 2 paths de fail-close (parse-error c/ msg própria + schema-error); `evaluatePermissions` mode:deny → `cfg.__denyReason || "mode: deny"`. `err.message`/erros crus só em `console.error`. GREEN.
- [ ] T2.4 — Teste E2E hook RED: `permissions.yaml` legado em tmpdir → saída do hook é **`json.loads`-parseável**, `permissionDecision == "deny"` **e** `permissionDecisionReason` com "legado"/"migre" (reason multilinha). Rodar → GREEN (sem mudar o hook; valida o trilho stdout).

## Task Group 3: Split do menu da skill config (GAP-PORT-1)
**Agent:** bug-fixer · **Tests:** estrutural (lint)
**Test:** `tests/validation/test-config-skill-askquestion.mjs` (novo)

- [ ] T3.1 — Teste RED: parsear blocos `AskUserQuestion` de `skills/config/SKILL.md`; asseverar todo `options:` ≤ 4 **e** que 5.3 permanece um único call (2 perguntas no mesmo bloco). Rodar → falha (5.3 tem 5).
- [ ] T3.2 — Editar 5.3: split 3+2 num único call (Q-A: git/MemPalace/docs-mcp-server; Q-B: Doc-grounding/Rotinas), multiSelect; ajustar texto "Pré-marcar ausentes" p/ as 2 perguntas; preservar a tabela Unidade→Blocos. Rodar → GREEN.

## Task Group 4: Consistência de docs (6.4) + regressão total
**Agent:** documentation-writer / bug-fixer
- [ ] T4.1 — Confirmar (grep) ausência de exemplo legado de `permissions.yaml`; se houver, normalizar p/ `devflow-permissions/v0`.
- [ ] T4.2 — Rodar suíte de regressão completa (runner do repo) → tudo verde.

## Rollback
Mudanças são puramente aditivas (novo export, novo campo `__denyReason`, marcadores). Reverter = `git checkout` dos 4 arquivos. Sem migração de dados.
