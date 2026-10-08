// Integração do CLI de standards: check|baseline|enforce|explain (ADR-015, T7).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, rmSync, mkdtempSync, symlinkSync, readdirSync, renameSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStandardsCommand, pluginCmd } from "../../scripts/lib/standards-check-cli.mjs";
import { demoProject as rawDemoProject, LINT_BAD } from "../helpers/standards-fixture.mjs";
import { resolveBaseline } from "../../scripts/lib/standards-engine.mjs";

const CLI = join(process.cwd(), "scripts/devflow-standards.mjs");
const TEMPS = [];
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TEMPS.push(d); return d; };
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });
const demoProject = (o) => { const r = rawDemoProject(o); TEMPS.push(r); return r; };

const run = (root, ...a) => spawnSync("node", [CLI, ...a, `--project=${root}`], { encoding: "utf8", env: { ...process.env, CI: "" } });
const runEnv = (root, env, ...a) => spawnSync("node", [CLI, ...a, `--project=${root}`], { encoding: "utf8", env: { ...process.env, CI: "", ...env } });
const human = (root, sub, ...args) => runStandardsCommand(sub, args, root, { isInteractive: () => true });
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
const BL = (root) => join(root, ".context/engineering/standards/baseline.json");
const FP0 = "a".repeat(40);
const LINTER = (root) => join(root, ".context/engineering/standards/machine/std-demo.js");

// Captura o console.error durante uma chamada in-process.
async function captureErr(fn) {
  const lines = [];
  const orig = console.error;
  console.error = (...m) => lines.push(m.map(String).join(" "));
  try { return { code: await fn(), err: lines.join("\n") }; } finally { console.error = orig; }
}

function repo() {
  const root = demoProject();
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  git(root, "add", "-A");
  return root;
}

test("check --all sem baseline → exit 1 e sugere baseline init", () => {
  const r = run(repo(), "check", "--all");
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /baseline init/);
});

test("mensagens citam o comando real do plugin, nunca um binário 'devflow standards'", () => {
  assert.match(pluginCmd(), /^node ".*\/scripts\/devflow-standards\.mjs"$/);
  const r = run(repo(), "check", "--all");
  assert.ok((r.stdout + r.stderr).includes(pluginCmd()));
  assert.doesNotMatch(r.stdout + r.stderr, /devflow standards /);
});

test("check sem seleção de arquivos → uso incorreto (exit 2)", () => {
  const r = run(repo(), "check");
  assert.equal(r.status, 2);
});

// Minor 4 da revisão final: saía 0 com "✓" sem ter olhado nada.
test("check <caminho inexistente> → uso incorreto (exit 2), dizendo qual caminho", () => {
  const root = repo();
  // Fora do applyTo de qualquer standard: nenhum linter roda, e o "✓" saía sem nada ter sido visto.
  const none = run(root, "check", "docs/nao-existe.md");
  assert.equal(none.status, 2, none.stdout + none.stderr);
  assert.match(none.stderr, /caminho não encontrado: "docs\/nao-existe\.md"/);
  assert.doesNotMatch(none.stdout + none.stderr, /✓/);
  // Coberto por um standard: também é uso incorreto, não erro de linter.
  const r = run(root, "check", "src/nao-existe.js");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /caminho não encontrado: "src\/nao-existe\.js"/);
  assert.doesNotMatch(r.stdout + r.stderr, /✓/);
  // Um que existe e um que não: recusa do mesmo jeito, apontando o que falta.
  const m = run(root, "check", "src/old.js", "src/sumiu.js");
  assert.equal(m.status, 2, m.stdout + m.stderr);
  assert.match(m.stderr, /"src\/sumiu\.js"/);
  assert.doesNotMatch(m.stderr, /"src\/old\.js"/);
  // Absoluto inexistente e componente que não é diretório.
  assert.equal(run(root, "check", join(root, "src/nada.js")).status, 2);
  assert.equal(run(root, "check", "src/old.js/x.js").status, 2);
  // Nome com caractere de controle não chega cru ao terminal.
  const c = run(root, "check", "src/a\x1b[31m.js");
  assert.equal(c.status, 2);
  assert.doesNotMatch(c.stderr, /\x1b/);
  // Caminho que existe segue como antes (aqui: violação sem baseline → 1).
  assert.equal(run(root, "check", "src/old.js").status, 1);
});

test("arquivo apagado que aparece em --all ou --staged não é uso incorreto", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  rmSync(join(root, "src/old.js")); // rastreado, apagado da árvore
  const all = run(root, "check", "--all");
  assert.equal(all.status, 0, all.stdout + all.stderr);
  git(root, "add", "-A"); // a remoção vai para o índice
  const staged = run(root, "check", "--staged");
  assert.equal(staged.status, 0, staged.stdout + staged.stderr);
});

test("baseline init sem terminal interativo → recusado (exit 2)", () => {
  const r = run(repo(), "baseline", "init");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /terminal interativo/);
});

test("baseline init pelo operador → check --all verde; segundo init recusado", async () => {
  const root = repo();
  assert.equal(await human(root, "baseline", "init"), 0);
  assert.ok(existsSync(BL(root)));
  assert.equal(run(root, "check", "--all").status, 0);
  assert.equal(await human(root, "baseline", "init"), 2);
});

