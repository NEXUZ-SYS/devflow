// tests/standards/test-linters-fingerprint-stability.mjs
// Rodada 1 de correção (Task 8), item 3: a impressão digital do baseline é
// sha1(stdId + ruleId + path + MENSAGEM). Se a mensagem embute texto arbitrário do
// código-fonte (o payload de um evento; espaçamento/quebra de linha incidental de um
// token), editar algo que NÃO muda a NATUREZA da violação muda o hash — a catraca
// perderia a entrada aceita sem ninguém ter mudado a violação de verdade.
//
// std-domain-events: a mensagem não pode variar com o CONTEÚDO do payload.
// std-data-modeling: a mensagem não pode variar com espaçamento/quebra de linha/caixa
// do token de tipo (TIMESTAMP/VARCHAR/FLOAT/DOUBLE PRECISION/REAL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MACHINE = resolve(import.meta.dirname, "../../assets/standards/machine");

function run(std, filename, content) {
  const dir = mkdtempSync(join(tmpdir(), "fp-"));
  const fp = join(dir, filename);
  writeFileSync(fp, content);
  const r = spawnSync("node", [join(MACHINE, `${std}.js`), fp], { encoding: "utf8" });
  return r.stdout.split("\n").filter(Boolean).map(l => l.replace(fp, "<fp>"));
}

test("std-domain-events: editar o payload não muda a mensagem", () => {
  const a = run("std-domain-events", "e.ts", `await bus.publish({ type: 'OrderPlaced', orderId });`);
  const b = run("std-domain-events", "e.ts", `await bus.publish({ type: 'X', meta: { trace }, data: { orderId, sku, qty } });`);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0], b[0], `mensagem deveria ser idêntica independente do payload: ${a[0]} vs ${b[0]}`);
  assert.doesNotMatch(a[0], /OrderPlaced|orderId/, "mensagem não deveria embutir trecho do payload");
});

test("std-data-modeling: editar espaçamento/quebra de linha/caixa do token não muda a mensagem", () => {
  const a = run("std-data-modeling", "a.sql", `CREATE TABLE t (\n  b DOUBLE PRECISION\n);`);
  const b = run("std-data-modeling", "b.sql", `CREATE TABLE t (\n  b double   precision\n);`);
  const c = run("std-data-modeling", "c.sql", `CREATE TABLE t (\n  b DOUBLE\n    PRECISION\n);`);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(c.length, 1);
  assert.equal(a[0], b[0], `caixa não deveria mudar a mensagem: ${a[0]} vs ${b[0]}`);
  assert.equal(a[0], c[0], `quebra de linha não deveria mudar a mensagem: ${a[0]} vs ${c[0]}`);
  assert.match(a[0], /DOUBLE PRECISION/, "token deveria vir normalizado (maiúsculas, espaço único)");
});
