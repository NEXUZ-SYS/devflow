// tests/integration/test-standards-gates-ci.mjs — "CI simulado" dos assets de CI (T19, R7).
//
// Os scripts saem do YAML que vai para o projeto-cliente (não de uma cópia no teste), os
// contextos `${{ … }}` são trocados por valores de um repositório git real em tmpdir, e o
// script roda como o runner o rodaria: `bash -e` no GitHub, `sh` no GitLab. O repositório
// imita o que o runner tem em mãos — a merge ref do PR destacada e `refs/remotes/origin/<base>`.
// Nenhum teste fala com a rede: a API do GitHub é um `gh` de mentira no PATH, e o "repositório
// do plugin" do GitLab é um repositório local com os mesmos arquivos.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import {
  githubActionsSnippet, gitlabSnippet, codeownersSnippet, pluginPin, pluginVersion, shimSource,
  SHIM_TARGET, PIN_TARGET, GITHUB_WORKFLOW_TARGET,
} from "../../scripts/lib/standards-gates.mjs";
import { demoProject } from "../helpers/standards-fixture.mjs";
import { steps, gitlabScript, expand } from "../helpers/workflow-yaml.mjs";

const PLUGIN = process.cwd();
const VERSION = pluginVersion();
const LABEL = "standards-ratchet-approved";
const TEMPS = [];
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TEMPS.push(d); return d; };
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });
const human = (root, ...a) => runStandardsCommand("baseline", a, root, { isInteractive: () => true });

