# Distribuição dos Stacks Defaults — Implementation Plan (Fase 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** stacks-defaults-distribution | **Scale:** MEDIUM | **Phase:** P→R
> **Branch:** `feature/stacks-defaults-distribution` | **Spec:** `docs/superpowers/specs/2026-06-11-stacks-defaults-distribution-design.md`

**Goal:** Distribuir os 22 stacks default do plugin (`assets/stacks/`) a qualquer projeto via live-load dual-source + filtro por framework detectado, espelhando o mecanismo de standards.

**Architecture:** Loader dedicado (`stacks-loader.mjs`) mescla defaults do plugin com o projeto; lib de filtro (`stacks-filter.mjs`) narra por deps detectadas; o índice SessionStart (`context-index.mjs`) e um novo skill `devflow:stack-filter` consomem ambos. `devflow stacks eject` materializa um `.md` no projeto.

**Tech Stack:** Node.js puro (`node:*`, Dependency Policy), `node:test`, frontmatter parser interno. pt-BR.

**Agents:** backend-specialist (libs), test-writer (suítes), documentation-writer (skill + init docs).

---

## File Structure

- Create: `scripts/lib/stacks-loader.mjs` — `loadStacksMerged`, `parseStacksLocalDisable`
- Create: `scripts/lib/stacks-filter.mjs` — `detectProjectDeps`, `filterStacks`
- Modify: `scripts/lib/context-index.mjs:collectStacks` — usa loader+filter
- Modify: `scripts/devflow-stacks.mjs` — subcomando `eject`
- Create: `skills/stack-filter/SKILL.md` — `devflow:stack-filter`
- Modify: `skills/prevc-planning/SKILL.md` — invocar stack-filter no Step 1
- Modify: `skills/project-init/SKILL.md` — documentar live-load (não seeda)
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `CHANGELOG.md` — bump 1.18.0
- Test: `tests/validation/test-stacks-loader.mjs`, `test-stacks-filter.mjs`, `test-stacks-eject.mjs`, `test-context-index-stacks.mjs`

---

## Task 1: `stacks-loader.mjs` — live-load dual-source

**Files:**
- Create: `scripts/lib/stacks-loader.mjs`
- Test: `tests/validation/test-stacks-loader.mjs`

- [ ] **Step 1: Write the failing test**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadStacksMerged } from "../../scripts/lib/stacks-loader.mjs";

const TMP = "./tests/validation/tmp/";
function fx() {
  mkdirSync(TMP, { recursive: true });
  const plugin = mkdtempSync(join(TMP, "plugin-"));
  const proj = mkdtempSync(join(TMP, "proj-"));
  mkdirSync(join(plugin, "assets/stacks/frontend"), { recursive: true });
  mkdirSync(join(plugin, "assets/stacks/validation"), { recursive: true });
  writeFileSync(join(plugin, "assets/stacks/manifest.yaml"),
    'spec: devflow-stack/v0\nframeworks:\n  next:\n    version: "16"\n    mcpIndexed: true\n  zod:\n    version: "4"\n    mcpIndexed: true\n');
  writeFileSync(join(plugin, "assets/stacks/frontend/next@16.md"), "---\ntitle: Next.js\npackage: next\n---\n# Next");
  writeFileSync(join(plugin, "assets/stacks/validation/zod@4.md"), "---\ntitle: Zod\n---\n# Zod");
  return { plugin, proj, cleanup: () => { rmSync(plugin, {recursive:true,force:true}); rmSync(proj, {recursive:true,force:true}); } };
}

test("merge: defaults do plugin aparecem quando projeto vazio", () => {
  const { plugin, proj, cleanup } = fx();
  const m = loadStacksMerged(proj, plugin);
  assert.equal(m.frameworks.next.version, "16");
  assert.equal(m.frameworks.next.origin, "default");
  assert.equal(m.frameworks.next.concern, "frontend");
  assert.ok(m.frameworks.next.mdPath.endsWith("frontend/next@16.md"));
  cleanup();
});

