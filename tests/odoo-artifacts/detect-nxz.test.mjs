// Task 9 — detecção NXZ + origem de standard (C1). Run: node --test tests/odoo-artifacts/detect-nxz.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectFrameworks, frameworkContributions } from "../../scripts/lib/detect-framework.mjs";

const PLUGIN = resolve(import.meta.dirname, "../..");

function scaffold(files) {
  const root = mkdtempSync(join(tmpdir(), "nxz-detect-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

describe("detecção NXZ", () => {
  it("casa nxz por diretório nxz_* (e odoo em paralelo — composição)", () => {
    const root = scaffold({ "addons/nxz_utils/__manifest__.py": "{'name': 'x'}" });
    const names = detectFrameworks(root, PLUGIN).map((p) => p.framework);
    assert.ok(names.includes("odoo"), "odoo deve casar");
    assert.ok(names.includes("nxz"), "nxz deve casar por dirPrefix");
  });

  it("casa nxz quando a CHAVE author do manifest é Nexuz", () => {
    const root = scaffold({ "addons/foo/__manifest__.py": "{'name':'foo','author':'Nexuz'}" });
    assert.ok(detectFrameworks(root, PLUGIN).map((p) => p.framework).includes("nxz"));
  });

  it("NÃO casa nxz em projeto Odoo genérico", () => {
    const root = scaffold({ "addons/sale_custom/__manifest__.py": "{'name':'s','author':'ACME'}" });
    const names = detectFrameworks(root, PLUGIN).map((p) => p.framework);
    assert.ok(names.includes("odoo"));
    assert.ok(!names.includes("nxz"), "nxz não deve casar");
  });

  it("M3 — NÃO casa nxz quando 'Nexuz' aparece só em COMENTÁRIO (não em chave)", () => {
    const root = scaffold({
      "addons/bar/__manifest__.py": "# changelog: migrado da base Nexuz em 2020\n{'name':'bar','author':'ACME'}",
    });
    assert.ok(
      !detectFrameworks(root, PLUGIN).map((p) => p.framework).includes("nxz"),
      "substring em comentário não deve disparar — match é por chave",
    );
  });

  it("SEC — symlink de diretório NÃO é seguido (sem traversal/loop)", () => {
    const root = scaffold({ "addons/real/__manifest__.py": "{'name':'r','author':'ACME'}" });
    symlinkSync("/", join(root, "addons/nxz_evil")); // dir-symlink com prefixo nxz_
    const names = detectFrameworks(root, PLUGIN).map((p) => p.framework);
    assert.ok(!names.includes("nxz"), "symlink dir não conta como dirPrefix nem é percorrido");
  });

  it("C1 — origem do standard preservada (nxz vs odoo)", () => {
    const root = scaffold({ "addons/nxz_utils/__manifest__.py": "{'name':'x'}" });
    const c = frameworkContributions(root, PLUGIN);
    const byId = Object.fromEntries(c.standardsWithOrigin.map((s) => [s.id, s.framework]));
    assert.equal(byId["std-odoo-oca-separation"], "nxz", "std NXZ resolve em profiles/nxz");
    assert.equal(byId["std-odoo-naming-conventions"], "odoo", "std genérico resolve em profiles/odoo");
  });
});
