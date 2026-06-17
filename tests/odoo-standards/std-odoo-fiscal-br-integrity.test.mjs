import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/nxz/machine/std-odoo-fiscal-br-integrity.js",
);

// Helper: cria arquivo temporário, roda o linter via subprocesso e devolve {code, out}.
// Diretório temporário sempre removido — nunca muta paths versionados.
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

describe("std-odoo-fiscal-br-integrity — gate de extensão", () => {
  it("ignora arquivos não-.py/.xml (exit 0, sem saída)", () => {
    const r = lint("notas.txt", "ind_pres = '0'\nserie = '003'\n");
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });
});

describe("std-odoo-fiscal-br-integrity — ind_pres presencial errado (.py)", () => {
  it("flag ind_pres = \"0\" (atribuição com aspas duplas)", () => {
    const r = lint("models.py", 'ind_pres = "0"\n');
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION:/);
    assert.match(r.out, /ind_pres/);
    assert.match(r.out, /717/);
  });

  it("flag 'ind_pres': '0' (chave de dict)", () => {
    const r = lint("models.py", "vals = {'ind_pres': '0'}\n");
    assert.equal(r.code, 1);
    assert.match(r.out, /717/);
  });

  it("flag ind_pres=\"0\" (sem espaços, kwarg-style)", () => {
    const r = lint("models.py", 'self.create(ind_pres="0")\n');
    assert.equal(r.code, 1);
  });

  it("NÃO flag ind_pres = '1' (presencial correto)", () => {
    const r = lint("models.py", "ind_pres = '1'\n");
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("NÃO flag 'ind_pres': '1' (dict correto)", () => {
    const r = lint("models.py", "vals = {'ind_pres': '1'}\n");
    assert.equal(r.code, 0);
  });
});

describe("std-odoo-fiscal-br-integrity — série com zero à esquerda (.py)", () => {
  it("flag serie = \"003\" (zero à esquerda)", () => {
    const r = lint("models.py", 'serie = "003"\n');
    assert.equal(r.code, 1);
    assert.match(r.out, /s[ée]rie/i);
    assert.match(r.out, /003/);
  });

  it("flag 'serie': '003' (dict)", () => {
    const r = lint("models.py", "vals = {'serie': '003'}\n");
    assert.equal(r.code, 1);
    assert.match(r.out, /003/);
  });

  it("NÃO flag serie = \"3\" (série limpa de 1 dígito)", () => {
    const r = lint("models.py", 'serie = "3"\n');
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("NÃO flag serie = \"30\" (não começa com zero)", () => {
    const r = lint("models.py", 'serie = "30"\n');
    assert.equal(r.code, 0);
  });
});

describe("std-odoo-fiscal-br-integrity — .xml", () => {
  it("flag ind_pres=\"0\" como atributo em XML", () => {
    const r = lint("data.xml", '<record><field ind_pres="0"/></record>\n');
    assert.equal(r.code, 1);
    assert.match(r.out, /717/);
  });

  it("NÃO flag XML neutro (sem termos fiscais)", () => {
    const r = lint("views.xml", '<record><field name="name">Loja</field></record>\n');
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });
});

describe("std-odoo-fiscal-br-integrity — múltiplos riscos e arquivo neutro", () => {
  it("acumula ind_pres='0' E serie='003' no mesmo arquivo", () => {
    const r = lint("models.py", "vals = {'ind_pres': '0', 'serie': '003'}\n");
    assert.equal(r.code, 1);
    assert.match(r.out, /2 risco/);
    assert.match(r.out, /717/);
    assert.match(r.out, /003/);
  });

  it("arquivo .py neutro → exit 0", () => {
    const r = lint("models.py", "name = 'Empresa'\namount = 100\n");
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });
});
