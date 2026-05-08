#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  loadManifest,
  addFrameworksToManifest,
} from "../../scripts/lib/manifest-stacks.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
const CLI = new URL("../../scripts/adr-extract-stacks.mjs", import.meta.url).pathname;

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "extract-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeAdr(root, filename, content) {
  const dir = join(root, ".context", "adrs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, content);
  return path;
}

function writeManifest(root, frameworks) {
  const dir = join(root, ".context", "stacks");
  mkdirSync(dir, { recursive: true });
  const fwLines = Object.entries(frameworks).flatMap(([name, fw]) => {
    const lines = [`  ${name}:`];
    for (const [k, v] of Object.entries(fw)) {
      lines.push(`    ${k}: ${typeof v === "string" ? `"${v}"` : v}`);
    }
    return lines;
  });
  writeFileSync(
    join(dir, "manifest.yaml"),
    ["spec: devflow-stack/v0", "frameworks:", ...fwLines].join("\n") + "\n"
  );
}

const SAMPLE_ADR = `---
type: adr
name: adr-typescript-frontend
description: TypeScript 5.9.x como linguagem tipada da camada Frontend
scope: organizational
source: local
stack: TypeScript 5.9.x
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-05-07
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR

## Contexto
Componentes React 19 + Tauri 2 + Zustand. TypeScript 5.9.x necessário.

## Decisão
Adotar TypeScript 5.9.x. Schemas Zod 4.1 derivam tipos.
`;

// ─── addFrameworksToManifest ────────────────────────────────────────────────

test("addFrameworksToManifest: creates manifest if missing", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context", "stacks"), { recursive: true });
    const result = addFrameworksToManifest(root, [
      { lib: "typescript", version: "5.9.0" },
    ]);
    assert.deepEqual(result.added, ["typescript@5.9.0"]);
    assert.deepEqual(result.skipped, []);
    assert.deepEqual(result.drift, []);
    const m = loadManifest(root);
    assert.equal(m.frameworks.typescript.version, "5.9.0");
    assert.equal(m.frameworks.typescript.artisanalRef, "refs/typescript@5.9.0.md");
  } finally {
    cleanup();
  }
});

test("addFrameworksToManifest: idempotent — re-adding same entry is a no-op", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, { typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" } });
    const result = addFrameworksToManifest(root, [
      { lib: "typescript", version: "5.9.0" },
    ]);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.skipped, ["typescript@5.9.0"]);
    assert.deepEqual(result.drift, []);
  } finally {
    cleanup();
  }
});

test("addFrameworksToManifest: drift detected when existing entry has different version (does NOT overwrite)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, { typescript: { version: "5.8.0", artisanalRef: "refs/typescript@5.8.0.md" } });
    const result = addFrameworksToManifest(root, [
      { lib: "typescript", version: "5.9.0" },
    ]);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.skipped, []);
    assert.equal(result.drift.length, 1);
    assert.equal(result.drift[0].lib, "typescript");
    assert.equal(result.drift[0].existingVersion, "5.8.0");
    assert.equal(result.drift[0].newVersion, "5.9.0");
    // Ensure NOT overwritten
    const m = loadManifest(root);
    assert.equal(m.frameworks.typescript.version, "5.8.0");
  } finally {
    cleanup();
  }
});

test("addFrameworksToManifest: merges multiple entries, preserves existing", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, { react: { version: "19.0.0", artisanalRef: "refs/react@19.0.0.md" } });
    const result = addFrameworksToManifest(root, [
      { lib: "typescript", version: "5.9.0" },
      { lib: "zod", version: "4.1.0" },
      { lib: "react", version: "19.0.0" },  // already present → skipped
    ]);
    assert.deepEqual(result.added.sort(), ["typescript@5.9.0", "zod@4.1.0"]);
    assert.deepEqual(result.skipped, ["react@19.0.0"]);
    const m = loadManifest(root);
    assert.equal(Object.keys(m.frameworks).length, 3);
    assert.equal(m.frameworks.react.version, "19.0.0", "existing entry preserved");
    assert.equal(m.frameworks.typescript.version, "5.9.0");
    assert.equal(m.frameworks.zod.version, "4.1.0");
  } finally {
    cleanup();
  }
});

