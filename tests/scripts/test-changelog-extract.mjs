// Testes do changelog-extract — extrai a seção de uma versão p/ release notes.
// Run: node tests/scripts/test-changelog-extract.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSection } from "../../scripts/lib/changelog-extract.mjs";

const SAMPLE = `# Changelog

## [Unreleased]

### Added — algo novo

corpo unreleased.

## [1.24.0] — 2026-06-23

### Added — Instinct

corpo instinct linha 1.
corpo instinct linha 2.

## [1.23.4] — 2026-06-19

corpo AO.

## [1.20.0] — 2026-06-13

corpo antigo.
`;

test("extrai a seção de uma versão (sem header, até o próximo '## [')", () => {
  const s = extractSection(SAMPLE, "1.24.0");
  assert.match(s, /### Added — Instinct/);
  assert.match(s, /corpo instinct linha 2\./);
  assert.doesNotMatch(s, /corpo AO/);          // não vaza p/ a próxima seção
  assert.doesNotMatch(s, /## \[1\.24\.0\]/);   // não inclui o header
});

test("extrai a última seção (até o EOF)", () => {
  assert.match(extractSection(SAMPLE, "1.20.0"), /corpo antigo/);
});

test("Unreleased também é extraível", () => {
  assert.match(extractSection(SAMPLE, "Unreleased"), /algo novo/);
});

test("versão inexistente → null", () => {
  assert.equal(extractSection(SAMPLE, "9.9.9"), null);
});

test("match exato do header — 1.2.0 NÃO casa com 1.24.0", () => {
  assert.equal(extractSection(SAMPLE, "1.2.0"), null);
});
