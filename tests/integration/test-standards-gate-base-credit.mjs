// tests/integration/test-standards-gate-base-credit.mjs — crédito do baseline limitado pela base
// (achado C1 da revisão final de segurança; onda B, item B1).
//
// O furo: o baseline da base tem uma entrada cuja ocorrência a árvore da base já não produz (a
// violação foi corrigida e ninguém rodou `prune`). Um PR reintroduzia a mesma violação `block`
// no mesmo arquivo e o `gate --ci` saía 0, sem aprovação de dono. A regra: sob `--ci`, o crédito
// de uma entrada só vale até o que os linters DA BASE produzem sobre a árvore DA BASE.
// Nenhum teste chama a API real do GitHub: a API é injetada.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync, mkdtempSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import { loadBaseline } from "../../scripts/lib/standards-baseline.mjs";
import { demoProject as rawDemoProject, LINT_BAD } from "../helpers/standards-fixture.mjs";

const CLI = join(process.cwd(), "scripts/devflow-standards.mjs");
const env = { ...process.env, CI: "" };
const TEMPS = [];
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TEMPS.push(d); return d; };
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });

const REF = "refs/heads/main";
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
const run = (root, extraEnv, ...a) => spawnSync("node", [CLI, ...a, `--project=${root}`], { encoding: "utf8", env: { ...env, ...extraEnv } });
const ci = (root, extraEnv = {}) => run(root, extraEnv, "gate", `--base-ref=${REF}`, "--ci");
const local = (root) => run(root, {}, "gate", `--base-ref=${REF}`);
const human = (root, ...a) => runStandardsCommand("baseline", a, root, { isInteractive: () => true });
const w = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const commit = (root, msg = "x") => { git(root, "add", "-A"); git(root, "commit", "-qm", msg); };
const counts = (root) => Object.fromEntries(loadBaseline(root).entries.map((e) => [e.path, e.count]));
const BLOCKED = (rel) => new RegExp(`${rel.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}:\\d+ \\[std-demo\\/no-bad\\]`);

/**
 * Repositório com a `main` em dois commits e a branch `feat` aberta em cima:
 *  1. `accepted`: os arquivos com o legado que o operador aceitou (`baseline init`);
 *  2. `fixed` (opcional): os mesmos arquivos depois de corrigidos na `main` SEM `prune` — é o que
 *     deixa crédito sem lastro no baseline da base.
 * `setup(root)` roda antes do primeiro commit; `afterInit(root)` vira um commit da `main` depois do `init`.
 */
async function repo({ accepted, fixed = null, linterBody = undefined, codeowners = null, setup = null, afterInit = null } = {}) {
  const root = rawDemoProject(linterBody === undefined ? undefined : { linterBody });
  TEMPS.push(root);
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  w(root, ".context/.devflow.yaml", 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  if (codeowners) w(root, ".github/CODEOWNERS", codeowners);
  for (const [rel, text] of Object.entries(accepted)) w(root, rel, text);
  if (setup) setup(root);
  git(root, "add", "-A");
  assert.equal(await human(root, "init"), 0);
  commit(root, "legado aceito");
  if (afterInit) { afterInit(root); commit(root, "depois do init"); }
  if (fixed) {
    for (const [rel, text] of Object.entries(fixed)) w(root, rel, text);
    commit(root, "corrige sem prune");
  }
  git(root, "checkout", "-q", "-b", "feat");
  return root;
}
// A base da prova de conceito: `src/a.js` tinha uma violação aceita, foi corrigido, e a entrada ficou.
const orphanBase = (o = {}) => repo({ accepted: { "src/a.js": "BAD\n" }, fixed: { "src/a.js": "ok\n" }, ...o });

// ── A prova de conceito do parecer ─────────────────────────────────────────────────────────────

test("C1: entrada órfã na base + a mesma violação reintroduzida no mesmo arquivo → gate --ci 1", async () => {
  const root = await orphanBase();
  assert.deepEqual(counts(root), { "src/a.js": 1 }, "a base tem o crédito, e a árvore da base já não tem a ocorrência");
  w(root, "src/a.js", "BAD\n"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✗ 1 violação\(ões\) nova\(s\) de nível block/);
  assert.match(r.stdout, BLOCKED("src/a.js"));
  // O baseline não mudou: não é a catraca que acusa, é o check.
  assert.match(r.stderr, /catraca íntegra vs merge-base/);
  assert.match(r.stderr, /nota: baseline da base [0-9a-f]{8}: 1 entrada\(s\) aceitam mais ocorrências do que a árvore da base produz/);
});

test("C1 (controle): a mesma reintrodução com o baseline da base vazio → 1", async () => {
  const root = await orphanBase({ afterInit: null });
  git(root, "checkout", "-q", "main");
  assert.equal(run(root, {}, "baseline", "prune").status, 0);
  assert.deepEqual(counts(root), {});
  commit(root, "prune na main");
  git(root, "checkout", "-q", "-B", "feat");
  w(root, "src/a.js", "BAD\n"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, BLOCKED("src/a.js"));
});

test("caso legítimo: a violação continua na base e no HEAD, com crédito → 0", async () => {
  const root = await repo({ accepted: { "src/a.js": "BAD\n" } });
  w(root, "src/a.js", "// mexido\nBAD\n"); // o arquivo muda, a ocorrência aceita continua
  w(root, "src/new.js", "ok\n");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /aceitam mais ocorrências/, "sem crédito órfão não há nota");
});

