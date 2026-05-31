#!/usr/bin/env node
// TDD: tests for path traversal + newline injection guards in devflow-knowledge.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { scaffoldKnowledge } from "../../scripts/lib/knowledge-from-type.mjs";

const SCRIPT = join(process.cwd(), "scripts", "devflow-knowledge.mjs");

// Helper: run script and capture stderr + exit code without throwing
function run(args) {
  const result = spawnSync("node", [SCRIPT, ...args], { encoding: "utf-8" });
  return { code: result.status, stderr: result.stderr ?? "", stdout: result.stdout ?? "" };
}

// Helper: run a helper script that invokes devflow-knowledge with a programmatically
// constructed arg (bypassing shell argument splitting of \n and \r).
function runViaHelper(root, helperCode) {
  const helperScript = join(root, "_helper.mjs");
  writeFileSync(helperScript, helperCode);
  return spawnSync("node", [helperScript], { encoding: "utf-8" });
}

// ── Fix 1a: path traversal via --name ────────────────────────────────────────

test("new --name=../../evil: exits non-zero and emits containment error", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-trav-"));
  const { code, stderr } = run([
    "new",
    "--type=business-vision",
    "--name=../../evil",
    `--project=${root}`,
  ]);
  assert.notEqual(code, 0, "should exit non-zero for traversal name");
  assert.match(stderr, /traversal|invalid.*name|path|\.\./, "should emit containment message");
  rmSync(root, { recursive: true, force: true });
});

test("new --name=../../evil: does NOT create file outside the layer dir", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-trav-nocreate-"));
  // Compute where it would escape to if not guarded
  const escapedPath = resolve(join(root, ".context", "business", "../../evil.md"));
  run([
    "new",
    "--type=business-vision",
    "--name=../../evil",
    `--project=${root}`,
  ]);
  assert.ok(!existsSync(escapedPath), `escaped file must not exist: ${escapedPath}`);
  rmSync(root, { recursive: true, force: true });
});

test("new --name with backslash: exits non-zero", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-trav-bs-"));
  const { code, stderr } = run([
    "new",
    "--type=business-vision",
    "--name=foo\\bar",
    `--project=${root}`,
  ]);
  assert.notEqual(code, 0, "should exit non-zero for backslash in name");
  assert.match(stderr, /traversal|invalid.*name|path/i);
  rmSync(root, { recursive: true, force: true });
});

test("new --name with dotdot segment: exits non-zero", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-trav-dotdot-"));
  const { code, stderr } = run([
    "new",
    "--type=business-vision",
    "--name=foo/../bar",
    `--project=${root}`,
  ]);
  assert.notEqual(code, 0, "should exit non-zero for .. in name");
  assert.match(stderr, /traversal|invalid.*name|path/i);
  rmSync(root, { recursive: true, force: true });
});

// ── Fix 1b: newline injection via name / description ─────────────────────────
// The primary attack surface for newline injection is programmatic use (name/description
// coming from config files or external APIs). On Linux, argv \n splits the argument,
// so the real risk is when devflow-knowledge is used as a library or when the value
// comes from a decoded external source. We test:
// 1. scaffoldKnowledge (lib) — demonstrates the risk without a guard
// 2. CR (\r) in name — survives argv splitting unlike LF (\n)
// 3. Programmatic invocation with actual \n in name via helper subprocess

test("scaffoldKnowledge: name with newline produces invalid YAML (demonstrates guard necessity)", () => {
  // Confirms WHY the guard is needed: without it, \n in name injects a YAML key.
  const badName = "valid\nevil: injected";
  const entry = {
    layer: "business",
    activation: "on-demand",
    owner: "team",
    sectionTemplate: ["## Content"],
    summary: "desc",
  };
  const scaffold = scaffoldKnowledge(entry, { name: badName, version: "1.0.0" });
  assert.match(scaffold, /evil: injected/, "demonstrates injection risk when guard is absent");
});

