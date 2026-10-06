// tests/integration/test-standards-gate.mjs — `gate`: a catraca contra o merge-base (ADR-015 D6/D8, T18).
// Nenhum teste chama a API real do GitHub: a API é injetada ou um `gh` de mentira entra no PATH.
// A base vai sempre na forma completa (refs/heads/main): sob --ci um nome curto só resolve em
// refs/remotes/ (rodada de correção 1; os PoCs da revisão estão em test-standards-gate-r1.mjs).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import {
  writeFileSync, readFileSync, rmSync, mkdtempSync, mkdirSync, symlinkSync, renameSync, readdirSync,
  realpathSync, utimesSync, chmodSync, existsSync, cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import { resolveArgv } from "../../scripts/lib/verify-run.mjs";
import { demoProject as rawDemoProject, LINT_BAD } from "../helpers/standards-fixture.mjs";

const CLI = join(process.cwd(), "scripts/devflow-standards.mjs");
const env = { ...process.env, CI: "" };
const TEMPS = [];
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TEMPS.push(d); return d; };
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });
const demoProject = (o) => { const r = rawDemoProject(o); TEMPS.push(r); return r; };

const gate = (root, ...a) => spawnSync("node", [CLI, "gate", "--base-ref=refs/heads/main", ...a, `--project=${root}`], { encoding: "utf8", env });
const ci = (root, ...a) => gate(root, "--ci", ...a);
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
const S = (root) => join(root, ".context/engineering/standards");
const human = (root, ...a) => runStandardsCommand("baseline", a, root, { isInteractive: () => true });
const runWith = (root, extraEnv, ...a) => spawnSync("node", [CLI, ...a, `--project=${root}`], { encoding: "utf8", env: { ...env, ...extraEnv } });

// `setup(root)` roda antes do commit da base; `linterBody` troca o linter do std-demo.
async function base({ withBaseline = true, setup = null, linterBody = undefined } = {}) {
  const root = demoProject(linterBody === undefined ? undefined : { linterBody });
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  writeFileSync(join(root, ".context/.devflow.yaml"), 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  if (setup) setup(root);
  git(root, "add", "-A");
  if (withBaseline) await human(root, "init");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  git(root, "checkout", "-q", "-b", "feat");
  return root;
}
const commit = (root) => { git(root, "add", "-A"); git(root, "commit", "-qm", "x"); };

test("branch limpa → gate 0", async () => {
  const root = await base();
  writeFileSync(join(root, "src/new.js"), "ok\n"); commit(root);
  assert.equal(ci(root).status, 0);
});

// O brief fazia rm + init no mesmo commit; desde a T7 (C15) o init é recusado enquanto o HEAD
// tem baseline. O ataque real é em dois passos: commita a remoção e só então roda o init.
test("baseline regravado com violação nova → 1", async () => {
  const root = await base();
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  rmSync(join(S(root), "baseline.json"));
  commit(root);
  assert.equal(await human(root, "init"), 0);
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /baseline aceita a mais/);
});

test("baseline removido → 1", async () => {
  const root = await base();
  rmSync(join(S(root), "baseline.json")); commit(root);
  assert.equal(ci(root).status, 1);
});

test("nível rebaixado → 1; --allow-weakening sem --pr/--repo não vale", async () => {
  const root = await base();
  const md = join(S(root), "std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace("level: block", "level: warn")); commit(root);
  const r = ci(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /std-demo: nível block → warn/);
  assert.equal(ci(root, "--allow-weakening").status, 1);
});

test("appliesFrom desliga o std → 1", async () => {
  const root = await base();
  const md = join(S(root), "std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace("source: local", "source: local\nappliesFrom: 1")); commit(root);
  const r = ci(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /faixa de versão/);
});

test("disable no standards.local.yaml → 1", async () => {
  const root = await base();
  const y = join(root, ".context/standards.local.yaml");
  writeFileSync(y, readFileSync(y, "utf8").replace("disable: [", "disable: [std-demo, ")); commit(root);
  assert.equal(ci(root).status, 1);
});

test("linter do projeto alterado → 1", async () => {
  const root = await base();
  writeFileSync(join(S(root), "machine/std-demo.js"), "process.exit(0)"); commit(root);
  assert.equal(ci(root).status, 1);
});

test("verify.standards removido → 1", async () => {
  const root = await base();
  writeFileSync(join(root, ".context/.devflow.yaml"), "git:\n  strategy: branch-flow\n"); commit(root);
  assert.equal(ci(root).status, 1);
});

test("accept do operador na branch: V local passa com nota; CI decide", async () => {
  const root = await base();
  writeFileSync(join(root, "src/new.js"), "BAD\n"); git(root, "add", "-A");
  const r = spawnSync("node", [CLI, "check", "--all", "--json", `--project=${root}`], { encoding: "utf8", env });
  const fp = JSON.parse(r.stdout.split("\n")[0]).blocking.find(f => f.path === "src/new.js").fp;
  assert.equal(await human(root, "accept", fp, "--reason", "legado de terceiro"), 0);
  commit(root);
  const local = gate(root);
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stderr, /nota|o CI vai falhar/);
  assert.equal(ci(root).status, 1);
});

test("adoção: base sem baseline; branch com violação nova + init → 1", async () => {
  const root = await base({ withBaseline: false });
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  await human(root, "init"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /adoção/);
  assert.match(r.stderr, /adoção aceita o que a base não tinha: std-demo\/no-bad em src\/new\.js/);
});

test("adoção legítima: só o legado da base → 0", async () => {
  const root = await base({ withBaseline: false });
  await human(root, "init"); commit(root);
  const r = ci(root);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /adoção aceita/);
});

test("sem merge-base: --ci falha fechado (3); local segue com nota", async () => {
  const root = await base();
  assert.equal(spawnSync("node", [CLI, "gate", "--base-ref=origin/nao-existe", "--ci", `--project=${root}`], { encoding: "utf8", env }).status, 3);
  assert.equal(spawnSync("node", [CLI, "gate", "--base-ref=origin/nao-existe", `--project=${root}`], { encoding: "utf8", env }).status, 0);
});

test("o sinal reservado passa a rodar o gate", () => {
  assert.deepEqual(resolveArgv("standards", ["devflow-standards", "gate"], { ci: true, baseRef: "origin/x" }).slice(2), ["gate", "--base-ref=origin/x", "--ci"]);
});

// ── Decisões do controller ──────────────────────────────────────────────────────────

