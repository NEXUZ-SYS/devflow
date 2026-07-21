import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { detectMode } from "../../scripts/reversa-import/mode.mjs";

function cleanup(dir) { rmSync(dir, { recursive: true, force: true }); }

describe("detectMode", () => {
  it("classifica projeto reverse como 'reverse' e explica os motivos", () => {
    const dir = makeReversaFixture({ profile: "reverse" });
    try {
      const r = detectMode(dir);
      assert.equal(r.mode, "reverse");
      assert.ok(r.reasons.some((x) => /análise reversa/i.test(x)), "reasons cita análise reversa");
    } finally { cleanup(dir); }
  });

  it("classifica forward (green) como 'forward'", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try { assert.equal(detectMode(dir).mode, "forward"); } finally { cleanup(dir); }
  });

  it("classifica forward (yellow) como 'forward'", () => {
    const dir = makeReversaFixture({ profile: "yellow" });
    try { assert.equal(detectMode(dir).mode, "forward"); } finally { cleanup(dir); }
  });

  it("forward vazio MAS com um spec.md em módulo → forward (critério 2 falha)", () => {
    const dir = makeReversaFixture({ profile: "reverse" });
    try {
      writeFileSync(join(dir, "_reversa_sdd", "mod-a", "spec.md"), "# spec\nconteúdo real\n");
      assert.equal(detectMode(dir).mode, "forward");
    } finally { cleanup(dir); }
  });

  it("forward vazio, sem spec, sem artefato de análise → forward (critério 3 falha)", () => {
    const dir = makeReversaFixture({ profile: "reverse" });
    try {
      for (const a of ["code-analysis.md", "erd-complete.md"]) rmSync(join(dir, "_reversa_sdd", a), { force: true });
      rmSync(join(dir, "_reversa_sdd", "traceability"), { recursive: true, force: true });
      assert.equal(detectMode(dir).mode, "forward");
    } finally { cleanup(dir); }
  });
});
