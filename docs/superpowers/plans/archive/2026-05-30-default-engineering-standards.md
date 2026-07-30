# Biblioteca de Standards Default de Engenharia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

> **Spec:** `docs/superpowers/specs/2026-05-30-default-engineering-standards-design.md` · **Branch:** `feat/default-engineering-standards` · **Escala:** MEDIUM · **Fase:** P→R

**Goal:** Shippar uma biblioteca curada de standards default de engenharia (concern-first, warn-only), vendorizada no plugin (`assets/standards/`) e atualizável ao vivo via fetch https, carregada just-in-time pelo motor existente, com override/eject por projeto.

**Architecture:** Defaults como `std-*.md` (prosa + frontmatter, `enforcement.linter: null`, `source: devflow-default`) em `<plugin>/assets/standards/`. O `standards-loader` passa a fazer merge de 2 fontes (plugin-defaults + projeto, projeto vence por `id`, `disable` via `standards.local.yaml`). `standards-builder` ganha modo EJECT. `/devflow update` ganha Step 4d (fetch do repo standalone). Tudo concern-first (ADR-002); warn-only não toca SI-4.

**Tech Stack:** Node ESM (`node:*` only), Markdown + YAML (frontmatter.mjs), POSIX shell. Reusa `standards-loader.mjs`, `context-paths.mjs`, `taxonomy-loader.mjs`, `update-external-skill.sh`.

**Agents:** devops-specialist (libs/scripts/content), documentation-writer (standards prose/ADR/README), test-writer (suites), code-reviewer/security-auditor (V).

---

## Revisões da fase R (incorporadas — ler junto com as tasks citadas)

Review multi-agente (architect + security-auditor) na fase R produziu estas emendas **obrigatórias** ao plano. O executor aplica cada uma na task indicada.

- **R1 (T4 — bloqueante):** `.context/standards.local.yaml` é YAML **bare** (sem fences `---`) → `frontmatter.mjs` NÃO serve. Implementar um reader dedicado linha-a-linha para o array `disable: [...]` (ou `disable:\n  - x`). Adicionar key `standardsLocalYaml` em `scripts/lib/context-paths.mjs` (resolve `.context/standards.local.yaml`, deliberadamente fora de `engineering/` por ser config de usuário). Adicionar teste isolado do reader.
- **R2 (T7 — bloqueante):** ponto de wiring concreto = `scripts/lib/context-index.mjs` (`collectStandards`, ~linha 42) passa a chamar `loadStandardsMerged(projectRoot, pluginRoot)`; `scripts/lib/context-index-cli.mjs` aceita `--plugin=<path>` e repassa; o `hooks/session-start` (~linha 234) só dispara o índice quando existe `.context/standards` ou `.context/stacks/manifest.yaml` — **adicionar condição:** disparar também quando `CLAUDE_PLUGIN_ROOT` setado e `<plugin>/assets/standards/` existe (senão projeto sem std-local nunca vê os defaults). Teste shell cobrindo o caso "projeto sem std-local + defaults do plugin no índice".
- **R3 (T6 — alto):** antes de buscar os ~20 arquivos, `update-default-standards.sh` faz `curl -fsSI` (HEAD) no `MANIFEST.txt` remoto; se falhar (404/rede), emite **uma** linha `[devflow] standards repo not yet live — using bundled snapshot` no stderr e `exit 0` (não tenta os 20). Base URL **hardcoded** (`https://raw.githubusercontent.com/NEXUZ-SYS/devflow-standards/`); rejeitar override. Teste do caminho "repo offline".
- **R4 (T6 — HIGH security):** validar cada linha lida do `MANIFEST.txt` contra `^std-[a-z][a-z0-9-]+\.md$`; usar só o `basename` validado para montar o path de escrita (nunca a linha crua). Anti path-traversal/supply-chain.
- **R5 (T5 — MED security):** `eject <id>` valida `<id>` contra `^[a-z][a-z0-9-]*$` (mesmo do `cmdNew`) + `assertWithinDir(src, <plugin>/assets/standards)` e `assertWithinDir(dest, contextPaths(project).standards)` antes de ler/escrever (padrão de `scripts/devflow-knowledge.mjs`).
- **R6 (T6/T8 — MED security):** corpos buscados são injetados no contexto do agente (Stage-2) → aplicar strip SI-6 (`scripts/lib/sanitize-snippet.mjs`: role markers + "ignore previous instructions") em cada corpo antes de escrever em `assets/standards/`. Registrar a decisão de trust-boundary (first-party repo + sanitização defense-in-depth) na ADR-007.
- **R7 (T4 — LOW security):** `loadStandardsMerged` faz `realpathSync` + containment (resolvido fica dentro do dir-fonte) antes de ler cada `.md` — anti symlink-escape, espelhando o SI-4 de `run-linter.mjs`.
- **R8 (T7 — feasibility):** corrigir ordem TDD — escrever o teste (RED) ANTES de tocar `context-index.mjs`.
- **R9 (T4 — feasibility):** adicionar teste do fallback `loadStandardsMerged(root)` (sem 2º arg) lendo de `CLAUDE_PLUGIN_ROOT` — é o codepath de produção (hook).
- **R10 (T2 — feasibility):** o assert "sem `<!-- TODO`" é invariante **estrutural** (placeholder de scaffold), não content-check de prosa — manter, rotular como estrutural (ver memória `feedback_tdd_always`).
- **R11 (T8 — feasibility):** ADR-007 — rodar `adr-audit.mjs` como step de teste (assert exit 0 / Gate PASSED), não verificação manual.

