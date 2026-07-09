// tests/lib/finalize/base-sync.test.mjs — fixtures git em tmpdir, env isolado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeBase, rebaseOnto } from "../../../scripts/lib/finalize/base-sync.mjs";

const HOME = mkdtempSync(join(tmpdir(), "bs-home-"));
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
  const d = mkdtempSync(join(tmpdir(), "bs-repo-"));
  execFileSync("git", ["init", "-b", "main", d]);
  writeFileSync(join(d, "a.txt"), "A\n");
  g(d, "add", "-A"); g(d, "commit", "-m", "A");
  return d;
}

test("base em dia → ok", () => {
  const d = initRepo();
  g(d, "checkout", "-b", "feat");
  assert.deepEqual(analyzeBase(d, { baseRef: "main" }), { behind: 0, action: "ok", reason: "base em dia" });
});

test("base à frente → rebase", () => {
  const d = initRepo();
  g(d, "checkout", "-b", "feat");
  g(d, "checkout", "main");
  writeFileSync(join(d, "b.txt"), "B\n"); g(d, "add", "-A"); g(d, "commit", "-m", "B");
  g(d, "checkout", "feat");
  const r = analyzeBase(d, { baseRef: "main" });
  assert.equal(r.action, "rebase"); assert.equal(r.behind, 1);
});

test("rebase limpo → ok e base vira ancestral", () => {
  const d = initRepo();
  g(d, "checkout", "-b", "feat");
  writeFileSync(join(d, "c.txt"), "C\n"); g(d, "add", "-A"); g(d, "commit", "-m", "C");
  g(d, "checkout", "main");
  writeFileSync(join(d, "b.txt"), "B\n"); g(d, "add", "-A"); g(d, "commit", "-m", "B");
  g(d, "checkout", "feat");
  assert.deepEqual(rebaseOnto(d, "main"), { ok: true });
  assert.equal(g(d, "rev-list", "--count", "HEAD..main").trim(), "0");
});

test("conflito real → pausa sem árvore meio-rebaseada", () => {
  const d = initRepo();
  writeFileSync(join(d, "x.txt"), "base\n"); g(d, "add", "-A"); g(d, "commit", "-m", "x0");
  g(d, "checkout", "-b", "feat");
  writeFileSync(join(d, "x.txt"), "feat\n"); g(d, "add", "-A"); g(d, "commit", "-m", "xf");
  g(d, "checkout", "main");
  writeFileSync(join(d, "x.txt"), "main\n"); g(d, "add", "-A"); g(d, "commit", "-m", "xm");
  g(d, "checkout", "feat");
  const r = rebaseOnto(d, "main");
  assert.equal(r.conflict, true);
  assert.ok(r.remedy.includes("abortado"));
  assert.equal(existsSync(join(d, ".git", "rebase-merge")), false, "não pode haver rebase em andamento");
  assert.equal(existsSync(join(d, ".git", "rebase-apply")), false);
});
