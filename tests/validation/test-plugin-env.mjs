#!/usr/bin/env node
// tests/validation/test-plugin-env.mjs
// Unit do leitor de ambiente de plugins. HOME sintético em tmpdir — nunca toca
// o ~/.claude real de quem roda a suíte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { readPluginEnv, isInstalled, highestInstalled } from "../../scripts/lib/plugin-env.mjs";

function w(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

function env({ declared = {}, userEnabled = {}, installed = {}, known = {}, published = {}, inner = {}, noPluginsDir = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "plugenv-"));
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
  return { home, cwd, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("sem ~/.claude/plugins o harness é 'other' — base do SKIP", () => {
  const e = env({ noPluginsDir: true, declared: { "devflow@NEXUZ-SYS": true } });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(r.harness, "other");
  assert.deepEqual(r.installs, {});
  e.cleanup();
});

test("lê os plugins habilitados pelo projeto, ignorando os desligados", () => {
  const e = env({ declared: { "devflow@NEXUZ-SYS": true, "outro@mkt": false } });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(r.harness, "claude-code");
  assert.deepEqual(Object.keys(r.declared), ["devflow@NEXUZ-SYS"]);
  assert.equal(r.declared["devflow@NEXUZ-SYS"].name, "devflow");
  assert.equal(r.declared["devflow@NEXUZ-SYS"].marketplace, "NEXUZ-SYS");
  e.cleanup();
});

test("isInstalled não exige entrada deste projeto — instalação é eixo global", () => {
  // Cenário real do repo devflow: o projeto declara o plugin, mas
  // installed_plugins só tem entradas de OUTROS projectPath e uma de escopo user.
  const e = env({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: {
      "devflow@NEXUZ-SYS": [
        { scope: "project", projectPath: "/outro/lugar", version: "1.10.0" },
        { scope: "user", version: "3.1.0" },
      ],
    },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(isInstalled(r, "devflow@NEXUZ-SYS"), true);
  e.cleanup();
});

test("isInstalled é falso quando não há nenhuma entrada", () => {
  const e = env({ declared: { "devflow@NEXUZ-SYS": true } });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(isInstalled(r, "devflow@NEXUZ-SYS"), false);
  e.cleanup();
});

test("highestInstalled devolve a maior versão entre todas as entradas", () => {
  const e = env({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: {
      "devflow@NEXUZ-SYS": [
        { scope: "project", projectPath: "/a", version: "1.10.0" },
        { scope: "project", projectPath: "/b", version: "1.23.1" },
        { scope: "user", version: "3.1.0" },
      ],
    },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(highestInstalled(r, "devflow@NEXUZ-SYS"), "3.1.0");
  e.cleanup();
});

test("highestInstalled ignora versão não-semver em vez de lançar", () => {
  const e = env({
    declared: { "cli@mkt": true },
    installed: { "cli@mkt": [{ scope: "user", version: "2ec6eb594e2c" }] },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(highestInstalled(r, "cli@mkt"), null);
  e.cleanup();
});

test("enabledAtUser reflete só a habilitação global, não a instalação", () => {
  const e = env({
    declared: { "devflow@NEXUZ-SYS": true },
    userEnabled: {},
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  // instalado em escopo user, porém NÃO habilitado ali (estado pós-PR #97)
  assert.equal(isInstalled(r, "devflow@NEXUZ-SYS"), true);
  assert.equal(r.enabledAtUser["devflow@NEXUZ-SYS"], undefined);
  e.cleanup();
});

test("forma 1: version declarada no próprio marketplace.json", () => {
  const e = env({
    known: { "NEXUZ-SYS": { lastUpdated: "2026-09-01T13:34:56.748Z" } },
    published: { "NEXUZ-SYS": [{ name: "devflow", version: "3.1.0" }] },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.deepEqual(r.marketplaces["NEXUZ-SYS"].published.devflow, { kind: "version", value: "3.1.0" });
  assert.equal(r.marketplaces["NEXUZ-SYS"].lastUpdated, "2026-09-01T13:34:56.748Z");
  e.cleanup();
});

test("forma 2: source como path local — versão vem do plugin.json interno", () => {
  const e = env({
    known: { ua: { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { ua: [{ name: "understand-anything", source: "./ua-plugin" }] },
    inner: { ua: { "./ua-plugin": { name: "understand-anything", version: "2.7.6" } } },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.deepEqual(r.marketplaces.ua.published["understand-anything"], { kind: "version", value: "2.7.6" });
  e.cleanup();
});

test("forma 3: source url+sha — publica o sha, não uma versão", () => {
  const e = env({
    known: { off: { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { off: [{ name: "superpowers", source: { source: "url", url: "https://x.git", sha: "b36e0829" } }] },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.deepEqual(r.marketplaces.off.published.superpowers, { kind: "sha", value: "b36e0829" });
  e.cleanup();
});

test("JSON corrompido não lança — trata como ausente", () => {
  const e = env({ declared: { "devflow@NEXUZ-SYS": true } });
  writeFileSync(join(e.home, ".claude", "plugins", "installed_plugins.json"), "{ não é json");
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(r.harness, "claude-code");
  assert.deepEqual(r.installs, {});
  e.cleanup();
});

// ── containment: o marketplace.json vem de repo de TERCEIRO ────────────
test("source com traversal não escapa do diretório do marketplace", () => {
  const e = env({
    known: { evil: { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { evil: [{ name: "p", source: "./../../../../escape" }] },
  });
  // marketplaces/evil + ../../../.. resolve para <home>/escape — é ali que o
  // traversal chegaria, então é ali que o arquivo tem de estar plantado para
  // o teste exercitar o vetor de verdade.
  const fora = join(e.home, "escape", ".claude-plugin", "plugin.json");
  w(fora, { name: "p", version: "9.9.9" });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(r.marketplaces.evil.published.p, undefined,
    "não pode ler plugin.json fora do diretório do marketplace");
  e.cleanup();
});

test("nome de marketplace com traversal é ignorado", () => {
  const e = env({
    known: { "../../../etc": { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: {},
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.deepEqual(r.marketplaces["../../../etc"]?.published ?? {}, {},
    "marketplace com path traversal não resolve nada");
  e.cleanup();
});

test("source local legítimo continua funcionando", () => {
  const e = env({
    known: { ok: { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { ok: [{ name: "p", source: "./sub/dir" }] },
    inner: { ok: { "./sub/dir": { name: "p", version: "1.2.3" } } },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.deepEqual(r.marketplaces.ok.published.p, { kind: "version", value: "1.2.3" });
  e.cleanup();
});
