// tests/lib/test-devflow-config-guard.mjs
// ADV-8/B9: impede auto-desarme da git-strategy. evaluateConfigChange detecta
// quando uma edição de .devflow.yaml ENFRAQUECE git.* (branchProtection,
// protectedBranches, strategy). Função pura (atual vs proposto).
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateConfigChange } from "../../scripts/lib/devflow-config-guard.mjs";

const BASE = `git:
  strategy: branch-flow
  protectedBranches: [main, develop]
  branchProtection: true
mempalace:
  budget: 1000
`;

test("deny: branchProtection true→false", () => {
  const proposed = BASE.replace("branchProtection: true", "branchProtection: false");
  assert.equal(evaluateConfigChange(BASE, proposed).decision, "deny");
});

test("deny: protectedBranches encolhe (remove develop)", () => {
  const proposed = BASE.replace("[main, develop]", "[main]");
  assert.equal(evaluateConfigChange(BASE, proposed).decision, "deny");
});

test("deny: strategy trocada para trunk-based", () => {
  const proposed = BASE.replace("strategy: branch-flow", "strategy: trunk-based");
  assert.equal(evaluateConfigChange(BASE, proposed).decision, "deny");
});

test("deny: protectedBranches esvaziada", () => {
  const proposed = BASE.replace("[main, develop]", "[]");
  assert.equal(evaluateConfigChange(BASE, proposed).decision, "deny");
});

test("allow: ajuste não-sensível (mempalace.budget)", () => {
  const proposed = BASE.replace("budget: 1000", "budget: 2000");
  assert.equal(evaluateConfigChange(BASE, proposed).decision, "allow");
});

test("allow: expande protectedBranches (adiciona release)", () => {
  const proposed = BASE.replace("[main, develop]", "[main, develop, release]");
  assert.equal(evaluateConfigChange(BASE, proposed).decision, "allow");
});

test("allow: strategy lateral (branch-flow → github-flow, ambas protegem)", () => {
  const proposed = BASE.replace("strategy: branch-flow", "strategy: github-flow");
  assert.equal(evaluateConfigChange(BASE, proposed).decision, "allow");
});

test("allow: conteúdo idêntico", () => {
  assert.equal(evaluateConfigChange(BASE, BASE).decision, "allow");
});
