// tests/lib/finalize/scope-guard.test.mjs — fixtures git em tmpdir, env isolado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outOfScopeCommits, remedyFor } from "../../../scripts/lib/finalize/scope-guard.mjs";

const HOME = mkdtempSync(join(tmpdir(), "sg-home-"));
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
  const d = mkdtempSync(join(tmpdir(), "sg-repo-"));
  execFileSync("git", ["init", "-b", "main", d]);
  writeFileSync(join(d, "a.txt"), "A\n");
  g(d, "add", "-A"); g(d, "commit", "-m", "A");
  g(d, "checkout", "-b", "feat");
  return d;
}
function commit(d, file, msg) {
  writeFileSync(join(d, file), `${file}\n`); g(d, "add", "-A"); g(d, "commit", "-m", msg);
}

test("branch em dia → []", () => {
  const d = initRepo();
  assert.deepEqual(outOfScopeCommits(d, "main"), []);
});

test("1 commit em base..HEAD", () => {
  const d = initRepo();
  commit(d, "f1.txt", "feat: um");
  const r = outOfScopeCommits(d, "main");
  assert.equal(r.length, 1);
  assert.match(r[0].sha, /^[0-9a-f]{40}$/);
  assert.equal(r[0].subject, "feat: um");
});

test("2 commits, ordem do log (mais novo primeiro)", () => {
  const d = initRepo();
  commit(d, "f1.txt", "primeiro");
  commit(d, "f2.txt", "segundo");
  const r = outOfScopeCommits(d, "main");
  assert.equal(r.length, 2);
  assert.equal(r[0].subject, "segundo");
  assert.equal(r[1].subject, "primeiro");
});

test("remedyFor contém rebase --onto e o sha", () => {
  const rem = remedyFor("abc123", "main");
  assert.match(rem, /rebase --onto main abc123 HEAD/);
});
