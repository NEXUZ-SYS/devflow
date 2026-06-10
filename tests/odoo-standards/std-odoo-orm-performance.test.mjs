import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-orm-performance.js",
);

// Executa o linter num arquivo temporário e devolve { code, out }.
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

describe("std-odoo-orm-performance", () => {
  describe("BAD — chamada ORM dentro de loop (N+1)", () => {
    it("flaga .search( dentro de for", () => {
      const content = [
        "def compute_lines(self):",
        "    for order in self:",
        "        lines = self.env['sale.order.line'].search([('order_id','=',order.id)])",
      ].join("\n");
      const r = lint("models.py", content);
      assert.equal(r.code, 1);
      assert.match(r.out, /VIOLATION:/);
      assert.match(r.out, /search/);
      assert.match(r.out, /N\+1/);
    });

    it("flaga .browse( dentro de for", () => {
      const content = [
        "def f(self):",
        "    for rec in records:",
        "        partner = self.env['res.partner'].browse(rec.partner_id)",
      ].join("\n");
      const r = lint("models.py", content);
      assert.equal(r.code, 1);
      assert.match(r.out, /browse/);
    });

    it("flaga .search_count( dentro de for", () => {
      const content = [
        "def f(self):",
        "    for order in self:",
        "        n = self.env['sale.order.line'].search_count([('order_id','=',order.id)])",
      ].join("\n");
      const r = lint("models.py", content);
      assert.equal(r.code, 1);
      assert.match(r.out, /search_count/);
    });

    it("flaga .read_group( dentro de for", () => {
      const content = [
        "def f(self):",
        "    for order in self:",
        "        g = self.env['sale.order.line'].read_group([], ['amount'], ['order_id'])",
      ].join("\n");
      const r = lint("models.py", content);
      assert.equal(r.code, 1);
      assert.match(r.out, /read_group/);
    });

    it("flaga ._read_group( dentro de for", () => {
      const content = [
        "def f(self):",
        "    for order in self:",
        "        g = self.env['sale.order.line']._read_group([], ['amount'], ['order_id'])",
      ].join("\n");
      const r = lint("models.py", content);
      assert.equal(r.code, 1);
      assert.match(r.out, /_read_group/);
    });

    it("flaga chamada ORM em corpo aninhado profundo do for", () => {
      const content = [
        "def f(self):",
        "    for order in self:",
        "        if order.state == 'done':",
        "            lines = self.env['sale.order.line'].search([('order_id','=',order.id)])",
      ].join("\n");
      const r = lint("models.py", content);
      assert.equal(r.code, 1);
      assert.match(r.out, /search/);
    });
  });

  describe("GOOD — não deve flagar", () => {
    it("search FORA do loop (em lote) passa com exit 0", () => {
      const content = [
        "def f(self):",
        "    lines = self.env['sale.order.line'].search([('order_id','in',self.ids)])",
        "    for order in self:",
        "        pass",
      ].join("\n");
      const r = lint("models.py", content);
      assert.equal(r.code, 0);
      assert.equal(r.out, "");
    });

    it("for vazio (pass) passa com exit 0", () => {
      const content = ["def f(self):", "    for order in self:", "        pass"].join(
        "\n",
      );
      const r = lint("models.py", content);
      assert.equal(r.code, 0);
    });

    it("browse em lote ANTES do loop passa", () => {
      const content = [
        "def f(self):",
        "    partners = self.env['res.partner'].browse(self.ids)",
        "    for p in partners:",
        "        x = p.name",
      ].join("\n");
      const r = lint("models.py", content);
      assert.equal(r.code, 0);
    });

    it("chamada ORM após o for (dedent) não é flagada", () => {
      const content = [
        "def f(self):",
        "    for order in self:",
        "        order.flag = True",
        "    lines = self.env['sale.order.line'].search([('order_id','in',self.ids)])",
      ].join("\n");
      const r = lint("models.py", content);
      assert.equal(r.code, 0);
    });
  });

  describe("GATE — extensões não-.py", () => {
    it(".xml sai com exit 0", () => {
      const r = lint("view.xml", "<for>.search(</for>");
      assert.equal(r.code, 0);
    });

    it(".js sai com exit 0", () => {
      const r = lint("widget.js", "for (x) { .search( }");
      assert.equal(r.code, 0);
    });
  });
});
