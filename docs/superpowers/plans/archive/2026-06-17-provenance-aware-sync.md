# Sync provenance-aware — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **DevFlow workflow:** provenance-aware-sync | **Scale:** MEDIUM | **Phase:** E
> **Spec:** `docs/superpowers/specs/2026-06-17-provenance-aware-sync-design.md`
> **Revisão R aplicada:** C1 (backfill por commits, não tags), C2/D4 (agents fora — só skills+standards verbatim), A1 (resolveArtifacts na lib), W2 (scope profiles + dest engineering/standards), segurança CRITICAL/HIGH (isWithinDir + recusa symlink + refused + teste RED), A2 (pluginHash==null), A3 (órfãos), W4 (report relativo).

**Goal:** Fazer o sync distinguir deploy intocado (auto-update) de edição local (preserva+reporta) via hash de proveniência + registry histórico, **contido** (sem traversal/symlink), para **skills e standards de profile**.

**Architecture:** Lib determinística `scripts/lib/provenance-sync.mjs` resolve os artefatos (profiles compostos → `{src,dest,framework}`), decide por hash (`projHash`×`pluginHash`×`recorded`×`registry`), copia **contido** (`isWithinDir`, sem symlink), atualiza `.context/.provenance.json` e reporta. Registry `assets/provenance/known-hashes.json` gerado por **histórico de commits**. Skills invocam a lib; agents seguem o fluxo `fillSingle` (fora).

**Tech Stack:** Node 24 (ESM, `node:test`, `node:assert/strict`, `node:crypto`, `node:fs`, `node:child_process`), reuso de `scripts/lib/path-guard.mjs` e `scripts/lib/detect-framework.mjs`.

## Global Constraints

- pt-BR em relatórios/comentários; **zero deps externas** (só `node:*` + libs do repo).
- Testes via `node --test`; escrita SEMPRE em `mkdtempSync(tmpdir())`, nunca in-place.
- Escopo verbatim: **skills + standards de profile**. **Agents FORA** (transformados no deploy). std-*.md raiz fora (live-loaded).
- **Contenção obrigatória:** `src` ⊂ pluginRoot; `dest` ⊂ `.context/`; recusar symlink. Violação → `refused` (nunca escreve).
- Store `.context/.provenance.json` `{schema:1, artifacts:[{path,hash,sourceVersion,framework}]}`; registry `assets/provenance/known-hashes.json` `{schema:1, hashes:[...]}`.
- `report` usa paths **relativos** ao projeto.

---

## File Structure

**Criar:** `scripts/lib/provenance-sync.mjs` (resolveArtifacts + decideArtifact + hash + manifesto + applySync + CLI), `scripts/lib/gen-known-hashes.mjs` (registry por commit history), `assets/provenance/known-hashes.json` (gerado), testes em `tests/integration/`.
**Modificar:** `scripts/bump-version.sh` (append registry), `skills/context-sync/SKILL.md` + `skills/project-init/SKILL.md` (invocar lib; agents fora).
**Reusar:** `scripts/lib/path-guard.mjs` (`isWithinDir`), `scripts/lib/detect-framework.mjs` (`frameworkContributions`/`standardsWithOrigin`).

> **Pré-requisito:** ler `scripts/lib/path-guard.mjs` (assinatura de `isWithinDir`) e `scripts/reversa-import/write.mjs` (padrão de recusa de symlink: `lstatSync` + `isSymbolicLink()`) antes da Task 2.

---

## Task 1: Decisão 3-way pura (incl. pluginHash==null) + hash + manifesto I/O

**Agent:** backend-specialist
**Files:** Create `scripts/lib/provenance-sync.mjs`, `tests/integration/test-provenance-sync.mjs`

**Interfaces — Produces:**
- `hashFile(path) -> string|null` (sha256 hex; null em IO erro)
- `decideArtifact({projHash, pluginHash, recorded, registry}) -> {action}`, `action ∈ {"skip","add","current","untouched","edited"}`. Regras (nesta ordem): `pluginHash==null`→`skip`; `projHash==null`→`add`; `projHash===pluginHash`→`current`; `recorded!=null & projHash===recorded`→`untouched`; `recorded!=null & projHash!==recorded`→`edited`; `recorded==null & registry.has(projHash)`→`untouched`; senão→`edited`.
- `loadManifest(projectRoot) -> {schema, artifacts}`; `saveManifest(projectRoot, manifest)`.