test("C15: baseline removido da árvore mas versionado no HEAD → init recusado (exit 2)", async () => {
  const root = repo();
  assert.equal(await human(root, "baseline", "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  rmSync(BL(root));
  const { code, err } = await captureErr(() => human(root, "baseline", "init"));
  assert.equal(code, 2);
  assert.match(err, /HEAD/);
  assert.ok(!existsSync(BL(root)), "não pode regravar o baseline");
});

test("violação nova após o baseline → exit 1 com arquivo:linha e regra", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/new.js"), "ok\nBAD\n");
  git(root, "add", "-A");
  const r = run(root, "check", "--staged");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /src\/new\.js:2/);
  assert.match(r.stdout, /no-bad/);
});

test("--staged lê o índice, não a árvore de trabalho", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  git(root, "add", BL(root)); // --staged compara com o baseline do índice
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  git(root, "add", "src/new.js");
  writeFileSync(join(root, "src/new.js"), "ok\n");
  assert.equal(run(root, "check", "--staged").status, 1);
  git(root, "add", "src/new.js");
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  assert.equal(run(root, "check", "--staged").status, 0);
});

test("--staged: symlink no índice apontando para fora não é materializado nem seguido", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  git(root, "add", BL(root)); // --staged compara com o baseline do índice
  const outside = tmp("fora-");
  writeFileSync(join(outside, "segredo.js"), "BAD\n");
  symlinkSync(join(outside, "segredo.js"), join(root, "src/link.js"));
  git(root, "add", "src/link.js");
  // Na árvore vira arquivo comum limpo: só o índice (modo 120000) aponta para fora.
  rmSync(join(root, "src/link.js"));
  writeFileSync(join(root, "src/link.js"), "ok\n");
  assert.match(git(root, "ls-files", "-s", "src/link.js"), /^120000 /);
  const r = run(root, "check", "--staged");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /link\.js:/);
});

test("--staged apaga o tmp do índice, inclusive quando o linter falha", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  git(root, "add", "-A");
  const td = tmp("tmpdir-");
  assert.equal(runEnv(root, { TMPDIR: td }, "check", "--staged").status, 1);
  assert.deepEqual(readdirSync(td), []);
  writeFileSync(LINTER(root), 'throw new Error("boom")');
  assert.equal(runEnv(root, { TMPDIR: td }, "check", "--staged").status, 3);
  assert.deepEqual(readdirSync(td), []);
});

test("--all inclui arquivo não rastreado", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/untracked.js"), "BAD\n");
  assert.equal(run(root, "check", "--all").status, 1);
});

test("--all ignora arquivo rastreado apagado da árvore e symlink para fora", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/gone.js"), "ok\n");
  git(root, "add", "src/gone.js");
  rmSync(join(root, "src/gone.js"));
  const outside = tmp("fora-");
  writeFileSync(join(outside, "x.js"), "BAD\n");
  symlinkSync(join(outside, "x.js"), join(root, "src/link.js"));
  const r = run(root, "check", "--all");
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("segunda ocorrência no arquivo do baseline → exit 1 com uma violação", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/old.js"), "BAD\nBAD\n");
  const r = run(root, "check", "--all");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /1 violação/);
});

test("prune encolhe sem exigir terminal", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/old.js"), "ok\n");
  assert.equal(run(root, "baseline", "prune").status, 0);
  assert.equal(JSON.parse(readFileSync(BL(root), "utf8")).entries.length, 0);
});

test("accept: sem terminal recusa; sem --reason explica o uso", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  const r = run(root, "baseline", "accept", FP0, "--reason", "x");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /terminal interativo/);
  const a = await captureErr(() => human(root, "baseline", "accept", FP0));
  assert.equal(a.code, 2);
  assert.match(a.err, /uso: .*baseline accept <fp> --reason/);
  const b = await captureErr(() => human(root, "baseline", "accept", FP0, "--reason", "   "));
  assert.equal(b.code, 2);
  assert.match(b.err, /uso: .*baseline accept <fp> --reason/);
});

test("accept: fp desconhecido → exit 2; fp real → aceito com justificativa", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  const u = await captureErr(() => human(root, "baseline", "accept", "f".repeat(40), "--reason", "legado"));
  assert.equal(u.code, 2);
  assert.match(u.err, /não encontrado/);
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  const j = JSON.parse(run(root, "check", "--all", "--json").stdout.split("\n")[0]);
  const fp = j.blocking.find(f => f.path === "src/new.js").fp;
  assert.equal(await human(root, "baseline", "accept", fp, "--reason", "migração pendente"), 0);
  const e = JSON.parse(readFileSync(BL(root), "utf8")).entries.find(x => x.fp === fp);
  assert.equal(e.reason, "migração pendente");
  assert.equal(run(root, "check", "--all").status, 0);
});

test("accept de mais uma ocorrência de impressão digital já aceita registra a justificativa (I-8)", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  const antes = JSON.parse(readFileSync(BL(root), "utf8")).entries;
  assert.equal(antes.length, 1);
  assert.equal("reason" in antes[0], false);
  writeFileSync(join(root, "src/old.js"), "BAD\nBAD\n"); // mesma regra, mesmo arquivo: mesma impressão digital
  const j = JSON.parse(run(root, "check", "--all", "--json").stdout.split("\n")[0]);
  assert.equal(j.blocking.length, 1);
  assert.equal(j.blocking[0].fp, antes[0].fp);
  assert.equal(await human(root, "baseline", "accept", antes[0].fp, "--reason", "segunda ocorrência, migração pendente"), 0);
  const doc = JSON.parse(readFileSync(BL(root), "utf8"));
  assert.equal(doc.version, 1);
  assert.equal(doc.entries.length, 1);
  assert.equal(doc.entries[0].count, 2);
  assert.equal(doc.entries[0].reason, "segunda ocorrência, migração pendente");
  assert.ok(doc.entries[0].acceptedBy);
  assert.equal(run(root, "check", "--all").status, 0);
});

