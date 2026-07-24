import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { resolveHandoff } from "../../scripts/reversa-import/handoff.mjs";
import { classifyArtifacts } from "../../scripts/reversa-import/classify.mjs";
import { buildLedger } from "../../scripts/reversa-import/ledger.mjs";

function cleanup(d) { rmSync(d, { recursive: true, force: true }); }
function ledgerFor(dir) {
  const handoff = resolveHandoff(dir);
  return buildLedger(classifyArtifacts(dir, { handoff }), { handoff });
}

describe("buildLedger — marcadores", () => {
  it("agrega 🟢🟡🔴 do corpus e por arquivo", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      const l = ledgerFor(dir);
      assert.ok(l.markers.captured > 0, "conta 🟢");
      assert.ok(l.markers.inferred > 0, "conta 🟡");
      assert.ok(l.markers.gap > 0, "conta 🔴 (os ADRs têm a linha de limitação)");
      assert.equal(l.markers.total,
        l.markers.official + l.markers.captured + l.markers.inferred + l.markers.gap);
      const adr = l.byFile["_reversa_sdd/adrs/0001-decisao-um.md"];
      assert.ok(adr && adr.total > 0, "byFile indexado por relPath");
    } finally { cleanup(dir); }
  });

  it("não tenta ler binário nem arquivo fora do conjunto de texto", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const l = ledgerFor(dir);
      assert.ok(Object.keys(l.byFile).every((k) => /\.(md|feature|txt|ya?ml|json)$/.test(k)));
    } finally { cleanup(dir); }
  });
});

describe("buildLedger — constraints vindas dos RC", () => {
  it("converte cada RC do handoff em constraint com alvo e risco", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const l = ledgerFor(dir);
      assert.equal(l.constraints.length, 2);
      const rc1 = l.constraints.find((c) => c.id === "RC-01");
      assert.match(rc1.where, /scoring\.py/);
      assert.equal(rc1.risk, "RISK-001");
      assert.equal(rc1.origin, "handoff-rc");
      const rc2 = l.constraints.find((c) => c.id === "RC-02");
      assert.equal(rc2.risk, "RISK-004");
    } finally { cleanup(dir); }
  });

  it("sem handoff → nenhuma constraint, sem lançar", () => {
    const dir = makeReversaFixture({ profile: "no-anchor" });
    try {
      const l = ledgerFor(dir);
      assert.deepEqual(l.constraints, []);
    } finally { cleanup(dir); }
  });
});

describe("buildLedger — testInputs declarados", () => {
  it("registra .feature com contagem de cenários e tags, SEM converter", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const l = ledgerFor(dir);
      assert.equal(l.testInputs.length, 1);
      const t = l.testInputs[0];
      assert.match(t.relPath, /parity_tests\/01-alpha\.feature$/);
      assert.equal(t.format, "gherkin");
      assert.equal(t.scenarios, 2);
      assert.deepEqual(t.tags.sort(), ["@conformidade", "@paridade"]);
      assert.ok(!("code" in t), "registrar não é converter — nenhum código emitido");
      assert.ok(!("content" in t), "conteúdo não é embutido, só apontado");
    } finally { cleanup(dir); }
  });
});
