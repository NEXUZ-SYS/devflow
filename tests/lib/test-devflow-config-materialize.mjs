// Suite — standards.materialize no parser único (ADR-011). Default LIGADO.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readStandardsMaterialize } from "../../scripts/lib/devflow-config.mjs";

test("default é LIGADO quando a chave não existe", () => {
  assert.equal(readStandardsMaterialize("git:\n  strategy: branch-flow\n"), true);
});

test("false explícito desliga", () => {
  assert.equal(readStandardsMaterialize("standards:\n  materialize: false\n"), false);
});

test("true explícito liga", () => {
  assert.equal(readStandardsMaterialize("standards:\n  materialize: true\n"), true);
});

test("tolera comentário inline", () => {
  // O parser de permissions.yaml já teve exatamente este bug.
  assert.equal(readStandardsMaterialize("standards:\n  materialize: false  # opt-out\n"), false);
});

test("não confunde com outro bloco que tenha materialize:", () => {
  assert.equal(readStandardsMaterialize("outro:\n  materialize: false\n"), true);
});

test("input não-string não lança", () => {
  assert.equal(readStandardsMaterialize(null), true);
  assert.equal(readStandardsMaterialize(undefined), true);
});
