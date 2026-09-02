import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-api-removed-18.js",
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

describe("std-odoo-api-removed-18 — regras XML removidas no 18", () => {
  it("acusa <tree>", () => {
    const r = lint("views.xml", '<odoo><tree string="X"><field name="n"/></tree></odoo>');
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION:.*tree/i);
  });

  it("acusa attrs=", () => {
    const r = lint("views.xml", '<odoo><field name="n" attrs="{\'invisible\': 1}"/></odoo>');
    assert.equal(r.code, 1);
    assert.match(r.out, /attrs/);
  });

  it("não acusa XML já migrado para <list> e inline", () => {
    const r = lint("views.xml", '<odoo><list string="X"><field name="n" invisible="1"/></list></odoo>');
    assert.equal(r.code, 0);
  });

  it("acusa attrs = com espaço antes do igual", () => {
    const r = lint("views.xml", '<odoo><field name="n" attrs = "{}"/></odoo>');
    assert.equal(r.code, 1);
    assert.match(r.out, /attrs/);
  });

  it("NÃO confunde <treeview> com <tree>", () => {
    assert.equal(lint("views.xml", "<odoo><treeview/></odoo>").code, 0);
  });

  it("reporta múltiplos símbolos numa só linha de contagem", () => {
    const r = lint("views.xml", '<odoo><tree><field name="n" attrs="{}"/></tree></odoo>');
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION: 2 /);
  });

  it("ignora extensões fora do alvo (.js, .txt)", () => {
    assert.equal(lint("a.js", "<tree/>").code, 0);
    assert.equal(lint("a.txt", "<tree/>").code, 0);
  });

  it("ignora .py — as regras Python são do -17", () => {
    assert.equal(lint("m.py", "def name_get(self): pass").code, 0);
  });

  it("NÃO resolve versão por conta própria — quem decide se roda é a faixa", () => {
    const src = readFileSync(LINTER, "utf-8");
    // Asserção sobre DEFINIÇÃO/USO, não sobre a palavra: o comentário do linter
    // explica por que a resolução saiu dele, e citar o nome ali é desejável.
    assert.doesNotMatch(src, /function\s+odooTargetSeries/, "linter não pode definir resolução de série");
    assert.doesNotMatch(src, /const\s+MIN_SERIES/, "linter não pode ter gate de série próprio");
    assert.doesNotMatch(src, /odooTargetSeries\s*\(/, "linter não pode chamar resolução de série");
  });
});
