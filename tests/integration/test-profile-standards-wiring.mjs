/**
 * Wiring gate — framework profiles surface `standards` and `stacks`.
 * Run: node --test tests/integration/test-profile-standards-wiring.mjs
 *
 * SAFETY: every fixture (plugin root + project) is created in an OS tmpdir
 * (mkdtempSync). No tracked directory is ever mutated.
 *
 * AC1  loadProfiles normalizes `standards` and `stacks` to arrays
 * AC2  a profile WITHOUT those keys yields empty arrays (backward compat)
 * AC3  frameworkContributions aggregates `standards` (ids) for a matched project
 * AC4  frameworkContributions aggregates `stacks` (lib/version/discoveryHints)
 * AC5  the real profiles/odoo.yaml stacks entries are well-formed
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadProfiles, frameworkContributions } from "../../scripts/lib/detect-framework.mjs";
import { parseYaml, parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";
import { findApplicableStandards } from "../../scripts/lib/standards-loader.mjs";

const REPO = resolve(import.meta.dirname, "../..");

/** Build a temp plugin root holding a single fixture profile. */
function mkPluginRoot(profileYaml) {
  const root = mkdtempSync(join(tmpdir(), "devflow-plugin-"));
  mkdirSync(join(root, "profiles"), { recursive: true });
  writeFileSync(join(root, "profiles", "testfw.yaml"), profileYaml);
  return root;
}

/** Build a temp project carrying a detection marker file. */
function mkProject(markerName) {
  const dir = mkdtempSync(join(tmpdir(), "devflow-proj-"));
  writeFileSync(join(dir, markerName), "marker\n");
  return dir;
}

describe("profile standards/stacks wiring", () => {
  const trash = [];
  after(() => { for (const d of trash) rmSync(d, { recursive: true, force: true }); });

  const PROFILE_WITH = [
    "framework: testfw",
    "displayName: TestFW",
    "detect:",
    "  files: [TESTFW_MARKER]",
    "agents: []",
    "skills: []",
    "standards: [std-foo-a, std-foo-b]",
    "stacks:",
    "  - lib: foolib",
    "    version: '1.0'",
    "    discoveryHints: ['https://example.test/docs/1.0/']",
    "    applyTo: ['**/*.py']",
    "",
  ].join("\n");

  const PROFILE_WITHOUT = [
    "framework: barefw",
    "detect:",
    "  files: [BAREFW_MARKER]",
    "agents: []",
    "skills: []",
    "",
  ].join("\n");

  it("AC1 loadProfiles normalizes standards and stacks to arrays", () => {
    const root = mkPluginRoot(PROFILE_WITH); trash.push(root);
    const [p] = loadProfiles(root);
    assert.ok(Array.isArray(p.standards), "standards must be an array");
    assert.ok(Array.isArray(p.stacks), "stacks must be an array");
    assert.deepEqual(p.standards, ["std-foo-a", "std-foo-b"]);
    assert.equal(p.stacks[0].lib, "foolib");
    assert.equal(p.stacks[0].version, "1.0");
    assert.deepEqual(p.stacks[0].discoveryHints, ["https://example.test/docs/1.0/"]);
  });

  it("AC2 a profile without standards/stacks yields empty arrays", () => {
    const root = mkPluginRoot(PROFILE_WITHOUT); trash.push(root);
    const [p] = loadProfiles(root);
    assert.deepEqual(p.standards, []);
    assert.deepEqual(p.stacks, []);
  });

  it("AC3 frameworkContributions aggregates standards for a matched project", () => {
    const root = mkPluginRoot(PROFILE_WITH); trash.push(root);
    const proj = mkProject("TESTFW_MARKER"); trash.push(proj);
    const contrib = frameworkContributions(proj, root);
    assert.deepEqual(contrib.standards, ["std-foo-a", "std-foo-b"]);
  });

  it("AC4 frameworkContributions aggregates stacks with discoveryHints", () => {
    const root = mkPluginRoot(PROFILE_WITH); trash.push(root);
    const proj = mkProject("TESTFW_MARKER"); trash.push(proj);
    const contrib = frameworkContributions(proj, root);
    assert.equal(contrib.stacks.length, 1);
    assert.equal(contrib.stacks[0].lib, "foolib");
    assert.deepEqual(contrib.stacks[0].discoveryHints, ["https://example.test/docs/1.0/"]);
  });

  it("AC5 real profiles/odoo.yaml stacks are well-formed (lib/version/discoveryHints)", () => {
    const odooYaml = join(REPO, "profiles", "odoo.yaml");
    assert.ok(existsSync(odooYaml), "profiles/odoo.yaml missing");
    const data = parseYaml(readFileSync(odooYaml, "utf-8"));
    assert.ok(Array.isArray(data.stacks) && data.stacks.length >= 3,
      "odoo.yaml must declare at least 3 stack versions (12/17/18)");
    for (const s of data.stacks) {
      assert.ok(s.lib, "stack entry missing lib");
      assert.ok(s.version, `stack ${s.lib} missing version`);
      assert.ok(Array.isArray(s.discoveryHints) && s.discoveryHints.length >= 1,
        `stack ${s.lib} missing discoveryHints`);
      for (const url of s.discoveryHints) {
        assert.ok(/^https:\/\/www\.odoo\.com\/documentation\//.test(url),
          `stack ${s.lib} discoveryHint not an official odoo.com docs URL: ${url}`);
      }
    }
  });
});

