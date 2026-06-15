// tests/reversa-import/emitters-prd.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitPrd } from "../../scripts/reversa-import/emitters/prd.mjs";

function fixtureIR() {
  const ir = createIR();
  ir.project.name = "crm-demo";
  ir.tasks = [
    { id: "T01", name: "infra", dependsOn: [], milestone: "M1", confidence: "captured" },
    { id: "T02", name: "schema", dependsOn: ["T01"], milestone: "M1", confidence: "captured" },
    { id: "T08", name: "lists", dependsOn: ["T02"], milestone: "M2", confidence: "inferred" },
  ];
  ir.milestones = [
    { id: "M1", after: "T02", demo: "API cria objects" },
    { id: "M2", after: "T08", demo: "tabela usável" },
  ];
  return ir;
}

describe("emitPrd", () => {
  it("gera um PRD com uma fase por marco", () => {
    const md = emitPrd(fixtureIR());
    assert.match(md, /# .*crm-demo/i);
    assert.match(md, /## .*M1/);
    assert.match(md, /## .*M2/);
  });

  it("lista cada tarefa como item de escopo com suas dependências", () => {
    const md = emitPrd(fixtureIR());
    assert.match(md, /T02.*schema/);
    assert.match(md, /depende.*T01/i);
  });

  it("marca a 1ª fase como em-andamento e as demais como pending (⬚)", () => {
    const md = emitPrd(fixtureIR());
    const m1Idx = md.indexOf("M1");
    const m2Idx = md.indexOf("M2");
    assert.ok(md.slice(m2Idx).includes("⬚"), "fases posteriores marcadas pending");
    assert.ok(m1Idx < m2Idx);
  });
});