- [ ] **Step 1: Write failing test**

```javascript
// tests/integration/test-provenance-sync.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashFile, decideArtifact, loadManifest, saveManifest } from "../../scripts/lib/provenance-sync.mjs";

describe("decideArtifact — 7 linhas", () => {
  const reg = new Set(["HIST"]);
  const d = (o) => decideArtifact(o).action;
  it("pluginHash null → skip", () => assert.equal(d({projHash:"A", pluginHash:null, recorded:null, registry:reg}), "skip"));
  it("ausente → add", () => assert.equal(d({projHash:null, pluginHash:"P", recorded:null, registry:reg}), "add"));
  it("igual plugin → current", () => assert.equal(d({projHash:"P", pluginHash:"P", recorded:"X", registry:reg}), "current"));
  it("recorded==proj → untouched", () => assert.equal(d({projHash:"A", pluginHash:"P", recorded:"A", registry:reg}), "untouched"));
  it("recorded!=proj → edited", () => assert.equal(d({projHash:"A", pluginHash:"P", recorded:"B", registry:reg}), "edited"));
  it("sem recorded & registry hit → untouched", () => assert.equal(d({projHash:"HIST", pluginHash:"P", recorded:null, registry:reg}), "untouched"));
  it("sem recorded & registry miss → edited", () => assert.equal(d({projHash:"Z", pluginHash:"P", recorded:null, registry:reg}), "edited"));
});

describe("hashFile + manifesto roundtrip", () => {
  it("hashFile estável e null em erro", () => {
    const dir = mkdtempSync(join(tmpdir(), "prov-")); const f = join(dir, "a"); writeFileSync(f, "abc");
    assert.match(hashFile(f), /^[0-9a-f]{64}$/); assert.equal(hashFile(join(dir, "nope")), null);
  });
  it("load default + roundtrip", () => {
    const proj = mkdtempSync(join(tmpdir(), "prov-proj-"));
    assert.deepEqual(loadManifest(proj), { schema: 1, artifacts: [] });
    const m = { schema: 1, artifacts: [{ path: ".context/x.md", hash: "H", sourceVersion: "1.0.0", framework: "odoo" }] };
    saveManifest(proj, m);
    assert.ok(existsSync(join(proj, ".context", ".provenance.json")));
    assert.deepEqual(loadManifest(proj), m);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `node --test tests/integration/test-provenance-sync.mjs`.

- [ ] **Step 3: Implement**

```javascript
// scripts/lib/provenance-sync.mjs
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export function hashFile(path) {
  try { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
  catch { return null; }
}

export function decideArtifact({ projHash, pluginHash, recorded, registry }) {
  if (pluginHash == null) return { action: "skip" };
  if (projHash == null) return { action: "add" };
  if (projHash === pluginHash) return { action: "current" };
  if (recorded != null) return { action: projHash === recorded ? "untouched" : "edited" };
  return { action: registry && registry.has(projHash) ? "untouched" : "edited" };
}

function manifestPath(projectRoot) { return join(projectRoot, ".context", ".provenance.json"); }

export function loadManifest(projectRoot) {
  const p = manifestPath(projectRoot);
  if (!existsSync(p)) return { schema: 1, artifacts: [] };
  try {
    const d = JSON.parse(readFileSync(p, "utf-8"));
    if (!d || !Array.isArray(d.artifacts)) return { schema: 1, artifacts: [] };
    return { schema: d.schema ?? 1, artifacts: d.artifacts };
  } catch { return { schema: 1, artifacts: [] }; }
}

export function saveManifest(projectRoot, manifest) {
  const p = manifestPath(projectRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ schema: 1, artifacts: manifest.artifacts }, null, 2) + "\n");
}
```

- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(sync): decisão 3-way (incl. pluginHash null) + hash + manifesto"`

---

## Task 2: `applySync` contido (isWithinDir + recusa symlink + refused + relativo)

**Agent:** backend-specialist
**Files:** Modify `scripts/lib/provenance-sync.mjs`, `tests/integration/test-provenance-sync.mjs`

