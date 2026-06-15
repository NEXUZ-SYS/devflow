// tests/reversa-import/emitters-stories.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitStories, inferAgent, inferAgentDetailed } from "../../scripts/reversa-import/emitters/stories.mjs";
import { parseStoriesContent, getNextStory } from "../../scripts/runner-lib.mjs";

function ir() {
  const x = createIR();
  x.project.name = "crm-demo";
  x.tasks = [
    { id: "T01", name: "endpoint REST de auth OAuth", dependsOn: [], milestone: "M1", confidence: "captured" },
    { id: "T02", name: "schema RLS e migração Postgres", dependsOn: ["T01"], milestone: "M1", confidence: "captured" },
    { id: "T08", name: "kanban React de listas", dependsOn: ["T02"], milestone: "M2", confidence: "inferred" },
  ];
  x.milestones = [{ id: "M1", after: "T02", demo: "x" }, { id: "M2", after: "T08", demo: "y" }];
  return x;
}

describe("inferAgent", () => {
  it("infere backend-specialist para endpoint REST/OAuth", () => {
    assert.equal(inferAgent("endpoint REST de auth OAuth"), "backend-specialist");
  });
  it("infere database-specialist para RLS/schema/migração", () => {
    assert.equal(inferAgent("schema RLS e migração Postgres"), "database-specialist");
  });
  it("infere frontend-specialist para kanban/React", () => {
    assert.equal(inferAgent("kanban React de listas"), "frontend-specialist");
  });
  it("fallback feature-developer quando nenhuma categoria casa", () => {
    assert.equal(inferAgent("ajustes diversos"), "feature-developer");
  });
  it("ambiguidade (2+ categorias) → feature-developer marcado ambíguo", () => {
    const r = inferAgentDetailed("UI para configurar API de billing"); // ui (frontend) + api (backend)
    assert.equal(r.agent, "feature-developer");
    assert.equal(r.ambiguous, true);
  });
});

describe("emitStories", () => {
  it("só emite stories da 1ª onda (M1), com IDs S<n> e proveniência T<n>", () => {
    const yaml = emitStories(ir(), { now: "2026-06-15T00:00:00.000Z" });
    assert.match(yaml, /id: "S1"/);
    assert.match(yaml, /id: "S2"/);
    assert.match(yaml, /provenance: "T01"/);
    assert.ok(!yaml.includes("S3"), "T08 (M2) não vira story no import");
    assert.ok(!yaml.includes('"T08"'));
  });

  it("é parseável pelo runner real e getNextStory devolve a 1ª desbloqueada", () => {
    const yaml = emitStories(ir(), { now: "2026-06-15T00:00:00.000Z" });
    const { stories, maxRetries } = parseStoriesContent(yaml);
    assert.equal(maxRetries, 2);
    assert.equal(stories.length, 2);
    const next = getNextStory(stories, maxRetries);
    assert.equal(next.id, "S1"); // S2 está blocked_by S1 (ainda não completo)
  });

  it("blocked_by referencia S-ids (não T-ids)", () => {
    const yaml = emitStories(ir(), { now: "2026-06-15T00:00:00.000Z" });
    assert.match(yaml, /blocked_by: \["S1"\]/);
  });
});
