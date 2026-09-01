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
