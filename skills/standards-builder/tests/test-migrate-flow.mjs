/**
 * F3 integration — MIGRATE (lib-centric std → concern std).
 * Run: node --test skills/standards-builder/tests/test-migrate-flow.mjs
 *
 * Exercises --migrate:
 *   - concern std created, lib std renamed to .deprecated.md
 *   - deprecated std carries supersededBy frontmatter
 *   - migrate is idempotent (no-op on re-run)
 *   - the migrated concern std passes audit with S7 PASS
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");
const FIX = join(REPO, "tests/validation/fixtures");

function setupLibStd() {
  const tmp = mkdtempSync(join(tmpdir(), "f3-"));
  mkdirSync(join(tmp, ".context/standards/machine"), { recursive: true });
  mkdirSync(join(tmp, ".context/adrs"), { recursive: true });
  writeFileSync(join(tmp, ".context/.devflow.yaml"), "name: test\n");
  copyFileSync(join(FIX, "adr-zod-fake.md"), join(tmp, ".context/adrs/009-adr-zod-frontend-v1.0.0.md"));
  copyFileSync(join(FIX, "std-zod-fake.md"), join(tmp, ".context/standards/std-zod.md"));
  writeFileSync(join(tmp, ".context/standards/machine/std-zod.js"), "process.exit(0);\n");
  return tmp;
}

function cli(tmp, ...args) {
  return spawnSync("node", [CLI, ...args, `--project=${tmp}`, `--taxonomy=${TAXONOMY}`],
    { encoding: "utf-8" });
}

describe("F3 — MIGRATE flow", () => {
  it("creates concern std + renames lib std to .deprecated.md", () => {
    const tmp = setupLibStd();
    const res = cli(tmp, "new", "--migrate=zod", "--yes");
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const stdsDir = join(tmp, ".context/standards");
    assert.ok(existsSync(join(stdsDir, "std-runtime-validation.md")), "concern std created");
    assert.ok(existsSync(join(stdsDir, "std-zod.deprecated.md")), "lib std deprecated");
    assert.ok(!existsSync(join(stdsDir, "std-zod.md")), "std-zod.md removed");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("deprecated std carries supersededBy frontmatter", () => {
    const tmp = setupLibStd();
    cli(tmp, "new", "--migrate=zod", "--yes");
    const dep = readFileSync(join(tmp, ".context/standards/std-zod.deprecated.md"), "utf-8");
    assert.match(dep, /deprecated: true/);
    assert.match(dep, /supersededBy: std-runtime-validation/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("migrated concern std carries relatedAdrs from the old lib std", () => {
    const tmp = setupLibStd();
    cli(tmp, "new", "--migrate=zod", "--yes");
    const content = readFileSync(join(tmp, ".context/standards/std-runtime-validation.md"), "utf-8");
    assert.match(content, /adr-zod-frontend/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("migrate is idempotent — second run is a no-op", () => {
    const tmp = setupLibStd();
    cli(tmp, "new", "--migrate=zod", "--yes");
    const res2 = cli(tmp, "new", "--migrate=zod", "--yes");
    assert.equal(res2.status, 0, "second migrate exits 0");
    assert.match(res2.stderr + res2.stdout, /already migrated/i);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("migrated concern std passes audit with S7 PASS", () => {
    const tmp = setupLibStd();
    cli(tmp, "new", "--migrate=zod", "--yes");
    const res = cli(tmp, "audit", "runtime-validation");
    assert.match(res.stdout, /Gate: PASSED/);
    const s7 = res.stdout.split("\n").find(l => l.includes("S7"));
    assert.ok(s7 && s7.includes("PASS"), `S7 should PASS: ${s7}`);
    rmSync(tmp, { recursive: true, force: true });
  });
});
