#!/usr/bin/env node
// tests/validation/test-routines-template.mjs
// O template é scaffold verbatim (ADR ci-scaffold-verbatim-provenance) e não
// pode carregar estado: ele é copiado para o projeto do usuário.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECK_GROUPS, classify } from "../../scripts/lib/routines.mjs";

const STATE_FIELDS = ["lastRun", "nextRun", "lastSuggested", "snoozeUntil"];

for (const path of ["templates/routines.json", ".context/routines.json"]) {
  test(`${path}: traz a routine daily-devflow-checkup com passos check válidos`, () => {
    const { routines } = JSON.parse(readFileSync(path, "utf-8"));
    const r = routines.find(x => x.id === "daily-devflow-checkup");
    assert.ok(r, "routine daily-devflow-checkup ausente");
    assert.equal(r.frequency, "1d");
    assert.equal(r.enabled, true);
    assert.equal(r.execution, "auto");
    const steps = r.prompts.filter(p => p.type === "check");
    assert.ok(steps.length >= 2, "esperados os passos plugin-env e mempalace-env");
    for (const step of steps) {
      assert.ok(CHECK_GROUPS[step.value], `grupo desconhecido: ${step.value}`);
    }
    assert.equal(classify(r), "auto");
  });

  test(`${path}: não carrega campos de estado (eles vivem em .context/runtime/)`, () => {
    const { routines } = JSON.parse(readFileSync(path, "utf-8"));
    for (const r of routines) {
      for (const f of STATE_FIELDS) {
        assert.equal(f in r, false, `${r.id} ainda carrega o campo de estado '${f}'`);
      }
    }
  });

  test(`${path}: preserva a context-maintenance, agora como confirm`, () => {
    const { routines } = JSON.parse(readFileSync(path, "utf-8"));
    const cm = routines.find(x => x.id === "context-maintenance");
    assert.ok(cm, "context-maintenance foi perdida");
    // O doctor leva ~16s: proposto, nunca executado sozinho.
    assert.equal(cm.execution, "confirm");
    assert.equal(classify(cm), "confirm");
  });
}
