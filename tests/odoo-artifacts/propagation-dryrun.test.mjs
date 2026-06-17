// Task 10 — dry-run de propagação (tmpdir, guard anti-wipe, origem C1, composição).
// Run: node --test tests/odoo-artifacts/propagation-dryrun.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { frameworkContributions } from "../../scripts/lib/detect-framework.mjs";

const PLUGIN = resolve(import.meta.dirname, "../..");

function scaffold(files) {
  const root = mkdtempSync(join(tmpdir(), "nxz-prop-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

// Simula a cópia de standards do project-init usando standardsWithOrigin (C1).
function copyStandards(contrib, destCtx) {
  // GUARD anti-wipe (memória feedback_tests_no_mutate_tracked): destino sempre em tmpdir.
  assert.ok(destCtx.startsWith(tmpdir()), `destino fora de tmpdir: ${destCtx}`);
  const out = join(destCtx, "engineering", "standards", "machine");
  mkdirSync(out, { recursive: true });
  for (const { id, framework } of contrib.standardsWithOrigin) {
    const src = join(PLUGIN, "assets", "standards", "profiles", framework, `${id}.md`);
    assert.ok(existsSync(src), `origem não resolve por C1: ${framework}/${id}.md`);
    copyFileSync(src, join(destCtx, "engineering", "standards", `${id}.md`));
  }
}

describe("dry-run de propagação", () => {
  it("projeto NXZ recebe L1+L2+L3 e resolve standards por origem", () => {
    const proj = scaffold({ "addons/nxz_utils/__manifest__.py": "{'name':'x','author':'Nexuz'}" });
    const c = frameworkContributions(proj, PLUGIN);
    // composição: skills L1 + L2 + L3
    for (const s of ["odoo-development", "frontend-specialist-odoo", "odoo-l10n-br", "odoo-nxz-overlay"]) {
      assert.ok(c.skills.includes(s), `NXZ deve receber skill ${s}`);
    }
    // origem dos standards: NXZ vs odoo
    const byId = Object.fromEntries(c.standardsWithOrigin.map((x) => [x.id, x.framework]));
    assert.equal(byId["std-odoo-oca-separation"], "nxz");
    assert.equal(byId["std-odoo-naming-conventions"], "odoo");
    // cópia real em tmpdir (com guard)
    const destCtx = join(mkdtempSync(join(tmpdir(), "nxz-ctx-")), ".context");
    copyStandards(c, destCtx);
    assert.ok(existsSync(join(destCtx, "engineering/standards/std-odoo-oca-separation.md")));
  });

  it("projeto Odoo genérico recebe só L1+L2 (sem overlay NXZ)", () => {
    const proj = scaffold({ "addons/sale_x/__manifest__.py": "{'name':'s','author':'ACME'}" });
    const c = frameworkContributions(proj, PLUGIN);
    for (const s of ["odoo-development", "frontend-specialist-odoo", "odoo-l10n-br"]) {
      assert.ok(c.skills.includes(s), `Odoo genérico deve receber ${s}`);
    }
    assert.ok(!c.skills.includes("odoo-nxz-overlay"), "Odoo genérico NÃO recebe overlay NXZ");
    // nenhum standard de origem nxz
    assert.ok(
      !c.standardsWithOrigin.some((x) => x.framework === "nxz"),
      "Odoo genérico não recebe standards de origem nxz",
    );
  });
});
