// tests/lib/test-standards-level.mjs — nível de enforcement (ADR-015 D3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLevel, defaultLevelFor, maxLevel } from "../../scripts/lib/standards-level.mjs";

test("default do plugin é warn", () => {
  assert.equal(defaultLevelFor({ source: "devflow-default", origin: "default" }), "warn");
});
test("std autoral (source: local) é block", () => {
  assert.equal(defaultLevelFor({ source: "local", origin: "project" }), "block");
});
test("sem source → warn", () => {
  assert.equal(defaultLevelFor({}), "warn");
});
test("enforcement.level vence o default", () => {
  assert.equal(resolveLevel({ source: "devflow-default", enforcement: { level: "block" } }, "x"), "block");
});
test("rules[ruleId] vence enforcement.level", () => {
  const std = { source: "local", enforcement: { level: "block", rules: { "varchar-limit": "warn" } } };
  assert.equal(resolveLevel(std, "varchar-limit"), "warn");
  assert.equal(resolveLevel(std, "float-money"), "block");
});
test("advisory nunca passa de warn sem override explícito de regra", () => {
  assert.equal(resolveLevel({ source: "local" }, "theater", { advisory: true }), "warn");
  assert.equal(resolveLevel({ enforcement: { rules: { theater: "block" } } }, "theater", { advisory: true }), "block");
});
test("valor inválido cai para warn", () => {
  assert.equal(resolveLevel({ enforcement: { level: "strict" } }, "x"), "warn");
});
test("maxLevel considera o nível do std e as regras", () => {
  assert.equal(maxLevel({ source: "devflow-default" }), "warn");
  assert.equal(maxLevel({ source: "devflow-default", enforcement: { rules: { a: "block" } } }), "block");
  assert.equal(maxLevel({ source: "local", enforcement: { rules: { a: "warn" } } }), "block");
  assert.equal(maxLevel({ enforcement: { level: "review" } }), "review");
});

// ─── Correção — rodada 1 (ponto menor): enforcement.rules array não é mapa ────

test("enforcement.rules como array é ignorado — não é mapa de ruleId", () => {
  // Sem o guard !Array.isArray, "rules[ruleId]" indexa por posição numérica e
  // "Object.values(rules)" trata os elementos como níveis válidos.
  const std = { source: "local", enforcement: { level: "warn", rules: ["block"] } };
  assert.equal(resolveLevel(std, "0"), "warn", "rules[\"0\"] não deve indexar um array por posição");
  assert.equal(maxLevel({ source: "devflow-default", enforcement: { rules: ["block"] } }), "warn",
    "Object.values de um array não deve contar como override de regra");
});