// I-1: linter no formato dos defaults anteriores ao protocolo v2 — UMA linha por arquivo, com a
// contagem na mensagem. A contagem some na normalização da impressão digital, então 1 e 40
// ocorrências no mesmo arquivo têm a mesma impressão digital, com count 1.
const LINT_LEGACY = `const fs=require("fs");const c=fs.readFileSync(process.argv[2],"utf8");
const n=(c.match(/console\\.log/g)||[]).length;
if(n){console.log("VIOLATION: "+n+" uso(s) de console.log em "+process.argv[2]);process.exitCode=1;}`;
const legacyWarnings = (text) => text.split("\n").filter(l => /protocolo legado/.test(l));

function legacyRepo(opts = {}) {
  const root = demoProject({ linterBody: LINT_LEGACY, ...opts });
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, "src/old.js"), "console.log(1);\n");
  writeFileSync(join(root, "src/other.js"), "console.log(1);\n");
  git(root, "add", "-A");
  return root;
}

test("linter em protocolo legado: a catraca conta por arquivo, e o baseline init e o check avisam uma vez por standard", async () => {
  const root = legacyRepo();
  const init = await captureErr(() => human(root, "baseline", "init"));
  assert.equal(init.code, 0, init.err);
  assert.equal(legacyWarnings(init.err).length, 1, init.err);
  assert.match(legacyWarnings(init.err)[0], /std-demo/);
  assert.match(legacyWarnings(init.err)[0], /por arquivo/);
  const entries = JSON.parse(readFileSync(BL(root), "utf8")).entries;
  assert.deepEqual(entries.map(e => [e.path, e.count]).sort(), [["src/old.js", 1], ["src/other.js", 1]]);

  // Comportamento atual, fixado: 1 ocorrência aceita, o arquivo passa a ter 4, nenhuma bloqueia.
  writeFileSync(join(root, "src/old.js"), "console.log(1);\n".repeat(4));
  const r = run(root, "check", "--all", "--json");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout.split("\n")[0]);
  assert.equal(j.blocking.length, 0);
  assert.equal(j.baselined.length, 2);
  assert.ok(j.baselined.every(f => f.line === null));
  // Aviso no stderr, uma vez por standard (dois arquivos, um aviso); o exit code não muda.
  assert.equal(legacyWarnings(r.stderr).length, 1, r.stderr);
  assert.match(legacyWarnings(r.stderr)[0], /std-demo/);
  assert.match(legacyWarnings(r.stderr)[0], /por arquivo/);
  assert.equal(legacyWarnings(r.stdout).length, 0);
});

test("sem aviso de protocolo legado: linter v2, ou standard que não chega a block", async () => {
  const v2 = repo(); // LINT_BAD emite <arquivo>:<linha>
  const i = await captureErr(() => human(v2, "baseline", "init"));
  assert.equal(i.code, 0, i.err);
  assert.equal(legacyWarnings(i.err).length, 0, i.err);
  assert.equal(legacyWarnings(run(v2, "check", "--all").stderr).length, 0);

  const warn = legacyRepo({ level: "warn" });
  const r = run(warn, "check", "--all");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /warn .*console\.log/);
  assert.equal(legacyWarnings(r.stderr).length, 0, r.stderr);
});

test("accept com baseline inválido → exit 3", async () => {
  const root = repo();
  writeFileSync(BL(root), "x");
  assert.equal(await human(root, "baseline", "accept", FP0, "--reason", "r"), 3);
});

test("enforce: subir é livre; baixar exige terminal; operador baixa", async () => {
  const root = demoProject({ level: "warn" });
  assert.equal(run(root, "enforce", "std-demo", "--level", "block").status, 0);
  const md = join(root, ".context/engineering/standards/std-demo.md");
  assert.match(readFileSync(md, "utf8"), /^  level: block$/m);
  const r = run(root, "enforce", "std-demo", "--level", "warn");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /terminal interativo/);
  assert.equal(await human(root, "enforce", "std-demo", "--level", "warn"), 0);
  assert.match(readFileSync(md, "utf8"), /^  level: warn$/m);
});

test("enforce: diretório de standards que é symlink para fora → recusa escrever (exit 3)", () => {
  const root = demoProject({ level: "warn" });
  const outside = tmp("fora-");
  const dir = join(root, ".context/engineering/standards");
  execFileSync("cp", ["-r", dir, join(outside, "standards")]);
  rmSync(dir, { recursive: true });
  symlinkSync(join(outside, "standards"), dir);
  const before = readFileSync(join(outside, "standards/std-demo.md"), "utf8");
  const r = run(root, "enforce", "std-demo", "--level", "block");
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.equal(readFileSync(join(outside, "standards/std-demo.md"), "utf8"), before);
});

test("enforce: nível inválido → exit 2", () => {
  const root = demoProject();
  assert.equal(run(root, "enforce", "std-demo", "--level", "hard").status, 2);
});

