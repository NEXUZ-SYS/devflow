// Suite — leitura do bloco `frameworks:` do .devflow.yaml (ADR-011: parser único).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFrameworkVersions, readFrameworkVersionsFromPath } from "../../scripts/lib/devflow-config.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SRC = `
git:
  strategy: branch-flow
frameworks:
  odoo:
    version: "17"
    confidence: high
    resolvedAt: "2026-09-02"
mempalace:
  enabled: true
`;

test("readFrameworkVersions lê o bloco aninhado", () => {
  assert.equal(readFrameworkVersions(SRC).get("odoo"), "17");
});

test("readFrameworkVersions ignora entrada sem version", () => {
  const m = readFrameworkVersions("frameworks:\n  odoo:\n    confidence: unknown\n");
  assert.equal(m.has("odoo"), false);
});

test("readFrameworkVersions devolve Map vazio quando o bloco não existe", () => {
  assert.equal(readFrameworkVersions("git:\n  strategy: x\n").size, 0);
});

test("readFrameworkVersions não vaza a chave do bloco seguinte", () => {
  const m = readFrameworkVersions(SRC);
  assert.equal(m.has("mempalace"), false, "o bloco frameworks termina na desindentação");
});

test("readFrameworkVersions tolera comentário inline", () => {
  // O parser de permissions.yaml já teve exatamente este bug: comentário inline
  // não removido virava parte do valor.
  const m = readFrameworkVersions('frameworks:\n  odoo:\n    version: "17"  # resolvido\n');
  assert.equal(m.get("odoo"), "17");
});

test("readFrameworkVersions aceita valor sem aspas", () => {
  assert.equal(readFrameworkVersions("frameworks:\n  odoo:\n    version: 17\n").get("odoo"), "17");
});

test("readFrameworkVersions não lança com input não-string", () => {
  assert.equal(readFrameworkVersions(null).size, 0);
  assert.equal(readFrameworkVersions(undefined).size, 0);
});

test("readFrameworkVersions lê múltiplos frameworks", () => {
  const m = readFrameworkVersions('frameworks:\n  odoo:\n    version: "17"\n  rails:\n    version: "7"\n');
  assert.equal(m.get("odoo"), "17");
  assert.equal(m.get("rails"), "7");
});

test("readFrameworkVersionsFromPath lê do disco e nunca lança em path ausente", () => {
  const dir = mkdtempSync(join(tmpdir(), "dfcfg-"));
  const p = join(dir, ".devflow.yaml");
  writeFileSync(p, 'frameworks:\n  odoo:\n    version: "17"\n');
  assert.equal(readFrameworkVersionsFromPath(p).get("odoo"), "17");
  assert.equal(readFrameworkVersionsFromPath(join(dir, "ausente.yaml")).size, 0);
  assert.equal(readFrameworkVersionsFromPath(null).size, 0);
  rmSync(dir, { recursive: true });
});
