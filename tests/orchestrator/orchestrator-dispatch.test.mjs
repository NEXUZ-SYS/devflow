// Testes para a lib de despacho do orchestrator.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeStories, sanitizeProjectId, maxWidthFrom, independentCount } from "../../scripts/lib/orchestrator-dispatch.mjs";

describe("normalizeStories", () => {
  it("mapeia blocked_by → depends_on", () => {
    const n = normalizeStories([{ id: "a" }, { id: "b", blocked_by: ["a"] }]);
    assert.deepEqual(n[0].depends_on, []);
    assert.deepEqual(n[1].depends_on, ["a"]);
  });
  it("preserva depends_on se já presente", () => {
    const n = normalizeStories([{ id: "b", depends_on: ["x"], blocked_by: ["y"] }]);
    assert.deepEqual(n[0].depends_on, ["x"]);
  });
  it("entrada vazia → []", () => {
    assert.deepEqual(normalizeStories(), []);
  });
});

describe("sanitizeProjectId", () => {
  it("kebab seguro", () => {
    assert.equal(sanitizeProjectId("Meu App 2"), "meu-app-2");
    assert.equal(sanitizeProjectId("já/com:coisas!"), "j-com-coisas");
  });
  it("vazio → fallback", () => {
    assert.equal(sanitizeProjectId(""), "projeto");
    assert.equal(sanitizeProjectId(null), "projeto");
  });
  it("remove pontos e underscores no início e no fim (chave YAML inválida)", () => {
    assert.equal(sanitizeProjectId("..hidden"), "hidden");
    assert.equal(sanitizeProjectId("_private_"), "private");
    assert.equal(sanitizeProjectId(".dotfile."), "dotfile");
  });
});

describe("maxWidthFrom", () => {
  it("lê do config", () => {
    assert.equal(maxWidthFrom({ orchestrator: { maxWaveWidth: 3 } }), 3);
  });
  it("ausente/zero → Infinity", () => {
    assert.equal(maxWidthFrom({}), Infinity);
    assert.equal(maxWidthFrom({ orchestrator: { maxWaveWidth: 0 } }), Infinity);
  });
});

describe("independentCount", () => {
  it("conta a primeira onda (sem deps)", () => {
    assert.equal(independentCount([{ id: "a" }, { id: "b" }, { id: "c", blocked_by: ["a"] }]), 2);
  });
  it("vazio → 0", () => {
    assert.equal(independentCount([]), 0);
  });
});
