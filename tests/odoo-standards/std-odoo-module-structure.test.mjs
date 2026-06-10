import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-module-structure.js",
);

// monta um módulo {files: {relpath: content}} e roda o linter no __manifest__.py
function lintModule(files) {
  const root = mkdtempSync(join(tmpdir(), "odoo-mod-"));
  for (const [rel, content] of Object.entries(files)) {
    const fp = join(root, rel);
    mkdirSync(join(fp, ".."), { recursive: true });
    writeFileSync(fp, content);
  }
  const manifest = join(root, "__manifest__.py");
  try {
    execFileSync("node", [LINTER, manifest], { encoding: "utf-8" });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "").toString() };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// roda o linter num arquivo arbitrário (não-manifest) para testar o gate
function lintFile(filename, content) {
  const root = mkdtempSync(join(tmpdir(), "odoo-mod-"));
  const fp = join(root, filename);
  writeFileSync(fp, content);
  try {
    execFileSync("node", [LINTER, fp], { encoding: "utf-8" });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "").toString() };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("std-odoo-module-structure", () => {
  it("flags módulo sem README.rst", () => {
    const r = lintModule({
      "__manifest__.py": "{'name':'M'}",
      "models/foo.py": "class Foo(models.Model): _name='m.foo'",
    });
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /README/);
  });

  it("flags README.md presente mas .rst ausente (use README.rst)", () => {
    const r = lintModule({
      "__manifest__.py": "{'name':'M'}",
      "README.md": "# M",
      "models/foo.py": "class Foo(models.Model): _name='m.foo'",
    });
    assert.equal(r.code, 1);
    assert.match(r.out, /README\.rst/);
    assert.match(r.out, /README\.md/);
  });

  it("flags model definido na raiz do módulo (foo.py)", () => {
    const r = lintModule({
      "__manifest__.py": "{'name':'M'}",
      "README.rst": "x",
      "foo.py": "class Foo(models.Model): _name='m.foo'",
    });
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /foo\.py/);
    assert.match(r.out, /models\//);
  });

  it("detecta TransientModel na raiz como model", () => {
    const r = lintModule({
      "__manifest__.py": "{'name':'M'}",
      "README.rst": "x",
      "wiz.py": "class W(models.TransientModel): _name='m.wiz'",
    });
    assert.equal(r.code, 1);
    assert.match(r.out, /wiz\.py/);
  });

  it("não confunde __init__.py nem o próprio manifest com model na raiz", () => {
    const r = lintModule({
      "__manifest__.py": "{'name':'M'}",
      "README.rst": "x",
      "__init__.py": "from . import models",
      "models/__init__.py": "from . import foo",
      "models/foo.py": "class Foo(models.Model): _name='m.foo'",
    });
    assert.equal(r.code, 0);
  });

  it("aceita módulo GOOD (README.rst + model em models/)", () => {
    const r = lintModule({
      "__manifest__.py": "{'name':'M'}",
      "README.rst": "x",
      "__init__.py": "from . import models",
      "models/__init__.py": "from . import foo",
      "models/foo.py": "class Foo(models.Model): _name='m.foo'",
    });
    assert.equal(r.code, 0);
  });

  it("não flaga .py na raiz que não define model (apenas helper)", () => {
    const r = lintModule({
      "__manifest__.py": "{'name':'M'}",
      "README.rst": "x",
      "utils.py": "def helper():\n    return 42",
    });
    assert.equal(r.code, 0);
  });

  it("aceita também __openerp__.py como âncora de manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "odoo-mod-"));
    writeFileSync(join(root, "__openerp__.py"), "{'name':'M'}");
    writeFileSync(join(root, "README.rst"), "x");
    const fp = join(root, "__openerp__.py");
    let r;
    try {
      execFileSync("node", [LINTER, fp], { encoding: "utf-8" });
      r = { code: 0, out: "" };
    } catch (e) {
      r = { code: e.status, out: (e.stdout || "").toString() };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    assert.equal(r.code, 0);
  });

  it("GATE: ignora arquivo que não é manifest (models.py) → exit 0", () => {
    const r = lintFile("models.py", "class Foo(models.Model): _name='m.foo'");
    assert.equal(r.code, 0);
  });
});
