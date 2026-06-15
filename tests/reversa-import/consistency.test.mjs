// tests/reversa-import/consistency.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { validateConsistency } from "../../scripts/reversa-import/consistency.mjs";

function check(r, id) { return r.checks.find((c) => c.id === id); }

describe("validateConsistency", () => {
  it("detecta blocked_by apontando para story inexistente", () => {
    const ir = createIR();
    ir.tasks = [{ id: "T01", name: "a", dependsOn: ["T99"], milestone: "M1", confidence: "captured" }];
    const r = validateConsistency(ir);
    assert.equal(check(r, "dep-graph").status, "fail");
    assert.ok(check(r, "dep-graph").issues.some((i) => i.includes("T99")));
  });

  it("detecta ciclo no grafo de dependências", () => {
    const ir = createIR();
    ir.tasks = [
      { id: "T01", name: "a", dependsOn: ["T02"], milestone: "M1", confidence: "captured" },
      { id: "T02", name: "b", dependsOn: ["T01"], milestone: "M1", confidence: "captured" },
    ];
    const r = validateConsistency(ir);
    assert.ok(check(r, "dep-graph").issues.some((i) => /ciclo/i.test(i)));
  });

  it("detecta dependência cross-onda (onda 1 depende de onda posterior)", () => {
    const ir = createIR();
    ir.milestones = [{ id: "M1", after: "T01", demo: "" }, { id: "M2", after: "T02", demo: "" }];
    ir.tasks = [
      { id: "T01", name: "a", dependsOn: ["T02"], milestone: "M1", confidence: "captured" },
      { id: "T02", name: "b", dependsOn: [], milestone: "M2", confidence: "captured" },
    ];
    const r = validateConsistency(ir);
    assert.equal(check(r, "wave-order").status, "fail");
  });

  it("detecta plano que referencia D-NN sem ADR correspondente", () => {
    const ir = createIR();
    ir.tasks = [{ id: "T01", name: "implementa conforme D-09", dependsOn: [], milestone: "M1", confidence: "captured" }];
    ir.decisions = []; // nenhuma ADR para D-09
    const r = validateConsistency(ir);
    assert.equal(check(r, "adr-plan").status, "fail");
  });

  it("detecta story derivada de spec stub", () => {
    const ir = createIR();
    ir.features = [{ slug: "billing", specLineCount: 3, hasForward: true, hasSdd: true }];
    ir.tasks = [{ id: "T01", name: "billing core", dependsOn: [], milestone: "M1", confidence: "captured" }];
    const r = validateConsistency(ir);
    assert.equal(check(r, "spec-stub").status, "fail");
  });

  it("detecta feature SDD sem contraparte forward (órfã)", () => {
    const ir = createIR();
    ir.features = [{ slug: "orfa", specLineCount: 40, hasForward: false, hasSdd: true }];
    const r = validateConsistency(ir);
    assert.equal(check(r, "sdd-forward").status, "fail");
  });

  it("check schema reflete validateIR (dependsOn inválido falha)", () => {
    const ir = createIR();
    ir.tasks = [{ id: "T01", name: "x", dependsOn: "T00", milestone: "M1", confidence: "captured" }];
    const r = validateConsistency(ir);
    assert.equal(check(r, "schema").status, "fail");
  });

  it("plano coerente → todos os checks passam", () => {
    const ir = createIR();
    ir.milestones = [{ id: "M1", after: "T02", demo: "" }];
    ir.features = [{ slug: "a", specLineCount: 40, hasForward: true, hasSdd: true }];
    ir.tasks = [
      { id: "T01", name: "a infra", dependsOn: [], milestone: "M1", confidence: "captured" },
      { id: "T02", name: "a core", dependsOn: ["T01"], milestone: "M1", confidence: "captured" },
    ];
    const r = validateConsistency(ir);
    assert.ok(r.checks.every((c) => c.status === "pass"), JSON.stringify(r.checks));
  });
});
