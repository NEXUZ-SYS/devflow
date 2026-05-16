/**
 * F1 integration — FROM-CONCERN puro (no ADR).
 * Run: node --test skills/standards-builder/tests/test-from-concern-flow.mjs
 *
 * Exercises the full CLI flow with the REAL distributed taxonomy:
 *   - std generated without consulting any ADR (relatedAdrs: [])
 *   - audit gate PASSED with S7 PASS (id is a concern, not a lib)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");

function setupProject() {
  const tmp = mkdtempSync(join(tmpdir(), "f1-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  writeFileSync(join(tmp, ".context/.devflow.yaml"), "name: test\n");
  return tmp;
}

function cli(tmp, ...args) {
  return spawnSync("node", [CLI, ...args, `--project=${tmp}`, `--taxonomy=${TAXONOMY}`],
    { encoding: "utf-8" });
}

describe("F1 — FROM-CONCERN puro", () => {
  it("creates std-runtime-validation without consulting any ADR", () => {
    const tmp = setupProject();
    const res = cli(tmp, "new", "--concern=runtime-validation");
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const stdPath = join(tmp, ".context/standards/std-runtime-validation.md");
    assert.ok(existsSync(stdPath));
    const content = readFileSync(stdPath, "utf-8");
    assert.match(content, /^id: std-runtime-validation/m);
    assert.match(content, /^weakStandardWarning: true/m);
    assert.match(content, /relatedAdrs:\s*\[\]/, "no ADR → relatedAdrs empty");
    assert.match(content, /## Princípios/);
    assert.match(content, /## Anti-patterns/);
    assert.match(content, /## Linter/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("audit gate PASSED with S7 PASS (concern-based id)", () => {
    const tmp = setupProject();
    cli(tmp, "new", "--concern=runtime-validation");
    const res = cli(tmp, "audit", "runtime-validation");
    assert.match(res.stdout, /Gate: PASSED/, `audit output: ${res.stdout}`);
    const s7Line = res.stdout.split("\n").find(l => l.includes("S7"));
    assert.ok(s7Line && s7Line.includes("PASS"), `S7 should PASS: ${s7Line}`);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates a linter stub alongside the std", () => {
    const tmp = setupProject();
    cli(tmp, "new", "--concern=error-handling");
    assert.ok(existsSync(join(tmp, ".context/standards/machine/std-error-handling.js")));
    rmSync(tmp, { recursive: true, force: true });
  });
});
