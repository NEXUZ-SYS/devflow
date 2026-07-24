// tests/reversa-import/ir.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR, validateIR } from "../../scripts/reversa-import/ir.mjs";

describe("IR de evidência", () => {
  it("createIR não tem mais tasks/milestones/features", () => {
    const ir = createIR();
    assert.ok(!("tasks" in ir));
    assert.ok(!("milestones" in ir));
    assert.ok(!("features" in ir));
    assert.deepEqual(ir.artifacts, []);
    assert.deepEqual(ir.conflicts, []);
    assert.equal(ir.handoff, null);
  });

  it("valida kindSource dos artefatos", () => {
    const ir = createIR();
    ir.artifacts = [{ relPath: "a.md", kind: "analysis", kindSource: "inventado" }];
    const v = validateIR(ir);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /kindSource inválido/.test(e)));
  });

  it("rejeita artefato sem relPath ou sem kind", () => {
    const ir = createIR();
    ir.artifacts = [{ kindSource: "heuristic" }];
    const v = validateIR(ir);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /relPath/.test(e)));
    assert.ok(v.errors.some((e) => /kind/.test(e)));
  });

  it("aceita IR bem-formado", () => {
    const ir = createIR();
    ir.artifacts = [{ relPath: "a.md", kind: "analysis", kindSource: "heuristic" }];
    assert.equal(validateIR(ir).ok, true);
  });
});
