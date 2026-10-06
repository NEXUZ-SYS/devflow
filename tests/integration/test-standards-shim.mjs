// tests/integration/test-standards-shim.mjs — o shim do projeto (`.context/bin/devflow-standards.mjs`)
// e o pre-commit que ele sustenta, executados de verdade num projeto-cliente (T19, R7).
//
// O cliente não tem CLAUDE_PLUGIN_ROOT e o cwd é o projeto, nunca o plugin. O registro de
// plugins é um arquivo de teste (CLAUDE_CONFIG_DIR): nada aqui lê o ~/.claude da máquina.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoProject } from "../helpers/standards-fixture.mjs";
import { preCommitSnippet, shimSource, SHIM_TARGET } from "../../scripts/lib/standards-gates.mjs";

const PLUGIN = process.cwd();
const SHIM_ASSET = join(PLUGIN, "assets/standards/bin/devflow-standards.mjs");
const TEMPS = [];
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); TEMPS.push(d); return d; };
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });

function client() {
  const root = demoProject(); TEMPS.push(root);
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  mkdirSync(join(root, ".context/bin"), { recursive: true });
  copyFileSync(SHIM_ASSET, join(root, SHIM_TARGET));
  writeFileSync(join(root, "src/a.js"), "ok\n");
  return root;
}

// Diretório de configuração do Claude Code só do teste, com (ou sem) o registro de plugins.
function config(entries) {
  const cfg = tmp("cfg-");
  if (entries !== undefined) {
    mkdirSync(join(cfg, "plugins"));
    writeFileSync(join(cfg, "plugins/installed_plugins.json"), typeof entries === "string" ? entries
      : JSON.stringify({ version: 2, plugins: { "devflow@NEXUZ-SYS": entries } }));
  }
  return cfg;
}

function env(cfg, extra = {}) {
  const e = { ...process.env, CLAUDE_CONFIG_DIR: cfg, HOME: cfg, CI: "", ...extra };
  delete e.CLAUDE_PLUGIN_ROOT;
  if (!("DEVFLOW_PLUGIN_ROOT" in extra)) delete e.DEVFLOW_PLUGIN_ROOT;
  return e;
}

const shim = (root, args, e) => spawnSync("node", [SHIM_TARGET, ...args], { cwd: root, encoding: "utf8", env: e, timeout: 60000 });

// Plugin de mentira com o marcador: o "CLI" dele só mostra o que recebeu.
function fakePlugin({ name = "devflow", body = "console.log(JSON.stringify(process.argv.slice(2)));", manifest = true, cli = true } = {}) {
  const d = tmp("plugin-");
  if (manifest) {
    mkdirSync(join(d, ".claude-plugin"));
    writeFileSync(join(d, ".claude-plugin/plugin.json"), JSON.stringify({ name, version: "9.9.9" }));
  }
  if (cli) {
    mkdirSync(join(d, "scripts"));
    writeFileSync(join(d, "scripts/devflow-standards.mjs"), body);
  }
  return d;
}