**Interfaces:**
- Consumes: Task 1 + `isWithinDir` de `scripts/lib/path-guard.mjs` + `lstatSync`.
- Produces: `applySync({projectRoot, pluginRoot, artifacts, registry, sourceVersion}) -> report`. `artifacts`: `[{src(abs), dest(abs), framework}]`. `report`: `{added:[rel], updated:[rel], current:[rel], preserved:[rel], refused:[rel]}` (rel = relativo a projectRoot). Contenção: recusa (`refused`) se `src` ⊄ pluginRoot, `dest` ⊄ `join(projectRoot,".context")`, ou se `src`/`dest` existente é symlink. `skip` (pluginHash null) também entra em `refused`.

- [ ] **Step 1: Write failing test (efeitos + segurança RED)**

```javascript
// adicionar em tests/integration/test-provenance-sync.mjs
import { mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { applySync } from "../../scripts/lib/provenance-sync.mjs";

function mk() { return { plug: mkdtempSync(join(tmpdir(), "prov-plug-")), proj: mkdtempSync(join(tmpdir(), "prov-proj2-")) }; }

describe("applySync — efeitos", () => {
  it("add / untouched(registry) / edited(preserva)", () => {
    const { plug, proj } = mk();
    for (const n of ["new", "stale", "edited"]) { mkdirSync(join(plug, n), {recursive:true}); writeFileSync(join(plug, n, "S.md"), `PLUG-${n}-v2`); }
    mkdirSync(join(proj, ".context", "stale"), {recursive:true}); writeFileSync(join(proj, ".context", "stale", "S.md"), "ANTIGO");
    mkdirSync(join(proj, ".context", "edited"), {recursive:true}); writeFileSync(join(proj, ".context", "edited", "S.md"), "USER");
    const registry = new Set([hashFile(join(proj, ".context", "stale", "S.md"))]);
    const artifacts = ["new","stale","edited"].map((n) => ({ src: join(plug,n,"S.md"), dest: join(proj,".context",n,"S.md"), framework: "odoo" }));
    const r = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry, sourceVersion: "2.0.0" });
    assert.ok(r.added.some((p) => p.endsWith("new/S.md")));
    assert.ok(r.updated.some((p) => p.endsWith("stale/S.md")));
    assert.ok(r.preserved.some((p) => p.endsWith("edited/S.md")));
    assert.ok(r.added.every((p) => !p.startsWith("/")), "report relativo");
    assert.equal(readFileSync(join(proj,".context","stale","S.md"),"utf-8"), "PLUG-stale-v2");
    assert.equal(readFileSync(join(proj,".context","edited","S.md"),"utf-8"), "USER");
  });
});

describe("applySync — segurança (contenção)", () => {
  it("traversal de dest/src → refused, nada escrito fora", () => {
    const { plug, proj } = mk();
    mkdirSync(join(plug, "ok"), {recursive:true}); writeFileSync(join(plug, "ok", "S.md"), "X");
    const artifacts = [
      { src: join(plug, "ok", "S.md"), dest: join(proj, ".context", "..", "escape.md"), framework: "odoo" },
      { src: join(plug, "..", "outside.md"), dest: join(proj, ".context", "z.md"), framework: "odoo" },
    ];
    const r = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry: new Set(), sourceVersion: "2.0.0" });
    assert.equal(r.refused.length, 2);
    assert.ok(!existsSync(join(proj, "escape.md")), "não escreveu fora de .context");
  });
  it("src symlink → refused", () => {
    const { plug, proj } = mk();
    writeFileSync(join(plug, "real.md"), "R"); symlinkSync(join(plug, "real.md"), join(plug, "link.md"));
    const artifacts = [{ src: join(plug, "link.md"), dest: join(proj, ".context", "x.md"), framework: "odoo" }];
    const r = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry: new Set(), sourceVersion: "2.0.0" });
    assert.equal(r.refused.length, 1); assert.ok(!existsSync(join(proj, ".context", "x.md")));
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement (append em provenance-sync.mjs)**

```javascript
import { copyFileSync, lstatSync } from "node:fs";
import { relative } from "node:path";
import { isWithinDir } from "./path-guard.mjs";

function isSymlink(p) { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } }

