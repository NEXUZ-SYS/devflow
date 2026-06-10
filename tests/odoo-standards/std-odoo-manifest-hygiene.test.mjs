import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-manifest-hygiene.js",
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

describe("std-odoo-manifest-hygiene", () => {
  it("flags version mal-formada (3 segmentos)", () => {
    const r = lint(
      "__manifest__.py",
      "{'name': 'M', 'version': '1.0.0', 'license': 'LGPL-3'}",
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /version/);
  });

  it("flags manifest sem 'name'", () => {
    const r = lint(
      "__manifest__.py",
      "{'version': '18.0.1.0.0', 'license': 'LGPL-3'}",
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /name/);
  });

  it("flags manifest sem 'license'", () => {
    const r = lint("__manifest__.py", "{'name': 'M', 'version': '18.0.1.0.0'}");
    assert.equal(r.code, 1);
    assert.match(r.out, /license/);
  });

  it("flags manifest sem 'version' (warning brando)", () => {
    const r = lint("__manifest__.py", "{'name': 'M', 'license': 'LGPL-3'}");
    assert.equal(r.code, 1);
    assert.match(r.out, /version/);
  });

  it("aceita manifest GOOD (5 segmentos, name e license presentes)", () => {
    const r = lint(
      "__manifest__.py",
      "{'name': 'M', 'version': '18.0.1.0.0', 'license': 'LGPL-3', 'depends': ['base']}",
    );
    assert.equal(r.code, 0);
  });

  it("aceita também __openerp__.py como manifest", () => {
    const r = lint(
      "__openerp__.py",
      "{'version': '1.0.0', 'license': 'LGPL-3'}",
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /name/);
  });

  it("ignora arquivo que não é manifest (models.py) → exit 0", () => {
    const r = lint(
      "models.py",
      "{'name': 'M', 'version': '1.0.0'}  # não é manifest",
    );
    assert.equal(r.code, 0);
  });
});
