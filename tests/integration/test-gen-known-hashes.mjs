// Run: node --test tests/integration/test-gen-known-hashes.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { distributableFiles, genFromWorkingTree } from "../../scripts/lib/gen-known-hashes.mjs";
import { hashFile } from "../../scripts/lib/provenance-sync.mjs";

const REPO = resolve(import.meta.dirname, "../..");

describe("gen-known-hashes (verbatim only)", () => {
  it("distributableFiles inclui skills e standards de profile; exclui agents e std raiz", () => {
    const f = distributableFiles(REPO);
    assert.ok(f.some((x) => x.startsWith("skills/")), "skills/");
    assert.ok(f.some((x) => x.startsWith(join("assets", "standards", "profiles"))), "profiles");
    assert.ok(!f.some((x) => x.startsWith("agents/")), "agents fora");
    assert.ok(!f.some((x) => /^assets[/\\]standards[/\\]std-.*\.md$/.test(x)), "std raiz fora");
  });
  it("genFromWorkingTree é Set e contém hash de uma skill atual", () => {
    const set = genFromWorkingTree(REPO);
    assert.ok(set instanceof Set);
    assert.ok(set.has(hashFile(join(REPO, "skills", "odoo-development", "SKILL.md"))));
  });
});