const LABEL = "standards-ratchet-approved";
const labeled = (login, type = "User") => ({ event: "labeled", label: { name: LABEL }, actor: { login, type } });
// O override exige rótulo E review APPROVED no head do PR. Por padrão a API de mentira traz um
// review válido da dona no HEAD do repositório (`api.root`, preenchido por gateWithApi), para
// que cada teste varie só o rótulo; `reviews` troca isso.
function fakeApi({ author = "agente", events = [], reviews = null } = {}) {
  const calls = [];
  const api = (path) => {
    calls.push(path);
    const sha = git(api.root, "rev-parse", "HEAD").trim();
    if (/\/pulls\/\d+$/.test(path)) return { user: { login: author }, state: "open", head: { sha } };
    const ev = path.match(/\/issues\/\d+\/events\?per_page=100&page=(\d+)$/);
    if (ev) return ev[1] === "1" ? events : [];
    const rv = path.match(/\/pulls\/\d+\/reviews\?per_page=100&page=(\d+)$/);
    if (rv) return rv[1] === "1" ? (reviews ?? [{ id: 1, user: { login: "dona", type: "User" }, state: "APPROVED", commit_id: sha }]) : [];
    throw new Error(`rota inesperada ${path}`);
  };
  api.calls = calls;
  return api;
}

// Captura console.log e console.error de uma chamada in-process.
async function capture(fn) {
  const out = [];
  const origE = console.error, origL = console.log;
  console.error = (...m) => out.push(m.map(String).join(" "));
  console.log = (...m) => out.push(m.map(String).join(" "));
  try { return { code: await fn(), out: out.join("\n") }; } finally { console.error = origE; console.log = origL; }
}
const gateWithApi = (root, api, ...a) => {
  api.root = root;
  return capture(() => runStandardsCommand(
    "gate", ["--base-ref=refs/heads/main", "--ci", "--allow-weakening", "--pr=7", "--repo=o/r", ...a], root, { isInteractive: () => false, api },
  ));
};
const withCodeowners = (text) => (root) => {
  mkdirSync(join(root, ".github"), { recursive: true });
  writeFileSync(join(root, ".github/CODEOWNERS"), text);
};
const downgrade = (root) => {
  const md = join(S(root), "std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace("level: block", "level: warn"));
};

test("override: rótulo aplicado por code owner da base → 0 com aviso; pelo autor do PR → 1", async () => {
  const root = await base({ setup: withCodeowners("/.context/ @dona\n") });
  downgrade(root); commit(root);
  const ok = await gateWithApi(root, fakeApi({ events: [labeled("dona")] }));
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /aprovada por code owner/);
  assert.match(ok.out, /std-demo: nível block → warn/);
  const self = await gateWithApi(root, fakeApi({ author: "dona", events: [labeled("dona")] }));
  assert.equal(self.code, 1, self.out);
  assert.match(self.out, /autor do PR/);
  const none = await gateWithApi(root, fakeApi({ events: [] }));
  assert.equal(none.code, 1, none.out);
});

test("override: sem violação, a API nem é consultada", async () => {
  const root = await base({ setup: withCodeowners("* @dona\n") });
  writeFileSync(join(root, "src/new.js"), "ok\n"); commit(root);
  const api = fakeApi({ events: [labeled("dona")] });
  const r = await gateWithApi(root, api);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(api.calls, []);
});

test("override: o CODEOWNERS é o da BASE — quem se inclui na branch não aprova", async () => {
  const root = await base({ setup: withCodeowners("* @dona\n") });
  downgrade(root);
  writeFileSync(join(root, ".github/CODEOWNERS"), "* @dona @comparsa\n");
  commit(root);
  const r = await gateWithApi(root, fakeApi({ events: [labeled("comparsa")] }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /comparsa não consta como responsável pelos arquivos da catraca alterados neste PR \(CODEOWNERS da base\)/);
});

test("override: base sem CODEOWNERS → 1, mesmo com a branch criando um", async () => {
  const root = await base();
  downgrade(root);
  withCodeowners("* @dona\n")(root);
  commit(root);
  const r = await gateWithApi(root, fakeApi({ events: [labeled("dona")] }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /a base não tem CODEOWNERS/);
});

test("override só existe sob --ci: no modo local a violação é nota e a API não é consultada", async () => {
  const root = await base({ setup: withCodeowners("* @dona\n") });
  downgrade(root); commit(root);
  const api = fakeApi({ events: [labeled("dona")] });
  const saved = process.env.CI;
  process.env.CI = ""; // o isCI() do processo de teste não pode ligar o modo CI aqui
  try {
    const r = await capture(() => runStandardsCommand(
      "gate", ["--base-ref=refs/heads/main", "--allow-weakening", "--pr=7", "--repo=o/r"], root, { isInteractive: () => false, api },
    ));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /nota: catraca enfraquecida/);
    assert.deepEqual(api.calls, []);
  } finally {
    if (saved === undefined) delete process.env.CI; else process.env.CI = saved;
  }
});

// ── Ruling pós-entrega: com o override APROVADO, o check usa o baseline da ÁRVORE ──────
// É o estado que o code owner aprovou. Sem override aprovado, vale o baseline do merge-base.
// Sem isso um `accept` legítimo do operador nunca passava no CI (D6: só o humano aumenta o baseline).

// Branch em que o operador aceitou src/new.js no baseline (base com CODEOWNERS: @dona).
async function acceptedOnBranch() {
  const root = await base({ setup: withCodeowners("* @dona\n") });
  writeFileSync(join(root, "src/new.js"), "BAD\n"); git(root, "add", "-A");
  const j = spawnSync("node", [CLI, "check", "--all", "--json", `--project=${root}`], { encoding: "utf8", env });
  const fp = JSON.parse(j.stdout.split("\n")[0]).blocking.find(f => f.path === "src/new.js").fp;
  assert.equal(await human(root, "accept", fp, "--reason", "legado de terceiro"), 0);
  commit(root);
  return root;
}

test("accept na branch, --ci sem rótulo → 1, pela catraca E pelo check (baseline do merge-base)", async () => {
  const root = await acceptedOnBranch();
  const r = ci(root);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.stderr, /✗ catraca enfraquecida vs merge-base/);
  assert.match(r.stderr, /baseline aceita a mais: std-demo\/no-bad em src\/new\.js \(0 → 1\)/);
  assert.match(r.stderr, /baseline do merge-base/);
  assert.match(r.stdout, /1 violação\(ões\) nova\(s\) de nível block/);
  assert.match(r.stdout, /src\/new\.js:1 \[std-demo\/no-bad\]/);
  // --allow-weakening sem aprovação válida não troca o baseline.
  const semPr = ci(root, "--allow-weakening");
  assert.equal(semPr.status, 1, semPr.stderr);
  assert.match(semPr.stdout, /src\/new\.js:1 \[std-demo\/no-bad\]/);
});