test("enforce em default do plugin pede eject com --with-linter", () => {
  const root = demoProject({ isolate: false });
  const r = run(root, "enforce", "std-data-modeling", "--level", "block");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /eject data-modeling --with-linter/);
});

// I-3: o eject simples zera o campo `linter`; quem seguia a mensagem terminava com um standard
// block que nada executa. O teste segue a instrução impressa, argumento por argumento.
test("seguir o comando que o enforce imprime leva a um standard block com linter", () => {
  const root = demoProject({ isolate: false });
  const r = run(root, "enforce", "std-data-modeling", "--level", "block");
  const m = r.stderr.match(/devflow-standards\.mjs" (eject [^\n]+)/);
  assert.ok(m, r.stderr);
  const e = runEnv(root, { CLAUDE_PLUGIN_ROOT: process.cwd() }, ...m[1].trim().split(/\s+/));
  assert.equal(e.status, 0, e.stdout + e.stderr);
  assert.equal(run(root, "enforce", "std-data-modeling", "--level", "block").status, 0);
  const md = readFileSync(join(root, ".context/engineering/standards/std-data-modeling.md"), "utf8");
  assert.match(md, /^\s*linter: engineering\/standards\/machine\/std-data-modeling\.js$/m);
  assert.match(md, /^\s*level: block$/m);
  assert.ok(existsSync(join(root, ".context/engineering/standards/machine/std-data-modeling.js")), "o linter não foi trazido para o projeto");
});

test("explain lista normas e nível do arquivo", () => {
  const r = run(repo(), "explain", "src/old.js");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /std-demo — nível block/);
});

test("linter que lança exceção → exit 3", () => {
  const root = repo();
  writeFileSync(LINTER(root), 'throw new Error("boom")');
  assert.equal(run(root, "check", "--all").status, 3);
});

test("linter travado → exit 3", () => {
  const root = repo();
  writeFileSync(LINTER(root), "setTimeout(()=>{},60000)");
  const r = spawnSync("node", [CLI, "check", "--all", `--project=${root}`], { encoding: "utf8", env: { ...process.env, DEVFLOW_LINTER_TIMEOUT_MS: "300" } });
  assert.equal(r.status, 3);
});

test("baseline inválido → exit 3", () => {
  const root = repo();
  writeFileSync(BL(root), "x");
  assert.equal(run(root, "check", "--all").status, 3);
});

test("subcomando desconhecido → exit 2", async () => {
  assert.equal(await human(repo(), "nada"), 2);
});

test("--base-ref usa o baseline do merge-base: aumentar o baseline na branch não passa", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  git(root, "checkout", "-q", "-b", "feat");
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  // O agente regrava o baseline à mão incluindo a violação nova (o init é recusado — C15).
  const nova = JSON.parse(run(root, "check", "--all", "--json").stdout.split("\n")[0]).blocking[0];
  const bl = JSON.parse(readFileSync(BL(root), "utf8"));
  bl.entries.push({ fp: nova.fp, stdId: nova.stdId, ruleId: nova.ruleId, path: nova.path, message: nova.message, count: 1 });
  writeFileSync(BL(root), JSON.stringify(bl));
  git(root, "add", "-A"); git(root, "commit", "-qm", "agente");
  assert.equal(run(root, "check", "--all").status, 0, "contra o baseline da branch passa…");
  assert.equal(run(root, "check", "--all", "--base-ref=main").status, 1, "…contra o merge-base não");
});

test("--base-ref sem merge-base: --ci falha fechado (3); local usa o baseline atual com nota", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  assert.equal(run(root, "check", "--all", "--base-ref=nao-existe", "--ci").status, 3);
  const r = run(root, "check", "--all", "--base-ref=nao-existe");
  assert.equal(r.status, 0);
  assert.match(r.stderr, /merge-base/);
});

test("mesma impressão digital em --staged, --all e num clone em outro diretório", () => {
  const root = repo();
  writeFileSync(LINTER(root),
    'const p=require("path").resolve(process.argv[2]);if(require("fs").readFileSync(p,"utf8").includes("BAD")){console.log("VIOLATION: 1 problema em "+p+".");process.exit(1)}');
  writeFileSync(join(root, "src/n.js"), "BAD\n");
  git(root, "add", "-A");
  const fpOf = (r) => JSON.parse(r.stdout.split("\n")[0]).blocking.find(f => f.path === "src/n.js").fp;
  const staged = fpOf(run(root, "check", "--staged", "--json"));
  git(root, "commit", "-qm", "c");
  const all = fpOf(run(root, "check", "--all", "--json"));
  const clone = tmp("clone-");
  execFileSync("git", ["clone", "-q", root, clone]);
  const cloned = fpOf(run(clone, "check", "--all", "--json"));
  assert.equal(staged, all);
  assert.equal(all, cloned);
});

