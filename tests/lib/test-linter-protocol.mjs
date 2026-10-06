import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinterOutput, hasViolation } from "../../scripts/lib/linter-protocol.mjs";

const ctx = { stdId: "std-data-modeling", filePath: "db/001.sql" };

test("v2: ruleId, caminho, linha e mensagem", () => {
  const r = parseLinterOutput("VIOLATION float-money db/001.sql:12 use NUMERIC\n", ctx);
  assert.deepEqual(r, [{ ruleId: "float-money", path: "db/001.sql", line: 12, message: "use NUMERIC", advisory: false }]);
});

test("v2: várias linhas viram vários achados", () => {
  const out = "VIOLATION a x.sql:1 m1\nVIOLATION b x.sql:2 m2\n";
  assert.equal(parseLinterOutput(out, ctx).length, 2);
});

test("v2: caminho com espaço", () => {
  const r = parseLinterOutput("VIOLATION a my dir/x.sql:3 m\n", ctx);
  assert.equal(r[0].path, "my dir/x.sql");
  assert.equal(r[0].line, 3);
});

test("legado de regra única: ruleId = id do std sem prefixo", () => {
  const r = parseLinterOutput("VIOLATION: 3 tipo(s) de coluna problemático(s)", ctx);
  assert.equal(r[0].ruleId, "data-modeling");
  assert.equal(r[0].path, "db/001.sql");
  assert.equal(r[0].line, null);
});

test("legado multi-regra: extrai ruleId e advisory do prefixo", () => {
  const r = parseLinterOutput("VIOLATION: [advisory] theater-slop-phrase — diga o que faz [src/a.tsx]", { stdId: "std-design-antipatterns", filePath: "src/a.tsx" });
  assert.equal(r[0].ruleId, "theater-slop-phrase");
  assert.equal(r[0].advisory, true);
});

test("legado multi-regra sem advisory", () => {
  const r = parseLinterOutput("VIOLATION: missing-alt — img sem alt [src/a.tsx]", { stdId: "std-accessibility", filePath: "src/a.tsx" });
  assert.equal(r[0].ruleId, "missing-alt");
  assert.equal(r[0].advisory, false);
});

test("linhas sem VIOLATION são ignoradas", () => {
  assert.deepEqual(parseLinterOutput("debug\n\n", ctx), []);
});

test("v2 sem ':linha' cai no fallback (invariante hasViolation ⇒ parseLinterOutput não-vazio)", () => {
  const input = "VIOLATION float-money db/001.sql use NUMERIC\n";
  assert.equal(hasViolation(input), true);
  const r = parseLinterOutput(input, ctx);
  assert.equal(r.length, 1);
  assert.equal(r[0].ruleId, "float-money");
  assert.equal(r[0].path, "db/001.sql");
  assert.equal(r[0].line, null);
  assert.equal(r[0].message, "db/001.sql use NUMERIC");
  assert.equal(r[0].advisory, false);
});

test("v2 com ':' não seguido de dígito cai no fallback", () => {
  const input = "VIOLATION float-money db:name.sql use NUMERIC\n";
  assert.equal(hasViolation(input), true);
  const r = parseLinterOutput(input, ctx);
  assert.equal(r.length, 1);
  assert.equal(r[0].ruleId, "float-money");
  assert.equal(r[0].path, "db/001.sql");
  assert.equal(r[0].line, null);
  assert.equal(r[0].message, "db:name.sql use NUMERIC");
  assert.equal(r[0].advisory, false);
});

test("regressão: v2 com CRLF continua reconhecido", () => {
  const r = parseLinterOutput("VIOLATION a x.sql:3 m\r\n", ctx);
  assert.deepEqual(r, [{ ruleId: "a", path: "x.sql", line: 3, message: "m", advisory: false }]);
});

test("regressão: ruído intercalado com duas violações reais gera exatamente 2 achados", () => {
  const out = "debug\nVIOLATION a x.sql:1 m1\nnoise line\nVIOLATION b x.sql:2 m2\nmore noise\n";
  const r = parseLinterOutput(out, ctx);
  assert.equal(r.length, 2);
  assert.equal(r[0].ruleId, "a");
  assert.equal(r[1].ruleId, "b");
});

test("hasViolation reconhece v2 e legado, e só no começo da linha", () => {
  assert.equal(hasViolation("VIOLATION a x:1 m"), true);
  assert.equal(hasViolation("ok\nVIOLATION: legado"), true);
  assert.equal(hasViolation("sem VIOLATION aqui"), false);
  assert.equal(hasViolation(""), false);
});

