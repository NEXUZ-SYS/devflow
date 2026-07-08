// tests/lib/devflow-config.test.mjs
// Parser único de .devflow.yaml (ADR-011). Replica a semântica autoritativa do
// hooks/post-tool-use (parse_auto_finish + read_yaml_field), sem PyYAML.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readAutoFinish, readVersioning } from "../../scripts/lib/devflow-config.mjs";

// ---- readAutoFinish: escalares ----
test("escalar true → all", () => {
  assert.equal(readAutoFinish("git:\n  autoFinish: true\n"), "all");
});
test("escalar false → disabled", () => {
  assert.equal(readAutoFinish("git:\n  autoFinish: false\n"), "disabled");
});
test("ausente → disabled", () => {
  assert.equal(readAutoFinish("git:\n  prCli: gh\n"), "disabled");
});
test("sem bloco git → disabled", () => {
  assert.equal(readAutoFinish("mempalace:\n  enabled: true\n"), "disabled");
});

// ---- readAutoFinish: comentário inline (bug do permissions.yaml) ----
test("comentário inline não vaza (true # nota → all)", () => {
  assert.equal(readAutoFinish("git:\n  autoFinish: true  # nota\n"), "all");
});
test("comentário inline em false", () => {
  assert.equal(readAutoFinish("git:\n  autoFinish: false # off\n"), "disabled");
});

// ---- readAutoFinish: granular (normalizado 4 chaves) ----
test("granular parcial → 4 chaves com não-listada=false", () => {
  assert.deepEqual(
    readAutoFinish("git:\n  autoFinish:\n    bump: true\n    merge: false\n"),
    { bump: true, commit: false, push: false, merge: false },
  );
});
test("granular só merge:true", () => {
  assert.deepEqual(
    readAutoFinish("git:\n  autoFinish:\n    merge: true\n"),
    { bump: false, commit: false, push: false, merge: true },
  );
});
test("granular completo", () => {
  assert.deepEqual(
    readAutoFinish("git:\n  autoFinish:\n    bump: true\n    commit: true\n    push: true\n    merge: true\n"),
    { bump: true, commit: true, push: true, merge: true },
  );
});

// ---- readAutoFinish: robustez (achados do architect) ----
test("tab-indent granular é lido", () => {
  assert.deepEqual(
    readAutoFinish("git:\n\tautoFinish:\n\t\tbump: true\n"),
    { bump: true, commit: false, push: false, merge: false },
  );
});
test("chave-substring (autoFinishMode) NÃO casa", () => {
  assert.equal(readAutoFinish("git:\n  autoFinishMode: true\n  prCli: gh\n"), "disabled");
});
test("autoFinish fora do bloco git é ignorado", () => {
  assert.equal(readAutoFinish("other:\n  autoFinish: true\ngit:\n  prCli: gh\n"), "disabled");
});
test("granular para no irmão de mesma indentação (versioning)", () => {
  assert.deepEqual(
    readAutoFinish("git:\n  autoFinish:\n    bump: true\n  versioning: pipeline\n"),
    { bump: true, commit: false, push: false, merge: false },
  );
});
test("CRLF é tolerado", () => {
  assert.equal(readAutoFinish("git:\r\n  autoFinish: true\r\n"), "all");
});
test("YAML inválido → fallback disabled", () => {
  assert.equal(readAutoFinish("::: not yaml :::\n\t\t- broken"), "disabled");
});

// ---- readVersioning (preserva o check != pipeline && != none do hook) ----
test("versioning pipeline", () => {
  assert.equal(readVersioning("git:\n  versioning: pipeline\n"), "pipeline");
});
test("versioning none", () => {
  assert.equal(readVersioning("git:\n  versioning: none\n"), "none");
});
test("versioning local", () => {
  assert.equal(readVersioning("git:\n  versioning: local\n"), "local");
});
test("versioning ausente → local (default)", () => {
  assert.equal(readVersioning("git:\n  prCli: gh\n"), "local");
});
test("versioning comentário inline", () => {
  assert.equal(readVersioning("git:\n  versioning: pipeline  # CI\n"), "pipeline");
});
test("versioning desconhecido → local (não pipeline/none)", () => {
  assert.equal(readVersioning("git:\n  versioning: weird\n"), "local");
});
