#!/usr/bin/env node
// tests/validation/test-routines-state-split.mjs
// A DEFINIÇÃO das routines é versionada (o time compartilha a agenda, e ela
// replica entre dispositivos via clone). O ESTADO de execução é por máquina:
// numa cadência diária, uma máquina marcar "rodei hoje" silenciaria as outras,
// e toda sessão sujaria o working tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadRoutines, loadState, isFirstContact, markRun, snooze, markSuggested, setEnabled,
} from "../../scripts/lib/routines.mjs";

function repo(routinesJson) {
  const dir = mkdtempSync(join(tmpdir(), "routst-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  writeFileSync(join(dir, ".context", "routines.json"), JSON.stringify(routinesJson, null, 2));
  return dir;
}
const STATE = d => join(d, ".context", "runtime", "routines-state.json");
const DEF = d => JSON.parse(readFileSync(join(d, ".context", "routines.json"), "utf-8"));

test("sem arquivo de estado, é primeiro contato (clone novo)", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "1d", prompts: [] }] });
  assert.equal(isFirstContact(d), true);
  rmSync(d, { recursive: true, force: true });
});

test("markRun grava no estado local, não no arquivo versionado", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "1d", prompts: [] }] });
  markRun(d, "x", "2026-09-01");
  assert.equal(existsSync(STATE(d)), true);
  assert.equal(loadState(d).x.lastRun, "2026-09-01");
  assert.equal("lastRun" in DEF(d).routines[0], false, "o versionado não pode carregar estado");
  assert.equal(isFirstContact(d), false);
  rmSync(d, { recursive: true, force: true });
});

test("markRun recalcula nextRun pela frequência", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "7d", prompts: [] }] });
  markRun(d, "x", "2026-09-01");
  assert.equal(loadState(d).x.nextRun, "2026-09-08");
  rmSync(d, { recursive: true, force: true });
});

test("migra o formato antigo: estado sai do versionado e vai para o runtime", () => {
  const d = repo({ routines: [{
    id: "x", enabled: true, frequency: "7d",
    lastRun: "2026-07-01", nextRun: "2026-07-08",
    lastSuggested: "2026-07-22", snoozeUntil: null, prompts: [],
  }] });
  const { routines } = loadRoutines(d);
  assert.equal(routines[0].lastRun, "2026-07-01", "segue visível para os consumidores");
  assert.equal(loadState(d).x.nextRun, "2026-07-08", "agora mora no runtime");
  const def = DEF(d).routines[0];
  assert.equal("lastRun" in def, false);
  assert.equal("lastSuggested" in def, false);
  assert.equal("snoozeUntil" in def, false);
  assert.equal(def.frequency, "7d", "a definição sobrevive");
  rmSync(d, { recursive: true, force: true });
});

test("a migração é idempotente e não reescreve um arquivo já limpo", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "7d", prompts: [] }] });
  const before = readFileSync(join(d, ".context", "routines.json"), "utf-8");
  loadRoutines(d);
  loadRoutines(d);
  assert.equal(readFileSync(join(d, ".context", "routines.json"), "utf-8"), before);
  rmSync(d, { recursive: true, force: true });
});

test("snooze e markSuggested também vão para o estado local", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "1d", prompts: [] }] });
  snooze(d, "x", 3, "2026-09-01");
  markSuggested(d, "x", "2026-09-01");
  const st = loadState(d);
  assert.equal(st.x.snoozeUntil, "2026-09-04");
  assert.equal(st.x.lastSuggested, "2026-09-01");
  assert.equal("snoozeUntil" in DEF(d).routines[0], false);
  rmSync(d, { recursive: true, force: true });
});

test("setEnabled continua no versionado — é definição do time, não estado da máquina", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "1d", prompts: [] }] });
  setEnabled(d, "x", false);
  assert.equal(DEF(d).routines[0].enabled, false);
  rmSync(d, { recursive: true, force: true });
});

test("loadRoutines mescla estado local na definição", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "7d", prompts: [] }] });
  markRun(d, "x", "2026-09-01");
  const { routines } = loadRoutines(d);
  assert.equal(routines[0].lastRun, "2026-09-01");
  assert.equal(routines[0].nextRun, "2026-09-08");
  assert.equal(routines[0].frequency, "7d");
  rmSync(d, { recursive: true, force: true });
});

test("estado de uma máquina não vaza para o arquivo que o clone entrega", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "1d", prompts: [] }] });
  markRun(d, "x", "2026-09-01");
  const versionado = JSON.stringify(DEF(d));
  for (const campo of ["lastRun", "nextRun", "lastSuggested", "snoozeUntil"]) {
    assert.doesNotMatch(versionado, new RegExp(campo), `${campo} não pode estar no versionado`);
  }
  rmSync(d, { recursive: true, force: true });
});
