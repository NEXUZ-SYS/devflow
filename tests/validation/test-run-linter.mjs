#!/usr/bin/env node
// tests/validation/test-run-linter.mjs
// Unit tests for scripts/lib/run-linter.mjs — SI-4 sandboxing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
import { runLintersFor, validateLinterPath } from "../../scripts/lib/run-linter.mjs";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "linter-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const STD_WITH_LINTER = (linterRel) => `---
id: std-test
description: Test std
version: 1.0.0
applyTo: ["**/*.ts"]
enforcement:
  linter: ${linterRel}
---

# std-test
`;

// ─── SI-4 path validation ───

test("validateLinterPath: rejects path traversal (..)", () => {
  const r = validateLinterPath("../../../tmp/evil.sh", "/proj");
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsafe|forbidden|\.\./i);
});

test("validateLinterPath: rejects absolute path", () => {
  const r = validateLinterPath("/etc/passwd", "/proj");
  assert.equal(r.ok, false);
});

test("validateLinterPath: rejects shell metacharacters", () => {
  for (const bad of ["foo.js; rm -rf", "foo|bash", "foo && cat", "$(curl evil)", "`whoami`", "foo>out"]) {
    const r = validateLinterPath(bad, "/proj");
    assert.equal(r.ok, false, `should reject: ${bad}`);
  }
});

test("validateLinterPath: rejects whitespace in path", () => {
  const r = validateLinterPath("foo bar.js", "/proj");
  assert.equal(r.ok, false);
});

test("validateLinterPath: rejects non-.js extensions", () => {
  for (const bad of ["foo.sh", "foo.py", "foo.exe", "foo"]) {
    const r = validateLinterPath(bad, "/proj");
    assert.equal(r.ok, false, `should reject: ${bad}`);
  }
});

test("validateLinterPath: accepts well-formed relative .js path", () => {
  const r = validateLinterPath("standards/machine/std-foo.js", "/proj");
  assert.equal(r.ok, true);
});

// ─── runLintersFor: integration ───

test("runLintersFor: rejects poisoned linter (path traversal)", async () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
  writeFileSync(
    join(root, ".context", "standards", "std-poison.md"),
    STD_WITH_LINTER("../../../tmp/evil.sh")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  // The linter should be rejected (skipped); no violations emitted from this std.
  assert.equal(result.violations.length, 0, "poisoned linter should not produce violations");
  assert.ok(result.rejected.length >= 1, "should record rejection");
  assert.match(result.rejected[0].reason, /unsafe|forbidden|\.\./i);
  cleanup();
});

test("runLintersFor: rejects poisoned linter (absolute path)", async () => {
  const { root, cleanup } = fixture();
  mkdirSync(join(root, ".context", "standards", "machine"), { recursive: true });
  writeFileSync(
    join(root, ".context", "standards", "std-poison.md"),
    STD_WITH_LINTER("/etc/passwd")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  assert.ok(result.rejected.length >= 1);
  cleanup();
});

test("runLintersFor: runs valid linter and captures VIOLATION", async () => {
  const { root, cleanup } = fixture();
  const machineDir = join(root, ".context", "standards", "machine");
  mkdirSync(machineDir, { recursive: true });
  // Create a real linter that emits VIOLATION
  const linterPath = join(machineDir, "std-test.js");
  writeFileSync(linterPath, `#!/usr/bin/env node
console.log("VIOLATION: test rule violated by " + process.argv[2]);
process.exit(1);
`);
  chmodSync(linterPath, 0o644);
  writeFileSync(
    join(root, ".context", "standards", "std-test.md"),
    STD_WITH_LINTER("standards/machine/std-test.js")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0].msg, /VIOLATION:/);
  assert.match(result.violations[0].msg, /src\/foo\.ts/);
  cleanup();
});

test("runLintersFor: skips standards whose applyTo doesn't match", async () => {
  const { root, cleanup } = fixture();
  const machineDir = join(root, ".context", "standards", "machine");
  mkdirSync(machineDir, { recursive: true });
  const linterPath = join(machineDir, "std-test.js");
  writeFileSync(linterPath, `console.log("VIOLATION: should not run"); process.exit(1);`);
  // Standard applies only to **/*.ts but we'll edit a .py file
  writeFileSync(
    join(root, ".context", "standards", "std-test.md"),
    STD_WITH_LINTER("standards/machine/std-test.js")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.py" },
    root
  );
  assert.equal(result.violations.length, 0, "applyTo mismatch should skip linter");
  cleanup();
});

test("runLintersFor: returns empty for non-Edit/Write tools", async () => {
  const { root, cleanup } = fixture();
  const result = await runLintersFor(
    { tool: "Read", path: "src/foo.ts" },
    root
  );
  assert.deepEqual(result.violations, []);
  cleanup();
});

// ─── Camada 4: enrich violation com stdPath + refPath ─────────────────────

test("runLintersFor: violation includes stdPath pointing to the std .md file", async () => {
  // Camada 4: quando o linter acusa, o LLM precisa saber onde ler o
  // standard completo para entender a regra. Hoje só vai a string de
  // VIOLATION; sem path, o LLM teria que descobrir por glob.
  const { root, cleanup } = fixture();
  const machineDir = join(root, ".context", "standards", "machine");
  mkdirSync(machineDir, { recursive: true });
  const linterPath = join(machineDir, "std-test.js");
  writeFileSync(linterPath, `console.log("VIOLATION: bar"); process.exit(1);`);
  writeFileSync(
    join(root, ".context", "standards", "std-test.md"),
    STD_WITH_LINTER("standards/machine/std-test.js")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  assert.equal(result.violations.length, 1);
  assert.equal(
    result.violations[0].stdPath,
    ".context/standards/std-test.md",
    "violation must include relative path to std .md file"
  );
  cleanup();
});

test("runLintersFor: violation includes refPath when std has relatedAdrs → manifest entry", async () => {
  // Camada 4 (full chain): std → relatedAdrs → ADR.stack → manifest.artisanalRef
  // resolve ao path do ref scrapeado/declarado. Permite ao LLM ler API docs
  // sem ter que buscar o manifest manualmente.
  const { root, cleanup } = fixture();
  const machineDir = join(root, ".context", "standards", "machine");
  mkdirSync(machineDir, { recursive: true });

  // Linter
  writeFileSync(
    join(machineDir, "std-typescript.js"),
    `console.log("VIOLATION: any"); process.exit(1);`
  );

  // ADR with stack
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  writeFileSync(
    join(root, ".context", "adrs", "001-adr-typescript-frontend-v1.0.0.md"),
    `---
