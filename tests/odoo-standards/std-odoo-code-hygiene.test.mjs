import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const LINTER = resolve(
  import.meta.dirname,
  "../../assets/standards/profiles/odoo/machine/std-odoo-code-hygiene.js",
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

describe("std-odoo-code-hygiene linter", () => {
  // ---- Check 1: print() -----------------------------------------------------

  it("flags print() cru (use _logger)", () => {
    const r = lint("m.py", `print("debug")`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags print() no meio de uma linha", () => {
    const r = lint("m.py", `if x:\n    print(x)\n`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("passes _logger.info (substituto correto de print)", () => {
    const r = lint("m.py", `_logger.info("debug")`);
    assert.equal(r.code, 0);
  });

  it("passes pprint (não é print cru)", () => {
    const r = lint("m.py", `pprint(data)`);
    assert.equal(r.code, 0);
  });

  it("passes print dentro de comentário (GOOD)", () => {
    const r = lint("m.py", `# print(x) é proibido\n_logger.info("ok")\n`);
    assert.equal(r.code, 0);
  });

  // ---- Check 2: requests sem timeout ---------------------------------------

  it("flags requests.get sem timeout", () => {
    const r = lint("m.py", `r = requests.get(url)`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("flags requests.post sem timeout", () => {
    const r = lint("m.py", `r = requests.post(url, json=data)`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });

  it("passes requests.get com timeout", () => {
    const r = lint("m.py", `r = requests.get(url, timeout=10)`);
    assert.equal(r.code, 0);
  });

  it("passes requests.post com timeout", () => {
    const r = lint("m.py", `r = requests.post(url, json=data, timeout=5)`);
    assert.equal(r.code, 0);
  });

  it("passes requests sem timeout dentro de comentário (GOOD)", () => {
    const r = lint("m.py", `# requests.get(url) sem timeout é ruim\nok = 1\n`);
    assert.equal(r.code, 0);
  });

  // ---- Dedup ----------------------------------------------------------------

  it("dedup: várias violações iguais não repetem a mensagem", () => {
    const r = lint("m.py", `print("a")\nprint("b")\nprint("c")\n`);
    assert.equal(r.code, 1);
    // "print()" deve aparecer uma única vez na lista de violações
    const matches = r.out.match(/print\(\)/g) || [];
    assert.equal(matches.length, 1);
  });

  // ---- GOOD: arquivo limpo --------------------------------------------------

  it("passes arquivo limpo (sem print, requests com timeout)", () => {
    const r = lint(
      "m.py",
      `import requests\n_logger.info("start")\nr = requests.get(url, timeout=10)\n`,
    );
    assert.equal(r.code, 0);
  });

  // ---- Gate por extensão ----------------------------------------------------

  it("ignores non-py files (.xml)", () => {
    const r = lint("x.xml", `print("debug")`);
    assert.equal(r.code, 0);
  });

  it("ignores non-py files (.js)", () => {
    const r = lint("x.js", `requests.get(url)`);
    assert.equal(r.code, 0);
  });
});
