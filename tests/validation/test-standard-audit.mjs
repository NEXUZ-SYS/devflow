#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { auditStandard } from "../../scripts/lib/standard-audit.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "stdaudit-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeStd(root, id, content) {
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `std-${id}.md`);
  writeFileSync(path, content);
  return path;
}

const VALID_STD = `---
id: std-foo
description: Foo conventions
version: 1.0.0
applyTo: ["**/*.ts"]
relatedAdrs: []
enforcement:
  linter: standards/machine/std-foo.js
weakStandardWarning: true
---

# Standard: foo

## Princípios

Foo é o padrão único do projeto. Toda fronteira valida via Foo.parse().

## Anti-patterns

| Errado | Certo |
|---|---|
| \`as Foo\` | \`FooSchema.parse(input)\` |

## Linter

Ver \`./machine/std-foo.js\`.
`;

const SCAFFOLD_STD = `---
id: std-bar
description: <one-line description>
version: 1.0.0
applyTo: ["src/**"]
relatedAdrs: []
enforcement:
  linter: standards/machine/std-bar.js
scaffolded: true
---

# Standard: bar

## Princípios

TODO: substituir por prosa real.

## Anti-patterns

| Errado | Certo |
|---|---|
| TODO: padrão errado | TODO: padrão correto |

## Linter

\`./machine/std-bar.js\` (TODO: implementar regra real).
`;

test("S2 detects 'scaffolded: true' frontmatter flag", () => {
  const { root, cleanup } = fixture();
  try {
    const path = writeStd(root, "bar", SCAFFOLD_STD);
    const r = auditStandard(path, root);
    const s2 = r.checks.find(c => c.id === "S2");
    assert.equal(s2.status, "FAIL");
    assert.match(s2.diagnosis, /scaffolded.*true/);
  } finally {
    cleanup();
  }
});

test("S2 detects body TODO/placeholder markers", () => {
  const { root, cleanup } = fixture();
  try {
    const path = writeStd(root, "baz", `---
id: std-baz
description: real description
version: 1.0.0
applyTo: ["**/*.ts"]
enforcement:
  linter: standards/machine/std-baz.js
weakStandardWarning: true
---

# Standard: baz

## Princípios

TODO: fill this in
`);
    const r = auditStandard(path, root);
    const s2 = r.checks.find(c => c.id === "S2");
    assert.equal(s2.status, "FAIL");
    assert.match(s2.diagnosis, /placeholder|TODO/i);
  } finally {
    cleanup();
  }
});

test("S2 PASS for fully-filled standard (no placeholders)", () => {
  const { root, cleanup } = fixture();
  try {
    const path = writeStd(root, "foo", VALID_STD);
    const r = auditStandard(path, root);
    const s2 = r.checks.find(c => c.id === "S2");
    assert.equal(s2.status, "PASS");
  } finally {
    cleanup();
  }
});

test("S1 fails when frontmatter missing required fields", () => {
  const { root, cleanup } = fixture();
  try {
    const path = writeStd(root, "incomplete", `---
id: std-incomplete
---

# Standard
`);
    const r = auditStandard(path, root);
    const s1 = r.checks.find(c => c.id === "S1");
    assert.equal(s1.status, "FAIL");
    assert.match(s1.diagnosis, /missing/i);
  } finally {
    cleanup();
  }
});

test("S3 WARN when no linter and no weakStandardWarning opt-out", () => {
  const { root, cleanup } = fixture();
  try {
    const path = writeStd(root, "noopt", `---
id: std-noopt
description: real description
version: 1.0.0
applyTo: ["**/*.ts"]
relatedAdrs: []
enforcement: {}
---

# Standard: noopt

## Princípios

Real prose here.

## Anti-patterns

| Errado | Certo |
|---|---|
| bad | good |

## Linter

(none yet)
`);
    const r = auditStandard(path, root);
    const s3 = r.checks.find(c => c.id === "S3");
    assert.equal(s3.status, "WARN");
  } finally {
    cleanup();
  }
});

test("S3 FAIL when linter declared but file missing", () => {
  const { root, cleanup } = fixture();
  try {
    const path = writeStd(root, "miss", VALID_STD.replace("id: std-foo", "id: std-miss")
      .replace("std-foo.js", "std-miss.js"));
    const r = auditStandard(path, root);
    const s3 = r.checks.find(c => c.id === "S3");
    assert.equal(s3.status, "FAIL");
    assert.match(s3.diagnosis, /not found/i);
  } finally {
    cleanup();
  }
});

test("S4 FAIL when relatedAdrs reference orphan slug", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context", "adrs"), { recursive: true });
    writeFileSync(
      join(root, ".context", "adrs", "001-real-adr-v1.0.0.md"),
      "---\nname: real-adr\n---\n"
    );
    const path = writeStd(root, "foo", VALID_STD.replace(
      "relatedAdrs: []",
      'relatedAdrs: ["real-adr", "ghost-adr"]'
    ));
    // Need machine dir too
    mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
    writeFileSync(join(root, ".context", "standards", "machine", "std-foo.js"), "process.exit(0);");
    const r = auditStandard(path, root);
    const s4 = r.checks.find(c => c.id === "S4");
    assert.equal(s4.status, "FAIL");
    assert.match(s4.diagnosis, /orphan|ghost-adr/);
  } finally {
    cleanup();
  }
});

test("S5 FAIL when applyTo has extglob (SI-5 violation)", () => {
  const { root, cleanup } = fixture();
  try {
    const path = writeStd(root, "bad", VALID_STD
      .replace("id: std-foo", "id: std-bad")
      .replace("std-foo.js", "std-bad.js")
      .replace('applyTo: ["**/*.ts"]', 'applyTo: ["+(a|b).ts"]'));
    mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
    writeFileSync(join(root, ".context", "standards", "machine", "std-bad.js"), "process.exit(0);");
    const r = auditStandard(path, root);
    const s5 = r.checks.find(c => c.id === "S5");
    assert.equal(s5.status, "FAIL");
    assert.match(s5.diagnosis, /extglob|SI-5/i);
  } finally {
    cleanup();
  }
});

test("Full audit: VALID_STD passes all checks", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
    writeFileSync(join(root, ".context", "standards", "machine", "std-foo.js"), "process.exit(0);");
    const path = writeStd(root, "foo", VALID_STD);
    const r = auditStandard(path, root);
    assert.equal(r.gate, "PASSED");
    assert.equal(r.summary.fail, 0);
  } finally {
    cleanup();
  }
});

test("Full audit: SCAFFOLD_STD blocks gate", () => {
  const { root, cleanup } = fixture();
  try {
    const path = writeStd(root, "bar", SCAFFOLD_STD);
    const r = auditStandard(path, root);
    assert.equal(r.gate, "BLOCKED");
  } finally {
    cleanup();
  }
});
