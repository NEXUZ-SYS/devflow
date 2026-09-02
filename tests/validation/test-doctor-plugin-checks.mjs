#!/usr/bin/env node
// tests/validation/test-doctor-plugin-checks.mjs
// Unit dos checks de plugin do doctor. Sempre com HOME sintético — jamais o
// ~/.claude real, senão o resultado dependeria da máquina que roda a suíte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { getCheck } from "../../scripts/lib/doctor.mjs";

function w(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

function scenario({ declared = {}, userEnabled = {}, installed = {}, known = {}, published = {}, inner = {}, noPluginsDir = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "plugchk-"));
  const home = join(root, "home");
  const cwd = join(root, "proj");
  mkdirSync(cwd, { recursive: true });
  w(join(cwd, ".claude", "settings.json"), { enabledPlugins: declared });
  w(join(home, ".claude", "settings.json"), { enabledPlugins: userEnabled });
  if (!noPluginsDir) {
    const pd = join(home, ".claude", "plugins");
    mkdirSync(pd, { recursive: true });
    w(join(pd, "installed_plugins.json"), { version: 2, plugins: installed });
    w(join(pd, "known_marketplaces.json"), known);
    for (const [mkt, plugins] of Object.entries(published)) {
      w(join(pd, "marketplaces", mkt, ".claude-plugin", "marketplace.json"), { plugins });
    }
    for (const [mkt, paths] of Object.entries(inner)) {
      for (const [rel, body] of Object.entries(paths)) {
        w(join(pd, "marketplaces", mkt, rel, ".claude-plugin", "plugin.json"), body);
      }
    }
  }
  return {
    cwd,
    ctx: { cwd, home, which: () => false, exec: () => ({ status: 1, stdout: "", stderr: "" }), today: "2026-09-01" },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

// ── plugin-declared-installed ──────────────────────────────────────────
test("plugin-declared-installed: SKIP quando o harness não é o Claude Code", () => {
  const s = scenario({ noPluginsDir: true, declared: { "devflow@NEXUZ-SYS": true } });
  const r = getCheck("plugin-declared-installed").run(s.ctx);
  assert.equal(r.status, "SKIP");
  s.cleanup();
});

test("plugin-declared-installed: FAIL quando um plugin declarado não está instalado", () => {
  const s = scenario({ declared: { "devflow@NEXUZ-SYS": true } });
  const r = getCheck("plugin-declared-installed").run(s.ctx);
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis, /devflow@NEXUZ-SYS/);
  assert.ok(r.repair.length > 0);
  s.cleanup();
});

test("plugin-declared-installed: OK quando todos os declarados estão instalados", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
  });
  assert.equal(getCheck("plugin-declared-installed").run(s.ctx).status, "OK");
  s.cleanup();
});

test("plugin-declared-installed: OK mesmo sem entrada com o projectPath deste repo", () => {
  // Regressão do achado da fase R: este repositório não tem NENHUMA entrada
  // com o próprio projectPath, e o plugin funciona.
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: {
      "devflow@NEXUZ-SYS": [
        { scope: "project", projectPath: "/um/projeto/qualquer", version: "1.10.0" },
        { scope: "user", version: "3.1.0" },
      ],
    },
  });
  assert.equal(getCheck("plugin-declared-installed").run(s.ctx).status, "OK");
  s.cleanup();
});

test("plugin-declared-installed: OK sem afirmar nada quando o projeto não declara plugins", () => {
  const s = scenario({ declared: {} });
  const r = getCheck("plugin-declared-installed").run(s.ctx);
  assert.equal(r.status, "OK");
  assert.match(r.diagnosis, /não declara/i);
  s.cleanup();
});

// ── plugin-scope ───────────────────────────────────────────────────────
test("plugin-scope: WARN quando um plugin do projeto está habilitado em escopo user", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    userEnabled: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
  });
  const r = getCheck("plugin-scope").run(s.ctx);
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /escopo user/i);
  s.cleanup();
});

test("plugin-scope: instalação em escopo user NÃO é vazamento (só habilitação é)", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    userEnabled: {},
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
  });
  assert.equal(getCheck("plugin-scope").run(s.ctx).status, "OK");
  s.cleanup();
});

test("plugin-scope: SKIP fora do Claude Code", () => {
  const s = scenario({ noPluginsDir: true, declared: { "devflow@NEXUZ-SYS": true } });
  assert.equal(getCheck("plugin-scope").run(s.ctx).status, "SKIP");
  s.cleanup();
});

// ── plugin-marketplace-known ───────────────────────────────────────────
test("plugin-marketplace-known: FAIL quando o marketplace do plugin não está registrado", () => {
  const s = scenario({ declared: { "devflow@NEXUZ-SYS": true }, known: {} });
  const r = getCheck("plugin-marketplace-known").run(s.ctx);
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis, /NEXUZ-SYS/);
  s.cleanup();
});

test("plugin-marketplace-known: OK quando registrado", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    known: { "NEXUZ-SYS": { lastUpdated: "2026-09-01T00:00:00.000Z" } },
  });
  assert.equal(getCheck("plugin-marketplace-known").run(s.ctx).status, "OK");
  s.cleanup();
});

