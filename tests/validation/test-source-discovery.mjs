#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  extractEvidenciasUrls,
} from "../../scripts/lib/adr-chain.mjs";
import {
  loadManifest,
  addFrameworksToManifest,
} from "../../scripts/lib/manifest-stacks.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
const STACKS_CLI = new URL("../../scripts/devflow-stacks.mjs", import.meta.url).pathname;
const EXTRACT_CLI = new URL("../../scripts/adr-extract-stacks.mjs", import.meta.url).pathname;

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "src-disc-"));
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
      if (Array.isArray(v)) {
        lines.push(`    ${k}: [${v.map(x => `"${x}"`).join(", ")}]`);
      } else {
        lines.push(`    ${k}: ${typeof v === "string" ? `"${v}"` : v}`);
      }
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
description: TypeScript 5.9.x como linguagem tipada
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

## Decisão
TypeScript 5.9.x.

## Evidências / Anexos

**Fontes oficiais:** [TypeScript Handbook](https://www.typescriptlang.org/docs) · [TC39 Proposals](https://tc39.es/proposals/) · [TypeScript GitHub](https://github.com/microsoft/TypeScript)

\`\`\`typescript
const x: number = 1;
\`\`\`
`;

// ─── extractEvidenciasUrls ──────────────────────────────────────────────────

test("extractEvidenciasUrls: extracts URLs from markdown links in ## Evidências section", () => {
  const urls = extractEvidenciasUrls(SAMPLE_ADR);
  assert.deepEqual(urls, [
    "https://www.typescriptlang.org/docs",
    "https://tc39.es/proposals/",
    "https://github.com/microsoft/TypeScript",
  ]);
});

test("extractEvidenciasUrls: ignores URLs OUTSIDE Evidências section", () => {
  const adr = `---
name: x
---
# ADR

## Decisão
See https://random.example.com (not extracted)

## Evidências / Anexos
**Fontes:** [Official](https://official.example.com)
`;
  const urls = extractEvidenciasUrls(adr);
  assert.deepEqual(urls, ["https://official.example.com"]);
});

test("extractEvidenciasUrls: returns empty array when no Evidências section", () => {
  const urls = extractEvidenciasUrls("# ADR\n\n## Decisão\nNothing.\n");
  assert.deepEqual(urls, []);
});

test("extractEvidenciasUrls: rejects non-https URLs (security: only official trustworthy sources)", () => {
  const adr = `# ADR
## Evidências
- [Bad](http://insecure.example.com)
- [Good](https://secure.example.com)
- [JS](javascript:alert(1))
`;
  const urls = extractEvidenciasUrls(adr);
  assert.deepEqual(urls, ["https://secure.example.com"]);
});

test("extractEvidenciasUrls: dedups identical URLs", () => {
  const adr = `# ADR
## Evidências
- [A](https://example.com)
- [B](https://example.com)
- [C](https://other.com)
`;
  const urls = extractEvidenciasUrls(adr);
  assert.deepEqual(urls, ["https://example.com", "https://other.com"]);
});

// ─── addFrameworksToManifest with discoveryHints ────────────────────────────

test("addFrameworksToManifest: stores discoveryHints when provided in entry", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context", "stacks"), { recursive: true });
    addFrameworksToManifest(root, [
      {
        lib: "typescript",
        version: "5.9.0",
        discoveryHints: [
          "https://www.typescriptlang.org/docs",
          "https://github.com/microsoft/TypeScript",
        ],
      },
    ]);
    const m = loadManifest(root);
    assert.deepEqual(m.frameworks.typescript.discoveryHints, [
      "https://www.typescriptlang.org/docs",
      "https://github.com/microsoft/TypeScript",
    ]);
  } finally { cleanup(); }
});

test("addFrameworksToManifest: omits discoveryHints field when entry has none", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context", "stacks"), { recursive: true });
    addFrameworksToManifest(root, [{ lib: "typescript", version: "5.9.0" }]);
    const m = loadManifest(root);
    assert.equal(m.frameworks.typescript.discoveryHints, undefined);
  } finally { cleanup(); }
});

// ─── adr-extract-stacks CLI: passes Evidências URLs as discoveryHints ───────

test("CLI extract-stacks --add-to-manifest: hydrates discoveryHints from ADR Evidências", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    const adrPath = writeAdr(root, "001-adr-typescript-frontend-v1.0.0.md", SAMPLE_ADR);
    const r = spawnSync("node", [EXTRACT_CLI, adrPath, "--add-to-manifest", `--project=${root}`], { encoding: "utf-8" });
    assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
    const m = loadManifest(root);
    assert.ok(Array.isArray(m.frameworks.typescript.discoveryHints),
      "discoveryHints should be an array");
    assert.ok(m.frameworks.typescript.discoveryHints.includes("https://www.typescriptlang.org/docs"),
      "first Evidências URL should be in hints");
  } finally { cleanup(); }
});

// ─── devflow stacks discover-source ─────────────────────────────────────────

test("CLI discover-source: lists manifest discoveryHints + heuristic candidates", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      typescript: {
        version: "5.9.0",
        artisanalRef: "refs/typescript@5.9.0.md",
        discoveryHints: ["https://www.typescriptlang.org/docs", "https://github.com/microsoft/TypeScript"],
      },
    });
    const r = spawnSync("node", [STACKS_CLI, "discover-source", "typescript", `--project=${root}`], { encoding: "utf-8" });
    assert.equal(r.status, 0, `exit ${r.status}; stderr: ${r.stderr}`);
    // Curated hints from manifest
    assert.match(r.stdout, /typescriptlang\.org\/docs/);
    assert.match(r.stdout, /github\.com\/microsoft\/TypeScript/);
    // Heuristic npm registry suggestion
    assert.match(r.stdout, /npmjs\.com\/package\/typescript/);
  } finally { cleanup(); }
});

test("CLI discover-source: works for libs without discoveryHints (heuristics only)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      "is-odd": {
        version: "4.0.0",
        artisanalRef: "refs/is-odd@4.0.0.md",
      },
    });
    const r = spawnSync("node", [STACKS_CLI, "discover-source", "is-odd", `--project=${root}`], { encoding: "utf-8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /npmjs\.com\/package\/is-odd/);
  } finally { cleanup(); }
});

test("CLI discover-source: lib not in manifest exits non-zero", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    const r = spawnSync("node", [STACKS_CLI, "discover-source", "ghost", `--project=${root}`], { encoding: "utf-8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not.*manifest|not declared|not found/i);
  } finally { cleanup(); }
});
