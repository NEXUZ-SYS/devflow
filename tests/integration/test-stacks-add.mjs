/**
 * Gate — `devflow stacks add` seeds the project manifest with an mcpIndexed entry.
 * Run: node --test tests/integration/test-stacks-add.mjs
 *
 * SAFETY: fixture project created in an OS tmpdir. No tracked dir mutated.
 *
 * AC1  add writes frameworks.<lib> = {version, mcpIndexed:true, discoveryHints}
 * AC2  add is idempotent (same lib@version → no error, no duplicate)
 * AC3  add with a non-odoo.com discovery hint still records it verbatim (caller-validated)
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { loadManifest } from "../../scripts/lib/manifest-stacks.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const CLI = join(REPO, "scripts", "devflow-stacks.mjs");

function runAdd(projectRoot, lib, version, hint) {
  return execFileSync("node", [
    CLI, "add",
    `--lib=${lib}`,
    `--version=${version}`,
    `--discovery-hint=${hint}`,
    `--project=${projectRoot}`,
  ], { encoding: "utf-8" });
}

describe("devflow stacks add", () => {
  const trash = [];
  after(() => { for (const d of trash) rmSync(d, { recursive: true, force: true }); });
  const mk = () => { const d = mkdtempSync(join(tmpdir(), "devflow-stacksadd-")); trash.push(d); return d; };

  it("AC1 seeds frameworks.<lib> with mcpIndexed + discoveryHints", () => {
    const proj = mk();
    runAdd(proj, "odoo-18", "18.0", "https://www.odoo.com/documentation/18.0/developer/");
    const m = loadManifest(proj);
    const fw = m.frameworks["odoo-18"];
    assert.ok(fw, "odoo-18 entry missing");
    assert.equal(fw.version, "18.0");
    assert.equal(fw.mcpIndexed, true);
    assert.deepEqual(fw.discoveryHints, ["https://www.odoo.com/documentation/18.0/developer/"]);
  });

  it("AC2 is idempotent for same lib@version", () => {
    const proj = mk();
    runAdd(proj, "odoo-17", "17.0", "https://www.odoo.com/documentation/17.0/developer/");
    runAdd(proj, "odoo-17", "17.0", "https://www.odoo.com/documentation/17.0/developer/");
    const m = loadManifest(proj);
    assert.equal(m.frameworks["odoo-17"].version, "17.0");
  });

  it("AC3 records multiple distinct libs", () => {
    const proj = mk();
    runAdd(proj, "odoo-12", "12.0", "https://www.odoo.com/documentation/12.0/");
    runAdd(proj, "odoo-18", "18.0", "https://www.odoo.com/documentation/18.0/developer/");
    const m = loadManifest(proj);
    assert.ok(m.frameworks["odoo-12"], "odoo-12 missing");
    assert.ok(m.frameworks["odoo-18"], "odoo-18 missing");
  });
});
