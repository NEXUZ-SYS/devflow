# Materialização dos Standards default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** `standards-materialize-on-init` | **Scale:** MEDIUM | **Phase:** P→R
> **Base:** `main` @ v3.3.0 (a version-scoped já entrou; ver "Estado da base")

**Goal:** Os standards default aplicáveis passam a existir como arquivos dentro de `.context/engineering/standards/` — `.md` **e** `machine/*.js` — visíveis em git, editáveis por projeto, funcionais sem o plugin, e atualizáveis sem drift.

**Architecture:** O motor já existe: `provenance-sync` decide `add|current|untouched|edited` por hash. Esta feature remove a exclusão `std-*.md raiz` do seu escopo, acrescentando (a) um resolvedor que decide **o que** materializar por caminho real do repo e (b) suporte a `transform` no `applySync`, porque a cópia do `.md` precisa reescrever `enforcement.linter` e portanto **não é verbatim**.

**Tech Stack:** Node ESM puro (`node:*` apenas — Dependency Policy), `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-02-standards-materialize-on-init-design.md`

**Agents:** `backend-specialist` (resolvedor, provenance-sync), `devops-specialist` (fiação de init/sync/rotina), `test-writer` (fixtures), `security-auditor` (origem dos linters, registry de hashes).

## Global Constraints

- **Apenas `node:*`.** Nenhuma dependência npm nova.
- **`enforcement.linter` NUNCA vira `null` na materialização.** 20 dos 26 defaults têm linter bundlado e rodam hoje sem eject; `null` seria downgrade silencioso. É o motivo de o `eject` simples **não** servir aqui (`devflow-standards.mjs` grava `linter: null`).
- **O hash de procedência é computado sobre os bytes TRANSFORMADOS**, nunca sobre os de origem — hash da origem classificaria todo projeto como `edited` na 1ª passada e congelaria o sync.
- **O live-merge NÃO é removido.** Continua ativo: é ele que faz um default novo do plugin valer imediatamente, antes de a materialização convergir. O merge por id (projeto vence) faz a cópia sombrear o bundlado sem mudança no loader.
- **NUNCA fetchar `machine/*.js` da rede.** A materialização copia do bundle **local**; o guardrail anti-RCE da ADR-007 (fetch só de `.md`) permanece literal.
- **Honrar `standards.local.yaml` `disable:`** — id desabilitado não é materializado nem re-materializado.
- **Standard de perfil NÃO passa por esta via** — perfis seguem o ADR-008 (`resolveArtifacts`).
- **Seleção por caminho real**, nunca por extensão sintetizada: 3 defaults têm prefixo `src/**` (`std-caching`, `std-layer-boundaries` são `src/**/*.{ts,tsx}`; `std-domain-events` é `src/**/*.ts`).
- **SI-4** vale para todo linter; **SI-5** para todo glob.

```yaml
requiredSignals: [lint, unit, integration]
```

E2E não é exigido: a feature não toca auth, pagamentos, fluxo de usuário nem o finish/PR. `lint` é obrigatório por D6 do ADR-013.

---

## Estado da base (verificado na v3.3.0, não presumido)

A spec foi escrita **antes** da version-scoped entrar. O que mudou e importa aqui:

| Ponto | Estado na v3.3.0 | Efeito neste plano |
|---|---|---|
| `findApplicableStandards` | agora é `(filePath, standards, ctx = {})` | O resolvedor **não** usa essa função (ela filtra por `applyTo` **e** faixa de versão). Usa `matchGlob` direto — mesmo predicado de path, sem o eixo de versão, que aqui é irrelevante. |
| `resolveArtifacts` | `({projectRoot, pluginRoot, baseSkills})` — inalterada | Ponto de extensão continua válido. |
| `applySync` | `hashFile(src)` na linha 136, `copyFileSync` na 144 | São exatamente as duas linhas que o `transform` altera. |
| `gen-known-hashes` | varre `skills/`, `assets/skills/profiles/`, `assets/standards/profiles/` + `release-scaffold` | `assets/standards/` (raiz) segue fora — a 3ª raiz é trabalho desta feature. |
| `project-init` Step 3c-5 | já delega stacks ao `reconcile`; linha 794 ainda diz "não precisam ser scaffoldados" | É o texto que a Task 7 substitui. |
| `provenance-sync` (cabeçalho) | ainda declara *"std-\*.md raiz (live-loaded) ficam fora"* | É a exclusão que esta feature remove. |
| `decideArtifact` | `projHash === pluginHash → current` vem **antes** do registry | Achado R1: num checkout CRLF, plugin e projeto têm os mesmos bytes, resolvem `current`, e o registry nem é consultado. Divergência de fim-de-linha degrada para `edited` (= preserva), nunca para sobrescrita. Pré-existente: vale igual para os artefatos verbatim de hoje. |
| `known-hashes.json` | 399 hashes | Achado R2: o acréscimo é **66** (26 crus + 20 transformados + 20 `.js`), não 72 — `retargetLinter` devolve o warn-only inalterado, e o `Set` deduplica. +17%. |

---

## File Structure

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `scripts/lib/standards-materialize.mjs` | **Criar.** Decide o que materializar; produz artefatos + `transform` | 2, 3 |
| `scripts/lib/provenance-sync.mjs` | **Modificar.** `transform` no `applySync`; artefatos do resolvedor | 4, 5 |
| `scripts/lib/gen-known-hashes.mjs` | **Modificar.** 3ª raiz de walk | 6 |
| `scripts/lib/devflow-config.mjs` | **Modificar.** `readStandardsMaterialize` | 7 |
| `skills/project-init/SKILL.md`, `skills/context-sync/SKILL.md` | **Modificar.** Chamam a materialização | 8 |
| `templates/routines.json`, `.context/routines.json` | **Modificar.** Rotina `standards-materialize` | 8 |

---

## Task 1: Fixtures de projeto para a seleção

