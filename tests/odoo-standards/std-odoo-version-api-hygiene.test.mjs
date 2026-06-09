import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-version-api-hygiene.js",
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

describe("std-odoo-version-api-hygiene linter", () => {
  // ---- BAD .py ------------------------------------------------------------

  it("flags .search(..., count=True)", () => {
    const r = lint("m.py", `recs = self.search(domain, count=True)`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags def name_get(self)", () => {
    const r = lint("m.py", `def name_get(self):\n    return []`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags .invalidate_cache()", () => {
    const r = lint("m.py", `self.invalidate_cache()`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags @api.multi", () => {
    const r = lint("m.py", `@api.multi\ndef f(self):\n    pass`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags @api.one", () => {
    const r = lint("m.py", `@api.one\ndef f(self):\n    pass`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags _columns =", () => {
    const r = lint("m.py", `_columns = {}`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags _defaults =", () => {
    const r = lint("m.py", `_defaults = {}`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("reporta múltiplos símbolos numa só linha de contagem", () => {
    const r = lint(
      "m.py",
      `@api.multi\ndef name_get(self):\n    return self.search(d, count=True)`,
    );
    assert.equal(r.code, 1);
    // 3 símbolos distintos: @api.multi, name_get, search count=True
    assert.match(r.out, /3 símbolo/);
  });

  // ---- GOOD .py -----------------------------------------------------------

  it("passes search_count()", () => {
    const r = lint("m.py", `n = self.search_count(domain)`);
    assert.equal(r.code, 0);
  });

  it("passes _compute_display_name", () => {
    const r = lint(
      "m.py",
      `def _compute_display_name(self):\n    for r in self:\n        r.display_name = r.name`,
    );
    assert.equal(r.code, 0);
  });

  it("passes invalidate_recordset()", () => {
    const r = lint("m.py", `self.invalidate_recordset()`);
    assert.equal(r.code, 0);
  });

  it("passes arquivo .py limpo (api.depends não é flagado)", () => {
    const r = lint(
      "m.py",
      `@api.depends('name')\ndef _compute(self):\n    pass`,
    );
    assert.equal(r.code, 0);
  });

  // ---- BAD .xml -----------------------------------------------------------

  it("flags <tree string=...>", () => {
    const r = lint("v.xml", `<tree string="x"><field name="a"/></tree>`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags attrs= em field", () => {
    const r = lint(
      "v.xml",
      `<field name="x" attrs="{'invisible': [('active','=',False)]}"/>`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags attrs = (com espaço)", () => {
    const r = lint("v.xml", `<field name="x" attrs = "{}"/>`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  // ---- GOOD .xml ----------------------------------------------------------

  it("passes <list string=...>", () => {
    const r = lint("v.xml", `<list string="x"><field name="a"/></list>`);
    assert.equal(r.code, 0);
  });

  it("passes field com invisible inline", () => {
    const r = lint("v.xml", `<field name="x" invisible="not active"/>`);
    assert.equal(r.code, 0);
  });

  it("não confunde <treeview> com <tree>", () => {
    const r = lint("v.xml", `<treeview string="x"/>`);
    assert.equal(r.code, 0);
  });

  // ---- Gate por extensão --------------------------------------------------

  it("ignores non-py/xml files (.js)", () => {
    const r = lint("x.js", `var attrs = 1; function name_get(){}`);
    assert.equal(r.code, 0);
  });

  it("ignores files sem extensão alvo (.txt)", () => {
    const r = lint("x.txt", `<tree> attrs= name_get @api.multi`);
    assert.equal(r.code, 0);
  });
});
