// Suite — seleção e transform da materialização dos standards default.
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
