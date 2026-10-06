// tests/integration/test-standards-gate-r1.mjs — rodadas de correção 1 e 2 da T18.
// Cada bloco porta um PoC da revisão de segurança (rev18/poc01…poc15): antes da correção, o
// `gate --ci` saía 0 com a catraca enfraquecida. Os repositórios são reais; o "CI" é um clone
// com fetch de tags e checkout do MERGE do PR, como um runner faria. Nenhum teste chama a API
// real do GitHub: a API é injetada.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync, mkdtempSync, mkdirSync, readdirSync, symlinkSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import { demoProject as rawDemoProject, LINT_BAD } from "../helpers/standards-fixture.mjs";

const CLI = join(process.cwd(), "scripts/devflow-standards.mjs");
const TEMPS = [];
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TEMPS.push(d); return d; };
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });
const demoProject = (o) => { const p = rawDemoProject(o); TEMPS.push(p); return p; };

const baseEnv = () => { const e = { ...process.env, CI: "" }; delete e.CLAUDE_PLUGIN_ROOT; delete e.BASE_REF; return e; };
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", env: baseEnv(), stdio: ["ignore", "pipe", "ignore"] });
const w = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const r = (root, rel) => readFileSync(join(root, rel), "utf8");
const human = (root, ...a) => runStandardsCommand("baseline", a, root, { isInteractive: () => true });
const commit = (root, msg = "x") => { git(root, "add", "-A"); git(root, "commit", "-qm", msg); };

const M = ".context/engineering/standards/machine";
const STD = ".context/engineering/standards/std-demo.md";
const BL = ".context/engineering/standards/baseline.json";
const ORIGIN_MAIN = "refs/remotes/origin/main";
const LOCAL_MAIN = "refs/heads/main";

/** Repositório "de origem": base na main (com baseline por padrão) e a branch feat em cima. */
async function origin({ withBaseline = true, setup = null, linterBody = undefined, level = "block" } = {}) {
  const root = demoProject({ ...(linterBody === undefined ? {} : { linterBody }), level });
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  w(root, "src/old.js", "BAD\n");
  w(root, ".context/.devflow.yaml", 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  if (setup) setup(root);
  git(root, "add", "-A");
  if (withBaseline) assert.equal(await human(root, "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  git(root, "checkout", "-q", "-b", "feat");
  return root;
}

/** Clone "de CI": fetch completo com tags e checkout do merge do PR (base + branch). */
function ciClone(src, { branch = "feat", baseBranch = "main", merge = true, cloneArgs = [] } = {}) {
  const dst = tmp("ci-");
  execFileSync("git", ["clone", "-q", ...cloneArgs, `file://${src}`, dst], { env: baseEnv(), stdio: "ignore" });
  git(dst, "config", "user.email", "ci@ci"); git(dst, "config", "user.name", "ci");
  if (!cloneArgs.length) git(dst, "fetch", "-q", "--tags", "origin");
  if (merge) {
    git(dst, "checkout", "-q", "--detach", `refs/remotes/origin/${baseBranch}`);
    git(dst, "merge", "-q", "--no-ff", "-m", "merge do PR", `refs/remotes/origin/${branch}`);
  } else if (!cloneArgs.length) {
    git(dst, "checkout", "-q", "--detach", `refs/remotes/origin/${branch}`);
  }
  return dst;
}

/** Roda o gate como o CI rodaria. */
function gate(root, { ref = ORIGIN_MAIN, ci = true, extra = [], env = {} } = {}) {
  const args = [CLI, "gate", ...(ref === null ? [] : [`--base-ref=${ref}`]), ...(ci ? ["--ci"] : []), ...extra, `--project=${root}`];
  const p = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...baseEnv(), ...env }, cwd: root });
  return { status: p.status, out: `${p.stderr}${p.stdout}` };
}

// ── C1: uma tag "origin/main" toma o lugar da base (poc01) ────────────────────────────

test("C1: tag origin/main apontando para a própria branch não vira a base → 3; nome completo → 1", async () => {
  const src = await origin();
  w(src, "src/new.js", "BAD\nBAD\n");
  w(src, `${M}/std-demo.js`, "process.exit(0)\n");
  w(src, STD, r(src, STD).replace("level: block", "level: warn"));
  w(src, ".context/.devflow.yaml", "git:\n  strategy: branch-flow\n");
  commit(src, "ataque");

  const control = gate(ciClone(src), { ref: "origin/main" });
  assert.equal(control.status, 1, control.out);
  assert.match(control.out, /std-demo: nível block → warn/);

  git(src, "tag", "origin/main", "feat");
  const ci = ciClone(src);
  assert.match(git(ci, "for-each-ref", "--format=%(refname)"), /refs\/tags\/origin\/main/);
  const attack = gate(ci, { ref: "origin/main" });
  assert.equal(attack.status, 3, attack.out);
  assert.match(attack.out, /ambíguo/);
  assert.match(attack.out, /refs\/tags\/origin\/main/);
  assert.doesNotMatch(attack.out, /catraca íntegra/);
  const full = gate(ci, { ref: ORIGIN_MAIN });
  assert.equal(full.status, 1, full.out);
  assert.match(full.out, /std-demo: nível block → warn/);
  // O `check --base-ref --ci` isolado usa o mesmo resolvedor.
  const chk = spawnSync(process.execPath, [CLI, "check", "--all", "--base-ref=origin/main", "--ci", `--project=${ci}`], { encoding: "utf8", env: baseEnv() });
  assert.equal(chk.status, 3, chk.stderr);
  assert.match(chk.stderr, /ambíguo/);
});

test("C1: sob --ci, nome curto só resolve em refs/remotes/; branch local homônima → 3; SHA completo vale", async () => {
  const src = await origin();
  w(src, "src/new.js", "ok\n"); commit(src);
  const ci = ciClone(src);
  assert.equal(gate(ci, { ref: "origin/main" }).status, 0);
  // Branch local chamada "origin/main" (refs/heads/origin/main): ambíguo.
  git(ci, "branch", "origin/main", "HEAD");
  const amb = gate(ci, { ref: "origin/main" });
  assert.equal(amb.status, 3, amb.out);
  assert.match(amb.out, /ambíguo/);
  git(ci, "branch", "-D", "origin/main");
  // "main" não existe em refs/remotes/ (só origin/main): não cai para refs/heads/ nem para tag.
  git(ci, "branch", "main", "HEAD");
  const short = gate(ci, { ref: "main" });
  assert.equal(short.status, 3, short.out);
  // SHA completo e ref completo valem; expressão de revisão e SHA abreviado, não.
  const sha = git(ci, "rev-parse", ORIGIN_MAIN).trim();
  assert.equal(gate(ci, { ref: sha }).status, 0);
  assert.equal(gate(ci, { ref: ORIGIN_MAIN }).status, 0);
  assert.equal(gate(ci, { ref: `${ORIGIN_MAIN}~0` }).status, 3);
  assert.equal(gate(ci, { ref: sha.slice(0, 12) }).status, 3);
  assert.equal(gate(ci, { ref: "HEAD" }).status, 3);
});

test("C1: o padrão do gate é refs/remotes/origin/main, e a tag homônima não o desvia", async () => {
  const src = await origin();
  w(src, STD, r(src, STD).replace("level: block", "level: warn")); commit(src);
  git(src, "tag", "origin/main", "feat");
  const res = gate(ciClone(src), { ref: null });
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /std-demo: nível block → warn/);
});

// ── I1: base velha ou merge-base manipulado (poc02) ───────────────────────────────────

