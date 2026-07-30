# Standards Default Enforcement — Implementation Plan

> **DevFlow workflow:** standards-default-enforcement | **Scale:** LARGE | **Phase:** P→R

**Goal:** Enforçar standards default do plugin no hook PostToolUse sem exigir eject, evoluindo ADR-007 e estendendo SI-4 de forma origin-aware; adicionar `eject --with-linter`.
**Architecture:** `run-linter.mjs` passa a usar `loadStandardsMerged` e resolve o linter conforme `std.origin` (project→`.context`, default→`pluginRoot/assets/standards`), com 2º allowlist root SI-4 para o `machine/` do plugin. Linters default são bundled-only (nunca fetchados).
**Tech Stack:** node:* puro, `node --test`, sem deps. Hooks POSIX shell.
**Agents:** security-auditor (SI-4), backend-specialist (loader/runner), test-writer, documentation-writer (ADR).

**Baseline:** branch nova a partir de `main` trazendo SÓ o fix do parser de frontmatter (prerequisito D6). Subagents: apenas `git add`+`git commit` na branch — proibido gh/PR/push/merge/switch.

---

## Task Group 0 — Baseline + prerequisito
**Agent:** backend-specialist
- [ ] Criar branch `feat/standards-default-enforcement` a partir de `main`.
- [ ] Portar o fix de `scripts/lib/frontmatter.mjs` (splitTopLevelCommas) + `tests/validation/test-frontmatter.mjs` (3 testes de regressão brace-glob).
- [ ] **Test:** `node --test tests/validation/test-frontmatter.mjs` → 10/10 (confirma baseline).
**Tests:** unit (regressão de parser).

## Task Group 1 — SI-4 origin-aware (núcleo de segurança)
**Agent:** security-auditor → backend-specialist
**Handoff from:** baseline
- [ ] **Test (RED):** `tests/validation/test-run-linter-si4-origin.mjs` — casos:
  (a) std `origin: default` com linter `machine/std-X.js` resolve dentro de `<pluginRoot>/assets/standards/machine` → permitido;
  (b) std `origin: project` resolve em `.context/.../machine` → permitido (inalterado);
  (c) default tentando `../../etc/x.js` → REJEITADO (path traversal);
  (d) symlink no machine do plugin apontando fora → REJEITADO;
  (e) `origin: default` sem pluginRoot → não executa (sem crash).
- [ ] Implementar `resolveAndCheckSandbox(linterRel, { projectRoot, pluginRoot, origin })`: escolher base + allowlist root por origin; manter as 5 verificações SI-4.
- [ ] **Test (GREEN):** rodar o arquivo acima → verde.
**Tests:** unit + **security** (path traversal, symlink, allowlist).

## Task Group 2 — Runner usa loadStandardsMerged
**Agent:** backend-specialist
**Handoff from:** TG1
- [ ] **Test (RED):** `tests/validation/test-run-linter-merged.mjs` — projeto SEM eject + default com linter bundlado + arquivo violador → `runLintersFor(event, projectRoot, pluginRoot)` retorna 1 violação (origin default). E project override de id vence.
- [ ] Alterar `runLintersFor` para assinatura `(event, projectRoot, pluginRoot)` e usar `loadStandardsMerged(projectRoot, pluginRoot)`; passar `origin` para a resolução SI-4.
- [ ] **Test (GREEN):** verde.
**Tests:** unit + integração (loader+runner).

## Task Group 3 — CLI + hook passam pluginRoot
**Agent:** backend-specialist
**Handoff from:** TG2
- [ ] **Test (RED):** `tests/validation/test-run-linter-cli-plugin.mjs` — `run-linter-cli.mjs` lê `CLAUDE_PLUGIN_ROOT` (env) e/ou `--plugin=<path>` e o repassa ao runner; sem ele, degrada para project-only (sem crash).
- [ ] Atualizar `scripts/lib/run-linter-cli.mjs` (parse env/flag) e `hooks/post-tool-use` (exportar `CLAUDE_PLUGIN_ROOT` na invocação).
- [ ] **Test (GREEN):** verde.
**Tests:** unit + hook (stdin JSON).

