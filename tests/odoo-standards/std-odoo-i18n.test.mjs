import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-i18n.js",
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

describe("std-odoo-i18n linter — gate de path", () => {
  it("ignora arquivos não-.py (exit 0)", () => {
    const r = lint("notas.txt", `_(f"Partner {p.name} bloqueado")`);
    assert.equal(r.code, 0);
  });
});

describe("Check 1: f-string dentro de _()", () => {
  it("BAD: _(f\"...\") com aspas duplas viola", () => {
    const r = lint(
      "models.py",
      `raise UserError(_(f"Partner {p.name} bloqueado"))\n`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("BAD: _(f'...') com aspas simples viola", () => {
    const r = lint("models.py", `msg = _(f'Total {total}')\n`);
    assert.equal(r.code, 1);
  });

  it("GOOD: placeholder lazy não viola", () => {
    const r = lint(
      "models.py",
      `raise UserError(_("Partner %(name)s bloqueado", name=p.name))\n`,
    );
    assert.equal(r.code, 0);
  });
});

describe("Check 2: .format() dentro de _()", () => {
  it("BAD: _(\"x {}\".format(y)) viola", () => {
    const r = lint("models.py", `msg = _("x {}".format(y))\n`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("GOOD: _(\"texto simples\") não viola", () => {
    const r = lint("models.py", `msg = _("Mensagem simples")\n`);
    assert.equal(r.code, 0);
  });
});

describe("Check 3: interpolação % ansiosa dentro de _()", () => {
  it("BAD: _(\"Total: %s\" % total) viola", () => {
    const r = lint("models.py", `msg = _("Total: %s" % total)\n`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("GOOD: _(\"x %(n)s\", n=v) placeholder lazy não viola", () => {
    const r = lint("models.py", `msg = _("x %(n)s", n=v)\n`);
    assert.equal(r.code, 0);
  });

  it("GOOD: _(\"100% concluído\") sem aplicação de % não viola", () => {
    const r = lint("models.py", `msg = _("100% concluido")\n`);
    assert.equal(r.code, 0);
  });
});

describe("Check 4: concatenação + dentro de _()", () => {
  it("BAD: _(\"a\" + var) viola", () => {
    const r = lint("models.py", `msg = _("a" + var)\n`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("BAD: _(\"prefixo \" + nome) viola", () => {
    const r = lint("models.py", `msg = _("prefixo " + nome)\n`);
    assert.equal(r.code, 1);
  });

  it("GOOD: _(\"texto sem concat\") não viola", () => {
    const r = lint("models.py", `msg = _("texto sem concat")\n`);
    assert.equal(r.code, 0);
  });
});

describe("Exemplos fixtures do briefing — BAD", () => {
  it("raise UserError(_(f\"Partner {p.name} bloqueado\"))", () => {
    assert.equal(
      lint("m.py", `raise UserError(_(f"Partner {p.name} bloqueado"))\n`).code,
      1,
    );
  });
  it('_("Total: %s" % total)', () => {
    assert.equal(lint("m.py", `_("Total: %s" % total)\n`).code, 1);
  });
  it('_("a" + var)', () => {
    assert.equal(lint("m.py", `_("a" + var)\n`).code, 1);
  });
  it('_("x {}".format(y))', () => {
    assert.equal(lint("m.py", `_("x {}".format(y))\n`).code, 1);
  });
});

describe("Exemplos fixtures do briefing — GOOD", () => {
  it('raise UserError(_("Partner %(name)s bloqueado", name=p.name))', () => {
    assert.equal(
      lint("m.py", `raise UserError(_("Partner %(name)s bloqueado", name=p.name))\n`)
        .code,
      0,
    );
  });
  it('_("Mensagem simples")', () => {
    assert.equal(lint("m.py", `_("Mensagem simples")\n`).code, 0);
  });
});

describe("Mensagem de violação cita o standard", () => {
  it("aponta para std-odoo-i18n e o arquivo", () => {
    const r = lint("models.py", `_(f"x {y}")\n`);
    assert.match(r.out, /std-odoo-i18n/);
    assert.match(r.out, /models\.py/);
  });
});