async function staleRepo() {
  const src = demoProject({ level: "warn" });
  git(src, "init", "-q", "-b", "main"); git(src, "config", "user.email", "t@t"); git(src, "config", "user.name", "t");
  w(src, "src/old.js", "BAD\n");
  w(src, ".context/.devflow.yaml", 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  commit(src, "O: std em warn");
  const O = git(src, "rev-parse", "HEAD").trim();
  w(src, STD, r(src, STD).replace("level: warn", "level: block"));
  git(src, "add", "-A");
  assert.equal(await human(src, "init"), 0);
  commit(src, "F: promove a block e cria o baseline");
  const F = git(src, "rev-parse", "HEAD").trim();
  w(src, "README.md", "x\n"); commit(src, "B");
  return { src, O, F };
}

test("I1: PR saído de uma base velha — na ponta do PR → 3 (a base não é ancestral); no merge → 1", async () => {
  const { src, O } = await staleRepo();
  git(src, "checkout", "-q", "-b", "stale", O);
  w(src, "src/new.js", "BAD\n"); commit(src, "violação nova a partir da base velha");

  const tip = ciClone(src, { branch: "stale", merge: false });
  const a = gate(tip);
  assert.equal(a.status, 3, a.out);
  assert.match(a.out, /a base não é ancestral do HEAD; rode o gate sobre o merge do PR/);
  assert.doesNotMatch(a.out, /catraca íntegra/);

  const merged = ciClone(src, { branch: "stale" });
  assert.match(r(merged, STD), /level: block/);
  const b = gate(merged);
  assert.equal(b.status, 1, b.out);
  assert.match(b.out, /src\/new\.js:1 \[std-demo\/no-bad\]/);
});

test("I1: merge-base manipulado por pai extra + clone raso → 3; no merge do PR → 1", async () => {
  const { src, O, F } = await staleRepo();
  git(src, "checkout", "-q", "-b", "revert", F);
  w(src, STD, r(src, STD).replace("level: block", "level: warn"));
  w(src, "src/new2.js", "BAD\n");
  commit(src, "rebaixa o std e traz violação");
  const tip = git(src, "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-p", O, "-m", "ponta com pai extra").trim();
  git(src, "reset", "-q", "--hard", tip);

  // Clone raso da ponta do PR + a main inteira: o merge-base "cai" no commit O (std em warn).
  const shallow = ciClone(src, { merge: false, cloneArgs: ["--depth=2", "--single-branch", "--branch=revert"] });
  git(shallow, "fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main");
  assert.equal(git(shallow, "merge-base", "HEAD", ORIGIN_MAIN).trim(), O, "pré-condição do PoC: o merge-base é a base velha");
  const s = gate(shallow);
  assert.equal(s.status, 3, s.out);
  assert.match(s.out, /a base não é ancestral do HEAD/);

  const full = gate(ciClone(src, { branch: "revert", merge: false }));
  assert.equal(full.status, 3, full.out);
  const merged = gate(ciClone(src, { branch: "revert" }));
  assert.equal(merged.status, 1, merged.out);
  assert.match(merged.out, /std-demo: nível block → warn/);
});

test("I1: sem --ci a base não precisa ser ancestral (fase V local numa branch atrasada)", async () => {
  const { src, O } = await staleRepo();
  git(src, "checkout", "-q", "-b", "stale", O);
  w(src, "src/new.js", "ok\n"); commit(src);
  const local = gate(src, { ref: LOCAL_MAIN, ci: false });
  assert.equal(local.status, 0, local.out);
});

// ── I2: o .gitattributes da branch muda os bytes que o linter e o hash enxergam (poc03) ──

test("I2: violação commitada escondida por working-tree-encoding → 1 (o check linta os blobs do HEAD)", async () => {
  const src = await origin();
  w(src, "src/view.xml", '<?xml version="1.0"?>\n<odoo><record id="BAD"/></odoo>\n');
  git(src, "add", "src/view.xml"); // o blob entra em UTF-8, antes de o atributo existir
  w(src, ".gitattributes", "src/view.xml working-tree-encoding=UTF-16\n");
  git(src, "add", ".gitattributes"); git(src, "commit", "-qm", "violação + .gitattributes");
  const ci = ciClone(src);
  assert.match(git(ci, "show", "HEAD:src/view.xml"), /BAD/);
  assert.ok(!readFileSync(join(ci, "src/view.xml")).includes("BAD"), "pré-condição do PoC: na árvore o arquivo está em UTF-16");
  const res = gate(ci);
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /src\/view\.xml:2 \[std-demo\/no-bad\]/);
});

test("I2: dado do linter com eol=crlf vindo do .gitattributes da branch → 3 (árvore ≠ blob na catraca)", async () => {
  const linter = `const fs=require("fs"),path=require("path");
const tokens=fs.readFileSync(path.join(__dirname,"proibidos.txt"),"utf8").split("\\n").filter(Boolean);
const c=fs.readFileSync(process.argv[2],"utf8");let h=0;
c.split("\\n").forEach((l,i)=>{for(const t of tokens)if(l.includes(t)){h++;console.log("VIOLATION no-bad "+process.argv[2]+":"+(i+1)+" remova "+t);}});
process.exit(h?1:0);`;
  const src = await origin({ linterBody: linter, setup: (root) => w(root, `${M}/proibidos.txt`, "BAD\nWORSE\n") });
  w(src, "src/new.js", "BAD\n");
  w(src, ".gitattributes", `${M}/proibidos.txt text eol=crlf\n`);
  commit(src, "violação + eol=crlf no dado do linter");
  assert.equal(git(src, "diff", "--stat", "main", "HEAD", "--", M), "", "o blob do dado do linter não mudou");
  const ci = ciClone(src);
  assert.equal(r(ci, `${M}/proibidos.txt`), "BAD\r\nWORSE\r\n", "pré-condição do PoC: o checkout aplicou eol=crlf");
  const res = gate(ci);
  assert.equal(res.status, 3, res.out);
  assert.match(res.out, /difere do blob do HEAD/);
  assert.match(res.out, /machine\/proibidos\.txt/);
});

test("I2: sob --ci, linter editado ou arquivo a mais em machine/ sem commit → 3; local → nota", async () => {
  const dirty = await origin();
  w(dirty, `${M}/std-demo.js`, `${LINT_BAD}\n// mexido\n`);
  const d = gate(dirty, { ref: LOCAL_MAIN });
  assert.equal(d.status, 3, d.out);
  assert.match(d.out, /difere do blob do HEAD/);
  const local = gate(dirty, { ref: LOCAL_MAIN, ci: false });
  assert.equal(local.status, 0, local.out);
  assert.match(local.out, /não commitad/);

  const extra = await origin();
  w(extra, `${M}/sombra.js`, "module.exports = 1;\n");
  const e = gate(extra, { ref: LOCAL_MAIN });
  assert.equal(e.status, 3, e.out);
  assert.match(e.out, /não está no HEAD/);

  const md = await origin();
  w(md, STD, r(md, STD).replace("level: block", "level: warn"));
  const m = gate(md, { ref: LOCAL_MAIN });
  assert.equal(m.status, 3, m.out);
});

test("I2: sob --ci o check não vê arquivo fora do HEAD; violação só na árvore não conta, a do blob conta", async () => {
  const src = await origin();
  w(src, "src/new.js", "BAD\n"); commit(src);
  w(src, "src/new.js", "ok\n");            // "consertado" só na árvore, depois do commit
  w(src, "src/nao-rastreado.js", "BAD\n"); // nunca foi commitado
  const res = gate(src, { ref: LOCAL_MAIN });
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /src\/new\.js:1 \[std-demo\/no-bad\]/);
  assert.doesNotMatch(res.out, /nao-rastreado/);
});

// ── I3: módulo sombreado (poc04) ──────────────────────────────────────────────────────

const REQ_LINTER = (mod, expr) => `const dep = require(${JSON.stringify(mod)});
const tokens = ${expr};
const fs=require("fs");const c=fs.readFileSync(process.argv[2],"utf8");let h=0;
c.split("\\n").forEach((l,i)=>{for(const t of tokens)if(l.includes(t)){h++;console.log("VIOLATION no-bad "+process.argv[2]+":"+(i+1)+" remova "+t);}});
process.exit(h?1:0);`;

test("I3a: machine/regras.js novo sombreia machine/regras/ da base → 1", async () => {
  const src = await origin({ linterBody: REQ_LINTER("./regras", "dep.tokens"), setup: (root) => w(root, `${M}/regras/index.js`, 'exports.tokens=["BAD"];\n') });
  w(src, "src/new.js", "BAD\n");
  w(src, `${M}/regras.js`, "exports.tokens=[];\n");
  commit(src, "violação + machine/regras.js novo");
  const res = gate(ciClone(src));
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /machine\/regras\.js.*sombre/);
});

test("I3a: machine/dados.js novo sombreia machine/dados.json da base → 1", async () => {
  const src = await origin({ linterBody: REQ_LINTER("./dados", "dep"), setup: (root) => w(root, `${M}/dados.json`, '["BAD"]\n') });
  w(src, "src/new.js", "BAD\n");
  w(src, `${M}/dados.js`, "module.exports=[];\n");
  commit(src, "violação + machine/dados.js novo");
  const res = gate(ciClone(src));
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /machine\/dados\.js.*sombre/);
});

