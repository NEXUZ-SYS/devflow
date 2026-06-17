# Sync provenance-aware — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **DevFlow workflow:** provenance-aware-sync | **Scale:** MEDIUM | **Phase:** E
> **Spec:** `docs/superpowers/specs/2026-06-17-provenance-aware-sync-design.md`

**Goal:** Fazer o sync distinguir deploy intocado (auto-update) de edição local (preserva+reporta) via hash de proveniência + registry de hashes históricos.

**Architecture:** Uma lib determinística (`scripts/lib/provenance-sync.mjs`) decide a ação por artefato comparando `projHash` × `pluginHash` × `recorded` (manifesto `.context/.provenance.json`) × `registry` (hashes históricos embarcados). As skills `context-sync`/`project-init` passam a invocar a lib em vez de decidir por prosa. Um gerador (`gen-known-hashes.mjs`) produz o registry (backfill git tags + append no bump).

**Tech Stack:** Node 24 (ESM, `node:test`, `node:assert/strict`, `node:crypto` sha256, `node:fs`), Markdown (skills), Bash (bump-version.sh).

## Global Constraints

- Idioma de relatórios/comentários: **pt-BR** (termos técnicos mantidos).
- **Zero deps externas** em runtime (só `node:*`). (convenção do repo)
- Testes via `node --test`; qualquer escrita de teste em **tmpdir** (`mkdtempSync`), nunca in-place.
- Linters/scripts: stdout determinístico; exit 0 sucesso / exit 1 erro.
- Escopo de artefatos: **skills + agents + standards** (stacks fora).
- Proveniência: store `.context/.provenance.json` `{schema:1, artifacts:[{path,hash,sourceVersion,framework}]}`; registry `assets/provenance/known-hashes.json` `{schema:1, hashes:[...]}`.
- D2: arquivo editado localmente → **preservar + reportar** (sem merge UI).

---

## File Structure

**Criar:**
- `scripts/lib/provenance-sync.mjs` — lib + CLI. Responsável por: hash de arquivo, decisão 3-way pura, I/O do manifesto, `applySync` (aplica decisões/copia/atualiza/reporta), CLI `apply`.
- `scripts/lib/gen-known-hashes.mjs` — gera/append o registry histórico (backfill git tags + working tree).
- `assets/provenance/known-hashes.json` — registry (gerado; commitado).
- `tests/integration/test-provenance-sync.mjs` — unit da decisão 3-way + manifesto + applySync (tmpdir).
- `tests/integration/test-gen-known-hashes.mjs` — registry deduplicado + contém working tree.
- `tests/integration/test-provenance-sync-e2e.mjs` — E2E sync sobre projeto-fixture.

**Modificar:**
- `scripts/bump-version.sh` — append do registry no release.
- `skills/context-sync/SKILL.md` — invocar a lib na cópia de artefatos.
- `skills/project-init/SKILL.md` — idem no re-scaffold.

---

## Task 1: Decisão 3-way pura + hash + manifesto I/O

**Agent:** backend-specialist
**Files:**
- Create: `scripts/lib/provenance-sync.mjs`
- Create: `tests/integration/test-provenance-sync.mjs`

**Interfaces:**
- Produces:
  - `hashFile(path) -> string|null` (sha256 hex; null em erro de IO)
  - `decideArtifact({projHash, pluginHash, recorded, registry}) -> {action}` onde `action ∈ {"add","current","untouched","edited"}` e `registry` é um `Set<string>`. Regras: projHash null→`add`; projHash===pluginHash→`current`; recorded!=null & projHash===recorded→`untouched`; recorded!=null & projHash!==recorded→`edited`; recorded==null & registry.has(projHash)→`untouched`; senão→`edited`.
  - `loadManifest(projectRoot) -> {schema, artifacts}` (default `{schema:1, artifacts:[]}` se ausente)
  - `saveManifest(projectRoot, manifest) -> void` (escreve `.context/.provenance.json`)

- [ ] **Step 1: Write the failing test**

