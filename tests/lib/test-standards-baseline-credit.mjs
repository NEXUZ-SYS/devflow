// tests/lib/test-standards-baseline-credit.mjs — crédito do baseline limitado por um conjunto de
// achados (onda B, item B1). O `gate --ci` usa `capCredit` com os achados da árvore da base: uma
// entrada só vale até o que a base produz. A conta é a do `baseline prune`, sem gravar nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { capCredit, pruneBaseline, fingerprint, parseBaseline } from "../../scripts/lib/standards-baseline.mjs";

const entry = (path, count) => {
  const e = { stdId: "std-demo", ruleId: "no-bad", path, message: "remova BAD" };
  return { ...e, fp: fingerprint(e), count, acceptedAt: "2026-10-01T00:00:00.000Z", reason: "legado" };
};
const found = (path, n = 1) => Array.from({ length: n }, () => ({ fp: entry(path, 1).fp }));
const baseline = (...entries) => ({ version: 1, entries });
const byPath = (bl) => Object.fromEntries(bl.entries.map((e) => [e.path, e.count]));

test("capCredit: entrada com lastro integral fica como está", () => {
  const a = entry("src/a.js", 2);
  const out = capCredit(baseline(a), found("src/a.js", 2));
  assert.deepEqual(out.entries, [a]);
});

test("capCredit: o crédito cai para o que os achados produzem; sem nenhum, a entrada sai", () => {
  const out = capCredit(baseline(entry("src/a.js", 2), entry("src/b.js", 1), entry("src/c.js", 3)), [...found("src/a.js", 1), ...found("src/c.js", 5)]);
  assert.deepEqual(byPath(out), { "src/a.js": 1, "src/c.js": 3 }, "a: 2 → 1; b: órfã, sai; c: sobra de achado não aumenta o crédito");
});

test("capCredit: achado sem entrada não cria crédito", () => {
  const out = capCredit(baseline(entry("src/a.js", 1)), [...found("src/a.js"), ...found("src/novo.js", 3)]);
  assert.deepEqual(byPath(out), { "src/a.js": 1 });
});

test("capCredit: impressão digital isenta fica como está, com ou sem lastro", () => {
  const a = entry("src/a.js", 2), b = entry("src/b.js", 4);
  const out = capCredit(baseline(a, b), found("src/b.js", 1), new Set([a.fp]));
  assert.deepEqual(byPath(out), { "src/a.js": 2, "src/b.js": 1 }, "a: isenta (aumento aprovado); b: limitada");
});

test("capCredit: é a mesma conta do baseline prune", () => {
  const bl = baseline(entry("src/a.js", 2), entry("src/b.js", 1), entry("src/c.js", 3));
  const fs = [...found("src/a.js", 1), ...found("src/c.js", 3)];
  assert.deepEqual(capCredit(bl, fs), pruneBaseline(bl, fs).baseline);
});

test("capCredit: não altera o baseline recebido, devolve um baseline válido e aceita baseline ausente", () => {
  const bl = baseline(entry("src/a.js", 2), entry("src/b.js", 1));
  const snapshot = JSON.stringify(bl);
  const out = capCredit(bl, found("src/a.js", 1));
  assert.equal(JSON.stringify(bl), snapshot);
  assert.deepEqual(parseBaseline(JSON.stringify(out)), out);
  assert.equal(capCredit(null, found("src/a.js")), null);
  assert.deepEqual(capCredit(baseline(), found("src/a.js")), baseline());
});
