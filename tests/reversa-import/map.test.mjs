// tests/reversa-import/map.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignMilestone, mapTasksToMilestones } from "../../scripts/reversa-import/map.mjs";

const MS = [{ id: "M1", after: "T04", demo: "" }, { id: "M2", after: "T08", demo: "" }];

describe("assignMilestone", () => {
  it("atribui à 1ª onda cujo after cobre o número da tarefa", () => {
    assert.equal(assignMilestone("T01", MS), "M1");
    assert.equal(assignMilestone("T04", MS), "M1");
    assert.equal(assignMilestone("T05", MS), "M2");
  });
  it("tarefa acima do último threshold cai no último marco", () => {
    assert.equal(assignMilestone("T99", MS), "M2");
  });
  it("ordena por after mesmo se marcos vierem fora de ordem", () => {
    const unordered = [{ id: "M2", after: "T08" }, { id: "M1", after: "T04" }];
    assert.equal(assignMilestone("T02", unordered), "M1");
  });
  it("sem marcos → null", () => {
    assert.equal(assignMilestone("T01", []), null);
  });
});

describe("mapTasksToMilestones", () => {
  it("mapeia todas as tarefas e não degrada quando há after parseável", () => {
    const tasks = [{ id: "T01", dependsOn: [] }, { id: "T06", dependsOn: [] }];
    const r = mapTasksToMilestones(tasks, MS);
    assert.equal(r.tasks[0].milestone, "M1");
    assert.equal(r.tasks[1].milestone, "M2");
    assert.equal(r.degraded, false);
  });
  it("degrada (flag) quando há marcos mas nenhum after parseável → tudo na 1ª onda", () => {
    const badMs = [{ id: "M1", after: "?" }, { id: "M2", after: "" }];
    const tasks = [{ id: "T01", dependsOn: [] }, { id: "T09", dependsOn: [] }];
    const r = mapTasksToMilestones(tasks, badMs);
    assert.equal(r.degraded, true);
    assert.ok(r.tasks.every((t) => t.milestone === "M1"));
  });
});