test("concorrência limitada no check --all", () => {
  const root = repo();
  const log = join(root, "conc.log");
  writeFileSync(LINTER(root),
    `const fs=require("fs");fs.appendFileSync(${JSON.stringify(log)},"S "+Date.now()+"\\n");const t=Date.now();while(Date.now()-t<150){};fs.appendFileSync(${JSON.stringify(log)},"E "+Date.now()+"\\n");process.exit(0);`);
  for (let i = 0; i < 24; i++) writeFileSync(join(root, `src/f${i}.js`), "ok\n");
  git(root, "add", "-A");
  assert.equal(run(root, "check", "--all").status, 0);
  const ev = readFileSync(log, "utf8").trim().split("\n").map(l => { const [k, t] = l.split(" "); return [Number(t), k === "S" ? 1 : -1]; })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0, max = 0;
  for (const [, d] of ev) { cur += d; max = Math.max(max, cur); }
  assert.ok(max <= 8, `pico de ${max} linters simultâneos`);
  assert.ok(max >= 2, "sem paralelismo algum");
});

// ── Correção — rodada 1 ─────────────────────────────────────────────────────────────

// Std no layout legado (.context/standards/): o linter fica FORA do diretório canônico do
// baseline, então mover/symlinkar o canônico não quebra o sandbox do linter.
function toLegacyLayout(root) {
  const eng = join(root, ".context/engineering/standards");
  const leg = join(root, ".context/standards");
  mkdirSync(join(leg, "machine"), { recursive: true });
  writeFileSync(join(leg, "std-demo.md"), `---\nid: std-demo\nsource: local\ndescription: demo\napplyTo: ["src/**"]\nenforcement:\n  linter: standards/machine/std-demo.js\n  level: block\n---\n## P\n- sem BAD\n`);
  writeFileSync(join(leg, "machine/std-demo.js"), LINT_BAD);
  rmSync(eng, { recursive: true }); mkdirSync(eng, { recursive: true });
}

// Branch "feat" cuja violação nova (src/new.js) foi somada ao baseline por um caminho
// físico diferente do lógico: `.context/engineering/standards` vira symlink para `x`.
async function branchComBaselineViaSymlink({ legacy = false } = {}) {
  const root = demoProject();
  const eng = join(root, ".context/engineering/standards");
  if (legacy) toLegacyLayout(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  git(root, "add", "-A");
  assert.equal(await human(root, "baseline", "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  git(root, "checkout", "-q", "-b", "feat");
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  const nova = JSON.parse(run(root, "check", "--all", "--json").stdout.split("\n")[0]).blocking[0];
  assert.ok(nova, "a violação nova precisa existir antes do truque");
  renameSync(eng, join(root, ".context/engineering/x"));
  symlinkSync("x", eng);
  const blp = join(root, ".context/engineering/x/baseline.json");
  const bl = JSON.parse(readFileSync(blp, "utf8"));
  bl.entries.push({ fp: nova.fp, stdId: nova.stdId, ruleId: nova.ruleId, path: nova.path, message: nova.message, count: 1 });
  writeFileSync(blp, JSON.stringify(bl));
  git(root, "add", "-A"); git(root, "commit", "-qm", "agente");
  return root;
}

test("R1-C1: --base-ref --ci com symlink de diretório (layout canônico) não passa", async () => {
  const root = await branchComBaselineViaSymlink();
  const r = run(root, "check", "--all", "--base-ref=main", "--ci");
  assert.equal(r.status, 3, r.stdout + r.stderr);
  // O motivo tem de ser o symlink no caminho do baseline, não o sandbox do linter.
  assert.match(r.stderr, /link simbólico no caminho do baseline/);
});

test("R1-C1: --base-ref --ci com symlink de diretório (standards no layout legado) não passa", async () => {
  const root = await branchComBaselineViaSymlink({ legacy: true });
  const r = runEnv(root, { CI: "true" }, "check", "--all", "--base-ref=main", "--ci");
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /link simbólico no caminho do baseline/);
});

test("R1-C1: --base-ref local com symlink de diretório lê o baseline do merge-base pelo caminho lógico", async () => {
  const root = await branchComBaselineViaSymlink({ legacy: true });
  const r = run(root, "check", "--all", "--base-ref=main");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /adoção/);
});

test("R1-C1: fallback do HEAD em resolveBaseline usa o caminho lógico, não o físico", async () => {
  const root = repo();
  toLegacyLayout(root);
  git(root, "add", "-A");
  assert.equal(await human(root, "baseline", "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  // Na árvore, o diretório vira symlink para uma cópia SEM baseline.json.
  const eng = join(root, ".context/engineering/standards");
  renameSync(eng, join(root, ".context/engineering/x"));
  rmSync(join(root, ".context/engineering/x/baseline.json"));
  symlinkSync("x", eng);
  const r = resolveBaseline(root);
  assert.ok(r.baseline, `esperado o baseline do HEAD, veio fonte '${r.source}'`);
  assert.match(r.source, /HEAD/);
  assert.equal(run(root, "check", "--all").status, 0);
});

test("R1-I2: --base-ref começando com '-' → uso incorreto (exit 2)", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  for (const ref of ["--independent", "-h"]) {
    assert.equal(run(root, "check", "--all", `--base-ref=${ref}`, "--ci").status, 2, ref);
  }
});

test("R1-I2: --base-ref que não é commit → exit 3 em CI", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  const tree = git(root, "rev-parse", "HEAD^{tree}").trim();
  assert.equal(run(root, "check", "--all", `--base-ref=${tree}`, "--ci").status, 3);
});

test("R1-I3: accept com fp malformado não ecoa o valor (nem C0/ANSI)", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  for (const bad of ['abc"; curl x|sh; echo "', "\x1b[31mvermelho\x1b[0m", "a\nb", "A".repeat(40)]) {
    const r = run(root, "baseline", "accept", bad, "--reason", "x");
    assert.equal(r.status, 2, JSON.stringify(bad));
    const out = r.stdout + r.stderr;
    assert.ok(!out.includes(bad), `ecoou ${JSON.stringify(bad)}`);
    assert.doesNotMatch(out, /curl|\x1b|vermelho/);
    const h = await captureErr(() => human(root, "baseline", "accept", bad, "--reason", "x"));
    assert.equal(h.code, 2);
    assert.ok(!h.err.includes(bad));
  }
});