// Repositório do cliente com a base em `main`: tudo o que a oferta instala já está versionado,
// e o CODEOWNERS é o trecho que a oferta gera para a dona das normas.
async function origin({ pin = pluginPin().content } = {}) {
  const root = demoProject(); TEMPS.push(root);
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  writeFileSync(join(root, ".context/.devflow.yaml"), 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  mkdirSync(join(root, ".context/bin"), { recursive: true });
  copyFileSync(shimSource(), join(root, SHIM_TARGET));
  if (pin !== null) writeFileSync(join(root, PIN_TARGET), pin);
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  writeFileSync(join(root, ".github/CODEOWNERS"), `* @todos\n${codeownersSnippet("@dona")}`);
  writeFileSync(join(root, GITHUB_WORKFLOW_TARGET), githubActionsSnippet());
  writeFileSync(join(root, ".gitignore"), ".context/runtime/\n");
  git(root, "add", "-A");
  assert.equal(await human(root, "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  return root;
}

const ok = (root) => writeFileSync(join(root, "src/new.js"), "ok\n");
const violation = (root) => writeFileSync(join(root, "src/new.js"), "BAD\n");
function downgrade(root) {
  const md = join(root, ".context/engineering/standards/std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace("level: block", "level: warn"));
}

// A branch do PR, saída de `from`, com `change` commitado. Devolve o head do PR.
function branch(root, change, from = "main") {
  git(root, "checkout", "-q", "-b", "feat", from);
  change(root);
  git(root, "add", "-A"); git(root, "commit", "-qm", "pr");
  return git(root, "rev-parse", "HEAD").trim();
}

// O workspace do runner do GitHub depois dos dois checkouts do workflow: `project/` na merge
// ref do PR (o merge da base com o head, que o GitHub monta em refs/pull/<n>/merge), com o
// histórico completo e `refs/remotes/origin/main`; `devflow-plugin/` com o plugin.
function githubWorkspace(root, change) {
  const head = branch(root, change);
  git(root, "checkout", "-q", "--detach", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "Merge feat into main", "feat");
  git(root, "update-ref", "refs/pull/7/merge", "HEAD");
  git(root, "checkout", "-q", "main");
  const ws = tmp("ws-");
  execFileSync("git", ["clone", "-q", root, join(ws, "project")]);
  git(join(ws, "project"), "fetch", "-q", "origin", "+refs/pull/7/merge:refs/remotes/pull/7/merge");
  git(join(ws, "project"), "checkout", "-q", "--detach", "refs/remotes/pull/7/merge");
  symlinkSync(PLUGIN, join(ws, "devflow-plugin"));
  return { ws, head, project: join(ws, "project") };
}

const WORKFLOW = githubActionsSnippet();
const [, PIN_STEP, PLUGIN_STEP, , GATE_STEP] = steps(WORKFLOW, "gate");
const CONTEXTS = {
  "github.event.pull_request.number": "7",
  "github.event.pull_request.base.ref": "main",
  "github.repository": "acme/app",
  "github.token": "token-de-teste",
};

// Roda o `run:` de um passo como o runner: `bash -e <arquivo>`, a partir do workspace (ou do
// `working-directory`), com o `env:` do passo já expandido e só o ambiente que o runner dá.
function runStep(step, ws, { path = process.env.PATH, contexts = CONTEXTS } = {}) {
  const dir = tmp("step-");
  const script = join(dir, "run.sh"), output = join(dir, "github-output");
  writeFileSync(script, step.run);
  writeFileSync(output, "");
  const env = { PATH: path, HOME: dir, TMPDIR: dir, CI: "true", GITHUB_ACTIONS: "true", GITHUB_WORKSPACE: ws, GITHUB_OUTPUT: output };
  for (const [k, v] of Object.entries(step.env)) env[k] = expand(v, contexts);
  const r = spawnSync("bash", ["-e", script], { cwd: join(ws, step["working-directory"] || ""), encoding: "utf8", env, timeout: 120000 });
  const outputs = {};
  for (const line of readFileSync(output, "utf8").split("\n").filter(Boolean)) outputs[line.slice(0, line.indexOf("="))] = line.slice(line.indexOf("=") + 1);
  return { status: r.status, out: `${r.stdout}${r.stderr}`, outputs };
}

// `gh` de mentira: registra o argv e o token recebido, e responde pelo caminho pedido.
function fakeGh(body) {
  const dir = tmp("gh-");
  const log = join(dir, "argv.log");
  writeFileSync(join(dir, "gh"), `#!/usr/bin/env bash\nprintf '[%s]' "$GH_TOKEN" "$@" >> ${JSON.stringify(log)}; echo >> ${JSON.stringify(log)}\n${body}\n`);
  chmodSync(join(dir, "gh"), 0o755);
  return { path: `${dir}${delimiter}${process.env.PATH}`, log };
}
const approvingGh = (head, { labeler = "dona", reviewer = "dona" } = {}) => fakeGh(`case "$*" in
  *"/pulls/7") echo '{"user":{"login":"agente"},"state":"open","head":{"sha":"${head}"},"labels":[{"name":"${LABEL}"}]}' ;;
  *"/events?per_page=100&page=1") echo '[{"event":"labeled","label":{"name":"${LABEL}"},"actor":{"login":"${labeler}","type":"User"},"created_at":"2026-01-01T00:00:00Z","id":1}]' ;;
  *"/reviews?per_page=100&page=1") echo '[{"id":9,"user":{"login":"${reviewer}","type":"User"},"state":"APPROVED","commit_id":"${head}","submitted_at":"2026-01-01T01:00:00Z"}]' ;;
  *"page="*) echo '[]' ;;
  *) exit 1 ;;
esac`);

// ── GitHub Actions ──────────────────────────────────────────────────────────────────

test("GitHub: o comando do snippet dá 0 numa branch limpa e 1 numa branch com violação nova", async () => {
  const clean = githubWorkspace(await origin(), ok);
  const a = runStep(GATE_STEP, clean.ws);
  assert.equal(a.status, 0, a.out);
  assert.match(a.out, /catraca íntegra vs merge-base/);

  const dirty = githubWorkspace(await origin(), violation);
  const b = runStep(GATE_STEP, dirty.ws);
  assert.equal(b.status, 1, b.out);
  assert.match(b.out, /violação\(ões\) nova\(s\) de nível block/);
  assert.match(b.out, /src\/new\.js/);
  assert.doesNotMatch(b.out, /src\/old\.js:\d+ \[std-demo/, "o legado da base está no baseline da base");
});

test("GitHub: catraca enfraquecida sem aprovação → 1; a API é consultada com o PR, o repositório e o token do passo", async () => {
  const pr = githubWorkspace(await origin(), downgrade);
  const down = fakeGh("exit 1");
  const r = runStep(GATE_STEP, pr.ws, { path: down.path });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /catraca enfraquecida vs merge-base/);
  assert.match(r.out, /override: falha ao consultar a API do GitHub/);
  assert.ok(readFileSync(down.log, "utf8").includes("[token-de-teste][api][--method][GET][repos/acme/app/pulls/7]"), readFileSync(down.log, "utf8"));
});

test("GitHub: rótulo + review da dona — a do CODEOWNERS que a oferta gera — liberam o enfraquecimento", async () => {
  const pr = githubWorkspace(await origin(), downgrade);
  const approved = runStep(GATE_STEP, pr.ws, { path: approvingGh(pr.head).path });
  assert.equal(approved.status, 0, approved.out);
  assert.match(approved.out, /aprovada por code owner/);
  assert.match(approved.out, /rótulo de dona \(code owner\) e review APPROVED de dona \(code owner\)/);
  // Quem não é dona dos caminhos da catraca (a regra genérica `* @todos` vem antes) não aprova.
  const stranger = runStep(GATE_STEP, pr.ws, { path: approvingGh(pr.head, { labeler: "todos", reviewer: "todos" }).path });
  assert.equal(stranger.status, 1, stranger.out);
  assert.match(stranger.out, /não consta como responsável/);
  // Review de outro commit (push depois da aprovação): não vale, e ninguém precisou tirar o rótulo.
  const stale = runStep(GATE_STEP, pr.ws, { path: approvingGh("0".repeat(40)).path });
  assert.equal(stale.status, 1, stale.out);
});

test("GitHub: sem enfraquecimento, o override sempre presente não consulta a API", async () => {
  const pr = githubWorkspace(await origin(), ok);
  const gh = fakeGh("exit 1");
  const r = runStep(GATE_STEP, pr.ws, { path: gh.path });
  assert.equal(r.status, 0, r.out);
  assert.equal(existsSync(gh.log), false, "nenhuma chamada ao gh numa branch que não toca a catraca");
});

test("GitHub: a base que andou depois do merge do PR fecha o gate (3), não compara com base velha", async () => {
  const root = await origin();
  const pr = githubWorkspace(root, ok);
  writeFileSync(join(root, "src/depois.js"), "ok\n");
  git(root, "add", "-A"); git(root, "commit", "-qm", "main andou");
  git(pr.project, "fetch", "-q", "origin");
  const r = runStep(GATE_STEP, pr.ws);
  assert.equal(r.status, 3, r.out);
  assert.match(r.out, /não é ancestral do HEAD/);
});

test("GitHub: sem .context/ na raiz do repositório o job fecha (3) em vez de passar sem conferir nada", async () => {
  const pr = githubWorkspace(await origin(), ok);
  rmSync(join(pr.project, ".context"), { recursive: true });
  const r = runStep(GATE_STEP, pr.ws);
  assert.equal(r.status, 3, r.out);
  assert.match(r.out, /\.context/);
});

test("GitHub: a versão do plugin sai do pin da base; o do PR só vale enquanto a base não tem", async () => {
  assert.equal(PLUGIN_STEP.with.ref, "${{ steps.pin.outputs.ref }}");
  assert.equal(PIN_STEP.id, "pin");
  // O PR troca o pin: vale o da base.
  const changed = githubWorkspace(await origin(), (r) => writeFileSync(join(r, PIN_TARGET), "v0.0.1\n"));
  const a = runStep(PIN_STEP, changed.ws);
  assert.equal(a.status, 0, a.out);
  assert.deepEqual(a.outputs, { ref: `refs/tags/v${VERSION}` });
  // Adoção: a base ainda não tem o arquivo.
  const adoption = githubWorkspace(await origin({ pin: null }), (r) => writeFileSync(join(r, PIN_TARGET), "v1.2.3\n"));
  assert.deepEqual(runStep(PIN_STEP, adoption.ws).outputs, { ref: "refs/tags/v1.2.3" });
  // SHA completo também vale, e sai como veio.
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const bySha = githubWorkspace(await origin({ pin: `${sha}\r\n` }), ok);
  assert.deepEqual(runStep(PIN_STEP, bySha.ws).outputs, { ref: sha });
});

test("GitHub: pin inválido, ausente, em link simbólico ou com base inexistente fecha sem emitir saída", async () => {
  for (const bad of ["main\n", "v1.2\n", "v1.2.3\nref=refs/heads/intruso\n", "v1.2.3; touch pwned\n", "$(touch pwned)\n", "", "V1.2.3\n", ` v1.2.3\n`]) {
    const pr = githubWorkspace(await origin({ pin: null }), (r) => writeFileSync(join(r, PIN_TARGET), bad));
    const r = runStep(PIN_STEP, pr.ws);
    assert.equal(r.status, 3, `${JSON.stringify(bad)} → ${r.status}\n${r.out}`);
    assert.deepEqual(r.outputs, {}, JSON.stringify(bad));
    assert.equal(existsSync(join(pr.ws, "pwned")), false);
    assert.equal(existsSync(join(pr.project, "pwned")), false);
  }
  const absent = githubWorkspace(await origin({ pin: null }), ok);
  const ra = runStep(PIN_STEP, absent.ws);
  assert.equal(ra.status, 3, ra.out);
  assert.match(ra.out, /devflow-plugin\.ref/);

  const outside = tmp("fora-");
  writeFileSync(join(outside, "ref"), "v9.9.9\n");
  const link = githubWorkspace(await origin({ pin: null }), (r) => symlinkSync(join(outside, "ref"), join(r, PIN_TARGET)));
  const rl = runStep(PIN_STEP, link.ws);
  assert.equal(rl.status, 3, rl.out);
  assert.deepEqual(rl.outputs, {});

  const noBase = githubWorkspace(await origin(), ok);
  const rb = runStep(PIN_STEP, noBase.ws, { contexts: { ...CONTEXTS, "github.event.pull_request.base.ref": "nao-existe" } });
  assert.equal(rb.status, 3, rb.out);
  assert.deepEqual(rb.outputs, {});
});

test("GitHub: nome de branch base com metacaractere de shell não vira comando", async () => {
  const pr = githubWorkspace(await origin(), ok);
  const contexts = { ...CONTEXTS, "github.event.pull_request.base.ref": 'main"; touch pwned; echo "' };
  for (const step of [PIN_STEP, GATE_STEP]) {
    const r = runStep(step, pr.ws, { contexts });
    assert.notEqual(r.status, 0, r.out);
    assert.equal(existsSync(join(pr.ws, "pwned")), false);
    assert.equal(existsSync(join(pr.project, "pwned")), false);
  }
});

// ── GitLab CI ───────────────────────────────────────────────────────────────────────

// "Repositório do plugin" local, com a tag do pin: os mesmos arquivos do plugin sob teste.
function pluginRemote() {
  const d = tmp("plugin-remote-");
  for (const p of [".claude-plugin", "scripts", "assets/standards"]) cpSync(join(PLUGIN, p), join(d, p), { recursive: true });
  git(d, "init", "-q", "-b", "main"); git(d, "config", "user.email", "t@t"); git(d, "config", "user.name", "t");
  git(d, "add", "-A"); git(d, "commit", "-qm", "plugin"); git(d, "tag", `v${VERSION}`);
  return d;
}

// `git` que registra o argv de cada chamada do job e repassa ao git de verdade: mostra se o job
// buscou alguma coisa, e o quê. (O git chama os próprios subcomandos pelo exec-path, sem passar
// por aqui: o registro é só do que o script do job pediu.)
function tracingGit() {
  const dir = tmp("git-");
  const log = join(dir, "argv.log");
  const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  writeFileSync(log, "");
  // Um argumento por par de colchetes, uma chamada por linha (como o `gh` de mentira).
  writeFileSync(join(dir, "git"), `#!/bin/sh\nprintf '[%s]' "$@" >> ${JSON.stringify(log)}; echo >> ${JSON.stringify(log)}\nexec ${JSON.stringify(real)} "$@"\n`);
  chmodSync(join(dir, "git"), 0o755);
  const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
  // Os `git fetch` do job: os do clone do projeto e, com `-C <dir>`, o que baixa o plugin.
  return { path: `${dir}${delimiter}${process.env.PATH}`, calls, fetches: () => calls().filter(c => c.includes("[fetch]")) };
}
const fetchOf = (name) => `[fetch][--quiet][--no-tags][origin][refs/heads/${name}]`;
const projectFetches = (trace) => trace.fetches().filter(c => !c.startsWith("[-C]"));

// O que o runner do GitLab tem num pipeline de merge request: o clone inteiro (GIT_DEPTH 0) na
// ponta da branch de origem, o nome da branch de destino e o SHA da base do diff (o ponto em
// que a branch saiu do destino) nas variáveis do pipeline. A variável com a ponta do destino só
// existe com merged results pipelines.
// `from` é de onde a branch sai; `update` a atualiza com o destino (merge) antes do pipeline.
// Com `mergedResults`, o destino anda depois que a branch saiu e o runner fica no merge do
// destino com a branch (o que o GitLab monta em refs/merge-requests/<iid>/merge); as variáveis
// trazem também a ponta do destino.
// Devolve quem roda o `script:` do job nesse clone, com as variáveis e o PATH pedidos.
function gitlabRunner(root, change, { remote, mergedResults = false, from = "main", update = false } = {}) {
  branch(root, change, from);
  if (update) git(root, "merge", "-q", "--no-ff", "-m", "atualiza a branch com o destino", "main");
  const project = join(tmp("gl-"), "project");
  if (mergedResults) {
    git(root, "checkout", "-q", "main");
    writeFileSync(join(root, "src/depois.js"), "ok\n");
    git(root, "add", "-A"); git(root, "commit", "-qm", "o destino andou");
    git(root, "checkout", "-q", "--detach", "main");
    git(root, "merge", "-q", "--no-ff", "-m", "merged result", "feat");
    git(root, "update-ref", "refs/merge-requests/7/merge", "HEAD");
    git(root, "checkout", "-q", "main");
  }
  const tip = git(root, "rev-parse", "main").trim();
  const base = git(root, "merge-base", "main", "feat").trim();
  execFileSync("git", ["clone", "-q", root, project]);
  if (mergedResults) {
    git(project, "fetch", "-q", "origin", "+refs/merge-requests/7/merge:refs/remotes/origin/merge-requests/7/merge");
    git(project, "checkout", "-q", "--detach", "refs/remotes/origin/merge-requests/7/merge");
  } else {
    git(project, "checkout", "-q", "--detach", "origin/feat");
  }
  const url = "https://github.com/NEXUZ-SYS/devflow.git";
  const script = gitlabScript(gitlabSnippet(), "devflow-standards");
  assert.ok(script.includes(url));
  return ({ vars = {}, path = process.env.PATH } = {}) => {
    const dir = tmp("gl-step-");
    writeFileSync(join(dir, "script.sh"), script.replaceAll(url, `file://${remote}`));
    // TMPDIR do teste: o `mktemp -d` do script (o clone do plugin) nasce aqui, não no /tmp da máquina.
    const scratch = join(dir, "tmp");
    mkdirSync(scratch);
    const env = {
      PATH: path, HOME: dir, TMPDIR: scratch, CI: "true", GITLAB_CI: "true", CI_PIPELINE_SOURCE: "merge_request_event",
      CI_MERGE_REQUEST_TARGET_BRANCH_NAME: "main", CI_MERGE_REQUEST_DIFF_BASE_SHA: base,
      ...(mergedResults ? { CI_MERGE_REQUEST_TARGET_BRANCH_SHA: tip } : {}), ...vars,
    };
    for (const k of Object.keys(env)) if (env[k] === null) delete env[k];
    const r = spawnSync("sh", [join(dir, "script.sh")], { cwd: project, encoding: "utf8", env, timeout: 120000 });
    return { status: r.status, out: `${r.stdout}${r.stderr}`, base, tip, target: mergedResults ? tip : null, project, leftovers: readdirSync(scratch) };
  };
}
const gitlabJob = (root, change, { vars, path, ...setup } = {}) => gitlabRunner(root, change, setup)({ vars, path });

// O destino promoveu o standard a `block` DEPOIS que a branch do merge request saiu dele: em
// `old` o std é `warn` e não há baseline; na ponta de `main` ele é `block`, com o legado aceito.
// O resto (shim, pin, CODEOWNERS) já estava versionado em `old`.
async function promotedOrigin() {
  const root = demoProject({ level: "warn" }); TEMPS.push(root);
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  writeFileSync(join(root, ".context/.devflow.yaml"), 'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n');
  mkdirSync(join(root, ".context/bin"), { recursive: true });
  copyFileSync(shimSource(), join(root, SHIM_TARGET));
  writeFileSync(join(root, PIN_TARGET), pluginPin().content);
  mkdirSync(join(root, ".github"), { recursive: true });
  writeFileSync(join(root, ".github/CODEOWNERS"), `* @todos\n${codeownersSnippet("@dona")}`);
  writeFileSync(join(root, ".gitignore"), ".context/runtime/\n");
  git(root, "add", "-A"); git(root, "commit", "-qm", "std em warn");
  const old = git(root, "rev-parse", "HEAD").trim();
  const md = join(root, ".context/engineering/standards/std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace("level: warn", "level: block"));
  git(root, "add", "-A");
  assert.equal(await human(root, "init"), 0);
  git(root, "add", "-A"); git(root, "commit", "-qm", "o destino promove o std a block e cria o baseline");
  return { root, old };
}

test("GitLab: o script do snippet roda o gate contra o SHA da base — 0 limpo, 1 com violação nova", async () => {
  const remote = pluginRemote();
  const clean = gitlabJob(await origin(), ok, { remote });
  assert.equal(clean.status, 0, clean.out);
  assert.match(clean.out, /catraca íntegra vs merge-base/);
  const dirty = gitlabJob(await origin(), violation, { remote });
  assert.equal(dirty.status, 1, dirty.out);
  assert.match(dirty.out, /src\/new\.js/);
  // Num runner que não é descartável (executor shell), o clone do plugin não pode ficar para trás.
  assert.deepEqual([clean.leftovers, dirty.leftovers], [[], []]);
});

test("GitLab: não há override — catraca enfraquecida é 1 mesmo com um gh que aprovaria, e o gh nem é chamado", async () => {
  const remote = pluginRemote();
  const root = await origin();
  const gh = fakeGh("echo '[]'");
  const r = gitlabJob(root, downgrade, { remote, path: gh.path });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /catraca enfraquecida vs merge-base/);
  assert.equal(existsSync(gh.log), false);
});

test("GitLab: com merged results a base é a ponta do destino que o pipeline entrega, e o job não busca nada do origin", async () => {
  const remote = pluginRemote();
  // A comparação é com a ponta do destino, não com o ponto em que a branch saiu. Com a variável
  // presente o nome da branch de destino nem é lido: malformado, não muda nada.
  const trace = tracingGit();
  const run = gitlabRunner(await origin(), ok, { remote, mergedResults: true });
  const merged = run({ path: trace.path, vars: { CI_MERGE_REQUEST_TARGET_BRANCH_NAME: "-x y..z" } });
  assert.equal(merged.status, 0, merged.out);
  assert.notEqual(merged.target, merged.base);
  assert.ok(merged.out.includes(`catraca íntegra vs merge-base ${merged.target.slice(0, 8)}`), merged.out);
  assert.deepEqual(projectFetches(trace), [], "com a ponta do destino nas variáveis, nenhum fetch no clone do projeto");

  // A variável presente mas que não é um SHA fecha: o job não cai para o fetch pelo nome.
  for (const notSha of ["main", "refs/heads/main", merged.target.slice(0, 12)]) {
    const t = tracingGit();
    const r = run({ path: t.path, vars: { CI_MERGE_REQUEST_TARGET_BRANCH_SHA: notSha } });
    assert.equal(r.status, 3, `${notSha} → ${r.status}\n${r.out}`);
    assert.deepEqual(t.fetches(), [], notSha);
  }
});

test("GitLab: sem merged results, merge request atrás do destino → 3 com o remédio, em vez de ser julgado pelas regras do commit em que saiu", async () => {
  const remote = pluginRemote();
  const { root, old } = await promotedOrigin();
  const trace = tracingGit();
  // A branch saiu do destino quando o std ainda era `warn` e traz código que hoje é `block`.
  const stale = gitlabJob(root, violation, { remote, from: old, path: trace.path });
  assert.equal(stale.base, old, "a base do diff do merge request é o ponto em que a branch saiu");
  assert.notEqual(stale.tip, old);
  assert.equal(stale.status, 3, stale.out);
  assert.doesNotMatch(stale.out, /catraca íntegra/, "nada foi julgado");
  assert.match(stale.out, /está atrás da branch de destino/);
  assert.ok(stale.out.includes(stale.tip), "a mensagem mostra a ponta do destino que o job buscou");
  assert.match(stale.out, /rebase ou merge/);
  assert.match(stale.out, /merged results pipelines/);
  // Parou antes de baixar o plugin: o único fetch do job foi o da branch de destino.
  assert.deepEqual(trace.fetches(), [fetchOf("main")]);
  assert.deepEqual(stale.leftovers, []);
});

test("GitLab: sem merged results, o mesmo merge request atualizado com o destino é julgado pelas regras de hoje → 1", async () => {
  const remote = pluginRemote();
  const { root, old } = await promotedOrigin();
  const updated = gitlabJob(root, violation, { remote, from: old, update: true });
  assert.equal(updated.base, updated.tip, "atualizada, a branch contém a ponta do destino");
  assert.equal(updated.status, 1, updated.out);
  assert.ok(updated.out.includes(`catraca íntegra vs merge-base ${updated.tip.slice(0, 8)}`), updated.out);
  assert.match(updated.out, /violação\(ões\) nova\(s\) de nível block/);
  assert.match(updated.out, /src\/new\.js:1 \[std-demo\/no-bad\]/);
  assert.doesNotMatch(updated.out, /src\/old\.js:\d+ \[std-demo/, "o legado do destino está no baseline do destino");
});

test("GitLab: sem merged results, merge request em dia e limpo → 0, contra a ponta do destino buscada do origin", async () => {
  const remote = pluginRemote();
  // Em dia depois de o destino andar: a branch saiu da base velha e foi atualizada.
  const { root, old } = await promotedOrigin();
  const trace = tracingGit();
  const run = gitlabRunner(root, ok, { remote, from: old, update: true });
  const clean = run({ path: trace.path });
  assert.equal(clean.status, 0, clean.out);
  assert.ok(clean.out.includes(`catraca íntegra vs merge-base ${clean.tip.slice(0, 8)}`), clean.out);
  assert.deepEqual(projectFetches(trace), [fetchOf("main")], "a branch de destino vai como refspec completo, num argumento só");
  // A base do diff não entra na conta: ausente, velha ou lixo, o veredito é o mesmo.
  for (const diffBase of [null, old, "main", "0".repeat(40)]) {
    const r = run({ vars: { CI_MERGE_REQUEST_DIFF_BASE_SHA: diffBase } });
    assert.equal(r.status, 0, `${diffBase} → ${r.status}\n${r.out}`);
    assert.ok(r.out.includes(`catraca íntegra vs merge-base ${r.tip.slice(0, 8)}`), r.out);
  }
  // Em dia sem o destino ter andado: a ponta buscada é o próprio ponto de saída.
  const fresh = gitlabJob(await origin(), ok, { remote });
  assert.equal(fresh.status, 0, fresh.out);
  assert.equal(fresh.base, fresh.tip);
});

test("GitLab: nome de branch de destino malformado ou ausente fecha (3) antes de qualquer git fetch", async () => {
  const remote = pluginRemote();
  const run = gitlabRunner(await origin(), ok, { remote });
  const malformed = [
    "minha branch", "main ", " main", "a..b", "-x", "--upload-pack=touch pwned", "--upload-pack=touch${IFS}pwned",
    "main\n", "main\nmain", "main\tx", "@{-1}", "main@{0}", "main~1", "main^", "main:refs/heads/x", "ma*n", "main.lock", "main/", "/main", "ma\\in",
    "$(touch pwned)", "; touch pwned", "",
  ];
  for (const bad of malformed) {
    const trace = tracingGit();
    const r = run({ path: trace.path, vars: { CI_MERGE_REQUEST_TARGET_BRANCH_NAME: bad } });
    assert.equal(r.status, 3, `${JSON.stringify(bad)} → ${r.status}\n${r.out}`);
    assert.match(r.out, /CI_MERGE_REQUEST_TARGET_BRANCH_NAME/, JSON.stringify(bad));
    assert.deepEqual(trace.fetches(), [], `${JSON.stringify(bad)}: houve git fetch`);
    assert.doesNotMatch(r.out, /catraca íntegra/, JSON.stringify(bad));
    assert.equal(existsSync(join(r.project, "pwned")), false, JSON.stringify(bad));
  }
  // Sem o nome e sem a ponta do destino o job não tem base: a base do diff, sozinha, não serve.
  const trace = tracingGit();
  const absent = run({ path: trace.path, vars: { CI_MERGE_REQUEST_TARGET_BRANCH_NAME: null } });
  assert.equal(absent.status, 3, absent.out);
  assert.match(absent.out, /CI_MERGE_REQUEST_TARGET_BRANCH_NAME/);
  assert.deepEqual(trace.fetches(), []);
});

test("GitLab: nome de branch com metacaractere de shell, mas válido para o git, não vira comando; branch que o origin não tem fecha (3)", async () => {
  const remote = pluginRemote();
  const run = gitlabRunner(await origin(), ok, { remote });
  for (const name of ["$(touch${IFS}pwned)", "`touch${IFS}pwned`", "main;touch${IFS}pwned", "main&&touch${IFS}pwned", "main|touch${IFS}pwned", "x'\"y", "nao-existe"]) {
    const trace = tracingGit();
    const r = run({ path: trace.path, vars: { CI_MERGE_REQUEST_TARGET_BRANCH_NAME: name } });
    assert.equal(r.status, 3, `${name} → ${r.status}\n${r.out}`);
    assert.match(r.out, /buscar do origin a branch de destino/, name);
    // O nome chegou ao git inteiro, num argumento só, como refspec completo.
    assert.deepEqual(trace.fetches(), [fetchOf(name)], name);
    assert.doesNotMatch(r.out, /catraca íntegra/, name);
    assert.equal(existsSync(join(r.project, "pwned")), false, name);
    assert.deepEqual(r.leftovers, [], name);
  }
  // As aspas são a segunda camada: depois da validação nenhum nome tem espaço nem caractere de
  // glob, e por isso nenhum caso acima as exercita. Ficam fixadas no texto do script.
  const script = gitlabScript(gitlabSnippet(), "devflow-standards");
  assert.ok(script.includes('git check-ref-format --branch "$target"'));
  assert.ok(script.includes('git fetch --quiet --no-tags origin "refs/heads/${target}"'));
  assert.doesNotMatch(script, /\beval\b/, "o nome nunca entra numa string avaliada");
});

test("GitLab: pin inválido ou ausente fecha (3)", async () => {
  const remote = pluginRemote();
  for (const bad of ["main\n", "v1.2.3\nv9.9.9\n", "$(touch pwned)\n", ""]) {
    const r = gitlabJob(await origin({ pin: null }), (p) => writeFileSync(join(p, PIN_TARGET), bad), { remote });
    assert.equal(r.status, 3, `${JSON.stringify(bad)} → ${r.status}\n${r.out}`);
    assert.match(r.out, /devflow-plugin\.ref/);
    assert.equal(existsSync(join(r.project, "pwned")), false);
  }
  const noPin = gitlabJob(await origin({ pin: null }), ok, { remote });
  assert.equal(noPin.status, 3, noPin.out);
});
