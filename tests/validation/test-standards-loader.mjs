#!/usr/bin/env node
// tests/validation/test-standards-loader.mjs
// Unit tests for scripts/lib/standards-loader.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadStandards,
  findApplicableStandards,
} from "../../scripts/lib/standards-loader.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "stds-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const STD_FULL = `---
id: std-error-handling
description: Error handling rules
version: 1.0.0
applyTo: ["src/**/*.ts"]
relatedAdrs: [ADR-009]
enforcement:
  linter: standards/machine/std-error-handling.js
---

# Error handling

Use BaseError.
`;

const STD_NO_LINTER = `---
id: std-naming
description: Naming convention
version: 1.0.0
applyTo: ["src/**"]
---

# Naming
`;

const STD_NO_LINTER_OK = `---
id: std-philosophy
description: Philosophical guideline
version: 1.0.0
applyTo: ["docs/**"]
weakStandardWarning: true
---

# Philosophy
`;

const STD_NO_ID = `---
description: missing id
version: 1.0.0
applyTo: ["src/**"]
---

body
`;

test("loadStandards: empty dir returns []", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "standards"), { recursive: true });
  const result = loadStandards(root);
  assert.deepEqual(result, []);
  cleanup();
});

test("loadStandards: parses frontmatter (id, applyTo, version, enforcement)", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "std-error-handling.md"), STD_FULL);
  const result = loadStandards(root);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "std-error-handling");
  assert.deepEqual(result[0].applyTo, ["src/**/*.ts"]);
  assert.equal(result[0].version, "1.0.0");
  assert.equal(result[0].enforcement.linter, "standards/machine/std-error-handling.js");
  cleanup();
});

test("findApplicableStandards: filters by applyTo glob match", () => {
  const stds = [
    { id: "std-a", applyTo: ["src/**/*.ts"] },
    { id: "std-b", applyTo: ["test/**/*.ts"] },
    { id: "std-c", applyTo: ["src/middleware.ts"] },
  ];
  const matches = findApplicableStandards("src/middleware.ts", stds);
  const ids = matches.map(s => s.id).sort();
  assert.deepEqual(ids, ["std-a", "std-c"]);
});

test("loadStandards: emits weakStandard warning when no linter", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "std-naming.md"), STD_NO_LINTER);
  const result = loadStandards(root);
  assert.equal(result.length, 1);
  assert.equal(result[0].weak, true, "should mark weak standard");
  cleanup();
});

test("loadStandards: weakStandardWarning:true suppresses weak warning", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "std-philosophy.md"), STD_NO_LINTER_OK);
  const result = loadStandards(root);
  assert.equal(result.length, 1);
  assert.equal(result[0].weak, false, "weakStandardWarning:true suppresses weak flag");
  cleanup();
});

test("loadStandards: filters out standards without id", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "std-noid.md"), STD_NO_ID);
  const result = loadStandards(root);
  assert.deepEqual(result, [], "standards without id should be silently dropped");
  cleanup();
});

test("loadStandards: skips machine/ subdir and README.md", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(join(dir, "machine"), { recursive: true });
  writeFileSync(join(dir, "README.md"), "# Authoring guide\n");
  writeFileSync(join(dir, "std-real.md"), STD_FULL);
  writeFileSync(join(dir, "machine", "linter.js"), "// not a standard");
  const result = loadStandards(root);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "std-error-handling");
  cleanup();
});

test("loadStandards: skips deprecated standards (deprecated: true)", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "std-real.md"), STD_FULL);
  // A migrated lib-centric std, renamed to .deprecated.md by `new --migrate`.
  writeFileSync(join(dir, "std-zod.deprecated.md"), `---
id: std-zod
deprecated: true
supersededBy: std-runtime-validation
deprecatedReason: lib-centric — migrado para concern operacional
deprecatedAt: 2026-05-16
---

# Standard: zod
`);
  const result = loadStandards(root);
  assert.equal(result.length, 1, "deprecated std must not be loaded");
  assert.equal(result[0].id, "std-error-handling");
  cleanup();
});

test("loadStandards: skips deprecated std even with a plain .md filename (--keep-old)", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  // `new --migrate --keep-old` marks deprecated in place — filename stays std-X.md.
  writeFileSync(join(dir, "std-zod.md"), `---
id: std-zod
deprecated: true
supersededBy: std-runtime-validation
---

# Standard: zod
`);
  const result = loadStandards(root);
  assert.deepEqual(result, [], "deprecated:true must be skipped regardless of filename");
  cleanup();
});

