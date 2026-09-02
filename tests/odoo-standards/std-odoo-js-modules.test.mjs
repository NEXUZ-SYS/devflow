import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-js-modules.js",
);

function lint(filename, content) {
  const dir = mkdtempSync(join(tmpdir(), "odoo-std-"));
  const fp = join(dir, filename);
  writeFileSync(fp, content);
  try {
    execFileSync("node", [LINTER, fp], { encoding: "utf-8" });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "").toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("std-odoo-js-modules linter", () => {
  // ---- Check 1: odoo.define() legado -------------------------------------

  it("flags odoo.define()", () => {
    const r = lint(
      "m.js",
      `odoo.define('web.Foo', function (require) { var core = require('web.core'); });`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags odoo.define() com espaço antes do parêntese", () => {
    const r = lint("m.js", `odoo.define ('web.Bar', function () {});`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  // ---- Check 2: require() AMD legado -------------------------------------

  it("flags require() AMD via atribuição (= require)", () => {
    const r = lint("m.js", `var rpc = require('web.rpc');`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags require() AMD via assinatura function (require)", () => {
    const r = lint(
      "m.js",
      `(function (require) { var core = require('web.core'); })();`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  // ---- GOOD: ES module (import/export) -----------------------------------

  it("passes ES module com import/export", () => {
    const r = lint(
      "m.js",
      `/** @odoo-module **/\nimport { registry } from "@web/core/registry";\nexport const x = 1;\n`,
    );
    assert.equal(r.code, 0);
  });

  it("passes ES module com import de @point_of_sale", () => {
    const r = lint(
      "m.js",
      `/** @odoo-module **/\nimport { PosStore } from "@point_of_sale/app/store/pos_store";\nexport function f() { return PosStore; }\n`,
    );
    assert.equal(r.code, 0);
  });

  it("não flaga import ES (não confunde com require AMD)", () => {
    const r = lint(
      "m.js",
      `import { x } from "@web/core/y";\nexport function g() { return x; }\n`,
    );
    assert.equal(r.code, 0);
  });

  // ---- Gate por extensão --------------------------------------------------

  it("ignores non-js files (.py)", () => {
    const r = lint("x.py", `odoo.define('web.Foo', function (require) {});`);
    assert.equal(r.code, 0);
  });

  it("ignores non-js files (.xml)", () => {
    const r = lint("x.xml", `var rpc = require('web.rpc');`);
    assert.equal(r.code, 0);
  });

  // ---- Faixa de serie: MIGROU do linter para o frontmatter -----------------
  //
  // Estes testes cobriam `odooTargetSeries` + MIN_SERIES DENTRO do linter.
  // Quatro linters mantinham a propria copia dessa funcao e uma delas ja havia
  // divergido. A resolucao saiu do linter: agora e `appliesFrom` no frontmatter,
  // avaliada uma unica vez por findApplicableStandards contra a serie do
  // projeto. O invariante ("modulo de serie antiga nao e flagado") continua
  // coberto — em tests/integration/test-profile-standards-wiring.mjs.
  it("declara appliesFrom: 16 no frontmatter — o gate nao vive mais aqui", () => {
    const fm = readFileSync(
      resolve(import.meta.dirname, "../../assets/standards/profiles/odoo/std-odoo-js-modules.md"),
      "utf-8",
    );
    assert.match(fm, /^appliesFrom: "16"$/m, "piso da serie deve estar no frontmatter");
  });

  it("o linter NAO resolve serie por conta propria", () => {
    const src = readFileSync(LINTER, "utf-8");
    assert.doesNotMatch(src, /function\s+odooTargetSeries/);
    assert.doesNotMatch(src, /const\s+MIN_SERIES/);
  });
});