export function applySync({ projectRoot, pluginRoot, artifacts, registry, sourceVersion }) {
  const contextRoot = join(projectRoot, ".context");
  const manifest = loadManifest(projectRoot);
  const byPath = new Map(manifest.artifacts.map((a) => [a.path, a]));
  const report = { added: [], updated: [], current: [], preserved: [], refused: [] };

  for (const { src, dest, framework } of artifacts) {
    const rel = relative(projectRoot, dest);
    // Contenção (segurança): src no plugin, dest em .context, sem symlink.
    if (!isWithinDir(src, pluginRoot) || !isWithinDir(dest, contextRoot) || isSymlink(src) || isSymlink(dest)) {
      report.refused.push(rel); continue;
    }
    const projHash = hashFile(dest);
    const pluginHash = hashFile(src);
    const recorded = byPath.get(rel)?.hash ?? null;
    const { action } = decideArtifact({ projHash, pluginHash, recorded, registry });

    if (action === "skip") { report.refused.push(rel); continue; }
    if (action === "add" || action === "untouched") {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      byPath.set(rel, { path: rel, hash: pluginHash, sourceVersion, framework });
      (action === "add" ? report.added : report.updated).push(rel);
    } else if (action === "current") {
      byPath.set(rel, { path: rel, hash: pluginHash, sourceVersion, framework });
      report.current.push(rel);
    } else { report.preserved.push(rel); }
  }
  saveManifest(projectRoot, { schema: 1, artifacts: [...byPath.values()] });
  return report;
}
```

- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(sync): applySync contido (isWithinDir + recusa symlink + refused + relativo)"`

---

## Task 3: `resolveArtifacts` na lib (profiles compostos → skills + standards)

**Agent:** backend-specialist
**Files:** Modify `scripts/lib/provenance-sync.mjs`, `tests/integration/test-provenance-sync.mjs`

**Interfaces:**
- Consumes: `frameworkContributions` de `detect-framework.mjs`.
- Produces: `resolveArtifacts({projectRoot, pluginRoot, baseSkills}) -> [{src(abs), dest(abs), framework}]`. Inclui: skills (de `contributions.skills` + `baseSkills`) → `skills/<slug>/**` → `.context/skills/<slug>/**`; standards de profile (de `contributions.standardsWithOrigin`) → `assets/standards/profiles/<fw>/<id>.md` (+ `machine/<id>.js`) → `.context/engineering/standards/<id>.md` (+`machine/`). **NÃO inclui agents nem std-*.md raiz.**

- [ ] **Step 1: Write failing test**

```javascript
// adicionar em tests/integration/test-provenance-sync.mjs
import { resolveArtifacts } from "../../scripts/lib/provenance-sync.mjs";
import { resolve } from "node:path";
const REPO = resolve(import.meta.dirname, "../..");

describe("resolveArtifacts", () => {
  it("inclui skills e standards de profile; exclui agents", () => {
    // projeto-fixture com marcador odoo
    const proj = mkdtempSync(join(tmpdir(), "prov-res-"));
    mkdirSync(join(proj, "addons", "x"), {recursive:true}); writeFileSync(join(proj, "addons", "x", "__manifest__.py"), "{'name':'x'}");
    const arts = resolveArtifacts({ projectRoot: proj, pluginRoot: REPO, baseSkills: [] });
    assert.ok(arts.some((a) => a.dest.includes(".context/skills/odoo-development")));
    assert.ok(arts.some((a) => a.dest.includes(".context/engineering/standards/std-odoo-naming-conventions.md")));
    assert.ok(arts.every((a) => !a.dest.includes(".context/agents/")), "agents fora");
    assert.ok(arts.every((a) => a.src.startsWith(REPO)), "src no plugin");
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement (append)** — usar `frameworkContributions(projectRoot, pluginRoot)`; para cada skill, enumerar arquivos sob `skills/<slug>/` (walk) e mapear para `.context/skills/<slug>/<rel>`; para cada `{id, framework}` em `standardsWithOrigin`, mapear `assets/standards/profiles/<framework>/<id>.md` → `.context/engineering/standards/<id>.md` e `.../machine/<id>.js` → `.context/engineering/standards/machine/<id>.js` (se existir). Reutilizar um `walk` simples (espelhar `gen-known-hashes`/`detect-framework`).

```javascript
import { frameworkContributions } from "./detect-framework.mjs";
import { readdirSync } from "node:fs";

