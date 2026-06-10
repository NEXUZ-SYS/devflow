import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-orm-discipline.js",
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

describe("std-odoo-orm-discipline linter", () => {
  // ---- Check 1: SQL injection via string interpolation -------------------

  it("flags SQL string interpolation com % (operador)", () => {
    const r = lint(
      "m.py",
      `self.env.cr.execute("SELECT id FROM t WHERE name='%s'" % name)`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags SQL f-string", () => {
    const r = lint("m.py", `cr.execute(f"SELECT {col} FROM t")`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags SQL .format()", () => {
    const r = lint(
      "m.py",
      `self._cr.execute("SELECT id FROM t WHERE n={}".format(name))`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags SQL concatenação com +", () => {
    const r = lint(
      "m.py",
      `cr.execute("SELECT id FROM t WHERE name='" + name + "'")`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("passes parametrized query (placeholder %s)", () => {
    const r = lint(
      "m.py",
      `self.env.cr.execute("SELECT id FROM t WHERE id IN %s", (tuple(ids),))`,
    );
    assert.equal(r.code, 0);
  });

  it("passes parametrized query simples sem interpolação", () => {
    const r = lint(
      "m.py",
      `cr.execute("SELECT id FROM t WHERE id IN %s", (ids,))`,
    );
    assert.equal(r.code, 0);
  });

  // ---- Check 2: commit cru -----------------------------------------------

  it("flags cr.commit()", () => {
    const r = lint("m.py", `cr.commit()`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags self.env.cr.commit()", () => {
    const r = lint("m.py", `self.env.cr.commit()`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags self._cr.commit()", () => {
    const r = lint("m.py", `self._cr.commit()`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  // ---- GOOD: arquivo só com ORM ------------------------------------------

  it("passes arquivo só com ORM (search)", () => {
    const r = lint(
      "m.py",
      `def f(self):\n    return self.search([('x', '=', 1)])\n`,
    );
    assert.equal(r.code, 0);
  });

  // ---- Gate por extensão --------------------------------------------------

  it("ignores non-py files (.xml)", () => {
    const r = lint("x.xml", `cr.commit()`);
    assert.equal(r.code, 0);
  });

  it("ignores non-py files (.js)", () => {
    const r = lint(
      "x.js",
      `cr.execute("SELECT id FROM t WHERE n='%s'" % name)`,
    );
    assert.equal(r.code, 0);
  });
});