// ── Rodada 3 da T18: caminho com "\r", U+2028 ou U+2029 não pode custar a regra do achado ──
// Só "\n" separa linhas. Sem a flag `s`, o `.` dos regex parava nesses caracteres, o achado caía
// no último fallback com ruleId = id do std, e `rules: { no-bad: block }` num std `warn` virava `warn`.

const CR = "\r", LS = String.fromCodePoint(0x2028), PS = String.fromCodePoint(0x2029);
const demo = { stdId: "std-demo", filePath: "src/x.js" };

test("v2: caminho com CR, U+2028 ou U+2029 mantém ruleId, caminho, linha e mensagem", () => {
  for (const ch of [CR, LS, PS]) {
    for (const path of [`src/a${ch}b.js`, `src/dir${ch}/x.js`]) {
      const r = parseLinterOutput(`VIOLATION no-bad ${path}:7 remova BAD\n`, demo);
      assert.deepEqual(r, [{ ruleId: "no-bad", path, line: 7, message: "remova BAD", advisory: false }], JSON.stringify(path));
    }
  }
  // A mensagem também pode trazer um deles.
  assert.equal(parseLinterOutput(`VIOLATION no-bad src/a.js:1 tire${LS}isto\n`, demo)[0].message, `tire${LS}isto`);
});

test("legado e fallback: CR, U+2028 ou U+2029 na linha não trocam a regra nem perdem o advisory", () => {
  for (const ch of [CR, LS, PS]) {
    const multi = parseLinterOutput(`VIOLATION: [advisory] regra-x — diga o que faz [src/a${ch}b.js]\n`, demo);
    assert.equal(multi.length, 1);
    assert.equal(multi[0].ruleId, "regra-x", JSON.stringify(ch));
    assert.equal(multi[0].advisory, true, JSON.stringify(ch));
    const single = parseLinterOutput(`VIOLATION: texto livre [src/a${ch}b.js]\n`, demo);
    assert.equal(single[0].ruleId, "demo", "regra única: id do std sem o prefixo");
    const fallback = parseLinterOutput(`VIOLATION no-bad src/a${ch}b.js sem linha\n`, demo);
    assert.equal(fallback[0].ruleId, "no-bad", JSON.stringify(ch));
    assert.equal(fallback[0].message, `src/a${ch}b.js sem linha`);
  }
  // "\n" no caminho parte a linha: a primeira metade ainda traz a regra (fallback).
  const nl = parseLinterOutput("VIOLATION no-bad src/a\nb.js:1 remova BAD\n", demo);
  assert.equal(nl.length, 1);
  assert.equal(nl[0].ruleId, "no-bad");
});

test("invariante: hasViolation(x) ⇒ parseLinterOutput(x).length ≥ 1, em qualquer entrada", () => {
  // Casos que quebravam o invariante: exit 1 com um destes na saída passava sem achado e sem erro.
  for (const x of ["VIOLATION ", "VIOLATION \n", `ok${CR}VIOLATION no-bad a.js:1 m`, `ok${LS}VIOLATION: m`, `ok${PS}VIOLATION no-bad a.js:1 m`]) {
    assert.equal(hasViolation(x), false, JSON.stringify(x));
    assert.equal(parseLinterOutput(x, demo).length, 0, JSON.stringify(x));
  }
  // CRLF continua valendo como fim de linha.
  assert.equal(hasViolation("ok\r\nVIOLATION: legado\r\n"), true);
  assert.equal(parseLinterOutput("ok\r\nVIOLATION: legado\r\n", demo).length, 1);
  // Varredura: 40 mil saídas montadas com as peças que importam, com gerador de semente fixa.
  const PIECES = ["VIOLATION", "VIOLATION ", "VIOLATION:", " ", ":", "\n", CR, LS, PS, "\t", "no-bad", "a.js", ":1", " m", "—", "[advisory] ", "x", "\r\n"];
  let seed = 20261005;
  const next = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  let withViolation = 0;
  for (let i = 0; i < 40000; i++) {
    const x = Array.from({ length: 1 + next(7) }, () => PIECES[next(PIECES.length)]).join("");
    const parsed = parseLinterOutput(x, demo).length;
    if (!hasViolation(x)) continue;
    withViolation++;
    assert.ok(parsed >= 1, `hasViolation sem achado: ${JSON.stringify(x)}`);
  }
  assert.ok(withViolation > 2000, `amostras com violação: ${withViolation}`);
});