test("accept na branch, --ci com rótulo de code owner que não é o autor → 0 (check com o baseline da árvore)", async () => {
  const root = await acceptedOnBranch();
  const r = await gateWithApi(root, fakeApi({ events: [labeled("dona")] }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /aprovada por code owner/);
  assert.match(r.out, /baseline aceita a mais: std-demo\/no-bad em src\/new\.js/);
  assert.match(r.out, /baseline da árvore/);
  assert.doesNotMatch(r.out, /violação\(ões\) nova\(s\)/);
  assert.doesNotMatch(r.out, /baseline do merge-base/);
});

test("accept na branch, --ci com rótulo aplicado pelo autor do PR → 1 (segue o baseline do merge-base)", async () => {
  const root = await acceptedOnBranch();
  const r = await gateWithApi(root, fakeApi({ author: "dona", events: [labeled("dona")] }));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /autor do PR/);
  assert.match(r.out, /✗ catraca enfraquecida vs merge-base/);
  assert.match(r.out, /baseline do merge-base/);
  assert.match(r.out, /src\/new\.js:1 \[std-demo\/no-bad\]/);
  // Removido depois, ou aplicado por quem não é dono: idem.
  const removed = await gateWithApi(root, fakeApi({ events: [labeled("dona"), { event: "unlabeled", label: { name: LABEL }, actor: { login: "dona", type: "User" } }] }));
  assert.equal(removed.code, 1, removed.out);
  const stranger = await gateWithApi(root, fakeApi({ events: [labeled("estranho")] }));
  assert.equal(stranger.code, 1, stranger.out);
});

test("override aprovado não é cheque em branco: violação block nova fora do baseline da árvore → 1", async () => {
  const root = await acceptedOnBranch();
  writeFileSync(join(root, "src/outra.js"), "BAD\n"); // nova e NÃO aceita
  commit(root);
  const r = await gateWithApi(root, fakeApi({ events: [labeled("dona")] }));
  assert.match(r.out, /aprovada por code owner/);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /1 violação\(ões\) nova\(s\) de nível block/);
  assert.match(r.out, /src\/outra\.js:1 \[std-demo\/no-bad\]/);
  assert.doesNotMatch(r.out, /src\/new\.js:1 \[std-demo/, "o achado aceito não volta a bloquear");
  // Segunda ocorrência no arquivo aceito: excede a contagem aceita.
  const more = await acceptedOnBranch();
  writeFileSync(join(more, "src/new.js"), "BAD\nBAD\n"); commit(more);
  const r2 = await gateWithApi(more, fakeApi({ events: [labeled("dona")] }));
  assert.equal(r2.code, 1, r2.out);
  assert.match(r2.out, /1 violação\(ões\) nova\(s\) de nível block/);
});

test("override aprovado e baseline da árvore inválido → 3", async () => {
  const root = await acceptedOnBranch();
  writeFileSync(join(S(root), "baseline.json"), "{ isto não é json");
  commit(root);
  const r = await gateWithApi(root, fakeApi({ events: [labeled("dona")] }));
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /baseline inválido/);
  // Baseline válido como JSON mas com impressão digital forjada: também 3.
  const forged = await acceptedOnBranch();
  const bl = JSON.parse(readFileSync(join(S(forged), "baseline.json"), "utf8"));
  bl.entries[0].path = "src/qualquer.js"; // o fp deixa de conferir com a entrada
  writeFileSync(join(S(forged), "baseline.json"), JSON.stringify(bl));
  commit(forged);
  const r2 = await gateWithApi(forged, fakeApi({ events: [labeled("dona")] }));
  assert.equal(r2.code, 3, r2.out);
});

// Standards no layout legado (.context/standards/): o linter fica fora do diretório canônico,
// então trocar o canônico por um link não quebra o sandbox do linter — só o baseline passa pelo link.
function toLegacyLayout(root) {
  const eng = S(root), leg = join(root, ".context/standards");
  mkdirSync(join(leg, "machine"), { recursive: true });
  writeFileSync(join(leg, "std-demo.md"), `---\nid: std-demo\nsource: local\ndescription: demo\napplyTo: ["src/**"]\nenforcement:\n  linter: standards/machine/std-demo.js\n  level: block\n---\n## P\n- sem BAD\n`);
  writeFileSync(join(leg, "machine/std-demo.js"), LINT_BAD);
  rmSync(eng, { recursive: true }); mkdirSync(eng, { recursive: true });
}

test("override aprovado não libera link no caminho do baseline da árvore: continua 3 sob --ci", async () => {
  const root = await base({ setup: (r) => { withCodeowners("* @dona\n")(r); toLegacyLayout(r); } });
  writeFileSync(join(root, "src/new.js"), "BAD\n"); git(root, "add", "-A");
  const j = spawnSync("node", [CLI, "check", "--all", "--json", `--project=${root}`], { encoding: "utf8", env });
  const fp = JSON.parse(j.stdout.split("\n")[0]).blocking.find(f => f.path === "src/new.js").fp;
  assert.equal(await human(root, "accept", fp, "--reason", "legado"), 0);
  // O baseline aumentado passa a ser alcançado por um link de diretório.
  renameSync(S(root), join(root, ".context/engineering/x"));
  symlinkSync("x", S(root));
  commit(root);
  // Controle: fora do CI, pelo link, o baseline aumentado cobre a violação.
  assert.equal(runWith(root, {}, "check", "--all").status, 0);
  const r = await gateWithApi(root, fakeApi({ events: [labeled("dona")] }));
  assert.match(r.out, /aprovada por code owner/);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /link simbólico no caminho do baseline/);
});

// `gh` de mentira: registra o argv (um argumento por colchete) e responde pelo caminho pedido.
function fakeGh(body) {
  const dir = tmp("gh-");
  const log = join(dir, "argv.log");
  writeFileSync(join(dir, "gh"), `#!/usr/bin/env bash\nprintf '[%s]' "$@" >> ${JSON.stringify(log)}; echo >> ${JSON.stringify(log)}\n${body}\n`);
  chmodSync(join(dir, "gh"), 0o755);
  return { path: `${dir}${delimiter}${process.env.PATH}`, log };
}

