// Run: node --test tests/integration/test-bump-appends-registry.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SH = readFileSync(resolve(import.meta.dirname, "../../scripts/bump-version.sh"), "utf-8");

describe("bump-version.sh", () => {
  it("chama gen-known-hashes --append após o bump", () => {
    assert.match(SH, /gen-known-hashes\.mjs"?\s+--append/);
  });
});
