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
import { loadProfiles, detectFrameworks, frameworkContributions } from "../../scripts/lib/detect-framework.mjs";

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
      assert.ok(Array.isArray(p.skills), `${p.framework}: skills must be an array`);
      // `agents` foi REVOGADO na ADR-008 v1.1.0 — criar agente de projeto é do
      // dotcontext. loadProfiles não normaliza mais essa chave.
      assert.equal(p.agents, undefined, `${p.framework}: perfis não contribuem agents`);
      assert.ok(p.skillBindings && typeof p.skillBindings === "object",
        `${p.framework}: skillBindings must be an object`);
    }
  });
});

/**
 * Contribuições de perfil após a revogação de agents (ADR-008 v1.1.0).
 *
 * A fixture cria o marcador de detecção (__manifest__.py): sem ele nenhum
 * perfil fica ativo e as asserções passariam VAZIAS — falso-verde que a
 * revisão da fase R apontou como risco real.
 */
describe("contribuições de perfil (ADR-008 v1.1.0)", () => {
  const dirs = [];
  after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  function projetoOdoo() {
    const proj = mkdtempSync(join(tmpdir(), "detect-odoo-"));
    dirs.push(proj);
    writeFileSync(join(proj, "__manifest__.py"), "{'name': 'fixture'}\n");
    return proj;
  }

  it("frameworkContributions não expõe mais agents", () => {
    const c = frameworkContributions(projetoOdoo(), REPO);
    assert.ok(c.frameworks.includes("odoo"), "fixture precisa casar com o perfil odoo");
    assert.equal(c.agents, undefined, "perfis não contribuem agents");
  });

  it("expõe skillsWithOrigin com o perfil de origem", () => {
    const c = frameworkContributions(projetoOdoo(), REPO);
    const dev = c.skillsWithOrigin.find((s) => s.slug === "odoo-development");
    assert.deepEqual(dev, { slug: "odoo-development", framework: "odoo" });
  });

  it("normaliza skillBindings e mapeia papel → skills", () => {
    const c = frameworkContributions(projetoOdoo(), REPO);
    assert.deepEqual([...c.skillBindings["backend-specialist"]].sort(),
      ["odoo-development", "odoo-l10n-br"]);
    assert.deepEqual(c.skillBindings["frontend-specialist"], ["frontend-specialist-odoo"]);
  });

  it("dispatchKeywords não referencia agente do plugin", () => {
    const c = frameworkContributions(projetoOdoo(), REPO);
    assert.equal(c.dispatchKeywords["odoo-specialist"], undefined,
      "odoo-specialist deixou de existir — o mapa aponta para papéis de projeto");
    assert.ok(c.dispatchKeywords["backend-specialist"].includes("orm"));
  });

  it("backward-compat: perfil sem as chaves novas → estruturas vazias", () => {
    const p = loadProfiles(REPO).find((x) => x.framework === "nxz");
    assert.ok(Array.isArray(p.skills));
    assert.equal(typeof p.skillBindings, "object");
  });
});
