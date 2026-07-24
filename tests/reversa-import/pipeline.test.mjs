// tests/reversa-import/pipeline.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";

function cleanup(d) { rmSync(d, { recursive: true, force: true }); }
const NOW = "2026-07-23T12:00:00.000Z";

describe("runPipeline — contrato novo", () => {
  it("NÃO emite mais PRD, stories nem plans", () => {
    const dir = makeReversaFixture({ profile: "forward-real" });
    try {
      const r = runPipeline({ sourceDir: dir, now: NOW });
      assert.ok(!("prd" in r.artifacts), "PRD é autorado pelo Planning");
      assert.ok(!("stories" in r.artifacts));
      assert.ok(!("plansJson" in r.artifacts));
      assert.ok(!("planSkeletons" in r.artifacts));
      assert.ok(!("readiness" in r), "readiness dissolvido no ledger");
      assert.ok(!("mapDegraded" in r), "sem map, sem degradação de marco");
    } finally { cleanup(dir); }
  });

  it("emite índice, manifesto e ADRs", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      const r = runPipeline({ sourceDir: dir, now: NOW });
      assert.ok(r.artifacts.index.length > 0);
      assert.ok(JSON.parse(r.artifacts.manifest).schema === 2);
      assert.equal(r.artifacts.adrs.length, 2, "os 2 ADRs reais convertem");
    } finally { cleanup(dir); }
  });

  it("popula o IR de evidência com âncora, ledger e conflitos", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const r = runPipeline({ sourceDir: dir, now: NOW });
      assert.equal(r.ir.handoff.found, true);
      assert.ok(r.ir.artifacts.length > 0);
      assert.ok(r.ir.ledger.markers.total > 0);
      assert.equal(r.ir.provenance.mode, "reverse");
      assert.ok(r.ir.conflicts.some((c) => c.id === "competing-plans"));
      assert.equal(r.irValid.ok, true);
    } finally { cleanup(dir); }
  });

  it("forward e reverse seguem o MESMO caminho — modo é só proveniência", () => {
    const fwd = makeReversaFixture({ profile: "forward-real" });
    const rev = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      const a = runPipeline({ sourceDir: fwd, now: NOW });
      const b = runPipeline({ sourceDir: rev, now: NOW });
      assert.equal(a.ir.provenance.mode, "forward");
      assert.equal(b.ir.provenance.mode, "reverse");
      assert.deepEqual(Object.keys(a.artifacts).sort(), Object.keys(b.artifacts).sort());
    } finally { cleanup(fwd); cleanup(rev); }
  });

  it("origem que não é Reversa devolve resultado vazio sem lançar", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      rmSync(`${dir}/.reversa`, { recursive: true, force: true });
      const r = runPipeline({ sourceDir: dir, now: NOW });
      assert.equal(r.detected.isReversa, false);
      assert.equal(r.ir, null);
    } finally { cleanup(dir); }
  });
});
