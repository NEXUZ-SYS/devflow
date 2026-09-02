#!/usr/bin/env node
// tests/validation/test-doctor-mempalace-env.mjs
// O mempalace-health devolve OK quando o MemPalace não está instalado — verde
// sobre a ausência total de memória de longo prazo, que é o que um dispositivo
// recém-clonado encontra. Este check trata ausência como divergência quando o
// projeto DECLARA mempalace.enabled: true.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getCheck } from "../../scripts/lib/doctor.mjs";

function scenario({ enabled = "true", hasBin = true, palaceExists = true, writeConfig = true, noYaml = false, palacePath = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mpenv-"));
  const home = join(root, "home");
  const cwd = join(root, "proj");
  mkdirSync(join(cwd, ".context"), { recursive: true });
  if (!noYaml) {
    writeFileSync(join(cwd, ".context", ".devflow.yaml"),
      `git:\n  strategy: branch-flow\nmempalace:\n  enabled: ${enabled}\n  budget: 1000\n`);
  }
  const palace = palacePath ?? join(home, ".mempalace", "palace");
  mkdirSync(join(home, ".mempalace"), { recursive: true });
  if (palaceExists) mkdirSync(palace, { recursive: true });
  if (writeConfig) writeFileSync(join(home, ".mempalace", "config.json"), JSON.stringify({ palace_path: palace }));
  return {
    palace,
    ctx: { cwd, home, which: b => (b === "mempalace" ? hasBin : false), exec: () => ({ status: 1, stdout: "", stderr: "" }), today: "2026-09-01" },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("OK quando não há .devflow.yaml", () => {
  const s = scenario({ noYaml: true, hasBin: false });
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "OK");
  s.cleanup();
});

test("OK quando o projeto não exige MemPalace", () => {
  const s = scenario({ enabled: "false", hasBin: false });
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "OK");
  assert.match(r.diagnosis, /não exig/i);
  s.cleanup();
});

test("FAIL quando o projeto exige e o binário não está instalado", () => {
  const s = scenario({ hasBin: false });
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis, /memória de longo prazo/i);
  assert.ok(r.repair.length > 0);
  s.cleanup();
});

test("FAIL quando o palace_path do config não existe", () => {
  const s = scenario({ palaceExists: false });
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "FAIL");
  assert.match(r.repair, /mempalace init/);
  s.cleanup();
});

test("WARN quando o binário existe mas não há config.json", () => {
  const s = scenario({ writeConfig: false });
  assert.equal(getCheck("mempalace-env").run(s.ctx).status, "WARN");
  s.cleanup();
});

test("OK informa qual palace está em uso", () => {
  const s = scenario({});
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "OK");
  assert.ok(r.diagnosis.includes(s.palace), "o diagnóstico deve citar o caminho do palace");
  s.cleanup();
});

test("comentário inline em 'enabled' não quebra a leitura", () => {
  // O parser já mordeu este repo: comentário capturado junto do valor fez o
  // grounding-mcp acusar ausência de um server presente.
  const s = scenario({ enabled: "true  # liga a memória de longo prazo", hasBin: false });
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "FAIL", "enabled com comentário deve continuar valendo true");
  s.cleanup();
});