test("R1-4: --staged compara com o baseline do ÍNDICE, não com o da árvore", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  const nova = JSON.parse(run(root, "check", "--all", "--json").stdout.split("\n")[0]).blocking[0];
  git(root, "add", "src/new.js");
  const bl = JSON.parse(readFileSync(BL(root), "utf8"));
  bl.entries.push({ fp: nova.fp, stdId: nova.stdId, ruleId: nova.ruleId, path: nova.path, message: nova.message, count: 1 });
  writeFileSync(BL(root), JSON.stringify(bl)); // aumentado na árvore, NÃO staged
  assert.equal(run(root, "check", "--all").status, 0, "a árvore passa…");
  assert.equal(run(root, "check", "--staged").status, 1, "…o índice não");
  git(root, "add", BL(root));
  assert.equal(run(root, "check", "--staged").status, 0, "staged, o baseline do índice vale");
});

test("R1: CI=1 conta como CI (sem merge-base → 3) e desliga o modo interativo", () => {
  const root = repo();
  git(root, "commit", "-qm", "base");
  assert.equal(runEnv(root, { CI: "1" }, "check", "--all", "--base-ref=nao-existe").status, 3);
  assert.notEqual(runEnv(root, { CI: "false" }, "check", "--all", "--base-ref=nao-existe").status, 3);
  assert.notEqual(runEnv(root, { CI: "0" }, "check", "--all", "--base-ref=nao-existe").status, 3);
});

test("R1: seleção ambígua → exit 2", () => {
  const root = repo();
  assert.equal(run(root, "check", "--staged", "--all").status, 2);
  assert.equal(run(root, "check", "--staged", "src/old.js").status, 2);
  assert.equal(run(root, "check", "--all", "src/old.js").status, 2);
});

test("R1: prune não aumenta — count 1 com 2 ocorrências atuais continua 1", async () => {
  const root = repo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/old.js"), "BAD\nBAD\n");
  assert.equal(run(root, "baseline", "prune").status, 0);
  const entries = JSON.parse(readFileSync(BL(root), "utf8")).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].count, 1);
});

test("R1: enforce em frontmatter CRLF grava o nível e preserva o EOL", () => {
  const root = demoProject({ level: "warn" });
  const md = join(root, ".context/engineering/standards/std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace(/\n/g, "\r\n"));
  assert.equal(run(root, "enforce", "std-demo", "--level", "block").status, 0);
  const txt = readFileSync(md, "utf8");
  assert.match(txt, /\r\n  level: block\r\n/);
  assert.doesNotMatch(txt.replace(/\r\n/g, ""), /\n/, "nenhuma quebra LF solta");
  assert.match(run(root, "explain", "src/x.js").stdout, /std-demo — nível block/);
});

// ── baseline reinit ──────────────────────────────────────────────────────────────────────
const LINT_WORSE = LINT_BAD.replaceAll("BAD", "WORSE").replace("no-bad", "no-worse");
const LINT_MIGRADO = LINT_BAD.replace("remova BAD", "tire o BAD"); // o linter muda a mensagem
const REINIT_USO = /uso: .*baseline reinit <std-id> --reason/;
const STD_DIR = (root) => join(root, ".context/engineering/standards");

// Dois standards do projeto: std-demo (no-bad) e std-other (no-worse), os dois em block.
function twoStdRepo() {
  const root = repo();
  writeFileSync(join(STD_DIR(root), "std-other.md"),
    `---\nid: std-other\nsource: local\ndescription: outro\napplyTo: ["src/**"]\nenforcement:\n  linter: engineering/standards/machine/std-other.js\n  level: block\n---\n## Princípios\n- sem WORSE\n`);
  writeFileSync(join(STD_DIR(root), "machine/std-other.js"), LINT_WORSE);
  writeFileSync(join(root, "src/old.js"), "BAD\nWORSE\nWORSE\n");
  git(root, "add", "-A");
  return root;
}

// Captura console.log e console.error durante uma chamada in-process.
async function captureAll(fn) {
  const out = [], err = [];
  const o = console.log, e = console.error;
  console.log = (...m) => out.push(m.map(String).join(" "));
  console.error = (...m) => err.push(m.map(String).join(" "));
  try { return { code: await fn(), out: out.join("\n"), err: err.join("\n") }; } finally { console.log = o; console.error = e; }
}

const entriesOf = (root, id) => JSON.parse(readFileSync(BL(root), "utf8")).entries.filter(e => e.stdId === id);
const reinit = (root, ...a) => human(root, "baseline", "reinit", ...a);

test("reinit: caso feliz — refaz só o standard alvo e o check volta a ficar verde", async () => {
  const root = twoStdRepo();
  assert.equal(await human(root, "baseline", "init"), 0);
  const otherBefore = entriesOf(root, "std-other");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  assert.equal(run(root, "check", "--all").status, 1, "o aceito volta como violação nova");

  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "linter migrado"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /std-demo: baseline refeito — mantidas 0 entrada\(s\) \(0 ocorrência\(s\)\); novas 1 entrada\(s\) \(1 ocorrência\(s\)\); alteradas 0 entrada\(s\) \(0 ocorrência\(s\)\); removidas 1 entrada\(s\) \(1 ocorrência\(s\)\)/);
  assert.match(r.out, /1 execução\(ões\) de linter/);
  assert.match(r.out, /regra no-bad: 1/);
  assert.doesNotMatch(r.out, /caminho novo|cresceu/);
  assert.equal(run(root, "check", "--all").status, 0);
  assert.deepEqual(entriesOf(root, "std-other"), otherBefore);
  const demo = entriesOf(root, "std-demo");
  assert.equal(demo.length, 1);
  assert.equal(demo[0].reason, "linter migrado");
  assert.match(demo[0].message, /tire o BAD/);
  assert.ok(demo[0].acceptedBy && demo[0].acceptedAt);
});

