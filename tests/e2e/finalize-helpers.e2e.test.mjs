// tests/e2e/finalize-helpers.e2e.test.mjs — composição dos helpers de finalização
// contra um origin/main REAL (bare remote local), isolado em tmpdir. Valida o
// caminho de runtime (baseRef = origin/main) que os unit tests aproximam com branch local.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeBase, rebaseOnto } from "../../scripts/lib/finalize/base-sync.mjs";
import { outOfScopeCommits } from "../../scripts/lib/finalize/scope-guard.mjs";
import { resolveMergeStrategy } from "../../scripts/lib/finalize/merge-strategy.mjs";
import { assertUnreleasedNonEmpty } from "../../scripts/lib/finalize/changelog-gate.mjs";

const HOME = mkdtempSync(join(tmpdir(), "fh-home-"));
Object.assign(process.env, {
  HOME,
  GIT_CONFIG_GLOBAL: join(HOME, ".gitconfig"),
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
});
function g(cwd, ...a) { return execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8" }); }
function commit(d, f, m) { writeFileSync(join(d, f), `${f}\n`); g(d, "add", "-A"); g(d, "commit", "-m", m); }

// bare remote (origin) + working clone; feature branch fica ATRÁS de origin/main
function setup() {
  const bare = mkdtempSync(join(tmpdir(), "fh-bare-"));
  execFileSync("git", ["init", "--bare", "-b", "main", bare]);
  const wd = mkdtempSync(join(tmpdir(), "fh-wd-"));
  execFileSync("git", ["init", "-b", "main", wd]);
  g(wd, "remote", "add", "origin", bare);
  commit(wd, "base.txt", "init");
  g(wd, "push", "-u", "origin", "main");
  g(wd, "checkout", "-b", "feature/x");
  commit(wd, "feat.txt", "feat: minha feature");   // commit da feature
  // origin/main avança (outro arquivo) e a branch fica defasada
  g(wd, "checkout", "main");
  commit(wd, "other.txt", "chore: avanço na main");
  g(wd, "push", "origin", "main");
  g(wd, "checkout", "feature/x");
  g(wd, "fetch", "origin");
  return { wd, bare };
}

test("composição: base defasada → rebase limpo → sem out-de-escopo", () => {
  const { wd } = setup();
  const a = analyzeBase(wd, { baseRef: "origin/main" });
  assert.equal(a.action, "rebase", "deve detectar base defasada contra origin/main");
  assert.deepEqual(rebaseOnto(wd, "origin/main"), { ok: true }, "rebase limpo");
  assert.equal(g(wd, "rev-list", "--count", "HEAD..origin/main").trim(), "0", "origin/main vira ancestral");
  // após o rebase, origin/main..HEAD = só o commit da feature (in-scope; nada alheio)
  const oos = outOfScopeCommits(wd, "origin/main");
  assert.equal(oos.length, 1);
  assert.equal(oos[0].subject, "feat: minha feature");
});

test("composição: mergeStrategy resolve contra origin/main (fallback squash sem convenção)", () => {
  const { wd } = setup();
  assert.equal(resolveMergeStrategy(wd, { baseRef: "origin/main" }), "squash");
  // config sempre vence
  assert.equal(resolveMergeStrategy(wd, { baseRef: "origin/main", configStrategy: "merge" }), "merge");
});

test("composição: changelog-gate sobre CHANGELOG real do fixture", () => {
  const { wd } = setup();
  writeFileSync(join(wd, "CHANGELOG.md"), "# CL\n\n## [Unreleased]\n\n## [1.0.0]\n- old\n");
  assert.equal(assertUnreleasedNonEmpty(readFileSync(join(wd, "CHANGELOG.md"), "utf8")).empty, true);
});
