#!/usr/bin/env node
// tests/validation/test-glob.mjs
// Unit tests for scripts/lib/glob.mjs — micromatch substitute (subset only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchGlob, validateSubset } from "../../scripts/lib/glob.mjs";

test("matchGlob: ** matches any depth", () => {
  assert.equal(matchGlob("**/*.ts", "src/lib/foo.ts"), true);
  assert.equal(matchGlob("**/*.ts", "foo.ts"), true);
  assert.equal(matchGlob("src/**", "src/lib/foo.ts"), true);
  assert.equal(matchGlob("src/**", "src/foo.ts"), true);
});

test("matchGlob: * matches single segment", () => {
  assert.equal(matchGlob("src/*.ts", "src/foo.ts"), true);
  assert.equal(matchGlob("src/*.ts", "src/lib/foo.ts"), false);
  assert.equal(matchGlob("*.ts", "foo.ts"), true);
  assert.equal(matchGlob("*.ts", "src/foo.ts"), false);
});

test("matchGlob: ? matches single char", () => {
  assert.equal(matchGlob("a?.ts", "ab.ts"), true);
  assert.equal(matchGlob("a?.ts", "abc.ts"), false);
  assert.equal(matchGlob("a?.ts", "a.ts"), false);
});

test("matchGlob: brace expansion {a,b}", () => {
  assert.equal(matchGlob("src/{a,b}.ts", "src/a.ts"), true);
  assert.equal(matchGlob("src/{a,b}.ts", "src/b.ts"), true);
  assert.equal(matchGlob("src/{a,b}.ts", "src/c.ts"), false);
  assert.equal(matchGlob("{src,test}/**/*.ts", "src/lib/foo.ts"), true);
  assert.equal(matchGlob("{src,test}/**/*.ts", "test/unit/foo.ts"), true);
});

test("matchGlob: literal special chars in path", () => {
  // Dot is literal, not regex wildcard
  assert.equal(matchGlob("src/foo.ts", "src/foo.ts"), true);
  assert.equal(matchGlob("src/foo.ts", "src/foo_ts"), false);
  assert.equal(matchGlob("src/foo.ts", "src/fooXts"), false);
});

test("validateSubset: rejects negation !", () => {
  assert.throws(() => validateSubset("!**/*.ts"), /negation.*not supported/i);
  assert.throws(() => validateSubset("!  **/*.ts"), /negation.*not supported/i);
});

test("validateSubset: rejects extglob +(...) @(...) *(...) ?(...) !(...)", () => {
  assert.throws(() => validateSubset("+(a|b).ts"), /extglob.*not supported/i);
  assert.throws(() => validateSubset("@(a|b).ts"), /extglob.*not supported/i);
  assert.throws(() => validateSubset("*(a|b).ts"), /extglob.*not supported/i);
  assert.throws(() => validateSubset("?(a|b).ts"), /extglob.*not supported/i);
  assert.throws(() => validateSubset("!(a|b).ts"), /extglob.*not supported/i);
});

test("validateSubset: accepts valid subset", () => {
  assert.doesNotThrow(() => validateSubset("**/*.ts"));
  assert.doesNotThrow(() => validateSubset("src/{a,b}/*.tsx"));
  assert.doesNotThrow(() => validateSubset("src/middleware.ts"));
  assert.doesNotThrow(() => validateSubset("?"));
});

// T18, rodada 2: o `**` virava `.*`, e o `.` do JS não casa "\n", "\r", U+2028 nem U+2029. Um
// arquivo com um desses no nome (ou num diretório do caminho) ficava fora de TODO applyTo com
// `**` — e, no evaluator de permissões, fora de todo `deny` com `**`.
const TERMINATORS = [["\\n", "\n"], ["\\r", "\r"], ["U+2028", "\u2028"], ["U+2029", "\u2029"], ["\\r\\n", "\r\n"]];

test("matchGlob: ** casa terminador de linha no nome do arquivo e no meio do caminho", () => {
  for (const [label, ch] of TERMINATORS) {
    assert.equal(matchGlob("src/**", `src/mod${ch}.js`), true, `src/** × nome com ${label}`);
    assert.equal(matchGlob("src/**", `src/util${ch}/x.js`), true, `src/** × diretório com ${label}`);
    assert.equal(matchGlob("**", `a${ch}b`), true, `** × ${label}`);
    assert.equal(matchGlob("**/*.js", `src/dir${ch}/x.js`), true, `**/*.js × diretório com ${label}`);
    assert.equal(matchGlob("**/.env*", `conf${ch}/.env.local`), true, `**/.env* × ${label}`);
    assert.equal(matchGlob("src/**/x.js", `src/a${ch}b/x.js`), true, `src/**/x.js × ${label}`);
    assert.equal(matchGlob("**/*.{ts,tsx}", `src/a${ch}/b.tsx`), true, `chaves × ${label}`);
  }
});

test("matchGlob: * e ? também casam terminador de linha (e continuam sem atravessar '/')", () => {
  for (const [label, ch] of TERMINATORS) {
    assert.equal(matchGlob("src/*.js", `src/mod${ch}.js`), true, `* × ${label}`);
    assert.equal(matchGlob("*", `a${ch}b`), true, `* sozinho × ${label}`);
  }
  for (const [label, ch] of TERMINATORS.slice(0, 4)) assert.equal(matchGlob("src/a?b.js", `src/a${ch}b.js`), true, `? × ${label}`);
  assert.equal(matchGlob("src/*.js", "src/a\n/b.js"), false, "* não atravessa a barra");
  assert.equal(matchGlob("src/a?b.js", "src/a/b.js"), false, "? não casa a barra");
});

test("matchGlob: o alargamento do ** não muda o que já casava nem o que não casava", () => {
  assert.equal(matchGlob("src/**", "lib/x.js"), false);
  assert.equal(matchGlob("src/**", "srcx/y.js"), false);
  assert.equal(matchGlob("**/*.ts", "a/b.js"), false);
  assert.equal(matchGlob("src/**", "src/a\tb.js"), true);
  assert.equal(matchGlob("src/**", "outro\nsrc/x.js"), false, "a âncora do começo continua valendo");
  assert.equal(matchGlob("src/**/x.js", "src/a/y.js\n"), false, "a âncora do fim continua valendo");
});

