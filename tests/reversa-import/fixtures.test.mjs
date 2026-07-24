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

describe("perfis derivados dos Reversa reais", () => {
  it("forward-real: decisões no formato do attio (## N. Decisão), com _plan/", () => {
    const dir = makeReversaFixture({ profile: "forward-real" });
    try {
      const par = readFileSync(join(dir, "_reversa_sdd", "_decisions", "paradigm-decision.md"), "utf-8");
      assert.match(par, /^## \d+\. Decisão/m, "usa '## N. Decisão', não '## D-NN —'");
      assert.ok(existsSync(join(dir, "_reversa_sdd", "_plan", "implementation-plan.md")));
      assert.ok(existsSync(join(dir, "_reversa_forward", "001-feat-a", "requirements.md")));
      const plan = readFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), "utf-8");
      assert.match(plan, /## Marcos demonstráveis/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("reverse-analysis: adrs/*.md prontos, dirs-módulo, nenhum spec.md", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      const adr = readFileSync(join(dir, "_reversa_sdd", "adrs", "0001-decisao-um.md"), "utf-8");
      assert.match(adr, /^## Contexto$/m);
      assert.match(adr, /^## Decisão$/m);
      assert.match(adr, /^## Consequências$/m);
      assert.ok(existsSync(join(dir, "_reversa_sdd", "mod-a", "requirements.md")));
      assert.ok(!existsSync(join(dir, "_reversa_sdd", "mod-a", "spec.md")), "reverse não tem spec.md");
      assert.ok(!existsSync(join(dir, "_reversa_forward")), "sem forward");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("reverse-migration: migration/ com kind: em frontmatter, handoff e parity_tests", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const h = readFileSync(join(dir, "_reversa_sdd", "migration", "handoff.md"), "utf-8");
      assert.match(h, /^kind: handoff$/m);
      assert.match(h, /^schemaVersion: 1$/m);
      const st = JSON.parse(readFileSync(join(dir, "_reversa_sdd", "migration", ".state.json"), "utf-8"));
      assert.ok(Object.keys(st.artifacts).length >= 3);
      assert.ok(existsSync(join(dir, "_reversa_sdd", "migration", "parity_tests", "01-alpha.feature")));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("no-anchor: só reconstruction-plan, sem handoff nem _plan", () => {
    const dir = makeReversaFixture({ profile: "no-anchor" });
    try {
      assert.ok(existsSync(join(dir, "_reversa_sdd", "reconstruction-plan.md")));
      assert.ok(!existsSync(join(dir, "_reversa_sdd", "migration")));
      assert.ok(!existsSync(join(dir, "_reversa_sdd", "_plan")));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
