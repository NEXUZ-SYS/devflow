// tests/standards/std-documentation.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-documentation.js";

describe("std-documentation linter", () => {
  it("BAD: TODO sem issue/dono", () => {
    assert.equal(lintFile(L, "a.ts", `// TODO: arrumar isso depois`).code, 1);
  });
  it("BAD: FIXME sem link", () => {
    assert.equal(lintFile(L, "a.ts", `// FIXME quebra com null`).code, 1);
  });
  it("GOOD: TODO com issue", () => {
    assert.equal(lintFile(L, "a.ts", `// TODO: #123 extrair função`).code, 0);
  });
  it("GOOD: TODO com URL", () => {
    assert.equal(lintFile(L, "a.ts", `// HACK: github.com/org/repo/issues/9 workaround`).code, 0);
  });
  it("BAD: # TODO Python sem issue", () => {
    assert.equal(lintFile(L, "m.py", `# TODO: refatorar isso`).code, 1);
  });
  it("GOOD: # TODO Python com issue", () => {
    assert.equal(lintFile(L, "m.py", `# TODO: #42 extrair helper`).code, 0);
  });
});
