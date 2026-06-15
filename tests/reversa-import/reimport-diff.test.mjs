// tests/reversa-import/reimport-diff.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { diffSourceAgainstManifest } from "../../scripts/reversa-import/reimport-diff.mjs";

function sha(s) { return createHash("sha256").update(s).digest("hex"); }

describe("diffSourceAgainstManifest", () => {
  it("reporta fontes cujo hash mudou desde a última importação", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-rd-"));
    const src = mkdtempSync(join(tmpdir(), "rev-rs-"));
    const a = join(src, "a.md"); const b = join(src, "b.md");
    writeFileSync(a, "ORIGINAL A"); writeFileSync(b, "B inalterado");
    mkdirSync(join(dest, ".context", "imported", "reversa"), { recursive: true });
    writeFileSync(join(dest, ".context", "imported", "reversa", "manifest.json"),
      JSON.stringify({ schema: 1, artifacts: [
        { reversaSource: a, hash: sha("ANTIGO A") },   // mudou
        { reversaSource: b, hash: sha("B inalterado") }, // igual
      ] }));
    try {
      const d = diffSourceAgainstManifest(dest);
      assert.deepEqual(d.changed.map((c) => c.reversaSource), [a]);
      assert.equal(d.unchanged.length, 1);
    } finally {
      rmSync(dest, { recursive: true, force: true });
      rmSync(src, { recursive: true, force: true });
    }
  });

  it("sem manifesto anterior → primeira importação (changed=[], firstImport=true)", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-rd2-"));
    try {
      const d = diffSourceAgainstManifest(dest);
      assert.equal(d.firstImport, true);
      assert.deepEqual(d.changed, []);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
