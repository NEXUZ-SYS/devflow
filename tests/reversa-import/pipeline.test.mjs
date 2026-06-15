// tests/reversa-import/pipeline.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("runPipeline", () => {
  it("projeto green produz IR válido, assessment green e artefatos emitidos", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      const r = runPipeline({ sourceDir: dir });
      assert.equal(r.detected.isReversa, true);
      assert.equal(r.readiness.global, "green");
      assert.ok(r.artifacts.prd.includes("# PRD"));
      assert.ok(Array.isArray(r.artifacts.adrs));
      assert.ok(r.artifacts.stories.includes("stories:"));
      assert.ok(r.artifacts.fidelityReport.includes("Fidelidade"));
      assert.ok(r.consistency.checks.length >= 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("source não-Reversa → retorna detected.isReversa=false e não tenta parsear", () => {
    const dir = makeReversaFixture({ profile: "green" });
    rmSync(`${dir}/.reversa`, { recursive: true, force: true });
    try {
      const r = runPipeline({ sourceDir: dir });
      assert.equal(r.detected.isReversa, false);
      assert.equal(r.artifacts, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("projeto red ainda produz artefatos mas com readiness red (import parcial)", () => {
    const dir = makeReversaFixture({ profile: "red" });
    try {
      const r = runPipeline({ sourceDir: dir });
      assert.equal(r.readiness.global, "red");
      assert.ok(r.artifacts !== null, "red ainda emite (import parcial explícito)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