**Files:**
- Create: `tests/fixtures/standards-materialize/odoo-py/` (`.py`, `.js`, `.xml`, sem `src/`)
- Create: `tests/fixtures/standards-materialize/ts-src/` (`.ts` **dentro** de `src/`)
- Create: `tests/fixtures/standards-materialize/ts-nosrc/` (`.ts` **fora** de `src/`)
- Create: `tests/fixtures/standards-materialize/empty/` (só um `.md`)
- Test: `tests/integration/test-standards-materialize-fixtures.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: os quatro diretórios-fixture, consumidos por caminho literal nas Tasks 2, 3, 5 e 8.

`ts-nosrc` existe para provar a diferença entre casar caminho real e casar extensão: um projeto TypeScript **sem** `src/` não pode receber `std-caching`, `std-layer-boundaries` nem `std-domain-events`.

- [ ] **Step 1: Criar os quatro fixtures**

```bash
mkdir -p tests/fixtures/standards-materialize/{odoo-py/addons/m/{models,views,static},ts-src/src,ts-nosrc/lib,empty}

# odoo-py — Python + JS + XML, SEM src/
cat > tests/fixtures/standards-materialize/odoo-py/addons/m/models/model.py <<'PY'
from odoo import models


class M(models.Model):
    _name = "m"
PY
echo 'export const x = 1;' > tests/fixtures/standards-materialize/odoo-py/addons/m/static/app.js
echo '<odoo><record id="r" model="ir.ui.view"/></odoo>' > tests/fixtures/standards-materialize/odoo-py/addons/m/views/v.xml

# ts-src — TypeScript COM src/
echo 'export const x: number = 1;' > tests/fixtures/standards-materialize/ts-src/src/index.ts

# ts-nosrc — TypeScript SEM src/
echo 'export const x: number = 1;' > tests/fixtures/standards-materialize/ts-nosrc/lib/index.ts

# empty — nenhum arquivo de código
echo '# vazio' > tests/fixtures/standards-materialize/empty/README.md
```

- [ ] **Step 2: Escrever o teste que valida os fixtures**

```js
// tests/integration/test-standards-materialize-fixtures.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

const R = "tests/fixtures/standards-materialize";

test("odoo-py: tem .py, .js e .xml, e NÃO tem src/", () => {
  assert.ok(existsSync(join(R, "odoo-py/addons/m/models/model.py")));
  assert.ok(existsSync(join(R, "odoo-py/addons/m/static/app.js")));
  assert.ok(existsSync(join(R, "odoo-py/addons/m/views/v.xml")));
  assert.ok(!existsSync(join(R, "odoo-py/src")), "o fixture não pode ter src/");
});

test("ts-src: .ts DENTRO de src/", () => {
  assert.ok(existsSync(join(R, "ts-src/src/index.ts")));
});

test("ts-nosrc: .ts FORA de src/ — prova caminho real vs extensão", () => {
  assert.ok(existsSync(join(R, "ts-nosrc/lib/index.ts")));
  assert.ok(!existsSync(join(R, "ts-nosrc/src")), "não pode ter src/");
});

test("empty: nenhum arquivo de código", () => {
  assert.ok(existsSync(join(R, "empty/README.md")));
  assert.ok(!existsSync(join(R, "empty/src")));
});
```

- [ ] **Step 3: Rodar**

Run: `node --test tests/integration/test-standards-materialize-fixtures.mjs`
Expected: PASS — 4/4.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/standards-materialize tests/integration/test-standards-materialize-fixtures.mjs
git commit -m "test(materialize): fixtures de projeto para a seleção por caminho real"
```

---

## Task 2: Seleção por caminho real

**Files:**
- Create: `scripts/lib/standards-materialize.mjs`
- Test: `tests/lib/test-standards-materialize.mjs`

**Interfaces:**
- Consumes: fixtures da Task 1.
- Produces:
  - `listProjectFiles(projectRoot) -> string[]` — caminhos relativos, `/` como separador, ignorando `.git/`, `node_modules/`, `dist/`, `build/`, `.venv/`, `__pycache__/` e dotdirs.
  - `selectDefaults({ projectRoot, pluginRoot }) -> Array<{id, mdSrc, jsSrc|null, hasLinter}>` — os defaults cujo `applyTo` casa com **algum** caminho real, já sem os ids em `standards.local.yaml disable:`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/lib/test-standards-materialize.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listProjectFiles, selectDefaults } from "../../scripts/lib/standards-materialize.mjs";

const PLUGIN = process.cwd();
const R = "tests/fixtures/standards-materialize";

test("listProjectFiles devolve caminhos relativos com / e ignora dotdirs", () => {
  const files = listProjectFiles(join(R, "odoo-py"));
  assert.ok(files.includes("addons/m/models/model.py"));
  assert.ok(files.every((f) => !f.startsWith(".")), "dotdirs ficam fora");
  assert.ok(files.every((f) => !f.includes("\\")), "separador normalizado para /");
});

test("odoo-py seleciona os stds de .py/.js/.xml e NENHUM dos src/**", () => {
  const ids = selectDefaults({ projectRoot: join(R, "odoo-py"), pluginRoot: PLUGIN }).map((s) => s.id);
  assert.ok(ids.includes("std-security"), "**/*.{...,py,go} casa .py");
  assert.ok(ids.includes("std-commit-hygiene"), "**/* casa qualquer arquivo");
  for (const srcOnly of ["std-caching", "std-layer-boundaries", "std-domain-events"]) {
    assert.ok(!ids.includes(srcOnly), `${srcOnly} é src/** — projeto sem src/ não recebe`);
  }
  assert.ok(!ids.includes("std-typescript-strict"), "sem .ts no projeto");
});

test("ts-src COM src/ recebe os stds de prefixo src/**", () => {
  const ids = selectDefaults({ projectRoot: join(R, "ts-src"), pluginRoot: PLUGIN }).map((s) => s.id);
  assert.ok(ids.includes("std-caching"));
  assert.ok(ids.includes("std-layer-boundaries"));
  assert.ok(ids.includes("std-domain-events"));
  assert.ok(ids.includes("std-typescript-strict"));
});

test("ts-nosrc NÃO recebe os src/** — caminho real, não extensão", () => {
  const ids = selectDefaults({ projectRoot: join(R, "ts-nosrc"), pluginRoot: PLUGIN }).map((s) => s.id);
  assert.ok(ids.includes("std-typescript-strict"), "**/*.{ts,tsx} casa lib/index.ts");
  for (const srcOnly of ["std-caching", "std-layer-boundaries", "std-domain-events"]) {
    assert.ok(!ids.includes(srcOnly), `${srcOnly} exige src/ de fato`);
  }
});

test("projeto sem arquivo de código seleciona só os applyTo **/*", () => {
  const ids = selectDefaults({ projectRoot: join(R, "empty"), pluginRoot: PLUGIN }).map((s) => s.id);
  assert.deepEqual(ids.sort(), ["std-commit-hygiene", "std-pre-commit-hygiene"],
    "só os dois de applyTo **/* casam um README.md");
});