test("I3b: package.json ou index.* novo num diretório de machine/ que já existia na base → 1", async () => {
  const setup = (root) => w(root, `${M}/lib/util.js`, "exports.x = 1;\n");
  const pkg = await origin({ setup });
  w(pkg, `${M}/package.json`, '{"type":"commonjs"}\n'); commit(pkg);
  const p = gate(ciClone(pkg));
  assert.equal(p.status, 1, p.out);
  assert.match(p.out, /machine\/package\.json/);
  const idx = await origin({ setup });
  w(idx, `${M}/lib/index.js`, "module.exports = {};\n"); commit(idx);
  const i = gate(ciClone(idx));
  assert.equal(i.status, 1, i.out);
  assert.match(i.out, /machine\/lib\/index\.js/);
});

test("I3c: node_modules versionado sob .context/ que não existia na base → 1 (poc04a)", async () => {
  const realLib = `exports.find=(text,tok)=>text.split("\\n").map((l,i)=>l.includes(tok)?i+1:0).filter(Boolean);\n`;
  const linter = `const { find } = require("minilint");
const fs=require("fs");const hits=find(fs.readFileSync(process.argv[2],"utf8"),"BAD");
for(const n of hits)console.log("VIOLATION no-bad "+process.argv[2]+":"+n+" remova BAD");process.exit(hits.length?1:0);`;
  // A dependência do linter fica VERSIONADA na base: o gate analisa a árvore da base só com o que
  // está no git, e um linter que dependa de pacote instalado pelo job não carrega lá (exit 3).
  const src = await origin({ linterBody: linter, setup: (root) => { w(root, "node_modules/minilint/index.js", realLib); git(root, "add", "-f", "--", "node_modules/minilint/index.js"); } });
  w(src, "src/new.js", "BAD\n");
  w(src, ".context/engineering/standards/node_modules/minilint/index.js", "exports.find=()=>[];\n");
  commit(src, "violação + node_modules que sombreia a dependência do linter");
  const ci = ciClone(src);
  const res = gate(ci);
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /node_modules/);
  assert.match(res.out, /\.context\/engineering\/standards\/node_modules/);
});

test("I3: controle — std novo com linter novo de nome que não colide também é violação (1), sem a razão de sombra", async () => {
  const src = await origin({ setup: (root) => { w(root, `${M}/lib/util.js`, "exports.x = 1;\n"); w(root, `${M}/dados.json`, "[]\n"); } });
  w(src, ".context/engineering/standards/std-novo.md", `---\nid: std-novo\nsource: local\ndescription: x\napplyTo: ["src/**"]\nenforcement:\n  linter: engineering/standards/machine/std-novo.js\n  level: block\n---\n`);
  w(src, `${M}/std-novo.js`, "process.exit(0)\n");
  w(src, `${M}/lib/outro.js`, "exports.y = 2;\n");
  w(src, `${M}/novo-dir/index.js`, "module.exports = 1;\n"); // index.* num diretório NOVO não sombreia nada
  w(src, "src/new.js", "ok\n");
  commit(src);
  const res = gate(ciClone(src));
  // Arquivo novo em machine/ é violação da catraca mesmo sem colidir com nada da base.
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /linter novo: .*machine\/std-novo\.js \(não existia na base; arquivo novo em machine\/ exige revisão humana\)/);
  assert.doesNotMatch(res.out, /nota: linter novo/);
  assert.doesNotMatch(res.out, /sombre/);
});

// ── I4/I6: override = rótulo + review preso ao commit, dados por donos da catraca (poc10) ──

const LABEL = "standards-ratchet-approved";
const labeled = (login, extra = {}) => ({ event: "labeled", label: { name: LABEL }, actor: { login, type: "User" }, created_at: "2026-10-01T10:00:00Z", id: 1, ...extra });
const review = (login, state, sha, extra = {}) => ({ id: 10, user: { login, type: "User" }, state, commit_id: sha, submitted_at: "2026-10-01T11:00:00Z", ...extra });
/** API de mentira. `reviews` e `pr` podem ser funções do sha do head (o HEAD do repositório no momento da chamada). */
function fakeApi(root, { author = "agente", events = [labeled("dona")], reviews = (sha) => [review("dona", "APPROVED", sha)], pr = {}, headSha = null } = {}) {
  const calls = [];
  const api = (path) => {
    calls.push(path);
    const sha = headSha || git(root, "rev-parse", "HEAD").trim();
    if (/\/pulls\/\d+$/.test(path)) return { user: { login: author }, state: "open", head: { sha }, labels: [{ name: LABEL }], ...(typeof pr === "function" ? pr(sha) : pr) };
    const ev = path.match(/\/issues\/\d+\/events\?per_page=100&page=(\d+)$/);
    if (ev) return ev[1] === "1" ? events : [];
    const rv = path.match(/\/pulls\/\d+\/reviews\?per_page=100&page=(\d+)$/);
    if (rv) return rv[1] === "1" ? (typeof reviews === "function" ? reviews(sha) : reviews) : [];
    throw new Error(`404 ${path}`);
  };
  api.calls = calls;
  return api;
}
async function gateWith(root, api, { ref = LOCAL_MAIN, extra = [] } = {}) {
  const out = [];
  const oe = console.error, ol = console.log;
  console.error = (...m) => out.push(m.join(" ")); console.log = (...m) => out.push(m.join(" "));
  let code;
  try {
    code = await runStandardsCommand("gate", [`--base-ref=${ref}`, "--ci", "--allow-weakening", "--pr=7", "--repo=o/r", ...extra], root, { isInteractive: () => false, api });
  } finally { console.error = oe; console.log = ol; }
  return { code, out: out.join("\n") };
}
const co = (text) => (root) => w(root, ".github/CODEOWNERS", text);
const fpOf = (o) => createHash("sha1").update([o.stdId, o.ruleId, o.path, "remova BAD"].join("\0")).digest("hex");

/** O que a dona aprovou: um `accept` legítimo de src/new.js. */
async function acceptedBranch(codeowners = "/.context/ @dona\n") {
  const root = await origin({ setup: co(codeowners) });
  w(root, "src/new.js", "BAD\n"); git(root, "add", "-A");
  const j = spawnSync(process.execPath, [CLI, "check", "--all", "--json", `--project=${root}`], { encoding: "utf8", env: baseEnv() });
  const f = JSON.parse(j.stdout.split("\n")[0]).blocking.find(x => x.path === "src/new.js");
  assert.equal(await human(root, "accept", f.fp, "--reason", "legado de terceiro"), 0);
  commit(root, "accept legítimo");
  return root;
}
/** O push posterior do poc10a: tudo enfraquecido e 300 entradas de baseline com crédito pré-pago. */
function pushEverythingWeakened(root) {
  w(root, `${M}/std-demo.js`, "process.exit(0)\n");
  w(root, ".context/standards.local.yaml", r(root, ".context/standards.local.yaml").replace("disable: [", "disable: [std-demo, "));
  w(root, ".context/.devflow.yaml", "git:\n  strategy: branch-flow\n");
  const bl = JSON.parse(r(root, BL));
  for (let i = 0; i < 300; i++) {
    const e = { stdId: "std-demo", ruleId: "no-bad", path: `src/futuro-${i}.js`, message: "remova BAD" };
    bl.entries.push({ fp: fpOf(e), ...e, count: 50, acceptedAt: "2026-10-01T00:00:00.000Z" });
  }
  w(root, BL, JSON.stringify(bl));
  for (let i = 0; i < 5; i++) w(root, `src/futuro-${i}.js`, "BAD\nBAD\n");
  commit(root, "push depois do rótulo");
}

test("I4: caminho feliz — rótulo e review APPROVED de dona da catraca no head → 0 (na ponta e no merge do PR)", async () => {
  const root = await acceptedBranch();
  const ok = await gateWith(root, fakeApi(root));
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /aprovada por code owner/);
  assert.match(ok.out, /review/);
  // No merge do PR o head do PR é o HEAD^2.
  const ci = ciClone(root);
  const featSha = git(ci, "rev-parse", "HEAD^2").trim();
  assert.equal(featSha, git(root, "rev-parse", "HEAD").trim());
  const merged = await gateWith(ci, fakeApi(ci, { headSha: featSha }), { ref: ORIGIN_MAIN });
  assert.equal(merged.code, 0, merged.out);
});

test("I4: só o rótulo, sem review → 1; só o review, sem rótulo → 1", async () => {
  const root = await acceptedBranch();
  const noReview = await gateWith(root, fakeApi(root, { reviews: [] }));
  assert.equal(noReview.code, 1, noReview.out);
  assert.match(noReview.out, /review/);
  const noLabel = await gateWith(root, fakeApi(root, { events: [] }));
  assert.equal(noLabel.code, 1, noLabel.out);
});

