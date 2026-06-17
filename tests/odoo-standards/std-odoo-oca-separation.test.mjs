import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/nxz/machine/std-odoo-oca-separation.js",
);

// Monta um módulo Odoo em tmpdir e roda o linter ancorado no __manifest__.py.
// Retorna { code, out }. Espelha o helper de std-odoo-module-structure.
function lintModule(files) {
  const root = mkdtempSync(join(tmpdir(), "odoo-mod-"));
  for (const [rel, content] of Object.entries(files)) {
    const fp = join(root, rel);
    mkdirSync(join(fp, ".."), { recursive: true });
    writeFileSync(fp, content);
  }
  try {
    execFileSync("node", [LINTER, join(root, "__manifest__.py")], {
      encoding: "utf-8",
    });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "").toString() };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Roda o linter diretamente num caminho arbitrário (sem montar módulo).
function lintPath(fp) {
  try {
    const out = execFileSync("node", [LINTER, fp], { encoding: "utf-8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "").toString() };
  }
}

describe("std-odoo-oca-separation", () => {
  it("BAD: módulo de terceiro (OCA) que define campo nxz_* → viola", () => {
    const { code, out } = lintModule({
      "__manifest__.py": "{'name':'L10n','author':'OCA'}",
      "models/account.py":
        "class A(models.Model):\n    _inherit='account.move'\n    nxz_custom = fields.Char()",
    });
    assert.equal(code, 1);
    assert.match(out, /VIOLATION/);
    assert.match(out, /nxz_/);
    assert.match(out, /OCA/);
  });

  it("GOOD: módulo NXZ (author='Nexuz') com campo nxz_* → ok", () => {
    const { code } = lintModule({
      "__manifest__.py": "{'name':'B','author':'Nexuz'}",
      "models/x.py":
        "class X(models.Model):\n    nxz_custom = fields.Char()",
    });
    assert.equal(code, 0);
  });

  it("GOOD: módulo de terceiro (OCA) sem campo nxz_* → ok", () => {
    const { code } = lintModule({
      "__manifest__.py": "{'name':'L','author':'OCA'}",
      "models/x.py":
        "class X(models.Model):\n    _inherit='res.partner'\n    extra = fields.Char()",
    });
    assert.equal(code, 0);
  });

  it("GOOD: terceiro sem author no manifest → indeterminado, não flaga", () => {
    const { code } = lintModule({
      "__manifest__.py": "{'name':'Sem autor'}",
      "models/x.py":
        "class X(models.Model):\n    nxz_custom = fields.Char()",
    });
    assert.equal(code, 0);
  });

  it("GOOD: terceiro com nxz_* no .py do topo do módulo → viola (varredura rasa)", () => {
    const { code, out } = lintModule({
      "__manifest__.py": "{'name':'Top','author':'OCA'}",
      "extra.py":
        "class Y(models.Model):\n    nxz_top = fields.Char()",
    });
    assert.equal(code, 1);
    assert.match(out, /nxz_/);
  });

  it("GATE: linter direto num arquivo não-manifest → exit 0", () => {
    const { code } = lintPath(resolve(import.meta.dirname, "models.py"));
    assert.equal(code, 0);
  });
});
