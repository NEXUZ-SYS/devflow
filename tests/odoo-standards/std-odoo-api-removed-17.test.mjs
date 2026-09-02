import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-api-removed-17.js",
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

describe("std-odoo-api-removed-17 — regras Python removidas no 17", () => {
  for (const [label, code, re] of [
    ["name_get", "def name_get(self):\n    pass", /name_get/],
    ["@api.multi", "@api.multi\ndef f(self): pass", /api\.(one|multi)/],
    ["invalidate_cache", "self.invalidate_cache()", /invalidate_cache/],
    ["search(count=True)", "self.env['x'].search([], count=True)", /count=True/],
    ["_columns", "_columns = {}", /_columns/],
    ["_defaults", "_defaults = {}", /_defaults/],
  ]) {
    it(`acusa ${label}`, () => {
      const r = lint("m.py", code);
      assert.equal(r.code, 1, `${label} deveria violar`);
      assert.match(r.out, re);
    });
  }

  it("acusa @api.one também", () => {
    const r = lint("m.py", "@api.one\ndef f(self): pass");
    assert.equal(r.code, 1);
    assert.match(r.out, /api\.(one|multi)/);
  });

  it("reporta múltiplos símbolos numa só linha de contagem", () => {
    const r = lint("m.py", "@api.multi\ndef name_get(self):\n    self.invalidate_cache()");
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION: 3 /);
  });

  for (const [label, code] of [
    ["search_count()", "self.env['x'].search_count([])"],
    ["_compute_display_name", "def _compute_display_name(self):\n    pass"],
    ["invalidate_recordset()", "self.invalidate_recordset()"],
    ["api.depends limpo", "@api.depends('name')\ndef _compute(self): pass"],
  ]) {
    it(`não acusa ${label}`, () => {
      assert.equal(lint("m.py", code).code, 0, `${label} é a forma correta`);
    });
  }

  it("ignora extensões fora do alvo (.js, .txt)", () => {
    assert.equal(lint("a.js", "def name_get(): pass").code, 0);
    assert.equal(lint("a.txt", "def name_get(): pass").code, 0);
  });

  it("ignora .xml — as regras XML são do -18", () => {
    assert.equal(lint("v.xml", "<odoo><tree/></odoo>").code, 0);
  });

  it("NÃO resolve versão por conta própria", () => {
    const src = readFileSync(LINTER, "utf-8");
    assert.doesNotMatch(src, /function\s+odooTargetSeries/);
    assert.doesNotMatch(src, /const\s+MIN_SERIES/);
    assert.doesNotMatch(src, /odooTargetSeries\s*\(/);
  });
});
