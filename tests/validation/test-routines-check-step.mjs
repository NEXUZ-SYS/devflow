#!/usr/bin/env node
// tests/validation/test-routines-check-step.mjs
// O passo `check` é o que separa executar de morrer sugerindo: ele roda no
// hook, em node, sem LLM. Passos command/skill/agent continuam precisando do
// modelo — por isso a routine context-maintenance acumulou 41 dias e zero
// execuções.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolveCheckIds, CHECK_GROUPS, loadState } from "../../scripts/lib/routines.mjs";

const CLI = resolve("scripts/routines.mjs");

function w(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

// Projeto com HOME sintético: sem ~/.claude/plugins os checks dão SKIP.
function repo(routines, { declared = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "rchk-"));
  const home = join(root, "home");
  const cwd = join(root, "proj");
  mkdirSync(join(cwd, ".context"), { recursive: true });
  mkdirSync(home, { recursive: true });
  w(join(cwd, ".context", "routines.json"), { routines });
  if (declared) {
    const pd = join(home, ".claude", "plugins");
    mkdirSync(pd, { recursive: true });
    w(join(cwd, ".claude", "settings.json"), { enabledPlugins: declared });
    w(join(home, ".claude", "settings.json"), { enabledPlugins: {} });
    w(join(pd, "installed_plugins.json"), { version: 2, plugins: {} });
    w(join(pd, "known_marketplaces.json"), {});
  }
  return { cwd, home, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function runCli(r, args) {
  return JSON.parse(execFileSync("node", [CLI, ...args], {
    cwd: r.cwd, encoding: "utf-8", env: { ...process.env, HOME: r.home },
  }));
}

test("o grupo plugin-env resolve para os quatro checks de plugin", () => {
  assert.deepEqual(resolveCheckIds("plugin-env"),
    ["plugin-declared-installed", "plugin-scope", "plugin-marketplace-known", "plugin-up-to-date"]);
});

test("o grupo mempalace-env resolve para o check de MemPalace", () => {
  assert.deepEqual(resolveCheckIds("mempalace-env"), ["mempalace-env"]);
});

test("um value desconhecido resolve para lista vazia, sem lançar", () => {
  assert.deepEqual(resolveCheckIds("nao-existe"), []);
  assert.deepEqual(resolveCheckIds(undefined), []);
});

test("todo id de CHECK_GROUPS existe no doctor", async () => {
  const { getCheck } = await import("../../scripts/lib/doctor.mjs");
  for (const [grupo, ids] of Object.entries(CHECK_GROUPS)) {
    for (const id of ids) {
      assert.ok(getCheck(id), `grupo ${grupo} aponta para check inexistente: ${id}`);
    }
  }
});

test("run-checks executa os passos check das routines auto e reporta firstContact", () => {
  const r = repo([{ id: "daily-devflow-checkup", enabled: true, frequency: "1d", execution: "auto",
    prompts: [{ type: "check", value: "plugin-env" }, { type: "check", value: "mempalace-env" }] }]);
  const out = runCli(r, ["run-checks", "--today", "2026-09-01"]);
  assert.equal(out.firstContact, true);
  assert.deepEqual(out.ran, ["daily-devflow-checkup"]);
  assert.equal(out.results.length, 5, "4 checks de plugin + 1 de mempalace");
  r.cleanup();
});

test("run-checks grava lastRun no estado local, não no versionado", () => {
  const r = repo([{ id: "daily-devflow-checkup", enabled: true, frequency: "1d", execution: "auto",
    prompts: [{ type: "check", value: "plugin-env" }] }]);
  runCli(r, ["run-checks", "--today", "2026-09-01"]);
  assert.equal(loadState(r.cwd)["daily-devflow-checkup"].lastRun, "2026-09-01");
  const versionado = readFileSync(join(r.cwd, ".context", "routines.json"), "utf-8");
  assert.doesNotMatch(versionado, /lastRun/);
  r.cleanup();
});

test("run-checks NÃO usa a guarda de 1x/dia — roda mesmo já sugerida hoje", () => {
  // O bug que este workflow quase reproduziu: o bloco de routines roda antes
  // no mesmo hook e chama mark-suggested.
  const r = repo([{ id: "daily-devflow-checkup", enabled: true, frequency: "1d", execution: "auto",
    prompts: [{ type: "check", value: "plugin-env" }] }]);
  execFileSync("node", [CLI, "mark-suggested", "daily-devflow-checkup", "--today", "2026-09-01"], { cwd: r.cwd });
  const out = runCli(r, ["run-checks", "--today", "2026-09-01"]);
  assert.deepEqual(out.ran, ["daily-devflow-checkup"], "sugestão não pode bloquear execução");
  r.cleanup();
});

test("run-checks propõe as rotinas confirm sem executá-las", () => {
  const r = repo([{ id: "context-maintenance", enabled: true, frequency: "7d", execution: "confirm",
    prompts: [{ type: "command", value: "/devflow:devflow-doctor" }] }]);
  const out = runCli(r, ["run-checks", "--today", "2026-09-01"]);
  assert.deepEqual(out.results, [], "confirm não executa nada");
  assert.deepEqual(out.proposed.map(p => p.id), ["context-maintenance"]);
  assert.deepEqual(out.proposed[0].commands, ["/devflow:devflow-doctor"]);
  // Não marcar: nada foi executado, e marcar adiaria a próxima proposta.
  assert.equal(loadState(r.cwd)["context-maintenance"]?.lastRun, undefined);
  r.cleanup();
});

test("run-checks não roda rotina sob snooze", () => {
  const r = repo([{ id: "daily-devflow-checkup", enabled: true, frequency: "1d", execution: "auto",
    prompts: [{ type: "check", value: "plugin-env" }] }]);
  execFileSync("node", [CLI, "snooze", "daily-devflow-checkup", "5", "--today", "2026-09-01"], { cwd: r.cwd });
  const out = runCli(r, ["run-checks", "--today", "2026-09-02"]);
  assert.deepEqual(out.ran, []);
  assert.deepEqual(out.results, []);
  r.cleanup();
});

test("run-checks detecta FAIL real quando um plugin declarado falta", () => {
  const r = repo([{ id: "daily-devflow-checkup", enabled: true, frequency: "1d", execution: "auto",
    prompts: [{ type: "check", value: "plugin-env" }] }], { declared: { "devflow@NEXUZ-SYS": true } });
  const out = runCli(r, ["run-checks", "--today", "2026-09-01"]);
  const fail = out.results.find(x => x.id === "plugin-declared-installed");
  assert.equal(fail.status, "FAIL");
  assert.match(fail.diagnosis, /devflow@NEXUZ-SYS/);
  r.cleanup();
});

test("run-checks resolve o PATH de verdade — o stub which daria FAIL falso", () => {
  // Nota 4 da fase R materializada: mempalace-env usa ctx.which, e um stub
  // que sempre devolve false diria "binário não está no PATH" numa máquina
  // onde ele está instalado.
  const r = repo([{ id: "c", enabled: true, frequency: "1d", execution: "auto",
    prompts: [{ type: "check", value: "mempalace-env" }] }]);
  // .devflow.yaml exigindo mempalace + um binário falso no PATH do processo
  const bin = join(r.home, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "mempalace"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(join(r.cwd, ".context", ".devflow.yaml"), "mempalace:\n  enabled: true\n");
  mkdirSync(join(r.home, ".mempalace", "palace"), { recursive: true });
  w(join(r.home, ".mempalace", "config.json"), { palace_path: join(r.home, ".mempalace", "palace") });

  const out = JSON.parse(execFileSync("node", [CLI, "run-checks", "--today", "2026-09-01"], {
    cwd: r.cwd, encoding: "utf-8",
    env: { ...process.env, HOME: r.home, PATH: `${bin}:${process.env.PATH}` },
  }));
  const mp = out.results.find(x => x.id === "mempalace-env");
  assert.equal(mp.status, "OK", "com o binário no PATH não pode dar FAIL");
  r.cleanup();
});

test("run-checks sai 0 mesmo sem routines.json — nunca trava o SessionStart", () => {
  const root = mkdtempSync(join(tmpdir(), "rchk-empty-"));
  const out = JSON.parse(execFileSync("node", [CLI, "run-checks", "--today", "2026-09-01"], { cwd: root, encoding: "utf-8" }));
  assert.deepEqual(out.ran, []);
  rmSync(root, { recursive: true, force: true });
});
