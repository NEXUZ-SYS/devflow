import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { resolveHandoff } from "../../scripts/reversa-import/handoff.mjs";
import { classifyArtifacts } from "../../scripts/reversa-import/classify.mjs";
import { validateConsistency } from "../../scripts/reversa-import/consistency.mjs";

function cleanup(d) { rmSync(d, { recursive: true, force: true }); }
function check(dir, id) {
  const handoff = resolveHandoff(dir);
  const artifacts = classifyArtifacts(dir, { handoff });
  const r = validateConsistency({ handoff, artifacts });
  return { r, c: r.checks.find((x) => x.id === id) };
}

describe("validateConsistency — sobre a evidência", () => {
  it("handoff-artifacts: passa quando todo artefato da tabela existe no corpus", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      assert.equal(check(dir, "handoff-artifacts").c.status, "pass");
    } finally { cleanup(dir); }
  });

  it("handoff-artifacts: falha quando a tabela cita artefato ausente", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      rmSync(join(dir, "_reversa_sdd", "migration", "topology_decision.md"), { force: true });
      const { c } = check(dir, "handoff-artifacts");
      assert.equal(c.status, "fail");
      assert.ok(c.issues.some((i) => /topology_decision\.md/.test(i)));
    } finally { cleanup(dir); }
  });

  it("reading-order: falha quando a ordem de leitura cita arquivo inexistente", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      rmSync(join(dir, "_reversa_sdd", "migration", "parity_specs.md"), { force: true });
      const { c } = check(dir, "reading-order");
      assert.equal(c.status, "fail");
      assert.ok(c.issues.some((i) => /parity_specs\.md/.test(i)));
    } finally { cleanup(dir); }
  });

  it("competing-plans: detecta reconstruction-plan coexistindo com handoff de migração", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const { r, c } = check(dir, "competing-plans");
      assert.equal(c.status, "fail", "os dois coexistem no fixture");
      assert.ok(r.conflicts.some((x) => x.id === "competing-plans"),
        "vira conflito para a pauta do Planning");
    } finally { cleanup(dir); }
  });

  it("competing-plans: passa quando só há uma fonte de plano", () => {
    const dir = makeReversaFixture({ profile: "no-anchor" });
    try {
      assert.equal(check(dir, "competing-plans").c.status, "pass");
    } finally { cleanup(dir); }
  });

  it("untyped-ratio: sinaliza quando quase tudo caiu na heurística", () => {
    const dir = makeReversaFixture({ profile: "no-anchor" });
    try {
      const { c } = check(dir, "untyped-ratio");
      assert.equal(c.status, "fail", "no-anchor não tem nada tipado pela fonte");
    } finally { cleanup(dir); }
  });

  it("conflitos NUNCA bloqueiam — são sempre pauta", () => {
    const dir = makeReversaFixture({ profile: "reverse-migration" });
    try {
      const { r } = check(dir, "competing-plans");
      assert.ok(!("blocked" in r), "resultado não tem noção de bloqueio");
      for (const c of r.conflicts) assert.ok(c.id && c.detail);
    } finally { cleanup(dir); }
  });
});