test("I4: rótulo + review no head, e push posterior → 1 (a aprovação fica presa ao commit)", async () => {
  const root = await acceptedBranch();
  const approvedSha = git(root, "rev-parse", "HEAD").trim();
  assert.equal((await gateWith(root, fakeApi(root))).code, 0);
  pushEverythingWeakened(root);
  // O MESMO rótulo e o MESMO review (feito no commit anterior); o head do PR agora é outro.
  const after = await gateWith(root, fakeApi(root, { reviews: [review("dona", "APPROVED", approvedSha)] }));
  assert.equal(after.code, 1, after.out);
  assert.match(after.out, /review/);
  assert.doesNotMatch(after.out, /aprovada por code owner/);
});

test("I4: review de dona da catraca num sha antigo → 1", async () => {
  const root = await acceptedBranch();
  const old = git(root, "rev-parse", "HEAD~1").trim();
  const res = await gateWith(root, fakeApi(root, { reviews: [review("dona", "APPROVED", old)] }));
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /commit/);
});

test("I4: review APPROVED seguido de CHANGES_REQUESTED (ou DISMISSED) da mesma pessoa → 1; COMMENTED depois não anula", async () => {
  const root = await acceptedBranch();
  const two = (second, at = "2026-10-01T12:00:00Z") => (sha) => [review("dona", "APPROVED", sha, { id: 10 }), review("dona", second, sha, { id: 11, submitted_at: at })];
  for (const st of ["CHANGES_REQUESTED", "DISMISSED"]) {
    const res = await gateWith(root, fakeApi(root, { reviews: two(st) }));
    assert.equal(res.code, 1, `${st}\n${res.out}`);
  }
  assert.equal((await gateWith(root, fakeApi(root, { reviews: two("COMMENTED") }))).code, 0);
  // A ordem é a de submitted_at, não a da resposta.
  const reversed = (sha) => [review("dona", "CHANGES_REQUESTED", sha, { id: 11, submitted_at: "2026-10-01T12:00:00Z" }), review("dona", "APPROVED", sha, { id: 10 })];
  assert.equal((await gateWith(root, fakeApi(root, { reviews: reversed }))).code, 1);
});

test("I4: review do autor do PR, de bot, de quem não é dona ou via GitHub App → 1", async () => {
  const root = await acceptedBranch();
  const cases = [
    fakeApi(root, { author: "dona" }),
    fakeApi(root, { reviews: (sha) => [review("fulana", "APPROVED", sha)] }),
    fakeApi(root, { reviews: (sha) => [{ ...review("dona", "APPROVED", sha), user: { login: "dona", type: "Bot" } }] }),
    fakeApi(root, { reviews: (sha) => [{ ...review("dona[bot]", "APPROVED", sha) }] }),
    fakeApi(root, { reviews: (sha) => [review("dona", "APPROVED", sha, { performed_via_github_app: { slug: "agente-ia" } })] }),
    fakeApi(root, { events: [labeled("dona", { performed_via_github_app: { slug: "agente-ia", owner: { login: "o" } } })] }),
  ];
  for (const [k, api] of cases.entries()) {
    const res = await gateWith(root, api);
    assert.equal(res.code, 1, `caso ${k}\n${res.out}`);
  }
});

test("I4: PR fechado → 1; head.sha da API que não é o HEAD nem o HEAD^2 → 1; erro de API → 1", async () => {
  const root = await acceptedBranch();
  for (const state of ["closed", "merged", undefined]) {
    const res = await gateWith(root, fakeApi(root, { pr: { state } }));
    assert.equal(res.code, 1, `${state}\n${res.out}`);
    assert.match(res.out, /aberto/);
  }
  const other = "0".repeat(40);
  const moved = await gateWith(root, fakeApi(root, { headSha: other, reviews: [review("dona", "APPROVED", other)] }));
  assert.equal(moved.code, 1, moved.out);
  assert.match(moved.out, /head/);
  const boom = fakeApi(root);
  const failing = (path) => { if (/\/reviews\?/.test(path)) throw new Error("HTTP 502"); return boom(path); };
  const err = await gateWith(root, failing);
  assert.equal(err.code, 1, err.out);
  assert.match(err.out, /API/);
});

test("I4: crédito pré-pago no baseline com override VÁLIDO → 1 (o override não libera o que excede os achados atuais)", async () => {
  const root = await acceptedBranch();
  const bl = JSON.parse(r(root, BL));
  // A entrada aceita passa a valer 50 ocorrências (a árvore tem 1) e entram entradas de arquivos que nem existem.
  bl.entries.find(e => e.path === "src/new.js").count = 50;
  for (let i = 0; i < 3; i++) {
    const e = { stdId: "std-demo", ruleId: "no-bad", path: `src/futuro-${i}.js`, message: "remova BAD" };
    bl.entries.push({ fp: fpOf(e), ...e, count: 2, acceptedAt: "2026-10-01T00:00:00.000Z" });
  }
  w(root, BL, JSON.stringify(bl)); commit(root, "crédito pré-pago");
  const res = await gateWith(root, fakeApi(root));
  assert.match(res.out, /aprovada por code owner/);
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /crédito pré-pago/);
  assert.match(res.out, /src\/new\.js \(aceita 50, a árvore tem 1/);
  assert.match(res.out, /src\/futuro-0\.js \(aceita 2, a árvore tem 0/);
  // Baixando para o que existe de fato, o mesmo override passa.
  bl.entries = bl.entries.filter(e => !/futuro/.test(e.path));
  bl.entries.find(e => e.path === "src/new.js").count = 1;
  w(root, BL, JSON.stringify(bl)); commit(root, "sem crédito");
  assert.equal((await gateWith(root, fakeApi(root))).code, 0);
});

// ── I5: o teto de linhas só vale para o baseline; as classes graves vêm primeiro (poc10b) ──

test("I5: com 301 entradas de baseline, linter, std e verify aparecem primeiro e o total sai por classe", async () => {
  const root = await acceptedBranch();
  pushEverythingWeakened(root);
  const res = await gateWith(root, fakeApi(root, { events: [] })); // sem override
  assert.equal(res.code, 1, res.out);
  const lines = res.out.split("\n");
  const at = (re) => lines.findIndex(l => re.test(l));
  for (const re of [/linter alterado/, /std-demo: standard removido/, /verify\.standards removido/]) assert.ok(at(re) >= 0, `${re} não aparece no log`);
  const firstBaseline = at(/^ {2}baseline aceita a mais/);
  assert.ok(firstBaseline > at(/linter alterado/) && firstBaseline > at(/standard removido/) && firstBaseline > at(/verify\.standards removido/), "as linhas de baseline vêm depois das graves");
  assert.equal(lines.filter(l => /^ {2}baseline aceita a mais/.test(l)).length, 200);
  assert.match(res.out, /… e mais 101 de baseline/);
  assert.match(res.out, /std 1 · versões 0 · linter 1 · shim 0 · verify 1 · link 0 · baseline 301/);
});

// ── I6 (versão final): aprova quem é dono — pela ÚLTIMA regra que casa no CODEOWNERS da base — de
// TODOS os arquivos da catraca que o PR alterou em relação à base (`git diff --name-only`,
// com removidos e renomeados). Arquivo alterado sem regra que o cubra → não há aprovador.

const by = (root, labelBy, reviewBy = labelBy) => fakeApi(root, { events: [labeled(labelBy)], reviews: (sha) => [review(reviewBy, "APPROVED", sha)] });
const downgradeStd = (root) => w(root, STD, r(root, STD).replace("level: block", "level: warn"));
const dropVerify = (root) => w(root, ".context/.devflow.yaml", "git:\n  strategy: branch-flow\n");

test("I6: CODEOWNERS só de standards/; o PR altera um std e o baseline → a dona aprova (0)", async () => {
  const root = await acceptedBranch("/.context/engineering/standards/ @dona\n"); // o accept alterou o baseline.json
  downgradeStd(root); commit(root, "rebaixa o std");
  assert.deepEqual(git(root, "diff", "--name-only", "main", "HEAD", "--", ".context").trim().split("\n").sort(),
    [BL, STD], "pré-condição: da catraca, o PR alterou só o baseline e um std");
  const ok = await gateWith(root, by(root, "dona"));
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /aprovada por code owner/);
  assert.match(ok.out, /baseline aceita a mais/);
  assert.match(ok.out, /std-demo: nível block → warn/);
  // Sem o review, ou com o rótulo de quem não é dona desses arquivos, continua 1.
  assert.equal((await gateWith(root, fakeApi(root, { reviews: [] }))).code, 1);
  assert.equal((await gateWith(root, by(root, "fulana", "dona"))).code, 1);
});