// ── plugin-up-to-date ──────────────────────────────────────────────────
test("plugin-up-to-date: WARN quando a versão instalada está atrás da publicada", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "1.30.0" }] },
    known: { "NEXUZ-SYS": { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { "NEXUZ-SYS": [{ name: "devflow", version: "3.1.0" }] },
  });
  const r = getCheck("plugin-up-to-date").run(s.ctx);
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /1\.30\.0/);
  assert.match(r.diagnosis, /3\.1\.0/);
  assert.match(r.repair, /devflow update/);
  s.cleanup();
});

test("plugin-up-to-date: OK quando instalada e publicada coincidem", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
    known: { "NEXUZ-SYS": { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { "NEXUZ-SYS": [{ name: "devflow", version: "3.1.0" }] },
  });
  assert.equal(getCheck("plugin-up-to-date").run(s.ctx).status, "OK");
  s.cleanup();
});

test("plugin-up-to-date: entradas antigas de outros projetos não geram WARN", () => {
  // Achado da fase R: 18 entradas, de 1.10.0 a 3.1.0. Se a mais alta é a
  // publicada, não há o que atualizar.
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: {
      "devflow@NEXUZ-SYS": [
        { scope: "project", projectPath: "/velho/a", version: "1.10.0" },
        { scope: "project", projectPath: "/velho/b", version: "1.23.1" },
        { scope: "user", version: "3.1.0" },
      ],
    },
    known: { "NEXUZ-SYS": { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { "NEXUZ-SYS": [{ name: "devflow", version: "3.1.0" }] },
  });
  assert.equal(getCheck("plugin-up-to-date").run(s.ctx).status, "OK");
  s.cleanup();
});

test("plugin-up-to-date: versão não-semver não vira 'desatualizado'", () => {
  const s = scenario({
    declared: { "cli@mkt": true },
    installed: { "cli@mkt": [{ scope: "user", version: "2ec6eb594e2c" }] },
    known: { mkt: { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { mkt: [{ name: "cli", version: "9.9.9" }] },
  });
  const r = getCheck("plugin-up-to-date").run(s.ctx);
  assert.equal(r.status, "OK");
  assert.match(r.diagnosis, /não comparáve/i);
  s.cleanup();
});

test("plugin-up-to-date: sha divergente vira WARN que NÃO afirma desatualizado", () => {
  const s = scenario({
    declared: { "superpowers@off": true },
    installed: { "superpowers@off": [{ scope: "user", version: "6.3.0", gitCommitSha: "f2cbfbefebbfef77321e4c9abc9e949826bea9d7" }] },
    known: { off: { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { off: [{ name: "superpowers", source: { source: "url", url: "https://x.git", sha: "b36e0829c6d0140e93cfef2ca599b1b07d4a7797" } }] },
  });
  const r = getCheck("plugin-up-to-date").run(s.ctx);
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /divergente/i);
  assert.doesNotMatch(r.diagnosis, /atrás da versão/);
  s.cleanup();
});

test("plugin-up-to-date: sha igual ao do marketplace é OK", () => {
  const sha = "b36e0829c6d0140e93cfef2ca599b1b07d4a7797";
  const s = scenario({
    declared: { "superpowers@off": true },
    installed: { "superpowers@off": [{ scope: "user", version: "6.3.0", gitCommitSha: sha }] },
    known: { off: { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { off: [{ name: "superpowers", source: { source: "url", url: "https://x.git", sha } }] },
  });
  assert.equal(getCheck("plugin-up-to-date").run(s.ctx).status, "OK");
  s.cleanup();
});

test("plugin-up-to-date: WARN quando o catálogo está obsoleto (>7 dias)", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
    known: { "NEXUZ-SYS": { lastUpdated: "2026-08-01T00:00:00.000Z" } },
    published: { "NEXUZ-SYS": [{ name: "devflow", version: "3.1.0" }] },
  });
  const r = getCheck("plugin-up-to-date").run(s.ctx); // ctx.today = 2026-09-01
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /catálogo/i);
  s.cleanup();
});

test("plugin-up-to-date: SKIP fora do Claude Code", () => {
  const s = scenario({ noPluginsDir: true, declared: { "devflow@NEXUZ-SYS": true } });
  assert.equal(getCheck("plugin-up-to-date").run(s.ctx).status, "SKIP");
  s.cleanup();
});

test("plugin-up-to-date: o sha reportado é o da versão mais alta, não o da primeira entrada", () => {
  // Defeito encontrado ao rodar no real: shas[0] pega a entrada mais ANTIGA.
  // Entre as 19 entradas de superpowers desta máquina, a primeira é a 5.0.6.
  const s = scenario({
    declared: { "superpowers@off": true },
    installed: {
      "superpowers@off": [
        { scope: "project", projectPath: "/velho", version: "5.0.6", gitCommitSha: "aaaaaaaa1111111111111111111111111111aaaa" },
        { scope: "user", version: "6.3.0", gitCommitSha: "ffffffff2222222222222222222222222222ffff" },
      ],
    },
    known: { off: { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { off: [{ name: "superpowers", source: { source: "url", url: "https://x.git", sha: "b36e0829c6d0140e93cfef2ca599b1b07d4a7797" } }] },
  });
  const r = getCheck("plugin-up-to-date").run(s.ctx);
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /ffffffff/, "deve citar o sha da 6.3.0");
  assert.doesNotMatch(r.diagnosis, /aaaaaaaa/, "não pode citar o sha da 5.0.6");
  s.cleanup();
});
