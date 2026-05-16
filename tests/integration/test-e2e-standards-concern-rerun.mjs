/**
 * E2E gate — standards concern-first rerun of the 2026-05-11 sandbox.
 * Run: node --test tests/integration/test-e2e-standards-concern-rerun.mjs
 *
 * SAFETY: this test NEVER mutates tests/2026-05-11/. It copies that sandbox's
 * ADRs into an OS tmpdir and regenerates standards there. The real sandbox —
 * including any in-progress work under it — is read-only for this test.
 *
 * Flow: copy ADRs → for each concern matched via the taxonomy's inverseHints,
 * generate one std enriched from all its ADRs → assert acceptance criteria:
 *
 *   AC1  total of concern stds is small (≤ 12, down from 20 lib-centric)
 *   AC2  no std id matches a known library (audit S7 = PASS for all)
 *   AC4  audit gate PASSED for every generated std
 *   AC5  no ADR Decisão prose leaks into any std Princípios
 *   AC6  std-runtime-validation aggregates ≥ 2 ADRs (Zod + Pydantic)
 *
 * AC3 (every ADR referenced) and AC7 (timing) are out of scope per the spec.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadTaxonomySync } from "../../scripts/lib/taxonomy-loader.mjs";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";
import { assertNoDecisionLeak } from "./assert-no-decision-leak.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const SANDBOX = join(REPO, "tests/2026-05-11");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const TAXONOMY = join(REPO, "skills/standards-builder/references/taxonomy-of-concerns.yaml");

let work; // tmpdir project root — assigned in before()

function workStdsDir() {
  return join(work, ".context/standards");
}

function listConcernStds() {
  const dir = workStdsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f =>
    f.startsWith("std-") && f.endsWith(".md") && !f.endsWith(".deprecated.md")
  );
}

// Maps each sandbox ADR to a concern via its stack's lib name → inverseHints.
// Returns Map<concern-id, adr-numeric-prefix[]>.
function buildConcernMap(adrsDir) {
  const tax = loadTaxonomySync({ distributedPath: TAXONOMY, projectRoot: null });
  const map = new Map();
  for (const f of readdirSync(adrsDir).filter(f => /^\d+-.*\.md$/.test(f))) {
    const { data } = parseFrontmatter(readFileSync(join(adrsDir, f), "utf-8"));
    const lib = (data?.stack || "").toLowerCase().split(/\s+/)[0];
    if (!lib) continue;
    const concern = tax.entries.find(e =>
      (e.inverseHints || []).map(h => h.toLowerCase()).includes(lib)
    );
    if (!concern) continue;
    const prefix = f.match(/^(\d+)-/)[1];
    if (!map.has(concern.id)) map.set(concern.id, []);
    map.get(concern.id).push(prefix);
  }
  return map;
}

describe("E2E — standards concern-first rerun (sandbox 2026-05-11, copy)", () => {
  before(() => {
    // Copy the sandbox's ADRs into an isolated tmpdir — never touch the real one.
    work = mkdtempSync(join(tmpdir(), "e2e-std-concern-"));
    mkdirSync(join(work, ".context/standards/machine"), { recursive: true });
    cpSync(join(SANDBOX, ".context/adrs"), join(work, ".context/adrs"), { recursive: true });
    const devflowYaml = join(SANDBOX, ".context/.devflow.yaml");
    writeFileSync(
      join(work, ".context/.devflow.yaml"),
      existsSync(devflowYaml) ? readFileSync(devflowYaml, "utf-8") : "name: e2e\n"
    );

    // Regenerate concern-first — one std per concern, enriched from all its ADRs.
    const concernMap = buildConcernMap(join(work, ".context/adrs"));
    for (const [concern, prefixes] of concernMap) {
      const res = spawnSync("node", [
        CLI, "new",
        `--concern=${concern}`,
        `--enrich-from-adr=${prefixes.join(",")}`,
        `--project=${work}`,
        `--taxonomy=${TAXONOMY}`,
      ], { encoding: "utf-8" });
      if (res.status !== 0) {
        throw new Error(`generation failed for ${concern}: ${res.stderr}`);
      }
    }
  });

  after(() => {
    if (work && existsSync(work)) rmSync(work, { recursive: true, force: true });
  });

  it("AC1: total concern stds is ≤ 12 (consolidation from 20 lib-centric)", () => {
    const stds = listConcernStds();
    assert.ok(stds.length <= 12, `expected ≤12, got ${stds.length}: ${stds.join(", ")}`);
    assert.ok(stds.length >= 1, "at least one concern std must be generated");
  });

  it("AC2: every std id is concern-based — audit S7 PASS for all", () => {
    for (const std of listConcernStds()) {
      const id = std.replace(/^std-/, "").replace(/\.md$/, "");
      const res = spawnSync("node",
        [CLI, "audit", id, `--project=${work}`, `--taxonomy=${TAXONOMY}`],
        { encoding: "utf-8" });
      const s7 = res.stdout.split("\n").find(l => l.includes("S7"));
      assert.ok(s7 && s7.includes("PASS"), `std-${id} S7 not PASS: ${s7}`);
    }
  });

  it("AC4: audit gate PASSED for every generated std", () => {
    for (const std of listConcernStds()) {
      const id = std.replace(/^std-/, "").replace(/\.md$/, "");
      const res = spawnSync("node",
        [CLI, "audit", id, `--project=${work}`, `--taxonomy=${TAXONOMY}`],
        { encoding: "utf-8" });
      assert.match(res.stdout, /Gate: PASSED/, `std-${id} audit not PASSED:\n${res.stdout}`);
    }
  });

  it("AC5: no ADR Decisão prose leaks into any std Princípios", () => {
    const leaks = assertNoDecisionLeak({ projectRoot: work });
    assert.equal(leaks.length, 0,
      `decision leaks: ${JSON.stringify(leaks.slice(0, 3), null, 2)}`);
  });

  it("AC6: std-runtime-validation aggregates ≥ 2 ADRs", () => {
    const path = join(workStdsDir(), "std-runtime-validation.md");
    assert.ok(existsSync(path), "std-runtime-validation.md must exist");
    const { data } = parseFrontmatter(readFileSync(path, "utf-8"));
    const refs = Array.isArray(data.relatedAdrs) ? data.relatedAdrs : [];
    assert.ok(refs.length >= 2,
      `std-runtime-validation has ${refs.length} ADR(s), expected ≥2: ${refs.join(", ")}`);
  });
});