test("I6: mesmo CODEOWNERS; o PR altera também .context/.devflow.yaml, que não tem dono → 1", async () => {
  const root = await acceptedBranch("/.context/engineering/standards/ @dona\n");
  downgradeStd(root); dropVerify(root); commit(root, "rebaixa o std e mexe no .devflow.yaml");
  const res = await gateWith(root, by(root, "dona"));
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /nenhuma regra do CODEOWNERS da base cobre/);
  assert.match(res.out, /sem responsável: \.context\/\.devflow\.yaml/);
  assert.doesNotMatch(res.out, /aprovada por code owner/);
});

test("I6: /docs/ @estagiaria + /.context/ @arquiteta — só a arquiteta aprova (rótulo e review)", async () => {
  const root = await origin({ setup: co("/docs/ @estagiaria\n/.context/ @arquiteta\n") });
  downgradeStd(root); commit(root, "rebaixa");
  assert.equal((await gateWith(root, by(root, "arquiteta"))).code, 0);
  const a = await gateWith(root, by(root, "estagiaria", "arquiteta"));
  assert.equal(a.code, 1, a.out);
  assert.match(a.out, /estagiaria não consta como responsável pelos arquivos da catraca alterados/);
  const b = await gateWith(root, by(root, "arquiteta", "estagiaria"));
  assert.equal(b.code, 1, b.out);
});

test("I6: standards/ é de @a e .devflow.yaml é de @b, o PR altera os dois → só aprova quem é dono dos dois", async () => {
  // Ninguém é dono dos dois: não há aprovador.
  const split = await origin({ setup: co("/.context/engineering/standards/ @a\n/.context/.devflow.yaml @b\n") });
  downgradeStd(split); dropVerify(split); commit(split, "altera os dois");
  for (const [l, v] of [["a", "a"], ["b", "b"], ["a", "b"]]) {
    const res = await gateWith(split, by(split, l, v));
    assert.equal(res.code, 1, `${l}/${v}\n${res.out}`);
    assert.match(res.out, /nenhuma regra do CODEOWNERS da base cobre/);
  }
  // Com @c dono dos dois: um review de @a sozinho (ou o rótulo de @b) não basta; @c aprova.
  const both = await origin({ setup: co("/.context/engineering/standards/ @a @c\n/.context/.devflow.yaml @b @c\n") });
  downgradeStd(both); dropVerify(both); commit(both, "altera os dois");
  const onlyA = await gateWith(both, by(both, "a"));
  assert.equal(onlyA.code, 1, onlyA.out);
  assert.match(onlyA.out, /a não consta como responsável pelos arquivos da catraca alterados/);
  assert.equal((await gateWith(both, by(both, "c", "a"))).code, 1, "rótulo de @c, review de @a");
  assert.equal((await gateWith(both, by(both, "b", "c"))).code, 1, "rótulo de @b, review de @c");
  assert.equal((await gateWith(both, by(both, "c"))).code, 0);
  // O mesmo PR alterando só o std: @a, dono de standards/, aprova sozinho.
  const onlyStd = await origin({ setup: co("/.context/engineering/standards/ @a @c\n/.context/.devflow.yaml @b @c\n") });
  downgradeStd(onlyStd); commit(onlyStd, "altera só o std");
  assert.equal((await gateWith(onlyStd, by(onlyStd, "a"))).code, 0);
  assert.equal((await gateWith(onlyStd, by(onlyStd, "b"))).code, 1);
});

test("I6: arquivo alterado sem regra que o cubra, ou coberto por regra posterior sem dono → não há aprovador (1)", async () => {
  const none = await origin({ setup: co("/docs/ @dona\n/src/ @dona\n") });
  downgradeStd(none); commit(none);
  const res = await gateWith(none, fakeApi(none));
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /nenhuma regra do CODEOWNERS da base cobre/);
  assert.match(res.out, /sem responsável: \.context\/engineering\/standards\/std-demo\.md/);
  // A última regra que casa vence: /.context/engineering/ sem dono tira a dona de standards/.
  const unset = await origin({ setup: co("* @dona\n/.context/engineering/\n") });
  downgradeStd(unset); commit(unset);
  assert.equal((await gateWith(unset, fakeApi(unset))).code, 1);
  // `*.md @dona` cobre o std (é um .md), mas não o linter: alterando os dois, não há aprovador.
  const md = await origin({ setup: co("*.md @dona\n") });
  downgradeStd(md); commit(md);
  assert.equal((await gateWith(md, fakeApi(md))).code, 0);
  w(md, `${M}/std-demo.js`, `${LINT_BAD}\n// mexido\n`); commit(md);
  const linter = await gateWith(md, fakeApi(md));
  assert.equal(linter.code, 1, linter.out);
  assert.match(linter.out, /sem responsável: \.context\/engineering\/standards\/machine\/std-demo\.js/);
});

test("I6: removido e renomeado contam — os dois nomes entram no conjunto que o aprovador tem de cobrir", async () => {
  const setup = (root) => {
    co("/.context/engineering/standards/ @a\n/.context/standards/ @b\n")(root);
    w(root, `${M}/helper.js`, "module.exports = 1;\n");
  };
  // Removido: o arquivo some do HEAD, mas o dono do caminho antigo é quem aprova.
  const removed = await origin({ setup });
  rmSync(join(removed, M, "helper.js")); commit(removed, "remove");
  assert.equal((await gateWith(removed, by(removed, "a"))).code, 0);
  assert.equal((await gateWith(removed, by(removed, "b"))).code, 1);
  // Renomeado do diretório canônico (de @a) para o legado (de @b): ninguém é dono dos dois nomes.
  const moved = await origin({ setup });
  mkdirSync(join(moved, ".context/standards/machine"), { recursive: true });
  git(moved, "mv", `${M}/helper.js`, ".context/standards/machine/helper.js");
  commit(moved, "renomeia");
  for (const who of ["a", "b"]) {
    const res = await gateWith(moved, by(moved, who));
    assert.equal(res.code, 1, `${who}\n${res.out}`);
    assert.match(res.out, /nenhuma regra do CODEOWNERS da base cobre/);
  }
});

test("I6: violação sem nenhum arquivo da catraca alterado no PR → não há o que aprovar (1)", async () => {
  // A base já tinha o .devflow.yaml como link: o gate acusa em todo PR, e este não toca a catraca.
  const root = demoProject();
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  w(root, "src/old.js", "BAD\n");
  w(root, ".context/devflow.real.yaml", "git:\n  strategy: branch-flow\n");
  symlinkSync("devflow.real.yaml", join(root, ".context/.devflow.yaml"));
  co("* @dona\n")(root);
  git(root, "add", "-A");
  assert.equal(await human(root, "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base"); git(root, "checkout", "-q", "-b", "feat");
  w(root, "src/new.js", "ok\n"); commit(root, "nada da catraca");
  const res = await gateWith(root, fakeApi(root));
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /a base [0-9a-f]{8} tinha link simbólico no caminho da catraca/);
  assert.match(res.out, /nenhum arquivo da catraca foi alterado/);
});

test("I6: shim e node_modules sob .context/ também entram no conjunto (são mudanças que o gate acusa)", async () => {
  const setup = (cos) => (root) => { co(cos)(root); w(root, ".context/bin/devflow-standards.mjs", "// shim v1\n"); };
  const covered = await origin({ setup: setup("/.context/ @dona\n") });
  w(covered, ".context/bin/devflow-standards.mjs", "// shim v2\n"); commit(covered, "shim");
  const ok = await gateWith(covered, fakeApi(covered));
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /shim alterado/);
  const uncovered = await origin({ setup: setup("/.context/engineering/standards/ @dona\n") });
  w(uncovered, ".context/bin/devflow-standards.mjs", "// shim v2\n"); commit(uncovered, "shim");
  const res = await gateWith(uncovered, fakeApi(uncovered));
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /sem responsável: \.context\/bin\/devflow-standards\.mjs/);
  const nm = await origin({ setup: setup("/.context/engineering/standards/ @dona\n") });
  w(nm, ".context/engineering/node_modules/x/index.js", "module.exports = 1;\n"); commit(nm, "node_modules");
  const n = await gateWith(nm, fakeApi(nm));
  assert.equal(n.code, 1, n.out);
  assert.match(n.out, /sem responsável: \.context\/engineering\/node_modules\/x\/index\.js/);
});

// ── Itens baratos ─────────────────────────────────────────────────────────────────────

