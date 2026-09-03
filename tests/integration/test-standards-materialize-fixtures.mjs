// Suite — valida os fixtures de projeto da materialização.
//
// Os fixtures são DADO: um fixture errado invalidaria as asserções de seleção
// das Tasks 2 e 5. `ts-nosrc` existe para provar a diferença entre casar
// CAMINHO REAL e casar extensão — 3 defaults têm prefixo `src/**`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

const R = "tests/fixtures/standards-materialize";

test("odoo-py: tem .py, .js e .xml, e NÃO tem src/", () => {
  assert.ok(existsSync(join(R, "odoo-py/addons/m/models/model.py")));
  assert.ok(existsSync(join(R, "odoo-py/addons/m/static/app.js")));
  assert.ok(existsSync(join(R, "odoo-py/addons/m/views/v.xml")));
  assert.ok(!existsSync(join(R, "odoo-py/src")), "o fixture não pode ter src/");
});

test("ts-src: .ts DENTRO de src/", () => {
  assert.ok(existsSync(join(R, "ts-src/src/index.ts")));
});

test("ts-nosrc: .ts FORA de src/ — prova caminho real vs extensão", () => {
  assert.ok(existsSync(join(R, "ts-nosrc/lib/index.ts")));
  assert.ok(!existsSync(join(R, "ts-nosrc/src")), "não pode ter src/");
});

test("empty: nenhum arquivo de código", () => {
  assert.ok(existsSync(join(R, "empty/README.md")));
  assert.ok(!existsSync(join(R, "empty/src")));
});
