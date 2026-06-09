import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-test-discipline.js",
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

describe("std-odoo-test-discipline linter", () => {
  // ---- Check 1: herda unittest.TestCase ----------------------------------

  it("flags classe que herda unittest.TestCase", () => {
    const r = lint(
      "test_foo.py",
      `class TestFoo(unittest.TestCase):\n    def test_x(self):\n        pass\n`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /TestFoo/);
  });

  it("flags unittest.TestCase com espaços extras", () => {
    const r = lint(
      "test_bar.py",
      `class TestBar( unittest.TestCase ):\n    def test_y(self):\n        pass\n`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  // ---- Check 2: commit dentro de teste -----------------------------------

  it("flags self.env.cr.commit() dentro de teste", () => {
    const r = lint(
      "test_commit.py",
      `class TestC(TransactionCase):\n    def test_x(self):\n        self.env.cr.commit()\n`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags cr.commit() dentro de teste", () => {
    const r = lint(
      "test_commit2.py",
      `class TestD(TransactionCase):\n    def test_x(self):\n        cr.commit()\n`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  // ---- Check 3: classe de teste sem base do framework --------------------

  it("flags classe com def test_ sem base do framework (object)", () => {
    const r = lint(
      "test_nobase.py",
      `class TestBar(object):\n    def test_y(self):\n        pass\n`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
    assert.match(r.out, /TestBar/);
  });

  it("flags classe sem parênteses de base mas com def test_", () => {
    const r = lint(
      "test_plain.py",
      `class TestPlain:\n    def test_y(self):\n        pass\n`,
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  // ---- GOOD cases --------------------------------------------------------

  it("passes TransactionCase com def test_", () => {
    const r = lint(
      "test_ok.py",
      `class TestBaz(TransactionCase):\n    def test_z(self):\n        self.assertTrue(True)\n`,
    );
    assert.equal(r.code, 0);
  });

  it("passes HttpCase", () => {
    const r = lint(
      "test_http.py",
      `class TestHttp(HttpCase):\n    def test_z(self):\n        self.assertTrue(True)\n`,
    );
    assert.equal(r.code, 0);
  });

  it("passes common.TransactionCase", () => {
    const r = lint(
      "test_common.py",
      `class TestCommon(common.TransactionCase):\n    def test_z(self):\n        self.assertTrue(True)\n`,
    );
    assert.equal(r.code, 0);
  });

  it("passes SavepointCase", () => {
    const r = lint(
      "test_sp.py",
      `class TestSp(SavepointCase):\n    def test_z(self):\n        self.assertTrue(True)\n`,
    );
    assert.equal(r.code, 0);
  });

  it("passes classe utilitária sem def test_ (object)", () => {
    const r = lint(
      "test_helper.py",
      `class Helper(object):\n    def util(self):\n        pass\n`,
    );
    assert.equal(r.code, 0);
  });

  it("passes classe utilitária sem base e sem def test_", () => {
    const r = lint(
      "test_util.py",
      `class Util:\n    def helper(self):\n        return 1\n`,
    );
    assert.equal(r.code, 0);
  });

  it("não flaga commit fora de teste em arquivo de teste sem violações de classe", () => {
    // commit existe mas o check 2 mira qualquer commit no arquivo de teste; aqui garantimos GOOD puro
    const r = lint(
      "test_clean.py",
      `class TestClean(TransactionCase):\n    def test_a(self):\n        rec = self.env['res.partner'].create({'name': 'x'})\n        self.assertRecordValues(rec, [{'name': 'x'}])\n`,
    );
    assert.equal(r.code, 0);
  });

  // ---- Gate por extensão --------------------------------------------------

  it("ignores non-py files (.xml)", () => {
    const r = lint(
      "view.xml",
      `class TestFoo(unittest.TestCase):\n    def test_x(self):\n        pass\n`,
    );
    assert.equal(r.code, 0);
  });

  it("ignores non-py files (.js)", () => {
    const r = lint("widget.js", `cr.commit()`);
    assert.equal(r.code, 0);
  });
});
