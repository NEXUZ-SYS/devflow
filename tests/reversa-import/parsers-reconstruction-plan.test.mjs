// tests/reversa-import/parsers-reconstruction-plan.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseReconstructionPlan } from "../../scripts/reversa-import/parsers/reconstruction-plan.mjs";

const PLAN = `# Reconstruction Plan

## Tarefas

### Tarefa 01 — Fundações de infra
Setup básico.

### Tarefa 02 — Schema do banco
Núcleo EAV.

### Tarefa 14 — call intelligence
**Depende:** Tarefas 12 e 13

## Marcos demonstráveis

| Marco | Após | Demo |
|---|---|---|
| M1 "Dados vivos" | T04 | API cria objects |
| M2 "CRM usável" | T08 | tabela + record page |
`;

describe("parseReconstructionPlan", () => {
  it("extrai cada tarefa com id e nome", () => {
    const { tasks } = parseReconstructionPlan(PLAN);
    assert.equal(tasks.length, 3);
    assert.deepEqual(tasks[0], { id: "T01", name: "Fundações de infra", dependsOn: [], milestone: null, confidence: "captured" });
  });

  it("resolve o grafo de dependências de '**Depende:** Tarefas 12 e 13'", () => {
    const { tasks } = parseReconstructionPlan(PLAN);
    const t14 = tasks.find((t) => t.id === "T14");
    assert.deepEqual(t14.dependsOn, ["T12", "T13"]);
  });

  it("tolera formato alternativo '**Depende:** T04 (...)' sem a palavra Tarefas", () => {
    const alt = "### Tarefa 20 — imports\n**Depende:** T04 (engine de validação)\n";
    const { tasks } = parseReconstructionPlan(alt);
    assert.deepEqual(tasks[0].dependsOn, ["T04"]);
  });

  it("extrai os marcos com after referenciando tarefa", () => {
    const { milestones } = parseReconstructionPlan(PLAN);
    assert.equal(milestones.length, 2);
    assert.deepEqual(milestones[0], { id: "M1", after: "T04", demo: "API cria objects" });
  });

  it("plano vazio → coleções vazias (tolerante)", () => {
    const r = parseReconstructionPlan("");
    assert.deepEqual(r.tasks, []);
    assert.deepEqual(r.milestones, []);
  });
});
