import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { resolveHandoff } from "../../scripts/reversa-import/handoff.mjs";
import { classifyArtifacts } from "../../scripts/reversa-import/classify.mjs";

function cleanup(d) { rmSync(d, { recursive: true, force: true }); }
function byRel(list, suffix) { return list.find((a) => a.relPath.endsWith(suffix)); }

describe("classifyArtifacts — nível autoritativo", () => {
  it("usa o frontmatter kind: quando existe", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const list = classifyArtifacts(dir, { handoff: resolveHandoff(dir) });
      const topo = byRel(list, "migration/topology_decision.md");
      assert.equal(topo.kind, "topology_decision");
      assert.equal(topo.kindSource, "frontmatter");
    } finally { cleanup(dir); }
  });

  it("usa o .state.json para tipar o que não tem frontmatter", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const list = classifyArtifacts(dir, { handoff: resolveHandoff(dir) });
      const inv = byRel(list, "screens/inventory.json");
      assert.equal(inv.kindSource, "manifest");
    } finally { cleanup(dir); }
  });

  it("marca .feature como test-input", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const list = classifyArtifacts(dir, { handoff: resolveHandoff(dir) });
      assert.equal(byRel(list, "parity_tests/01-alpha.feature").kind, "test-input");
    } finally { cleanup(dir); }
  });
});

describe("classifyArtifacts — features-fantasma mortas", () => {
  it("NENHUM diretório vira feature: adrs/, traceability/, user-stories/ são artefato", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      const list = classifyArtifacts(dir, { handoff: resolveHandoff(dir) });
      assert.equal(byRel(list, "adrs/0001-decisao-um.md").kind, "adr");
      assert.equal(byRel(list, "traceability/code-spec-matrix.md").kind, "analysis");
      assert.equal(byRel(list, "user-stories/gestao.md").kind, "analysis");
      assert.ok(!list.some((a) => a.kind === "feature"), "não existe kind 'feature'");
    } finally { cleanup(dir); }
  });

  it("screens/ NÃO vira feature no perfil reverse-migration", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const list = classifyArtifacts(dir, { handoff: resolveHandoff(dir) });
      assert.ok(!list.some((a) => a.kind === "feature"));
      assert.ok(byRel(list, "screens/inventory.json"));
    } finally { cleanup(dir); }
  });

  it("classifica spec.md de feature como spec-unit no forward", () => {
    const dir = makeReversaFixture({ profile: "forward-real" });
    try {
      const list = classifyArtifacts(dir, { handoff: resolveHandoff(dir) });
      assert.equal(byRel(list, "feat-a/spec.md").kind, "spec-unit");
      assert.equal(byRel(list, "feat-a/spec.md").kindSource, "heuristic");
    } finally { cleanup(dir); }
  });
});

describe("classifyArtifacts — auditabilidade e camada", () => {
  it("todo artefato carrega kindSource de um dos 4 valores", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const ok = new Set(["frontmatter", "manifest", "handoff-table", "heuristic"]);
      const list = classifyArtifacts(dir, { handoff: resolveHandoff(dir) });
      assert.ok(list.length > 0);
      for (const a of list) assert.ok(ok.has(a.kindSource), `${a.relPath}: ${a.kindSource}`);
    } finally { cleanup(dir); }
  });

  it("sugere camada engineering para análise e product para user-stories", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      const list = classifyArtifacts(dir, { handoff: resolveHandoff(dir) });
      assert.equal(byRel(list, "erd-complete.md").layer, "engineering");
      assert.equal(byRel(list, "user-stories/gestao.md").layer, "product");
    } finally { cleanup(dir); }
  });
});
