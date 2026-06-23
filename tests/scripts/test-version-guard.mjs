// Testes do version-guard — núcleo puro do controle de versão (CI + hook local).
// Run: node tests/scripts/test-version-guard.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVersion,
  compareVersions,
  isValidTransition,
  checkConsistency,
} from "../../scripts/lib/version-guard.mjs";

test("parseVersion", () => {
  assert.deepEqual(parseVersion("1.2.3"), [1, 2, 3]);
  assert.deepEqual(parseVersion("1.23.10"), [1, 23, 10]);
  assert.equal(parseVersion("x.y.z"), null);
  assert.equal(parseVersion("1.2"), null);
});

test("compareVersions (semver)", () => {
  assert.equal(compareVersions("1.2.3", "1.2.4"), -1);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.23.10", "1.23.3"), 1); // 10 > 3, não lexical
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
});

test("isValidTransition — transições válidas", () => {
  assert.equal(isValidTransition("1.23.3", "1.23.3").kind, "none"); // feature PR (sem bump)
  assert.equal(isValidTransition("1.23.3", "1.23.4").kind, "patch");
  assert.equal(isValidTransition("1.23.3", "1.24.0").kind, "minor");
  assert.equal(isValidTransition("1.23.3", "2.0.0").kind, "major");
  for (const t of [["1.23.3","1.23.3"],["1.23.3","1.23.4"],["1.23.3","1.24.0"],["1.23.3","2.0.0"]]) {
    assert.equal(isValidTransition(t[0], t[1]).ok, true, `${t[0]}→${t[1]} devia ser ok`);
  }
});

test("isValidTransition — pulo de versão (o bug 1.23.3→1.23.10) é rejeitado", () => {
  const r = isValidTransition("1.23.3", "1.23.10");
  assert.equal(r.ok, false);
  assert.equal(r.kind, "invalid");
});

test("isValidTransition — regressão/downgrade rejeitado", () => {
  assert.equal(isValidTransition("1.24.0", "1.23.4").ok, false);
  assert.equal(isValidTransition("1.23.3", "1.23.2").ok, false);
});

test("isValidTransition — minor/major mal-formados ou pulados rejeitados", () => {
  assert.equal(isValidTransition("1.23.3", "1.24.1").ok, false); // minor com patch != 0
  assert.equal(isValidTransition("1.23.3", "1.25.0").ok, false); // pula minor
  assert.equal(isValidTransition("1.23.3", "3.0.0").ok, false);  // pula major
  assert.equal(isValidTransition("1.23.3", "2.1.0").ok, false);  // major com minor != 0
});

test("checkConsistency — 3 version files devem concordar", () => {
  const ok = checkConsistency({ plugin: "1.24.0", marketplace: "1.24.0", cursor: "1.24.0" });
  assert.equal(ok.ok, true);
  assert.equal(ok.version, "1.24.0");

  const bad = checkConsistency({ plugin: "1.24.0", marketplace: "1.23.4", cursor: "1.24.0" });
  assert.equal(bad.ok, false);
  assert.ok(bad.mismatch);
});