test("flag desconhecida em gate ou check → uso incorreto (2), nunca ignorada (poc15)", async () => {
  const src = await origin();
  w(src, STD, r(src, STD).replace("level: block", "level: warn")); w(src, "src/new.js", "BAD\n"); commit(src, "rebaixa");
  const ci = ciClone(src);
  // Runner sem a variável CI e a flag digitada errada: antes virava modo local e saía 0.
  const typo = gate(ci, { ci: false, extra: ["--CI"] });
  assert.equal(typo.status, 2, typo.out);
  assert.match(typo.out, /opção desconhecida "--CI"/);
  for (const extra of [["--allow-weakning"], ["--ci=true"], ["-x"], ["--json"], ["--staged"]]) {
    assert.equal(gate(ci, { extra }).status, 2, extra.join(" "));
  }
  const chk = (...a) => spawnSync(process.execPath, [CLI, "check", ...a, `--project=${ci}`], { encoding: "utf8", env: baseEnv() });
  assert.equal(chk("--all", "--CI").status, 2);
  assert.equal(chk("--all", "--base-ref", ORIGIN_MAIN, "--qualquer").status, 2);
  assert.match(chk("--all", "--CI").stderr, /opção desconhecida "--CI"/);
  assert.equal(chk("--all", "--json", "--ci", `--base-ref=${ORIGIN_MAIN}`).status, 0, "as opções conhecidas continuam valendo");
});

test("refs/replace não troca o objeto da base (GIT_NO_REPLACE_OBJECTS)", async () => {
  const src = await origin();
  w(src, STD, r(src, STD).replace("level: block", "level: warn")); commit(src, "rebaixa");
  const ci = ciClone(src);
  // O blob do std da BASE é "substituído" pelo da branch: com replace ativo, base e HEAD ficariam iguais.
  const baseBlob = git(ci, "rev-parse", `${ORIGIN_MAIN}:${STD}`).trim();
  const headBlob = git(ci, "rev-parse", `HEAD:${STD}`).trim();
  git(ci, "replace", baseBlob, headBlob);
  assert.match(git(ci, "show", `${ORIGIN_MAIN}:${STD}`), /level: warn/, "pré-condição: o replace engana um git sem a variável");
  const res = gate(ci);
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /std-demo: nível block → warn/);
});

const fakeCommit = (root, n) => execFileSync("git", ["-C", root, "hash-object", "-t", "commit", "-w", "--stdin"], {
  input: `tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nauthor a <a@a> ${n} +0000\ncommitter a <a@a> ${n} +0000\n\nx\n`, encoding: "utf8", env: baseEnv(),
}).trim();

test("gitlink em machine/: ponteiro trocado → 1; gitlink novo → 1 (poc13)", async () => {
  const src = await origin();
  git(src, "checkout", "-q", "main");
  git(src, "update-index", "--add", "--cacheinfo", `160000,${fakeCommit(src, 0)},${M}/shared`);
  git(src, "commit", "-qm", "base com submódulo em machine/shared");
  git(src, "checkout", "-q", "-B", "feat");
  git(src, "update-index", "--cacheinfo", `160000,${fakeCommit(src, 1)},${M}/shared`);
  git(src, "commit", "-qm", "bump do submódulo dentro de machine/");
  const res = gate(ciClone(src));
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /submódulo em machine\//);
  assert.match(res.out, /machine\/shared/);

  const fresh = await origin();
  git(fresh, "update-index", "--add", "--cacheinfo", `160000,${fakeCommit(fresh, 2)},${M}/novo`);
  git(fresh, "commit", "-qm", "submódulo novo em machine/");
  const n = gate(ciClone(fresh));
  assert.equal(n.status, 1, n.out);
  assert.match(n.out, /submódulo em machine\//);
});

test("gitlink ou link simbólico novo em caminho lintável → nota 'não avaliado' (poc05)", async () => {
  const src = await origin();
  git(src, "update-index", "--add", "--cacheinfo", `160000,${git(src, "rev-parse", "HEAD").trim()},src/vendor`);
  git(src, "commit", "-qm", "submódulo em src/vendor");
  mkdirSync(join(src, "libs"), { recursive: true }); writeFileSync(join(src, "libs/pior.js"), "BAD\n");
  symlinkSync("../libs", join(src, "src/atalho"));
  git(src, "add", "src/atalho", "libs"); git(src, "commit", "-qm", "link de diretório em src/");
  const ci = ciClone(src);
  const res = gate(ci);
  assert.equal(res.status, 0, res.out);
  assert.match(res.out, /não avaliado: src\/vendor \(submódulo/);
  assert.match(res.out, /não avaliado: src\/atalho \(link simbólico/);
  // O que já era link ou submódulo na base não repete a nota.
  const again = await origin({ setup: (root) => { mkdirSync(join(root, "libs")); symlinkSync("../libs", join(root, "src/atalho")); } });
  w(again, "src/new.js", "ok\n"); commit(again);
  assert.doesNotMatch(gate(ciClone(again)).out, /não avaliado/);
});

test("o tmp dos blobs do HEAD é apagado, com check verde, vermelho ou com erro", async () => {
  const src = await origin();
  w(src, "src/new.js", "BAD\n"); commit(src);
  const td = tmp("tmpdir-");
  assert.equal(gate(src, { ref: LOCAL_MAIN, env: { TMPDIR: td } }).status, 1);
  assert.deepEqual(readdirSync(td), []);
  const boom = await origin();
  w(boom, `${M}/std-demo.js`, 'throw new Error("boom")\n'); commit(boom);
  assert.equal(gate(boom, { ref: LOCAL_MAIN, env: { TMPDIR: td } }).status, 3);
  assert.deepEqual(readdirSync(td), []);
});

// ══ Rodada de correção 2 ═══════════════════════════════════════════════════════════════

// ── 1. O casamento do CODEOWNERS tem de fechar sempre (poc27, poc25) ──────────────────

test("r2/I6 (poc27): cópia rebaixada do std com quebra de linha no nome → a dona da regra genérica não aprova", async () => {
  const root = await origin({ setup: co("* @larga\n/.context/ @arquiteta\n") });
  // O std original NÃO é tocado: a branch só acrescenta uma cópia rebaixada, com "\n" no nome, que ordena antes.
  w(root, ".context/engineering/standards/std-demo\n.md", r(root, STD).replace("level: block", "level: warn"));
  w(root, "src/new.js", "BAD\n");
  commit(root, "cópia rebaixada com quebra de linha no nome");
  for (const who of ["larga", "arquiteta"]) {
    const res = await gateWith(root, by(root, who));
    assert.equal(res.code, 1, `${who}\n${res.out}`);
    assert.match(res.out, /std-demo: nível block → warn/);
    assert.match(res.out, /caractere de controle/);
    assert.doesNotMatch(res.out, /aprovada por code owner/);
  }
});

test("r2/I6 (poc25): `/.context/eng* @arquiteta` vale para o que está abaixo do diretório — a regra genérica anterior não aprova", async () => {
  const root = await origin({ setup: co("/.context/ @larga\n/.context/eng* @arquiteta\n") });
  downgradeStd(root); commit(root, "rebaixa");
  const larga = await gateWith(root, by(root, "larga"));
  assert.equal(larga.code, 1, larga.out);
  assert.match(larga.out, /larga não consta como responsável/);
  assert.equal((await gateWith(root, by(root, "arquiteta"))).code, 0);
});

test("r2/I6: regra fora do subconjunto suportado depois da última que casa → o arquivo fica sem aprovador", async () => {
  for (const later of ["/my\\ app/.context/ @arquiteta", "/.context/[e]ngineering/ @arquiteta", "/.context/engineering/*** @arquiteta"]) {
    const root = await origin({ setup: co(`* @larga\n${later}\n`) });
    downgradeStd(root); commit(root, "rebaixa");
    for (const who of ["larga", "arquiteta"]) {
      const res = await gateWith(root, by(root, who));
      assert.equal(res.code, 1, `${later} / ${who}\n${res.out}`);
      assert.match(res.out, /fora do subconjunto/);
    }
  }
});

test("r2/I6: controle — `/.context/ @y` normal continua aprovando (0), e só @y", async () => {
  const root = await origin({ setup: co("* @x\n/.context/ @y\n") });
  downgradeStd(root); commit(root, "rebaixa");
  assert.equal((await gateWith(root, by(root, "y"))).code, 0);
  assert.equal((await gateWith(root, by(root, "x"))).code, 1);
});

// ── 2. O `**` do applyTo casa terminador de linha (poc22, poc22b) ─────────────────────

test("r2/glob (poc22): violação num arquivo com quebra de linha no nome → gate --ci 1", async () => {
  const src = await origin();
  w(src, "src/mod\n.js", "// BAD\nmodule.exports = 1;\n");
  w(src, "src/usa.js", 'module.exports = require("./mod\\n.js");\n');
  commit(src, "violação num arquivo com quebra de linha no nome");
  const ci = ciClone(src);
  assert.ok(git(ci, "ls-tree", "-r", "-z", "--name-only", "HEAD", "src").split("\0").includes("src/mod\n.js"));
  const res = gate(ci);
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /1 violação\(ões\) nova\(s\) de nível block/);
  assert.match(res.out, /\[std-demo\/no-bad\]/);
  // No modo local (árvore de trabalho) e no check --all também.
  assert.equal(gate(ci, { ci: false }).status, 1);
  const chk = spawnSync(process.execPath, [CLI, "check", "--all", `--project=${ci}`], { encoding: "utf8", env: baseEnv() });
  assert.equal(chk.status, 1, chk.stdout + chk.stderr);
});

test("r2/glob (poc22b): violação sob um diretório com U+2028 no nome → gate --ci 1, com os dois achados", async () => {
  const src = await origin();
  w(src, "src/util\u2028/x.js", "// BAD\nmodule.exports = 1;\n");
  w(src, "src/controle.js", "// BAD\n");
  commit(src, "violação num diretório com U+2028 no nome");
  const res = gate(ciClone(src));
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /2 violação\(ões\) nova\(s\) de nível block/);
  assert.match(res.out, /src\/controle\.js:1 \[std-demo\/no-bad\]/);
});

// ── 3a. Vínculo do override com o commit: HEAD = head do PR, ou merge de exatamente dois pais (poc24) ──

/** Branch com o std rebaixado (commit A), aprovada pela dona em A; devolve também um commit X fora do PR com o linter trocado. */
async function approvedDowngrade() {
  const root = await origin({ setup: co("/.context/ @dona\n") });
  downgradeStd(root); commit(root, "rebaixa");
  const A = git(root, "rev-parse", "HEAD").trim();
  const approvedAtA = () => fakeApi(root, { headSha: A });
  git(root, "checkout", "-q", "-B", "extra", A);
  w(root, `${M}/std-demo.js`, "process.exit(0)\n"); commit(root, "X: linter no-op, fora do PR");
  const X = git(root, "rev-parse", "HEAD").trim();
  return { root, A, X, approvedAtA };
}
const commitTree = (root, tree, parents, msg) => execFileSync("git", ["-C", root, "commit-tree", tree, ...parents.flatMap(p => ["-p", p]), "-m", msg], { encoding: "utf8", env: baseEnv() }).trim();

test("r2/I4 (poc24): controle — na ponta do PR e no merge de dois pais com a base, o override vale (0)", async () => {
  const { root, A, approvedAtA } = await approvedDowngrade();
  git(root, "checkout", "-q", "--detach", A);
  assert.equal((await gateWith(root, approvedAtA())).code, 0);
  git(root, "checkout", "-q", "--detach", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "merge do PR", A);
  const ok = await gateWith(root, approvedAtA());
  assert.equal(ok.code, 0, ok.out);
  // Review no SHA do merge (não no head do PR) não vale.
  const merge = git(root, "rev-parse", "HEAD").trim();
  assert.equal((await gateWith(root, fakeApi(root, { headSha: A, reviews: [review("dona", "APPROVED", merge)] }))).code, 1);
});

test("r2/I4 (poc24): HEAD com três pais, HEAD^2 = commit aprovado, árvore com o linter trocado → 1", async () => {
  const { root, A, X, approvedAtA } = await approvedDowngrade();
  const octo = commitTree(root, `${X}^{tree}`, ["main", A, X], "polvo");
  git(root, "checkout", "-q", "--detach", octo);
  const res = await gateWith(root, approvedAtA());
  assert.match(res.out, /linter alterado/);
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /não é o HEAD local nem o segundo pai de um merge/);
  assert.doesNotMatch(res.out, /aprovada por code owner/);
});

