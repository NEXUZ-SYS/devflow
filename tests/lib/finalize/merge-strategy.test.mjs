// tests/lib/finalize/merge-strategy.test.mjs — fixtures git em tmpdir, env isolado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectConvention, resolveMergeStrategy } from "../../../scripts/lib/finalize/merge-strategy.mjs";

const HOME = mkdtempSync(join(tmpdir(), "ms-home-"));
Object.assign(process.env, {
  HOME,
  GIT_CONFIG_GLOBAL: join(HOME, ".gitconfig"),
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
});
function g(cwd, ...args) { return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }); }
function initRepo() {
  const d = mkdtempSync(join(tmpdir(), "ms-repo-"));
  execFileSync("git", ["init", "-b", "main", d]);
  writeFileSync(join(d, "a.txt"), "A\n"); g(d, "add", "-A"); g(d, "commit", "-m", "A");
  return d;
}
function commit(d, file, msg) {
  writeFileSync(join(d, file), `${file}\n`); g(d, "add", "-A"); g(d, "commit", "-m", msg);
}

test("convenção merge (merge commit no first-parent)", () => {
  const d = initRepo();
  g(d, "checkout", "-b", "feat"); commit(d, "f.txt", "feat work");
  g(d, "checkout", "main");
  g(d, "merge", "--no-ff", "feat", "-m", "Merge pull request #1 from x/feat");
  assert.equal(detectConvention(d, "main"), "merge");
  assert.equal(resolveMergeStrategy(d, { baseRef: "main" }), "merge");
});

test("convenção squash (títulos (#N) no first-parent)", () => {
  const d = initRepo();
  commit(d, "b.txt", "feat: recurso b (#12)");
  commit(d, "c.txt", "fix: bug c (#13)");
  assert.equal(detectConvention(d, "main"), "squash");
  assert.equal(resolveMergeStrategy(d, { baseRef: "main" }), "squash");
});

test("config vence a convenção", () => {
  const d = initRepo();
  g(d, "checkout", "-b", "feat"); commit(d, "f.txt", "w");
  g(d, "checkout", "main");
  g(d, "merge", "--no-ff", "feat", "-m", "Merge pull request #9 from x/feat");
  assert.equal(resolveMergeStrategy(d, { configStrategy: "rebase", baseRef: "main" }), "rebase");
});

test("fallback squash quando nada reconhecível", () => {
  const d = initRepo();
  commit(d, "b.txt", "commit qualquer sem padrão");
  assert.equal(detectConvention(d, "main"), "unknown");
  assert.equal(resolveMergeStrategy(d, { baseRef: "main" }), "squash");
});
