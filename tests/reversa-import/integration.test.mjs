// tests/reversa-import/integration.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";

function cleanup(d) { rmSync(d, { recursive: true, force: true }); }
const NOW = "2026-07-23T12:00:00.000Z";
const PERFIS = ["green", "yellow", "red", "reverse", "forward-real", "reverse-analysis", "reverse-migration", "no-anchor"];

describe("integração — todos os perfis atravessam o pipeline", () => {
  for (const profile of PERFIS) {
    it(`${profile}: produz IR válido e os 3 artefatos, sem lançar`, () => {
      const dir = makeReversaFixture({ profile });
      try {
        const r = runPipeline({ sourceDir: dir, now: NOW });
        assert.equal(r.detected.isReversa, true);
        assert.equal(r.irValid.ok, true, JSON.stringify(r.irValid.errors));
        assert.deepEqual(Object.keys(r.artifacts).sort(), ["adrs", "index", "manifest"]);
        assert.ok(r.artifacts.index.includes("# Evidência importada do Reversa"));
        assert.equal(JSON.parse(r.artifacts.manifest).schema, 2);
        for (const a of r.ir.artifacts) {
          assert.ok(a.relPath && a.kind && a.kindSource, `artefato completo: ${a.relPath}`);
        }
      } finally { cleanup(dir); }
    });
  }
});

describe("integração — determinismo", () => {
  it("duas execuções sobre a mesma fonte produzem saída idêntica", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const a = runPipeline({ sourceDir: dir, now: NOW });
      const b = runPipeline({ sourceDir: dir, now: NOW });
      assert.equal(a.artifacts.index, b.artifacts.index);
      assert.equal(a.artifacts.manifest, b.artifacts.manifest);
      assert.deepEqual(a.artifacts.adrs, b.artifacts.adrs);
    } finally { cleanup(dir); }
  });
});
