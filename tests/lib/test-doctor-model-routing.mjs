// tests/lib/test-doctor-model-routing.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECKS } from "../../scripts/lib/doctor.mjs";

const check = CHECKS.find((c) => c.id === "model-routing");
function cwdWith(yaml) {
  const d = mkdtempSync(join(tmpdir(), "doctor-mr-"));
  mkdirSync(join(d, ".context"));
  if (yaml !== null) writeFileSync(join(d, ".context/.devflow.yaml"), yaml);
  return d;
}
const ON = "models:\n  enabled: true\n";
const ALL = { DEVFLOW_MODEL_ROUTING: "1", CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" };

test("check registrado", () => assert.ok(check));

test("repo sem models → SKIP", () => {
  assert.equal(check.run({ cwd: cwdWith("git:\n  strategy: x\n"), env: {}, claudeVersion: "2.1.294" }).status, "SKIP");
});

test("repo pede roteamento sem a confirmação do usuário → WARN (D18)", () => {
  const r = check.run({ cwd: cwdWith(ON), env: {}, claudeVersion: "2.1.294" });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /pede roteamento/);
  assert.match(r.repair, /DEVFLOW_MODEL_ROUTING/);
});

test("ligado sem function hooks → WARN explicando o fallback", () => {
  const r = check.run({ cwd: cwdWith(ON), env: { DEVFLOW_MODEL_ROUTING: "1" }, claudeVersion: "2.1.294" });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /fallback clássico/);
  assert.match(r.repair, /CLAUDE_CODE_ENABLE_FUNCTION_HOOKS/);
});

test("Claude Code abaixo da versão testada → WARN", () => {
  const r = check.run({ cwd: cwdWith(ON), env: ALL, claudeVersion: "2.1.200" });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /2\.1\.294/);
});

test("tudo ligado na versão testada → OK", () => {
  assert.equal(check.run({ cwd: cwdWith(ON), env: ALL, claudeVersion: "2.1.294" }).status, "OK");
});

test("function hooks aceitos como o Claude Code: ' True ' → OK", () => {
  const env = { DEVFLOW_MODEL_ROUTING: "1", CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: " True " };
  assert.equal(check.run({ cwd: cwdWith(ON), env, claudeVersion: "2.1.294" }).status, "OK");
});