test("override pelo `gh` (sem rede): aprovação ponta a ponta, argv em array; gh falhando → 1", async () => {
  const root = await base({ setup: withCodeowners("* @dona\n") });
  downgrade(root); commit(root);
  const sha = git(root, "rev-parse", "HEAD").trim();
  const ok = fakeGh(`case "$*" in
  *"/pulls/7") echo '{"user":{"login":"agente"},"state":"open","head":{"sha":"${sha}"},"labels":[{"name":"${LABEL}"}]}' ;;
  *"/events?per_page=100&page=1") echo '[{"event":"labeled","label":{"name":"${LABEL}"},"actor":{"login":"dona","type":"User"},"created_at":"2026-01-01T00:00:00Z","id":1}]' ;;
  *"/reviews?per_page=100&page=1") echo '[{"id":9,"user":{"login":"dona","type":"User"},"state":"APPROVED","commit_id":"${sha}","submitted_at":"2026-01-01T01:00:00Z"}]' ;;
  *"page="*) echo '[]' ;;
  *) exit 1 ;;
esac`);
  const args = ["gate", "--base-ref=refs/heads/main", "--ci", "--allow-weakening", "--pr=7", "--repo=o/r"];
  const r = runWith(root, { PATH: ok.path }, ...args);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /aprovada por code owner/);
  const argv = readFileSync(ok.log, "utf8");
  assert.match(argv, /\[api\]/);
  assert.ok(argv.includes("[repos/o/r/pulls/7]"), argv);
  assert.ok(argv.includes("[repos/o/r/issues/7/events?per_page=100&page=1]"), argv);
  assert.ok(argv.includes("[repos/o/r/pulls/7/reviews?per_page=100&page=1]"), argv);

  const down = fakeGh("exit 1");
  const f = runWith(root, { PATH: down.path }, ...args);
  assert.equal(f.status, 1, f.stderr);
  assert.match(f.stderr, /API/);
  const garbage = fakeGh("echo 'isto não é JSON'");
  assert.equal(runWith(root, { PATH: garbage.path }, ...args).status, 1);
});

test("--pr, --repo e --base-ref malformados, ou posicional → uso incorreto (2), antes de qualquer git ou API", async () => {
  const root = await base({ setup: withCodeowners("* @dona\n") });
  downgrade(root); commit(root);
  const gh = fakeGh("exit 1");
  for (const [why, ...extra] of [
    [/--pr inválido/, "--allow-weakening", "--pr=7;id", "--repo=o/r"],
    [/--pr inválido/, "--allow-weakening", "--pr=abc", "--repo=o/r"],
    [/--pr inválido/, "--allow-weakening", "--pr=", "--repo=o/r"],
    [/--repo inválido/, "--allow-weakening", "--pr=7", "--repo=o"],
    [/--repo inválido/, "--allow-weakening", "--pr=7", "--repo=o/r/x"],
    [/--repo inválido/, "--allow-weakening", "--pr=7", "--repo=../.."],
    [/--repo inválido/, "--allow-weakening", "--pr=7", "--repo=o/r --jq .x"],
    [/--pr inválido/, "--pr=x"],
    [/uso: gate/, "src/old.js"],
  ]) {
    const r = runWith(root, { PATH: gh.path }, "gate", "--base-ref=refs/heads/main", "--ci", ...extra);
    assert.equal(r.status, 2, `${extra.join(" ")} → ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, why, extra.join(" "));
    assert.doesNotMatch(r.stderr, /catraca enfraquecida/, "recusado antes de comparar a catraca");
  }
  assert.equal(existsSync(gh.log), false, "nenhuma chamada ao gh com argumento malformado");
  for (const ref of ["--independent", "-h", ""]) {
    const r = runWith(root, {}, "gate", `--base-ref=${ref}`, "--ci");
    assert.equal(r.status, 2, JSON.stringify(ref));
    assert.match(r.stderr, /--base-ref inválido/, JSON.stringify(ref));
  }
  const esc = runWith(root, {}, "gate", "--base-ref=refs/heads/main", "--ci", "--allow-weakening", "--pr=\u001b[31m7", "--repo=o/r");
  assert.equal(esc.status, 2);
  assert.match(esc.stderr, /--pr inválido/);
  assert.doesNotMatch(esc.stderr, /\u001b/);
});

test("machine/: removido → 1; novo → 1; regravado igual com mtime novo → 0; auxiliar alterado → 1", async () => {
  const setup = (root) => {
    writeFileSync(join(S(root), "machine/helper.js"), "module.exports = 1;\n");
    writeFileSync(join(S(root), "machine/dados.json"), '{"a":1}\n');
  };
  const removed = await base({ setup });
  rmSync(join(S(removed), "machine/helper.js")); commit(removed);
  const r1 = ci(removed);
  assert.equal(r1.status, 1, r1.stderr);
  assert.match(r1.stderr, /linter removido: .*machine\/helper\.js/);

  const added = await base({ setup });
  writeFileSync(join(S(added), "machine/std-novo.js"), "process.exit(0)\n"); commit(added);
  const r2 = ci(added);
  // Arquivo novo em machine/ é violação da catraca (o check não analisa machine/), não mais nota.
  assert.equal(r2.status, 1, r2.stderr);
  assert.match(r2.stderr, /linter novo: .*machine\/std-novo\.js \(não existia na base; arquivo novo em machine\/ exige revisão humana\)/);
  assert.doesNotMatch(r2.stderr, /nota: linter novo/);

  const same = await base({ setup });
  const linter = join(S(same), "machine/std-demo.js");
  writeFileSync(linter, readFileSync(linter, "utf8"));
  utimesSync(linter, new Date(), new Date(Date.now() + 3_600_000));
  writeFileSync(join(same, "src/new.js"), "ok\n"); commit(same);
  const r3 = ci(same);
  assert.equal(r3.status, 0, r3.stderr);
  assert.doesNotMatch(r3.stderr, /linter alterado/);

  const aux = await base({ setup });
  writeFileSync(join(S(aux), "machine/dados.json"), '{"a":2}\n'); commit(aux);
  const r4 = ci(aux);
  assert.equal(r4.status, 1, r4.stderr);
  assert.match(r4.stderr, /linter alterado: .*machine\/dados\.json/);
});

test("machine/: alterado só na árvore (sem commit) → 3 sob --ci; link simbólico novo → 1", async () => {
  const dirty = await base();
  writeFileSync(join(S(dirty), "machine/std-demo.js"), `${LINT_BAD}\n// mexido\n`);
  const r1 = ci(dirty);
  assert.equal(r1.status, 3, r1.stderr);
  assert.match(r1.stderr, /machine\/std-demo\.js \(difere do blob do HEAD\)/);

  const link = await base();
  symlinkSync("std-demo.js", join(S(link), "machine/alias.js")); commit(link);
  const r2 = ci(link);
  assert.equal(r2.status, 1, r2.stderr);
  assert.match(r2.stderr, /link simbólico/);
});

test("machine/: link que já existia na base e não mudou → 0; reapontado → 1", async () => {
  const setup = (root) => {
    writeFileSync(join(S(root), "machine/outro.js"), "process.exit(0)\n");
    symlinkSync("std-demo.js", join(S(root), "machine/alias.js"));
  };
  const same = await base({ setup });
  writeFileSync(join(same, "src/new.js"), "ok\n"); commit(same);
  const r1 = ci(same);
  assert.equal(r1.status, 0, r1.stderr);
  const moved = await base({ setup });
  rmSync(join(S(moved), "machine/alias.js"));
  symlinkSync("outro.js", join(S(moved), "machine/alias.js"));
  commit(moved);
  const r2 = ci(moved);
  assert.equal(r2.status, 1, r2.stderr);
  assert.match(r2.stderr, /linter alterado: .*machine\/alias\.js/);
});

test("shim .context/bin/devflow-standards.mjs alterado ou removido → 1", async () => {
  const setup = (root) => {
    mkdirSync(join(root, ".context/bin"), { recursive: true });
    writeFileSync(join(root, ".context/bin/devflow-standards.mjs"), "// shim v1\n");
  };
  const changed = await base({ setup });
  writeFileSync(join(changed, ".context/bin/devflow-standards.mjs"), "process.exit(0)\n"); commit(changed);
  const r1 = ci(changed);
  assert.equal(r1.status, 1, r1.stderr);
  assert.match(r1.stderr, /shim alterado/);
  const gone = await base({ setup });
  rmSync(join(gone, ".context/bin/devflow-standards.mjs")); commit(gone);
  const r2 = ci(gone);
  assert.equal(r2.status, 1, r2.stderr);
  assert.match(r2.stderr, /shim removido/);
});

test("symlink na árvore: .context/standards (legado) como link → violação da catraca (1)", async () => {
  const root = await base();
  symlinkSync("engineering/standards", join(root, ".context/standards")); commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /link simbólico no caminho da catraca: \.context\/standards/);
  const local = gate(root);
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stderr, /link simbólico no caminho da catraca/);
});

