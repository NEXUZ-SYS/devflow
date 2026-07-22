import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { suggestBump, resolveBase } from "../../../scripts/lib/finalize/suggest-bump.mjs";

test("vazio → patch (default seguro)", () => {
  assert.equal(suggestBump([]), "patch");
  assert.equal(suggestBump(), "patch");
});

test("só fix/chore/docs → patch", () => {
  assert.equal(suggestBump(["fix: corrige X", "chore: bump deps", "docs: readme"]), "patch");
  assert.equal(suggestBump(["refactor(core): extrai helper", "test: cobre borda"]), "patch");
});

test("algum feat → minor", () => {
  assert.equal(suggestBump(["fix: x", "feat: nova capacidade", "docs: y"]), "minor");
  assert.equal(suggestBump(["feat(scope): endpoint"]), "minor");
});

test("breaking via ! → major (vence feat)", () => {
  assert.equal(suggestBump(["feat!: remove API antiga"]), "major");
  assert.equal(suggestBump(["fix(api)!: muda contrato", "feat: outra coisa"]), "major");
});

test("breaking via BREAKING CHANGE no corpo → major", () => {
  assert.equal(suggestBump(["feat: x\n\nBREAKING CHANGE: remove campo"]), "major");
  assert.equal(suggestBump(["fix: y\n\nBREAKING-CHANGE: idem"]), "major");
});

test("precedência: major > minor > patch", () => {
  assert.equal(suggestBump(["fix: a", "feat: b", "feat!: c"]), "major");
  assert.equal(suggestBump(["fix: a", "feat: b"]), "minor");
  assert.equal(suggestBump(["fix: a", "chore: b"]), "patch");
});

test("não confunde 'feat' fora do prefixo (ex.: 'fix: feature toggle')", () => {
  assert.equal(suggestBump(["fix: adiciona feature toggle"]), "patch");
});

test("nunca lança com entrada suja (não-string, null)", () => {
  assert.doesNotThrow(() => suggestBump([null, 42, { x: 1 }, "feat: ok"]));
  assert.equal(suggestBump([null, 42, "feat: ok"]), "minor");
});

// --- resolução da base: fixtures git reais em tmpdir, env isolado
// --- (mesmo padrão de base-sync.test.mjs; nunca muta diretório versionado).
const HOME = mkdtempSync(join(tmpdir(), "sb-home-"));
Object.assign(process.env, {
  HOME,
  GIT_CONFIG_GLOBAL: join(HOME, ".gitconfig"),
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
});

const CLI = fileURLToPath(new URL("../../../scripts/lib/finalize/suggest-bump.mjs", import.meta.url));

function g(cwd, ...args) { return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }); }

function initRepo() {
  const d = mkdtempSync(join(tmpdir(), "sb-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", d]);
  return d;
}

function commit(d, msg) {
  writeFileSync(join(d, "f.txt"), msg + "\n");
  g(d, "add", "-A");
  g(d, "commit", "-m", msg);
}

function cli(cwd, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { stdout: r.stdout, stderr: r.stderr };
}

test("pós-merge (HEAD == origin/main) ainda deriva do último release", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "v1.0.0");
  commit(d, "feat: capacidade nova");

  // Reproduz o estado pós-Step-4: merge + git pull deixam a main sincronizada.
  const bare = mkdtempSync(join(tmpdir(), "sb-bare-"));
  execFileSync("git", ["init", "-q", "--bare", bare]);
  g(d, "remote", "add", "origin", bare);
  g(d, "push", "-q", "origin", "main");

  assert.equal(
    g(d, "rev-parse", "HEAD").trim(),
    g(d, "rev-parse", "origin/main").trim(),
    "fixture inválida: HEAD precisa ser == origin/main"
  );
  assert.equal(
    g(d, "log", "--oneline", "origin/main..HEAD").trim(),
    "",
    "fixture inválida: o range antigo precisa estar vazio"
  );

  assert.equal(cli(d).stdout, "minor"); // com o default antigo daria "patch"
});

test("tag não-release no caminho não trunca o range", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "v1.0.0");
  commit(d, "feat: capacidade nova");
  g(d, "tag", "cli-v3.2.0");
  commit(d, "fix: ajuste");

  assert.deepEqual(resolveBase(d), { base: "v1.0.0", source: "tag" });
  assert.equal(cli(d).stdout, "minor"); // com describe nu daria "patch"
});

test("repo sem tag alguma → fallback origin/main, sem lançar", () => {
  const d = initRepo();
  commit(d, "feat: inicial");

  assert.doesNotThrow(() => resolveBase(d));
  assert.deepEqual(resolveBase(d), { base: "origin/main", source: "fallback" });
  assert.equal(cli(d).stdout, "patch");
});

test("tag sem prefixo v resolve pelo tier 2", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "1.0.0");
  commit(d, "feat: capacidade nova");

  assert.deepEqual(resolveBase(d), { base: "1.0.0", source: "tag" });
  assert.equal(cli(d).stdout, "minor");
});

test("base explícita em argv[0] vence a resolução automática", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "v1.0.0");
  commit(d, "feat: capacidade nova");
  g(d, "tag", "v2.0.0");
  commit(d, "fix: ajuste");

  assert.equal(cli(d).stdout, "patch");             // auto → v2.0.0..HEAD = só o fix
  assert.equal(cli(d, "v1.0.0").stdout, "minor");   // explícito → inclui o feat
});

test("emite procedência no stderr sem poluir o stdout", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "v1.0.0");
  commit(d, "feat: capacidade nova");

  const r = cli(d);
  assert.equal(r.stdout, "minor", "stdout precisa ser só o bump");
  assert.match(r.stderr, /^suggest-bump: base=v1\.0\.0 \(source=tag, 1 commits\)\n$/);
});
