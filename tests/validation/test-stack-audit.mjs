#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { auditStack } from "../../scripts/lib/stack-audit.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "stkaudit-"));
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

function writeRef(root, lib, version, content) {
  const dir = join(root, ".context", "stacks", "refs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${lib}@${version}.md`);
  writeFileSync(path, content);
  return path;
}

const VALID_REF = `<<<DEVFLOW_STACK_REF_START_abc123def456>>>
TITLE: Snippet 1
DESCRIPTION: First example
SOURCE: docs/intro.md
LANGUAGE: typescript
CODE:
\`\`\`typescript
export const a = 1;
\`\`\`

----------------------------------------

TITLE: Snippet 2
DESCRIPTION: Second
SOURCE: docs/usage.md
LANGUAGE: typescript
CODE:
\`\`\`typescript
export const b = 2;
\`\`\`

----------------------------------------

TITLE: Snippet 3
DESCRIPTION: Third
SOURCE: docs/api.md
LANGUAGE: typescript
CODE:
\`\`\`typescript
export const c = 3;
\`\`\`

----------------------------------------

TITLE: Snippet 4
DESCRIPTION: Fourth
SOURCE: docs/refs.md
LANGUAGE: typescript
CODE:
\`\`\`typescript
export const d = 4;
\`\`\`

----------------------------------------

TITLE: Snippet 5
DESCRIPTION: Fifth
SOURCE: docs/extra.md
LANGUAGE: typescript
CODE:
\`\`\`typescript
export const e = 5;
\`\`\`

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
`;

test("T1 FAIL when lib not in manifest", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    writeRef(root, "ghost", "1.0.0", VALID_REF);
    const r = auditStack("ghost", "1.0.0", root);
    const t1 = r.checks.find(c => c.id === "T1");
    assert.equal(t1.status, "FAIL");
    assert.match(t1.diagnosis, /not declared/);
  } finally {
    cleanup();
  }
});

test("T1 PASS short-circuits when skipDocs:true", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, { postgres: { version: "17.0.0", skipDocs: true } });
    const r = auditStack("postgres", "17.0.0", root);
    assert.equal(r.gate, "PASSED");
    assert.equal(r.checks.length, 1); // only T1 — short-circuit
  } finally {
    cleanup();
  }
});

test("T_FILE FAIL when ref file missing", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      next: { version: "15.0.0", artisanalRef: "refs/next@15.0.0.md" },
    });
    // Don't write the ref file
    const r = auditStack("next", "15.0.0", root);
    assert.equal(r.gate, "BLOCKED");
    const fileCheck = r.checks.find(c => c.id === "T_FILE");
    assert.equal(fileCheck.status, "FAIL");
  } finally {
    cleanup();
  }
});

test("T2 FAIL when zero snippets (no TITLE: header)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      next: { version: "15.0.0", artisanalRef: "refs/next@15.0.0.md" },
    });
    writeRef(root, "next", "15.0.0",
      `<<<DEVFLOW_STACK_REF_START_abc>>>\nNo snippets here, just prose.\n${"x".repeat(600)}\n<<<DEVFLOW_STACK_REF_END>>>`);
    const r = auditStack("next", "15.0.0", root);
    const t2 = r.checks.find(c => c.id === "T2");
    assert.equal(t2.status, "FAIL");
  } finally {
    cleanup();
  }
});

test("T3 FAIL when file < 500 bytes", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: { version: "1.0.0", artisanalRef: "refs/foo@1.0.0.md" },
    });
    writeRef(root, "foo", "1.0.0",
      `<<<DEVFLOW_STACK_REF_START_abc>>>\ntiny\n<<<DEVFLOW_STACK_REF_END>>>`);
    const r = auditStack("foo", "1.0.0", root);
    const t3 = r.checks.find(c => c.id === "T3");
    assert.equal(t3.status, "FAIL");
  } finally {
    cleanup();
  }
});

test("T3 WARN when 1-4 snippets (below md2llm convention)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: { version: "1.0.0", artisanalRef: "refs/foo@1.0.0.md" },
    });
    // Only 2 snippets (< 5)
    writeRef(root, "foo", "1.0.0",
      `<<<DEVFLOW_STACK_REF_START_abc123>>>\n${"TITLE: x\nDESCRIPTION: y\nSOURCE: z\nLANGUAGE: ts\nCODE:\nx\n".repeat(2)}\n${"x".repeat(500)}\n<<<DEVFLOW_STACK_REF_END>>>`);
    const r = auditStack("foo", "1.0.0", root);
    const t3 = r.checks.find(c => c.id === "T3");
    assert.equal(t3.status, "WARN");
  } finally {
    cleanup();
  }
});

test("T4 FAIL when SI-6 fence missing", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: { version: "1.0.0", artisanalRef: "refs/foo@1.0.0.md" },
    });
    writeRef(root, "foo", "1.0.0",
      `TITLE: Snippet 1\nDESCRIPTION: x\nSOURCE: y\nLANGUAGE: ts\nCODE:\ncode\n${"x".repeat(600)}`);
    const r = auditStack("foo", "1.0.0", root);
    const t4 = r.checks.find(c => c.id === "T4");
    assert.equal(t4.status, "FAIL");
  } finally {
    cleanup();
  }
});

test("T5 FAIL when manual-generation marker present", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: { version: "1.0.0", artisanalRef: "refs/foo@1.0.0.md" },
    });
    const ref = VALID_REF.replace("Snippet 1", "Generated by Claude Snippet 1");
    writeRef(root, "foo", "1.0.0", ref);
    const r = auditStack("foo", "1.0.0", root);
    const t5 = r.checks.find(c => c.id === "T5");
    assert.equal(t5.status, "FAIL");
    assert.match(t5.diagnosis, /manual-generation marker/);
  } finally {
    cleanup();
  }
});

test("Full audit: VALID_REF passes all 5 checks", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: { version: "1.0.0", artisanalRef: "refs/foo@1.0.0.md" },
    });
    writeRef(root, "foo", "1.0.0", VALID_REF);
    const r = auditStack("foo", "1.0.0", root);
    assert.equal(r.gate, "PASSED");
    assert.equal(r.summary.fail, 0);
  } finally {
    cleanup();
  }
});

test("T1 WARN when version drift between manifest and audit target", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      next: { version: "15.0.0", artisanalRef: "refs/next@15.0.0.md" },
    });
    writeRef(root, "next", "16.0.0", VALID_REF);
    const r = auditStack("next", "16.0.0", root);
    const t1 = r.checks.find(c => c.id === "T1");
    assert.equal(t1.status, "WARN");
    assert.match(t1.diagnosis, /drift/);
  } finally {
    cleanup();
  }
});
