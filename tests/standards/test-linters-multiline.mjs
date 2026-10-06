// tests/standards/test-linters-multiline.mjs
// Prova de que os 17 linters de regra única, todos migrados para o molde de
// varredura sobre o CONTEÚDO INTEIRO (matchAll + linha via contador incremental),
// continuam detectando ocorrências que casam ENTRE linhas.
//
// Rodada 1 de correção: uma tentativa anterior converteu 12 dos 17 para "linha a
// linha" (c.split("\n").forEach(...)) por terem regra aparentemente "de uma linha".
// Oito delas tinham `\s` na regra-base que casa `\n` e perderam cobertura (ou, no
// caso de std-data-modeling, ganharam um FALSO POSITIVO novo: "TIMESTAMP\n WITH TIME
// ZONE" é válido, mas linha a linha o `(?!\s+WITH\s+TIME\s+ZONE)` não vê a 2ª linha).
// Ruling: TODOS os 17 usam a regra-base original (commit 7b4b744) com matchAll sobre
// o conteúdo inteiro — nunca linha a linha.
//
// Cada teste roda o linter na fixture multilinha (prova positiva: violação v2 com a
// linha certa) e também confere, lendo a fixture, que nenhuma das linhas físicas
// envolvidas contém sozinha o padrão completo (prova de que "linha a linha" perderia
// a ocorrência).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MACHINE = resolve(import.meta.dirname, "../../assets/standards/machine");
const FIX = resolve(import.meta.dirname, "../fixtures/linters-v2/multiline");

const V2_RE = /^VIOLATION ([a-z0-9-]+) (.+?):(\d+) (.+)$/;

function runLinter(stdId, relPath) {
  const cwd = resolve(FIX, stdId);
  const linter = resolve(MACHINE, `${stdId}.js`);
  const r = spawnSync("node", [linter, relPath], { cwd, encoding: "utf8" });
  const lines = r.stdout.split("\n").filter(Boolean);
  return { r, lines, fixtureLines: readFileSync(resolve(cwd, relPath), "utf8").split("\n") };
}

function assertV2(lines, stdId, expectedLine) {
  assert.equal(lines.length, 1, `esperava exatamente 1 ocorrência: ${JSON.stringify(lines)}`);
  const m = lines[0].match(V2_RE);
  assert.ok(m, `linha fora do protocolo v2: ${lines[0]}`);
  assert.equal(m[1], stdId.replace(/^std-/, ""));
  assert.equal(Number(m[3]), expectedLine, `linha reportada deveria ser ${expectedLine}: ${lines[0]}`);
}

test("std-error-handling: catch com chaves em linhas distintas (catch (e) {\\n})", () => {
  const { r, lines, fixtureLines } = runLinter("std-error-handling", "a.bad.ts");
  assert.equal(r.status, 1);
  assertV2(lines, "std-error-handling", 4);
  // prova: o padrão do linter (catch vazio) aplicado a CADA linha isoladamente não
  // casa em nenhuma das duas — a linha do "catch (" abre "{" mas não fecha "}" nela
  // mesma (o "}" que ela tem é do try anterior); a linha seguinte só tem "}", sem
  // "catch". Só casa varrendo o conteúdo inteiro, como o linter faz.
  const emptyCatchRe = /catch[\s]{0,6}(?:\([^)]*\)[\s]{0,6})?\{[\s]{0,6}\}/;
  assert.ok(!emptyCatchRe.test(fixtureLines[3]), `linha do catch não deveria casar sozinha: ${fixtureLines[3]}`);
  assert.ok(!emptyCatchRe.test(fixtureLines[4]), `linha do fechamento não deveria casar sozinha: ${fixtureLines[4]}`);
});