---

## Convenções
- pt-BR na prosa; identificadores/código em inglês.
- TDD: RED→GREEN→REFACTOR. Testes reais; fixtures tmpdir; nunca mutar dir versionado in-place.
- ⛔ Subagents: só `git add` + `git commit` na branch atual. **Nunca** `gh`/PR/push/merge/switch.
- Pre-commit hook pode auto-bumpar versão (esperado).

---

## File Structure (inventário)

### CRIAR
```
assets/standards/                              snapshot vendorizado dos defaults
  std-security.md  std-runtime-validation.md  std-error-handling.md
  std-observability.md  std-performance.md  std-test-discipline.md
  std-documentation.md  std-code-review.md  std-grounding.md
  std-naming-conventions.md  std-migration.md  std-data-modeling.md
  std-api-conventions.md  std-secret-conventions.md  std-schemas.md
  std-commit-hygiene.md
  std-accessibility.md  std-internationalization.md  std-caching.md  std-state-management.md
assets/standards/MANIFEST.txt                  lista dos std default (para o fetch/update)
scripts/update-default-standards.sh            fetch dos defaults do repo standalone (irmão do update-external-skill.sh)
tests/validation/test-default-standards-content.mjs    structural gate dos defaults
tests/validation/test-standards-loader-merge.mjs       merge 2 fontes + origin + disable
tests/scripts/test-standards-eject.mjs                 eject copia default → projeto
tests/scripts/test-update-default-standards.sh         fetch (mock) refresca snapshot
.context/adrs/... (na verdade .context/engineering/adrs/) 007-default-standards-library-v1.0.0.md
```

### MODIFICAR
```
scripts/lib/standards-loader.mjs               merge plugin-defaults + projeto + disable + origin
skills/standards-builder/SKILL.md              modo EJECT (Step E1-E3)
scripts/devflow-standards.mjs                  subcomando `eject`
skills/standards-builder/references/taxonomy-of-concerns.yaml   concerns novos (security, performance, documentation, grounding, migration, data-modeling, schemas, accessibility, i18n, caching, state-management, code-review)
commands/devflow.md                            /devflow update Step 4d + /devflow standards eject routing
skills/project-init/SKILL.md                   mencionar defaults disponíveis (não copia; warn-only via loader)
README.md  CHANGELOG.md                        documentar a biblioteca
```

---

## Phase 0 — Pre-flight

- [ ] **PF.1:** Confirmar branch `feat/default-engineering-standards` (`git branch --show-current`).
- [ ] **PF.2:** Baseline de testes (contar PASS/FAIL atual). Registrar.
- [ ] **PF.3:** Confirmar libs: `scripts/lib/standards-loader.mjs`, `scripts/lib/context-paths.mjs`, `scripts/lib/taxonomy-loader.mjs`, `scripts/update-external-skill.sh` existem.

---

## Phase 1 — Expansão da taxonomia de concerns

**Objetivo:** registrar os concerns dos defaults que ainda não existem (concern-first, ADR-002). Já existem: runtime-validation, error-handling, test-discipline, observability-spans, naming-conventions, api-conventions, secret-conventions, commit-hygiene, layer-boundaries, domain-events.

### Task 1: novos concerns na taxonomia

