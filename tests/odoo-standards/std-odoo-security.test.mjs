// tests/odoo-standards/std-odoo-security.test.mjs
// TDD do linter std-odoo-security.js (perfil Odoo, default DevFlow).
// Regra lintável (file-scoped): rota auth public/none + .sudo() no mesmo arquivo → VIOLATION.
// sudo() sozinho (sem rota pública) é human-review, NÃO viola.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-security.js",
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

describe("std-odoo-security linter", () => {
  it("BAD: rota auth='public' + .sudo() no mesmo arquivo → viola", () => {
    const r = lint(
      "controllers.py",
      [
        "from odoo import http",
        "from odoo.http import request",
        "",
        "class LeadController(http.Controller):",
        "    @http.route('/leads', type='http', auth='public')",
        "    def f(self):",
        "        return request.env['crm.lead'].sudo().search([])",
      ].join("\n"),
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION:/);
    assert.match(r.out, /public/);
    assert.match(r.out, /sudo/);
  });

  it('BAD: rota auth="public" (aspas duplas) + .sudo() → viola', () => {
    const r = lint(
      "controllers.py",
      [
        '    @http.route("/leads", type="http", auth="public")',
        "    def f(self):",
        "        return request.env['crm.lead'].sudo().search([])",
      ].join("\n"),
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION:/);
  });

  it("BAD: rota auth='none' + .sudo() → viola", () => {
    const r = lint(
      "controllers.py",
      [
        "    @http.route('/webhook', type='json', auth='none')",
        "    def hook(self):",
        "        return request.env['res.partner'].sudo().create({})",
      ].join("\n"),
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION:/);
  });

  it("GOOD: rota auth='user' sem sudo → exit 0", () => {
    const r = lint(
      "controllers.py",
      [
        "    @http.route('/leads', type='http', auth='user')",
        "    def f(self):",
        "        return request.env['crm.lead'].search([])",
      ].join("\n"),
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("GOOD: .sudo() sem rota pública → NÃO viola (sudo sozinho é human-review)", () => {
    const r = lint(
      "models.py",
      [
        "class Foo(models.Model):",
        "    _name = 'foo.bar'",
        "",
        "    def _do(self):",
        "        return self.env['res.users'].sudo().browse(1)",
      ].join("\n"),
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("GOOD: rota auth='public' SEM sudo → não viola (rota pública sozinha é aceitável)", () => {
    const r = lint(
      "controllers.py",
      [
        "    @http.route('/health', type='http', auth='public')",
        "    def health(self):",
        "        return 'ok'",
      ].join("\n"),
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("GOOD: rota auth='user' + .sudo() → não viola (sudo sob auth user é human-review)", () => {
    const r = lint(
      "controllers.py",
      [
        "    @http.route('/admin', type='http', auth='user')",
        "    def admin(self):",
        "        return request.env['res.partner'].sudo().search([])",
      ].join("\n"),
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("GATE: arquivo .xml → exit 0 sem processar", () => {
    const r = lint(
      "view.xml",
      "<record><field name='x' eval=\"@http.route auth='public' .sudo()\"/></record>",
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });
});
