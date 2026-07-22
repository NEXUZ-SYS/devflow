import { test } from "node:test";
import assert from "node:assert/strict";
import { assertShellSafe, buildCatalog } from "../../scripts/lib/sensors-from-verify.mjs";

const OK = ["bash", "tests/run-unit.sh"];

test("assertShellSafe: argv[0] fora da allowlist lança", () => {
  assert.throws(() => assertShellSafe(["curl", "http://x"], "unit"), /allowlist/i);
});

test("assertShellSafe: metacaractere de shell lança", () => {
  for (const bad of [";", "|", "&", "$", "`", ">", "<", "(", ")", "{", "}"]) {
    assert.throws(() => assertShellSafe(["bash", `x${bad}y`], "unit"), /metacaractere/i, `faltou barrar ${bad}`);
  }
});

test("assertShellSafe: espaço dentro de um argumento lança (quebraria o round-trip)", () => {
  assert.throws(() => assertShellSafe(["bash", "tests/run unit.sh"], "unit"), /espaço/i);
});

test("assertShellSafe: comando legítimo não lança", () => {
  assert.doesNotThrow(() => assertShellSafe(OK, "unit"));
});

test("buildCatalog: um sensor por sinal, mais o 'tests'", () => {
  const cat = buildCatalog({ signals: { unit: OK, lint: ["bash", "tests/run-lint.sh"] }, onTaskComplete: ["unit"] });
  const ids = cat.sensors.map(s => s.id).sort();
  assert.deepEqual(ids, ["lint", "tests", "unit"]);
  assert.equal(cat.version, 1);
  assert.equal(cat.source, "manual");
});

test("buildCatalog: só 'tests' e 'lint' nascem bloqueantes", () => {
  const cat = buildCatalog({
    signals: { unit: OK, lint: ["bash", "tests/run-lint.sh"], e2e: ["bash", "tests/run-e2e.sh"] },
    onTaskComplete: ["unit"],
  });
  const by = Object.fromEntries(cat.sensors.map(s => [s.id, s]));
  assert.equal(by.tests.blocking, true);
  assert.equal(by.lint.blocking, true);
  assert.equal(by.unit.blocking, false);
  assert.equal(by.e2e.blocking, false, "e2e bloqueante custaria minutos por avanço de fase");
});

test("buildCatalog: 'tests' recebe o comando do sinal unit", () => {
  const cat = buildCatalog({ signals: { unit: OK, lint: ["bash", "tests/run-lint.sh"] }, onTaskComplete: ["unit"] });
  const tests = cat.sensors.find(s => s.id === "tests");
  assert.equal(tests.command, "bash tests/run-unit.sh");
});

test("buildCatalog: sem sinal unit, não emite 'tests' (não inventa comando)", () => {
  const cat = buildCatalog({ signals: { lint: ["bash", "tests/run-lint.sh"] }, onTaskComplete: [] });
  assert.equal(cat.sensors.find(s => s.id === "tests"), undefined);
});

test("buildCatalog: fail-closed — um comando inseguro derruba a geração inteira", () => {
  assert.throws(
    () => buildCatalog({ signals: { unit: OK, lint: ["bash", "run.sh; rm -rf /"] }, onTaskComplete: [] }),
    /metacaractere/i
  );
});