## Task Group 4 — Linters default bundlados (curados)
**Agent:** security-auditor → backend-specialist
**Handoff from:** TG2
- [ ] **Test (RED):** `tests/validation/test-default-linters.mjs` — para cada default com linter: o `.js` existe em `assets/standards/machine/`, `enforcement.linter` aponta para `machine/std-<id>.js`, e um snippet violador dispara / um conforme não dispara.
- [ ] Criar `assets/standards/machine/std-<id>.js` para o conjunto curado (observability, security, error-handling, performance, test-discipline, secret-conventions, runtime-validation) + religar `enforcement.linter` nos `.md`.
- [ ] Garantir baixo falso-positivo (regex conservadora; revisão security-auditor).
- [ ] **Test (GREEN):** verde.
**Tests:** unit (cada linter) + segurança (sem shell-out).

## Task Group 5 — Guard anti-RCE no fetch
**Agent:** security-auditor
**Handoff from:** TG4
- [ ] **Test (RED):** `tests/scripts/test-update-default-standards.sh` — novo caso: MANIFEST/upstream contendo `.js` → o script NUNCA grava `.js` (só `.md`).
- [ ] Reforçar `update-default-standards.sh`: validar que cada entrada do MANIFEST casa `^std-[a-z0-9-]+\.md$` (já existe R4) e adicionar assert explícito anti-`.js`.
- [ ] **Test (GREEN):** verde.
**Tests:** shell E2E (segurança).

## Task Group 6 — `eject --with-linter`
**Agent:** backend-specialist
**Handoff from:** TG2
- [ ] **Test (RED):** `tests/validation/test-eject-with-linter.mjs` — `eject <id> --with-linter` gera `.md` + `machine/std-<id>.js` + `enforcement.linter` religado (project-side); `eject` simples segue sem linter; `--with-linter` sem `--force` recusa sobrescrever linter existente.
- [ ] Implementar a flag em `scripts/devflow-standards.mjs` (cmdEject) reusando `assertWithinDir` (SI-5 id validation).
- [ ] **Test (GREEN):** verde.
**Tests:** unit + segurança (containment do path).

## Task Group 7 — ADR-007 v2.0.0 (evolução major)
**Agent:** documentation-writer
**Handoff from:** TG1–TG6 (decisão materializada)
- [ ] **Test (RED):** `node scripts/devflow-adr.mjs audit 007 ...` falha enquanto v2.0.0 não existe/coerente.
- [ ] Evoluir ADR-007 → v2.0.0 via `devflow:adr-builder` (EVOLVE major): reverter guardrails warn-only, adicionar guardrail anti-RCE (bundled-only) e SI-4 origin-aware; `supersedes` da v1.0.0.
- [ ] **Test (GREEN):** audit PASSED + grafo de ADRs coerente.
**Tests:** ADR audit (S1–S12).

## Task Group 8 — E2E + regressão completa
**Agent:** test-writer
**Handoff from:** todas
- [ ] **Test:** E2E num projeto-fixture SEM eject → editar arquivo violador → hook reporta violação de default. Project override → vence projeto.
- [ ] **Test:** suíte completa `node --test tests/**/test-*.mjs` verde (exceto as 2 de rede pré-existentes).
**Tests:** E2E + suíte total.

## Task Group 9 — Docs
**Agent:** documentation-writer
**Handoff from:** TG7
- [ ] Atualizar `references/post-update-guide.md` (defaults agora enforçáveis) + `CHANGELOG.md` + bump de versão (hook auto-bump cobre `scripts/ hooks/`).
- [ ] **Test:** lint de docs / links.
**Tests:** docs.

---

## Emendas da Review (R-phase) — architect + security-auditor

**Bloqueantes (integração — sem elas o "enforçar sem eject" não funciona):**
- **R1 (A2) → TG3:** relaxar o gate `[ -d .context/standards ]` em `hooks/post-tool-use:142` — o bloco de linter deve rodar quando `PLUGIN_ROOT` está setado e o arquivo editado existe, mesmo sem `.context/standards`. RED: teste shell de linter rodando SEM `.context/standards`.
- **R2 (A3) → TG3:** o hook exporta/passa o plugin root ao CLI; assert que `pluginRoot` chega não-`undefined` em `loadStandardsMerged` (senão é no-op silencioso).