**Files:**
- Modify: `skills/standards-builder/references/taxonomy-of-concerns.yaml`
- Test: `tests/validation/test-taxonomy-default-standards.mjs`

- [ ] **Step 1: Teste que falha** — assert que a taxonomia contém os ids dos concerns dos defaults universais/condicionais:

```javascript
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const Y = readFileSync("skills/standards-builder/references/taxonomy-of-concerns.yaml", "utf-8");
const REQUIRED = [
  "security","performance","documentation","grounding","migration",
  "data-modeling","schemas","code-review",
  "accessibility","internationalization","caching","state-management",
];
test("taxonomia cobre os concerns dos standards default", () => {
  for (const id of REQUIRED) assert.match(Y, new RegExp(`id: ${id}\\b`), `falta concern: ${id}`);
});
```

- [ ] **Step 2: Rodar; falhar.** `node --test tests/validation/test-taxonomy-default-standards.mjs`
- [ ] **Step 3: Adicionar as 12 entries** ao `taxonomy-of-concerns.yaml`, no shape existente (id, summary, category, defaultApplyTo, inverseHints, principleTemplate, antiPatternTemplate, linterHints). Categorias: `security`→seguranca, `performance`→performance, `documentation`→docs, `grounding`→qualidade, `migration`→data, `data-modeling`→data, `schemas`→contracts, `code-review`→process, `accessibility`→ui, `internationalization`→ui, `caching`→performance, `state-management`→frontend. defaultApplyTo dos condicionais (accessibility/i18n/state) estreito (`src/**/*.{tsx,jsx}`); caching broad-ish.
- [ ] **Step 4: Rodar; passar.**
- [ ] **Step 5: Commit** — `feat(standards): taxonomia cobre os concerns dos standards default`.

---

## Phase 2 — Conteúdo dos defaults (snapshot vendorizado)

**Objetivo:** os ~20 `std-*.md` em `assets/standards/`, concern-first, warn-only. O **structural gate** (Task 2) é a spec real do conteúdo; a prosa é portada das rules/contracts DDC (`framework_ddc/.contexts/engineering/rules|contracts/`).

### Task 2: structural gate dos defaults (escrever ANTES do conteúdo)

**Files:**
- Create: `tests/validation/test-default-standards-content.mjs`

- [ ] **Step 1: Escrever o gate** (RED — `assets/standards/` ainda vazio):

```javascript
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const DIR = "assets/standards";
const UNIVERSAL = ["std-security","std-runtime-validation","std-error-handling","std-test-discipline",
  "std-observability","std-performance","std-documentation","std-code-review","std-grounding",
  "std-naming-conventions","std-migration","std-data-modeling","std-api-conventions",
  "std-secret-conventions","std-schemas","std-commit-hygiene"];
const CONDITIONAL = ["std-accessibility","std-internationalization","std-caching","std-state-management"];

test("todos os defaults universais + condicionais existem", () => {
  for (const id of [...UNIVERSAL, ...CONDITIONAL])
    assert.ok(existsSync(join(DIR, `${id}.md`)), `falta ${id}.md`);
});

test("cada default é concern-first, warn-only, frontmatter completo", () => {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
    const { data, body } = parseFrontmatter(readFileSync(join(DIR, f), "utf-8"));
    assert.ok(data.id?.startsWith("std-"), `${f}: id deve começar com std-`);
    assert.ok(!/^std-(zod|postgres|firebase|react|next|express)\b/.test(data.id), `${f}: id lib-centric (ADR-002 S7)`);
    assert.equal(data.source, "devflow-default", `${f}: source deve ser devflow-default`);
    assert.equal(data.enforcement?.linter ?? null, null, `${f}: default é warn-only (linter null)`);
    assert.ok(Array.isArray(data.applyTo) && data.applyTo.length, `${f}: applyTo obrigatório`);
    assert.ok(data.description && data.version, `${f}: description+version obrigatórios`);
    assert.ok(/## Princípios|## Anti-patterns/.test(body), `${f}: corpo sem seções`);
    assert.doesNotMatch(body, /<!--\s*TODO/i, `${f}: placeholder TODO presente`);
  }
});

test("NÃO há contracts DB-específicos nos defaults", () => {
  for (const bad of ["std-postgres","std-pgvector","std-bigquery","std-firebase-firestore"])
    assert.ok(!existsSync(join(DIR, `${bad}.md`)), `${bad} não deveria ser default (vai pro stacks)`);
});
```

