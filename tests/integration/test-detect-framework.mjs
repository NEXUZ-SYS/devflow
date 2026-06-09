/**
 * Unit/integration gate — framework detection from project signals.
 * Run: node --test tests/integration/test-detect-framework.mjs
 *
 * SAFETY: every fixture is created in an OS tmpdir (mkdtempSync). No tracked
 * directory is ever mutated. The plugin's real `profiles/` is read-only here.
 *
 * AC1  a project with addons/<m>/__manifest__.py is detected as `odoo`
 * AC2  a project with `odoo` in pyproject.toml is detected as `odoo`
 * AC3  a plain Node project (react in package.json) is NOT detected as `odoo`
 * AC4  loadProfiles parses every profiles/*.yaml into a well-formed object
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadProfiles, detectFrameworks } from "../../scripts/lib/detect-framework.mjs";

const REPO = resolve(import.meta.dirname, "../..");

function mkProject(setup) {
  const dir = mkdtempSync(join(tmpdir(), "devflow-fw-"));
  setup(dir);
  return dir;
}

describe("detect-framework", () => {
  const dirs = [];
  const make = (fn) => { const d = mkProject(fn); dirs.push(d); return d; };
  after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  it("AC1 detects odoo via __manifest__.py in addons tree", () => {
    const proj = make((dir) => {
      mkdirSync(join(dir, "addons", "my_module"), { recursive: true });
      writeFileSync(join(dir, "addons", "my_module", "__manifest__.py"),
        "{'name': 'My Module', 'depends': ['base']}\n");
    });
    const found = detectFrameworks(proj, REPO).map((p) => p.framework);
    assert.ok(found.includes("odoo"), `expected odoo, got ${JSON.stringify(found)}`);
  });

  it("AC2 detects odoo via pyproject.toml dependency", () => {
    const proj = make((dir) => {
      writeFileSync(join(dir, "pyproject.toml"),
        "[project]\nname = 'thing'\ndependencies = ['odoo>=17.0', 'requests']\n");
    });
    const found = detectFrameworks(proj, REPO).map((p) => p.framework);
    assert.ok(found.includes("odoo"), `expected odoo, got ${JSON.stringify(found)}`);
  });

  it("AC3 does NOT detect odoo in a plain Node project", () => {
    const proj = make((dir) => {
      writeFileSync(join(dir, "package.json"),
        JSON.stringify({ name: "web", dependencies: { react: "^18" } }, null, 2));
    });
    const found = detectFrameworks(proj, REPO).map((p) => p.framework);
    assert.ok(!found.includes("odoo"), `did not expect odoo, got ${JSON.stringify(found)}`);
  });

  it("AC4 loadProfiles returns well-formed profiles", () => {
    const profiles = loadProfiles(REPO);
    assert.ok(Array.isArray(profiles) && profiles.length >= 1, "expected at least one profile");
    for (const p of profiles) {
      assert.ok(p.framework, "profile missing framework");
      assert.ok(p.detect && typeof p.detect === "object", `${p.framework}: missing detect`);
      assert.ok(Array.isArray(p.agents), `${p.framework}: agents must be an array`);
      assert.ok(Array.isArray(p.skills), `${p.framework}: skills must be an array`);
    }
  });
});