// Rodada 3: a conferência da árvore do merge (`git merge-tree`) saiu — dava falsa recusa. O merge
// "do mal" com os pais certos volta a ser RESÍDUO DECLARADO: está fora do modelo, porque exige
// controlar o HEAD em que o CI roda. O teste fixa o comportamento para que ele não mude calado.
test("r3/E1 (poc24): resíduo declarado — merge 'do mal' com os pais certos (base, A) e outra árvore não é distinguido (0)", async () => {
  const { root, A, X, approvedAtA } = await approvedDowngrade();
  const evil = commitTree(root, `${X}^{tree}`, ["main", A], "merge 'do mal'");
  git(root, "checkout", "-q", "--detach", evil);
  const res = await gateWith(root, approvedAtA());
  assert.match(res.out, /linter alterado/);
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /aprovada por code owner/);
});

test("r2/I4: merge de dois pais cujo primeiro pai não é a base resolvida → o segundo pai não vale como head (1)", async () => {
  const root = demoProject();
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  w(root, "src/old.js", "BAD\n");
  co("/.context/ @dona\n")(root);
  git(root, "add", "-A");
  assert.equal(await human(root, "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base0");
  const base0 = git(root, "rev-parse", "HEAD").trim();
  git(root, "commit", "-q", "--allow-empty", "-m", "base1");
  git(root, "checkout", "-q", "-b", "feat");
  downgradeStd(root); commit(root, "rebaixa");
  const A = git(root, "rev-parse", "HEAD").trim();
  git(root, "checkout", "-q", "--detach", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "merge do PR", A);
  // Com a base certa (a ponta da main = HEAD^1) vale; com uma base mais velha, o HEAD^1 não é a base.
  assert.equal((await gateWith(root, fakeApi(root, { headSha: A }))).code, 0);
  const older = await gateWith(root, fakeApi(root, { headSha: A }), { ref: base0 });
  assert.equal(older.code, 1, older.out);
  assert.match(older.out, /não é o HEAD local nem o segundo pai de um merge/);
});

// ── 3b. Sob --ci o caminho do arquivo é resolvido só pelos blobs (poc21, caso d) ───────

test("r2/I2 (poc21d): src/ trocado por link para fora do applyTo depois do checkout → o blob do HEAD continua lintado (1)", async () => {
  const src = await origin();
  w(src, "src/new.js", "BAD\n"); commit(src, "violação");
  const ci = ciClone(src);
  assert.equal(gate(ci).status, 1, "controle");
  renameSync(join(ci, "src"), join(ci, "fora_do_escopo"));
  symlinkSync("fora_do_escopo", join(ci, "src"));
  assert.equal(git(ci, "show", "HEAD:src/new.js"), "BAD\n", "o HEAD segue intacto");
  const res = gate(ci);
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /src\/new\.js:1 \[std-demo\/no-bad\]/);
});

// ══ Rodada de correção 3 ═══════════════════════════════════════════════════════════════

const cp = (n) => String.fromCodePoint(n);
const LS = cp(0x2028);

// ── 1. `/*` ancorado só casa arquivos da raiz (poc32) ─────────────────────────────────

test("r3/I6 (poc32): `/.context/ @arquiteta` seguido de `/* @larga` → @larga não aprova (o arquivo aninhado é dúvida)", async () => {
  const root = await origin({ setup: co("/.context/ @arquiteta\n/* @larga\n") });
  downgradeStd(root); commit(root, "rebaixa");
  for (const who of ["larga", "arquiteta"]) {
    const res = await gateWith(root, by(root, who));
    assert.equal(res.code, 1, `${who}\n${res.out}`);
    assert.match(res.out, /filhos diretos/);
    assert.doesNotMatch(res.out, /aprovada por code owner/);
  }
  // Controle: com a regra da catraca por último, a arquiteta aprova e a larga não.
  const ok = await origin({ setup: co("/* @larga\n/.context/ @arquiteta\n") });
  downgradeStd(ok); commit(ok, "rebaixa");
  assert.equal((await gateWith(ok, by(ok, "arquiteta"))).code, 0);
  assert.equal((await gateWith(ok, by(ok, "larga"))).code, 1);
});

// ── 2. A regra do achado não se perde em caminho com CR ou U+2028 (poc33) ─────────────

const STD_WARN_RULE_BLOCK = `---\nid: std-demo\nsource: local\ndescription: demo\napplyTo: ["src/**"]\nenforcement:\n  linter: engineering/standards/machine/std-demo.js\n  level: warn\n  rules:\n    no-bad: block\n---\n## Princípios\n- sem BAD\n`;

