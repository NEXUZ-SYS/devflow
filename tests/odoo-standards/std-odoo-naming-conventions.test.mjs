import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-naming-conventions.js",
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

describe("std-odoo-naming-conventions linter", () => {
  // ---- Check 1: Many2one sem sufixo _id ----------------------------------

  it("flags Many2one sem sufixo _id", () => {
    const r = lint("m.py", `    partner = fields.Many2one('res.partner')`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /partner/);
  });

  it("passes Many2one com sufixo _id", () => {
    const r = lint("m.py", `    partner_id = fields.Many2one('res.partner')`);
    assert.equal(r.code, 0);
  });

  it("não flaga campo que já termina em _id (related_id)", () => {
    const r = lint("m.py", `    related_id = fields.Many2one('res.partner')`);
    assert.equal(r.code, 0);
  });

  // ---- Check 2: One2many/Many2many sem sufixo _ids -----------------------

  it("flags One2many sem sufixo _ids", () => {
    const r = lint("m.py", `    lines = fields.One2many('x', 'y')`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /lines/);
  });

  it("flags Many2many sem sufixo _ids", () => {
    const r = lint("m.py", `    tags = fields.Many2many('t')`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /tags/);
  });

  it("passes One2many com sufixo _ids", () => {
    const r = lint("m.py", `    line_ids = fields.One2many('x', 'y')`);
    assert.equal(r.code, 0);
  });

  it("passes Many2many com sufixo _ids", () => {
    const r = lint("m.py", `    tag_ids = fields.Many2many('t')`);
    assert.equal(r.code, 0);
  });

  // ---- Check 3: prefixo de método compute incorreto ----------------------

  it("flags @api.depends seguido de def sem prefixo _compute_", () => {
    const r = lint(
      "m.py",
      `    @api.depends('a')\n    def compute_total(self):\n        pass\n`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /compute_total/);
  });

  it("passes @api.depends seguido de def com prefixo _compute_", () => {
    const r = lint(
      "m.py",
      `    @api.depends('a')\n    def _compute_total(self):\n        pass\n`,
    );
    assert.equal(r.code, 0);
  });

  // ---- GOOD: arquivo bem nomeado completo --------------------------------

  it("passes arquivo com campos e compute bem nomeados", () => {
    const r = lint(
      "m.py",
      [
        "class SaleOrder(models.Model):",
        "    _name = 'sale.order'",
        "    _description = 'Sale Order'",
        "    partner_id = fields.Many2one('res.partner')",
        "    line_ids = fields.One2many('sale.order.line', 'order_id')",
        "    tag_ids = fields.Many2many('crm.tag')",
        "    amount_total = fields.Float(compute='_compute_total')",
        "",
        "    @api.depends('line_ids')",
        "    def _compute_total(self):",
        "        pass",
        "",
      ].join("\n"),
    );
    assert.equal(r.code, 0);
  });

  // ---- Gate por extensão --------------------------------------------------

  it("ignores non-py files (.xml)", () => {
    const r = lint("x.xml", `partner = fields.Many2one('res.partner')`);
    assert.equal(r.code, 0);
  });

  it("ignores non-py files (.js)", () => {
    const r = lint("x.js", `lines = fields.One2many('x', 'y')`);
    assert.equal(r.code, 0);
  });
});