// count 2 na base, uma ocorrência só na árvore da base: o crédito com lastro é 1.
const halfOrphan = () => repo({ accepted: { "src/a.js": "BAD\nBAD\n" }, fixed: { "src/a.js": "BAD\nok\n" } });

test("count 2 na base com uma ocorrência só na árvore da base: uma ocorrência no HEAD passa", async () => {
  const root = await halfOrphan();
  assert.deepEqual(counts(root), { "src/a.js": 2 });
  w(root, "src/a.js", "// mexido\nBAD\nok\n"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("count 2 na base com uma ocorrência só na árvore da base: duas ocorrências no HEAD não passam", async () => {
  const root = await halfOrphan();
  w(root, "src/a.js", "BAD\nBAD\n"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✗ 1 violação\(ões\) nova\(s\) de nível block/, "a ocorrência com lastro passa; só a que usa o crédito órfão bloqueia");
  assert.match(r.stdout, BLOCKED("src/a.js"));
});

test("a reintrodução em OUTRO arquivo nunca teve crédito: 1 antes e depois (controle)", async () => {
  const root = await orphanBase();
  w(root, "src/b.js", "BAD\n"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, BLOCKED("src/b.js"));
});

// ── O que NÃO muda ─────────────────────────────────────────────────────────────────────────────

test("PR que corrige a violação e não roda prune continua verde (sobrar crédito não é violação)", async () => {
  const root = await repo({ accepted: { "src/a.js": "BAD\n", "src/b.js": "BAD\n" } });
  w(root, "src/a.js", "ok\n"); commit(root); // corrige; o baseline fica como estava
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /aceitam mais ocorrências/, "na base a ocorrência ainda existe: o crédito tem lastro");
  assert.deepEqual(counts(root), { "src/a.js": 1, "src/b.js": 1 });
});

test("base com crédito órfão e PR que não o usa → 0, só com a nota", async () => {
  const root = await orphanBase();
  w(root, "src/new.js", "ok\n"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /nota: baseline da base [0-9a-f]{8}: 1 entrada\(s\) aceitam mais ocorrências/);
});

test("prune continua livre: no PR que corrige e no PR que limpa o crédito órfão da base → 0", async () => {
  const fix = await repo({ accepted: { "src/a.js": "BAD\n", "src/b.js": "BAD\n" } });
  w(fix, "src/a.js", "ok\n");
  assert.equal(run(fix, {}, "baseline", "prune").status, 0);
  assert.deepEqual(counts(fix), { "src/b.js": 1 });
  commit(fix);
  assert.equal(ci(fix).status, 0);

  const clean = await orphanBase();
  assert.equal(run(clean, {}, "baseline", "prune").status, 0);
  assert.deepEqual(counts(clean), {});
  commit(clean);
  const r = ci(clean);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("sem --ci (fase V local) nada muda: a base não é analisada e o crédito órfão não é conferido", async () => {
  const root = await orphanBase();
  w(root, "src/a.js", "BAD\n"); commit(root);
  const r = local(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /aceitam mais ocorrências/);
});

// ── Erro ao analisar a base: erro de execução (3), fail-closed ─────────────────────────────────

// Linter que quebra em arquivo com "CRASH" e, no resto, se comporta como o LINT_BAD.
const LINT_CRASH = `if(require("fs").readFileSync(process.argv[2],"utf8").includes("CRASH"))throw new Error("boom");\n${LINT_BAD}`;
// A `main` passa a ter, num arquivo COM entrada no baseline, um conteúdo em que o linter dela quebra.
const brokenBase = () => repo({
  accepted: { "src/a.js": "BAD\n" }, linterBody: LINT_CRASH,
  afterInit: (root) => w(root, "src/a.js", "BAD\nCRASH\n"),
});
const REMEDY = /O linter do projeto tem de ser autocontido: só node:\* e imports relativos para dentro de machine\/ \(dependência versionada, só em node_modules dentro de um dos diretórios de standards, onde o gate a compara com a base e o CODEOWNERS gerado lhe dá dono; o PR que a acrescenta pede override\)\. Se o linter da base está quebrado, o conserto entra na branch base com bypass de administrador/;

test("linter da base que falha na árvore da base → 3, mesmo com o HEAD limpo; o tmp é apagado", async () => {
  const root = await brokenBase();
  w(root, "src/a.js", "BAD\n"); commit(root); // no HEAD o arquivo volta a ser lintável: o check do HEAD passa
  const td = tmp("tmpdir-");
  const r = ci(root, { TMPDIR: td });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /erro: linters falharam na árvore da base \(std-demo\): não dá para conferir o crédito do baseline/);
  assert.match(r.stderr, REMEDY);
  assert.deepEqual(readdirSync(td), []);
});

test("sem --ci, o linter da base que falha não entra na conta (a base não é analisada)", async () => {
  const root = await brokenBase();
  w(root, "src/a.js", "BAD\n"); commit(root);
  assert.equal(local(root).status, 0);
});

// Linter com dependência que não está no git (instalada por um `npm ci`): a árvore da base é
// reconstruída só com os blobs, o linter da base não carrega e não há como saber o lastro.
const DEP_LINTER = `const { find } = require("minilint");
const fs=require("fs");const hits=find(fs.readFileSync(process.argv[2],"utf8"),"BAD");
for(const n of hits)console.log("VIOLATION no-bad "+process.argv[2]+":"+n+" remova BAD");process.exit(hits.length?1:0);`;
const MINILINT = `exports.find=(text,tok)=>text.split("\\n").map((l,i)=>l.includes(tok)?i+1:0).filter(Boolean);\n`;

test("linter com dependência não versionada, PR benigno → 3, e a mensagem diz o remédio", async () => {
  const root = await repo({
    accepted: { "src/a.js": "BAD\n" }, linterBody: DEP_LINTER,
    setup: (r) => { w(r, ".gitignore", "/node_modules/\n"); w(r, "node_modules/minilint/index.js", MINILINT); },
  });
  assert.deepEqual(counts(root), { "src/a.js": 1 }, "premissa: com o pacote instalado o linter roda e o legado foi aceito");
  assert.equal(git(root, "ls-files", "node_modules").trim(), "", "premissa: a dependência não está versionada");
  w(root, "src/new.js", "ok\n"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /erro: linters falharam na árvore da base \(std-demo\): não dá para conferir o crédito do baseline/);
  assert.match(r.stderr, REMEDY);
});

// A dependência versionada onde o gate a compara com a base: `node_modules` sob `.context/`.
const CTX_DEP = ".context/engineering/standards/node_modules/minilint/index.js";
const ctxDepRepo = () => repo({
  accepted: { "src/a.js": "BAD\n" }, linterBody: DEP_LINTER,
  setup: (r) => { w(r, CTX_DEP, MINILINT); git(r, "add", "-f", "--", CTX_DEP); },
});

test("dependência do linter versionada sob .context/: PR benigno → 0; o PR que a troca → 1 (catraca)", async () => {
  const benign = await ctxDepRepo();
  assert.equal(git(benign, "ls-files", ".context/engineering/standards/node_modules").trim(), CTX_DEP);
  w(benign, "src/new.js", "ok\n"); commit(benign);
  const r1 = ci(benign);
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);

  const swapped = await ctxDepRepo();
  w(swapped, CTX_DEP, "exports.find=()=>[];\n"); // desliga o linter
  w(swapped, "src/new.js", "BAD\n");
  commit(swapped);
  const r2 = ci(swapped);
  assert.equal(r2.status, 1, r2.stdout + r2.stderr);
  assert.match(r2.stderr, /node_modules versionado sob \.context\/ difere da base: \.context\/engineering\/standards\/node_modules/);
});

// Dependência versionada no `node_modules` da RAIZ do repositório: a análise da base carrega o
// linter, mas esse diretório fica FORA da catraca. Não é a configuração recomendada (o linter tem
// de ser autocontido); o caso seguinte mostra por quê.
test("dependência do linter versionada na raiz (fora da catraca, não recomendada): a análise da base carrega o linter → 0", async () => {
  const root = await repo({
    accepted: { "src/a.js": "BAD\n" }, linterBody: DEP_LINTER,
    setup: (r) => { w(r, "node_modules/minilint/index.js", MINILINT); git(r, "add", "-f", "--", "node_modules/minilint/index.js"); },
  });
  assert.equal(git(root, "ls-files", "node_modules").trim(), "node_modules/minilint/index.js");
  w(root, "src/new.js", "ok\n"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("resíduo declarado (I-1): o que o linter carrega de fora de machine/ e de .context/ não é comparado com a base — o PR troca a dependência da raiz e o gate sai 0", async () => {
  const root = await repo({
    accepted: { "src/a.js": "BAD\n" }, linterBody: DEP_LINTER,
    setup: (r) => { w(r, "node_modules/minilint/index.js", MINILINT); git(r, "add", "-f", "--", "node_modules/minilint/index.js"); },
  });
  w(root, "node_modules/minilint/index.js", "exports.find=()=>[];\n"); // o linter de machine/ fica intacto
  w(root, "src/new.js", "BAD\nBAD\n");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /catraca íntegra vs merge-base/);
});

// ── Na base só são analisados os arquivos que têm entrada no baseline ──────────────────────────
// A impressão digital inclui o caminho: só o arquivo da entrada pode dar lastro a ela.

test("arquivo da base sem entrada no baseline, mesmo com violação, não é analisado e não altera o veredito", async () => {
  const mark = join(tmp("marca-"), "runs.log");
  // O MESMO linter na base e na branch: registra de onde rodou e sobre qual arquivo.
  const logging = `require("fs").appendFileSync(${JSON.stringify(mark)}, process.cwd()+" "+process.argv[2]+"\\n");\n${LINT_BAD}`;
  const root = await repo({
    accepted: { "src/a.js": "BAD\n", "src/c.js": "ok\n" }, fixed: { "src/a.js": "ok\n" }, linterBody: logging,
    afterInit: (r) => w(r, "src/b.js", "BAD\n"), // violação que chegou à `main` sem entrada no baseline
  });
  assert.deepEqual(counts(root), { "src/a.js": 1 }, "só `src/a.js` tem entrada; na base ela está órfã");
  w(root, "src/a.js", "BAD\n");   // usa o crédito órfão
  w(root, "src/b.js", "ok\n");    // o PR conserta o outro arquivo
  commit(root);
  writeFileSync(mark, "");        // daqui em diante, só o gate
  const td = tmp("tmpdir-");
  const r = ci(root, { TMPDIR: td });
  // O achado de `src/b.js` na base não dá lastro à entrada de `src/a.js`: o veredito é o mesmo.
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✗ 1 violação\(ões\) nova\(s\) de nível block/);
  assert.match(r.stdout, BLOCKED("src/a.js"));
  const lines = readFileSync(mark, "utf8").trim().split("\n");
  const inBase = lines.filter((l) => l.includes("/devflow-base-")).map((l) => l.split(" ").pop());
  assert.deepEqual(inBase, ["src/a.js"], "na base, só o arquivo com entrada no baseline é analisado");
  const inHead = lines.filter((l) => l.includes("/devflow-head-")).map((l) => l.split(" ").pop()).sort();
  assert.deepEqual(inHead, ["src/a.js", "src/b.js", "src/c.js"], "o check do HEAD continua analisando tudo");
  assert.deepEqual(readdirSync(td), []);
});

test("linter da base que falha num arquivo SEM entrada no baseline não entra na conta → 0", async () => {
  const root = await repo({
    accepted: { "src/a.js": "BAD\n" }, linterBody: LINT_CRASH,
    afterInit: (r) => w(r, "src/crash.js", "CRASH\n"), // sem entrada: a análise da base não chega a ele
  });
  rmSync(join(root, "src/crash.js")); commit(root); // o PR que conserta a `main` passa
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("baseline da base sem entradas: não há crédito a conferir e a base não é analisada", async () => {
  // Sem legado: o `init` cria o baseline vazio; depois a `main` ganha o arquivo que quebra o linter.
  const root = await repo({ accepted: { "src/a.js": "ok\n" }, linterBody: LINT_CRASH, afterInit: (r) => w(r, "src/crash.js", "CRASH\n") });
  assert.deepEqual(counts(root), {});
  rmSync(join(root, "src/crash.js")); commit(root);
  const r = ci(root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// A análise da base roda os linters DA BASE sobre a árvore DA BASE: o linter que a branch trocou
// não decide quanto crédito a base tem.
test("o lastro vem do linter da base, não do linter que a branch trouxe", async () => {
  const mark = join(tmp("marca-"), "cwd.log");
  const root = await orphanBase();
  // A branch troca o linter por um que acha "BAD" em todo arquivo e registra de onde rodou.
  w(root, ".context/engineering/standards/machine/std-demo.js",
    `require("fs").appendFileSync(${JSON.stringify(mark)}, process.cwd() + "\\n");console.log("VIOLATION no-bad "+process.argv[2]+":1 remova BAD");process.exit(1);`);
  commit(root);
  const td = tmp("tmpdir-");
  const r = ci(root, { TMPDIR: td });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /linter alterado/);
  // Com o linter da branch na passada da base, `src/a.js` "teria" a ocorrência lá e o crédito valeria.
  assert.match(r.stdout, BLOCKED("src/a.js"));
  const cwds = [...new Set(readFileSync(mark, "utf8").trim().split("\n"))];
  assert.equal(cwds.length, 1, cwds.join("\n"));
  assert.ok(cwds[0].includes("/devflow-head-"), `o linter da branch rodou fora do snapshot do HEAD: ${cwds[0]}`);
  assert.deepEqual(readdirSync(td), []);
});

// ── Override aprovado ──────────────────────────────────────────────────────────────────────────

const LABEL = "standards-ratchet-approved";
function fakeApi(root) {
  return (path) => {
    const sha = git(root, "rev-parse", "HEAD").trim();
    if (/\/pulls\/\d+$/.test(path)) return { user: { login: "agente" }, state: "open", head: { sha } };
    const ev = path.match(/\/issues\/\d+\/events\?per_page=100&page=(\d+)$/);
    if (ev) return ev[1] === "1" ? [{ event: "labeled", label: { name: LABEL }, actor: { login: "dona", type: "User" } }] : [];
    const rv = path.match(/\/pulls\/\d+\/reviews\?per_page=100&page=(\d+)$/);
    if (rv) return rv[1] === "1" ? [{ id: 1, user: { login: "dona", type: "User" }, state: "APPROVED", commit_id: sha }] : [];
    throw new Error(`rota inesperada ${path}`);
  };
}
async function approved(root) {
  const out = [];
  const oe = console.error, ol = console.log;
  console.error = (...m) => out.push(m.map(String).join(" ")); console.log = (...m) => out.push(m.map(String).join(" "));
  try {
    const code = await runStandardsCommand("gate", [`--base-ref=${REF}`, "--ci", "--allow-weakening", "--pr=7", "--repo=o/r"], root, { isInteractive: () => false, api: fakeApi(root) });
    return { code, out: out.join("\n") };
  } finally { console.error = oe; console.log = ol; }
}
// O operador aceita, na branch, a ocorrência de `rel` (o `accept` sobe a contagem da entrada).
async function accept(root, rel) {
  git(root, "add", "-A");
  const j = spawnSync("node", [CLI, "check", "--all", "--json", `--project=${root}`], { encoding: "utf8", env });
  const f = JSON.parse(j.stdout.split("\n")[0]).blocking.find((x) => x.path === rel);
  assert.ok(f, `sem achado block em ${rel}: ${j.stdout}`);
  assert.equal(await human(root, "accept", f.fp, "--reason", "legado de terceiro"), 0);
}

test("override aprovado: o aumento de count aprovado continua valendo para o que foi aprovado → 0", async () => {
  // Entrada nova (0 → 1), com a base carregando crédito órfão em outro arquivo.
  const novo = await orphanBase({ codeowners: "* @dona\n" });
  w(novo, "src/new.js", "BAD\n");
  await accept(novo, "src/new.js");
  commit(novo);
  const r1 = await approved(novo);
  assert.equal(r1.code, 0, r1.out);
  assert.match(r1.out, /aprovada por code owner/);
  assert.match(r1.out, /baseline aceita a mais: std-demo\/no-bad em src\/new\.js \(0 → 1\)/);

  // Entrada que já existia e tem lastro (1 → 2): a segunda ocorrência no mesmo arquivo.
  const mais = await repo({ accepted: { "src/a.js": "BAD\n" }, codeowners: "* @dona\n" });
  w(mais, "src/a.js", "BAD\nBAD\n");
  await accept(mais, "src/a.js");
  commit(mais);
  assert.deepEqual(counts(mais), { "src/a.js": 2 });
  const r2 = await approved(mais);
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.out, /baseline aceita a mais: std-demo\/no-bad em src\/a\.js \(1 → 2\)/);
});

test("override aprovado não libera o crédito órfão de uma entrada que ele não aumentou → 1", async () => {
  const root = await orphanBase({ codeowners: "* @dona\n" });
  w(root, "src/new.js", "BAD\n");
  await accept(root, "src/new.js"); // o que a dona aprova: src/new.js (0 → 1)
  w(root, "src/a.js", "BAD\n");     // de carona: a violação antiga, no crédito que a base não tem mais
  commit(root);
  assert.deepEqual(counts(root), { "src/a.js": 1, "src/new.js": 1 });
  const r = await approved(root);
  assert.match(r.out, /aprovada por code owner/);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /✗ 1 violação\(ões\) nova\(s\) de nível block/);
  assert.match(r.out, BLOCKED("src/a.js"));
  assert.doesNotMatch(r.out, BLOCKED("src/new.js"), "o que foi aprovado não volta a bloquear");
});

// ── A linha do aumento mostra o lastro (C3) ────────────────────────────────────────────────────
// Sob override aprovado, a entrada que o PR aumentou vale pela contagem aprovada — inclusive a
// parte que a base já não sustentava. A linha que o dono lê tem de dizer isso.

test("aumento sobre entrada sem lastro: a linha diz quanto a árvore da base produz", async () => {
  const root = await orphanBase({ codeowners: "* @dona\n" }); // a base aceita 1 em src/a.js e não tem a ocorrência
  w(root, "src/a.js", "BAD\nBAD\n");
  await accept(root, "src/a.js");
  commit(root);
  assert.deepEqual(counts(root), { "src/a.js": 2 });
  const LINE = /baseline aceita a mais: std-demo\/no-bad em src\/a\.js \(1 → 2; a árvore da base produz 0\)/;
  const semOverride = ci(root);
  assert.equal(semOverride.status, 1, semOverride.stdout + semOverride.stderr);
  assert.match(semOverride.stderr, LINE);
  // A regra da isenção não muda: aprovado, o aumento vale pelo que foi aprovado.
  const r = await approved(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, LINE);
});

test("aumento sobre entrada com lastro parcial: a linha mostra o que a base ainda produz", async () => {
  const root = await repo({ accepted: { "src/a.js": "BAD\nBAD\n" }, fixed: { "src/a.js": "BAD\nok\n" }, codeowners: "* @dona\n" });
  w(root, "src/a.js", "BAD\nBAD\nBAD\n");
  await accept(root, "src/a.js");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /baseline aceita a mais: std-demo\/no-bad em src\/a\.js \(2 → 3; a árvore da base produz 1\)/);
});

test("aumento sobre entrada com lastro inteiro, entrada nova e modo local: a linha fica como era", async () => {
  // Lastro inteiro (a base aceita 1 e produz 1) e entrada nova (0 → 1), no mesmo PR.
  const root = await repo({ accepted: { "src/a.js": "BAD\n" }, codeowners: "* @dona\n" });
  w(root, "src/a.js", "BAD\nBAD\n");
  await accept(root, "src/a.js");
  w(root, "src/new.js", "BAD\n");
  await accept(root, "src/new.js");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /baseline aceita a mais: std-demo\/no-bad em src\/a\.js \(1 → 2\)\n/);
  assert.match(r.stderr, /baseline aceita a mais: std-demo\/no-bad em src\/new\.js \(0 → 1\)\n/);
  assert.doesNotMatch(r.stderr, /a árvore da base produz/);
  // Sem --ci a base não é analisada: não há lastro a mostrar, mesmo com a entrada órfã.
  const orphan = await orphanBase();
  w(orphan, "src/a.js", "BAD\nBAD\n");
  await accept(orphan, "src/a.js");
  commit(orphan);
  const l = local(orphan);
  assert.equal(l.status, 0, l.stdout + l.stderr);
  assert.match(l.stderr, /baseline aceita a mais: std-demo\/no-bad em src\/a\.js \(1 → 2\)\n/);
});