type: adr
name: adr-typescript-frontend
stack: TypeScript 5.9.x
status: Aprovado
version: 1.0.0
---
# ADR
## Decisão
`
  );

  // Manifest with artisanalRef
  mkdirSync(join(root, ".context", "stacks", "refs"), { recursive: true });
  writeFileSync(
    join(root, ".context", "stacks", "manifest.yaml"),
    `spec: devflow-stack/v0
frameworks:
  typescript:
    version: "5.9.0"
    artisanalRef: "refs/typescript@5.9.0.md"
`
  );
  writeFileSync(
    join(root, ".context", "stacks", "refs", "typescript@5.9.0.md"),
    "# TS ref\n"
  );

  // Standard with relatedAdrs
  writeFileSync(
    join(root, ".context", "standards", "std-typescript.md"),
    `---
id: std-typescript
description: TS
version: 1.0.0
applyTo: ["**/*.ts"]
relatedAdrs: ["adr-typescript-frontend"]
enforcement:
  linter: standards/machine/std-typescript.js
---
# std
`
  );

  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].refPath, ".context/stacks/refs/typescript@5.9.0.md");
  assert.equal(result.violations[0].refStatus, "scraped");
  cleanup();
});

test("run-linter-cli: stdout includes std + ref lines under each violation", async () => {
  // E2E: hook receives this stdout via additionalContext. Anchors that the
  // LLM can grep: "Standard <id> violated:", "std:", "ref:".
  const { spawnSync } = await import("node:child_process");
  const { root, cleanup } = fixture();
  try {
    const machineDir = join(root, ".context", "standards", "machine");
    mkdirSync(machineDir, { recursive: true });
    writeFileSync(
      join(machineDir, "std-test.js"),
      `console.log("VIOLATION: bar"); process.exit(1);`
    );
    writeFileSync(
      join(root, ".context", "standards", "std-test.md"),
      STD_WITH_LINTER("standards/machine/std-test.js")
    );
    const cliPath = new URL("../../scripts/lib/run-linter-cli.mjs", import.meta.url).pathname;
    const event = JSON.stringify({ tool: "Edit", path: "src/foo.ts" });
    const r = spawnSync("node", [cliPath], { encoding: "utf-8", input: event, cwd: root });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /Standard std-test violated/);
    assert.match(r.stdout, /std: \.context\/standards\/std-test\.md/);
  } finally { cleanup(); }
});

test("runLintersFor: violation reports refStatus='pending-scrape' when ref file missing", async () => {
  // Manifest declares the ref but file isn't on disk yet — LLM should still
  // see the path so it can request the scrape.
  const { root, cleanup } = fixture();
  const machineDir = join(root, ".context", "standards", "machine");
  mkdirSync(machineDir, { recursive: true });
  writeFileSync(
    join(machineDir, "std-zod.js"),
    `console.log("VIOLATION: missing parse"); process.exit(1);`
  );
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  writeFileSync(
    join(root, ".context", "adrs", "010-adr-zod-frontend-v1.0.0.md"),
    `---
type: adr
name: adr-zod-frontend
stack: Zod 4.1
status: Aprovado
version: 1.0.0
---
# ADR
`
  );
  // Manifest entry without the ref file on disk
  mkdirSync(join(root, ".context", "stacks"), { recursive: true });
  writeFileSync(
    join(root, ".context", "stacks", "manifest.yaml"),
    `spec: devflow-stack/v0
frameworks:
  zod:
    version: "4.1.0"
    artisanalRef: "refs/zod@4.1.0.md"
`
  );
  writeFileSync(
    join(root, ".context", "standards", "std-zod.md"),
    `---
id: std-zod
description: Zod
version: 1.0.0
applyTo: ["**/*.ts"]
relatedAdrs: ["adr-zod-frontend"]
enforcement:
  linter: standards/machine/std-zod.js
---
# std
`
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].refPath, ".context/stacks/refs/zod@4.1.0.md");
  assert.equal(result.violations[0].refStatus, "pending-scrape");
  cleanup();
});

test("runLintersFor: violation has refPath=null when std has no relatedAdrs", async () => {
  const { root, cleanup } = fixture();
  const machineDir = join(root, ".context", "standards", "machine");
  mkdirSync(machineDir, { recursive: true });
  writeFileSync(
    join(machineDir, "std-test.js"),
    `console.log("VIOLATION: x"); process.exit(1);`
  );
  writeFileSync(
    join(root, ".context", "standards", "std-test.md"),
    STD_WITH_LINTER("standards/machine/std-test.js")
  );
  const result = await runLintersFor(
    { tool: "Edit", path: "src/foo.ts" },
    root
  );
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].refPath, null, "no ref derivable → null, not undefined");
  cleanup();
});
