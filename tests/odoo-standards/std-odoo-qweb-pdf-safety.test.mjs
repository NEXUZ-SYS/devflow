// tests/odoo-standards/std-odoo-qweb-pdf-safety.test.mjs
// Suite TDD do linter default std-odoo-qweb-pdf-safety (segurança de render PDF
// QWeb sob wkhtmltopdf). Contrato SI-4: filePath em argv[2]; violação →
// 'VIOLATION: ...' no stdout + exit 1. Gate de extensão: só processa .xml;
// demais arquivos saem com exit 0. Único check estático forte: display:flex/grid
// (wkhtmltopdf não suporta) — o restante das restrições é human-review na prosa.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-qweb-pdf-safety.js",
);

// Roda o linter num arquivo temporário e devolve { code, out }.
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

describe("std-odoo-qweb-pdf-safety — gate de extensão", () => {
  it("ignora arquivo .py (exit 0)", () => {
    const r = lint("model.py", `style="display: flex;"`);
    assert.equal(r.code, 0);
  });

  it("ignora arquivo sem extensão .xml (exit 0)", () => {
    const r = lint("styles.css", `div { display: grid; }`);
    assert.equal(r.code, 0);
  });
});

describe("std-odoo-qweb-pdf-safety — check display:flex", () => {
  it("BAD: flag display: flex inline num report QWeb", () => {
    const r = lint("report.xml", `<div style="display: flex;">x</div>`);
    assert.equal(r.code, 1);
    assert.match(r.out, /^VIOLATION:/);
    assert.match(r.out, /flex/i);
  });

  it("BAD: flag display:flex sem espaço depois dos dois-pontos", () => {
    const r = lint("report.xml", `<div style="display:flex">x</div>`);
    assert.equal(r.code, 1);
    assert.match(r.out, /flex/i);
  });
});

describe("std-odoo-qweb-pdf-safety — check display:grid", () => {
  it("BAD: flag display:grid inline num report QWeb", () => {
    const r = lint("report.xml", `<div style="display:grid">x</div>`);
    assert.equal(r.code, 1);
    assert.match(r.out, /^VIOLATION:/);
    assert.match(r.out, /grid/i);
  });

  it("BAD: flag display: grid com espaço depois dos dois-pontos", () => {
    const r = lint("report.xml", `<div style="display: grid;">x</div>`);
    assert.equal(r.code, 1);
    assert.match(r.out, /grid/i);
  });
});

describe("std-odoo-qweb-pdf-safety — GOOD (table layout)", () => {
  it("GOOD: layout com <table> passa limpo", () => {
    const r = lint(
      "report.xml",
      `<table><tr><td>a</td><td>b</td></tr></table>`,
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });

  it("GOOD: display:block não é flagado (só flex/grid)", () => {
    const r = lint("report.xml", `<div style="display: block;">x</div>`);
    assert.equal(r.code, 0);
  });
});