test("symlink na árvore: diretório canônico de standards como link → violação listada e 3 sob --ci", async () => {
  const root = await base();
  renameSync(S(root), join(root, ".context/engineering/x"));
  symlinkSync("x", S(root));
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /link simbólico no caminho da catraca: \.context\/engineering\/standards/);
  assert.match(r.stderr, /link simbólico no caminho do baseline/); // o exit 3 da T7 continua
});

// A base tem o diretório de standards como link; a branch troca por um diretório real e traz um
// baseline. O caminho lógico do baseline "não existe" na base: sem o ls-tree, viraria adoção.
async function baseComSymlink() {
  const root = demoProject();
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  renameSync(S(root), join(root, ".context/engineering/x"));
  symlinkSync("x", S(root));
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  writeFileSync(join(root, ".context/.devflow.yaml"), "git:\n  strategy: branch-flow\n");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  assert.match(git(root, "ls-tree", "HEAD", ".context/engineering/standards"), /^120000 /);
  git(root, "checkout", "-q", "-b", "feat");
  rmSync(S(root));
  renameSync(join(root, ".context/engineering/x"), S(root));
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  assert.equal(await human(root, "init"), 0);
  commit(root);
  return root;
}

test("symlink na base trocado por diretório real com baseline: --ci → 3 (gate e check); local → nota", async () => {
  const root = await baseComSymlink();
  const r = ci(root);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /link simbólico no caminho do baseline na base/);
  assert.doesNotMatch(r.stderr, /adoção\)/);
  const chk = runWith(root, {}, "check", "--all", "--base-ref=refs/heads/main", "--ci");
  assert.equal(chk.status, 3, chk.stderr);
  assert.match(chk.stderr, /link simbólico no caminho do baseline na base/);
  const local = gate(root);
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stderr, /link simbólico no caminho do baseline na base/);
  const chkLocal = runWith(root, {}, "check", "--all", "--base-ref=refs/heads/main");
  assert.equal(chkLocal.status, 0, chkLocal.stderr);
  assert.match(chkLocal.stderr, /link simbólico/);
});

// O mesmo truque fora do caminho do baseline: na base, .context/standards (legado) é um link
// para um diretório com o std; a branch troca o link por um diretório real com o std rebaixado.
// Pelo caminho lógico o std "não existia" na base — sem conferir os links da base, o
// rebaixamento passava em branco.
test("symlink na base em standards/ legado trocado por diretório real com o std rebaixado → 1", async () => {
  const root = demoProject();
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  mkdirSync(join(root, ".context/y"));
  renameSync(join(S(root), "std-demo.md"), join(root, ".context/y/std-demo.md")); // o linter segue no machine/ canônico
  symlinkSync("y", join(root, ".context/standards"));
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  writeFileSync(join(root, ".context/.devflow.yaml"), "git:\n  strategy: branch-flow\n");
  git(root, "add", "-A");
  assert.equal(await human(root, "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  // Na base o std vale (block) pelo diretório alcançado pelo link.
  writeFileSync(join(root, "src/probe.js"), "BAD\n");
  assert.equal(runWith(root, {}, "check", "--all").status, 1);
  rmSync(join(root, "src/probe.js"));
  git(root, "checkout", "-q", "-b", "feat");
  const md = readFileSync(join(root, ".context/y/std-demo.md"), "utf8");
  rmSync(join(root, ".context/standards"));
  rmSync(join(root, ".context/y"), { recursive: true });
  mkdirSync(join(root, ".context/standards"));
  writeFileSync(join(root, ".context/standards/std-demo.md"), md.replace("level: block", "level: warn"));
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.stderr, /a base .* tinha link simbólico no caminho da catraca \(\.context\/standards\)/);
  const local = gate(root);
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stderr, /tinha link simbólico no caminho da catraca/);
});

