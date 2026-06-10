/**
 * Referential-integrity gate — profile-scoped Odoo standards.
 * Run: node --test tests/integration/test-profile-standards-integrity.mjs
 *
 * Guards the three-way mirror that must stay consistent as batches land:
 *   profiles/odoo.yaml `standards:`  ==  MANIFEST.txt entries  ==  files on disk
 *
 * AC1 every id in profiles/odoo.yaml `standards:` is listed in the profile MANIFEST
 * AC2 every MANIFEST entry has both std-<id>.md and machine/std-<id>.js
 * AC3 no orphan MANIFEST entry missing from profiles/odoo.yaml `standards:`
 *
 * With an empty `standards:` list these pass vacuously; each batch that appends
 * an id must also ship its files, or this gate goes red.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYaml } from "../../scripts/lib/frontmatter.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const PROFILE_DIR = join(REPO, "assets", "standards", "profiles", "odoo");
const MANIFEST = join(PROFILE_DIR, "MANIFEST.txt");

function manifestIds() {
  if (!existsSync(MANIFEST)) return [];
  return readFileSync(MANIFEST, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.replace(/\.md$/, ""));
}

function profileStandardIds() {
  const data = parseYaml(readFileSync(join(REPO, "profiles", "odoo.yaml"), "utf-8"));
  return Array.isArray(data.standards) ? data.standards : [];
}

describe("profile-standards integrity (odoo)", () => {
  it("AC0 profile dir and MANIFEST exist", () => {
    assert.ok(existsSync(PROFILE_DIR), "assets/standards/profiles/odoo/ missing");
    assert.ok(existsSync(MANIFEST), "profile MANIFEST.txt missing");
  });

  it("AC1 every profile standard id is in the MANIFEST", () => {
    const manifest = new Set(manifestIds());
    for (const id of profileStandardIds()) {
      assert.ok(manifest.has(id), `std "${id}" in odoo.yaml but not in MANIFEST.txt`);
    }
  });

  it("AC2 every MANIFEST entry has std-<id>.md + machine/std-<id>.js", () => {
    for (const id of manifestIds()) {
      assert.ok(existsSync(join(PROFILE_DIR, `${id}.md`)), `missing ${id}.md`);
      assert.ok(existsSync(join(PROFILE_DIR, "machine", `${id}.js`)), `missing machine/${id}.js`);
    }
  });

  it("AC3 no orphan MANIFEST entry missing from odoo.yaml standards", () => {
    const declared = new Set(profileStandardIds());
    for (const id of manifestIds()) {
      assert.ok(declared.has(id), `std "${id}" in MANIFEST.txt but not in odoo.yaml standards`);
    }
  });
});
