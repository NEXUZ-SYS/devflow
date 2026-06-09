/**
 * Referential-integrity gate — every framework profile must point at real files.
 * Run: node --test tests/integration/test-framework-profiles-integrity.mjs
 *
 * This guards against a profile listing an agent/skill that does not exist in
 * the plugin bundle (the failure mode that left odoo-specialist orphaned).
 *
 * AC1  every profiles/*.yaml parses and has framework/detect/agents/skills
 * AC2  every agent listed exists at agents/<name>.md
 * AC3  every skill listed exists at skills/<slug>/SKILL.md
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYaml } from "../../scripts/lib/frontmatter.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const PROFILES_DIR = join(REPO, "profiles");

function profileFiles() {
  if (!existsSync(PROFILES_DIR)) return [];
  return readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
}

describe("framework-profiles integrity", () => {
  it("AC0 profiles/ directory exists with at least one profile", () => {
    assert.ok(existsSync(PROFILES_DIR), "profiles/ directory missing");
    assert.ok(profileFiles().length >= 1, "no profile files found");
  });

  for (const file of profileFiles()) {
    const data = parseYaml(readFileSync(join(PROFILES_DIR, file), "utf-8"));

    it(`AC1 ${file} is well-formed`, () => {
      assert.ok(data.framework, "missing framework");
      assert.ok(data.detect && typeof data.detect === "object", "missing detect");
      assert.ok(Array.isArray(data.agents), "agents must be an array");
      assert.ok(Array.isArray(data.skills), "skills must be an array");
    });

    it(`AC2 ${file} agents exist as files`, () => {
      for (const agent of data.agents || []) {
        const p = join(REPO, "agents", `${agent}.md`);
        assert.ok(existsSync(p), `agent "${agent}" referenced by ${file} missing: ${p}`);
      }
    });

    it(`AC3 ${file} skills exist as files`, () => {
      for (const skill of data.skills || []) {
        const p = join(REPO, "skills", skill, "SKILL.md");
        assert.ok(existsSync(p), `skill "${skill}" referenced by ${file} missing: ${p}`);
      }
    });
  }
});
