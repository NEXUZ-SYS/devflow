// tests/odoo-standards/std-odoo-qweb-escaping.test.mjs
// Suite TDD do linter default std-odoo-qweb-escaping (escaping anti-XSS em QWeb).
// Contrato SI-4: filePath em argv[2]; violação → 'VIOLATION: ...' no stdout + exit 1.
// Gate de extensão: só processa .xml; demais arquivos saem com exit 0.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-qweb-escaping.js",
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

describe("std-odoo-qweb-escaping — gate de extensão", () => {
  it("ignora arquivo .py (exit 0)", () => {
    const r = lint("model.py", `t-raw="record.note"\nt-esc="value"`);
    assert.equal(r.code, 0);
  });

  it("ignora arquivo sem extensão .xml (exit 0)", () => {
    const r = lint("data.csv", `t-raw,t-esc`);
    assert.equal(r.code, 0);
  });
});

describe("std-odoo-qweb-escaping — check t-raw", () => {
  it("BAD: flag t-raw= num template QWeb", () => {
    const r = lint("template.xml", `<span t-raw="record.note"/>`);
    assert.equal(r.code, 1);
    assert.match(r.out, /^VIOLATION:/);
    assert.match(r.out, /t-raw/);
  });

  it("BAD: flag t-raw com espaço antes do =", () => {
    const r = lint("template.xml", `<div t-raw ="x"/>`);
    assert.equal(r.code, 1);
    assert.match(r.out, /t-raw/);
  });

  it("GOOD: t-out não é flagado", () => {
    const r = lint("template.xml", `<span t-out="record.name"/>`);
    assert.equal(r.code, 0);
  });
});

describe("std-odoo-qweb-escaping — check t-esc", () => {
  it("BAD: flag t-esc= num template QWeb", () => {
    const r = lint("template.xml", `<div t-esc="value"/>`);
    assert.equal(r.code, 1);
    assert.match(r.out, /^VIOLATION:/);
    assert.match(r.out, /t-esc/);
  });

  it("GOOD: t-out não é flagado (sem t-esc)", () => {
    const r = lint("template.xml", `<span t-out="record.name"/>`);
    assert.equal(r.code, 0);
  });
});

describe("std-odoo-qweb-escaping — combinações", () => {
  it("BAD: t-raw e t-esc juntos contam 2 problemas", () => {
    const r = lint(
      "template.xml",
      `<t><span t-raw="a"/><div t-esc="b"/></t>`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /2 problema/);
    assert.match(r.out, /t-raw/);
    assert.match(r.out, /t-esc/);
  });

  it("GOOD: template só com t-out passa limpo", () => {
    const r = lint(
      "template.xml",
      `<t><span t-out="record.name"/><div t-out="record.amount"/></t>`,
    );
    assert.equal(r.code, 0);
    assert.equal(r.out, "");
  });
});
