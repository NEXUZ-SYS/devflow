// tests/lib/test-run-one-linter.mjs — contrato de saída do linter (ADR-015 D4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runOneLinter, linterEnv } from "../../scripts/lib/run-linter.mjs";
import { checkFiles } from "../../scripts/lib/standards-engine.mjs";
import { demoProject } from "../helpers/standards-fixture.mjs";

const std = { id: "std-demo", origin: "project", enforcement: { linter: "engineering/standards/machine/std-demo.js" } };
async function withLinter(body, content = "x\n", opts = {}) {
  const root = demoProject({ linterBody: body });
  try {
    writeFileSync(join(root, "src/a.js"), content);
    return await runOneLinter(std, join(root, "src/a.js"), { projectRoot: root, ...opts });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("exit 0 sem saída → limpo", async () => {
  assert.deepEqual(await withLinter("process.exit(0)"), { ok: true, stdout: "" });
});

test("exit 0 com VIOLATION → achados", async () => {
  const r = await withLinter('console.log("VIOLATION a x:1 m");process.exit(0)');
  assert.equal(r.ok, true);
  assert.match(r.stdout, /^VIOLATION a x:1 m/);
});

test("exit 1 com VIOLATION → achados", async () => {
  const r = await withLinter('console.log("VIOLATION a x:1 m");process.exit(1)');
  assert.equal(r.ok, true);
  assert.match(r.stdout, /VIOLATION a x:1 m/);
});

test("exceção no linter → erro, não limpo", async () => {
  const r = await withLinter('throw new Error("boom")');
  assert.equal(r.ok, false);
  assert.match(r.reason, /exit 1 sem VIOLATION/);
});

test("exit 1 sem VIOLATION → erro", async () => {
  const r = await withLinter('console.log("tudo certo");process.exit(1)');
  assert.equal(r.ok, false);
});

test("exit 2 → erro, mesmo com VIOLATION", async () => {
  assert.equal((await withLinter("process.exit(2)")).ok, false);
  assert.equal((await withLinter('console.log("VIOLATION a x:1 m");process.exit(2)')).ok, false);
});

test("morto por sinal → erro", async () => {
  const r = await withLinter('console.log("VIOLATION a x:1 m");process.kill(process.pid,"SIGKILL")');
  assert.equal(r.ok, false);
});

test("estouro de maxBuffer → erro mesmo com VIOLATION", async () => {
  const r = await withLinter('console.log("VIOLATION a x:1 m");process.stdout.write("y".repeat(2*1024*1024))');
  assert.equal(r.ok, false);
  assert.match(r.reason, /1MB/);
});

test("DEVFLOW_LINTER_TIMEOUT_MS só reduz o teto de 5s", async () => {
  const saved = process.env.DEVFLOW_LINTER_TIMEOUT_MS;
  try {
    process.env.DEVFLOW_LINTER_TIMEOUT_MS = "999999";
    let t0 = Date.now();
    let r = await withLinter("setTimeout(()=>{},60000)");
    assert.equal(r.ok, false);
    assert.ok(Date.now() - t0 < 7000, `teto de 5s não respeitado: ${Date.now() - t0}ms`);

    process.env.DEVFLOW_LINTER_TIMEOUT_MS = "300";
    t0 = Date.now();
    r = await withLinter("setTimeout(()=>{},60000)");
    assert.equal(r.ok, false);
    assert.ok(Date.now() - t0 < 2500, `env não reduziu o timeout: ${Date.now() - t0}ms`);
  } finally {
    if (saved === undefined) delete process.env.DEVFLOW_LINTER_TIMEOUT_MS;
    else process.env.DEVFLOW_LINTER_TIMEOUT_MS = saved;
  }
});

test("signal abortado mata o linter", async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 200);
  const t0 = Date.now();
  const r = await withLinter("setTimeout(()=>{},60000)", "x\n", { signal: ac.signal });
  assert.equal(r.ok, false);
  assert.match(r.reason, /abortado/);
  assert.ok(Date.now() - t0 < 2000);
});

