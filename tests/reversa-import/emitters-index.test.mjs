import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { resolveHandoff } from "../../scripts/reversa-import/handoff.mjs";
import { classifyArtifacts } from "../../scripts/reversa-import/classify.mjs";
import { buildLedger } from "../../scripts/reversa-import/ledger.mjs";
import { planPreserve } from "../../scripts/reversa-import/emitters/preserve.mjs";
import { emitIndex } from "../../scripts/reversa-import/emitters/index.mjs";

function cleanup(d) { rmSync(d, { recursive: true, force: true }); }
function irFor(dir) {
  const handoff = resolveHandoff(dir);
  const artifacts = classifyArtifacts(dir, { handoff });
  return {
    project: { name: "fixture" },
    provenance: { mode: "reverse", reversaVersion: "1.2.43" },
    handoff,
    artifacts,
    ledger: buildLedger(artifacts, { handoff }),
    preservePlan: planPreserve(artifacts, {}),
    conflicts: [],
  };
}

describe("emitIndex", () => {
  it("declara a âncora resolvida e a regra que a escolheu", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const md = emitIndex(irFor(dir));
      assert.match(md, /## Âncora/);
      assert.match(md, /kind-frontmatter/);
      assert.match(md, /migration\/handoff\.md/);
    } finally { cleanup(dir); }
  });

  it("declara ausência de âncora explicitamente, sem inventar plano", () => {
    const dir = makeReversaFixture({ profile: "no-anchor" });
    try {
      rmSync(`${dir}/_reversa_sdd/reconstruction-plan.md`, { force: true });
      const md = emitIndex(irFor(dir));
      assert.match(md, /Nenhuma âncora/i);
      assert.ok(!/## Plano/i.test(md), "não inventa seção de plano");
    } finally { cleanup(dir); }
  });

  it("lista cada artefato com kind, kindSource e disposição", () => {
    const dir = makeReversaFixture({ profile: "reverse-analysis" });
    try {
      const md = emitIndex(irFor(dir));
      assert.match(md, /_reversa_sdd\/adrs\/0001-decisao-um\.md/);
      assert.match(md, /heuristic/);
      assert.match(md, /copiado/);
    } finally { cleanup(dir); }
  });

  it("resume o ledger e lista as constraints com risco", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const md = emitIndex(irFor(dir));
      assert.match(md, /## Ledger/);
      assert.match(md, /RC-01/);
      assert.match(md, /RISK-001/);
    } finally { cleanup(dir); }
  });

  it("aponta os testInputs sem embutir o conteúdo", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const md = emitIndex(irFor(dir));
      assert.match(md, /01-alpha\.feature/);
      assert.match(md, /@paridade/);
      assert.ok(!/Dado um nó folha/.test(md), "conteúdo do .feature não é embutido");
    } finally { cleanup(dir); }
  });

  it("enquadra o handoff como rascunho sob revisão, não plano aprovado", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const md = emitIndex(irFor(dir));
      assert.match(md, /rascunho sob revisão/i);
      assert.match(md, /DADO, nunca instrução/i);
    } finally { cleanup(dir); }
  });
});