test("project-wins: entrada do projeto sobrescreve default por nome", () => {
  const { plugin, proj, cleanup } = fx();
  mkdirSync(join(proj, ".context/engineering/stacks"), { recursive: true });
  writeFileSync(join(proj, ".context/engineering/stacks/manifest.yaml"),
    'spec: devflow-stack/v0\nframeworks:\n  next:\n    version: "15"\n    mcpIndexed: true\n');
  const m = loadStacksMerged(proj, plugin);
  assert.equal(m.frameworks.next.version, "15");
  assert.equal(m.frameworks.next.origin, "project");
  cleanup();
});

test("disable: stacks.local.yaml remove a lib do merge", () => {
  const { plugin, proj, cleanup } = fx();
  writeFileSync(join(proj, ".context/stacks.local.yaml") , "disable: [zod]\n");
  // ensure parent dir
  const m = loadStacksMerged(proj, plugin);
  assert.ok(m.frameworks.next, "next permanece");
  assert.equal(m.frameworks.zod, undefined, "zod desabilitado");
  cleanup();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validation/test-stacks-loader.mjs`
Expected: FAIL — `Cannot find module '.../stacks-loader.mjs'`

- [ ] **Step 3: Write minimal implementation**

Espelhe `scripts/lib/standards-loader.mjs` (mesmos imports: `parseFrontmatter`, `contextPaths`, `resolveReadPaths`; mesma forma de `parseStacksLocalDisable` que o `disable:` de standards). Implemente:

```js
// scripts/lib/stacks-loader.mjs — live-load dual-source dos stacks (espelha standards-loader).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";
import { contextPaths, resolveReadPaths } from "./context-paths.mjs";
import { loadManifest } from "./manifest-stacks.mjs";

const CONCERNS = ["ai","backend","database","frontend","language","runtime","state","testing","validation"];

// Parse bare `disable: [a,b]` / block form de .context/stacks.local.yaml (igual standards).
export function parseStacksLocalDisable(content) {
  const inline = content.match(/^disable\s*:\s*\[([^\]]*)\]/m);
  if (inline) return inline[1].split(",").map(s => s.trim().replace(/['"]/g,"")).filter(Boolean);
  const block = content.match(/^disable\s*:\s*\n((?:[ \t]*-[ \t]+[^\n]+\n?)*)/m);
  if (block) return block[1].split("\n").map(l => l.replace(/^[ \t]*-[ \t]+/,"").trim().replace(/['"]/g,"")).filter(Boolean);
  return [];
}

// Lê o manifest de um stacks dir (plugin assets/stacks OU projeto) e anota concern+mdPath via varredura.
function readStacksFromRoot(stacksDir, origin) {
  const manifestPath = join(stacksDir, "manifest.yaml");
  if (!existsSync(manifestPath)) return {};
  let frameworks = {};
  try {
    const wrapped = `---\n${readFileSync(manifestPath,"utf-8")}\n---\n`;
    frameworks = parseFrontmatter(wrapped).data?.frameworks || {};
  } catch { return {}; }
  // Mapeia lib → caminho do .md (concern derivado do diretório).
  const mdByLib = {};
  for (const concern of CONCERNS) {
    const dir = join(stacksDir, concern);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      const lib = basename(f, ".md").replace(/@.*$/, ""); // next@16.md → next
      mdByLib[lib] = { concern, mdPath: join(dir, f) };
    }
  }
  const out = {};
  for (const [lib, fw] of Object.entries(frameworks)) {
    out[lib] = { ...fw, origin, concern: mdByLib[lib]?.concern || null, mdPath: mdByLib[lib]?.mdPath || null };
  }
  return out;
}

export function loadStacksMerged(projectRoot, pluginRoot = process.env.CLAUDE_PLUGIN_ROOT) {
  const defaults = pluginRoot ? readStacksFromRoot(join(pluginRoot,"assets","stacks"), "default") : {};
  // projeto: canonical + legacy via resolveReadPaths("stacks")
  const projFw = {};
  for (const dir of resolveReadPaths(projectRoot, "stacks")) {
    for (const [lib, fw] of Object.entries(readStacksFromRoot(dir, "project"))) {
      if (!projFw[lib]) projFw[lib] = fw;
    }
  }
  const merged = { ...defaults, ...projFw }; // project vence por nome
  // disable list
  const localPath = join(projectRoot, ".context", "stacks.local.yaml");
  let disable = new Set();
  if (existsSync(localPath)) disable = new Set(parseStacksLocalDisable(readFileSync(localPath,"utf-8")));
  const frameworks = {};
  for (const [lib, fw] of Object.entries(merged)) if (!disable.has(lib)) frameworks[lib] = fw;
  return { spec: "devflow-stack/v0", frameworks };
}
```

> **Nota:** confirme que `resolveReadPaths(projectRoot, "stacks")` existe (usado por `manifest-stacks.mjs`/`context-paths.mjs`). Se a chave for diferente, use `contextPaths(projectRoot).stacks` + fallback legacy `.context/stacks`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validation/test-stacks-loader.mjs`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/stacks-loader.mjs tests/validation/test-stacks-loader.mjs
git commit -m "feat(stacks): loadStacksMerged dual-source + stacks.local.yaml disable"
```

---

## Task 2: `stacks-filter.mjs` — detecção + filtro por framework

**Files:**
- Create: `scripts/lib/stacks-filter.mjs`
- Test: `tests/validation/test-stacks-filter.mjs`

- [ ] **Step 1: Write the failing test**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { filterStacks } from "../../scripts/lib/stacks-filter.mjs";

const TMP = "./tests/validation/tmp/";
function proj(pkg) {
  mkdirSync(TMP, { recursive: true });
  const root = mkdtempSync(join(TMP, "filter-"));
  if (pkg) writeFileSync(join(root,"package.json"), JSON.stringify(pkg));
  return { root, cleanup: () => rmSync(root,{recursive:true,force:true}) };
}
// merged frameworks de exemplo (saída do loader)
const MERGED = { frameworks: {
  next:   { version:"16", mcpIndexed:true, mdPath:"/p/frontend/next@16.md" },
  zod:    { version:"4",  mcpIndexed:true, mdPath:"/p/validation/zod@4.md" },
  tailwind:{version:"4",  mcpIndexed:true, mdPath:"/p/frontend/tailwind@4.md" },
  "vercel-ai-sdk":{version:"4",mcpIndexed:true,mdPath:"/p/ai/vercel-ai-sdk.md"},
  node:   { version:"24", mcpIndexed:true, mdPath:"/p/runtime/node@24.md" },
  postgres:{version:"16", skipDocs:true,  mdPath:"/p/database/postgres.md" },
  bigquery:{version:"latest",mcpIndexed:true,mdPath:"/p/database/bigquery.md"},
  "harness-engineering":{version:"n/a",skipDocs:true,mdPath:"/p/ai/harness-engineering.md"},
  gemini: { version:"latest",skipDocs:true,mdPath:"/p/ai/gemini.md" },
}};
// alias map (normalmente derivado do frontmatter `package:`; injetável p/ teste)
const ALIAS = { tailwind:["tailwindcss"], "vercel-ai-sdk":["ai"], postgres:["pg","postgres","drizzle-orm","@prisma/client"], bigquery:["@google-cloud/bigquery"] };

test("detecta libs por dep direta e por alias", () => {
  const { root, cleanup } = proj({ dependencies: { next: "16", tailwindcss: "4", ai: "4" } });
  const r = filterStacks(MERGED, root, { alias: ALIAS });
  const libs = r.matched.map(x => x.lib);
  assert.ok(libs.includes("next"));      // dep direta
  assert.ok(libs.includes("tailwind"));  // alias tailwindcss
  assert.ok(libs.includes("vercel-ai-sdk")); // alias ai
  assert.ok(!libs.includes("zod"), "zod não está nas deps");
  cleanup();
});

test("node sempre incluído quando há package.json", () => {
  const { root, cleanup } = proj({ dependencies: { next: "16" } });
  const r = filterStacks(MERGED, root, { alias: ALIAS });
  assert.ok(r.matched.map(x=>x.lib).includes("node"));
  cleanup();
});

test("postgres/bigquery via pacote-cliente", () => {
  const { root, cleanup } = proj({ dependencies: { pg: "8", "@google-cloud/bigquery": "7" } });
  const libs = filterStacks(MERGED, root, { alias: ALIAS }).matched.map(x=>x.lib);
  assert.ok(libs.includes("postgres"));
  assert.ok(libs.includes("bigquery"));
  cleanup();
});

test("harness-engineering e gemini NUNCA auto-incluídos", () => {
  const { root, cleanup } = proj({ dependencies: { "@google/genai": "1" } });
  const libs = filterStacks(MERGED, root, { alias: ALIAS }).matched.map(x=>x.lib);
  assert.ok(!libs.includes("harness-engineering"));
  assert.ok(!libs.includes("gemini"));
  cleanup();
});

test("projeto sem package.json → vazio (nem node)", () => {
  const { root, cleanup } = proj(null);
  const r = filterStacks(MERGED, root, { alias: ALIAS });
  assert.equal(r.matched.length, 0);
  cleanup();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validation/test-stacks-filter.mjs`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/stacks-filter.mjs — detecta deps do projeto e filtra os stacks mesclados.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const NEVER_AUTO = new Set(["harness-engineering", "gemini"]);

// Lê nomes de deps de package.json/pyproject/go.mod/Cargo.toml (best-effort, sem rede).
export function detectProjectDeps(projectRoot) {
  const deps = new Set();
  const pkg = join(projectRoot, "package.json");
  if (existsSync(pkg)) {
    try {
      const j = JSON.parse(readFileSync(pkg, "utf-8"));
      for (const k of Object.keys({ ...(j.dependencies||{}), ...(j.devDependencies||{}) })) deps.add(k);
    } catch {}
  }
  const py = join(projectRoot, "pyproject.toml");
  if (existsSync(py)) for (const m of readFileSync(py,"utf-8").matchAll(/^\s*([A-Za-z0-9._-]+)\s*=/gm)) deps.add(m[1].toLowerCase());
  const gomod = join(projectRoot, "go.mod");
  if (existsSync(gomod)) for (const m of readFileSync(gomod,"utf-8").matchAll(/^\s*([\w./-]+)\s+v/gm)) deps.add(m[1]);
  const cargo = join(projectRoot, "Cargo.toml");
  if (existsSync(cargo)) for (const m of readFileSync(cargo,"utf-8").matchAll(/^\s*([A-Za-z0-9._-]+)\s*=/gm)) deps.add(m[1]);
  return { deps, hasPackageJson: existsSync(pkg) };
}

// merged = saída de loadStacksMerged; opts.alias = { lib: [pkgName, ...] } (default lido do frontmatter `package:`).
export function filterStacks(merged, projectRoot, opts = {}) {
  const { deps, hasPackageJson } = detectProjectDeps(projectRoot);
  const alias = opts.alias || {};
  const matched = [];
  const reason = {};
  for (const [lib, fw] of Object.entries(merged.frameworks || {})) {
    if (lib === "node") {
      if (hasPackageJson) { matched.push({ lib, ...fw }); reason[lib] = "runtime:package.json"; }
      continue;
    }
    if (NEVER_AUTO.has(lib)) continue;
    const names = [lib, ...(alias[lib] || [])];
    const hit = names.find(n => deps.has(n));
    if (hit) { matched.push({ lib, ...fw }); reason[lib] = `dep:${hit}`; }
  }
  return { matched, reason };
}
```

> **Nota (alias real):** em produção o alias vem do frontmatter `package:` de cada `.md` (já presente em anthropic-sdk/openai-sdk/google-genai-sdk). O loader pode anexar `fw.package` e o filtro o usa quando `opts.alias` não cobre. Aliases curados adicionais (tailwind→tailwindcss, vercel-ai-sdk→ai, postgres→pg|…, bigquery→@google-cloud/bigquery) ficam numa constante no filtro.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validation/test-stacks-filter.mjs`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/stacks-filter.mjs tests/validation/test-stacks-filter.mjs
git commit -m "feat(stacks): stacks-filter por deps detectadas + alias + regras de borda"
```

---

## Task 3: Integrar no índice SessionStart (`context-index.mjs`)

**Files:**
- Modify: `scripts/lib/context-index.mjs` (função `collectStacks`)
- Test: `tests/validation/test-context-index-stacks.mjs`

- [ ] **Step 1: Write the failing test** (regressão de standards + stacks filtrados)

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildContextIndex } from "../../scripts/lib/context-index.mjs";

const TMP = "./tests/validation/tmp/";
function fx(pkgDeps) {
  mkdirSync(TMP,{recursive:true});
  const plugin = mkdtempSync(join(TMP,"plg-"));
  const proj = mkdtempSync(join(TMP,"prj-"));
  mkdirSync(join(plugin,"assets/stacks/frontend"),{recursive:true});
  mkdirSync(join(plugin,"assets/standards"),{recursive:true});
  writeFileSync(join(plugin,"assets/stacks/manifest.yaml"),
    'spec: devflow-stack/v0\nframeworks:\n  next:\n    version: "16"\n    mcpIndexed: true\n  zod:\n    version: "4"\n    mcpIndexed: true\n');
  writeFileSync(join(plugin,"assets/stacks/frontend/next@16.md"),"---\ntitle: Next\n---\n#");
  if (pkgDeps) writeFileSync(join(proj,"package.json"), JSON.stringify({dependencies:pkgDeps}));
  return { plugin, proj, cleanup:()=>{rmSync(plugin,{recursive:true,force:true});rmSync(proj,{recursive:true,force:true});} };
}

test("índice mostra só stacks do framework detectado (next), não zod", () => {
  const { plugin, proj, cleanup } = fx({ next: "16" });
  const idx = buildContextIndex(proj, plugin);
  const libs = (idx.stacks || idx.refs || []).map(r => r.lib);
  assert.ok(libs.includes("next"));
  assert.ok(!libs.includes("zod"), "zod não está nas deps → fora do índice");
  cleanup();
});

test("regressão: standards default continuam no índice", () => {
  const { plugin, proj, cleanup } = fx({ next: "16" });
  // (sem standards no fixture; valida que a chave/totais de standards seguem presentes e não quebram)
  const idx = buildContextIndex(proj, plugin);
  assert.ok(Array.isArray(idx.standards));
  assert.ok(idx.totals && typeof idx.totals.standards === "number");
  cleanup();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validation/test-context-index-stacks.mjs`
Expected: FAIL — hoje `collectStacks` usa `loadManifest` (projeto só) e não filtra; `next` não aparece (projeto sem manifest) e/ou `zod` apareceria se houvesse.

- [ ] **Step 3: Modify `collectStacks`**

Em `scripts/lib/context-index.mjs`: trocar `import { loadManifest }` por `import { loadStacksMerged } from "./stacks-loader.mjs"` e `import { filterStacks } from "./stacks-filter.mjs"`. Reescrever `collectStacks(projectRoot, pluginRoot)`:

```js
function collectStacks(projectRoot, pluginRoot) {
  const merged = loadStacksMerged(projectRoot, pluginRoot);
  const { matched } = filterStacks(merged, projectRoot);
  const out = [];
  for (const fw of matched) {
    if (fw.skipDocs) continue;
    if (fw.mcpIndexed === true) out.push({ lib: fw.lib, version: fw.version, status: "mcp-indexed" });
    else if (fw.artisanalRef) { /* legacy: manter ramo existente */ }
  }
  return out;
}
```

Garanta que `buildContextIndex` passe `pluginRoot` a `collectStacks` (já passa a standards). Mantenha a forma de saída (`stacks`/`refs`) e o `renderText` intactos (regressão).

- [ ] **Step 4: Run tests (novo + regressão existente)**

Run: `node --test tests/validation/test-context-index-stacks.mjs`
Run: `node --test tests/validation/test-manifest-stacks.mjs`
Expected: PASS em ambos.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/context-index.mjs tests/validation/test-context-index-stacks.mjs
git commit -m "feat(stacks): SessionStart index usa loadStacksMerged + filtro por framework"
```

---

## Task 4: `devflow stacks eject <lib>`

**Files:**
- Modify: `scripts/devflow-stacks.mjs` (novo `cmdEject` + dispatch)
- Test: `tests/validation/test-stacks-eject.mjs`

- [ ] **Step 1: Write the failing test**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cmdEject } from "../../scripts/devflow-stacks.mjs"; // exportar p/ teste

const TMP = "./tests/validation/tmp/";
function fx() {
  mkdirSync(TMP,{recursive:true});
  const plugin = mkdtempSync(join(TMP,"plg-"));
  const proj = mkdtempSync(join(TMP,"prj-"));
  mkdirSync(join(plugin,"assets/stacks/frontend"),{recursive:true});
  writeFileSync(join(plugin,"assets/stacks/frontend/next@16.md"),"---\ntitle: Next\n---\n# Next");
  return { plugin, proj, cleanup:()=>{rmSync(plugin,{recursive:true,force:true});rmSync(proj,{recursive:true,force:true});} };
}

test("eject copia o .md do default para o projeto", async () => {
  const { plugin, proj, cleanup } = fx();
  const code = await cmdEject("next", proj, { pluginRoot: plugin });
  assert.equal(code, 0);
  const dest = join(proj, ".context/engineering/stacks/frontend/next@16.md");
  assert.ok(existsSync(dest));
  assert.match(readFileSync(dest,"utf-8"), /# Next/);
  cleanup();
});

test("eject falha em lib inexistente", async () => {
  const { plugin, proj, cleanup } = fx();
  const code = await cmdEject("inexistente", proj, { pluginRoot: plugin });
  assert.notEqual(code, 0);
  cleanup();
});

test("eject rejeita nome com traversal", async () => {
  const { plugin, proj, cleanup } = fx();
  const code = await cmdEject("../../etc/passwd", proj, { pluginRoot: plugin });
  assert.notEqual(code, 0);
  cleanup();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validation/test-stacks-eject.mjs`
Expected: FAIL — `cmdEject` não exportado / inexistente.

- [ ] **Step 3: Implement `cmdEject`** (espelha `cmdEject` de `scripts/devflow-standards.mjs:524`)

```js
// em scripts/devflow-stacks.mjs
import { resolve } from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { contextPaths } from "./lib/context-paths.mjs";

const CONCERNS = ["ai","backend","database","frontend","language","runtime","state","testing","validation"];

export async function cmdEject(rawLib, projectRoot, opts = {}) {
  const lib = String(rawLib || "");
  if (!/^[a-z][a-z0-9-]*$/.test(lib)) { process.stderr.write(`Error: lib inválida '${rawLib}'\n`); return 1; }
  const pluginRoot = opts.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const stacksAssets = resolve(pluginRoot, "assets", "stacks");
  // resolve concern varrendo assets/stacks/*/<lib>*.md
  let srcRel = null;
  for (const c of CONCERNS) {
    const dir = resolve(stacksAssets, c);
    if (!existsSync(dir)) continue;
    const f = readdirSync(dir).find(n => n.endsWith(".md") && n.replace(/@.*$/,"").replace(/\.md$/,"") === lib);
    if (f) { srcRel = `${c}/${f}`; break; }
  }
  if (!srcRel) { process.stderr.write(`Error: stack default não encontrado: ${lib}\n`); return 1; }
  const src = resolve(stacksAssets, srcRel);
  if (!src.startsWith(stacksAssets)) { process.stderr.write("Error: containment\n"); return 1; } // R5
  const stacksDir = contextPaths(projectRoot).stacks;
  const dest = resolve(stacksDir, srcRel);
  if (!dest.startsWith(resolve(stacksDir))) { process.stderr.write("Error: containment\n"); return 1; }
  if (existsSync(dest) && !opts.force) { process.stderr.write(`Error: ${dest} já existe (--force)\n`); return 1; }
  mkdirSync(resolve(dest, ".."), { recursive: true });
  await copyFile(src, dest);
  process.stdout.write(`Ejected ${lib} → ${dest}\n`);
  return 0;
}
```

Adicione `eject` ao dispatcher de subcomandos do arquivo (junto de scrape/validate/add).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validation/test-stacks-eject.mjs`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add scripts/devflow-stacks.mjs tests/validation/test-stacks-eject.mjs
git commit -m "feat(stacks): subcomando devflow stacks eject <lib>"
```

---

## Task 5: Skill `devflow:stack-filter` + integração no Planning

**Files:**
- Create: `skills/stack-filter/SKILL.md`
- Modify: `skills/prevc-planning/SKILL.md` (Step 1 — adicionar invocação)

- [ ] **Step 1: Escrever `skills/stack-filter/SKILL.md`**

Frontmatter `name: stack-filter`, `description:` análogo a `knowledge-filter` (trigger: início do Planning ou "filtre os stacks para X"). Corpo (pt-BR): (a) detectar pluginRoot + projectRoot; (b) rodar `node scripts/lib/context-index-cli.mjs`? não — usar a lib: `loadStacksMerged` + `filterStacks` via um CLI fino `node scripts/lib/stacks-filter-cli.mjs --project=. --plugin=$CLAUDE_PLUGIN_ROOT --task="<task>"`; (c) keyword-match libera `harness-engineering`/`gemini` se a task mencionar termos do `.md`; (d) emitir bloco `<STACKS filtered="true">` com `lib@version`, resumo de 1 linha e ponteiro `mcp__docs-mcp-server__search_docs`.

> **Sub-passo:** criar `scripts/lib/stacks-filter-cli.mjs` (fino, `--format=text`) que imprime o bloco — espelha `context-index-cli.mjs`. Teste: `tests/validation/test-stacks-filter-cli.mjs` (1 caso: projeto com `next` → bloco contém `next@16` e o ponteiro MCP).

- [ ] **Step 2: Teste do CLI fino**

```js
// test-stacks-filter-cli.mjs — projeto com next → saída contém "next@16" e "search_docs"
```
Run: `node --test tests/validation/test-stacks-filter-cli.mjs` → FAIL, depois implementar CLI → PASS.

- [ ] **Step 3: Integrar no `prevc-planning`**

Em `skills/prevc-planning/SKILL.md` Step 1, após o bloco de `knowledge-filter`, adicionar seção análoga: "invoke `devflow:stack-filter` passando a task; colete `<STACKS filtered>` como contexto de stack; fallback: seguir sem stacks se indisponível (opt-in)."

- [ ] **Step 4: Commit**

```bash
git add skills/stack-filter/SKILL.md scripts/lib/stacks-filter-cli.mjs tests/validation/test-stacks-filter-cli.mjs skills/prevc-planning/SKILL.md
git commit -m "feat(stacks): skill devflow:stack-filter on-demand + integração no Planning"
```

---

## Task 6: Documentar live-load no `project-init`

**Files:**
- Modify: `skills/project-init/SKILL.md`

- [ ] **Step 1:** Na seção "Profile Stacks", adicionar nota: "Os stacks default do plugin (`assets/stacks/`) são **live-loaded** via `loadStacksMerged` — **não** são copiados no init. Para customizar um, use `devflow stacks eject <lib>`. O índice do SessionStart e o skill `devflow:stack-filter` mostram só os relevantes ao framework detectado." Não alterar o comportamento de `devflow stacks add` (profile stacks detectados).
- [ ] **Step 2: Commit**

```bash
git add skills/project-init/SKILL.md
git commit -m "docs(stacks): project-init documenta live-load dos stacks default (sem seed)"
```

---

## Task 7: Bump + CHANGELOG (Confirmation)

**Files:** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `CHANGELOG.md`

- [ ] **Step 1:** Bump `1.17.0` → `1.18.0` em plugin.json e marketplace.json.
- [ ] **Step 2:** Entrada no CHANGELOG `## [1.18.0]` descrevendo: live-load dual-source dos stacks default, stack-filter (SessionStart + Planning), `devflow stacks eject`. Listar testes.
- [ ] **Step 3:** Rodar suíte completa de validação + e2e de hooks (regressão). Comando do repo (confirmar): `bash tests/run-validation.sh` ou `node --test tests/validation/*.mjs`.
- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md
git commit -m "chore(release): v1.18.0 — distribuição dos stacks defaults (Fase 7)"
```

---

## Self-Review (cobertura do spec)

- §Arquitetura/1 loader → Task 1 ✓ | §2 filter → Task 2 ✓ | §3 SessionStart → Task 3 ✓ | §4 skill → Task 5 ✓ | §5 eject → Task 4 ✓ | §6 project-init → Task 6 ✓
- §Testing → testes em cada task + regressão (Task 3, Task 7) ✓
- §Casos de borda (node/postgres/bigquery/harness/gemini) → Task 2 cobre todos ✓
- Bump/versão → Task 7 ✓
- Consistência de nomes: `loadStacksMerged`, `filterStacks`, `cmdEject`, `parseStacksLocalDisable` usados de forma consistente entre tasks ✓