test("symlink na base no .devflow.yaml trocado por arquivo sem verify.standards → 1", async () => {
  const root = demoProject();
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  writeFileSync(join(root, ".context/devflow.real.yaml"), 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  symlinkSync("devflow.real.yaml", join(root, ".context/.devflow.yaml"));
  git(root, "add", "-A");
  assert.equal(await human(root, "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  git(root, "checkout", "-q", "-b", "feat");
  rmSync(join(root, ".context/.devflow.yaml"));
  writeFileSync(join(root, ".context/.devflow.yaml"), "git:\n  strategy: branch-flow\n");
  commit(root);
  const r = ci(root);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.stderr, /a base .* tinha link simbólico no caminho da catraca \(\.context\/\.devflow\.yaml\)/);
});

function whichGit() {
  for (const d of String(process.env.PATH || "").split(delimiter)) {
    if (d && existsSync(join(d, "git"))) return join(d, "git");
  }
  throw new Error("git não encontrado no PATH");
}

// git "traduzido": fora de LC_ALL=C, as mensagens de erro saem em pt-BR (como num runner com
// LANG=pt_BR e o pacote de idiomas do git instalado).
function translatedGit() {
  const dir = tmp("gitpt-");
  writeFileSync(join(dir, "git"), `#!/usr/bin/env bash
if [ "\${LC_ALL:-}" = "C" ]; then exec ${JSON.stringify(whichGit())} "$@"; fi
err=$(mktemp)
${JSON.stringify(whichGit())} "$@" 2>"$err"; rc=$?
sed -e 's/does not exist in/não existe em/' -e 's/exists on disk, but not in/existe no disco, mas não em/' "$err" >&2
rm -f "$err"
exit $rc
`);
  chmodSync(join(dir, "git"), 0o755);
  return { PATH: `${dir}${delimiter}${process.env.PATH}`, LANG: "pt_BR.UTF-8", LC_ALL: "pt_BR.UTF-8", LANGUAGE: "pt_BR" };
}

test("git traduzido: a adoção legítima continua reconhecida sob --ci (gate e check --base-ref)", async () => {
  const root = await base({ withBaseline: false });
  await human(root, "init"); commit(root);
  const pt = translatedGit();
  // Controle: o git de mentira traduz mesmo quando ninguém fixa o idioma.
  const raw = spawnSync("git", ["-C", root, "cat-file", "-e", "main:./nao-existe"], { encoding: "utf8", env: { ...env, ...pt } });
  assert.match(raw.stderr, /não existe em/);
  const chk = runWith(root, pt, "check", "--all", "--base-ref=refs/heads/main", "--ci");
  assert.equal(chk.status, 0, chk.stderr);
  assert.match(chk.stderr, /adoção/);
  const g = runWith(root, pt, "gate", "--base-ref=refs/heads/main", "--ci");
  assert.equal(g.status, 0, g.stderr);
});

test("CI=1 sem --ci conta como CI: sem merge-base → 3", async () => {
  const root = await base();
  assert.equal(runWith(root, { CI: "1" }, "gate", "--base-ref=origin/nao-existe").status, 3);
  assert.equal(runWith(root, { CI: "true" }, "gate", "--base-ref=origin/nao-existe").status, 3);
  assert.equal(runWith(root, { CI: "0" }, "gate", "--base-ref=origin/nao-existe").status, 0);
});

test("sem --base-ref o padrão é refs/remotes/origin/main: local segue com nota; --ci falha fechado", async () => {
  const root = await base();
  const local = runWith(root, {}, "gate");
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stderr, /sem merge-base com "refs\/remotes\/origin\/main"/);
  assert.equal(runWith(root, {}, "gate", "--ci").status, 3);
});

// ── Adoção (N3): o engine roda sobre a árvore do merge-base num tmpdir ────────────────

test("adoção: link da base apontando para fora não é materializado nem lido; o tmp é apagado", async () => {
  const outside = tmp("fora-");
  writeFileSync(join(outside, "segredo.js"), "BAD\n");
  // O linter (o MESMO na base e na branch) registra, a cada execução, de onde rodou e o que
  // existe em src/link.js: na passada da base (cwd no tmp) não pode haver nada lá.
  const mark = join(tmp("marca-"), "link.log");
  const probe = `let w="AUSENTE";try{w=require("fs").lstatSync("src/link.js").isSymbolicLink()?"LINK":"ARQUIVO"}catch{}
require("fs").appendFileSync(${JSON.stringify(mark)}, process.cwd()+" "+w+"\\n");
${LINT_BAD}`;
  const root = await base({ withBaseline: false, linterBody: probe, setup: (r) => symlinkSync(join(outside, "segredo.js"), join(r, "src/link.js")) });
  assert.match(git(root, "ls-tree", "main", "src/link.js"), /^120000 /);
  // Na branch o link vira arquivo comum com BAD e entra no baseline de adoção. Se a passada
  // sobre a base seguisse o link, o achado "já existiria" na base e o gate passaria.
  rmSync(join(root, "src/link.js"));
  writeFileSync(join(root, "src/link.js"), "BAD\n");
  assert.equal(await human(root, "init"), 0);
  commit(root);
  const td = tmp("tmpdir-");
  writeFileSync(mark, ""); // o `init` do operador rodou o linter sobre a árvore; daqui em diante é só o gate
  const r = runWith(root, { TMPDIR: td }, "gate", "--base-ref=refs/heads/main", "--ci");
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /adoção aceita o que a base não tinha: std-demo\/no-bad em src\/link\.js/);
  assert.doesNotMatch(r.stderr, /src\/old\.js \(/);
  assert.deepEqual(readdirSync(td), []);
  // Dois tmps: o da árvore da base (devflow-base-) e o dos blobs do HEAD (devflow-head-).
  const lines = readFileSync(mark, "utf8").trim().split("\n");
  assert.ok(lines.every(l => l.startsWith(`${realpathSync(td)}/`)), "sob --ci nenhum linter roda sobre a árvore de trabalho");
  const inBase = lines.filter(l => l.includes("/devflow-base-"));
  assert.ok(inBase.length > 0, "a passada sobre a base rodou dentro do tmp");
  assert.deepEqual([...new Set(inBase.map(l => l.split(" ").pop()))], ["AUSENTE"], inBase.join("\n"));
  const inHead = lines.filter(l => l.includes("/devflow-head-"));
  assert.deepEqual([...new Set(inHead.map(l => l.split(" ").pop()))], ["ARQUIVO"], "no HEAD src/link.js é arquivo comum");
});

test("adoção: a passada sobre a base roda o linter da BASE, nunca o machine/ da branch", async () => {
  const mark = join(tmp("marca-"), "cwd.log");
  const root = await base({ withBaseline: false });
  assert.equal(await human(root, "init"), 0); // baseline legítimo: só src/old.js
  // A branch troca o linter por um que registra de onde rodou e nunca acha nada.
  writeFileSync(join(S(root), "machine/std-demo.js"),
    `require("fs").appendFileSync(${JSON.stringify(mark)}, process.cwd() + "\\n"); process.exit(0);\n`);
  commit(root);
  const td = tmp("tmpdir-");
  const r = runWith(root, { TMPDIR: td }, "gate", "--base-ref=refs/heads/main", "--ci");
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /linter alterado/);
  // Com o linter da branch na passada da base, a base "não teria" src/old.js e a adoção falharia.
  assert.doesNotMatch(r.stderr, /adoção aceita/);
  // O linter da branch só roda no check final (sobre os blobs do HEAD), nunca sobre a árvore da base.
  const cwds = [...new Set(readFileSync(mark, "utf8").trim().split("\n"))];
  assert.equal(cwds.length, 1, cwds.join("\n"));
  assert.ok(cwds[0].startsWith(`${realpathSync(td)}/devflow-head-`), cwds[0]);
  assert.deepEqual(readdirSync(td), []);
});