```javascript
// tests/integration/test-provenance-sync.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashFile, decideArtifact, loadManifest, saveManifest } from "../../scripts/lib/provenance-sync.mjs";

describe("decideArtifact — 6 linhas da tabela", () => {
  const reg = new Set(["HISTORICO"]);
  it("ausente → add", () => assert.equal(decideArtifact({projHash:null, pluginHash:"P", recorded:null, registry:reg}).action, "add"));
  it("igual ao plugin → current", () => assert.equal(decideArtifact({projHash:"P", pluginHash:"P", recorded:"X", registry:reg}).action, "current"));
  it("recorded==proj → untouched", () => assert.equal(decideArtifact({projHash:"A", pluginHash:"P", recorded:"A", registry:reg}).action, "untouched"));
  it("recorded!=proj → edited", () => assert.equal(decideArtifact({projHash:"A", pluginHash:"P", recorded:"B", registry:reg}).action, "edited"));
  it("sem recorded & no registry → untouched (stale)", () => assert.equal(decideArtifact({projHash:"HISTORICO", pluginHash:"P", recorded:null, registry:reg}).action, "untouched"));
  it("sem recorded & fora do registry → edited", () => assert.equal(decideArtifact({projHash:"DESCONHECIDO", pluginHash:"P", recorded:null, registry:reg}).action, "edited"));
});

describe("hashFile + manifesto roundtrip", () => {
  it("hashFile estável e null em IO erro", () => {
    const d = mkdtempSync(join(tmpdir(), "prov-"));
    const f = join(d, "a.txt"); writeFileSync(f, "abc");
    assert.match(hashFile(f), /^[0-9a-f]{64}$/);
    assert.equal(hashFile(join(d, "nope")), null);
  });
  it("load default + save/load roundtrip", () => {
    const proj = mkdtempSync(join(tmpdir(), "prov-proj-"));
    assert.deepEqual(loadManifest(proj), { schema: 1, artifacts: [] });
    const m = { schema: 1, artifacts: [{ path: ".context/x.md", hash: "H", sourceVersion: "1.0.0", framework: "odoo" }] };
    saveManifest(proj, m);
    assert.ok(existsSync(join(proj, ".context", ".provenance.json")));
    assert.deepEqual(loadManifest(proj), m);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `node --test tests/integration/test-provenance-sync.mjs` (module not found).

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

// Decisão pura. registry é um Set<string> de hashes históricos.
export function decideArtifact({ projHash, pluginHash, recorded, registry }) {
  if (projHash === null || projHash === undefined) return { action: "add" };
  if (projHash === pluginHash) return { action: "current" };
  if (recorded != null) {
    return { action: projHash === recorded ? "untouched" : "edited" };
  }
  return { action: registry && registry.has(projHash) ? "untouched" : "edited" };
}

function manifestPath(projectRoot) {
  return join(projectRoot, ".context", ".provenance.json");
}

export function loadManifest(projectRoot) {
  const p = manifestPath(projectRoot);
  if (!existsSync(p)) return { schema: 1, artifacts: [] };
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"));
    if (!data || typeof data !== "object" || !Array.isArray(data.artifacts)) return { schema: 1, artifacts: [] };
    return { schema: data.schema ?? 1, artifacts: data.artifacts };
  } catch { return { schema: 1, artifacts: [] }; }
}

export function saveManifest(projectRoot, manifest) {
  const p = manifestPath(projectRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ schema: 1, artifacts: manifest.artifacts }, null, 2) + "\n");
}
```