**Contratos de segurança (fixar por teste — S1–S8):**
- **R3 (S1) → TG1:** `origin` é provençª carimbada pelo loader (enum fechado `{project,default}`); `resolveAndCheckSandbox` fail-closed em qualquer outro valor; NUNCA ler `fm.origin`. Teste: std em `.context` com `origin: default` injetado no frontmatter é IGNORADO (resolve em `.context`).
- **R4 (S2) → TG1:** manter `validateLinterPath` como gate #1 (inalterado); branch default: base `resolve(pluginRoot,"assets","standards")`, allowlist root `.../machine`; mesma lógica startsWith + realpath.
- **R5 (S3) → TG3:** trust-anchor do `pluginRoot` — preferir `--plugin=<path>` derivado do hook (`BASH_SOURCE`) sobre o env `CLAUDE_PLUGIN_ROOT` (envenenável → RCE); verificar marker do plugin (ex.: `.claude-plugin/plugin.json`) antes de habilitar o branch default; degradar para project-only se não-verificado.
- **R6 (S4) → TG5:** teste do fetch contra MANIFEST/upstream hostil (`std-evil.js`, `../machine/x.js`, `.md`+`.js` misturados) → assert ZERO `.js` gravado em qualquer lugar E `assets/standards/machine/` byte-idêntico antes/depois.
- **R7 (S5) → TG1:** guarda realpath de symlink replicada para o root `machine/` do plugin; caso (d) mira o root do plugin especificamente.
- **R8 (S6) → TG7:** ADR-007 v2.0.0 documenta o invariante TCB (`assets/standards/machine/*.js` é plugin-shipped, nunca fetchado, nunca gravável pós-install); teste release-time: todo `enforcement.linter` default resolve para arquivo existente sob `assets/standards/machine/` (sem ref pendurada).
- **R9 (S7) → TG1:** fail-closed quando `origin==="default"` mas `pluginRoot` ausente/não-verificado — sem fallback para a base `.context` (caso (e) reforçado: nem executa nem resolve em `.context`).
- **R10 (S8) → TG3:** passar `--plugin` como token argv distinto (`--plugin="${PLUGIN_ROOT}"`), nunca concatenar em `node -e` (preserva SI-1).

**Qualidade:**
- **R11 (A1) → TG2:** reconciliar `readStandardsFromDir` (usado pelo merged) com `loadStandards` — o merged NÃO roda `validateSubset` nem computa `weak`. Decidir o contrato (adicionar validação OU documentar que o runner tolera) e fixar por teste.
- **R12 (A4) → TG1/TG2:** centralizar a base do plugin (`<pluginRoot>/assets/standards` + `/machine`) num helper único em `context-paths.mjs` (`pluginStandardsPaths`), espelhando o padrão `contextPaths`.
- **R13 (A7) → novo TG (perf):** o loop de `execFile` em `runLintersFor` é serial; ~7 defaults × cold-start node ≈ centenas de ms por Edit em `applyTo` largo. Limitar nº de defaults e/ou paralelizar; medir contra o budget V.4 da ADR-002.
- **R14 (A9) → TG4:** barra de falso-positivo explícita como gate de aceite — cada linter default: (i) pré-filtra por `applyTo` realista, (ii) ship "snippet conforme não dispara", (iii) sign-off do security-auditor na conservadorismo da regex. Reavaliar `observability` (console.log é legítimo em CLI/tooling — inclusive ESTE repo), `performance` (`SELECT *` casa string/comentário), `runtime-validation` (`z.any()` só faz sentido em projeto Zod).
- **R15 (A10) → TG6:** `eject --with-linter` grava no caminho canônico `engineering/standards/machine/` e religa `enforcement.linter` batendo o allowlist project do SI-4 (não o legacy `standards/machine`).
- **R16 (A5) → TG4/TG8:** GREEN do TG4 injeta `pluginRoot` no nível unit; o E2E "no-eject" real vive no TG8 após o wiring do TG3.
- **R17 (A6) → spec OUT (ou TG futuro):** `edit-nudge.mjs` (Camada 2) ainda usa `loadStandards` project-only — projeto em defaults puros ganha enforcement mas não o nudge. Decisão: deferir explicitamente (OUT) nesta entrega.

**Veredito da Review:** architect REVISE (R1–R2 bloqueantes) + security PROCEED condicionado a S1–S8. Plano atualizado com R1–R17 dobrados nos TGs. Re-confirmar antes de E (gate require_approval).

## Ordenação test-first (Step 5.5)
Todo task group começa com **Test (RED)** antes da implementação. Tipos declarados por grupo (unit/segurança/integração/E2E/shell/ADR-audit). TG de segurança (1, 4, 5) levam revisão do security-auditor.