test("adoção: linter da base que falha → 3 (não dá para conferir) e o tmp é apagado", async () => {
  const root = await base({ withBaseline: false, linterBody: 'throw new Error("boom")' });
  writeFileSync(join(S(root), "baseline.json"), JSON.stringify({ version: 1, entries: [] }));
  commit(root);
  const td = tmp("tmpdir-");
  const r = runWith(root, { TMPDIR: td }, "gate", "--base-ref=refs/heads/main", "--ci");
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /árvore da base/);
  assert.deepEqual(readdirSync(td), []);
});

// A base é materializada com os atributos DELA: um .gitattributes da branch (eol=crlf) não
// fabrica na base um achado que ela não tinha.
test("adoção: .gitattributes da branch não muda o conteúdo materializado da base", async () => {
  const linterBody = `const fs=require("fs");const c=fs.readFileSync(process.argv[2],"utf8");let h=0;
c.split("\\n").forEach((l,i)=>{ if(l.includes("BAD")){h++;console.log("VIOLATION no-bad "+process.argv[2]+":"+(i+1)+" remova BAD");}
if(l.endsWith("\\r")){h++;console.log("VIOLATION no-cr "+process.argv[2]+":"+(i+1)+" linha com CR");} });process.exit(h?1:0);`;
  const root = await base({ withBaseline: false, linterBody });
  writeFileSync(join(root, ".gitattributes"), "src/*.js text eol=crlf\n");
  writeFileSync(join(root, "src/old.js"), "BAD\r\n"); // o blob continua LF; só a árvore tem CR
  assert.equal(await human(root, "init"), 0);
  commit(root);
  assert.equal(git(root, "diff", "--name-only", "main", "HEAD", "--", "src/old.js"), "", "o blob de src/old.js não mudou");
  const r = ci(root);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /adoção aceita o que a base não tinha: std-demo\/no-cr em src\/old\.js/);
});

// ── Projeto num subdiretório do repositório (monorepo) ────────────────────────────────

// repo/ é o toplevel do git; o projeto DevFlow fica em repo/apps/web. O CODEOWNERS e o
// merge-base são do repositório; baseline, standards e machine/ são do projeto.
function monorepo() {
  const repo = tmp("mono-");
  const proj = join(repo, "apps/web");
  mkdirSync(join(repo, "apps"), { recursive: true });
  cpSync(demoProject(), proj, { recursive: true });
  git(repo, "init", "-q", "-b", "main"); git(repo, "config", "user.email", "t@t"); git(repo, "config", "user.name", "t");
  writeFileSync(join(proj, "src/old.js"), "BAD\n");
  writeFileSync(join(repo, "fora-do-projeto.js"), "BAD\n");
  withCodeowners("* @dona\n")(repo);
  git(repo, "add", "-A"); git(repo, "commit", "-qm", "base sem baseline");
  git(repo, "checkout", "-q", "-b", "feat");
  return { repo, proj };
}

test("monorepo: adoção conferida contra a árvore da base do PROJETO; CODEOWNERS da raiz do repositório", async () => {
  const { repo, proj } = monorepo();
  assert.equal(await human(proj, "init"), 0);
  commit(repo);
  const td = tmp("tmpdir-");
  const ok = runWith(proj, { TMPDIR: td }, "gate", "--base-ref=refs/heads/main", "--ci");
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(readdirSync(td), []);

  // Remove, commita e recria com uma violação nova: a adoção acusa só o que a base não tinha.
  writeFileSync(join(proj, "src/new.js"), "BAD\n");
  rmSync(join(S(proj), "baseline.json")); commit(repo);
  assert.equal(await human(proj, "init"), 0);
  commit(repo);
  const bad = runWith(proj, { TMPDIR: td }, "gate", "--base-ref=refs/heads/main", "--ci");
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stderr, /adoção aceita o que a base não tinha: std-demo\/no-bad em src\/new\.js/);
  assert.doesNotMatch(bad.stderr, /src\/old\.js \(/);
  assert.deepEqual(readdirSync(td), []);

  const approved = await gateWithApi(proj, fakeApi({ events: [labeled("dona")] }));
  assert.equal(approved.code, 0, approved.out);
  assert.match(approved.out, /aprovada por code owner/);
});

test("monorepo: linter e nível do projeto comparados pelo caminho do projeto dentro do repositório", async () => {
  const { repo, proj } = monorepo();
  assert.equal(await human(proj, "init"), 0);
  commit(repo);
  git(repo, "checkout", "-q", "main"); git(repo, "merge", "-q", "--ff-only", "feat"); git(repo, "checkout", "-q", "-b", "feat2");
  writeFileSync(join(S(proj), "machine/std-demo.js"), `${LINT_BAD}\n// mexido\n`);
  downgrade(proj);
  commit(repo);
  const r = ci(proj);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /linter alterado: \.context\/engineering\/standards\/machine\/std-demo\.js/);
  assert.match(r.stderr, /std-demo: nível block → warn/);
});

// ── Linter novo é violação da catraca — e não pode interferir no veredito dos que já existiam ────