test("addFrameworksToManifest: written manifest passes validateManifest (artisanalRef format valid)", async () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context", "stacks"), { recursive: true });
    addFrameworksToManifest(root, [
      { lib: "typescript", version: "5.9.0" },
      { lib: "@scope/foo", version: "1.0.0" },
    ]);
    const { validateManifest } = await import("../../scripts/lib/manifest-stacks.mjs");
    const m = loadManifest(root);
    const errors = validateManifest(m);
    assert.deepEqual(errors, [], `validation should pass; got: ${errors.join("; ")}`);
  } finally {
    cleanup();
  }
});

// ─── CLI: adr-extract-stacks.mjs ────────────────────────────────────────────

test("CLI extract-stacks: read-only mode lists detected stacks (exit 0)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    const adrPath = writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", SAMPLE_ADR);
    const r = spawnSync("node", [CLI, adrPath, `--project=${root}`], { encoding: "utf-8" });
    assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /typescript@5\.9\.0/, "should detect typescript via tier-2 prose");
    // Manifest unchanged (read-only)
    const m = loadManifest(root);
    assert.deepEqual(m.frameworks, {});
  } finally {
    cleanup();
  }
});

test("CLI extract-stacks: --add-to-manifest mutates and reports added entries", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    const adrPath = writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", SAMPLE_ADR);
    const r = spawnSync("node", [CLI, adrPath, "--add-to-manifest", `--project=${root}`], { encoding: "utf-8" });
    assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /Added/, "should report 'Added' summary");
    const m = loadManifest(root);
    assert.equal(m.frameworks.typescript.version, "5.9.0");
  } finally {
    cleanup();
  }
});

test("CLI extract-stacks: --add-to-manifest is idempotent (re-run reports skipped)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, { typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" } });
    const adrPath = writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", SAMPLE_ADR);
    const r = spawnSync("node", [CLI, adrPath, "--add-to-manifest", `--project=${root}`], { encoding: "utf-8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /already in manifest|skipped|no changes/i, "should report no-op");
  } finally {
    cleanup();
  }
});

test("CLI extract-stacks: numeric prefix slug resolves to ADR file", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", SAMPLE_ADR);
    const r = spawnSync("node", [CLI, "001", `--project=${root}`], { encoding: "utf-8" });
    assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stdout, /typescript@5\.9\.0/);
  } finally {
    cleanup();
  }
});

test("CLI extract-stacks: warns to stderr when fm.stack exists but Tier-0 cannot parse", () => {
  // E2E bug: ADRs with stack="Datadog LLM Observability" / "Husky + lint-staged"
  // were silently dropped. User had no signal that pinning a version would help.
  // Fix: emit explicit warning to stderr explaining the format expected.
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    const adr = SAMPLE_ADR.replace("stack: TypeScript 5.9.x", "stack: GitHub Actions");
    const adrPath = writeAdr(root, "001-adr-github-actions-v1.0.0.md", adr);
    const r = spawnSync("node", [CLI, adrPath, `--project=${root}`], { encoding: "utf-8" });
    assert.equal(r.status, 0, "exit 0 — not detecting is OK, just warn");
    assert.match(r.stderr,
      /stack.*GitHub Actions.*not.*parsed|cannot parse stack|unversioned/i,
      "stderr should explain that the stack field couldn't be parsed and what format is expected");
  } finally { cleanup(); }
});

test("CLI extract-stacks: missing ADR file exits non-zero with clear error", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    mkdirSync(join(root, ".context", "adrs"), { recursive: true });
    const r = spawnSync("node", [CLI, "999", `--project=${root}`], { encoding: "utf-8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not found|no ADR|Error/i);
  } finally {
    cleanup();
  }
});