test("new --name with CR (\\r): CLI rejects it (carriage-return newline variant)", () => {
  // \r in a flag value causes the JS regex arg-parser to fail matching the flag
  // (JS's .* does not match \r), so the flag is not set and the script exits
  // with "name is required" (non-zero). Either our validateName guard or the arg
  // parser reject the value — in both cases exit is non-zero and no file is created.
  const root = mkdtempSync(join(tmpdir(), "dk-inj-cr-"));
  const helperCode = `
import { spawnSync } from "node:child_process";
const name = "valid\\revil";
const r = spawnSync("node", [${JSON.stringify(SCRIPT)}, "new", "--type=business-vision",
  "--name=" + name, ${JSON.stringify("--project=" + root)}], { encoding: "utf-8" });
process.stdout.write(String(r.status) + "\\n");
process.stderr.write(r.stderr || "");
`;
  const res = runViaHelper(root, helperCode);
  const exitCode = parseInt(res.stdout.trim(), 10);
  // Exit must be non-zero (either guard or arg parser rejects it)
  assert.notEqual(exitCode, 0, "should exit non-zero for \\r in name");
  // No file must be created (the important safety property)
  assert.ok(!existsSync(join(root, ".context", "business", "valid.md")), "no file should be created");
  rmSync(root, { recursive: true, force: true });
});

test("new: programmatic name with \\n exits non-zero or does not inject YAML", () => {
  // Via helper subprocess that constructs the arg with actual \n in it.
  // On Linux, \n in argv is split, so the value becomes just "valid" — the guard
  // catches it at the validateDescription level if description has \n.
  // This test verifies the end-to-end: no injected YAML key appears in the output file.
  const root = mkdtempSync(join(tmpdir(), "dk-inj-nl-"));
  const helperCode = `
import { spawnSync } from "node:child_process";
// \n in description — survives partially (truncated to "legit" by argv split)
const desc = "legit\\nevil: injected";
const r = spawnSync("node", [${JSON.stringify(SCRIPT)}, "new", "--type=business-vision",
  "--name=vision", "--description=" + desc, ${JSON.stringify("--project=" + root)}], { encoding: "utf-8" });
process.stdout.write(String(r.status) + "\\n");
process.stderr.write(r.stderr || "");
`;
  const res = runViaHelper(root, helperCode);
  const exitCode = parseInt(res.stdout.trim(), 10);
  const expectedPath = join(root, ".context", "business", "vision.md");
  if (existsSync(expectedPath)) {
    const content = readFileSync(expectedPath, "utf-8");
    assert.doesNotMatch(content, /evil: injected/, "frontmatter must not contain injected YAML key");
  } else {
    assert.notEqual(exitCode, 0, "if no file created, exit must be non-zero");
  }
  rmSync(root, { recursive: true, force: true });
});

// ── Fix 1c: audit --name traversal ───────────────────────────────────────────

test("audit --name=../../evil: exits non-zero and emits containment error", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-audit-trav-"));
  const { code, stderr } = run([
    "audit",
    "--name=../../evil",
    `--project=${root}`,
  ]);
  assert.notEqual(code, 0, "should exit non-zero for traversal name in audit");
  assert.match(stderr, /traversal|invalid.*name|path|\.\./, "should emit containment message");
  rmSync(root, { recursive: true, force: true });
});

// ── Regression: valid name still works ───────────────────────────────────────

test("new --name=my-vision: still creates file for valid name (regression guard)", () => {
  const root = mkdtempSync(join(tmpdir(), "dk-valid-"));
  const { code } = run([
    "new",
    "--type=business-vision",
    "--name=my-vision",
    `--project=${root}`,
  ]);
  assert.equal(code, 0, "valid name should succeed");
  assert.ok(existsSync(join(root, ".context", "business", "my-vision.md")));
  rmSync(root, { recursive: true, force: true });
});
