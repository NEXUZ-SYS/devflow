// tests/reversa-import/parsers-sdd-spec.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSddSpec } from "../../scripts/reversa-import/parsers/sdd-spec.mjs";

function makeSddFeature(specBody) {
  const dir = mkdtempSync(join(tmpdir(), "rev-sdd-"));
  writeFileSync(join(dir, "spec.md"), specBody);
  return dir;
}

describe("parseSddSpec", () => {
  it("conta linhas úteis e marca hasSdd", () => {
    const body = "# Spec\n" + "linha\n".repeat(40);
    const dir = makeSddFeature(body);
    try {
      const s = parseSddSpec(dir);
      assert.equal(s.hasSdd, true);
      assert.ok(s.specLineCount >= 40);
      assert.equal(s.isStub, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detecta stub (spec curta) e captura marcadores de confiança", () => {
    const dir = makeSddFeature("# Spec\n🔴 lacuna: tudo por fazer\n");
    try {
      const s = parseSddSpec(dir);
      assert.equal(s.isStub, true);
      assert.equal(s.markers.gap, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
