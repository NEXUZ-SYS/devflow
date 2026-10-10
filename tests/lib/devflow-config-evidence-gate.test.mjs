// tests/lib/devflow-config-evidence-gate.test.mjs — prevc.evidenceGate (D5, spec 2026-10-10 §4.4)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readEvidenceGate } from "../../scripts/lib/devflow-config.mjs";
import { detectWeakenings } from "../../scripts/lib/devflow-config-guard.mjs";

test("ausente → block (padrão)", () => {
  assert.equal(readEvidenceGate(""), "block");
  assert.equal(readEvidenceGate("git:\n  strategy: branch-flow\n"), "block");
});

test("block, warn e off são lidos; aspas e comentário inline aceitos", () => {
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: warn\n"), "warn");
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: \"off\"  # desligado\n"), "off");
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: block\n"), "block");
});

test("valor inválido → block (fail-closed)", () => {
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: disabled\n"), "block");
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: WARN\n"), "block");
});

test("evidenceGate em outro bloco não conta", () => {
  assert.equal(readEvidenceGate("git:\n  evidenceGate: off\n"), "block");
});

test("config-guard: rebaixar o gate é enfraquecimento; subir ou manter, não", () => {
  const at = (v) => (v ? `prevc:\n  evidenceGate: ${v}\n` : "");
  assert.ok(detectWeakenings(at(""), at("off")).some((w) => /evidenceGate/.test(w)));
  assert.ok(detectWeakenings(at("block"), at("warn")).some((w) => /evidenceGate/.test(w)));
  assert.ok(detectWeakenings(at("warn"), at("off")).some((w) => /evidenceGate/.test(w)));
  assert.equal(detectWeakenings(at("off"), at("block")).filter((w) => /evidenceGate/.test(w)).length, 0);
  assert.equal(detectWeakenings(at("warn"), at("warn")).filter((w) => /evidenceGate/.test(w)).length, 0);
});
