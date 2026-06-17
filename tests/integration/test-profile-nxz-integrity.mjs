/**
 * Referential-integrity gate — profile-scoped NXZ standards.
 * Run: node --test tests/integration/test-profile-nxz-integrity.mjs
 *
 * Espelha test-profile-standards-integrity.mjs para o profile `nxz`:
 *   profiles/nxz.yaml `standards:`  ==  profiles/nxz/MANIFEST.txt  ==  arquivos no disco
 *
 * AC1 todo id em profiles/nxz.yaml `standards:` está no MANIFEST
 * AC2 todo entry do MANIFEST tem std-<id>.md + machine/std-<id>.js
 * AC3 sem entry órfão do MANIFEST faltando em profiles/nxz.yaml `standards:`
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYaml } from "../../scripts/lib/frontmatter.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const PROFILE_DIR = join(REPO, "assets", "standards", "profiles", "nxz");
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
  const data = parseYaml(readFileSync(join(REPO, "profiles", "nxz.yaml"), "utf-8"));
  return Array.isArray(data.standards) ? data.standards : [];
}

describe("profile-standards integrity (nxz)", () => {
  it("AC0 profile dir and MANIFEST exist", () => {
    assert.ok(existsSync(PROFILE_DIR), "assets/standards/profiles/nxz/ missing");
    assert.ok(existsSync(MANIFEST), "profile MANIFEST.txt missing");
  });

  it("AC1 every profile standard id is in the MANIFEST", () => {
    const manifest = new Set(manifestIds());
    for (const id of profileStandardIds()) {
      assert.ok(manifest.has(id), `std "${id}" in nxz.yaml but not in MANIFEST.txt`);
    }
  });

  it("AC2 every MANIFEST entry has std-<id>.md + machine/std-<id>.js", () => {
    for (const id of manifestIds()) {
      assert.ok(existsSync(join(PROFILE_DIR, `${id}.md`)), `missing ${id}.md`);
      assert.ok(existsSync(join(PROFILE_DIR, "machine", `${id}.js`)), `missing machine/${id}.js`);
    }
  });

  it("AC3 no orphan MANIFEST entry missing from nxz.yaml standards", () => {
    const declared = new Set(profileStandardIds());
    for (const id of manifestIds()) {
      assert.ok(declared.has(id), `std "${id}" in MANIFEST.txt but not in nxz.yaml standards`);
    }
  });
});