- [ ] **Step 4: Run → PASS** — `node --test tests/integration/test-provenance-sync.mjs`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/provenance-sync.mjs tests/integration/test-provenance-sync.mjs
git commit -m "feat(sync): decisão 3-way pura + hash + manifesto de proveniência"
```

---

## Task 2: `applySync` — aplica decisões, copia, atualiza manifesto, reporta

**Agent:** backend-specialist
**Files:**
- Modify: `scripts/lib/provenance-sync.mjs`
- Modify: `tests/integration/test-provenance-sync.mjs`

**Interfaces:**
- Consumes: `hashFile`, `decideArtifact`, `loadManifest`, `saveManifest` (Task 1).
- Produces: `applySync({projectRoot, artifacts, registry, sourceVersion}) -> report` onde:
  - `artifacts`: `[{ src, dest, framework }]` (src = path no plugin; dest = path absoluto no projeto; ambos absolutos).
  - `registry`: `Set<string>`.
  - `report`: `{ added:[dest], updated:[dest], current:[dest], preserved:[dest] }`.
  - Efeitos: para `add`/`untouched` copia `src`→`dest` (cria dirs) e grava entrada no manifesto (path relativo ao projectRoot, hash do plugin, sourceVersion, framework); `current` garante a entrada no manifesto sem copiar; `edited` não toca nada e entra em `preserved`.

- [ ] **Step 1: Write the failing test**

```javascript
// adicionar em tests/integration/test-provenance-sync.mjs
import { mkdirSync } from "node:fs";
import { applySync } from "../../scripts/lib/provenance-sync.mjs";

describe("applySync — efeitos e relatório", () => {
  function setup() {
    const plug = mkdtempSync(join(tmpdir(), "prov-plug-"));
    const proj = mkdtempSync(join(tmpdir(), "prov-proj2-"));
    return { plug, proj };
  }
  it("add (ausente), untouched (registry), edited (preserva)", () => {
    const { plug, proj } = setup();
    // plugin tem 3 artefatos
    for (const n of ["new", "stale", "edited"]) {
      mkdirSync(join(plug, n), { recursive: true });
      writeFileSync(join(plug, n, "SKILL.md"), `PLUGIN-${n}-v2`);
    }
    // projeto: 'new' ausente; 'stale' = versão antiga (hash no registry); 'edited' = conteúdo do usuário
    mkdirSync(join(proj, ".context", "stale"), { recursive: true });
    writeFileSync(join(proj, ".context", "stale", "SKILL.md"), "ANTIGO-stale-v1");
    mkdirSync(join(proj, ".context", "edited"), { recursive: true });
    writeFileSync(join(proj, ".context", "edited", "SKILL.md"), "EDITADO-pelo-usuario");

    const registry = new Set([hashFile(join(proj, ".context", "stale", "SKILL.md"))]); // 'stale' é release antiga
    const artifacts = ["new", "stale", "edited"].map((n) => ({
      src: join(plug, n, "SKILL.md"),
      dest: join(proj, ".context", n, "SKILL.md"),
      framework: "odoo",
    }));

    const report = applySync({ projectRoot: proj, artifacts, registry, sourceVersion: "2.0.0" });

    assert.deepEqual(report.added.map((p) => p.endsWith("new/SKILL.md")), [true]);
    assert.deepEqual(report.updated.map((p) => p.endsWith("stale/SKILL.md")), [true]);
    assert.deepEqual(report.preserved.map((p) => p.endsWith("edited/SKILL.md")), [true]);
    // efeitos: new e stale agora têm conteúdo do plugin; edited intacto
    assert.equal(readFileSync(join(proj, ".context", "new", "SKILL.md"), "utf-8"), "PLUGIN-new-v2");
    assert.equal(readFileSync(join(proj, ".context", "stale", "SKILL.md"), "utf-8"), "PLUGIN-stale-v2");
    assert.equal(readFileSync(join(proj, ".context", "edited", "SKILL.md"), "utf-8"), "EDITADO-pelo-usuario");
    // manifesto: new + stale gravados, edited não
    const m = loadManifest(proj);
    const paths = m.artifacts.map((a) => a.path).sort();
    assert.ok(paths.some((p) => p.endsWith("new/SKILL.md")));
    assert.ok(paths.some((p) => p.endsWith("stale/SKILL.md")));
    assert.ok(!paths.some((p) => p.endsWith("edited/SKILL.md")));
  });
});
```

- [ ] **Step 2: Run → FAIL** (applySync undefined).

- [ ] **Step 3: Implement (append em provenance-sync.mjs)**

```javascript
import { copyFileSync } from "node:fs";
import { relative } from "node:path";

