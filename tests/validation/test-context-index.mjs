#!/usr/bin/env node
// Test suite: scripts/lib/context-index.mjs (Camada 1 — session-start index).
// TDD-first: testes estruturais (deepEqual em JSON), não content checks.
// RED: failing assertions to drive implementation.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildContextIndex } from "../../scripts/lib/context-index.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
const CLI = new URL("../../scripts/lib/context-index-cli.mjs", import.meta.url).pathname;

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "ctxidx-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeManifest(root, frameworks) {
  const dir = join(root, ".context", "stacks");
  mkdirSync(dir, { recursive: true });
  const lines = ["spec: devflow-stack/v0", "frameworks:"];
  for (const [name, fw] of Object.entries(frameworks)) {
    lines.push(`  ${name}:`);
    for (const [k, v] of Object.entries(fw)) {
      lines.push(`    ${k}: ${typeof v === "string" ? `"${v}"` : v}`);
    }
  }
  writeFileSync(join(dir, "manifest.yaml"), lines.join("\n") + "\n");
}

function writeStandard(root, slug, fm, body = "# Standard\n## Princípios\n- foo\n") {
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  const fmLines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      fmLines.push(`${k}: [${v.map(x => `"${x}"`).join(", ")}]`);
    } else if (typeof v === "object" && v !== null) {
      fmLines.push(`${k}:`);
      for (const [kk, vv] of Object.entries(v)) fmLines.push(`  ${kk}: ${vv}`);
    } else {
      fmLines.push(`${k}: ${typeof v === "string" ? `"${v}"` : v}`);
    }
  }
  fmLines.push("---", "", body);
  writeFileSync(join(dir, `${slug}.md`), fmLines.join("\n"));
}

function writeRefFile(root, refRel) {
  const refDir = join(root, ".context", "stacks", "refs");
  mkdirSync(refDir, { recursive: true });
  const refPath = join(root, ".context", "stacks", refRel);
  writeFileSync(refPath, "# Stack ref\nline1\nline2\nline3\n");
}

// ─── buildContextIndex (lib pura) ──────────────────────────────────────────

test("buildContextIndex: returns empty structure when .context missing", () => {
  const { root, cleanup } = fixture();
  try {
    const idx = buildContextIndex(root);
    assert.deepEqual(idx.standards, []);
    assert.deepEqual(idx.refs, []);
    assert.equal(idx.totals.standards, 0);
    assert.equal(idx.totals.refs, 0);
    assert.equal(idx.totals.refsScraped, 0);
  } finally { cleanup(); }
});

test("buildContextIndex: lists 1 standard with applyTo", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    writeStandard(root, "std-typescript", {
      id: "std-typescript",
      description: "TS conventions",
      version: "1.0.0",
      applyTo: ["**/*.ts", "**/*.tsx"],
      enforcement: { linter: "standards/machine/std-typescript.js" },
    });
    const idx = buildContextIndex(root);
    assert.equal(idx.standards.length, 1);
    assert.equal(idx.standards[0].id, "std-typescript");
    assert.deepEqual(idx.standards[0].applyTo, ["**/*.ts", "**/*.tsx"]);
    assert.equal(idx.standards[0].hasLinter, true);
  } finally { cleanup(); }
});

test("buildContextIndex: separates scraped vs pending refs", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" },
      zod: { version: "4.1.0", artisanalRef: "refs/zod@4.1.0.md" },
    });
    // Only typescript has actual ref file on disk
    writeRefFile(root, "refs/typescript@5.9.0.md");
    const idx = buildContextIndex(root);
    assert.equal(idx.refs.length, 2);
    const ts = idx.refs.find(r => r.lib === "typescript");
    const zod = idx.refs.find(r => r.lib === "zod");
    assert.equal(ts.status, "scraped");
    assert.equal(zod.status, "pending-scrape");
    assert.equal(idx.totals.refs, 2);
    assert.equal(idx.totals.refsScraped, 1);
  } finally { cleanup(); }
});

test("buildContextIndex: scraped ref reports line count for budget awareness", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" },
    });
    writeRefFile(root, "refs/typescript@5.9.0.md");
    const idx = buildContextIndex(root);
    const ts = idx.refs[0];
    assert.equal(typeof ts.lines, "number", "lines must be numeric for scraped ref");
    assert.ok(ts.lines > 0, `expected lines>0, got ${ts.lines}`);
  } finally { cleanup(); }
});

test("buildContextIndex: standard without enforcement.linter reports hasLinter=false", () => {
  const { root, cleanup } = fixture();
  try {
    writeStandard(root, "std-conventions", {
      id: "std-conventions",
      description: "no linter",
      version: "1.0.0",
      applyTo: ["**/*.md"],
      weakStandardWarning: true,
    });
    const idx = buildContextIndex(root);
    assert.equal(idx.standards[0].hasLinter, false);
  } finally { cleanup(); }
});

test("buildContextIndex: skipDocs framework excluded from refs list", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" },
      githubactions: { version: "0.0.0", skipDocs: true },
    });
    writeRefFile(root, "refs/typescript@5.9.0.md");
    const idx = buildContextIndex(root);
    assert.equal(idx.refs.length, 1, "skipDocs entries should not appear in refs");
    assert.equal(idx.refs[0].lib, "typescript");
  } finally { cleanup(); }
});

// ─── CLI: context-index-cli.mjs ────────────────────────────────────────────

test("CLI context-index: reads project from --project arg, outputs valid JSON", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" },
    });
    writeStandard(root, "std-typescript", {
      id: "std-typescript",
      description: "TS",
      version: "1.0.0",
      applyTo: ["**/*.ts"],
    });
    writeRefFile(root, "refs/typescript@5.9.0.md");
    const r = spawnSync("node", [CLI, `--project=${root}`], { encoding: "utf-8" });
    assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.standards.length, 1);
    assert.equal(out.refs.length, 1);
    assert.equal(out.totals.refsScraped, 1);
  } finally { cleanup(); }
});

test("CLI context-index: missing project arg defaults to cwd, still produces JSON", () => {
  const { root, cleanup } = fixture();
  try {
    const r = spawnSync("node", [CLI], { encoding: "utf-8", cwd: root });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.standards, []);
    assert.deepEqual(out.refs, []);
  } finally { cleanup(); }
});

test("CLI context-index: --format=text produces human-readable output for hook injection", () => {
  // The hook wants a textual block — not raw JSON — so the LLM sees it as
  // narrative context. Schema: stable headers we can grep in tests.
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" },
    });
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0", applyTo: ["**/*.ts"],
    });
    writeRefFile(root, "refs/typescript@5.9.0.md");
    const r = spawnSync("node", [CLI, `--project=${root}`, "--format=text"], { encoding: "utf-8" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // Structural anchors the hook will rely on:
    assert.match(r.stdout, /Standards declarados/, "must have standards header");
    assert.match(r.stdout, /Stack refs/, "must have refs header");
    assert.match(r.stdout, /std-typescript/);
    assert.match(r.stdout, /typescript@5\.9\.0/);
  } finally { cleanup(); }
});