function walkFiles(root, sub, out) {
  let entries; try { entries = readdirSync(join(root, sub), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = sub ? join(sub, e.name) : e.name;
    if (e.isDirectory()) walkFiles(root, rel, out);
    else if (e.isFile()) out.push(rel);
  }
}

export function resolveArtifacts({ projectRoot, pluginRoot, baseSkills = [] }) {
  const c = frameworkContributions(projectRoot, pluginRoot);
  const arts = [];
  const skills = [...new Set([...(c.skills || []), ...baseSkills])];
  for (const slug of skills) {
    const files = [];
    walkFiles(pluginRoot, join("skills", slug), files);
    for (const rel of files) arts.push({ src: join(pluginRoot, rel), dest: join(projectRoot, ".context", rel), framework: "skill" });
  }
  for (const { id, framework } of c.standardsWithOrigin || []) {
    const md = join("assets", "standards", "profiles", framework, `${id}.md`);
    arts.push({ src: join(pluginRoot, md), dest: join(projectRoot, ".context", "engineering", "standards", `${id}.md`), framework });
    const js = join("assets", "standards", "profiles", framework, "machine", `${id}.js`);
    if (existsSync(join(pluginRoot, js))) arts.push({ src: join(pluginRoot, js), dest: join(projectRoot, ".context", "engineering", "standards", "machine", `${id}.js`), framework });
  }
  return arts;
}
```

- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(sync): resolveArtifacts (skills+standards de profile; agents fora)"`

---

## Task 4: CLI `apply` (resolve + aplica) — consumido pelas skills

**Agent:** backend-specialist
**Files:** Modify `scripts/lib/provenance-sync.mjs`, `tests/integration/test-provenance-sync.mjs`

**Interfaces:**
- Produces: `loadRegistry(pluginRoot) -> Set<string>`; CLI `node provenance-sync.mjs apply --project=<root> --plugin=<root> [--base-skills=a,b]`. Resolve via `resolveArtifacts`, carrega registry, lê `sourceVersion` de `<plugin>/.claude-plugin/plugin.json`, roda `applySync`, imprime `report` JSON (paths relativos). Exit 0.

- [ ] **Step 1: Write failing test**

```javascript
// adicionar em tests/integration/test-provenance-sync.mjs
import { execFileSync } from "node:child_process";
describe("CLI apply", () => {
  it("resolve+aplica via CLI e imprime report", () => {
    const proj = mkdtempSync(join(tmpdir(), "prov-cli-"));
    mkdirSync(join(proj, "addons", "x"), {recursive:true}); writeFileSync(join(proj, "addons", "x", "__manifest__.py"), "{'name':'x'}");
    const CLI = resolve(import.meta.dirname, "../../scripts/lib/provenance-sync.mjs");
    const out = execFileSync("node", [CLI, "apply", `--project=${proj}`, `--plugin=${REPO}`], { encoding: "utf-8" });
    const r = JSON.parse(out);
    assert.ok(Array.isArray(r.added));
    assert.ok(existsSync(join(proj, ".context", "skills", "odoo-development", "SKILL.md")), "skill copiada");
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement (append: loadRegistry + CLI)**

```javascript
import { resolve } from "node:path"; // já pode estar importado — consolidar

export function loadRegistry(pluginRoot) {
  const p = join(pluginRoot, "assets", "provenance", "known-hashes.json");
  if (!existsSync(p)) return new Set();
  try { const d = JSON.parse(readFileSync(p, "utf-8")); return new Set(Array.isArray(d.hashes) ? d.hashes : []); }
  catch { return new Set(); }
}

function arg(name) { const h = process.argv.find((a) => a.startsWith(`--${name}=`)); return h ? h.slice(h.indexOf("=") + 1) : null; }

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === "apply") {
    const projectRoot = resolve(arg("project"));
    const pluginRoot = resolve(arg("plugin"));
    const baseSkills = (arg("base-skills") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const artifacts = resolveArtifacts({ projectRoot, pluginRoot, baseSkills });
    const pkg = JSON.parse(readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf-8"));
    const report = applySync({ projectRoot, pluginRoot, artifacts, registry: loadRegistry(pluginRoot), sourceVersion: pkg.version });
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.error("Usage: provenance-sync.mjs apply --project=<root> --plugin=<root> [--base-skills=a,b]");
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(sync): CLI apply (resolve+aplica) + loadRegistry"`

---

## Task 5: Gerador do registry por HISTÓRICO DE COMMITS (`gen-known-hashes.mjs`)

**Agent:** backend-specialist
**Files:** Create `scripts/lib/gen-known-hashes.mjs`, `tests/integration/test-gen-known-hashes.mjs`, `assets/provenance/known-hashes.json` (gerado no Step 4)

**Interfaces:**
- Produces:
  - `distributableFiles(root) -> string[]` — só artefatos **verbatim**: `skills/**` (.md/.js) + `assets/standards/profiles/**` (.md/.js). **NÃO** agents, **NÃO** std-*.md raiz.
  - `genFromWorkingTree(pluginRoot) -> Set<string>`.
  - `genBackfill(pluginRoot) -> Set<string>` — working tree + para cada path, `git log --pretty=%H -- <path>` → `git show <sha>:<path>` → sha256. Emite aviso se `git log` falhar (shallow).
  - CLI `[--append]`: `--append` mescla com registry existente (dedup); senão backfill completo. Escreve `assets/provenance/known-hashes.json` ordenado.

- [ ] **Step 1: Write failing test**

```javascript
// tests/integration/test-gen-known-hashes.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { distributableFiles, genFromWorkingTree } from "../../scripts/lib/gen-known-hashes.mjs";
import { hashFile } from "../../scripts/lib/provenance-sync.mjs";
const REPO = resolve(import.meta.dirname, "../..");
describe("gen-known-hashes (verbatim only)", () => {
  it("distributableFiles inclui skills e standards de profile; exclui agents e std raiz", () => {
    const f = distributableFiles(REPO);
    assert.ok(f.some((x) => x.startsWith("skills/")));
    assert.ok(f.some((x) => x.startsWith("assets/standards/profiles/")));
    assert.ok(!f.some((x) => x.startsWith("agents/")), "agents fora");
    assert.ok(!f.some((x) => /^assets\/standards\/std-.*\.md$/.test(x)), "std raiz fora");
  });
  it("genFromWorkingTree é Set e contém hash de uma skill atual", () => {
    const set = genFromWorkingTree(REPO);
    assert.ok(set instanceof Set);
    assert.ok(set.has(hashFile(join(REPO, "skills", "odoo-development", "SKILL.md"))));
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** (walk verbatim; `git log --pretty=%H -- <path>` por arquivo; `git show <sha>:<path>`; `execFileSync` array-args; try/catch com aviso em shallow). Detalhe de `genBackfill`:

```javascript
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

function commitsTouching(pluginRoot, relPath) {
  try { return execFileSync("git", ["log", "--pretty=%H", "--", relPath], { cwd: pluginRoot, encoding: "utf-8" }).split("\n").map((s)=>s.trim()).filter(Boolean); }
  catch { return null; } // null = git indisponível/shallow
}
function blobHashAt(pluginRoot, sha, relPath) {
  try { return createHash("sha256").update(execFileSync("git", ["show", `${sha}:${relPath}`], { cwd: pluginRoot })).digest("hex"); }
  catch { return null; }
}
export function genBackfill(pluginRoot) {
  const set = genFromWorkingTree(pluginRoot);
  let shallowWarned = false;
  for (const rel of distributableFiles(pluginRoot)) {
    const commits = commitsTouching(pluginRoot, rel);
    if (commits === null) { if (!shallowWarned) { console.error("WARN: git indisponível/shallow — registry só do working tree"); shallowWarned = true; } continue; }
    for (const sha of commits) { const h = blobHashAt(pluginRoot, sha, rel); if (h) set.add(h); }
  }
  return set;
}
```
`distributableFiles`: walk de `skills` e `assets/standards/profiles`, filtrando `.md`/`.js`.

- [ ] **Step 4: Run test → PASS**; depois gerar o registry real: `node scripts/lib/gen-known-hashes.mjs` (escreve `assets/provenance/known-hashes.json`).
- [ ] **Step 5: Commit** — `git add scripts/lib/gen-known-hashes.mjs tests/... assets/provenance/known-hashes.json && git commit -m "feat(sync): registry por histórico de commits (verbatim only)"`

---

## Task 6: `bump-version.sh` faz append do registry

**Agent:** devops-specialist
**Files:** Modify `scripts/bump-version.sh`, Create `tests/integration/test-bump-appends-registry.mjs`

- [ ] **Step 1: Write failing test** — asserta `scripts/bump-version.sh` contém `gen-known-hashes.mjs --append`.

```javascript
import { describe, it } from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs"; import { resolve } from "node:path";
const SH = readFileSync(resolve(import.meta.dirname, "../../scripts/bump-version.sh"), "utf-8");
describe("bump-version.sh", () => { it("append do registry", () => assert.match(SH, /gen-known-hashes\.mjs\s+--append/)); });
```

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — ao fim de `scripts/bump-version.sh`:

```bash
if [ -f "$REPO_ROOT/scripts/lib/gen-known-hashes.mjs" ]; then
  node "$REPO_ROOT/scripts/lib/gen-known-hashes.mjs" --append || echo "WARN: falha ao atualizar known-hashes.json"
fi
```

- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(sync): bump-version.sh atualiza registry no release"`

---

## Task 7: Skills invocam a lib (`context-sync` + `project-init`) — agents fora

**Agent:** documentation-writer
**Files:** Modify `skills/context-sync/SKILL.md`, `skills/project-init/SKILL.md`, Create `tests/integration/test-sync-skills-reference-provenance.mjs`

- [ ] **Step 1: Write failing test (doc-lint)**

```javascript
import { describe, it } from "node:test"; import assert from "node:assert/strict";
import { readFileSync } from "node:fs"; import { resolve, join } from "node:path";
const REPO = resolve(import.meta.dirname, "../..");
const CS = readFileSync(join(REPO, "skills/context-sync/SKILL.md"), "utf-8");
const PI = readFileSync(join(REPO, "skills/project-init/SKILL.md"), "utf-8");
describe("skills invocam provenance-sync", () => {
  it("context-sync chama provenance-sync.mjs apply", () => assert.match(CS, /provenance-sync\.mjs apply/));
  it("context-sync reporta preservados/refused", () => assert.match(CS, /preserv|refused|editad/i));
  it("context-sync deixa agents fora da lib", () => assert.match(CS, /agent.*(fill|fluxo|fora)/i));
  it("project-init referencia provenance-sync", () => assert.match(PI, /provenance-sync\.mjs/));
});
```

- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — em `context-sync/SKILL.md`, substituir a regra "ausente → copiar / existe → pular" (linha ~140-142) por: para **skills + standards**, invocar `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/provenance-sync.mjs" apply --project="$PWD" --plugin="${CLAUDE_PLUGIN_ROOT}" --base-skills=<lista base>`; a lib resolve/decide/copia (contido)/atualiza `.context/.provenance.json`; reportar `{added,updated,current,preserved,refused}`, destacando `preserved` (editados — revisar) e `refused` (recusados). **Agents continuam pelo fluxo `fillSingle`/enrich — NÃO passam pela lib.** Em `project-init/SKILL.md`: re-scaffold delega ao sync (mesma invocação); `status: filled → SKIP` permanece só para scaffold do zero; atualização de skills/standards existentes passa pela lib.
- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(sync): context-sync/project-init invocam provenance-sync (agents fora)"`

---

## Task 8: E2E de sync provenance-aware (caso motivador)

**Agent:** test-writer
**Files:** Create `tests/integration/test-provenance-sync-e2e.mjs`

- [ ] **Step 1: Write test (gate integrado sobre a lib)**

```javascript
import { describe, it } from "node:test"; import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
import { applySync, loadManifest, hashFile } from "../../scripts/lib/provenance-sync.mjs";

describe("E2E provenance-aware (caso motivador)", () => {
  it("stale intocado atualiza; editado preserva; novo adiciona; 2ª sync no-op", () => {
    const plug = mkdtempSync(join(tmpdir(), "e2e-plug-")); const proj = mkdtempSync(join(tmpdir(), "e2e-proj-"));
    for (const n of ["dev","front","l10n"]) { mkdirSync(join(plug,"skills",n),{recursive:true}); writeFileSync(join(plug,"skills",n,"SKILL.md"), `v2-${n}`); }
    mkdirSync(join(proj,".context","skills","dev"),{recursive:true}); writeFileSync(join(proj,".context","skills","dev","SKILL.md"), "v1-dev");
    mkdirSync(join(proj,".context","skills","front"),{recursive:true}); writeFileSync(join(proj,".context","skills","front","SKILL.md"), "FRONT-editado");
    const registry = new Set([hashFile(join(proj,".context","skills","dev","SKILL.md"))]);
    const artifacts = ["dev","front","l10n"].map((n) => ({ src: join(plug,"skills",n,"SKILL.md"), dest: join(proj,".context","skills",n,"SKILL.md"), framework: "odoo" }));
    const r1 = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry, sourceVersion: "2.0.0" });
    assert.equal(r1.updated.length, 1); assert.equal(r1.preserved.length, 1); assert.equal(r1.added.length, 1);
    assert.equal(readFileSync(join(proj,".context","skills","dev","SKILL.md"),"utf-8"), "v2-dev");
    assert.equal(readFileSync(join(proj,".context","skills","front","SKILL.md"),"utf-8"), "FRONT-editado");
    const r2 = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry, sourceVersion: "2.0.0" });
    assert.equal(r2.updated.length, 0); assert.equal(r2.added.length, 0); assert.equal(r2.current.length, 2); assert.equal(r2.preserved.length, 1);
    assert.ok(loadManifest(proj).artifacts.length >= 2);
  });
});
```

- [ ] **Step 2: Run → PASS**.
- [ ] **Step 3: Suíte da feature** — `node --test tests/integration/test-provenance-sync.mjs tests/integration/test-provenance-sync-e2e.mjs tests/integration/test-gen-known-hashes.mjs tests/integration/test-bump-appends-registry.mjs tests/integration/test-sync-skills-reference-provenance.mjs` → verde.
- [ ] **Step 4: Regressão** — `node --test tests/integration/*.mjs` (ignorar o CLI `assert-no-decision-leak.mjs`) → zero novas falhas.
- [ ] **Step 5: Commit** — `git commit -m "test(sync): E2E provenance-aware (untouched→update, edited→preserve, new→add)"`

---

## Self-Review

**Cobertura do spec:**
- D1 (registry por commits) → Task 5 (`genBackfill` via `git log`/`git show`). ✓
- D2 (preservar+reportar) → Task 2 (`edited`→preserved) + Task 7 (skill reporta). ✓
- D3 (`.context/.provenance.json`) → Task 1. ✓
- D4 (skills+standards; agents/std-raiz fora) → Task 3 `resolveArtifacts` + Task 5 `distributableFiles` (exclui agents/std-raiz) + Task 7 (agents fora). ✓
- D5 (lib decide E resolve, não prosa) → Tasks 1-4 + Task 7. ✓
- D6 (contenção isWithinDir + symlink) → Task 2 (+ teste RED de traversal/symlink). ✓
- Tabela 7 linhas (incl. pluginHash null) → Task 1. ✓
- Órfãos (A3) → spec decisão explícita; `applySync` itera candidatos, órfão do manifesto é inerte. ✓
- Report relativo (W4) → Task 2 (`rel`). ✓

**Placeholder scan:** sem TBD/TODO; código real nas tasks de código; Task 7 (prosa) tem doc-lint.

**Type consistency:** `hashFile`, `decideArtifact`, `loadManifest`/`saveManifest`, `applySync({projectRoot,pluginRoot,artifacts,registry,sourceVersion})→{added,updated,current,preserved,refused}`, `resolveArtifacts({projectRoot,pluginRoot,baseSkills})`, `loadRegistry`, `distributableFiles`/`genFromWorkingTree`/`genBackfill` — consistentes Tasks 1→8.

> Pré-leitura obrigatória (Task 2): `scripts/lib/path-guard.mjs` (`isWithinDir(child, parent)` — confirmar ordem dos args) e `scripts/reversa-import/write.mjs` (recusa de symlink).
