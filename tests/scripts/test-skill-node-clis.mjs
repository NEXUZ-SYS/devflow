// tests/scripts/test-skill-node-clis.mjs
// SI-1: trava o wiring das CLIs .mjs que substituíram os `node -e` interpolados
// nas skills (adr-pending, path-resolver, orchestrator-*, devflow-yaml-merge).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIB = new URL("../../scripts/lib/", import.meta.url).pathname;
const run = (file, args, opts = {}) =>
  execFileSync("node", [join(LIB, file), ...args], { encoding: "utf8", ...opts });

test("adr-pending: append → read → clear (via CLI)", () => {
  const root = mkdtempSync(join(tmpdir(), "cli-adr-"));
  assert.equal(run("adr-pending.mjs", ["read-candidates"], { cwd: root }).trim(), "[]");
  run("adr-pending.mjs", ["append-candidate", "E", "", "minha decisão"], { cwd: root });
  const after = JSON.parse(run("adr-pending.mjs", ["read-candidates"], { cwd: root }));
  assert.equal(after.length, 1);
  assert.equal(after[0].phrase, "minha decisão");
  assert.equal(after[0].phase, "E");
  run("adr-pending.mjs", ["clear-pending"], { cwd: root });
  assert.equal(run("adr-pending.mjs", ["read-candidates"], { cwd: root }).trim(), "[]");
});

test("path-resolver: adr-globs aponta o canônico engineering/adrs", () => {
  const root = mkdtempSync(join(tmpdir(), "cli-pr-"));
  mkdirSync(join(root, ".context", "engineering", "adrs"), { recursive: true });
  const out = run("path-resolver.mjs", ["adr-globs"], { cwd: root }).trim();
  assert.match(out, /\.context\/engineering\/adrs\/\*\.md/);
});

test("orchestrator-dispatch: independent-count via stdin", () => {
  const stories = JSON.stringify([{ id: "a", blocked_by: [] }, { id: "b", blocked_by: [] }, { id: "c", blocked_by: ["a"] }]);
  const out = run("orchestrator-dispatch.mjs", ["independent-count"], { input: stories }).trim();
  assert.equal(out, "2");
});

test("orchestrator-config: block-disabled / block-mode / should-parallelize / check-user-scope", () => {
  assert.match(run("orchestrator-config.mjs", ["block-disabled"]), /orchestrator:/);
  assert.match(run("orchestrator-config.mjs", ["block-mode", "auto"]), /mode:\s*auto|auto/);
  const cfg = JSON.stringify({ orchestrator: { enabled: true, mode: "auto", trigger: { scales: ["LARGE"], minIndependentStories: 2 } } });
  assert.equal(run("orchestrator-config.mjs", ["should-parallelize", "LARGE", "3", "true"], { input: cfg }).trim(), "parallel");
  const plist = "devflow@NEXUZ-SYS\n  Scope: user\nsuperpowers@official\n  Scope: user\n";
  assert.equal(run("orchestrator-config.mjs", ["check-user-scope", "devflow@NEXUZ-SYS", "superpowers@"], { input: plist }).trim(), "USER_SCOPE_OK");
});

test("devflow-yaml-merge: top-level-keys", () => {
  const root = mkdtempSync(join(tmpdir(), "cli-yaml-"));
  const f = join(root, "c.yaml");
  writeFileSync(f, "git:\n  strategy: x\nmempalace:\n  budget: 1\n");
  assert.equal(run("devflow-yaml-merge.mjs", ["top-level-keys", f]).trim(), "git mempalace");
});
