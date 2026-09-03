// Suite — seleção e transform da materialização dos standards default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listProjectFiles, selectDefaults, retargetLinter, projectLinterRel,
  resolveMaterializedStandards,
} from "../../scripts/lib/standards-materialize.mjs";

const PLUGIN = process.cwd();
const R = "tests/fixtures/standards-materialize";

test("listProjectFiles devolve caminhos relativos com / e ignora dotdirs", () => {
  const files = listProjectFiles(join(R, "odoo-py"));
  assert.ok(files.includes("addons/m/models/model.py"));
  assert.ok(files.every((f) => !f.startsWith(".")), "dotdirs ficam fora");
  assert.ok(files.every((f) => !f.includes("\\")), "separador normalizado para /");
});

test("listProjectFiles respeita o teto de arquivos", () => {
  const files = listProjectFiles(join(R, "odoo-py"), 2);
  assert.equal(files.length, 2, "o walk para no teto — pergunta booleana não precisa do repo inteiro");
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

// ─── transform do enforcement.linter (Task 3) ───────────────────────────────

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

test("retargetLinter não toca warn-only (linter: null é o valor do bundle)", () => {
  const md = `---\nid: std-caching\nenforcement:\n  linter: null\n---\n`;
  assert.equal(retargetLinter(md, "std-caching"), md, "sem linter, nada a retargetar");
});

test("retargetLinter preserva o corpo byte-a-byte", () => {
  const body = "\n# Standard\n\n## Princípios\n\nTexto com `linter: machine/x.js` no corpo.\n";
  const md = `---\nid: std-security\nenforcement:\n  linter: machine/std-security.js\n---${body}`;
  const out = retargetLinter(md, "std-security");
  assert.ok(out.endsWith(body), "só o frontmatter muda; o corpo é intocado");
});

test("projectLinterRel é o path relativo a .context/ (base do sandbox project)", () => {
  assert.equal(projectLinterRel("std-security"), "engineering/standards/machine/std-security.js");
});

test("TODOS os defaults com linter sobrevivem ao transform sem virar null", () => {
  // A invariante e sobre os 26 defaults do bundle, nao sobre os selecionados de
  // um fixture: em ts-src so 17 casam (accessibility, design-antipatterns e
  // visual-quality exigem .css/.html/.tsx, ausentes ali).
  const dir = join(PLUGIN, "assets", "standards");
  const comLinter = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => ({ id: f.replace(/\.md$/, ""), mdSrc: join(dir, f) }))
    .filter(({ id }) => existsSync(join(dir, "machine", `${id}.js`)));
  assert.equal(comLinter.length, 20, "o bundle tem 20 defaults com linter");
  for (const { id, mdSrc } of comLinter) {
    const out = retargetLinter(readFileSync(mdSrc, "utf-8"), id);
    assert.match(out, new RegExp(`linter: engineering/standards/machine/${id}\\.js`), `${id} não retargetado`);
    assert.doesNotMatch(out, /linter:\s*null/, `${id} virou null`);
  }
});

// ─── artefatos no formato do applySync (Task 5) ─────────────────────────────

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

test("todo dest cai dentro de .context/engineering/standards/", () => {
  const arts = resolveMaterializedStandards({ projectRoot: join(R, "ts-src"), pluginRoot: PLUGIN });
  assert.ok(arts.length > 0);
  for (const a of arts) {
    assert.match(a.dest, /\.context\/engineering\/standards\//, `dest fora do diretório: ${a.dest}`);
  }
});
