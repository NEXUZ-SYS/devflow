/**
 * E2E gate — default standards library against a REAL DevFlow v2 project.
 * Run: node --test tests/integration/test-e2e-standards-default-reversa.mjs
 *
 * Fixture: the real project `reversa-com-attio` (a DevFlow v2 project: 4 DDC
 * layers, pt-BR, layout-version=2, with an EMPTY engineering/standards/). It is
 * the ideal real-world case for the just-shipped default-standards feature: a
 * project that has not yet ejected any standard, so all 20 plugin-bundled
 * defaults must surface with origin="default".
 *
 * SAFETY: this test NEVER mutates the reference project. It copies its
 * `.context/` into an OS tmpdir and operates only on that copy. The external
 * project — including any in-progress work under it — is read-only here.
 *
 * Portability: the fixture lives outside this repo. If it is absent (CI, a
 * fresh clone), the offline suite is skipped, not failed. Override its location
 * with REVERSA_PROJECT=<path>.
 *
 * Two tiers (per the agreed scope):
 *   OFFLINE GATE (deterministic, no network) — plugin-bundled defaults only:
 *     AC1  loadStandardsMerged injects all 20 defaults (origin="default")
 *     AC2  Stage-1 index CLI tags them "[default] std-…" end-to-end
 *     AC3  eject materializes a std into engineering/standards/ → flips to project
 *     AC4  project std overrides the default by id (project wins, no dup)
 *     AC5  standards.local.yaml `disable:` removes a default
 *   LIVE OPT-IN (network; skipped unless RUN_LIVE=1) — real standalone repo:
 *     AC6  update-default-standards.sh restores a corrupted std from the
 *          live NEXUZ-SYS/devflow-standards repo (no test seam → real PROD_BASE)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadStandardsMerged } from "../../scripts/lib/standards-loader.mjs";
import { contextPaths } from "../../scripts/lib/context-paths.mjs";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const STD_CLI = join(REPO, "scripts/devflow-standards.mjs");
const INDEX_CLI = join(REPO, "scripts/lib/context-index-cli.mjs");
const UPDATE_SH = join(REPO, "scripts/update-default-standards.sh");
const ASSETS = join(REPO, "assets/standards");

const REVERSA = process.env.REVERSA_PROJECT
  ? resolve(process.env.REVERSA_PROJECT)
  : "/home/walterfrey/Documentos/code/reversa-com-attio";

// The 21 plugin-bundled default ids (source of truth: assets/standards/).
const DEFAULT_IDS = [
  "std-accessibility", "std-api-conventions", "std-caching", "std-code-review",
  "std-commit-hygiene", "std-data-modeling", "std-design-antipatterns", "std-documentation",
  "std-domain-events", "std-error-handling", "std-grounding", "std-internationalization",
  "std-layer-boundaries", "std-migration", "std-naming-conventions", "std-observability",
  "std-performance", "std-pre-commit-hygiene", "std-runtime-validation", "std-schemas",
  "std-secret-conventions", "std-security", "std-state-management", "std-test-discipline",
  "std-typescript-strict", "std-visual-quality",
];

const fixtureMissing =
  !existsSync(join(REVERSA, ".context")) &&
  "reference project not found — set REVERSA_PROJECT=<path> to run (skipped)";

describe("E2E — default standards over a real DevFlow v2 project (reversa, copy)", { skip: fixtureMissing }, () => {
  let work; // tmpdir project root — a copy of reversa's .context

  before(() => {
    work = mkdtempSync(join(tmpdir(), "e2e-std-default-reversa-"));
    // Copy ONLY the reference project's .context/ — never touch the original.
    cpSync(join(REVERSA, ".context"), join(work, ".context"), { recursive: true });
  });

  after(() => {
    if (work && existsSync(work)) rmSync(work, { recursive: true, force: true });
  });

  // ── AC1 — defaults injected with origin="default" ─────────────────────────
  it("AC1: all defaults load with origin='default' (project has none of its own)", () => {
    const merged = loadStandardsMerged(work, REPO);
    const ids = merged.map(s => s.id).sort();
    assert.deepEqual(ids, [...DEFAULT_IDS].sort(),
      `expected exactly the ${DEFAULT_IDS.length} defaults, got ${ids.length}: ${ids.join(", ")}`);
    for (const s of merged) {
      assert.equal(s.origin, "default", `${s.id} should be origin=default (project has no standards yet)`);
    }
  });

  // ── AC2 — Stage-1 index CLI tags defaults [default] end-to-end ─────────────
  it("AC2: context-index CLI tags the defaults '[default] std-…' (text format)", () => {
    const res = spawnSync("node",
      [INDEX_CLI, `--project=${work}`, `--plugin=${REPO}`, "--format=text"],
      { encoding: "utf-8" });
    assert.equal(res.status, 0, `index CLI failed: ${res.stderr}`);
    assert.match(res.stdout, /\[default\] std-security\b/, `expected '[default] std-security' in:\n${res.stdout}`);
    assert.match(res.stdout, /\[default\] std-observability\b/, "expected '[default] std-observability'");
  });

  // ── AC3 — eject materializes a std and flips it to project ─────────────────
  it("AC3: eject materializes std-security in engineering/standards/ → origin flips to project", () => {
    const res = spawnSync("node", [STD_CLI, "eject", "security", `--project=${work}`],
      { encoding: "utf-8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO } });
    assert.equal(res.status, 0, `eject failed: ${res.stderr}`);

    const dest = join(contextPaths(work).standards, "std-security.md");
    assert.ok(existsSync(dest), `ejected file must exist at ${dest}`);

    const merged = loadStandardsMerged(work, REPO);
    assert.equal(merged.length, DEFAULT_IDS.length,
      `eject must not duplicate: still ${DEFAULT_IDS.length} unique ids`);
    const sec = merged.find(s => s.id === "std-security");
    assert.equal(sec.origin, "project", "ejected std-security must now be origin=project");
  });

  // ── AC4 — project std overrides default by id (project wins) ───────────────
  it("AC4: an edited project std overrides the bundled default by id", () => {
    const dest = join(contextPaths(work).standards, "std-security.md");
    const raw = readFileSync(dest, "utf-8");
    const edited = raw.replace(/^description:.*$/m, "description: EDITADO-PELO-PROJETO");
    assert.notEqual(edited, raw, "fixture sanity: description line must be replaceable");
    writeFileSync(dest, edited);

    const merged = loadStandardsMerged(work, REPO);
    const sec = merged.find(s => s.id === "std-security");
    assert.equal(sec.origin, "project");
    assert.equal(sec.description, "EDITADO-PELO-PROJETO",
      "merged std-security must reflect the PROJECT description, not the default");
  });

  // ── AC5 — standards.local.yaml disable removes a default ───────────────────
  it("AC5: standards.local.yaml `disable:` removes a default from the merged set", () => {
    const before = loadStandardsMerged(work, REPO).length;
    const localYaml = contextPaths(work).standardsLocalYaml;
    mkdirSync(join(work, ".context"), { recursive: true });
    writeFileSync(localYaml, "disable: [std-observability]\n");

    const after = loadStandardsMerged(work, REPO);
    assert.equal(after.length, before - 1, "disabling one std must drop the count by exactly 1");
    assert.ok(!after.some(s => s.id === "std-observability"), "std-observability must be gone after disable");
  });
});

// ── AC6 — LIVE opt-in: restore from the real standalone repo ─────────────────
describe("E2E — live default-standards fetch (real NEXUZ-SYS/devflow-standards repo)", {
  skip: process.env.RUN_LIVE === "1" ? false : "set RUN_LIVE=1 to hit the live repo (network)",
}, () => {
  let live; // tmpdir mirroring assets/standards/

  before(() => {
    live = mkdtempSync(join(tmpdir(), "e2e-std-live-"));
    cpSync(ASSETS, join(live, "standards"), { recursive: true });
  });

  after(() => {
    if (live && existsSync(live)) rmSync(live, { recursive: true, force: true });
  });

  it("AC6: update-default-standards.sh restores a corrupted std from the live repo", () => {
    const stdDir = join(live, "standards");
    const target = join(stdDir, "std-security.md");
    writeFileSync(target, "CORROMPIDO-PELO-TESTE\n"); // wipe real content

    // NO DEVFLOW_STANDARDS_BASE_TEST → script uses the hardcoded PROD_BASE.
    const res = spawnSync("bash", [UPDATE_SH, "--standards-dir", stdDir],
      { encoding: "utf-8" });
    assert.equal(res.status, 0, `update script failed: ${res.stderr}`);

    const restored = readFileSync(target, "utf-8");
    assert.ok(!restored.includes("CORROMPIDO-PELO-TESTE"),
      "corrupted content must be overwritten by the live fetch");
    const { data } = parseFrontmatter(restored);
    assert.equal(data.id, "std-security", "restored file must be the real std-security from the live repo");
  });
});