test("loadStandards: finds standard in canonical engineering/standards path", () => {
  // RED: canonical DDC location is .context/engineering/standards/,
  // not the legacy .context/standards/. loadStandards must resolve via
  // resolveReadPaths(root, "standards") so the canonical path is tried.
  const { root, cleanup } = fixture();
  const canonicalDir = join(root, ".context", "engineering", "standards");
  mkdirSync(canonicalDir, { recursive: true });
  writeFileSync(join(canonicalDir, "std-x.md"), `---
id: std-x
description: Canonical engineering standard
version: 1.0.0
applyTo: ["src/**/*.ts"]
weakStandardWarning: true
---

# std-x
`);
  const result = loadStandards(root);
  assert.equal(result.length, 1, "should find standard at canonical engineering/standards path");
  assert.equal(result[0].id, "std-x");
  cleanup();
});

// ─── Faixa de versão (fase E, Task 5) ───────────────────────────────────────

const RANGE_FIXTURE = "tests/fixtures/version-scoped/std-range";

test("loader propaga appliesFrom/appliesUntil quando declarados", () => {
  const stds = loadStandards(RANGE_FIXTURE);
  const s = stds.find((x) => x.id === "std-range-demo");
  assert.ok(s, "fixture std-range-demo deve carregar");
  assert.equal(s.appliesFrom, "16");
  assert.equal(s.appliesUntil, "17");
});

test("retrocompat: standard sem faixa carrega com null nos dois campos", () => {
  const stds = loadStandards(RANGE_FIXTURE);
  const s = stds.find((x) => x.id === "std-no-range-demo");
  assert.ok(s, "fixture std-no-range-demo deve carregar");
  assert.equal(s.appliesFrom, null);
  assert.equal(s.appliesUntil, null);
});

test("faixa é sempre STRING — `appliesFrom: 16` sem aspas viraria Number", () => {
  const stds = loadStandards(RANGE_FIXTURE);
  const s = stds.find((x) => x.id === "std-range-demo");
  assert.equal(typeof s.appliesFrom, "string",
    "comparação homogênea depende disso; Number quebraria o inRange");
});

// ─── Predicado de faixa no chokepoint (fase E, Task 6) ──────────────────────

const RANGED = [
  { id: "std-a", applyTo: ["**/*.xml"], appliesFrom: "18", appliesUntil: null, framework: "odoo" },
  { id: "std-b", applyTo: ["**/*.xml"], appliesFrom: "17", appliesUntil: null, framework: "odoo" },
  { id: "std-c", applyTo: ["**/*.xml"], appliesFrom: null, appliesUntil: null },
];

test("faixa: no Odoo 17 o standard exclusivo do 18 NÃO se aplica", () => {
  const ctx = { versions: new Map([["odoo", "17"]]) };
  const ids = findApplicableStandards("views/x.xml", RANGED, ctx).map((s) => s.id);
  assert.deepEqual(ids.sort(), ["std-b", "std-c"]);
});

test("faixa: no Odoo 18 ambos se aplicam", () => {
  const ctx = { versions: new Map([["odoo", "18"]]) };
  const ids = findApplicableStandards("views/x.xml", RANGED, ctx).map((s) => s.id);
  assert.deepEqual(ids.sort(), ["std-a", "std-b", "std-c"]);
});

test("faixa: appliesUntil é INCLUSIVO", () => {
  const stds = [{ id: "s", applyTo: ["**/*.xml"], appliesFrom: "15", appliesUntil: "17", framework: "odoo" }];
  assert.equal(findApplicableStandards("x.xml", stds, { versions: new Map([["odoo", "17"]]) }).length, 1);
  assert.equal(findApplicableStandards("x.xml", stds, { versions: new Map([["odoo", "18"]]) }).length, 0);
});

test("faixa: comparação é numérica, não lexicográfica ('9' < '10')", () => {
  const stds = [{ id: "s", applyTo: ["**/*.xml"], appliesFrom: "9", appliesUntil: null, framework: "odoo" }];
  assert.equal(
    findApplicableStandards("x.xml", stds, { versions: new Map([["odoo", "10"]]) }).length, 1,
    "série 10 >= piso 9; comparação lexicográfica diria o contrário",
  );
});

test("fail-closed: versão desconhecida PULA o standard com faixa e registra", () => {
  const skipped = [];
  const ctx = { versions: new Map(), onSkip: (e) => skipped.push(e) };
  const ids = findApplicableStandards("views/x.xml", RANGED, ctx).map((s) => s.id);
  assert.deepEqual(ids, ["std-c"], "só o sem-faixa sobrevive");
  assert.equal(skipped.length, 2, "os pulados são registrados, não silenciados");
  assert.ok(skipped.every((s) => s.reason));
});

test("RETROCOMPAT: sem ctx, o comportamento é idêntico ao de hoje", () => {
  const ids = findApplicableStandards("views/x.xml", RANGED).map((s) => s.id);
  assert.deepEqual(ids.sort(), ["std-a", "std-b", "std-c"],
    "sem ctx nenhum standard é filtrado por versão");
});
