import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCheck } from "../../scripts/lib/doctor.mjs";

const VERIFY_YAML = `git:
  strategy: branch-flow
verify:
  unit: ["bash", "tests/run-unit.sh"]
  lint: ["bash", "tests/run-lint.sh"]
`;

function repo({ verify = true, catalog = null } = {}) {
  const d = mkdtempSync(join(tmpdir(), "dhs-"));
  mkdirSync(join(d, ".context"), { recursive: true });
  writeFileSync(join(d, ".context", ".devflow.yaml"), verify ? VERIFY_YAML : "git:\n  strategy: branch-flow\n");
  if (catalog) {
    mkdirSync(join(d, ".context", "config"), { recursive: true });
    writeFileSync(join(d, ".context", "config", "sensors.json"), JSON.stringify(catalog, null, 2));
  }
  return d;
}

const check = getCheck("harness-sensors");
const ctx = (cwd) => ({ cwd, which: () => true, exec: () => ({ code: 0, stdout: "", stderr: "" }) });

test("o check existe e está registrado", () => {
  assert.ok(check, "harness-sensors precisa estar no array CHECKS");
  assert.equal(check.destructive, false);
});

test("projeto sem verify: → OK (nada a espelhar)", () => {
  const r = check.run(ctx(repo({ verify: false })));
  assert.equal(r.status, "OK");
});

test("sensors.json ausente → WARN com o reparo exato", () => {
  const r = check.run(ctx(repo()));
  assert.equal(r.status, "WARN");
  assert.match(r.repair, /sensors-from-verify\.mjs write/);
});

test("drift: sinal do verify: sem sensor correspondente → WARN", () => {
  const d = repo({ catalog: { version: 1, source: "manual", sensors: [{ id: "unit", command: "bash tests/run-unit.sh" }] } });
  const r = check.run(ctx(d));
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /lint/, "o diagnóstico precisa nomear o sinal descoberto");
});

test("catálogo cobrindo todos os sinais → OK", () => {
  const d = repo({ catalog: { version: 1, source: "manual", sensors: [
    { id: "unit", command: "bash tests/run-unit.sh" },
    { id: "lint", command: "bash tests/run-lint.sh" },
    { id: "tests", command: "bash tests/run-unit.sh" },
  ] } });
  const r = check.run(ctx(d));
  assert.equal(r.status, "OK");
});
