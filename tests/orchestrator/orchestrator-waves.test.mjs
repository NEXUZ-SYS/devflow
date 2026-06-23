// Run: node --test tests/orchestrator/orchestrator-waves.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeWaves, readyStories } from "../../scripts/lib/orchestrator-waves.mjs";

describe("computeWaves", () => {
  it("tudo independente → uma única onda", () => {
    const w = computeWaves([{ id: "a" }, { id: "b" }, { id: "c" }]);
    assert.deepEqual(w, [["a", "b", "c"]]);
  });
  it("cadeia linear → uma onda por nível", () => {
    const w = computeWaves([
      { id: "a" },
      { id: "b", depends_on: ["a"] },
      { id: "c", depends_on: ["b"] },
    ]);
    assert.deepEqual(w, [["a"], ["b"], ["c"]]);
  });
  it("diamante → níveis corretos", () => {
    const w = computeWaves([
      { id: "a" },
      { id: "b", depends_on: ["a"] },
      { id: "c", depends_on: ["a"] },
      { id: "d", depends_on: ["b", "c"] },
    ]);
    assert.deepEqual(w, [["a"], ["b", "c"], ["d"]]);
  });
  it("ignora deps para ids inexistentes", () => {
    const w = computeWaves([{ id: "a", depends_on: ["x"] }]);
    assert.deepEqual(w, [["a"]]);
  });
  it("lança em ciclo", () => {
    assert.throws(
      () => computeWaves([{ id: "a", depends_on: ["b"] }, { id: "b", depends_on: ["a"] }]),
      /[Cc]iclo/
    );
  });
});

describe("readyStories", () => {
  const stories = [
    { id: "a" },
    { id: "b", depends_on: ["a"] },
    { id: "c", depends_on: ["a"] },
    { id: "d", depends_on: ["b", "c"] },
  ];
  it("início: só os sem deps", () => {
    assert.deepEqual(readyStories(stories, [], []), ["a"]);
  });
  it("após 'a' pronto: libera b e c (pipeline)", () => {
    assert.deepEqual(readyStories(stories, ["a"], []), ["b", "c"]);
  });
  it("respeita maxWidth e in-flight", () => {
    assert.deepEqual(readyStories(stories, ["a"], ["b"], 2), ["c"]);
    assert.deepEqual(readyStories(stories, ["a"], ["b", "c"], 2), []);
  });
  it("d só quando b e c terminam", () => {
    assert.deepEqual(readyStories(stories, ["a", "b"], []), ["c"]);
    assert.deepEqual(readyStories(stories, ["a", "b", "c"], []), ["d"]);
  });
});