test("reinit: migração com arquivo plantado — recusa sem a flag, lista o caminho e aceita com ela", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  writeFileSync(join(root, "src/auth.js"), "BAD\n"); // plantado junto com a migração
  const before = readFileSync(BL(root), "utf8");

  const no = await captureAll(() => reinit(root, "std-demo", "--reason", "linter migrado"));
  assert.equal(no.code, 2);
  assert.match(no.err, /1 caminho\(s\) com achado de std-demo não tinham nenhuma entrada/);
  assert.match(no.err, /^  src\/auth\.js$/m);
  assert.match(no.err, /--allow-new-paths/);
  assert.equal(readFileSync(BL(root), "utf8"), before);

  const yes = await captureAll(() => reinit(root, "std-demo", "--reason", "linter migrado", "--allow-new-paths"));
  assert.equal(yes.code, 0, yes.err);
  assert.match(yes.out, /caminho novo: src\/auth\.js/);
  assert.equal(entriesOf(root, "std-demo").length, 2);
});

test("reinit: linter intacto e uma violação nova — as entradas mantidas conservam a justificativa antiga", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  const fp = JSON.parse(run(root, "check", "--all", "--json").stdout.split("\n")[0]).blocking.find(x => x.path === "src/new.js").fp;
  assert.equal(await human(root, "baseline", "accept", fp, "--reason", "legado do fornecedor, chamado 123"), 0);
  const before = entriesOf(root, "std-demo");
  writeFileSync(join(root, "src/third.js"), "BAD\n");

  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "aceite em lote", "--allow-new-paths"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /mantidas 2 entrada\(s\) \(2 ocorrência\(s\)\); novas 1 entrada\(s\)/);
  const after = entriesOf(root, "std-demo");
  for (const e of before) assert.deepEqual(after.find(x => x.fp === e.fp), e);
  assert.equal(after.find(x => x.path === "src/third.js").reason, "aceite em lote");
  assert.equal(after.find(x => x.fp === fp).reason, "legado do fornecedor, chamado 123");
});

test("reinit: mais ocorrências num arquivo que já tinha entrada aparecem como crescimento", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/old.js"), "BAD\nBAD\nBAD\nWORSE\nWORSE\n");
  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "mais duas"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /alteradas 1 entrada\(s\) \(3 ocorrência\(s\)\)/);
  assert.match(r.out, /cresceu: src\/old\.js \(1 → 3\)/);
  assert.equal(entriesOf(root, "std-demo")[0].count, 3);
});

test("reinit: sem diferença sai 0 e não toca no arquivo", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "conferência"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /std-demo: nada a refazer/);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: sem terminal interativo recusa", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  const r = run(root, "baseline", "reinit", "std-demo", "--reason", "x");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /terminal interativo/);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: CI=1 recusa mesmo com a entrada padrão num terminal", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  const before = readFileSync(BL(root), "utf8");
  const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const ci = process.env.CI;
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  process.env.CI = "1";
  try {
    const r = await captureErr(() => runStandardsCommand("baseline", ["reinit", "std-demo", "--reason", "x"], root));
    assert.equal(r.code, 2);
    assert.match(r.err, /terminal interativo/);
  } finally {
    if (tty) Object.defineProperty(process.stdin, "isTTY", tty); else delete process.stdin.isTTY;
    if (ci === undefined) delete process.env.CI; else process.env.CI = ci;
  }
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: argumentos — id, justificativa e opções inválidos → uso (exit 2), nada gravado", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO); // haveria o que gravar: opção ignorada gravaria
  const before = readFileSync(BL(root), "utf8");
  const casos = [
    [], ["std-demo"], ["std-demo", "--reason", "   "], ["--reason", "x"],
    ["std-demo", "std-other", "--reason", "x"],
    ["std-demo", "--reason", "x".repeat(501)],
    ["std-demo", "--reason", "x", "--dry-run"],
    ["std-demo", "--rule=no-bad", "--reason", "x"],
    ["std-demo", "--reason", "x", "--allow-new-path"],
  ];
  for (const args of casos) {
    const r = await captureAll(() => reinit(root, ...args));
    assert.equal(r.code, 2, JSON.stringify(args).slice(0, 80));
    assert.match(r.err, REINIT_USO, JSON.stringify(args).slice(0, 80));
    assert.doesNotMatch(r.out + r.err, /dry-run|no-bad|allow-new-path\b(?!s)/);
  }
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: id malformado não é ecoado (nem C0/ANSI)", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  for (const bad of ['std"; curl x|sh; echo "', "\x1b[31mvermelho\x1b[0m", "std\ndemo", "std demo", ".std", "a".repeat(129)]) {
    const r = run(root, "baseline", "reinit", bad, "--reason", "x");
    assert.equal(r.status, 2, JSON.stringify(bad));
    const out = r.stdout + r.stderr;
    assert.match(out, REINIT_USO, JSON.stringify(bad)); // uso, e não a recusa por falta de terminal
    assert.ok(!out.includes(bad), `ecoou ${JSON.stringify(bad)}`);
    assert.doesNotMatch(out, /curl|\x1b|vermelho/);
    const h = await captureErr(() => reinit(root, bad, "--reason", "x"));
    assert.equal(h.code, 2);
    assert.match(h.err, REINIT_USO, JSON.stringify(bad));
    assert.ok(!h.err.includes(bad));
  }
});

