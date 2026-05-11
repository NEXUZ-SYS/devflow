#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { auditStandard } from "../../scripts/lib/standard-audit.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "s6-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeStd(root, id, body) {
  const dir = join(root, ".context", "standards");
  const machineDir = join(dir, "machine");
  mkdirSync(machineDir, { recursive: true });
  const fm = `---
id: std-${id}
description: Test std
version: 1.0.0
applyTo: ["**/*.ts"]
relatedAdrs: []
enforcement:
  linter: standards/machine/std-${id}.js
weakStandardWarning: true
---

# Standard: ${id}

${body || "## Princípios\n\nEmpty test body."}
`;
  const stdPath = join(dir, `std-${id}.md`);
  writeFileSync(stdPath, fm);
  writeFileSync(join(machineDir, `std-${id}.js`), "process.exit(0);\n");
  return stdPath;
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

function writeRef(root, lib, version) {
  const dir = join(root, ".context", "stacks", "refs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${lib}@${version}.md`), "# scrape placeholder\n");
}

function writeDevflowYaml(root, content) {
  const dir = join(root, ".context");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".devflow.yaml"), content);
}

// ─── S6: stack-refs completeness check ──────────────────────────────────────

test("S6: PASS when std mentions no versioned libs", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    writeStd(root, "naming", "## Princípios\n\nNo lib mentions, just rules.\n");
    const r = auditStandard(join(root, ".context/standards/std-naming.md"), root);
    const s6 = r.checks.find(c => c.id === "S6");
    assert.ok(s6, "S6 check must exist");
    assert.equal(s6.status, "PASS");
    assert.equal(r.gate, "PASSED");
  } finally { cleanup(); }
});

test("S6: PASS when all mentioned libs have refs", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" },
    });
    writeRef(root, "typescript", "5.9.0");
    writeStd(root, "typescript", "## Princípios\n\nTypeScript 5.9.x é a linguagem.\n");
    const r = auditStandard(join(root, ".context/standards/std-typescript.md"), root);
    const s6 = r.checks.find(c => c.id === "S6");
    assert.equal(s6.status, "PASS");
    assert.equal(r.gate, "PASSED");
  } finally { cleanup(); }
});

test("S6: FAIL by default when std mentions a lib without scraped ref", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" },
    });
    // NO writeRef — manifest declares it but file is missing
    writeStd(root, "typescript", "## Princípios\n\nTypeScript 5.9.x é a linguagem única.\n");
    const r = auditStandard(join(root, ".context/standards/std-typescript.md"), root);
    const s6 = r.checks.find(c => c.id === "S6");
    assert.equal(s6.status, "FAIL");
    assert.match(s6.diagnosis, /typescript@5\.9\.0/);
    assert.match(s6.diagnosis, /missing|orphan/i);
    assert.equal(r.gate, "BLOCKED");
  } finally { cleanup(); }
});

test("S6: WARN when .devflow.yaml sets standards.s6Level=warn", () => {
  const { root, cleanup } = fixture();
  try {
    writeDevflowYaml(root, "version: 1\nstandards:\n  s6Level: warn\n");
    writeManifest(root, {
      typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" },
    });
    writeStd(root, "typescript", "## Princípios\n\nTypeScript 5.9.x é a linguagem única.\n");
    const r = auditStandard(join(root, ".context/standards/std-typescript.md"), root);
    const s6 = r.checks.find(c => c.id === "S6");
    assert.equal(s6.status, "WARN");
    assert.equal(r.gate, "PASSED", "WARN does not block gate");
  } finally { cleanup(); }
});

test("S6: skips libs declared with skipDocs:true (won't scrape, OK)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      postgres: { version: "17.0.0", skipDocs: true },
    });
    writeStd(root, "postgres", "## Princípios\n\nPostgres 17.0 como banco principal.\n");
    const r = auditStandard(join(root, ".context/standards/std-postgres.md"), root);
    const s6 = r.checks.find(c => c.id === "S6");
    assert.equal(s6.status, "PASS",
      "skipDocs:true means lib intentionally has no ref — should NOT fail S6");
  } finally { cleanup(); }
});

test("S6: ignores libs not in manifest (out of scope for std-audit)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});  // empty
    writeStd(root, "test", "## Princípios\n\nNext.js 16.0 mencionado mas não no manifest.\n");
    const r = auditStandard(join(root, ".context/standards/std-test.md"), root);
    const s6 = r.checks.find(c => c.id === "S6");
    // Without manifest declaration, tier-2 prose can't bind — no detection,
    // no failure. S6 only checks libs that ARE in manifest with non-skipDocs.
    assert.equal(s6.status, "PASS");
  } finally { cleanup(); }
});

test("S6: detects lib via std body even when std applyTo is unrelated", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      tauri: { version: "2.0.0", artisanalRef: "refs/tauri@2.0.0.md" },
    });
    // No ref written
    writeStd(root, "frontend-arch",
      "## Princípios\n\nArquitetura Frontend usa Tauri 2.0 para desktop shell.\n");
    const r = auditStandard(join(root, ".context/standards/std-frontend-arch.md"), root);
    const s6 = r.checks.find(c => c.id === "S6");
    assert.equal(s6.status, "FAIL");
    assert.match(s6.diagnosis, /tauri@2\.0\.0/);
  } finally { cleanup(); }
});

test("S6: counts as 6th check in summary", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    writeStd(root, "minimal");
    const r = auditStandard(join(root, ".context/standards/std-minimal.md"), root);
    assert.equal(r.checks.length, 6, "audit should now run 6 checks (S1-S6)");
    const ids = r.checks.map(c => c.id).sort();
    assert.deepEqual(ids, ["S1", "S2", "S3", "S4", "S5", "S6"]);
  } finally { cleanup(); }
});
