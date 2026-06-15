// tests/reversa-import/command-routing.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

describe("comando import-reversa", () => {
  it("commands/devflow-import-reversa.md existe e invoca a skill", () => {
    const p = join(ROOT, "commands", "devflow-import-reversa.md");
    assert.ok(existsSync(p), "comando ausente");
    const body = readFileSync(p, "utf-8");
    assert.match(body, /devflow:import-reversa|import-reversa/);
  });

  it("devflow.md roteia 'import-reversa' para a skill", () => {
    const body = readFileSync(join(ROOT, "commands", "devflow.md"), "utf-8");
    assert.match(body, /import-reversa/);
  });
});