test("reinit: sem baseline → exit 2 apontando o init, e nada é criado", async () => {
  const root = twoStdRepo();
  const r = await captureErr(() => reinit(root, "std-demo", "--reason", "x"));
  assert.equal(r.code, 2);
  assert.match(r.err, /sem baseline para refazer/);
  assert.match(r.err, /baseline init/);
  assert.ok(!existsSync(BL(root)));
});

test("reinit: standard desconhecido → exit 2 e o arquivo fica igual", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  const r = await captureErr(() => reinit(root, "std-nao-existe", "--reason", "x"));
  assert.equal(r.code, 2);
  assert.match(r.err, /std-nao-existe não encontrado/);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: erro do linter do alvo → exit 3 e o arquivo fica byte a byte igual", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  writeFileSync(LINTER(root), "process.exit(7)");
  const r = await captureErr(() => reinit(root, "std-demo", "--reason", "x"));
  assert.equal(r.code, 3);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: nenhum linter rodou para o standard → exit 2 apontando o prune, sem zerar as entradas", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  const md = join(STD_DIR(root), "std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace('applyTo: ["src/**"]', 'applyTo: ["nada/**"]'));
  const r = await captureErr(() => reinit(root, "std-demo", "--reason", "x"));
  assert.equal(r.code, 2);
  assert.match(r.err, /nenhum linter rodou para std-demo/);
  assert.match(r.err, /baseline prune/);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: linter quebrado de OUTRO standard não impede a operação", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  writeFileSync(join(STD_DIR(root), "machine/std-other.js"), "process.exit(7)");
  const otherBefore = entriesOf(root, "std-other");
  assert.equal(await reinit(root, "std-demo", "--reason", "linter migrado"), 0);
  assert.deepEqual(entriesOf(root, "std-other"), otherBefore);
  assert.match(entriesOf(root, "std-demo")[0].message, /tire o BAD/);
});

test("reinit: baseline alterado durante a execução → exit 3, e o que o outro comando gravou fica", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  // O linter do alvo, enquanto roda, faz o papel de um `accept` concorrente no outro standard.
  const outro = `const p=".context/engineering/standards/baseline.json";const j=JSON.parse(fs.readFileSync(p,"utf8"));j.entries.find(e=>e.stdId==="std-other").count=99;fs.writeFileSync(p,JSON.stringify(j));`;
  writeFileSync(LINTER(root), LINT_MIGRADO.replace("process.exit(h?1:0);", `${outro}process.exit(h?1:0);`));
  const r = await captureErr(() => reinit(root, "std-demo", "--reason", "linter migrado"));
  assert.equal(r.code, 3);
  assert.match(r.err, /baseline mudou durante a execução/);
  assert.equal(entriesOf(root, "std-other")[0].count, 99);
  assert.match(entriesOf(root, "std-demo")[0].message, /remova BAD/);
});

test("reinit: justificativa fica gravada como veio e não aparece na saída", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  const reason = "linha1\nlinha2 \x1b[31mvermelho";
  const r = await captureAll(() => reinit(root, "std-demo", `--reason=${reason}`));
  assert.equal(r.code, 0, r.err);
  assert.equal(entriesOf(root, "std-demo")[0].reason, reason);
  assert.doesNotMatch(r.out + r.err, /linha2|\x1b|vermelho/);
});

test("reinit: baseline só no HEAD (arquivo removido da árvore) é a base, e o arquivo é recriado", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  const otherBefore = entriesOf(root, "std-other");
  rmSync(BL(root));
  writeFileSync(LINTER(root), LINT_MIGRADO);
  assert.equal(await reinit(root, "std-demo", "--reason", "linter migrado"), 0);
  assert.ok(existsSync(BL(root)));
  assert.deepEqual(entriesOf(root, "std-other"), otherBefore);
  assert.equal(run(root, "check", "--all").status, 0);
});

test("reinit: linter do alvo em protocolo legado → funciona e avisa", async () => {
  const root = legacyRepo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/third.js"), "console.log(1);\n");
  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "arquivo novo aceito", "--allow-new-paths"));
  assert.equal(r.code, 0, r.err);
  assert.equal(legacyWarnings(r.err).length, 1, r.err);
  assert.equal(entriesOf(root, "std-demo").length, 3);
});
