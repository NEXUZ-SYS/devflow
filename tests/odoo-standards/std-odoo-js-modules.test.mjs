import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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

  // ---- Gate de série-alvo (ES modules são 16+) ----------------------------
  function lintInModule(manifestVersion, relpath, content) {
    const root = mkdtempSync(join(tmpdir(), "odoo-mod-"));
    writeFileSync(join(root, "__manifest__.py"), `{'name': 'M', 'version': '${manifestVersion}'}`);
    const parts = relpath.split("/");
    if (parts.length > 1) mkdirSync(join(root, ...parts.slice(0, -1)), { recursive: true });
    writeFileSync(join(root, relpath), content);
    try { execFileSync("node", [LINTER, join(root, relpath)], { encoding: "utf-8" }); return { code: 0 }; }
    catch (e) { return { code: e.status }; }
    finally { rmSync(root, { recursive: true, force: true }); }
  }

  it("NÃO flaga odoo.define num módulo série 12 (< 16)", () => {
    assert.equal(lintInModule("12.0.1.0.0", "static/src/a.js", `odoo.define('m', function (require) {});`).code, 0);
  });

  it("flaga odoo.define num módulo série 18 (>= 16)", () => {
    assert.equal(lintInModule("18.0.1.0.0", "static/src/a.js", `odoo.define('m', function (require) {});`).code, 1);
  });
});
