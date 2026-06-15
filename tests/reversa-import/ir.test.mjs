// tests/reversa-import/ir.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR, validateIR } from "../../scripts/reversa-import/ir.mjs";

describe("createIR", () => {
  it("cria um IR vazio com todas as coleções inicializadas", () => {
    const ir = createIR();
    assert.deepEqual(ir.tasks, []);
    assert.deepEqual(ir.milestones, []);
    assert.deepEqual(ir.features, []);
    assert.deepEqual(ir.decisions, []);
    assert.deepEqual(ir.gaps, []);
    assert.deepEqual(ir.preserve, []);
    assert.deepEqual(ir.provenance, []);
    assert.equal(ir.project.name, null);
    assert.deepEqual(ir.readiness, { global: null, perFeature: {} });
  });
});

describe("validateIR", () => {
  it("aceita um IR mínimo válido", () => {
    const ir = createIR();
    ir.project.name = "demo";
    ir.tasks.push({ id: "T01", name: "infra", dependsOn: [], milestone: "M1", confidence: "captured" });
    const r = validateIR(ir);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
  });

  it("rejeita task com dependsOn que não é array", () => {
    const ir = createIR();
    ir.tasks.push({ id: "T01", name: "x", dependsOn: "T00", milestone: null, confidence: "captured" });
    const r = validateIR(ir);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("dependsOn")));
  });

  it("rejeita task sem id", () => {
    const ir = createIR();
    ir.tasks.push({ name: "sem id", dependsOn: [], milestone: null, confidence: "captured" });
    const r = validateIR(ir);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("id")));
  });

  it("rejeita verdict de readiness inválido", () => {
    const ir = createIR();
    ir.readiness.global = "purple";
    const r = validateIR(ir);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("readiness")));
  });
});
