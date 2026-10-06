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

test("CLI: .devflow.yaml FIFO não trava o config-guard (sai em < 2 s)", { skip: process.platform === "win32" }, async () => {
  const { mkdtempSync, mkdirSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "cfg-fifo-"));
  mkdirSync(join(root, ".context"));
  spawnSync("mkfifo", [join(root, ".context/.devflow.yaml")]);
  const cli = join(process.cwd(), "scripts/lib/devflow-config-guard-cli.mjs");
  for (const ti of [{ old_string: "a", new_string: "b" }, { content: "git: {}\n" }]) {
    const ev = { tool_name: ti.content ? "Write" : "Edit", cwd: root, tool_input: { file_path: join(root, ".context/.devflow.yaml"), ...ti } };
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [cli], { input: JSON.stringify(ev), cwd: root, encoding: "utf8", timeout: 5000 });
    assert.equal(r.status, 0, `status ${r.status} sinal ${r.signal}`);
    assert.ok(Date.now() - t0 < 2000, `demorou ${Date.now() - t0} ms`);
  }
  const { rmSync } = await import("node:fs");
  rmSync(root, { recursive: true, force: true });
});