export function applySync({ projectRoot, artifacts, registry, sourceVersion }) {
  const manifest = loadManifest(projectRoot);
  const byPath = new Map(manifest.artifacts.map((a) => [a.path, a]));
  const report = { added: [], updated: [], current: [], preserved: [] };

  for (const { src, dest, framework } of artifacts) {
    const relPath = relative(projectRoot, dest);
    const projHash = hashFile(dest);
    const pluginHash = hashFile(src);
    const recorded = byPath.get(relPath)?.hash ?? null;
    const { action } = decideArtifact({ projHash, pluginHash, recorded, registry });

    if (action === "add" || action === "untouched") {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      byPath.set(relPath, { path: relPath, hash: pluginHash, sourceVersion, framework });
      (action === "add" ? report.added : report.updated).push(dest);
    } else if (action === "current") {
      byPath.set(relPath, { path: relPath, hash: pluginHash, sourceVersion, framework });
      report.current.push(dest);
    } else { // edited
      report.preserved.push(dest);
    }
  }
  saveManifest(projectRoot, { schema: 1, artifacts: [...byPath.values()] });
  return report;
}
```

- [ ] **Step 4: Run → PASS**.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/provenance-sync.mjs tests/integration/test-provenance-sync.mjs
git commit -m "feat(sync): applySync aplica decisões + atualiza manifesto + reporta"
```

---

## Task 3: CLI `apply` (consumido pelas skills)

**Agent:** backend-specialist
**Files:**
- Modify: `scripts/lib/provenance-sync.mjs`
- Modify: `tests/integration/test-provenance-sync.mjs`

**Interfaces:**
- Consumes: `applySync`, registry loader.
- Produces: CLI `node scripts/lib/provenance-sync.mjs apply --project=<root> --plugin=<root> --artifacts=<jsonFile>` onde o jsonFile contém `[{srcRel, destRel, framework}]` (srcRel relativo ao plugin, destRel relativo ao projeto). Carrega o registry de `<plugin>/assets/provenance/known-hashes.json` (default set vazio se ausente). Imprime o `report` como JSON em stdout, exit 0.

- [ ] **Step 1: Write the failing test**

```javascript
// adicionar em tests/integration/test-provenance-sync.mjs
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

describe("CLI apply", () => {
  it("aplica via CLI e imprime report JSON", () => {
    const plug = mkdtempSync(join(tmpdir(), "prov-cliplug-"));
    const proj = mkdtempSync(join(tmpdir(), "prov-cliproj-"));
    mkdirSync(join(plug, "skills", "x"), { recursive: true });
    writeFileSync(join(plug, "skills", "x", "SKILL.md"), "NOVA");
    mkdirSync(join(plug, "assets", "provenance"), { recursive: true });
    writeFileSync(join(plug, "assets", "provenance", "known-hashes.json"), JSON.stringify({ schema: 1, hashes: [] }));
    const artifactsFile = join(proj, "artifacts.json");
    writeFileSync(artifactsFile, JSON.stringify([{ srcRel: "skills/x/SKILL.md", destRel: ".context/skills/x/SKILL.md", framework: "odoo" }]));

    const CLI = resolve(import.meta.dirname, "../../scripts/lib/provenance-sync.mjs");
    const out = execFileSync("node", [CLI, "apply", `--project=${proj}`, `--plugin=${plug}`, `--artifacts=${artifactsFile}`], { encoding: "utf-8" });
    const report = JSON.parse(out);
    assert.equal(report.added.length, 1);
    assert.equal(readFileSync(join(proj, ".context", "skills", "x", "SKILL.md"), "utf-8"), "NOVA");
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement (append: registry loader + CLI entrypoint)**

```javascript
export function loadRegistry(pluginRoot) {
  const p = join(pluginRoot, "assets", "provenance", "known-hashes.json");
  if (!existsSync(p)) return new Set();
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"));
    return new Set(Array.isArray(data.hashes) ? data.hashes : []);
  } catch { return new Set(); }
}

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === "apply") {
    const projectRoot = resolve(arg("project"));
    const pluginRoot = resolve(arg("plugin"));
    const artifactsSpec = JSON.parse(readFileSync(arg("artifacts"), "utf-8"));
    const artifacts = artifactsSpec.map((a) => ({
      src: join(pluginRoot, a.srcRel),
      dest: join(projectRoot, a.destRel),
      framework: a.framework ?? null,
    }));
    const pkg = JSON.parse(readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf-8"));
    const report = applySync({ projectRoot, artifacts, registry: loadRegistry(pluginRoot), sourceVersion: pkg.version });
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.error("Usage: provenance-sync.mjs apply --project=<root> --plugin=<root> --artifacts=<jsonFile>");
    process.exit(1);
  }
}
```
Adicionar `resolve` ao import de `node:path`.

- [ ] **Step 4: Run → PASS**.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/provenance-sync.mjs tests/integration/test-provenance-sync.mjs
git commit -m "feat(sync): CLI apply (consumido pelas skills) + loadRegistry"
```