- [ ] **Step 2: Rodar; falhar** (dir vazio).
- [ ] **Step 3: Commit do gate** — `test(standards): structural gate dos defaults (RED)`.

### Task 3: portar as rules/contracts DDC → defaults

**Files:**
- Create: os 20 `assets/standards/std-*.md` + `assets/standards/MANIFEST.txt`

- [ ] **Step 1: Para cada default**, criar `assets/standards/std-<id>.md` portando a prosa da rule/contract DDC correspondente (`framework_ddc/.contexts/engineering/rules/<x>.md` ou `contracts/<x>.md`), no formato:
```markdown
---
id: std-<concern>
description: <1 linha>
version: 1.0.0
source: devflow-default
applyTo: [<globs do tier>]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
weakStandardWarning: true
---
## Princípios
<imperativo, portado da rule DDC>
## Anti-patterns
| Errado | Corrija para |
| … | … |
```
Mapa de origem: `std-security`←rules/security, `std-runtime-validation`←rules/validation, `std-error-handling`←rules/error-handling, `std-observability`←rules/observability, `std-performance`←rules/performance, `std-test-discipline`←rules/testing, `std-documentation`←rules/documentation, `std-code-review`←rules/code-review, `std-grounding`←rules/grounding, `std-naming-conventions`←rules/development(naming), `std-migration`←rules/migration, `std-data-modeling`←rules/data-modeling, `std-api-conventions`←contracts/api+rules/api-design, `std-secret-conventions`←contracts/secrets, `std-schemas`←contracts/schemas, `std-commit-hygiene`←(commits), `std-accessibility`←rules/accessibility, `std-internationalization`←rules/internationalization, `std-caching`←rules/caching, `std-state-management`←rules/state-management. `applyTo`: universais broad (`["**/*.{ts,tsx,js,jsx,py,go}"]`); condicionais estreito (a11y/state `["**/*.{tsx,jsx}"]`, i18n idem, caching `["src/**/*.{ts,tsx}"]`).
- [ ] **Step 2: `MANIFEST.txt`** = uma linha por `std-*.md` (usado pelo fetch da Phase 5).
- [ ] **Step 3: Rodar o gate (Task 2); 3/3 PASS.**
- [ ] **Step 4: Commit** — `feat(standards): biblioteca default vendorizada (16 universais + 4 condicionais, warn-only)`.

---

## Phase 3 — standards-loader: merge 2 fontes

### Task 4: loader lê plugin-defaults + projeto (origin + disable)

**Files:**
- Modify: `scripts/lib/standards-loader.mjs`
- Test: `tests/validation/test-standards-loader-merge.mjs`

- [ ] **Step 1: Teste que falha:**

```javascript
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadStandardsMerged } from "../../scripts/lib/standards-loader.mjs";

function std(id, extra = "") { return `---\nid: ${id}\ndescription: ${id}\nversion: 1.0.0\napplyTo: ["**/*.ts"]\nsource: ${extra || "devflow-default"}\nenforcement:\n  linter: null\n---\n## Princípios\nx\n`; }

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "std-merge-"));
  const plugin = mkdtempSync(join(tmpdir(), "std-plugin-"));
  mkdirSync(join(plugin, "assets", "standards"), { recursive: true });
  mkdirSync(join(root, ".context", "engineering", "standards"), { recursive: true });
  writeFileSync(join(plugin, "assets", "standards", "std-security.md"), std("std-security"));
  writeFileSync(join(plugin, "assets", "standards", "std-caching.md"), std("std-caching"));
  return { root, plugin, cleanup: () => { rmSync(root, {recursive:true,force:true}); rmSync(plugin,{recursive:true,force:true}); } };
}

test("merge: defaults do plugin aparecem com origin=default", () => {
  const { root, plugin, cleanup } = fixture();
  const list = loadStandardsMerged(root, plugin);
  const sec = list.find((s) => s.id === "std-security");
  assert.equal(sec.origin, "default");
  cleanup();
});

test("merge: projeto sobrescreve default por id (origin=project)", () => {
  const { root, plugin, cleanup } = fixture();
  writeFileSync(join(root, ".context", "engineering", "standards", "std-security.md"), std("std-security", "project-override"));
  const list = loadStandardsMerged(root, plugin);
  const sec = list.find((s) => s.id === "std-security");
  assert.equal(sec.origin, "project");
  assert.equal(list.filter((s) => s.id === "std-security").length, 1);
  cleanup();
});