test("SI-4 continua dentro de runOneLinter: caminho com .. é recusado sem executar", async () => {
  const root = demoProject();
  try {
    writeFileSync(join(root, "src/a.js"), "BAD\n");
    const bad = { ...std, enforcement: { linter: "engineering/standards/machine/../../x.js" } };
    const r = await runOneLinter(bad, "src/a.js", { projectRoot: root });
    assert.equal(r.ok, false);
    assert.match(r.reason, /unsafe|forbidden/);
    const def = { ...std, origin: "default" };
    const r2 = await runOneLinter(def, "src/a.js", { projectRoot: root });
    assert.equal(r2.ok, false, "default sem raiz confiável do plugin falha fechado");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("caminho relativo + cwd: o linter recebe o caminho relativo", async () => {
  const root = demoProject({ linterBody: 'console.log("VIOLATION a "+process.argv[2]+":1 m");process.exit(1)' });
  try {
    writeFileSync(join(root, "src/a.js"), "x\n");
    const r = await runOneLinter(std, "src/a.js", { projectRoot: root, cwd: root });
    assert.equal(r.ok, true);
    assert.match(r.stdout, /^VIOLATION a src\/a\.js:1 m/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("timeout vale mesmo se o linter capturar SIGTERM (D4: timeout é erro, nunca limpo)", async () => {
  const t0 = Date.now();
  const r = await withLinter('process.on("SIGTERM",()=>{});setTimeout(()=>{},8000)', "x\n", { timeoutMs: 300 });
  const took = Date.now() - t0;
  assert.equal(r.ok, false, `linter que ignora SIGTERM saiu como ${JSON.stringify(r)}`);
  assert.ok(took < 1500, `teto de timeout estourado: ${took}ms`);
});

test("roda o node do processo atual, não o do PATH", async () => {
  const saved = process.env.PATH;
  try {
    process.env.PATH = "";
    const r = await withLinter("process.exit(0)");
    assert.deepEqual(r, { ok: true, stdout: "" });
  } finally {
    process.env.PATH = saved;
  }
});

// ── SI-4: ambiente mínimo (ruling da T19) ───────────────────────────────────────────
// O linter é código do projeto — no gate do CI, inclusive o que o próprio PR trouxe — e o gate
// tem o GH_TOKEN do override no ambiente. O linter recebe só uma allowlist; nenhuma outra
// variável do processo chega a ele.

// Roda `fn` com `vars` no ambiente DESTE processo (o pai do linter) e restaura depois.
async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const ALLOWED = /^(PATH|HOME|TMPDIR|TMP|TEMP|LANG|LC_.+)$/;
const SECRETS = {
  GH_TOKEN: "ghs_SegredoDoOverride", GITHUB_TOKEN: "ghs_OutroSegredo", ACTIONS_RUNTIME_TOKEN: "rt_SegredoDoRunner",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc_SegredoDoRunner", CI_JOB_TOKEN: "glcbt_SegredoDoGitlab",
  NODE_AUTH_TOKEN: "npm_SegredoA", NPM_TOKEN: "npm_SegredoB",
  CLAUDE_PLUGIN_ROOT: "/caminho/secreto/do/plugin", CLAUDE_CODE_OAUTH_TOKEN: "oat_SegredoDaSessao",
};

test("linter que imprime process.env.GH_TOKEN numa VIOLATION: o valor não aparece", async () => {
  await withEnv(SECRETS, async () => {
    const r = await withLinter('console.log("VIOLATION vaza x:1 token="+process.env.GH_TOKEN);process.exit(1)');
    assert.equal(r.ok, true);
    assert.equal(r.stdout, "VIOLATION vaza x:1 token=undefined\n");
  });
});

test("nenhuma variável do processo fora da allowlist chega ao linter", async () => {
  await withEnv({ ...SECRETS, DEVFLOW_QUALQUER: "x", LANGUAGE: "pt_BR", LANG: "pt_BR.UTF-8", LC_ALL: "C" }, async () => {
    const parent = { ...process.env };
    const r = await withLinter('console.log("VIOLATION env x:1 "+JSON.stringify(process.env));process.exit(1)');
    assert.equal(r.ok, true);
    for (const [k, v] of Object.entries(SECRETS)) assert.ok(!r.stdout.includes(v), `${k} chegou ao linter`);
    const seen = JSON.parse(r.stdout.slice("VIOLATION env x:1 ".length));
    // Do que o pai tinha, só a allowlist passa (o sistema pode acrescentar variáveis próprias ao filho).
    for (const k of Object.keys(seen)) assert.ok(ALLOWED.test(k) || !(k in parent), `${k} foi herdada pelo linter`);
    assert.deepEqual([seen.LANG, seen.LC_ALL, seen.PATH, seen.LANGUAGE, seen.DEVFLOW_QUALQUER], ["pt_BR.UTF-8", "C", process.env.PATH, undefined, undefined]);
  });
});

test("NODE_OPTIONS do processo pai não chega ao linter — nem a variável, nem o preload que ela carregaria", async () => {
  const dir = mkdtempSync(join(tmpdir(), "preload-"));
  try {
    const marker = join(dir, "preload-rodou");
    writeFileSync(join(dir, "preload.cjs"), `require("fs").writeFileSync(${JSON.stringify(marker)}, "sim");`);
    await withEnv({ NODE_OPTIONS: `--require ${join(dir, "preload.cjs")}` }, async () => {
      const r = await withLinter('console.log("VIOLATION env x:1 NODE_OPTIONS="+process.env.NODE_OPTIONS);process.exit(1)');
      assert.equal(r.ok, true);
      assert.equal(r.stdout, "VIOLATION env x:1 NODE_OPTIONS=undefined\n");
      assert.equal(existsSync(marker), false, "o preload do NODE_OPTIONS rodou dentro do linter");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pelo engine: o achado de um linter que lê o ambiente não carrega a credencial", async () => {
  const root = demoProject({ linterBody: 'console.log("VIOLATION vaza "+process.argv[2]+":1 token="+process.env.GH_TOKEN);process.exit(1)' });
  try {
    writeFileSync(join(root, "src/a.js"), "x\n");
    await withEnv(SECRETS, async () => {
      const r = await checkFiles({ projectRoot: root, files: ["src/a.js"], baseline: null });
      assert.deepEqual(r.errors, []);
      assert.equal(r.blocking.length, 1);
      assert.equal(r.blocking[0].message, "token=undefined");
      assert.ok(!JSON.stringify(r).includes(SECRETS.GH_TOKEN));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("linterEnv: a allowlist — PATH, HOME, TMPDIR/TMP/TEMP, LANG e LC_*; no Windows, mais quatro", () => {
  const env = {
    PATH: "/bin", HOME: "/home/u", TMPDIR: "/t", TMP: "/t2", TEMP: "/t3", LANG: "C", LC_ALL: "C", LC_CTYPE: "UTF-8",
    ...SECRETS, NODE_OPTIONS: "--require x", NODE_PATH: "/m", LANGUAGE: "pt", LCX: "x", LC: "x", path: "/minusculo",
    DEVFLOW_LINTER_TIMEOUT_MS: "300", CI: "true", SystemRoot: "C:\\Windows", ComSpec: "cmd.exe", PATHEXT: ".EXE", USERPROFILE: "C:\\Users\\u",
    INDEFINIDA: undefined,
  };
  assert.deepEqual(linterEnv(env, "linux"), {
    PATH: "/bin", HOME: "/home/u", TMPDIR: "/t", TMP: "/t2", TEMP: "/t3", LANG: "C", LC_ALL: "C", LC_CTYPE: "UTF-8",
  });
  // No Windows o nome da variável não distingue caixa ("Path", "SystemRoot").
  assert.deepEqual(linterEnv({ ...env, PATH: undefined, Path: "C:\\bin" }, "win32"), {
    Path: "C:\\bin", path: "/minusculo", HOME: "/home/u", TMPDIR: "/t", TMP: "/t2", TEMP: "/t3", LANG: "C", LC_ALL: "C", LC_CTYPE: "UTF-8",
    SystemRoot: "C:\\Windows", ComSpec: "cmd.exe", PATHEXT: ".EXE", USERPROFILE: "C:\\Users\\u",
  });
  assert.deepEqual(linterEnv({}, "linux"), {});
  // Sem argumento: o ambiente do próprio processo, já filtrado.
  for (const k of Object.keys(linterEnv())) assert.match(k, process.platform === "win32" ? /./ : ALLOWED);
});