test("o asset do shim é o que a oferta manda copiar", () => {
  assert.equal(shimSource(), SHIM_ASSET);
  assert.equal(SHIM_TARGET, ".context/bin/devflow-standards.mjs");
  const text = readFileSync(SHIM_ASSET, "utf8");
  assert.doesNotMatch(text, /CLAUDE_PLUGIN_ROOT/, "o cliente não tem CLAUDE_PLUGIN_ROOT");
  assert.doesNotMatch(text, /\bexec\(|execSync\(|shell:\s*true/, "sem shell");
  assert.match(text, /from "node:/);
  assert.doesNotMatch(text, /from "\.{1,2}\//, "o shim é um arquivo só: no projeto não há o resto do plugin para importar");
});

test("shim acha o plugin pelo registro de plugins e roda o explain", () => {
  const root = client();
  const cfg = config([{ scope: "project", projectPath: root, installPath: PLUGIN }]);
  const r = shim(root, ["explain", "src/a.js"], env(cfg));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /std-demo/);
});

test("sem plugin localizável → exit 3, com mensagem em pt-BR", () => {
  const root = client();
  const r = shim(root, ["check", "--staged"], env(config()));
  assert.equal(r.status, 3);
  assert.match(r.stderr, /não localizado/);
  assert.match(r.stderr, /DEVFLOW_PLUGIN_ROOT/);
  assert.equal(r.stdout, "");
});

test("DEVFLOW_PLUGIN_ROOT só vale se o diretório tiver o marcador do plugin", () => {
  const root = client();
  const cfg = config();
  const ok = shim(root, ["explain", "x"], env(cfg, { DEVFLOW_PLUGIN_ROOT: fakePlugin() }));
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), ["explain", "x"]);

  const semMarcador = [
    fakePlugin({ manifest: false }),               // sem .claude-plugin/plugin.json
    fakePlugin({ cli: false }),                    // sem scripts/devflow-standards.mjs
    fakePlugin({ name: "outro-plugin" }),          // o manifesto é de outro plugin
    tmp("vazio-"),
    "/nao/existe/mesmo",
    "plugin-relativo",                             // caminho relativo não vale
  ];
  mkdirSync(join(root, "plugin-relativo/.claude-plugin"), { recursive: true });
  writeFileSync(join(root, "plugin-relativo/.claude-plugin/plugin.json"), JSON.stringify({ name: "devflow" }));
  mkdirSync(join(root, "plugin-relativo/scripts"));
  writeFileSync(join(root, "plugin-relativo/scripts/devflow-standards.mjs"), "process.exit(0)");
  for (const dir of semMarcador) {
    const r = shim(root, ["explain", "x"], env(cfg, { DEVFLOW_PLUGIN_ROOT: dir }));
    assert.equal(r.status, 3, `${dir} → ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /DEVFLOW_PLUGIN_ROOT ignorado/);
    assert.match(r.stderr, /não localizado/);
  }
});

test("DEVFLOW_PLUGIN_ROOT sem marcador não impede o registro; com marcador, vem antes dele", () => {
  const root = client();
  const cfg = config([{ scope: "project", projectPath: root, installPath: PLUGIN }]);
  const viaRegistro = shim(root, ["explain", "src/a.js"], env(cfg, { DEVFLOW_PLUGIN_ROOT: tmp("vazio-") }));
  assert.equal(viaRegistro.status, 0, viaRegistro.stderr);
  assert.match(viaRegistro.stdout, /std-demo/);
  const viaEnv = shim(root, ["explain", "src/a.js"], env(cfg, { DEVFLOW_PLUGIN_ROOT: fakePlugin() }));
  assert.deepEqual(JSON.parse(viaEnv.stdout), ["explain", "src/a.js"]);
});

test("registro: escopo project deste repositório, senão user; entrada de outro projeto não vale", () => {
  const root = client();
  const deste = fakePlugin({ body: 'console.log("deste projeto")' });
  const doUsuario = fakePlugin({ body: 'console.log("do usuario")' });
  const deOutro = fakePlugin({ body: 'console.log("de outro projeto")' });
  const outro = { scope: "project", projectPath: tmp("outro-"), installPath: deOutro };
  const user = { scope: "user", installPath: doUsuario };
  const mine = { scope: "project", projectPath: root, installPath: deste };

  assert.match(shim(root, [], env(config([outro, user, mine]))).stdout, /deste projeto/);
  assert.match(shim(root, [], env(config([outro, user]))).stdout, /do usuario/);
  const none = shim(root, [], env(config([outro])));
  assert.equal(none.status, 3, none.stdout);
  // A entrada do projeto sem o marcador (instalação apagada do cache) cai para a de user.
  const stale = { scope: "project", projectPath: root, installPath: tmp("sumiu-") };
  assert.match(shim(root, [], env(config([stale, user]))).stdout, /do usuario/);
});

test("registro ilegível não trava nem derruba: FIFO, grande demais, JSON quebrado, formato inesperado → exit 3", () => {
  const root = client();
  const fifo = config();
  mkdirSync(join(fifo, "plugins"));
  execFileSync("mkfifo", [join(fifo, "plugins/installed_plugins.json")]);
  const t0 = Date.now();
  const r = shim(root, ["explain", "x"], { ...env(fifo) });
  assert.equal(r.status, 3, `status ${r.status} sinal ${r.signal}`);
  assert.ok(Date.now() - t0 < 20000, "um FIFO no lugar do registro não pode travar o commit");

  const huge = config(`{"plugins":{"devflow@NEXUZ-SYS":[{"scope":"user","installPath":${JSON.stringify(PLUGIN)}}]},"x":"${"a".repeat(5 * 1024 * 1024)}"}`);
  assert.equal(shim(root, ["explain", "x"], env(huge)).status, 3, "acima do teto de leitura");

  for (const text of ["isto não é JSON", "null", "[]", '{"plugins":null}', '{"plugins":{"devflow@NEXUZ-SYS":"x"}}',
    '{"plugins":{"devflow@NEXUZ-SYS":[null, 7, {"scope":"user"}, {"scope":"user","installPath":7}]}}']) {
    const bad = shim(root, ["explain", "x"], env(config(text)));
    assert.equal(bad.status, 3, `${text} → ${bad.status}\n${bad.stderr}`);
    assert.match(bad.stderr, /não localizado/);
  }

  const dir = config();
  mkdirSync(join(dir, "plugins/installed_plugins.json"), { recursive: true });
  assert.equal(shim(root, ["explain", "x"], env(dir)).status, 3, "diretório no lugar do registro");
});

test("argv é repassado em array, sem shell", () => {
  const root = client();
  const args = ["check", "a b", "; touch pwned-1", "$(touch pwned-2)", "`touch pwned-3`", "--x=y z", "*", "", "ç\"'"];
  const r = shim(root, args, env(config(), { DEVFLOW_PLUGIN_ROOT: fakePlugin() }));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), args);
  for (const n of ["pwned-1", "pwned-2", "pwned-3"]) assert.equal(existsSync(join(root, n)), false);
});

test("o exit code do plugin é o do shim; plugin morto por sinal → 3", () => {
  const root = client();
  const echo = fakePlugin({ body: "process.exit(Number(process.argv[2]));" });
  for (const code of [0, 1, 2, 3]) {
    assert.equal(shim(root, [String(code)], env(config(), { DEVFLOW_PLUGIN_ROOT: echo })).status, code);
  }
  const killed = fakePlugin({ body: 'process.kill(process.pid, "SIGKILL"); setTimeout(() => {}, 5000);' });
  assert.equal(shim(root, [], env(config(), { DEVFLOW_PLUGIN_ROOT: killed })).status, 3);
});

test("check --staged pelo shim: limpo → 0; violação nova de nível block → 1", () => {
  const root = client();
  const e = env(config([{ scope: "user", installPath: PLUGIN }]));
  git(root, "add", "-A");
  const clean = shim(root, ["check", "--staged"], e);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  writeFileSync(join(root, "src/b.js"), "BAD\n");
  git(root, "add", "-A");
  const dirty = shim(root, ["check", "--staged"], e);
  assert.equal(dirty.status, 1, dirty.stdout + dirty.stderr);
  assert.match(dirty.stdout, /src\/b\.js/);
});

test("numa worktree, o shim acha o plugin registrado para o repositório principal", () => {
  const root = client();
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  const wt = join(tmp("wt-"), "feature");
  git(root, "worktree", "add", "-q", "-b", "feature", wt);
  const cfg = config([{ scope: "project", projectPath: root, installPath: PLUGIN }]);
  const r = shim(wt, ["explain", "src/a.js"], env(cfg));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /std-demo/);
});

test("projectPath alcançado por link simbólico é o mesmo projeto", () => {
  const root = client();
  const link = join(tmp("link-"), "projeto");
  symlinkSync(root, link);
  const cfg = config([{ scope: "project", projectPath: link, installPath: PLUGIN }]);
  assert.equal(shim(root, ["explain", "src/a.js"], env(cfg)).status, 0);
});

// ── o pre-commit de verdade ─────────────────────────────────────────────────────────

// Instala o comando do snippet como hook do git (o que husky, lefthook e pre-commit fazem por
// baixo) e commita: é o `git commit` que decide.
function installHook(root, manager) {
  const { content } = preCommitSnippet(manager);
  const command = manager === "husky" ? content.trim()
    : manager === "pre-commit" ? content.match(/^\s+entry: (.+)$/m)[1]
      : content.match(/^\s+run: (.+)$/m)[1];
  mkdirSync(join(root, ".git/hooks"), { recursive: true });
  writeFileSync(join(root, ".git/hooks/pre-commit"), `#!/bin/sh\n${command}\n`);
  chmodSync(join(root, ".git/hooks/pre-commit"), 0o755);
  return command;
}
const commit = (root, e) => spawnSync("git", ["-C", root, "-c", "core.hooksPath=.git/hooks", "-c", "commit.gpgsign=false", "commit", "-qm", "x"], { encoding: "utf8", env: e });

for (const manager of ["husky", "lefthook", "pre-commit"]) {
  test(`pre-commit (${manager}): o comando do snippet barra o commit com violação e deixa passar o limpo`, () => {
    const root = client();
    const e = env(config([{ scope: "project", projectPath: root, installPath: PLUGIN }]));
    assert.equal(installHook(root, manager), "node .context/bin/devflow-standards.mjs check --staged");
    git(root, "add", "-A");
    const first = commit(root, e);
    assert.equal(first.status, 0, first.stdout + first.stderr);

    writeFileSync(join(root, "src/novo.js"), "BAD\n");
    git(root, "add", "-A");
    const blocked = commit(root, e);
    assert.notEqual(blocked.status, 0, "commit com violação nova tem de ser barrado");
    assert.match(blocked.stdout + blocked.stderr, /violação\(ões\) nova\(s\) de nível block/);
    assert.match(blocked.stdout + blocked.stderr, /src\/novo\.js/);
    assert.equal(git(root, "rev-list", "--count", "HEAD").trim(), "1", "nenhum commit novo");

    writeFileSync(join(root, "src/novo.js"), "ok\n");
    git(root, "add", "-A");
    const fixed = commit(root, e);
    assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
    assert.equal(git(root, "rev-list", "--count", "HEAD").trim(), "2");
  });
}

test("pre-commit sem plugin na máquina: o commit não passa calado (exit 3 do shim)", () => {
  const root = client();
  installHook(root, "husky");
  git(root, "add", "-A");
  const r = commit(root, env(config()));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /não localizado/);
});