test("std-security: template SQL multilinha (SELECT ... \\n ... ${id})", () => {
  const { r, lines, fixtureLines } = runLinter("std-security", "a.bad.ts");
  assert.equal(r.status, 1);
  assertV2(lines, "std-security", 2);
  // prova: a linha do SELECT não tem "${", e a linha do "${" não tem "SELECT".
  assert.ok(!fixtureLines[1].includes("${"), `linha do SELECT não deveria ter '\${': ${fixtureLines[1]}`);
  assert.ok(!/SELECT/i.test(fixtureLines[2]), `linha do '\${' não deveria ter SELECT: ${fixtureLines[2]}`);
});

test("std-migration: UPDATE ... SET quebrado em linhas, sem WHERE", () => {
  const { r, lines, fixtureLines } = runLinter("std-migration", "a.bad.sql");
  assert.equal(r.status, 1);
  assertV2(lines, "std-migration", 1);
  // prova: a linha do UPDATE não tem SET, e a linha do SET não tem UPDATE.
  assert.ok(!/\bSET\b/i.test(fixtureLines[0]), `linha do UPDATE não deveria ter SET: ${fixtureLines[0]}`);
  assert.ok(!/\bUPDATE\b/i.test(fixtureLines[1]), `linha do SET não deveria ter UPDATE: ${fixtureLines[1]}`);
});

test("std-domain-events: objeto do payload multilinha, sem 'version'", () => {
  const { r, lines, fixtureLines } = runLinter("std-domain-events", "a.bad.ts");
  assert.equal(r.status, 1);
  assertV2(lines, "std-domain-events", 2);
  // prova: a chamada publish({ abre mas não fecha na mesma linha — o objeto se
  // espalha por várias linhas; um scanner que não balanceia parênteses entre
  // linhas não capturaria o argumento completo.
  assert.ok(!fixtureLines[1].includes("})"), `chamada não deveria fechar na mesma linha: ${fixtureLines[1]}`);
});

test("std-layer-boundaries: import multilinha (import {\\n a \\n} from)", () => {
  const { r, lines, fixtureLines } = runLinter("std-layer-boundaries", "src/domain/a.bad.ts");
  assert.equal(r.status, 1);
  assertV2(lines, "std-layer-boundaries", 1);
  // prova: a linha do "import {" não tem "from", e a linha do "} from" não tem "import".
  assert.ok(!/from/.test(fixtureLines[0]), `linha do import não deveria ter 'from': ${fixtureLines[0]}`);
  assert.ok(!/import/.test(fixtureLines[2]), `linha do 'from' não deveria ter 'import': ${fixtureLines[2]}`);
});

// --- rodada 1 de correção: os 8 que a conversão "linha a linha" quebrou ---

test("std-data-modeling: DOUBLE PRECISION quebrado em linhas (achado) SEM falso-positivo em TIMESTAMP WITH TIME ZONE quebrado", () => {
  const { r, lines, fixtureLines } = runLinter("std-data-modeling", "a.bad.sql");
  assert.equal(r.status, 1);
  assertV2(lines, "std-data-modeling", 4);
  assert.match(lines[0], /DOUBLE PRECISION/, `token deveria vir normalizado: ${lines[0]}`);
  // prova positiva: nem "DOUBLE" nem "PRECISION" sozinhos casam a regra-base.
  const dpRe = /\b(?:FLOAT|DOUBLE\s+PRECISION|REAL)\b/i;
  assert.ok(!dpRe.test(fixtureLines[3]), `linha do DOUBLE não deveria casar sozinha: ${fixtureLines[3]}`);
  assert.ok(!dpRe.test(fixtureLines[4]), `linha do PRECISION não deveria casar sozinha: ${fixtureLines[4]}`);
  // prova negativa (falso-positivo fechado): "TIMESTAMP\n WITH TIME ZONE" é válido —
  // só há 1 VIOLATION no total (a do DOUBLE PRECISION), não 2.
  assert.equal(lines.length, 1, `TIMESTAMP WITH TIME ZONE quebrado em linha NÃO deveria violar: ${JSON.stringify(lines)}`);
});

