// tests/lib/test-standards-git.mjs — git do gate de standards: idioma fixo, tempo limitado e
// falha fechada (T18; herdado das revisões da T7 e da T14). O executor é injetado onde o caso
// (timeout, ENOBUFS, mensagem traduzida) não dá para provocar com um git de verdade.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  gitRun, gitEnv, GIT_TIMEOUT_MS, resolveMergeBase, materializeBlobs, UsageError, NOT_ANCESTOR, DEFAULT_BASE_REF,
} from "../../scripts/lib/standards-git.mjs";
import { baselineAtRef, runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import { compareRatchet, baselineAtBase } from "../../scripts/lib/standards-ratchet.mjs";
import { resolveBaseline } from "../../scripts/lib/standards-engine.mjs";
import { BaselineError, baselinePath } from "../../scripts/lib/standards-baseline.mjs";
import { renderHookResult } from "../../scripts/lib/standards-hook-cli.mjs";
import { demoProject as rawDemoProject } from "../helpers/standards-fixture.mjs";

const TEMPS = [];
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });
const demoProject = (o) => { const r = rawDemoProject(o); TEMPS.push(r); return r; };
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
const human = (root, ...a) => runStandardsCommand("baseline", a, root, { isInteractive: () => true });

// Repositório com baseline commitado na main e a branch feat em cima.
async function repo({ withBaseline = true } = {}) {
  const root = demoProject();
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  git(root, "add", "-A");
  if (withBaseline) assert.equal(await human(root, "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  git(root, "checkout", "-q", "-b", "feat");
  return root;
}

// Executor que delega ao git real, menos nas chamadas que `match` reconhece.
const failing = (match, result) => {
  const seen = [];
  const run = (root, args, opts) => {
    seen.push(args);
    return match(args) ? { status: null, stdout: "", stderr: "", error: null, signal: null, ...result } : gitRun(root, args, opts);
  };
  run.seen = seen;
  return run;
};
const MAIN = "refs/heads/main"; // sob ci a base vai pelo nome completo
const TIMEOUT = { error: Object.assign(new Error("spawnSync git ETIMEDOUT"), { code: "ETIMEDOUT" }), signal: "SIGKILL" };
const ENOBUFS = { error: Object.assign(new Error("spawnSync git ENOBUFS"), { code: "ENOBUFS" }) };

test("gitRun fixa o idioma (LC_ALL=C, LANGUAGE vazio) e limita o tempo em 5s", async () => {
  assert.equal(GIT_TIMEOUT_MS, 5000);
  const e = gitEnv({ LC_ALL: "pt_BR.UTF-8", LANGUAGE: "pt_BR:pt", LANG: "pt_BR.UTF-8", X: "1" });
  assert.equal(e.LC_ALL, "C");
  assert.equal(e.LANGUAGE, "");
  assert.equal(e.GIT_NO_REPLACE_OBJECTS, "1", "refs/replace não troca o que o gate lê");
  assert.equal(e.X, "1");
  assert.equal(DEFAULT_BASE_REF, "refs/remotes/origin/main");
  const root = await repo();
  const saved = { LC_ALL: process.env.LC_ALL, LANGUAGE: process.env.LANGUAGE };
  process.env.LC_ALL = "pt_BR.UTF-8"; process.env.LANGUAGE = "pt_BR";
  try {
    // O alias com "!" roda no ambiente que o git recebeu.
    const r = gitRun(root, ["-c", "alias.amb=!printf '%s|%s|' \"$LC_ALL\" \"$LANGUAGE\"", "amb"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "C||");
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("gitRun: estouro do tempo devolve erro ETIMEDOUT, não trava nem lança", async () => {
  const root = await repo();
  const t0 = Date.now();
  const r = gitRun(root, ["-c", "alias.dorme=!exec sleep 2", "dorme"], { timeout: 150 });
  assert.equal(r.error?.code, "ETIMEDOUT");
  assert.notEqual(r.status, 0);
  assert.ok(Date.now() - t0 < 1900, "não esperou o processo terminar");
});

test("resolveMergeBase: ref com '-' ou vazio → UsageError; ref desconhecido → sem merge-base", async () => {
  const root = await repo();
  for (const ref of ["--independent", "-h", "", null, undefined]) {
    assert.throws(() => resolveMergeBase(root, ref), UsageError, String(ref));
  }
  assert.equal(resolveMergeBase(root, "nao-existe").mb, "");
  assert.match(resolveMergeBase(root, "main").mb, /^[0-9a-f]{40,64}$/);
});

// ── Rodada de correção 1: base sem ambiguidade (C1) e ancestral do HEAD (I1) ───────────

test("resolveMergeBase sob ci: nome curto só em refs/remotes/, e homônimo em tags ou branches é ambíguo (C1)", async () => {
  const root = await repo();
  const main = git(root, "rev-parse", "refs/heads/main").trim();
  const strict = (ref) => resolveMergeBase(root, ref, { ci: true });
  // Sem refs/remotes/main: o nome curto não cai para a branch local nem para tag.
  assert.match(strict("main").why, /ambíguo: também existe refs\/heads\/main/);
  assert.equal(strict("nao-existe").mb, "");
  assert.match(strict("nao-existe").why, /refs\/remotes\/nao-existe não existe/);
  // Com o remoto de mesmo nome e sem homônimo, resolve — sempre o remoto.
  git(root, "update-ref", "refs/remotes/origin/main", main);
  assert.equal(strict("origin/main").mb, main);
  // Tag homônima apontando para a branch (o ataque): o rev-parse do git escolheria a TAG.
  git(root, "commit", "-q", "--allow-empty", "-m", "na branch");
  git(root, "tag", "origin/main", "HEAD");
  assert.equal(gitRun(root, ["rev-parse", "origin/main"]).stdout.trim(), git(root, "rev-parse", "HEAD").trim(), "pré-condição: o git resolve a tag");
  const amb = strict("origin/main");
  assert.equal(amb.mb, "");
  assert.match(amb.why, /ambíguo: também existe refs\/tags\/origin\/main; use o nome completo \(refs\/remotes\/origin\/main\)/);
  assert.equal(strict("refs/remotes/origin/main").mb, main, "o nome completo não é afetado pela tag");
  assert.equal(strict("refs/tags/origin/main").mb, git(root, "rev-parse", "HEAD").trim(), "quem pede a tag pelo nome completo recebe a tag");
  git(root, "tag", "-d", "origin/main");
  git(root, "branch", "origin/main", "HEAD");
  assert.match(strict("origin/main").why, /ambíguo: também existe refs\/heads\/origin\/main/);
  // SHA completo vale; abreviado, expressão de revisão e nome inválido, não.
  assert.equal(strict(main).mb, main);
  for (const ref of [main.slice(0, 10), "refs/heads/main~0", "refs/heads/main^{commit}", "HEAD", "refs/heads/..", "refs/heads/a b", "@{u}", "refs/heads/*"]) {
    assert.equal(strict(ref).mb, "", ref);
  }
  // Sem ci, o comportamento de sempre.
  assert.equal(resolveMergeBase(root, "main").mb, main);
});

test("resolveMergeBase sob ci: a base tem de ser ancestral do HEAD (I1)", async () => {
  const root = await repo();
  const base0 = git(root, "rev-parse", "refs/heads/main").trim();
  // A main anda depois que a branch saiu: a ponta da main deixa de ser ancestral do HEAD.
  git(root, "checkout", "-q", "main"); git(root, "commit", "-q", "--allow-empty", "-m", "main anda"); git(root, "checkout", "-q", "feat");
  const stale = resolveMergeBase(root, MAIN, { ci: true });
  assert.equal(stale.mb, "");
  assert.equal(stale.why, NOT_ANCESTOR);
  assert.match(NOT_ANCESTOR, /a base não é ancestral do HEAD; rode o gate sobre o merge do PR/);
  assert.equal(resolveMergeBase(root, MAIN).mb, base0, "sem ci vale o merge-base");
  assert.throws(() => baselineAtRef(root, MAIN, { ci: true }), /a base não é ancestral do HEAD/);
  await assert.rejects(compareRatchet(root, MAIN, { ci: true }), /a base não é ancestral do HEAD; rode o gate sobre o merge do PR/);
  // No merge, a ponta da main volta a ser ancestral.
  git(root, "merge", "-q", "--no-ff", "-m", "merge", "main");
  assert.equal(resolveMergeBase(root, MAIN, { ci: true }).mb, git(root, "rev-parse", "refs/heads/main").trim());
  // Erro do git no teste de ancestralidade não vira "é ancestral".
  const err = resolveMergeBase(root, MAIN, { ci: true, run: failing((a) => a.includes("--is-ancestor"), { status: 128, stderr: "fatal: x\n" }) });
  assert.equal(err.mb, "");
});

// ── Rodada de correção 1: blobs pelos bytes do objeto, sem atributos (I2) ─────────────

test("materializeBlobs grava os bytes do blob: sem eol, sem working-tree-encoding, binário intacto", async () => {
  const root = await repo();
  const bin = Buffer.from([0x00, 0xff, 0xfe, 0x0d, 0x0a, 0x80, 0x0a]);
  writeFileSync(join(root, "src/a.txt"), "linha\n");
  writeFileSync(join(root, "src/bin.dat"), bin);
  mkdirSync(join(root, "src/sub/fundo"), { recursive: true });
  writeFileSync(join(root, "src/sub/fundo/x.xml"), "<a>BAD</a>\n");
  git(root, "add", "-A");
  // Os atributos chegam DEPOIS dos blobs: o checkout converteria, o blob não muda.
  writeFileSync(join(root, ".gitattributes"), "src/a.txt text eol=crlf\nsrc/sub/fundo/x.xml working-tree-encoding=UTF-16\n");
  git(root, "add", ".gitattributes"); git(root, "commit", "-qm", "blobs");
  const entries = gitRun(root, ["ls-tree", "-r", "-l", "-z", "HEAD", "--", "src"]).stdout.split("\0").filter(Boolean).map(rec => {
    const [meta, rel] = rec.split("\t"); const [, , sha, size] = meta.split(/ +/);
    return { sha, rel, size: Number(size) };
  });
  const dest = mkdtempSync(join(tmpdir(), "mat-")); TEMPS.push(dest);
  materializeBlobs(root, entries, dest);
  assert.equal(readFileSync(join(dest, "src/a.txt"), "utf8"), "linha\n");
  assert.deepEqual(readFileSync(join(dest, "src/bin.dat")), bin);
  assert.equal(readFileSync(join(dest, "src/sub/fundo/x.xml"), "utf8"), "<a>BAD</a>\n");
  assert.ok(entries.length >= 4);
  // Blob "grande" (acima do lote): vai direto do git para o arquivo, com os mesmos bytes.
  const big = mkdtempSync(join(tmpdir(), "mat-")); TEMPS.push(big);
  materializeBlobs(root, entries.map(e => ({ ...e, size: 64 * 1024 * 1024 })), big);
  assert.deepEqual(readFileSync(join(big, "src/bin.dat")), bin);
  // Sem `size`, vai pelo lote.
  const nosize = mkdtempSync(join(tmpdir(), "mat-")); TEMPS.push(nosize);
  materializeBlobs(root, entries.map(({ sha, rel }) => ({ sha, rel })), nosize);
  assert.deepEqual(readFileSync(join(nosize, "src/bin.dat")), bin);
});

test("materializeBlobs recusa caminho inseguro, objeto ausente e arquivo que já existe; erro do git lança", async () => {
  const root = await repo();
  const sha = git(root, "rev-parse", "HEAD:src/old.js").trim();
  const fresh = () => { const d = mkdtempSync(join(tmpdir(), "mat-")); TEMPS.push(d); return d; };
  for (const rel of ["../fora.js", "a/../../fora.js", ".git/config", "a/.GIT/x", "/abs.js", "a//b.js", "a/./b.js", "a\\b.js", "", "a/\0b"]) {
    const d = fresh();
    assert.throws(() => materializeBlobs(root, [{ sha, rel }], d), /inseguro|fora do destino/, JSON.stringify(rel));
    assert.deepEqual(readdirSync(d), [], JSON.stringify(rel));
  }
  assert.throws(() => materializeBlobs(root, [{ sha: "0".repeat(40), rel: "x.js" }], fresh()), /ausente|falhou/);
  const tree = git(root, "rev-parse", "HEAD^{tree}").trim();
  assert.throws(() => materializeBlobs(root, [{ sha: tree, rel: "x.js" }], fresh()), /não é blob|falhou/);
  const twice = fresh();
  materializeBlobs(root, [{ sha, rel: "x.js" }], twice);
  assert.throws(() => materializeBlobs(root, [{ sha, rel: "x.js" }], twice), /EEXIST/);
  assert.throws(() => materializeBlobs(root, [{ sha, rel: "x.js" }], fresh(), { run: failing(() => true, TIMEOUT) }), /falhou \(ETIMEDOUT\)/);
  materializeBlobs(root, [], fresh()); // lista vazia: nada a fazer
});

test("baselineAtRef: timeout ou erro do git → lança sob ci; local usa o baseline atual com nota", async () => {
  const root = await repo();
  for (const [what, match] of [
    ["cat-file", (a) => a[0] === "cat-file"],
    ["ls-tree", (a) => a[0] === "ls-tree"],
    ["merge-base", (a) => a[0] === "merge-base"],
    ["rev-parse", (a) => a[0] === "rev-parse" && a.includes("--verify")],
  ]) {
    assert.throws(() => baselineAtRef(root, MAIN, { ci: true, run: failing(match, TIMEOUT) }), /fail-closed|falhou/, what);
    const local = baselineAtRef(root, "main", { ci: false, run: failing(match, TIMEOUT) });
    assert.ok(local.baseline, what);
    assert.match(local.note, /usando o (baseline )?atual/, what);
  }
  // Sob ci a base é resolvida pelo nome exato: essas duas chamadas também falham fechado.
  for (const sub of ["check-ref-format", "for-each-ref"]) {
    assert.throws(() => baselineAtRef(root, MAIN, { ci: true, run: failing((a) => a[0] === sub, TIMEOUT) }), /fail-closed/, sub);
  }
  // Sem falha injetada, o baseline vem do merge-base.
  assert.match(baselineAtRef(root, MAIN, { ci: true }).note, /baseline do merge-base/);
});

test("baselineAtRef: mensagem de ausência que não é a do git em inglês NÃO vira adoção sob ci", async () => {
  const root = await repo({ withBaseline: false });
  await human(root, "init");
  const pt = { status: 128, stderr: "fatal: o caminho '.context/engineering/standards/baseline.json' não existe em 'abc'\n" };
  assert.throws(() => baselineAtRef(root, MAIN, { ci: true, run: failing((a) => a[0] === "cat-file", pt) }), /fail-closed|falhou/);
  // Com o git real (LC_ALL=C imposto pelo gitRun), a ausência é confirmada e vira adoção.
  assert.match(baselineAtRef(root, MAIN, { ci: true }).note, /adoção/);
});

test("compareRatchet: timeout do git → lança (exit 3 no CLI); sem merge-base, só o modo local vira nota", async () => {
  const root = await repo();
  for (const match of [(a) => a[0] === "ls-tree", (a) => a[0] === "cat-file", (a) => a[0] === "hash-object", (a) => a[0] === "rev-parse" && a.includes("--show-prefix"),
    (a) => a[0] === "rev-list"]) {
    await assert.rejects(compareRatchet(root, MAIN, { ci: true, run: failing(match, TIMEOUT) }), /fail-closed|falhou/);
  }
  await assert.rejects(compareRatchet(root, MAIN, { ci: true, run: failing((a) => a[0] === "merge-base", TIMEOUT) }), /merge-base/);
  const local = await compareRatchet(root, "main", { ci: false, run: failing((a) => a[0] === "merge-base", TIMEOUT) });
  assert.deepEqual(local.violations, []);
  assert.match(local.notices.join("\n"), /sem merge-base/);
  assert.equal(local.mergeBase, "");
});

test("compareRatchet: toda chamada git passa pelo executor injetado e a árvore limpa não tem violação", async () => {
  const root = await repo();
  const run = failing(() => false, {});
  const r = await compareRatchet(root, MAIN, { ci: true, run });
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.items, []);
  assert.match(r.mergeBase, /^[0-9a-f]{40,64}$/);
  assert.equal(r.codeownersText, null);
  assert.ok(run.seen.length >= 5, `chamadas: ${run.seen.length}`);
  // O que o gate precisa para o check e para o override: os blobs do HEAD, o commit e os caminhos da catraca.
  assert.ok(r.headBlobs.some(e => e.rel === "src/old.js" && /^[0-9a-f]{40,64}$/.test(e.sha)));
  assert.deepEqual(r.headShas, [git(root, "rev-parse", "HEAD").trim()]);
  assert.deepEqual(r.changedRatchetFiles, [], "a branch não alterou nenhum arquivo da catraca");
  assert.deepEqual(r.baselineIncreases, []);
});

// Rodada 3 da T18 (E1 saiu): o segundo pai vale como head do PR com DUAS condições — o HEAD tem
// exatamente dois pais e o primeiro é a base resolvida. A conferência da árvore por
// `git merge-tree --write-tree` dava falsa recusa (git < 2.38, timeout, `.gitattributes -merge`).
test("compareRatchet: headShas = o HEAD e, no merge de dois pais com a base, o segundo pai — sem `git merge-tree`", async () => {
  const root = await repo();
  git(root, "commit", "-q", "--allow-empty", "-m", "na branch");
  const tip = git(root, "rev-parse", "HEAD").trim();
  assert.deepEqual((await compareRatchet(root, MAIN, { ci: true })).headShas, [tip], "na ponta do PR: só o HEAD");
  git(root, "checkout", "-q", "--detach", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "merge", tip);
  const head = git(root, "rev-parse", "HEAD").trim();
  const run = failing(() => false, {});
  assert.deepEqual((await compareRatchet(root, MAIN, { ci: true, run })).headShas, [head, tip], "merge da base com o PR: o segundo pai vale");
  assert.deepEqual(run.seen.filter(a => a[0] === "merge-tree"), [], "o gate não chama git merge-tree");
  // Um git que não tem `merge-tree --write-tree` (anterior ao 2.38), ou em que ele estoura o tempo, não muda nada.
  for (const result of [{ status: 129, stderr: "usage: git merge-tree <base-tree> <branch1> <branch2>" }, TIMEOUT]) {
    const old = await compareRatchet(root, MAIN, { ci: true, run: failing((a) => a[0] === "merge-tree", result) });
    assert.deepEqual(old.headShas, [head, tip]);
  }
  // Três pais: o segundo não vale.
  const tree = git(root, "rev-parse", "HEAD^{tree}").trim();
  const main = git(root, "rev-parse", "main").trim();
  const commitTree = (...parents) => git(root, "commit-tree", tree, ...parents.flatMap(p => ["-p", p]), "-m", "x").trim();
  const three = commitTree(main, tip, commitTree(main));
  git(root, "checkout", "-q", "--detach", three);
  assert.deepEqual((await compareRatchet(root, MAIN, { ci: true })).headShas, [three], "três pais: só o HEAD");
  // Primeiro pai que não é a base resolvida: o segundo também não vale.
  const swapped = commitTree(tip, main);
  git(root, "checkout", "-q", "--detach", swapped);
  assert.deepEqual((await compareRatchet(root, MAIN, { ci: true })).headShas, [swapped], "primeiro pai ≠ base: só o HEAD");
});

test("compareRatchet: CODEOWNERS da base com 3 MB ou mais é tratado como ausente, com nota", async () => {
  const root = demoProject();
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  mkdirSync(join(root, ".github"), { recursive: true });
  const rule = "/.context/ @dona\n";
  const sized = (n) => `${rule}#${"x".repeat(n - rule.length - 2)}\n`;
  writeFileSync(join(root, ".github/CODEOWNERS"), sized(2_999_999));
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  git(root, "checkout", "-q", "-b", "feat");
  const under = await compareRatchet(root, MAIN, { ci: true });
  assert.equal(under.codeownersText.length, 2_999_999);
  assert.doesNotMatch(under.notices.join("\n"), /3 MB/);
  // A base cresce para 3 MB exatos; e para além dos 4 MiB que o gate lê de um arquivo de texto.
  for (const n of [3_000_000, 5_000_000]) {
    git(root, "checkout", "-q", "main");
    writeFileSync(join(root, ".github/CODEOWNERS"), sized(n));
    git(root, "add", "-A"); git(root, "commit", "-qm", `CODEOWNERS com ${n} bytes`);
    git(root, "checkout", "-q", "-B", "feat", "main");
    const big = await compareRatchet(root, MAIN, { ci: true });
    assert.equal(big.codeownersText, null, String(n));
    assert.match(big.notices.join("\n"), /CODEOWNERS da base .*3 MB/, String(n));
    assert.deepEqual(big.violations, []);
  }
});

// Submódulo (gitlink 160000) é opaco como um link: o git da base não guarda o que havia atrás.
test("submódulo na base no caminho da catraca → violação; no caminho do baseline → não é adoção", async () => {
  const root = demoProject();
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  git(root, "add", "-A"); git(root, "commit", "-qm", "c0");
  const sha = git(root, "rev-parse", "HEAD").trim();
  git(root, "update-index", "--add", "--cacheinfo", `160000,${sha},.context/standards`);
  git(root, "commit", "-qm", "base com submódulo em .context/standards");
  git(root, "checkout", "-q", "-b", "feat");
  git(root, "rm", "-q", "--cached", ".context/standards");
  mkdirSync(join(root, ".context/standards"));
  writeFileSync(join(root, ".context/standards/std-outro.md"), "---\nid: std-outro\nsource: local\ndescription: x\napplyTo: [\"src/**\"]\n---\n");
  git(root, "add", "-A"); git(root, "commit", "-qm", "troca o submódulo por diretório real");
  const r = await compareRatchet(root, MAIN, { ci: true });
  assert.match(r.violations.join("\n"), /a base [0-9a-f]{8} tinha submódulo no caminho da catraca \(\.context\/standards\)/);
  assert.equal(r.items.find(v => /tinha submódulo/.test(v.text)).kind, "link");

  const other = demoProject();
  git(other, "init", "-q", "-b", "main"); git(other, "config", "user.email", "t@t"); git(other, "config", "user.name", "t");
  writeFileSync(join(other, "src/old.js"), "BAD\n");
  git(other, "add", "src"); git(other, "commit", "-qm", "c0");
  const sha2 = git(other, "rev-parse", "HEAD").trim();
  git(other, "update-index", "--add", "--cacheinfo", `160000,${sha2},.context/engineering/standards`);
  git(other, "commit", "-qm", "base com submódulo no diretório de standards");
  const mb = git(other, "rev-parse", "HEAD").trim();
  const b = baselineAtBase(other, mb);
  assert.equal(b.state, "symlink");
  assert.equal(b.what, "submódulo");
  assert.equal(b.component, ".context/engineering/standards");
  assert.throws(() => baselineAtRef(other, MAIN, { ci: true }), /submódulo no caminho do baseline na base/);
});

// I6: o aprovador do override tem de ser dono dos arquivos da catraca que o PR ALTEROU.
test("compareRatchet: changedRatchetFiles lista o que o PR alterou na catraca — com removidos, renomeados e o prefixo do projeto", async () => {
  const S = ".context/engineering/standards";
  const setup = (root) => {
    writeFileSync(join(root, S, "machine/helper.js"), "module.exports = 1;\n");
    writeFileSync(join(root, S, "machine/vai-mudar-de-nome.js"), "module.exports = 2;\n");
    mkdirSync(join(root, ".context/bin"), { recursive: true });
    writeFileSync(join(root, ".context/bin/devflow-standards.mjs"), "// shim v1\n");
    writeFileSync(join(root, ".context/.devflow.yaml"), "git:\n  strategy: branch-flow\n");
    mkdirSync(join(root, ".context/docs"), { recursive: true });
    writeFileSync(join(root, ".context/docs/nota.md"), "x\n");
  };
  const change = (root, gitRoot = root) => {
    writeFileSync(join(root, S, "std-demo.md"), readFileSync(join(root, S, "std-demo.md"), "utf8").replace("level: block", "level: warn"));
    rmSync(join(root, S, "machine/helper.js"));                                              // removido
    mkdirSync(join(root, ".context/standards/machine"), { recursive: true });
    git(root, "mv", `${S}/machine/vai-mudar-de-nome.js`, ".context/standards/machine/novo-nome.js"); // renomeado
    writeFileSync(join(root, ".context/standards.local.yaml"), readFileSync(join(root, ".context/standards.local.yaml"), "utf8") + "# x\n");
    writeFileSync(join(root, ".context/.devflow.yaml"), "git:\n  strategy: trunk\n");
    writeFileSync(join(root, ".context/bin/devflow-standards.mjs"), "// shim v2\n");
    mkdirSync(join(root, ".context/engineering/node_modules/dep"), { recursive: true });
    writeFileSync(join(root, ".context/engineering/node_modules/dep/index.js"), "module.exports = 3;\n");
    // Fora da catraca: não entram.
    writeFileSync(join(root, "src/novo.js"), "ok\n");
    writeFileSync(join(root, ".context/docs/nota.md"), "y\n");
    git(gitRoot, "add", "-A"); git(gitRoot, "commit", "-qm", "muda a catraca");
  };
  const expected = [
    ".context/.devflow.yaml", ".context/bin/devflow-standards.mjs", ".context/engineering/node_modules/dep/index.js",
    `${S}/machine/helper.js`, `${S}/machine/vai-mudar-de-nome.js`, `${S}/std-demo.md`,
    ".context/standards.local.yaml", ".context/standards/machine/novo-nome.js",
  ].sort();

  const root = demoProject();
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  setup(root);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base"); git(root, "checkout", "-q", "-b", "feat");
  change(root);
  const r = await compareRatchet(root, MAIN, { ci: true });
  assert.deepEqual([...r.changedRatchetFiles].sort(), expected);

  // Projeto num subdiretório do repositório: os caminhos vêm relativos à raiz do REPOSITÓRIO
  // (é assim que o CODEOWNERS os descreve), e o que muda fora do projeto não entra.
  const mono = mkdtempSync(join(tmpdir(), "mono-")); TEMPS.push(mono);
  const proj = join(mono, "apps/web");
  mkdirSync(join(mono, "apps"), { recursive: true });
  git(mono, "init", "-q", "-b", "main"); git(mono, "config", "user.email", "t@t"); git(mono, "config", "user.name", "t");
  execFileSync("cp", ["-r", demoProject(), proj]);
  setup(proj);
  mkdirSync(join(mono, ".context"), { recursive: true });
  writeFileSync(join(mono, ".context/.devflow.yaml"), "git:\n  strategy: branch-flow\n");
  git(mono, "add", "-A"); git(mono, "commit", "-qm", "base"); git(mono, "checkout", "-q", "-b", "feat");
  writeFileSync(join(mono, ".context/.devflow.yaml"), "git:\n  strategy: trunk\n"); // de OUTRO projeto (a raiz)
  change(proj, mono);
  const m = await compareRatchet(proj, MAIN, { ci: true });
  assert.deepEqual([...m.changedRatchetFiles].sort(), expected.map(p => `apps/web/${p}`).sort());
});

test("resolveBaseline: timeout ou ENOBUFS do git show do HEAD → BaselineError, não 'nenhum'", async () => {
  const root = await repo();
  rmSync(baselinePath(root)); // some da árvore; o HEAD ainda tem
  assert.match(resolveBaseline(root).source, /HEAD/);
  for (const fail of [TIMEOUT, ENOBUFS]) {
    assert.throws(() => resolveBaseline(root, { run: failing((a) => a[0] === "show", fail) }), (e) => {
      assert.ok(e instanceof BaselineError, e?.constructor?.name);
      assert.match(e.message, new RegExp(fail.error.code));
      return true;
    });
  }
  // Teto pequeno com o git real: o blob do HEAD não cabe.
  assert.throws(() => resolveBaseline(root, { maxBytes: 16 }), (e) => e instanceof BaselineError && /ENOBUFS/.test(e.message));
});

test("resolveBaseline: sem git, sem HEAD ou baseline não versionado continua 'nenhum'", async () => {
  const plain = demoProject(); // nem é repositório
  assert.deepEqual(resolveBaseline(plain), { baseline: null, source: "nenhum" });
  const noGit = failing(() => true, { error: Object.assign(new Error("spawnSync git ENOENT"), { code: "ENOENT" }) });
  assert.deepEqual(resolveBaseline(plain, { run: noGit }), { baseline: null, source: "nenhum" });
  const root = await repo({ withBaseline: false });
  assert.deepEqual(resolveBaseline(root), { baseline: null, source: "nenhum" });
});

test("hook: baseline ilegível + violação block não sugere `baseline init`", () => {
  const f = { stdId: "std-demo", ruleId: "no-bad", path: "src/a.js", line: 2, message: "remova BAD", fp: "x" };
  const r = { blocking: [f], warnings: [], review: [], baselined: [], errors: [], hasBaseline: false, baselineError: "baseline inválido (HEAD:x): git show falhou (ETIMEDOUT)" };
  const out = renderHookResult(r, { mode: "sync", cmd: "node x/devflow-standards.mjs" });
  assert.equal(out.decision, undefined);
  assert.match(out.context, /ETIMEDOUT/);
  assert.match(out.context, /src\/a\.js:2/);
  assert.doesNotMatch(out.context, /baseline init/);
});
