// tests/reversa-import/emitters-preserve-manifest.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { planPreserve } from "../../scripts/reversa-import/emitters/preserve.mjs";
import { emitManifest } from "../../scripts/reversa-import/emitters/manifest.mjs";

describe("planPreserve", () => {
  it("mapeia refs Reversa para .context/imported/reversa/ sem copiar (plano)", () => {
    const ir = createIR();
    ir.features = [{ slug: "auth", specPath: "/src/_reversa_sdd/auth/spec.md", hasSdd: true, hasScreens: false }];
    const plan = planPreserve(ir, "/src");
    assert.ok(plan.some((p) => p.to.includes(".context/imported/reversa/auth")));
    assert.ok(plan.every((p) => p.from && p.to));
  });
});

describe("emitManifest", () => {
  it("gera manifesto com hash da fonte por artefato emitido", () => {
    const dir = mkdtempSync(join(tmpdir(), "rev-man-"));
    writeFileSync(join(dir, "spec.md"), "conteúdo da fonte");
    try {
      const ir = createIR();
      const emitted = [{ devflowArtifact: ".context/plans/auth.md", reversaSource: join(dir, "spec.md") }];
      const json = emitManifest(ir, emitted);
      const obj = JSON.parse(json);
      assert.equal(obj.artifacts.length, 1);
      assert.match(obj.artifacts[0].hash, /^[a-f0-9]{64}$/); // sha256 hex
      assert.ok("reconcileDecisions" in obj);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fonte inexistente → hash null, não quebra", () => {
    const ir = createIR();
    const json = emitManifest(ir, [{ devflowArtifact: "x.md", reversaSource: "/nao/existe.md" }]);
    assert.equal(JSON.parse(json).artifacts[0].hash, null);
  });
});