test("std-documentation: marcador de bloco e TODO em linhas distintas (/*\\n TODO)", () => {
  const { r, lines, fixtureLines } = runLinter("std-documentation", "a.bad.ts");
  assert.equal(r.status, 1);
  assertV2(lines, "std-documentation", 1);
  const re = /(?:\/\/|#|\/?\*)\s*(?:TODO|FIXME|HACK)\b/;
  assert.ok(!re.test(fixtureLines[0]), `linha do /* (sem TODO nela) não deveria casar sozinha: ${fixtureLines[0]}`);
  assert.ok(!re.test(fixtureLines[1]), `linha do TODO (sem marcador de comentário nela) não deveria casar sozinha: ${fixtureLines[1]}`);
});

test("std-internationalization: ternário de plural quebrado em linhas (=== 1\\n ?)", () => {
  const { r, lines, fixtureLines } = runLinter("std-internationalization", "a.bad.tsx");
  assert.equal(r.status, 1);
  assertV2(lines, "std-internationalization", 2);
  assert.ok(!/\?/.test(fixtureLines[1]), `linha do === 1 não deveria ter '?': ${fixtureLines[1]}`);
  assert.ok(!/===/.test(fixtureLines[2]), `linha do '?' não deveria ter '===': ${fixtureLines[2]}`);
});

test("std-naming-conventions: chave do enum em linha própria (enum Status\\n{)", () => {
  const { r, lines, fixtureLines } = runLinter("std-naming-conventions", "a.bad.ts");
  assert.equal(r.status, 1);
  assertV2(lines, "std-naming-conventions", 1);
  assert.ok(!/\{/.test(fixtureLines[0]), `linha do enum não deveria ter '{': ${fixtureLines[0]}`);
  assert.ok(!/enum/.test(fixtureLines[1]), `linha do '{' não deveria ter 'enum': ${fixtureLines[1]}`);
});

test("std-performance: SELECT * quebrado em linhas (SELECT\\n *)", () => {
  const { r, lines, fixtureLines } = runLinter("std-performance", "a.bad.ts");
  assert.equal(r.status, 1);
  assertV2(lines, "std-performance", 1);
  assert.ok(!/\*/.test(fixtureLines[0]), `linha do SELECT não deveria ter '*': ${fixtureLines[0]}`);
  assert.ok(!/SELECT/i.test(fixtureLines[1]), `linha do '*' não deveria ter SELECT: ${fixtureLines[1]}`);
});

test("std-secret-conventions: console.log(process.env) quebrado em linhas", () => {
  const { r, lines, fixtureLines } = runLinter("std-secret-conventions", "a.bad.ts");
  assert.equal(r.status, 1);
  assertV2(lines, "std-secret-conventions", 1);
  assert.ok(!/process\.env/.test(fixtureLines[0]), `linha do console.log( não deveria ter process.env: ${fixtureLines[0]}`);
  assert.ok(!/console\.log/.test(fixtureLines[1]), `linha do process.env não deveria ter console.log: ${fixtureLines[1]}`);
});

test("std-test-discipline: expect(true) quebrado em linhas", () => {
  const { r, lines, fixtureLines } = runLinter("std-test-discipline", "a.bad.ts");
  assert.equal(r.status, 1);
  assertV2(lines, "std-test-discipline", 1);
  assert.ok(!/true/.test(fixtureLines[0]), `linha do expect( não deveria ter 'true': ${fixtureLines[0]}`);
  assert.ok(!/expect/.test(fixtureLines[1]), `linha do true não deveria ter 'expect': ${fixtureLines[1]}`);
});

test("std-typescript-strict: CRLF — 'let x: any\\r\\n' (falso-negativo fechado)", () => {
  const { r, lines } = runLinter("std-typescript-strict", "a.crlf.bad.ts");
  assert.equal(r.status, 1, "CRLF não pode fazer o linter passar batido pelo ': any'");
  assertV2(lines, "std-typescript-strict", 1);
  assert.match(lines[0], /: any/, `deveria detectar ': any' apesar do \\r\\n: ${lines[0]}`);
});
