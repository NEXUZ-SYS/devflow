// E2E provenance-aware. Run: node --test tests/integration/test-provenance-sync-e2e.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySync, loadManifest, hashFile } from "../../scripts/lib/provenance-sync.mjs";

describe("E2E provenance-aware (caso motivador)", () => {
  it("stale intocado atualiza; editado preserva; novo adiciona; 2ª sync no-op", () => {
    const plug = mkdtempSync(join(tmpdir(), "e2e-plug-"));
    const proj = mkdtempSync(join(tmpdir(), "e2e-proj-"));
    for (const n of ["dev", "front", "l10n"]) {
      mkdirSync(join(plug, "skills", n), { recursive: true });
      writeFileSync(join(plug, "skills", n, "SKILL.md"), `v2-${n}`);
    }
    // dev = deploy antigo intocado; front = editado; l10n = ausente
    mkdirSync(join(proj, ".context", "skills", "dev"), { recursive: true });
    writeFileSync(join(proj, ".context", "skills", "dev", "SKILL.md"), "v1-dev");
    mkdirSync(join(proj, ".context", "skills", "front"), { recursive: true });
    writeFileSync(join(proj, ".context", "skills", "front", "SKILL.md"), "FRONT-editado");

    const registry = new Set([hashFile(join(proj, ".context", "skills", "dev", "SKILL.md"))]);
    const artifacts = ["dev", "front", "l10n"].map((n) => ({
      src: join(plug, "skills", n, "SKILL.md"),
      dest: join(proj, ".context", "skills", n, "SKILL.md"),
      framework: "skill",
    }));

    const r1 = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry, sourceVersion: "2.0.0" });
    assert.equal(r1.updated.length, 1, "dev intocado → updated");
    assert.equal(r1.preserved.length, 1, "front editado → preserved");
    assert.equal(r1.added.length, 1, "l10n novo → added");
    assert.equal(readFileSync(join(proj, ".context", "skills", "dev", "SKILL.md"), "utf-8"), "v2-dev");
    assert.equal(readFileSync(join(proj, ".context", "skills", "front", "SKILL.md"), "utf-8"), "FRONT-editado");

    const r2 = applySync({ projectRoot: proj, pluginRoot: plug, artifacts, registry, sourceVersion: "2.0.0" });
    assert.equal(r2.updated.length, 0);
    assert.equal(r2.added.length, 0);
    assert.equal(r2.current.length, 2, "dev, l10n → current");
    assert.equal(r2.preserved.length, 1, "front segue preserved");
    assert.ok(loadManifest(proj).artifacts.length >= 2);
  });
});
