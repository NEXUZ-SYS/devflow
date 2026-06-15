// tests/reversa-import/parsers-forward-feature.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseForwardFeature } from "../../scripts/reversa-import/parsers/forward-feature.mjs";

function makeFeatureDir(name, reqBody) {
  const dir = mkdtempSync(join(tmpdir(), `rev-feat-${name}-`));
  mkdirSync(join(dir, "interfaces"), { recursive: true });
  writeFileSync(join(dir, "requirements.md"), reqBody);
  writeFileSync(join(dir, "interfaces", "api.md"), "# API\n");
  return dir;
}

describe("parseForwardFeature", () => {
  it("extrai slug, requisitos e marca presença de interfaces", () => {
    const dir = makeFeatureDir("auth", "# Requirements 001-auth\n- RN-01: senha forte\n- US-01: login (AC: token)\n");
    try {
      const f = parseForwardFeature(dir);
      assert.equal(f.hasForward, true);
      assert.equal(f.interfaces, true);
      assert.ok(f.requirements.includes("RN-01"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("slug é seguro (via toSlug): nunca começa com dígito nem contém traversal", () => {
    const dir = makeFeatureDir("001-auth-workspace", "# x\n");
    try {
      const f = parseForwardFeature(dir);
      assert.ok(f.slug.length > 0);
      assert.ok(!/^\d/.test(f.slug));
      assert.ok(!f.slug.includes("/") && !f.slug.includes(".."));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
