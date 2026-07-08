// tests/e2e/hook-config.e2e.test.mjs — E2E do caminho real do hook post-tool-use:
// paylod TaskUpdate/completed → hook lê .devflow.yaml via devflow-config.mjs →
// classificação emitida no additionalContext. Ancora A1/A2 (não a prosa da skill).
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFixture, runHook } from "./_harness.mjs";

test("autoFinish: true → classificação 'all'", () => {
  const ctx = runHook(makeFixture({ devflowYaml: "git:\n  autoFinish: true\n" }));
  assert.match(ctx, /autoFinish:\s*all/);
});

test("autoFinish: false → 'disabled'", () => {
  const ctx = runHook(makeFixture({ devflowYaml: "git:\n  autoFinish: false\n" }));
  assert.match(ctx, /autoFinish:\s*disabled/);
});

test("autoFinish ausente → 'disabled'", () => {
  const ctx = runHook(makeFixture({ devflowYaml: "git:\n  prCli: gh\n" }));
  assert.match(ctx, /autoFinish:\s*disabled/);
});

test("granular {bump:true,merge:false} × autonomous → JSON normalizado + nota per-step", () => {
  const ctx = runHook(makeFixture({
    devflowYaml: "git:\n  autoFinish:\n    bump: true\n    merge: false\n",
    autonomy: "autonomous",
  }));
  assert.match(ctx, /"bump":true/, "granular deve expor bump:true");
  assert.match(ctx, /"merge":false/, "granular deve expor merge:false (normalizado)");
  assert.match(ctx, /only execute steps that are 'true'/i, "deve instruir execução per-step");
});

test("comentário inline não quebra a classificação (true # nota → all)", () => {
  const ctx = runHook(makeFixture({ devflowYaml: "git:\n  autoFinish: true  # nota\n" }));
  assert.match(ctx, /autoFinish:\s*all/);
});