---

## Task 4: Gerador do registry (`gen-known-hashes.mjs`)

**Agent:** backend-specialist
**Files:**
- Create: `scripts/lib/gen-known-hashes.mjs`
- Create: `tests/integration/test-gen-known-hashes.mjs`
- Create: `assets/provenance/known-hashes.json` (gerado pelo script no Step 4)

**Interfaces:**
- Produces:
  - `distributableFiles(root) -> string[]` (paths relativos de skills/**, agents/*.md, assets/standards/**/*.md/.js — os artefatos copiáveis).
  - `genFromWorkingTree(pluginRoot) -> Set<string>` (sha256 de cada distributableFile do working tree).
  - CLI `node scripts/lib/gen-known-hashes.mjs [--append]`: backfill de `git tag` (cada `git show <tag>:<path>` → sha256) + working tree; `--append` mescla com o registry existente (dedup); escreve `assets/provenance/known-hashes.json` ordenado.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/integration/test-gen-known-hashes.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { genFromWorkingTree, distributableFiles } from "../../scripts/lib/gen-known-hashes.mjs";
import { hashFile } from "../../scripts/lib/provenance-sync.mjs";
import { join } from "node:path";

const REPO = resolve(import.meta.dirname, "../..");

describe("gen-known-hashes", () => {
  it("distributableFiles inclui skills e agents reais", () => {
    const files = distributableFiles(REPO);
    assert.ok(files.some((f) => f.startsWith("skills/")));
    assert.ok(files.some((f) => f.startsWith("agents/")));
  });
  it("genFromWorkingTree contém o hash de um artefato conhecido e é deduplicado (Set)", () => {
    const set = genFromWorkingTree(REPO);
    const known = hashFile(join(REPO, "agents", "odoo-specialist.md"));
    assert.ok(set.has(known), "registry deve conter o hash do agente atual");
    assert.ok(set instanceof Set);
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement**

```javascript
// scripts/lib/gen-known-hashes.mjs
import { readdirSync, statSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const SKIP = new Set(["node_modules", ".git", "dist", "build", "__pycache__"]);

function walk(root, sub, out) {
  let entries;
  try { entries = readdirSync(join(root, sub), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
    const rel = sub ? join(sub, e.name) : e.name;
    if (e.isDirectory()) walk(root, rel, out);
    else if (e.isFile()) out.push(rel);
  }
}

// Artefatos distribuíveis: skills/**, agents/*.md, assets/standards/** (.md + machine/*.js)
export function distributableFiles(pluginRoot) {
  const out = [];
  walk(pluginRoot, "skills", out);
  walk(pluginRoot, "agents", out);
  walk(pluginRoot, join("assets", "standards"), out);
  return out.filter((f) => f.endsWith(".md") || f.endsWith(".js"));
}

export function genFromWorkingTree(pluginRoot) {
  const set = new Set();
  for (const rel of distributableFiles(pluginRoot)) {
    try { set.add(createHash("sha256").update(readFileSync(join(pluginRoot, rel))).digest("hex")); }
    catch { /* skip */ }
  }
  return set;
}

function gitTags(pluginRoot) {
  try { return execFileSync("git", ["tag"], { cwd: pluginRoot, encoding: "utf-8" }).split("\n").map((s) => s.trim()).filter(Boolean); }
  catch { return []; }
}

function hashAtTag(pluginRoot, tag, relPath) {
  try {
    const buf = execFileSync("git", ["show", `${tag}:${relPath}`], { cwd: pluginRoot });
    return createHash("sha256").update(buf).digest("hex");
  } catch { return null; }
}

export function genBackfill(pluginRoot) {
  const set = genFromWorkingTree(pluginRoot);
  const files = distributableFiles(pluginRoot);
  for (const tag of gitTags(pluginRoot)) {
    for (const rel of files) {
      const h = hashAtTag(pluginRoot, tag, rel);
      if (h) set.add(h);
    }
  }
  return set;
}

function registryPath(pluginRoot) { return join(pluginRoot, "assets", "provenance", "known-hashes.json"); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const append = process.argv.includes("--append");
  const set = append ? genFromWorkingTree(pluginRoot) : genBackfill(pluginRoot);
  const p = registryPath(pluginRoot);
  if (append && existsSync(p)) {
    try { JSON.parse(readFileSync(p, "utf-8")).hashes?.forEach((h) => set.add(h)); } catch { /* */ }
  }
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ schema: 1, hashes: [...set].sort() }, null, 2) + "\n");
  console.log(`known-hashes.json: ${set.size} hashes (${append ? "append" : "backfill"})`);
}
```

- [ ] **Step 4: Run test → PASS**; depois gerar o registry real:

```bash
node --test tests/integration/test-gen-known-hashes.mjs
node scripts/lib/gen-known-hashes.mjs   # backfill → escreve assets/provenance/known-hashes.json
```
Expected: arquivo criado com N hashes (inclui working tree + tags).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/gen-known-hashes.mjs tests/integration/test-gen-known-hashes.mjs assets/provenance/known-hashes.json
git commit -m "feat(sync): gerador do registry de hashes históricos (backfill git tags + working tree)"
```

---

## Task 5: Integrar no `bump-version.sh` (append por release)

**Agent:** devops-specialist
**Files:**
- Modify: `scripts/bump-version.sh`
- Create: `tests/integration/test-bump-appends-registry.mjs`

**Interfaces:**
- Consumes: `gen-known-hashes.mjs --append`.
- Produces: após o bump, o script chama `node scripts/lib/gen-known-hashes.mjs --append` (atualiza o registry com os hashes da versão nova).

- [ ] **Step 1: Write the failing test** (verifica que o script referencia o gerador)

```javascript
// tests/integration/test-bump-appends-registry.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const SH = readFileSync(resolve(import.meta.dirname, "../../scripts/bump-version.sh"), "utf-8");
describe("bump-version.sh", () => {
  it("chama gen-known-hashes --append após o bump", () => {
    assert.match(SH, /gen-known-hashes\.mjs\s+--append/);
  });
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — adicionar ao fim de `scripts/bump-version.sh` (após o loop de bump e o echo final):

```bash
# Atualiza o registry de hashes históricos com os artefatos da versão nova
if [ -f "$REPO_ROOT/scripts/lib/gen-known-hashes.mjs" ]; then
  node "$REPO_ROOT/scripts/lib/gen-known-hashes.mjs" --append || echo "WARN: falha ao atualizar known-hashes.json"
fi
```

- [ ] **Step 4: Run → PASS**.

- [ ] **Step 5: Commit**

```bash
git add scripts/bump-version.sh tests/integration/test-bump-appends-registry.mjs
git commit -m "feat(sync): bump-version.sh atualiza o registry de hashes no release"
```

---

## Task 6: Skills passam a invocar a lib (`context-sync` + `project-init`)

**Agent:** documentation-writer
**Files:**
- Modify: `skills/context-sync/SKILL.md`
- Modify: `skills/project-init/SKILL.md`
- Create: `tests/integration/test-sync-skills-reference-provenance.mjs`

**Interfaces:**
- Consumes: CLI `provenance-sync.mjs apply` (Task 3).
- Produces: prosa das skills referenciando a invocação do CLI + reporte de `preserved`.

- [ ] **Step 1: Write the failing test** (doc-lint: skills referenciam a lib e o relatório)

```javascript
// tests/integration/test-sync-skills-reference-provenance.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const REPO = resolve(import.meta.dirname, "../..");
const CS = readFileSync(join(REPO, "skills/context-sync/SKILL.md"), "utf-8");
const PI = readFileSync(join(REPO, "skills/project-init/SKILL.md"), "utf-8");
import { join } from "node:path";
describe("skills invocam provenance-sync", () => {
  it("context-sync referencia provenance-sync.mjs apply", () => assert.match(CS, /provenance-sync\.mjs apply/));
  it("context-sync menciona preservados/editados localmente", () => assert.match(CS, /preserv|editad/i));
  it("project-init referencia provenance-sync.mjs", () => assert.match(PI, /provenance-sync\.mjs/));
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** — em `skills/context-sync/SKILL.md`, substituir a regra "ausente → copiar / existe → pular" (linha ~140-142) por:

```markdown
A cópia de skills/agents/standards é **provenance-aware** — NÃO decida por existência/`status`.
Monte a lista de artefatos a partir de `frameworkContributions` (skills/agents/standardsWithOrigin)
+ base set, como `[{srcRel, destRel, framework}]`, grave em um arquivo temporário e invoque:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/provenance-sync.mjs" apply --project="$PWD" --plugin="${CLAUDE_PLUGIN_ROOT}" --artifacts=<tmp.json>`

A lib decide por hash (deploy intocado → atualiza; editado localmente → preserva) e grava
`.context/.provenance.json`. Reporte ao usuário o JSON retornado, destacando `preserved`
(editados localmente — pular e revisar manualmente).
```

Em `skills/project-init/SKILL.md`, no fluxo de re-scaffold (HARD-GATE que delega ao sync), adicionar nota de que a atualização de artefatos existentes é feita via `provenance-sync.mjs apply` (não mais `status: filled → SKIP` para decidir update). O SKIP por `status: filled` permanece válido só para o scaffold inicial (arquivos do zero).

- [ ] **Step 4: Run → PASS**.

- [ ] **Step 5: Commit**

```bash
git add skills/context-sync/SKILL.md skills/project-init/SKILL.md tests/integration/test-sync-skills-reference-provenance.mjs
git commit -m "feat(sync): context-sync e project-init invocam provenance-sync (fim do skip cego)"
```

---

## Task 7: E2E de sync provenance-aware sobre projeto-fixture

**Agent:** test-writer
**Files:**
- Create: `tests/integration/test-provenance-sync-e2e.mjs`

**Interfaces:**
- Consumes: `applySync` + `loadManifest` + `hashFile`.
- Produces: E2E cobrindo o caso motivador (untouched stale → update; edited → preserve; new → add) numa cópia de projeto em tmpdir.

- [ ] **Step 1: Write the failing test → na verdade já deve passar com a lib pronta; este é o gate integrado**

```javascript
// tests/integration/test-provenance-sync-e2e.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySync, loadManifest, hashFile } from "../../scripts/lib/provenance-sync.mjs";

describe("E2E — sync provenance-aware (caso motivador)", () => {
  it("stale intocado atualiza; editado preserva; novo adiciona; 2ª sync é no-op", () => {
    const plug = mkdtempSync(join(tmpdir(), "e2e-plug-"));
    const proj = mkdtempSync(join(tmpdir(), "e2e-proj-"));
    // plugin v2
    for (const n of ["dev", "front", "l10n"]) {
      mkdirSync(join(plug, "skills", n), { recursive: true });
      writeFileSync(join(plug, "skills", n, "SKILL.md"), `v2-${n}`);
    }
    // projeto: dev = deploy antigo intocado; front = editado; l10n = ausente
    mkdirSync(join(proj, ".context", "skills", "dev"), { recursive: true });
    writeFileSync(join(proj, ".context", "skills", "dev", "SKILL.md"), "v1-dev");
    mkdirSync(join(proj, ".context", "skills", "front"), { recursive: true });
    writeFileSync(join(proj, ".context", "skills", "front", "SKILL.md"), "FRONT-editado");

    const registry = new Set([hashFile(join(proj, ".context", "skills", "dev", "SKILL.md"))]); // dev v1 é release antiga
    const artifacts = ["dev", "front", "l10n"].map((n) => ({
      src: join(plug, "skills", n, "SKILL.md"),
      dest: join(proj, ".context", "skills", n, "SKILL.md"),
      framework: "odoo",
    }));

    const r1 = applySync({ projectRoot: proj, artifacts, registry, sourceVersion: "2.0.0" });
    assert.equal(r1.updated.length, 1); // dev
    assert.equal(r1.preserved.length, 1); // front
    assert.equal(r1.added.length, 1); // l10n
    assert.equal(readFileSync(join(proj, ".context", "skills", "dev", "SKILL.md"), "utf-8"), "v2-dev");
    assert.equal(readFileSync(join(proj, ".context", "skills", "front", "SKILL.md"), "utf-8"), "FRONT-editado");

    // 2ª sync: dev/l10n agora == plugin (current), front ainda editado (recorded ausente p/ front → registry miss → edited)
    const r2 = applySync({ projectRoot: proj, artifacts, registry, sourceVersion: "2.0.0" });
    assert.equal(r2.updated.length, 0);
    assert.equal(r2.added.length, 0);
    assert.equal(r2.current.length, 2); // dev, l10n
    assert.equal(r2.preserved.length, 1); // front
    assert.ok(loadManifest(proj).artifacts.length >= 2);
  });
});
```

- [ ] **Step 2: Run → PASS** — `node --test tests/integration/test-provenance-sync-e2e.mjs`.

- [ ] **Step 3: Suíte completa de proveniência**

Run: `node --test tests/integration/test-provenance-sync.mjs tests/integration/test-provenance-sync-e2e.mjs tests/integration/test-gen-known-hashes.mjs tests/integration/test-bump-appends-registry.mjs tests/integration/test-sync-skills-reference-provenance.mjs`
Expected: tudo verde.

- [ ] **Step 4: Regressão do repo** — rodar a suíte de integração inteira (`node --test tests/integration/*.mjs`, ignorando o CLI `assert-no-decision-leak.mjs`) e confirmar zero novas falhas.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/test-provenance-sync-e2e.mjs
git commit -m "test(sync): E2E provenance-aware (untouched→update, edited→preserve, new→add)"
```

---

## Self-Review

**Cobertura do spec:**
- D1 (registry histórico) → Task 4 (gen-known-hashes + backfill git tags) + Task 3 (loadRegistry). ✓
- D2 (preservar+reportar) → Task 2 (`edited`→preserved) + Task 6 (skill reporta `preserved`). ✓
- D3 (`.context/.provenance.json`) → Task 1 (load/saveManifest). ✓
- D4 (skills+agents+standards; stacks fora) → Task 4 `distributableFiles` (skills/agents/standards); stacks não incluídos. ✓
- D5 (lib determinística, não prosa) → Tasks 1-3 (lib/CLI) + Task 6 (skills invocam). ✓
- Tabela 3-way (6 linhas) → Task 1 testes + Task 2/7 efeitos. ✓
- Bootstrap registry → Task 4 backfill + Task 5 append no bump. ✓
- Testes em tmpdir → todas as tasks. ✓

**Placeholder scan:** sem TBD/TODO; código real em todas as tasks de código; tasks de prosa (6) têm doc-lint verificável.

**Type consistency:** `hashFile`, `decideArtifact({projHash,pluginHash,recorded,registry})`, `loadManifest`/`saveManifest`, `applySync({projectRoot,artifacts,registry,sourceVersion})→{added,updated,current,preserved}`, `loadRegistry`, `distributableFiles`/`genFromWorkingTree`/`genBackfill` — nomes e assinaturas consistentes entre Tasks 1→7.

> Nota: Task 6 (prosa) ajusta a regra das skills; o critério de done é o doc-lint (referência ao CLI + `preserved`). A correção real de comportamento é exercida pelos E2E (Task 7) sobre a lib.
