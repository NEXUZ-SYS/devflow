// tests/reversa-import/fixtures.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("makeReversaFixture", () => {
  it("monta um projeto green com 1 feature completa", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      assert.ok(existsSync(join(dir, ".reversa", "state.json")));
      assert.ok(existsSync(join(dir, "_reversa_sdd", "reconstruction-plan.md")));
      const plan = readFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), "utf-8");
      assert.match(plan, /### Tarefa 01/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("monta um projeto red com spec stub e decisão pendente", () => {
    const dir = makeReversaFixture({ profile: "red" });
    try {
      const stub = readFileSync(join(dir, "_reversa_sdd", "feat-a", "spec.md"), "utf-8");
      assert.ok(stub.split("\n").length < 10, "spec stub deve ser curta");
      assert.ok(existsSync(join(dir, "_reversa_sdd", "_decisions", "pending-decisions.md")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
