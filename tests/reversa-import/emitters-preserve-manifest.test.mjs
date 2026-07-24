// tests/reversa-import/emitters-preserve-manifest.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { resolveHandoff } from "../../scripts/reversa-import/handoff.mjs";
import { classifyArtifacts } from "../../scripts/reversa-import/classify.mjs";
import { planPreserve, DEFAULT_MAX_TEXT_BYTES } from "../../scripts/reversa-import/emitters/preserve.mjs";
import { emitManifest } from "../../scripts/reversa-import/emitters/manifest.mjs";

function cleanup(d) { rmSync(d, { recursive: true, force: true }); }
function planFor(dir, opts) {
  return planPreserve(classifyArtifacts(dir, { handoff: resolveHandoff(dir) }), opts);
}

describe("planPreserve — estrutura preservada", () => {
  it("mantém caminho e nome originais, sem achatar", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const feat = planFor(dir).find((p) => p.relPath.endsWith("parity_tests/01-alpha.feature"));
      assert.ok(feat, "arquivo aninhado está no plano");
      assert.equal(feat.to,
        ".context/imported/reversa/_reversa_sdd/migration/parity_tests/01-alpha.feature");
    } finally { cleanup(dir); }
  });

  it("os caminhos citados na ordem de leitura do handoff resolvem dentro do espelho", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const handoff = resolveHandoff(dir);
      const plan = planPreserve(classifyArtifacts(dir, { handoff }), {});
      const destinos = new Set(plan.map((p) => p.to));
      for (const nome of handoff.readingOrder) {
        const esperado = `.context/imported/reversa/_reversa_sdd/migration/${nome}`;
        assert.ok(destinos.has(esperado), `${nome} resolve no espelho (${esperado})`);
      }
    } finally { cleanup(dir); }
  });

  it("cobre TODO o corpus de texto, não só spec.md/screens.md", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      const plan = planFor(dir);
      for (const alvo of ["adrs/0001-decisao-um.md", "mod-a/tasks.md",
                          "traceability/code-spec-matrix.md", "erd-complete.md"]) {
        assert.ok(plan.some((p) => p.relPath.endsWith(alvo)), `${alvo} preservado`);
      }
      assert.ok(plan.every((p) => p.disposition === "mirrored"),
        "nenhum texto do fixture passa do teto");
    } finally { cleanup(dir); }
  });
});

describe("planPreserve — envelope", () => {
  it("binário vira linked, de qualquer tamanho", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      mkdirSync(join(dir, "_reversa_sdd", "screenshots"), { recursive: true });
      writeFileSync(join(dir, "_reversa_sdd", "screenshots", "tela.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const p = planFor(dir).find((x) => x.relPath.endsWith("tela.png"));
      assert.equal(p.disposition, "linked", "binário pequeno ainda assim é linked");
    } finally { cleanup(dir); }
  });

  it("texto acima do teto vira linked", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      writeFileSync(join(dir, "_reversa_sdd", "gigante.md"), "x".repeat(300 * 1024));
      const p = planFor(dir).find((x) => x.relPath.endsWith("gigante.md"));
      assert.equal(p.disposition, "linked");
      assert.ok(p.size > DEFAULT_MAX_TEXT_BYTES);
    } finally { cleanup(dir); }
  });

  it("teto é configurável", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      const p = planFor(dir, { maxTextBytes: 10 }).find((x) => x.relPath.endsWith("erd-complete.md"));
      assert.equal(p.disposition, "linked", "com teto de 10 B tudo vira linked");
    } finally { cleanup(dir); }
  });
});

describe("emitManifest", () => {
  it("registra hash, disposição e a âncora resolvida", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const handoff = resolveHandoff(dir);
      const artifacts = classifyArtifacts(dir, { handoff });
      const preservePlan = planPreserve(artifacts, {});
      const json = JSON.parse(emitManifest(
        { project: { name: "fix" }, provenance: { mode: "reverse" }, handoff, preservePlan, conflicts: [] },
        { now: "2026-07-23T00:00:00.000Z" },
      ));
      assert.equal(json.schema, 2);
      assert.equal(json.handoff.rule, "kind-frontmatter");
      const um = json.artifacts.find((a) => a.relPath.endsWith("handoff.md"));
      assert.match(um.hash, /^[0-9a-f]{64}$/);
      assert.equal(um.disposition, "mirrored");
    } finally { cleanup(dir); }
  });

  it("fonte inexistente → hash null, não quebra", () => {
    const preservePlan = [{ to: "x.md", from: "/nao/existe.md", relPath: "x.md", disposition: "mirrored", kind: "analysis", size: 0 }];
    const json = emitManifest({ project: { name: "x" }, preservePlan, conflicts: [] }, { now: "2026-07-23T00:00:00.000Z" });
    assert.equal(JSON.parse(json).artifacts[0].hash, null);
  });
});