// ─── Escopo de versão (fase E, Task 9) ──────────────────────────────────────

const ODOO_DIR = "assets/standards/profiles/odoo";
const ODOO_MACHINE = join(ODOO_DIR, "machine");

// Le os standards REAIS do perfil e os molda como o loader faz. Testa dado de
// producao contra o predicado de producao — nao um fixture paralelo que poderia
// divergir em silencio.
function profileStandards() {
  return readdirSync(ODOO_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const fm = parseFrontmatter(readFileSync(join(ODOO_DIR, f), "utf-8")).data || {};
      return {
        id: fm.id,
        applyTo: Array.isArray(fm.applyTo) ? fm.applyTo : [],
        appliesFrom: fm.appliesFrom != null ? String(fm.appliesFrom) : null,
        appliesUntil: fm.appliesUntil != null ? String(fm.appliesUntil) : null,
        framework: "odoo",
      };
    })
    .filter((s) => s.id);
}

describe("version scope: faixa substitui os gates internos", () => {
  it("nenhum linter do perfil odoo resolve versão por conta própria", () => {
    for (const f of readdirSync(ODOO_MACHINE).filter((x) => x.endsWith(".js"))) {
      const src = readFileSync(join(ODOO_MACHINE, f), "utf-8");
      assert.doesNotMatch(src, /function\s+odooTargetSeries/, `${f} ainda define resolução de série`);
      assert.doesNotMatch(src, /const\s+MIN_SERIES/, `${f} ainda tem gate de série próprio`);
      assert.doesNotMatch(src, /odooTargetSeries\s*\(/, `${f} ainda chama resolução de série`);
    }
  });

  it("as faixas declaradas batem com os pisos que os MIN_SERIES codificavam", () => {
    const byId = Object.fromEntries(profileStandards().map((s) => [s.id, s]));
    assert.equal(byId["std-odoo-js-modules"].appliesFrom, "16");
    assert.equal(byId["std-odoo-owl-patterns"].appliesFrom, "16");
    assert.equal(byId["std-odoo-qweb-escaping"].appliesFrom, "15");
    assert.equal(byId["std-odoo-api-removed-17"].appliesFrom, "17");
    assert.equal(byId["std-odoo-api-removed-18"].appliesFrom, "18");
  });

  it("REGRESSÃO nexuz/odoo_17: nenhuma regra exclusiva do 18 se aplica a um projeto 17", () => {
    const ids = findApplicableStandards(
      "addons/nxz_cadastro/views/cadastro_views.xml",
      profileStandards(),
      { versions: new Map([["odoo", "17"]]) },
    ).map((s) => s.id);
    assert.ok(!ids.includes("std-odoo-api-removed-18"),
      "a regra de <tree>/attrs é do 18 — 47 falso-positivos vinham daqui");
  });

  it("REGRESSÃO Odoo 12: nem as regras de 17 nem as de 18 se aplicam", () => {
    const ids = findApplicableStandards(
      "addons/legacy_cadastro/models/cadastro.py",
      profileStandards(),
      { versions: new Map([["odoo", "12"]]) },
    ).map((s) => s.id);
    assert.ok(!ids.includes("std-odoo-api-removed-17"));
    assert.ok(!ids.includes("std-odoo-api-removed-18"));
  });

  it("no Odoo 18 a regra do 18 VOLTA a se aplicar — a faixa não é um mute permanente", () => {
    const ids = findApplicableStandards(
      "addons/nxz_cadastro/views/cadastro_views.xml",
      profileStandards(),
      { versions: new Map([["odoo", "18"]]) },
    ).map((s) => s.id);
    assert.ok(ids.includes("std-odoo-api-removed-18"));
  });
});