test("merge: disable em standards.local.yaml remove o default", () => {
  const { root, plugin, cleanup } = fixture();
  writeFileSync(join(root, ".context", "standards.local.yaml"), "disable:\n  - std-caching\n");
  const list = loadStandardsMerged(root, plugin);
  assert.ok(!list.find((s) => s.id === "std-caching"), "std-caching deveria estar desabilitado");
  cleanup();
});
```

- [ ] **Step 2: Rodar; falhar.**
- [ ] **Step 3: Implementar `loadStandardsMerged(projectRoot, pluginRoot)`** em `standards-loader.mjs`: ler `<pluginRoot>/assets/standards/*.md` (origin default) + `contextPaths(projectRoot).standards/*.md` (origin project); merge por `id` (project vence); ler `disable: []` de `<projectRoot>/.context/standards.local.yaml` (parser YAML-subset existente) e filtrar. Manter a função `loadStandards` existente (compat) — `loadStandardsMerged` é aditiva. `pluginRoot` default = `process.env.CLAUDE_PLUGIN_ROOT`.
- [ ] **Step 4: Rodar; 3/3 PASS. Rodar suíte standards-loader existente (sem regressão).**
- [ ] **Step 5: Commit** — `feat(standards): loader faz merge plugin-defaults + projeto (origin + disable)`.

---

## Phase 4 — Eject

### Task 5: `/devflow standards eject <id>`

**Files:**
- Modify: `scripts/devflow-standards.mjs` (subcomando `eject`)
- Modify: `skills/standards-builder/SKILL.md` (modo EJECT)
- Test: `tests/scripts/test-standards-eject.mjs`

- [ ] **Step 1: Teste smoke que falha:**

```javascript
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const SCRIPT = join(process.cwd(), "scripts", "devflow-standards.mjs");
const PLUGIN = process.cwd(); // o próprio repo tem assets/standards/

test("eject copia default → projeto", () => {
  const root = mkdtempSync(join(tmpdir(), "eject-"));
  execFileSync("node", [SCRIPT, "eject", "std-security", `--project=${root}`], { stdio: "pipe", env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN } });
  const out = join(root, ".context", "engineering", "standards", "std-security.md");
  assert.ok(existsSync(out));
  assert.match(readFileSync(out, "utf-8"), /id: std-security/);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Rodar; falhar.**
- [ ] **Step 3: Implementar `eject`** em `devflow-standards.mjs`: resolve `<pluginRoot>/assets/standards/std-<id>.md`; se ausente, erro+exit 1; copia para `<contextPaths(project).standards>/std-<id>.md` (mkdir -p); recusa overwrite sem `--force`; imprime o path. Só `node:*`.
- [ ] **Step 4: Doc — `skills/standards-builder/SKILL.md`** ganha seção "Modo EJECT" (E1 resolver id, E2 copiar, E3 sugerir adicionar linter em machine/).
- [ ] **Step 5: Rodar; PASS. Commit** — `feat(standards): modo eject (copia default → projeto p/ customizar)`.

---

## Phase 5 — Update ao vivo (fetch dos defaults)

### Task 6: `scripts/update-default-standards.sh` + `/devflow update` Step 4d

**Files:**
- Create: `scripts/update-default-standards.sh`
- Test: `tests/scripts/test-update-default-standards.sh`
- Modify: `commands/devflow.md` (Step 4d) + routing `standards eject`

- [ ] **Step 1: Teste shell que falha** — mock do fetch (servir arquivos de um dir local file:// ou um fake curl) atualizando `assets/standards/` numa cópia tmpdir; assert que um std novo aparece e que falha de rede é no-op fail-safe (exit 0). Espelhar o teste do `update-external-skill.sh` (`tests/hooks/` ou `tests/scripts/`).
- [ ] **Step 2: Rodar; falhar.**
- [ ] **Step 3: Implementar `update-default-standards.sh`** — irmão do `update-external-skill.sh`: lê `assets/standards/MANIFEST.txt`, para cada std faz fetch de `https://raw.githubusercontent.com/NEXUZ-SYS/devflow-standards/main/std-<id>.md` (validação de URL https, escrita atômica, fail-safe `exit 0` em erro de rede — offline mantém o snapshot). Reusar helpers do `update-external-skill.sh`.
- [ ] **Step 4: `commands/devflow.md`** — adicionar **Step 4d** na seção `/devflow update` (chama `update-default-standards.sh`) e routing de `standards eject`.
- [ ] **Step 5: Rodar; PASS. Commit** — `feat(update): Step 4d refresca standards default via fetch https (à la napkin)`.

---

## Phase 6 — Wiring no índice/filtro

### Task 7: defaults entram no Stage-1/Stage-2

**Files:**
- Modify: `scripts/lib/standards-loader.mjs` (consumidores usam `loadStandardsMerged`) e/ou o helper de índice de standards usado pelos hooks
- Modify: `skills/project-init/SKILL.md` (nota sobre defaults disponíveis)

- [ ] **Step 1:** Identificar onde os hooks (session-start/pre-tool-use) ou o `knowledge-filter`/standards loader montam o índice de standards. Trocar a chamada de `loadStandards` por `loadStandardsMerged` (passando `CLAUDE_PLUGIN_ROOT`) para que os defaults apareçam no índice com `[default]`.
- [ ] **Step 2: Teste** — fixture com projeto vazio + plugin com defaults: o índice de standards inclui os defaults marcados `origin: default`; editar `src/x.ts` injeta os de `applyTo` broad; `README.md` injeta nenhum. (shell, espelhando os testes de wiring existentes.)
- [ ] **Step 3:** `project-init` ganha nota: "standards default já disponíveis via plugin (warn-only); use `/devflow standards eject <id>` para customizar". NÃO copia arquivos.
- [ ] **Step 4: Rodar; PASS + suíte de hooks sem regressão. Commit** — `feat(standards): defaults entram no índice/filtro just-in-time`.

---

## Phase 7 — ADR-007

### Task 8: registrar a decisão

**Files:**
- Create: `.context/engineering/adrs/007-default-standards-library-v1.0.0.md`

- [ ] **Step 1:** Criar ADR-007 (template canônico; ler `assets/TEMPLATE-ADR.md` + um ADR existente). Decisão: biblioteca de standards default plugin-bundled (snapshot vendorizado) + fetch https (não submodule), warn-only com linter opt-in, eject-to-customize, escopo tiered. **≥2 alternativas:** submodule (rejeitado — quebra install) vs scaffold-on-init (rejeitado — drift/noise) vs plugin-bundled+fetch (escolhido); warn-only vs linter-bundlado (rejeitado — complica SI-4). **Guardrails:** SEMPRE concern-first; NUNCA linter executável bundlado no plugin; QUANDO customizar ENTÃO eject. **Enforcement:** structural gate `test-default-standards-content.mjs`; audit S7. `refines: []` (ou referência a ADR-002).
- [ ] **Step 2:** `adr-update-index.mjs` + `adr-audit.mjs 007` → PASSED.
- [ ] **Step 3: Commit** — `docs(adr): ADR-007 biblioteca de standards default`.

---

## Phase 8 — Verificação final + docs

### Task 9: README/CHANGELOG + suíte

- [ ] **Step 1:** README — seção "Standards default" (biblioteca warn-only, sempre disponível, eject, update ao vivo). CHANGELOG — entrada da versão.
- [ ] **Step 2:** Suíte completa: `FAIL` ≤ baseline; novos testes verdes.
- [ ] **Step 3:** Smoke real: `node scripts/devflow-standards.mjs eject std-security --project=<tmp>` com `CLAUDE_PLUGIN_ROOT=.` → copia. `loadStandardsMerged(.,.)` lista os 20 defaults.
- [ ] **Step 4: Commit final.** Finalização (push/PR/merge) só na fase C, com autorização.

---

## Self-Review (cobertura do spec)

| Requisito do spec | Task |
|---|---|
| §3 loader 2 fontes + origin + disable | Task 4 |
| §4 escopo tiered (16+4, exclui DB) | Task 2 (gate) + Task 3 (conteúdo) |
| §5 warn-only (linter null) | Task 2 gate + Task 3 |
| §6 just-in-time index/filtro | Task 7 |
| §7 eject/override/disable | Task 4 (disable) + Task 5 (eject) |
| §8 update ao vivo (fetch) | Task 6 |
| §9 taxonomia expandida | Task 1 |
| §9 ADR-007 | Task 8 |
| §10 concern-first / SI-4 untouched | Task 2 (S7-like gate) + warn-only |

Lacunas aceitas: o repo standalone `devflow-standards` no GitHub é criado fora deste plano (o snapshot em `assets/standards/` é autoritativo até o repo existir; o fetch aponta para ele quando criado). Refino editorial das ~20 prosas é incremental (o structural gate garante forma).