test("listProjectFiles respeita o teto de arquivos", () => {
  const files = listProjectFiles(join(R, "odoo-py"), 2);
  assert.equal(files.length, 2, "o walk para no teto — pergunta booleana não precisa do repo inteiro");
});

test("standards.local.yaml disable: suprime o id", () => {
  const root = mkdtempSync(join(tmpdir(), "mat-disable-"));
  mkdirSync(join(root, ".context"), { recursive: true });
  writeFileSync(join(root, "a.py"), "x = 1\n");
  writeFileSync(join(root, ".context/standards.local.yaml"), "disable: [std-security]\n");
  const ids = selectDefaults({ projectRoot: root, pluginRoot: PLUGIN }).map((s) => s.id);
  assert.ok(!ids.includes("std-security"));
  assert.ok(ids.includes("std-commit-hygiene"), "os demais seguem");
  rmSync(root, { recursive: true });
});

test("cada selecionado traz mdSrc e, quando existe, jsSrc", () => {
  const sel = selectDefaults({ projectRoot: join(R, "ts-src"), pluginRoot: PLUGIN });
  const sec = sel.find((s) => s.id === "std-security");
  assert.match(sec.mdSrc, /assets\/standards\/std-security\.md$/);
  assert.match(sec.jsSrc, /assets\/standards\/machine\/std-security\.js$/);
  assert.equal(sec.hasLinter, true);
  const warn = sel.find((s) => s.id === "std-commit-hygiene");
  assert.equal(warn.jsSrc, null, "warn-only não tem machine/");
  assert.equal(warn.hasLinter, false);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/test-standards-materialize.mjs`
Expected: FAIL — `Cannot find module '.../standards-materialize.mjs'`.

- [ ] **Step 3: Implementar**

```js
// scripts/lib/standards-materialize.mjs
// Decide QUAIS standards default materializar no projeto.
//
// A seleção casa `applyTo` contra os CAMINHOS REAIS do repositório, não contra
// extensões sintetizadas: 3 defaults tem prefixo `src/**`, e um projeto
// TypeScript sem `src/` nao deve recebe-los. So o caminho real revela isso.
//
// NAO usa findApplicableStandards: aquela funcao filtra por applyTo E por faixa
// de versao (ctx.versions), e o eixo de versao e irrelevante aqui — defaults nao
// declaram faixa (check S8 do standard-audit reprova).
//
// Per Dependency Policy: pure node:*.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { matchGlob } from "./glob.mjs";
import { parseFrontmatter } from "./frontmatter.mjs";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", "coverage"]);
// Alinhado com os demais walks do repo (detect-framework usa 3,
// framework-version usa 6). 12 era arbitrario (achado R4 da fase R).
const MAX_DEPTH = 6;
// Teto de arquivos: a pergunta e BOOLEANA por padrao ("existe algum .ts sob
// src/?"), entao varrer um monorepo inteiro e desperdicio. Se o teto for
// atingido antes de um padrao casar, o std simplesmente NAO e materializado —
// o lado conservador (nao escreve).
const MAX_FILES = 20000;

export function listProjectFiles(projectRoot, limit = MAX_FILES) {
  const out = [];
  walk(projectRoot, "", out, 0, limit);
  return out;
}

function walk(root, sub, out, depth, limit) {
  if (depth > MAX_DEPTH || out.length >= limit) return;
  let entries;
  try { entries = readdirSync(join(root, sub), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (out.length >= limit) return;
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    if (e.isSymbolicLink()) continue;
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory()) walk(root, rel, out, depth + 1, limit);
    else if (e.isFile()) out.push(rel);
  }
}

// disable: do standards.local.yaml — mesma gramatica que o standards-loader le.
function disabledIds(projectRoot) {
  const p = join(projectRoot, ".context", "standards.local.yaml");
  if (!existsSync(p)) return new Set();
  let content;
  try { content = readFileSync(p, "utf-8"); } catch { return new Set(); }
  const inline = content.match(/^disable\s*:\s*\[([^\]]*)\]/m);
  if (inline) {
    return new Set(inline[1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean));
  }
  const block = content.match(/^disable\s*:\s*\n((?:[ \t]*-[ \t]+[^\n]+\n?)*)/m);
  if (block) {
    return new Set(block[1].split("\n")
      .map((l) => l.replace(/^[ \t]*-[ \t]+/, "").trim().replace(/['"]/g, ""))
      .filter(Boolean));
  }
  return new Set();
}

export function selectDefaults({ projectRoot, pluginRoot }) {
  const dir = join(pluginRoot, "assets", "standards");
  if (!existsSync(dir)) return [];
  const files = listProjectFiles(projectRoot).map((f) => f.split(sep).join("/"));
  const disabled = disabledIds(projectRoot);
  const selected = [];

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".md") || entry === "README.md") continue;
    let fm;
    try { fm = parseFrontmatter(readFileSync(join(dir, entry), "utf-8")).data || {}; } catch { continue; }
    if (!fm.id || fm.deprecated === true) continue;
    if (disabled.has(fm.id)) continue;

    // some() ja para no primeiro casamento: a pergunta e booleana, nao precisa
    // enumerar todos os arquivos que casam.
    const applyTo = Array.isArray(fm.applyTo) ? fm.applyTo : [];
    const matches = applyTo.some((pattern) =>
      files.some((f) => { try { return matchGlob(pattern, f); } catch { return false; } }),
    );
    if (!matches) continue;

    const jsSrc = join(dir, "machine", `${fm.id}.js`);
    const hasLinter = existsSync(jsSrc);
    selected.push({ id: fm.id, mdSrc: join(dir, entry), jsSrc: hasLinter ? jsSrc : null, hasLinter });
  }
  return selected;
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node --test tests/lib/test-standards-materialize.mjs`
Expected: PASS — 7/7.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/standards-materialize.mjs tests/lib/test-standards-materialize.mjs
git commit -m "feat(materialize): seleção dos defaults por caminho real do repositório"
```

---

## Task 3: O `transform` do `enforcement.linter`

**Files:**
- Modify: `scripts/lib/standards-materialize.mjs`
- Test: `tests/lib/test-standards-materialize.mjs` (estende)

**Interfaces:**
- Consumes: `selectDefaults` da Task 2.
- Produces: `retargetLinter(mdContent, id) -> string` — reescreve `enforcement.linter` para o caminho canônico do projeto. Puro, determinístico, idempotente.

`resolveAndCheckSandbox` resolve o path contra bases diferentes por origem: `default` → relativo a `<plugin>/assets/standards/` (`machine/std-x.js`); `project` → relativo a `<projeto>/.context/` (`engineering/standards/machine/std-x.js`). A mesma string não serve às duas.

- [ ] **Step 1: Escrever o teste que falha**

```js
test("retargetLinter reescreve para o caminho canônico do projeto", () => {
  const md = `---\nid: std-security\nenforcement:\n  linter: machine/std-security.js\n---\n\n# corpo\n`;
  const out = retargetLinter(md, "std-security");
  assert.match(out, /linter: engineering\/standards\/machine\/std-security\.js/);
  assert.doesNotMatch(out, /linter: machine\//);
});

test("retargetLinter NUNCA produz linter: null", () => {
  const md = `---\nid: std-security\nenforcement:\n  linter: machine/std-security.js\n---\n`;
  assert.doesNotMatch(retargetLinter(md, "std-security"), /linter:\s*null/,
    "null num default enforçado desliga 20 linters silenciosamente");
});

test("retargetLinter é idempotente — aplicar 2× é igual a 1×", () => {
  const md = `---\nid: std-security\nenforcement:\n  linter: machine/std-security.js\n---\n`;
  const once = retargetLinter(md, "std-security");
  assert.equal(retargetLinter(once, "std-security"), once);
});

test("retargetLinter não toca warn-only (linter: null já é o valor do bundle)", () => {
  const md = `---\nid: std-caching\nenforcement:\n  linter: null\n---\n`;
  assert.equal(retargetLinter(md, "std-caching"), md, "sem linter, nada a retargetar");
});

test("retargetLinter preserva o corpo byte-a-byte", () => {
  const body = "\n# Standard\n\n## Princípios\n\nTexto com `linter: machine/x.js` no corpo.\n";
  const md = `---\nid: std-security\nenforcement:\n  linter: machine/std-security.js\n---${body}`;
  const out = retargetLinter(md, "std-security");
  assert.ok(out.endsWith(body), "só o frontmatter muda; o corpo é intocado");
});
```

Acrescente `retargetLinter` ao import do arquivo de teste.

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/test-standards-materialize.mjs`
Expected: FAIL — `retargetLinter is not a function`.

- [ ] **Step 3: Implementar**

```js
// (append em scripts/lib/standards-materialize.mjs)

// Caminho canonico do linter no PROJETO (relativo a .context/, que e a base do
// sandbox origin:"project" em resolveAndCheckSandbox).
export function projectLinterRel(id) {
  return `engineering/standards/machine/${id}.js`;
}

/**
 * Reescreve `enforcement.linter` do .md para a forma canonica do projeto.
 *
 * NUNCA produz `linter: null` — e a diferenca entre esta funcao e o `eject`
 * simples, que anula o linter e por isso nao serve para materializar.
 *
 * So o FRONTMATTER e tocado: o split no segundo `---` garante que uma mencao a
 * `linter:` no corpo nao seja reescrita. Idempotente e deterministico — o hash
 * do resultado precisa bater dos dois lados (plugin e projeto).
 */
export function retargetLinter(mdContent, id) {
  if (typeof mdContent !== "string" || !mdContent.startsWith("---")) return mdContent;
  const end = mdContent.indexOf("\n---", 3);
  if (end === -1) return mdContent;
  const head = mdContent.slice(0, end);
  const rest = mdContent.slice(end);
  // `linter: null` (warn-only) fica como esta: nao ha linter a retargetar.
  const retargeted = head.replace(
    /^(\s*)linter:\s*machine\/[^\s]+\.js\s*$/m,
    `$1linter: ${projectLinterRel(id)}`,
  );
  return retargeted + rest;
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node --test tests/lib/test-standards-materialize.mjs`
Expected: PASS — 12/12.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/standards-materialize.mjs tests/lib/test-standards-materialize.mjs
git commit -m "feat(materialize): retargetLinter — nunca null, idempotente, só frontmatter"
```

---

## Task 4: `transform` no `applySync`

**Files:**
- Modify: `scripts/lib/provenance-sync.mjs` (cabeçalho; `applySync` linhas 135-146)
- Test: `tests/lib/test-provenance-sync-transform.mjs` (criar)

**Interfaces:**
- Consumes: nada das tasks anteriores (o `transform` é genérico).
- Produces: `applySync` aceita `art.transform` — uma função `(string) => string`. Quando presente, `pluginHash` é computado sobre os **bytes transformados** e são esses bytes que vão para o disco.

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/lib/test-provenance-sync-transform.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySync, loadManifest, hashFile } from "../../scripts/lib/provenance-sync.mjs";

function setup() {
  const plugin = mkdtempSync(join(tmpdir(), "prov-plug-"));
  const project = mkdtempSync(join(tmpdir(), "prov-proj-"));
  mkdirSync(join(plugin, "assets"), { recursive: true });
  mkdirSync(join(project, ".context"), { recursive: true });
  writeFileSync(join(plugin, "assets", "a.md"), "linter: machine/a.js\n");
  return { plugin, project, cleanup: () => { rmSync(plugin, { recursive: true }); rmSync(project, { recursive: true }); } };
}

const UPPER = (s) => s.replace("machine/a.js", "engineering/standards/machine/a.js");

function artifacts(plugin, project) {
  return [{
    src: join(plugin, "assets", "a.md"),
    dest: join(project, ".context", "a.md"),
    framework: "default",
    transform: UPPER,
  }];
}

test("os bytes GRAVADOS são os transformados", () => {
  const f = setup();
  applySync({ projectRoot: f.project, pluginRoot: f.plugin, artifacts: artifacts(f.plugin, f.project), registry: new Set(), sourceVersion: "1.0.0" });
  const written = readFileSync(join(f.project, ".context", "a.md"), "utf-8");
  assert.match(written, /engineering\/standards\/machine\/a\.js/);
  f.cleanup();
});

test("o hash do manifesto é o dos bytes TRANSFORMADOS, não os da origem", () => {
  const f = setup();
  applySync({ projectRoot: f.project, pluginRoot: f.plugin, artifacts: artifacts(f.plugin, f.project), registry: new Set(), sourceVersion: "1.0.0" });
  const recorded = loadManifest(f.project).artifacts[0].hash;
  assert.equal(recorded, hashFile(join(f.project, ".context", "a.md")),
    "hash da origem faria todo projeto virar 'edited' na 1ª passada");
  f.cleanup();
});

test("2ª passada classifica 'current' — sem transform o sync congelaria", () => {
  const f = setup();
  const opts = { projectRoot: f.project, pluginRoot: f.plugin, artifacts: artifacts(f.plugin, f.project), registry: new Set(), sourceVersion: "1.0.0" };
  applySync(opts);
  const r2 = applySync(opts);
  assert.deepEqual(r2.added, []);
  assert.deepEqual(r2.updated, []);
  assert.ok(r2.current.length === 1, "2ª passada é no-op");
  f.cleanup();
});

test("edição local é preservada e reportada, não sobrescrita", () => {
  const f = setup();
  const opts = { projectRoot: f.project, pluginRoot: f.plugin, artifacts: artifacts(f.plugin, f.project), registry: new Set(), sourceVersion: "1.0.0" };
  applySync(opts);
  const dest = join(f.project, ".context", "a.md");
  writeFileSync(dest, "EDITADO PELO USUARIO\n");
  const r = applySync(opts);
  assert.equal(readFileSync(dest, "utf-8"), "EDITADO PELO USUARIO\n", "edição local NUNCA é sobrescrita");
  assert.ok(r.preserved.includes(".context/a.md") || r.preserved.length === 1);
  f.cleanup();
});

test("RETROCOMPAT: artefato SEM transform copia verbatim, como hoje", () => {
  const f = setup();
  const arts = [{ src: join(f.plugin, "assets", "a.md"), dest: join(f.project, ".context", "b.md"), framework: "skill" }];
  applySync({ projectRoot: f.project, pluginRoot: f.plugin, artifacts: arts, registry: new Set(), sourceVersion: "1.0.0" });
  assert.equal(readFileSync(join(f.project, ".context", "b.md"), "utf-8"), "linter: machine/a.js\n");
  f.cleanup();
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/test-provenance-sync-transform.mjs`
Expected: FAIL — o arquivo gravado sai verbatim (`machine/a.js`), sem o retarget.

- [ ] **Step 3: Implementar**

Em `scripts/lib/provenance-sync.mjs`, trocar o bloco das linhas 135-146:

```js
    // Artefato com `transform` NAO e verbatim: o conteudo escrito difere da
    // origem. O hash de procedencia tem de ser o dos bytes ESCRITOS — usar o
    // hash da origem classificaria todo projeto como "edited" na 1a passada e
    // congelaria o sync para sempre.
    const bytes = art.transform
      ? Buffer.from(art.transform(readFileSync(src, "utf-8")), "utf-8")
      : null;
    const projHash = hashFile(dest);
    const pluginHash = bytes ? sha256(bytes) : hashFile(src);
    const recorded = byPath.get(rel)?.hash ?? null;
    const { action } = decideArtifact({ projHash, pluginHash, recorded, registry });

    if (action === "skip") {
      report.refused.push(rel);
    } else if (action === "add" || action === "untouched") {
      mkdirSync(dirname(dest), { recursive: true });
      if (bytes) writeFileSync(dest, bytes);
      else copyFileSync(src, dest);
      byPath.set(rel, { path: rel, hash: pluginHash, sourceVersion, framework });
      (action === "add" ? report.added : report.updated).push(rel);
    } else if (action === "current") {
```

Acrescentar o helper e os imports que faltam no topo do arquivo:

```js
import { createHash } from "node:crypto";   // (ja importado — conferir)
import { writeFileSync } from "node:fs";    // acrescentar a lista existente

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
```

E atualizar o cabeçalho do módulo, que hoje declara a exclusão que esta feature remove:

```js
 * hash, com contenção de segurança (isWithinDir + recusa de symlink). Cobre
 * artefatos VERBATIM (skills + standards de profile) e, via `transform`,
 * artefatos cujo conteúdo é derivado do bundle (std-*.md raiz materializados —
 * o `enforcement.linter` é retargetado na cópia). Agents (preenchidos no
 * deploy) ficam fora.
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node --test tests/lib/test-provenance-sync-transform.mjs && bash tests/run-unit.sh`
Expected: PASS nos 5 novos; suíte completa sem regressão (o teste de retrocompat garante que artefato sem `transform` segue idêntico).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/provenance-sync.mjs tests/lib/test-provenance-sync-transform.mjs
git commit -m "feat(provenance): transform no applySync — hash dos bytes escritos, não da origem"
```

---

## Task 5: Os artefatos da materialização

**Files:**
- Modify: `scripts/lib/standards-materialize.mjs`
- Test: `tests/lib/test-standards-materialize.mjs` (estende)

**Interfaces:**
- Consumes: `selectDefaults` (Task 2), `retargetLinter` + `projectLinterRel` (Task 3), formato de artefato do `applySync` (Task 4).
- Produces: `resolveMaterializedStandards({ projectRoot, pluginRoot }) -> Array<{src, dest, framework: "default", transform?}>` — pronto para `applySync`.

- [ ] **Step 1: Escrever o teste que falha**

```js
test("resolveMaterializedStandards devolve .md com transform e machine/ verbatim", () => {
  const arts = resolveMaterializedStandards({ projectRoot: join(R, "ts-src"), pluginRoot: PLUGIN });
  const md = arts.find((a) => a.dest.endsWith("engineering/standards/std-security.md"));
  const js = arts.find((a) => a.dest.endsWith("engineering/standards/machine/std-security.js"));
  assert.ok(md, "o .md do std-security deve estar na lista");
  assert.ok(js, "o machine/ do std-security deve estar na lista");
  assert.equal(typeof md.transform, "function", "o .md precisa de transform");
  assert.equal(js.transform, undefined, "o .js é verbatim");
  assert.equal(md.framework, "default");
});

test("warn-only entra sem transform e sem machine/", () => {
  const arts = resolveMaterializedStandards({ projectRoot: join(R, "ts-src"), pluginRoot: PLUGIN });
  const md = arts.find((a) => a.dest.endsWith("std-commit-hygiene.md"));
  assert.ok(md);
  assert.equal(md.transform, undefined, "linter: null não tem o que retargetar");
  assert.ok(!arts.some((a) => a.dest.includes("machine/std-commit-hygiene.js")));
});

test("o transform do artefato produz o path canônico do projeto", () => {
  const arts = resolveMaterializedStandards({ projectRoot: join(R, "ts-src"), pluginRoot: PLUGIN });
  const md = arts.find((a) => a.dest.endsWith("std-security.md"));
  const out = md.transform(readFileSync(md.src, "utf-8"));
  assert.match(out, /linter: engineering\/standards\/machine\/std-security\.js/);
});

test("projeto vazio produz só os artefatos dos applyTo **/*", () => {
  const arts = resolveMaterializedStandards({ projectRoot: join(R, "empty"), pluginRoot: PLUGIN });
  const ids = arts.filter((a) => a.dest.endsWith(".md")).map((a) => a.dest.split("/").pop());
  assert.deepEqual(ids.sort(), ["std-commit-hygiene.md", "std-pre-commit-hygiene.md"]);
});
```

Acrescente `resolveMaterializedStandards` ao import e `readFileSync` de `node:fs`.

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/test-standards-materialize.mjs`
Expected: FAIL — `resolveMaterializedStandards is not a function`.

- [ ] **Step 3: Implementar**

```js
// (append em scripts/lib/standards-materialize.mjs)
import { contextPaths } from "./context-paths.mjs";

/**
 * Lista de artefatos no formato que applySync consome.
 *
 * O .md leva `transform` (retarget do linter); o machine/*.js vai VERBATIM —
 * ele e copiado do bundle LOCAL do plugin, nunca fetchado da rede, entao o
 * guardrail anti-RCE da ADR-007 permanece literal.
 */
export function resolveMaterializedStandards({ projectRoot, pluginRoot }) {
  const stdDir = contextPaths(projectRoot).standards;
  const machineDir = contextPaths(projectRoot).standardsMachine;
  const arts = [];

  for (const { id, mdSrc, jsSrc, hasLinter } of selectDefaults({ projectRoot, pluginRoot })) {
    arts.push({
      src: mdSrc,
      dest: join(stdDir, `${id}.md`),
      framework: "default",
      ...(hasLinter ? { transform: (c) => retargetLinter(c, id) } : {}),
    });
    if (jsSrc) {
      arts.push({ src: jsSrc, dest: join(machineDir, `${id}.js`), framework: "default" });
    }
  }
  return arts;
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node --test tests/lib/test-standards-materialize.mjs`
Expected: PASS — 16/16.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/standards-materialize.mjs tests/lib/test-standards-materialize.mjs
git commit -m "feat(materialize): resolveMaterializedStandards no formato do applySync"
```

---

## Task 6: `gen-known-hashes` indexa a raiz `assets/standards/`

**Files:**
- Modify: `scripts/lib/gen-known-hashes.mjs` (`distributableFiles`, linhas 34-39)
- Test: `tests/lib/release-scaffold-sync.test.mjs` (estende)

**Interfaces:**
- Consumes: `retargetLinter` da Task 3 — o hash indexado do `.md` precisa ser o do conteúdo **transformado**, senão a classificação `untouched` nunca casa.
- Produces: `distributableFiles` passa a incluir `assets/standards/*.md` e `assets/standards/machine/*.js`.

O registry responde "esse arquivo é output de alguma versão passada?". Se ele guardar o hash da origem enquanto o projeto tem o transformado, todo projeto materializado por uma versão anterior seria classificado `edited` e nunca mais atualizaria.

- [ ] **Step 1: Escrever o teste que falha**

```js
test("distributableFiles indexa a raiz assets/standards/", () => {
  const files = distributableFiles(process.cwd());
  assert.ok(files.includes("assets/standards/std-security.md"), "o .md da raiz precisa ser indexado");
  assert.ok(files.includes("assets/standards/machine/std-security.js"), "o linter bundlado também");
});

test("os standards de PERFIL continuam indexados (sem regressão)", () => {
  const files = distributableFiles(process.cwd());
  assert.ok(files.some((f) => f.startsWith("assets/standards/profiles/odoo/")));
});

test("o hash indexado do .md é o do conteúdo TRANSFORMADO", () => {
  const set = genFromWorkingTree(process.cwd());
  const raw = readFileSync("assets/standards/std-security.md", "utf-8");
  const transformed = retargetLinter(raw, "std-security");
  const h = createHash("sha256").update(Buffer.from(transformed, "utf-8")).digest("hex");
  assert.ok(set.has(h), "sem o hash transformado, todo projeto vira 'edited' após um update");
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/release-scaffold-sync.test.mjs`
Expected: FAIL — a raiz não é varrida.

- [ ] **Step 3: Implementar**

Em `scripts/lib/gen-known-hashes.mjs`, acrescentar a 3ª raiz e a variante transformada:

```js
// Artefatos VERBATIM (.md + .js) + os std da RAIZ, que sao materializados no
// projeto com o `enforcement.linter` retargetado. Para estes ultimos o registry
// precisa guardar TAMBEM o hash do conteudo transformado — e ele que o projeto
// tem em disco, e sem ele a classificacao "untouched" nunca casa.
export function distributableFiles(pluginRoot) {
  const out = [];
  walk(pluginRoot, "skills", out);
  walk(pluginRoot, join("assets", "skills", "profiles"), out);
  walk(pluginRoot, join("assets", "standards", "profiles"), out);
  walk(pluginRoot, join("assets", "standards"), out);   // raiz: .md + machine/*.js
  return [...new Set(out)].filter((f) => f.endsWith(".md") || f.endsWith(".js"));
}
```

E em `genFromWorkingTree`, após adicionar o hash do arquivo cru, acrescentar o transformado quando o arquivo for um `std-*.md` da raiz:

```js
    // Variante materializada: o projeto guarda o .md com o linter retargetado.
    const m = rel.match(/^assets\/standards\/(std-[a-z0-9-]+)\.md$/);
    if (m) {
      const transformed = retargetLinter(readFileSync(join(pluginRoot, rel), "utf-8"), m[1]);
      set.add(createHash("sha256").update(Buffer.from(transformed, "utf-8")).digest("hex"));
    }
```

com `import { retargetLinter } from "./standards-materialize.mjs";` no topo.

- [ ] **Step 4: Rodar e regenerar o registry**

Run:
```bash
node --test tests/lib/release-scaffold-sync.test.mjs
node scripts/lib/gen-known-hashes.mjs --append
```
Expected: PASS; `known-hashes.json` cresce (os `.md` da raiz, seus transformados e os 20 `machine/*.js`).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/gen-known-hashes.mjs assets/provenance/known-hashes.json tests/lib/release-scaffold-sync.test.mjs
git commit -m "feat(provenance): known-hashes indexa a raiz assets/standards/ (cru + transformado)"
```

---

## Task 7: Escape hatch `standards.materialize`

**Files:**
- Modify: `scripts/lib/devflow-config.mjs`
- Test: `tests/lib/test-devflow-config-materialize.mjs` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `readStandardsMaterialize(src) -> boolean` — default **`true`**; só `false` explícito desliga.

Segue a convenção do módulo: leitor puro sobre string, sem `node:path` (a invariante de pureza é travada por `tests/lib/devflow-config-pure.test.mjs`).

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/lib/test-devflow-config-materialize.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readStandardsMaterialize } from "../../scripts/lib/devflow-config.mjs";

test("default é LIGADO quando a chave não existe", () => {
  assert.equal(readStandardsMaterialize("git:\n  strategy: branch-flow\n"), true);
});

test("false explícito desliga", () => {
  assert.equal(readStandardsMaterialize("standards:\n  materialize: false\n"), false);
});

test("true explícito liga", () => {
  assert.equal(readStandardsMaterialize("standards:\n  materialize: true\n"), true);
});

test("tolera comentário inline", () => {
  assert.equal(readStandardsMaterialize("standards:\n  materialize: false  # opt-out\n"), false);
});

test("não confunde com outro bloco que tenha materialize:", () => {
  assert.equal(readStandardsMaterialize("outro:\n  materialize: false\n"), true);
});

test("input não-string não lança", () => {
  assert.equal(readStandardsMaterialize(null), true);
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/test-devflow-config-materialize.mjs`
Expected: FAIL — `readStandardsMaterialize is not a function`.

- [ ] **Step 3: Implementar**

```js
// (append em scripts/lib/devflow-config.mjs)

/**
 * `standards.materialize` — default LIGADO. So `false` explicito desliga.
 *
 * Reusa readBlockField (ADR-011: parser unico, sem re-parse ad-hoc).
 */
export function readStandardsMaterialize(src) {
  const v = readBlockField(src, "standards", "materialize");
  return String(v).trim() !== "false";
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node --test tests/lib/test-devflow-config-materialize.mjs && node --test tests/lib/devflow-config-pure.test.mjs`
Expected: PASS nos 6 novos; a invariante de pureza segue verde (nenhum import novo).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/devflow-config.mjs tests/lib/test-devflow-config-materialize.mjs
git commit -m "feat(config): standards.materialize (default ligado) no parser único"
```

---

## Task 8: Fiação — init, sync e rotina

**Files:**
- Modify: `scripts/lib/provenance-sync.mjs` (`resolveArtifacts` + CLI `apply`)
- Modify: `skills/project-init/SKILL.md:794`, `skills/context-sync/SKILL.md`
- Modify: `templates/routines.json`, `.context/routines.json`
- Test: `tests/integration/test-standards-materialize-wiring.mjs` (criar)

**Interfaces:**
- Consumes: `resolveMaterializedStandards` (Task 5), `readStandardsMaterialize` (Task 7).
- Produces: `resolveArtifacts` passa a concatenar os artefatos da materialização quando `standards.materialize` não é `false`. Um caminho de código, três gatilhos.

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/integration/test-standards-materialize-wiring.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { resolveArtifacts } from "../../scripts/lib/provenance-sync.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const FIX = join(REPO, "tests/fixtures/standards-materialize/odoo-py");

function project(materialize) {
  const root = mkdtempSync(join(tmpdir(), "mat-wire-"));
  cpSync(FIX, root, { recursive: true });
  mkdirSync(join(root, ".context"), { recursive: true });
  if (materialize !== undefined) {
    writeFileSync(join(root, ".context/.devflow.yaml"), `standards:\n  materialize: ${materialize}\n`);
  }
  return root;
}

describe("materialização na fiação do provenance-sync", () => {
  it("resolveArtifacts inclui os defaults quando materialize não é false", () => {
    const root = project(undefined);
    const arts = resolveArtifacts({ projectRoot: root, pluginRoot: REPO, baseSkills: [] });
    assert.ok(arts.some((a) => a.dest.endsWith("engineering/standards/std-security.md")));
    assert.ok(arts.some((a) => a.dest.endsWith("engineering/standards/machine/std-security.js")));
    rmSync(root, { recursive: true });
  });

  it("materialize: false é no-op limpo", () => {
    const root = project("false");
    const arts = resolveArtifacts({ projectRoot: root, pluginRoot: REPO, baseSkills: [] });
    assert.ok(!arts.some((a) => a.dest.includes("engineering/standards/std-")),
      "nenhum default materializado sob opt-out");
    rmSync(root, { recursive: true });
  });

  it("o linter materializado EXECUTA — prova que não veio com linter: null", () => {
    const root = project(undefined);
    execFileSync("node", [join(REPO, "scripts/lib/provenance-sync.mjs"), "apply",
      `--project=${root}`, `--plugin=${REPO}`], { encoding: "utf-8" });
    const md = readFileSync(join(root, ".context/engineering/standards/std-security.md"), "utf-8");
    assert.match(md, /linter: engineering\/standards\/machine\/std-security\.js/);
    assert.doesNotMatch(md, /linter:\s*null/);
    const linter = join(root, ".context/engineering/standards/machine/std-security.js");
    assert.ok(existsSync(linter), "o machine/ tem de existir no projeto");
    const target = join(root, "addons/m/models/model.py");
    let out = "";
    try { execFileSync("node", [linter, target], { encoding: "utf-8" }); }
    catch (e) { out = (e.stdout || "").toString(); }
    assert.doesNotMatch(out, /Cannot find module/, "o linter roda de verdade a partir do projeto");
    rmSync(root, { recursive: true });
  });

  it("2ª passada é no-op e edição local é preservada", () => {
    const root = project(undefined);
    const run = () => execFileSync("node", [join(REPO, "scripts/lib/provenance-sync.mjs"), "apply",
      `--project=${root}`, `--plugin=${REPO}`], { encoding: "utf-8" });
    run();
    const dest = join(root, ".context/engineering/standards/std-security.md");
    const after1 = readFileSync(dest, "utf-8");
    run();
    assert.equal(readFileSync(dest, "utf-8"), after1, "2ª passada não reescreve");
    writeFileSync(dest, "EDITADO\n");
    run();
    assert.equal(readFileSync(dest, "utf-8"), "EDITADO\n", "edição local é preservada");
    rmSync(root, { recursive: true });
  });
});

describe("fiação dos skills e da rotina", () => {
  it("project-init não diz mais que os defaults não são scaffoldados", () => {
    const s = readFileSync(join(REPO, "skills/project-init/SKILL.md"), "utf-8");
    assert.doesNotMatch(s, /não precisam ser scaffoldados/);
    assert.match(s, /materializ/i);
  });

  it("context-sync menciona a materialização dos defaults", () => {
    const s = readFileSync(join(REPO, "skills/context-sync/SKILL.md"), "utf-8");
    assert.match(s, /materializ/i);
  });

  it("a rotina standards-materialize existe e é confirm", () => {
    const t = JSON.parse(readFileSync(join(REPO, "templates/routines.json"), "utf-8"));
    const r = t.routines.find((x) => x.id === "standards-materialize");
    assert.ok(r, "rotina deve existir no template");
    assert.equal(r.execution, "confirm", "escrever 17-26 arquivos nunca é silencioso");
    assert.equal(r.frequency, "7d");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/integration/test-standards-materialize-wiring.mjs`
Expected: FAIL nos 7.

- [ ] **Step 3: Ligar no `resolveArtifacts`**

Em `scripts/lib/provenance-sync.mjs`, no fim de `resolveArtifacts`, antes do `return arts;`:

```js
  // Standards default materializados (std-*.md raiz + machine/*.js). Opt-out
  // por `standards.materialize: false` — default LIGADO.
  const cfgPath = join(projectRoot, ".context", ".devflow.yaml");
  const cfg = existsSync(cfgPath) ? readFileSync(cfgPath, "utf-8") : "";
  if (readStandardsMaterialize(cfg)) {
    arts.push(...resolveMaterializedStandards({ projectRoot, pluginRoot }));
  }
```

com os imports:

```js
import { resolveMaterializedStandards } from "./standards-materialize.mjs";
import { readStandardsMaterialize } from "./devflow-config.mjs";
```

- [ ] **Step 4: Trocar o texto do `project-init`**

Substituir a linha 794 (`**Standards default:** … não precisam ser scaffoldados …`) por:

```markdown
**Standards default (materializados):** os ~26 standards default de engenharia são
**materializados** no projeto — `.md` **e** `machine/*.js` — para os que se aplicam ao
repositório (um std entra se algum caminho real casa seu `applyTo`; um projeto sem `src/`
não recebe os `src/**`). A escrita passa pelo sync de procedência, então re-rodar é no-op e
edição local é preservada:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/provenance-sync.mjs" apply --project=<PWD> --plugin="${CLAUDE_PLUGIN_ROOT}"
```

O live-merge continua ativo: um default novo do plugin vale **imediatamente**, antes de a
materialização convergir. Para desligar: `standards.materialize: false` em `.devflow.yaml`.
Para suprimir um id: `disable: [std-<id>]` em `.context/standards.local.yaml`.
```

- [ ] **Step 5: Acrescentar a nota no `context-sync`**

Na seção que já descreve o `provenance-sync apply`, acrescentar:

```markdown
O mesmo `apply` **materializa os standards default aplicáveis** (`.md` + `machine/*.js`).
Deploy intocado é atualizado; edição local é preservada e **reportada** — mostre a lista de
`preserved` ao usuário, porque é ali que uma correção oficial pode estar sendo substituída
por um patch local antigo.
```

- [ ] **Step 6: Acrescentar a rotina**

Em `templates/routines.json` e `.context/routines.json`, na lista `routines`:

```json
{
  "id": "standards-materialize",
  "description": "Reconcilia os standards default materializados no projeto (atualiza intocados, preserva editados)",
  "enabled": true,
  "frequency": "7d",
  "execution": "confirm",
  "prompts": [
    { "type": "command", "value": "/devflow:devflow-sync" }
  ]
}
```

- [ ] **Step 7: Rodar a suíte inteira**

Run: `bash tests/run-lint.sh && bash tests/run-unit.sh && bash tests/run-integration.sh`
Expected: os três verdes.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/provenance-sync.mjs skills/project-init/SKILL.md skills/context-sync/SKILL.md templates/routines.json .context/routines.json tests/integration/test-standards-materialize-wiring.mjs
git commit -m "feat(materialize): init, sync e rotina materializam os defaults por um só caminho"
```

---

## Self-Review

**Cobertura da spec:**

| Seção da spec | Task |
|---|---|
| D1 — `.md` + `machine/*.js` | 5, 8 |
| D2 — deriva por sync de procedência | 4, 6 |
| D3 — filtrado por linguagem (caminho real) | 1, 2 |
| D4 — projeto novo e existente, mesmo código | 8 (`resolveArtifacts` serve init, sync e rotina) |
| D5 — paridade ADR-008 + divergência por hash | 5 (`framework: "default"`, origem project no loader), 6 |
| D6 — rotina periódica | 8 |
| "O ponto que exige mecanismo novo" (transform) | 3, 4 |
| `standards-materialize.mjs` (componente novo) | 2, 3, 5 |
| Integração no `provenance-sync` | 4, 8 |
| Escape hatch `standards.materialize` | 7 |
| Segurança (3ª raiz do known-hashes) | 6 |
| Invariante `linter` nunca `null` | 3 (unit), 8 (integração: o linter **executa**) |

**Fora deste plano, conforme a spec:** materializar **stacks** (`assets/stacks/`) — escopo separado; e a variante fail-closed do hash divergente (recusar executar linter adulterado), avaliada e adiada.

**Consistência de tipos:** `selectDefaults` devolve `{id, mdSrc, jsSrc|null, hasLinter}` (Task 2); `resolveMaterializedStandards` os consome e emite `{src, dest, framework, transform?}` (Task 5), que é exatamente o formato que `applySync` já consome (Task 4). `retargetLinter(mdContent, id)` e `projectLinterRel(id)` têm a mesma assinatura nas Tasks 3, 5 e 6.

**Nota de ordem:** a Task 6 depende do `retargetLinter` da Task 3 para indexar o hash transformado. Fazer a 6 antes da 3 produziria um registry incompleto que só falharia num update futuro — o tipo de bug que não aparece em teste local.
