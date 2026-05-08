#!/usr/bin/env node
// tests/validation/test-manifest-stacks.mjs
// Unit tests for scripts/lib/manifest-stacks.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  loadManifest,
  validateManifest,
  hashRef,
  findMissingRefs,
} from "../../scripts/lib/manifest-stacks.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "manifest-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("loadManifest: returns empty stub if file missing", () => {
  const { root, cleanup } = fixture();
  const m = loadManifest(root);
  assert.equal(m.spec, "devflow-stack/v0");
  assert.deepEqual(m.frameworks, {});
  cleanup();
});

test("loadManifest: parses simple manifest", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "stacks"), { recursive: true });
  writeFileSync(
    join(root, ".context", "stacks", "manifest.yaml"),
    `spec: devflow-stack/v0
runtime:
  node: "20.11"
frameworks:
  next:
    version: "15.0.0"
    artisanalRef: refs/next@15.0.0.md
    applyTo: ["src/app/**"]
`
  );
  const m = loadManifest(root);
  assert.equal(m.spec, "devflow-stack/v0");
  assert.equal(m.runtime.node, "20.11");
  assert.equal(m.frameworks.next.version, "15.0.0");
  assert.equal(m.frameworks.next.artisanalRef, "refs/next@15.0.0.md");
  cleanup();
});

test("validateManifest: rejects manifest without spec field", () => {
  const errors = validateManifest({ frameworks: {} });
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /spec/i);
});

test("validateManifest: rejects framework without version", () => {
  const errors = validateManifest({
    spec: "devflow-stack/v0",
    frameworks: {
      foo: { artisanalRef: "refs/foo.md" },
    },
  });
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /version/i);
});

test("validateManifest: rejects framework with skipDocs:false but no artisanalRef", () => {
  const errors = validateManifest({
    spec: "devflow-stack/v0",
    frameworks: {
      foo: { version: "1.0.0" },
    },
  });
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /artisanalRef|skipDocs/i);
});

test("validateManifest: accepts framework with skipDocs:true and no artisanalRef", () => {
  const errors = validateManifest({
    spec: "devflow-stack/v0",
    frameworks: {
      postgres: { version: "17", skipDocs: true },
    },
  });
  assert.deepEqual(errors, []);
});

test("validateManifest: accepts valid full manifest", () => {
  const errors = validateManifest({
    spec: "devflow-stack/v0",
    runtime: { node: "20.11" },
    frameworks: {
      next: {
        version: "15.0.0",
        artisanalRef: "refs/next@15.0.0.md",
        applyTo: ["src/app/**"],
      },
    },
  });
  assert.deepEqual(errors, []);
});

test("validateManifest: rejects applyTo with extglob (SI-5)", () => {
  const errors = validateManifest({
    spec: "devflow-stack/v0",
    frameworks: {
      foo: {
        version: "1.0.0",
        artisanalRef: "refs/foo.md",
        applyTo: ["+(a|b).ts"],
      },
    },
  });
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /extglob|applyTo/i);
});

test("hashRef: returns sha256 hex of file content", () => {
  const { root, cleanup } = fixture();
  const dir = join(root, ".context", "stacks", "refs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "foo@1.0.0.md"), "hello world\n");
  const hash = hashRef(root, "refs/foo@1.0.0.md");
  // sha256("hello world\n") = a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447
  assert.equal(hash, "a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447");
  cleanup();
});

test("hashRef: returns null when ref file missing", () => {
  const { root, cleanup } = fixture();
  const hash = hashRef(root, "refs/missing.md");
  assert.equal(hash, null);
  cleanup();
});

// SECURITY (Semana 2 audit HIGH fix): reject path-traversal in artisanalRef
test("validateManifest: rejects artisanalRef with path traversal", () => {
  const errors = validateManifest({
    spec: "devflow-stack/v0",
    frameworks: {
      foo: { version: "1.0.0", artisanalRef: "../../../etc/passwd" },
    },
  });
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /traversal|artisanalRef|rejected/i);
});

test("validateManifest: rejects artisanalRef with absolute path", () => {
  const errors = validateManifest({
    spec: "devflow-stack/v0",
    frameworks: {
      foo: { version: "1.0.0", artisanalRef: "/etc/passwd" },
    },
  });
  assert.ok(errors.length > 0);
});

test("validateManifest: rejects artisanalRef not starting with refs/", () => {
  const errors = validateManifest({
    spec: "devflow-stack/v0",
    frameworks: {
      foo: { version: "1.0.0", artisanalRef: "elsewhere/foo.md" },
    },
  });
  assert.ok(errors.length > 0);
});

test("validateManifest: accepts well-formed artisanalRef", () => {
  const errors = validateManifest({
    spec: "devflow-stack/v0",
    frameworks: {
      foo: { version: "1.0.0", artisanalRef: "refs/foo@1.0.0.md" },
    },
  });
  assert.deepEqual(errors, []);
});

test("findMissingRefs: detects declared artisanalRef without file", () => {
  const { root, cleanup } = fixture();
  const stacksDir = join(root, ".context", "stacks");
  mkdirSync(join(stacksDir, "refs"), { recursive: true });
  writeFileSync(
    join(stacksDir, "manifest.yaml"),
    `spec: devflow-stack/v0
frameworks:
  next:
    version: "15.0.0"
    artisanalRef: refs/next@15.0.0.md
  react:
    version: "19.0.0"
    artisanalRef: refs/react@19.0.0.md
`
  );
  // Only create one of them
  writeFileSync(join(stacksDir, "refs", "react@19.0.0.md"), "stub\n");
  const missing = findMissingRefs(root);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].framework, "next");
  cleanup();
});
