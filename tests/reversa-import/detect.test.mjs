// tests/reversa-import/detect.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectReversa } from "../../scripts/reversa-import/detect.mjs";

function makeSource({ reversa = true, forward = true, sdd = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "rev-detect-"));
  if (reversa) {
    mkdirSync(join(dir, ".reversa"));
    writeFileSync(join(dir, ".reversa", "state.json"), JSON.stringify({ version: "1.2.43" }));
  }
  if (forward) mkdirSync(join(dir, "_reversa_forward"));
  if (sdd) mkdirSync(join(dir, "_reversa_sdd"));
  return dir;
}

describe("detectReversa", () => {
  it("reconhece um projeto Reversa completo", () => {
    const dir = makeSource();
    try {
      const r = detectReversa(dir);
      assert.equal(r.isReversa, true);
      assert.ok(r.artifacts.includes("state.json"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejeita um dir sem .reversa/", () => {
    const dir = makeSource({ reversa: false });
    try {
      const r = detectReversa(dir);
      assert.equal(r.isReversa, false);
      assert.ok(r.reasons.some((x) => x.includes(".reversa")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("aceita com forward ausente mas reporta o que falta (tolerante)", () => {
    const dir = makeSource({ forward: false });
    try {
      const r = detectReversa(dir);
      assert.equal(r.isReversa, true); // .reversa + sdd bastam
      assert.ok(r.missing.includes("_reversa_forward"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
