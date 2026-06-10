import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-computed-fields.js",
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

describe("std-odoo-computed-fields linter", () => {
  // ---- Check 1: compute sem @api.depends ----------------------------------

  it("flags compute sem @api.depends", () => {
    const r = lint(
      "m.py",
      `def _compute_total(self):
    for record in self:
        record.total = record.a + record.b
`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /@api\.depends/);
    assert.match(r.out, /_compute_total/);
  });

  // ---- Check 2: compute sem 'for record in self' --------------------------

  it("flags compute sem 'for record in self'", () => {
    const r = lint(
      "m.py",
      `@api.depends('a', 'b')
def _compute_total(self):
    self.total = self.a + self.b
`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /for record in self/);
    assert.match(r.out, /_compute_total/);
  });

  // ---- Fixture BAD do enunciado: viola 2x (sem depends + sem for) ----------

  it("flags BAD do enunciado com 2 problemas (sem depends e sem for)", () => {
    const r = lint(
      "m.py",
      `def _compute_total(self):
    self.total = self.a + self.b
`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /@api\.depends/);
    assert.match(r.out, /for record in self/);
  });

  // ---- Check 3: write() dentro de compute ---------------------------------

  it("flags write() dentro de _compute_", () => {
    const r = lint(
      "m.py",
      `@api.depends('a')
def _compute_total(self):
    for record in self:
        record.write({'total': record.a})
`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /write\(\)/);
    assert.match(r.out, /_compute_total/);
  });

  // ---- GOOD: compute correto (exit 0) -------------------------------------

  it("passes compute correto (depends + for record in self)", () => {
    const r = lint(
      "m.py",
      `@api.depends('a', 'b')
def _compute_total(self):
    for record in self:
        record.total = record.a + record.b
`,
    );
    assert.equal(r.code, 0);
  });

  it("passes compute com depends_context junto de depends", () => {
    const r = lint(
      "m.py",
      `@api.depends('a')
@api.depends_context('lang')
def _compute_name(self):
    for rec in self:
        rec.name = rec.a
`,
    );
    assert.equal(r.code, 0);
  });

  it("passes arquivo sem nenhum _compute_", () => {
    const r = lint(
      "m.py",
      `def action_confirm(self):
    self.state = 'done'
    return True
`,
    );
    assert.equal(r.code, 0);
  });

  // ---- Múltiplos métodos: distingue o nome na mensagem --------------------

  it("distingue métodos diferentes na mensagem", () => {
    const r = lint(
      "m.py",
      `@api.depends('a', 'b')
def _compute_total(self):
    for record in self:
        record.total = record.a + record.b

def _compute_label(self):
    self.label = 'x'
`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /_compute_label/);
    assert.doesNotMatch(r.out, /_compute_total/);
  });

  // ---- Gate por extensão --------------------------------------------------

  it("ignores non-py files (.xml)", () => {
    const r = lint(
      "x.xml",
      `def _compute_total(self):
    self.total = 1
`,
    );
    assert.equal(r.code, 0);
  });

  it("ignores non-py files (.js)", () => {
    const r = lint(
      "x.js",
      `def _compute_total(self):
    self.total = 1
`,
    );
    assert.equal(r.code, 0);
  });
});
