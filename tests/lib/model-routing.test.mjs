// tests/lib/model-routing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../../scripts/lib/model-routing.mjs";

test("tierOf reconhece alias, id completo, role do omp e o próprio tier", () => {
  assert.equal(R.tierOf("haiku"), "cheap");
  assert.equal(R.tierOf("claude-haiku-4-5-20251001"), "cheap");
  assert.equal(R.tierOf("sonnet"), "standard");
  assert.equal(R.tierOf("claude-sonnet-5-5"), "standard");
  assert.equal(R.tierOf("claude-opus-5-5"), "capable");
  assert.equal(R.tierOf("opusplan"), "capable");
  assert.equal(R.tierOf("fable"), "top");
  assert.equal(R.tierOf("claude-fable-5-1"), "top");
  assert.equal(R.tierOf("pi/slow"), "capable");
  assert.equal(R.tierOf("default"), "standard");
  assert.equal(R.tierOf("standard"), "standard");
});

test("tierOf devolve null para o que não conhece", () => {
  for (const v of ["best", "", "   ", undefined, null, 42, "claude-mythos-5", "gpt-5"]) {
    assert.equal(R.tierOf(v), null, String(v));
  }
});

test("toAlias e toRole traduzem cada tier e recusam o resto", () => {
  assert.deepEqual(R.TIERS.map(R.toAlias), ["haiku", "sonnet", "opus", "fable"]);
  assert.deepEqual(R.TIERS.map(R.toRole), ["pi/smol", "default", "pi/slow", "pi/plan"]);
  assert.equal(R.toAlias("x"), null);
  for (const k of ["constructor", "toString", "__proto__"]) {
    assert.equal(R.toAlias(k), null, `toAlias(${k})`);
    assert.equal(R.toRole(k), null, `toRole(${k})`);
  }
});

test("nextTier sobe um degrau e para no topo", () => {
  assert.equal(R.nextTier("cheap"), "standard");
  assert.equal(R.nextTier("capable"), "top");
  assert.equal(R.nextTier("top"), "top");
  assert.equal(R.nextTier("x"), null);
});

test("capAtCeiling nunca passa do teto nem do maxTier", () => {
  assert.equal(R.capAtCeiling("capable", "standard"), "standard");
  assert.equal(R.capAtCeiling("cheap", "capable"), "cheap");
  assert.equal(R.capAtCeiling("top", "top", "capable"), "capable");
  assert.equal(R.capAtCeiling("standard", "capable", "cheap"), "cheap");
  assert.equal(R.capAtCeiling("standard", "capable", "lixo"), "standard");
});

test("capAtCeiling com teto ou tier ilegível devolve null (não roteia)", () => {
  assert.equal(R.capAtCeiling("standard", null), null);
  assert.equal(R.capAtCeiling("standard", "lixo"), null);
  assert.equal(R.capAtCeiling("lixo", "capable"), null);
});

test("capEffort limita ao teto e não mexe quando o teto é desconhecido", () => {
  assert.equal(R.capEffort("xhigh", "high"), "high");
  assert.equal(R.capEffort("low", "xhigh"), "low");
  assert.equal(R.capEffort("high", undefined), null);
  assert.equal(R.capEffort("high", 3), null);
  assert.equal(R.capEffort("turbo", "high"), null);
});

test("stepEffort sobe um degrau após falha, volta ao base no sucesso, respeita o teto", () => {
  assert.equal(R.stepEffort("medium", 0, "xhigh"), "medium");
  assert.equal(R.stepEffort("medium", 1, "xhigh"), "high");
  assert.equal(R.stepEffort("medium", 5, "xhigh"), "high");
  assert.equal(R.stepEffort("high", 1, "high"), "high");
  assert.equal(R.stepEffort("max", 1, "max"), "max");
  assert.equal(R.stepEffort(null, 1, "max"), null);
});

test("phaseFromPrevcJson só aceita P/R/E/V/C", () => {
  const ok = JSON.stringify({ status: { project: { current_phase: "E" } } });
  assert.equal(R.phaseFromPrevcJson(ok), "E");
  assert.equal(R.phaseFromPrevcJson(JSON.stringify({ status: { project: { current_phase: "rm -rf" } } })), null);
  assert.equal(R.phaseFromPrevcJson("root:x:0:0:root:/root:/bin/bash"), null);
  assert.equal(R.phaseFromPrevcJson(""), null);
  assert.equal(R.phaseFromPrevcJson(undefined), null);
});

test("effectiveConfig: o repositório sozinho não liga o roteamento (D18, Review Focus 2)", () => {
  const cfg = { enabled: true, session: true };
  assert.equal(R.effectiveConfig(cfg, "1").enabled, true);
  for (const v of [undefined, "", "0", "true", "yes", 1]) assert.equal(R.effectiveConfig(cfg, v).enabled, false, String(v));
  assert.equal(R.effectiveConfig({ enabled: false }, "1").enabled, false);
  assert.equal(R.effectiveConfig(null, "1").enabled, false);
  assert.equal(cfg.enabled, true, "não muta a config original");
});

test("módulo é puro: sem node:* e sem require", () => {
  const src = readFileSync(new URL("../../scripts/lib/model-routing.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\s+["']node:/);
  assert.doesNotMatch(src, /\brequire\s*\(/);
});

test("workflowFromPrevcJson só aceita nome seguro (allowlist, até 128)", () => {
  const mk = (name) => JSON.stringify({ status: { project: { name } } });
  assert.equal(R.workflowFromPrevcJson(mk("router-monitor.v2_x")), "router-monitor.v2_x");
  assert.equal(R.workflowFromPrevcJson(mk("a/b")), null);
  assert.equal(R.workflowFromPrevcJson(mk("a b")), null);
  assert.equal(R.workflowFromPrevcJson(mk("a".repeat(128))), "a".repeat(128));
  assert.equal(R.workflowFromPrevcJson(mk("a".repeat(129))), null);
  assert.equal(R.workflowFromPrevcJson(mk(42)), null);
  assert.equal(R.workflowFromPrevcJson("{nao json"), null);
  assert.equal(R.workflowFromPrevcJson(""), null);
  assert.equal(R.workflowFromPrevcJson(undefined), null);
});
