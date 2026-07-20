import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestBump } from "../../../scripts/lib/finalize/suggest-bump.mjs";

test("vazio → patch (default seguro)", () => {
  assert.equal(suggestBump([]), "patch");
  assert.equal(suggestBump(), "patch");
});

test("só fix/chore/docs → patch", () => {
  assert.equal(suggestBump(["fix: corrige X", "chore: bump deps", "docs: readme"]), "patch");
  assert.equal(suggestBump(["refactor(core): extrai helper", "test: cobre borda"]), "patch");
});

test("algum feat → minor", () => {
  assert.equal(suggestBump(["fix: x", "feat: nova capacidade", "docs: y"]), "minor");
  assert.equal(suggestBump(["feat(scope): endpoint"]), "minor");
});

test("breaking via ! → major (vence feat)", () => {
  assert.equal(suggestBump(["feat!: remove API antiga"]), "major");
  assert.equal(suggestBump(["fix(api)!: muda contrato", "feat: outra coisa"]), "major");
});

test("breaking via BREAKING CHANGE no corpo → major", () => {
  assert.equal(suggestBump(["feat: x\n\nBREAKING CHANGE: remove campo"]), "major");
  assert.equal(suggestBump(["fix: y\n\nBREAKING-CHANGE: idem"]), "major");
});

test("precedência: major > minor > patch", () => {
  assert.equal(suggestBump(["fix: a", "feat: b", "feat!: c"]), "major");
  assert.equal(suggestBump(["fix: a", "feat: b"]), "minor");
  assert.equal(suggestBump(["fix: a", "chore: b"]), "patch");
});

test("não confunde 'feat' fora do prefixo (ex.: 'fix: feature toggle')", () => {
  assert.equal(suggestBump(["fix: adiciona feature toggle"]), "patch");
});

test("nunca lança com entrada suja (não-string, null)", () => {
  assert.doesNotThrow(() => suggestBump([null, 42, { x: 1 }, "feat: ok"]));
  assert.equal(suggestBump([null, 42, "feat: ok"]), "minor");
});
