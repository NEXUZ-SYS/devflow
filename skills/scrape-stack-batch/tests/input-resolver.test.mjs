#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  parseArgPairs,
  resolveFromPackage,
  resolveFromManifest,
  resolveAll,
  validateAdHocUrl,
} from "../scripts/input-resolver.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "ir-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("parseArgPairs: parses '<lib>@<version>' tokens", () => {
  const r = parseArgPairs(["next@15.0.0", "react@19.0.0"]);
  assert.deepEqual(r, [
    { library: "next", version: "15.0.0" },
    { library: "react", version: "19.0.0" },
  ]);
});

test("parseArgPairs: rejects malformed tokens", () => {
  assert.throws(() => parseArgPairs(["bare-name"]), /malformed|version/i);
  assert.throws(() => parseArgPairs(["@1.0.0"]), /malformed|library/i);
});

test("resolveFromPackage: parses package.json deps + devDeps", () => {
  const { root, cleanup } = fixture();
  writeFileSync(join(root, "package.json"), JSON.stringify({
    dependencies: { next: "^15.0.0", react: "19.0.0" },
    devDependencies: { vitest: "1.6.0", typescript: "^5.0.0" },
  }));
  const r = resolveFromPackage(root);
  const ids = r.map(x => `${x.library}@${x.version}`).sort();
  assert.deepEqual(ids, ["next@15.0.0", "react@19.0.0", "typescript@5.0.0", "vitest@1.6.0"]);
  cleanup();
});

test("resolveFromPackage: returns [] when no package.json", () => {
  const { root, cleanup } = fixture();
  const r = resolveFromPackage(root);
  assert.deepEqual(r, []);
  cleanup();
});

test("resolveFromManifest: reads wishlist", () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "stacks"), { recursive: true });
  writeFileSync(
    join(root, ".context", "stacks", "manifest.yaml"),
    `spec: devflow-stack/v0
wishlist:
  - library: drizzle-orm
    version: 0.33.0
    hint: ORM alternativo
  - library: trpc
    version: 11.0.0
`
  );
  const r = resolveFromManifest(root);
  const ids = r.map(x => `${x.library}@${x.version}`).sort();
  assert.deepEqual(ids, ["drizzle-orm@0.33.0", "trpc@11.0.0"]);
  cleanup();
});

test("resolveAll: dedups across multiple sources", () => {
  const { root, cleanup } = fixture();
  writeFileSync(join(root, "package.json"), JSON.stringify({
    dependencies: { next: "^15.0.0" },
  }));
  // Args also include next; should dedup
  const r = resolveAll(root, {
    fromPackage: true,
    args: ["next@15.0.0", "react@19.0.0"],
  });
  const ids = r.map(x => `${x.library}@${x.version}`).sort();
  assert.deepEqual(ids, ["next@15.0.0", "react@19.0.0"]);
  cleanup();
});

// SI-3 URL validation tests
test("validateAdHocUrl: rejects cloud metadata IP", async () => {
  await assert.rejects(
    validateAdHocUrl("https://169.254.169.254/latest/meta-data/"),
    /metadata|denied|private/i
  );
});

test("validateAdHocUrl: rejects RFC1918", async () => {
  await assert.rejects(validateAdHocUrl("https://10.0.0.1/"), /private|denied/i);
});

test("validateAdHocUrl: rejects file://", async () => {
  await assert.rejects(validateAdHocUrl("file:///etc/passwd"), /scheme/i);
});

test("validateAdHocUrl: accepts public https", async () => {
  await assert.doesNotReject(validateAdHocUrl("https://github.com/foo/bar"));
});