const stdMd = (id, level) => `---\nid: ${id}\nsource: local\ndescription: x\napplyTo: ["src/**"]\nenforcement:\n  linter: engineering/standards/machine/${id}.js\n  level: ${level}\n---\n`;

// O ataque: a branch traz uma violação nova e, junto, um std NOVO cujo linter reescreve a árvore
// durante o check, tirando a violação da frente do linter antigo. Com todos os linters rodando
// juntos, o gate ficava verde com a violação commitada (linter novo era só nota). Hoje o arquivo
// novo em machine/ é violação da catraca; a segunda passada continua sendo o que mantém o
// veredito dos linters da base fora do alcance do linter que o PR trouxe.
test("linter novo que altera a árvore durante o check não esconde violação nova → 1", async () => {
  const root = await base({ setup: (r) => { for (let i = 0; i < 12; i++) writeFileSync(join(r, `src/a${String(i).padStart(2, "0")}.js`), "ok\n"); } });
  writeFileSync(join(root, "src/zzz.js"), "BAD\n");
  writeFileSync(join(S(root), "std-aaa.md"), stdMd("std-aaa", "warn"));
  writeFileSync(join(S(root), "machine/std-aaa.js"),
    `const fs=require("fs");for(const f of fs.readdirSync("src")){const p="src/"+f;if(f!=="old.js"){const c=fs.readFileSync(p,"utf8");if(c.includes("BAD"))fs.writeFileSync(p,c.replace(/BAD/g,"ok"));}}process.exit(0);`);
  commit(root);
  assert.equal(git(root, "show", "HEAD:src/zzz.js"), "BAD\n");
  const r = ci(root);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.stdout, /src\/zzz\.js:1 \[std-demo\/no-bad\]/);
  assert.match(r.stderr, /linter novo: .*machine\/std-aaa\.js/);
  assert.match(r.stderr, /depois dos que já existiam na base/);
});

test("linter novo: os achados dele também contam (block novo → 1; erro → 3; limpo → 1, só pela catraca)", async () => {
  const novo = (body) => async () => {
    const root = await base();
    writeFileSync(join(S(root), "std-novo.md"), stdMd("std-novo", "block"));
    writeFileSync(join(S(root), "machine/std-novo.js"), body);
    writeFileSync(join(root, "src/new.js"), "TODO\n");
    commit(root);
    return ci(root);
  };
  const finds = await novo(`const c=require("fs").readFileSync(process.argv[2],"utf8");if(c.includes("TODO")){console.log("VIOLATION no-todo "+process.argv[2]+":1 remova TODO");process.exit(1)}`)();
  assert.equal(finds.status, 1, finds.stderr + finds.stdout);
  assert.match(finds.stdout, /src\/new\.js:1 \[std-novo\/no-todo\]/);
  const boom = await novo('throw new Error("boom")')();
  assert.equal(boom.status, 3, boom.stderr + boom.stdout);
  // Sem achado nenhum, o check sai limpo; quem fecha o gate é a catraca (linter novo é violação).
  const clean = await novo("process.exit(0)")();
  assert.equal(clean.status, 1, clean.stderr + clean.stdout);
  assert.match(clean.stderr, /linter novo: .*machine\/std-novo\.js \(não existia na base; arquivo novo em machine\/ exige revisão humana\)/);
  assert.match(clean.stdout, /✓ standards: nenhuma violação nova de nível block/);
});

// SI-4, ambiente mínimo (ruling da T19). No CI o gate roda com o GH_TOKEN do override no
// ambiente e executa os linters do projeto — os que já existiam na base e os que o próprio PR
// trouxe (arquivo novo em machine/ é violação da catraca, mas o linter roda do mesmo jeito). Um
// linter que copia o ambiente para uma VIOLATION não leva nada.
const ENV_KEYS = ["GH_TOKEN", "GITHUB_TOKEN", "ACTIONS_RUNTIME_TOKEN", "CI_JOB_TOKEN", "NODE_AUTH_TOKEN", "NPM_TOKEN", "NODE_OPTIONS", "CLAUDE_PLUGIN_ROOT"];
const dumpEnv = (rule) => `console.log("VIOLATION ${rule} "+process.argv[2]+":1 "+${JSON.stringify(ENV_KEYS)}.map(k=>k+"="+process.env[k]).join(" "));process.exit(1);`;

test("gate --ci: as credenciais do job não chegam aos linters — nem ao da base, nem ao que o PR trouxe", async () => {
  const root = await base({ withBaseline: false, linterBody: dumpEnv("ambiente-base") });
  writeFileSync(join(S(root), "std-novo.md"), stdMd("std-novo", "block"));
  writeFileSync(join(S(root), "machine/std-novo.js"), dumpEnv("ambiente-pr"));
  writeFileSync(join(root, "src/new.js"), "ok\n");
  commit(root);
  const secrets = {
    GH_TOKEN: "ghs_SegredoDoOverride", GITHUB_TOKEN: "ghs_OutroSegredo", ACTIONS_RUNTIME_TOKEN: "rt_SegredoDoRunner",
    CI_JOB_TOKEN: "glcbt_SegredoDoGitlab", NODE_AUTH_TOKEN: "npm_SegredoA", NPM_TOKEN: "npm_SegredoB",
    NODE_OPTIONS: "--max-old-space-size=4321", CLAUDE_PLUGIN_ROOT: "/caminho/secreto/do/plugin",
  };
  const undefinedAll = ENV_KEYS.map(k => `${k}=undefined`).join(" ");
  for (const extra of [[], ["--allow-weakening", "--pr=7", "--repo=o/r"]]) {
    const r = runWith(root, secrets, "gate", "--base-ref=refs/heads/main", "--ci", ...extra);
    const out = r.stdout + r.stderr;
    assert.equal(r.status, 1, out);
    assert.match(out, /linter novo: .*machine\/std-novo\.js/);
    assert.ok(out.includes(`src/new.js:1 [std-demo/ambiente-base] ${undefinedAll}`), out);
    assert.ok(out.includes(`src/new.js:1 [std-novo/ambiente-pr] ${undefinedAll}`), out);
    for (const [k, v] of Object.entries(secrets)) assert.ok(!out.includes(v), `${k} chegou a um linter:\n${out}`);
  }
  // O `check --json` (o que um job guardaria como artefato) também não.
  const json = runWith(root, secrets, "check", "--all", "--json");
  for (const [k, v] of Object.entries(secrets)) assert.ok(!(json.stdout + json.stderr).includes(v), `${k} no --json`);
});
