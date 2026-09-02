#!/usr/bin/env node
// tests/validation/test-routines-seed.mjs
// O §4.6 da skill config copiava o template só quando .context/routines.json
// estava ausente — um projeto já configurado nunca receberia uma routine nova,
// e a feature ficaria restrita a este repositório.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { seedRoutines } from "../../scripts/lib/routines-seed.mjs";

function setup(existing) {
  const dir = mkdtempSync(join(tmpdir(), "rseed-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  if (existing) writeFileSync(join(dir, ".context", "routines.json"), JSON.stringify(existing, null, 2));
  const tpl = join(dir, "template.json");
  writeFileSync(tpl, JSON.stringify({
    routines: [
      { id: "context-maintenance", description: "do template", enabled: true, frequency: "7d", execution: "confirm", prompts: [{ type: "command", value: "/devflow:devflow-doctor" }] },
      { id: "daily-devflow-checkup", description: "novo", enabled: true, frequency: "1d", execution: "auto", prompts: [{ type: "check", value: "plugin-env" }] },
    ],
  }, null, 2));
  return { dir, tpl, read: () => JSON.parse(readFileSync(join(dir, ".context", "routines.json"), "utf-8")) };
}

test("acrescenta a routine nova sem tocar na que o usuário já tinha", () => {
  const s = setup({ routines: [{ id: "context-maintenance", description: "EDITADO PELO USUARIO", enabled: false, frequency: "30d", prompts: [] }] });
  const r = seedRoutines(s.dir, s.tpl);
  assert.deepEqual(r.added, ["daily-devflow-checkup"]);
  const out = s.read().routines;
  const kept = out.find(x => x.id === "context-maintenance");
  assert.equal(kept.description, "EDITADO PELO USUARIO");
  assert.equal(kept.enabled, false, "desabilitar é decisão do time");
  assert.equal(kept.frequency, "30d");
  assert.ok(out.find(x => x.id === "daily-devflow-checkup"));
  rmSync(s.dir, { recursive: true, force: true });
});

test("cria o arquivo inteiro quando ele não existe", () => {
  const s = setup(null);
  const r = seedRoutines(s.dir, s.tpl);
  assert.deepEqual(r.added.sort(), ["context-maintenance", "daily-devflow-checkup"]);
  assert.equal(s.read().routines.length, 2);
  rmSync(s.dir, { recursive: true, force: true });
});

test("é idempotente: rodar duas vezes não duplica nem reescreve", () => {
  const s = setup(null);
  seedRoutines(s.dir, s.tpl);
  const before = readFileSync(join(s.dir, ".context", "routines.json"), "utf-8");
  const r = seedRoutines(s.dir, s.tpl);
  assert.deepEqual(r.added, []);
  assert.equal(readFileSync(join(s.dir, ".context", "routines.json"), "utf-8"), before);
  rmSync(s.dir, { recursive: true, force: true });
});

test("routine desabilitada de propósito não é ressuscitada nem reabilitada", () => {
  const s = setup({ routines: [{ id: "daily-devflow-checkup", enabled: false, frequency: "1d", execution: "auto", prompts: [{ type: "check", value: "plugin-env" }] }] });
  const r = seedRoutines(s.dir, s.tpl);
  assert.equal(r.added.includes("daily-devflow-checkup"), false);
  assert.equal(s.read().routines.find(x => x.id === "daily-devflow-checkup").enabled, false);
  rmSync(s.dir, { recursive: true, force: true });
});

test("template ilegível não destrói o routines.json do projeto", () => {
  const s = setup({ routines: [{ id: "meu", enabled: true, frequency: "1d", prompts: [] }] });
  writeFileSync(s.tpl, "{ não é json");
  const antes = readFileSync(join(s.dir, ".context", "routines.json"), "utf-8");
  const r = seedRoutines(s.dir, s.tpl);
  assert.deepEqual(r.added, []);
  assert.equal(readFileSync(join(s.dir, ".context", "routines.json"), "utf-8"), antes);
  rmSync(s.dir, { recursive: true, force: true });
});

test("não introduz campos de estado no arquivo versionado", () => {
  const s = setup(null);
  seedRoutines(s.dir, s.tpl);
  const raw = readFileSync(join(s.dir, ".context", "routines.json"), "utf-8");
  for (const campo of ["lastRun", "nextRun", "lastSuggested", "snoozeUntil"]) {
    assert.doesNotMatch(raw, new RegExp(campo));
  }
  rmSync(s.dir, { recursive: true, force: true });
});