test("r3/parser (poc33): regra em block num std warn, violação em caminho com U+2028 e com CR → gate --ci 1", async () => {
  const src = await origin({ setup: (root) => w(root, STD, STD_WARN_RULE_BLOCK) });
  w(src, "src/controle.js", "ok\n");
  w(src, `src/util${LS}/x.js`, "// BAD\nmodule.exports = 1;\n");
  w(src, "src/cr\rnome.js", "// BAD\n");
  commit(src, "violação da regra block em caminhos com U+2028 e CR");
  const res = gate(ciClone(src));
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /2 violação\(ões\) nova\(s\) de nível block/);
  assert.doesNotMatch(res.out, /\[std-demo\/std-demo\]/);
  // Regra, linha e mensagem inteiras (o caminho sai numa linha só no log).
  assert.match(res.out, /^ {2}src\/cr nome\.js:1 \[std-demo\/no-bad\] remova BAD$/m);
  assert.match(res.out, /^ {2}src\/util \/x\.js:1 \[std-demo\/no-bad\] remova BAD$/m);
  // Controle: o mesmo std num arquivo de nome comum.
  w(src, "src/normal.js", "// BAD\n"); commit(src, "controle");
  const ctl = gate(ciClone(src));
  assert.equal(ctl.status, 1, ctl.out);
  assert.match(ctl.out, /3 violação\(ões\) nova\(s\) de nível block/);
});

// ── 3. E1 saiu: o merge do CI vale como head sem `git merge-tree` (poc34) ─────────────

const notes = (mark = {}) => Array.from({ length: 20 }, (_, i) => mark[i + 1] ?? `linha ${i + 1}`).join("\n") + "\n";

test("r3/E1 (poc34): o PR acrescenta `-merge` ao .gitattributes; o merge limpo do CI continua valendo como head (0)", async () => {
  const src = await origin({ setup: (root) => { co("/.context/ @dona\n")(root); w(root, "notas.txt", notes()); } });
  w(src, "notas.txt", notes({ 19: "linha 19 (PR)" }));
  w(src, ".gitattributes", "notas.txt -merge\n");
  downgradeStd(src);
  commit(src, "PR");
  const A = git(src, "rev-parse", "feat").trim();
  git(src, "checkout", "-q", "main");
  w(src, "notas.txt", notes({ 2: "linha 2 (main)" })); commit(src, "main avança");
  git(src, "checkout", "-q", "feat");
  const ci = ciClone(src); // HEAD = merge(main, feat), feito sem o .gitattributes do PR na árvore
  assert.deepEqual(git(ci, "rev-list", "--parents", "-n", "1", "HEAD").trim().split(" ").slice(1),
    [git(ci, "rev-parse", ORIGIN_MAIN).trim(), A]);
  const res = await gateWith(ci, fakeApi(ci, { headSha: A }), { ref: ORIGIN_MAIN });
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /aprovada por code owner/);
  // O gate não deixa objeto solto no repositório (o merge-tree gravava a árvore do merge).
  const loose = () => Number(git(ci, "count-objects").trim().split(" ")[0]);
  const before = loose();
  await gateWith(ci, fakeApi(ci, { headSha: A }), { ref: ORIGIN_MAIN });
  assert.equal(loose(), before);
});

// ── 5a. O caminho do achado não injeta linha no log do check nem do gate ──────────────

test("r3/log: quebra de linha no nome do arquivo não injeta linha no log; o --json traz o nome real", async () => {
  const src = await origin();
  const fakeOk = "src/x\n✓ standards: nenhuma violação nova de nível block.js";
  const fakeNote = "src/cr\r[standards] catraca aprovada.js";
  w(src, fakeOk, "// BAD\n");
  w(src, fakeNote, "// BAD\n");
  commit(src, "nomes que tentam escrever no log");
  const ci = ciClone(src);
  // Como um visualizador de log parte as linhas: em "\n", em "\r" e nos separadores Unicode.
  const logLines = (text) => text.split(/\r\n|\n|\r|\u2028|\u2029/);
  const res = gate(ci);
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /2 violação\(ões\) nova\(s\) de nível block/);
  for (const out of [res.out, gate(ci, { ci: false }).out]) {
    assert.ok(!logLines(out).some(l => l.startsWith("✓ standards: nenhuma violação")), out);
    assert.ok(!logLines(out).some(l => l.startsWith("[standards] catraca aprovada")), out);
    assert.match(out, /^ {2}src\/x ✓ standards: nenhuma violação nova de nível block\.js:\? \[std-demo\/no-bad\]/m);
    assert.match(out, /^ {2}src\/cr \[standards\] catraca aprovada\.js:1 \[std-demo\/no-bad\] remova BAD$/m);
  }
  const chk = spawnSync(process.execPath, [CLI, "check", "--all", "--json", `--project=${ci}`], { encoding: "utf8", env: baseEnv() });
  assert.equal(chk.status, 1, chk.stdout + chk.stderr);
  const paths = JSON.parse(chk.stdout.split("\n")[0]).blocking.map(f => f.path).sort();
  assert.deepEqual(paths, [fakeNote, fakeOk].sort(), "o --json traz o caminho real");
  assert.ok(!logLines(chk.stderr).some(l => l.startsWith("✓ standards: nenhuma violação") || l.startsWith("[standards] catraca aprovada")), chk.stderr);
});

// Linter no formato legado, que repete o caminho dentro da MENSAGEM.
const LINT_LEGACY = `const fs=require("fs");const c=fs.readFileSync(process.argv[2],"utf8");
if(c.includes("BAD")){console.log("VIOLATION: no-bad — remova BAD ["+process.argv[2]+"]");process.exit(1);}process.exit(0);`;

test("r3/log: a mensagem do linter que repete o caminho também não injeta linha no log", async () => {
  const src = await origin({ linterBody: LINT_LEGACY });
  const fakeNote = "src/cr\r[standards] catraca aprovada.js";
  w(src, fakeNote, "// BAD\n");
  w(src, `src/ls${LS}[standards] catraca aprovada.js`, "// BAD\n");
  commit(src, "nomes que tentam escrever no log pela mensagem");
  const res = gate(ciClone(src));
  assert.equal(res.status, 1, res.out);
  assert.match(res.out, /2 violação\(ões\) nova\(s\) de nível block/);
  assert.ok(!res.out.split(/\r\n|\n|\r|\u2028|\u2029/).some(l => l.startsWith("[standards] catraca aprovada")), res.out);
  assert.match(res.out, /^ {2}src\/cr \[standards\] catraca aprovada\.js:\? \[std-demo\/no-bad\] no-bad — remova BAD \[src\/cr \[standards\] catraca aprovada\.js\]$/m);
});

test("r3/log: link simbólico staged com quebra de linha no nome → a nota 'ignorado' do check --staged sai numa linha só", async () => {
  const root = await origin();
  symlinkSync("old.js", join(root, "src/x\n[standards] catraca aprovada"));
  git(root, "add", "-A");
  const chk = spawnSync(process.execPath, [CLI, "check", "--staged", `--project=${root}`], { encoding: "utf8", env: baseEnv() });
  const out = chk.stdout + chk.stderr;
  assert.equal(chk.status, 0, out);
  assert.match(out, /^\[standards\] src\/x \[standards\] catraca aprovada: ignorado \(modo 120000/m);
  assert.ok(!out.split("\n").some(l => l.startsWith("[standards] catraca aprovada")), out);
});

// ── 5b. CODEOWNERS com 3 MB ou mais é tratado como ausente ─────────────────────────────

test("r3: CODEOWNERS da base com 3 MB ou mais → não há aprovador (o GitHub ignora o arquivo inteiro)", async () => {
  const rule = "/.context/ @dona\n";
  const sized = (n) => `${rule}#${"x".repeat(n - rule.length - 2)}\n`;
  const under = await origin({ setup: co(sized(2_999_999)) });
  downgradeStd(under); commit(under, "rebaixa");
  assert.equal((await gateWith(under, fakeApi(under))).code, 0);
  for (const n of [3_000_000, 5_000_000]) {
    const root = await origin({ setup: co(sized(n)) });
    downgradeStd(root); commit(root, "rebaixa");
    const res = await gateWith(root, fakeApi(root));
    assert.equal(res.code, 1, `${n}\n${res.out}`);
    assert.match(res.out, /CODEOWNERS da base .*3 MB/);
    assert.doesNotMatch(res.out, /aprovada por code owner/);
  }
});
