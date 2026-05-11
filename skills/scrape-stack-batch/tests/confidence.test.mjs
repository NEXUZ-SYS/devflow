#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreSignals, classify } from "../scripts/confidence.mjs";

test("scoreSignals: empty signals returns 0", () => {
  assert.equal(scoreSignals([]), 0);
});

test("scoreSignals: registry only → 0.85", () => {
  assert.equal(scoreSignals([{ kind: "registry_homepage" }]), 0.85);
});

test("scoreSignals: registry + repo match boost → 0.90", () => {
  const r = scoreSignals([
    { kind: "registry_homepage", boost: 0.05 },
  ]);
  assert.ok(Math.abs(r - 0.90) < 1e-9);
});

test("scoreSignals: llms.txt found → 0.95", () => {
  assert.equal(scoreSignals([{ kind: "llms_txt_200" }]), 0.95);
});

test("scoreSignals: llms.txt + version match → 0.98 (max rule)", () => {
  const r = scoreSignals([
    { kind: "llms_txt_200", boost: 0.03 },
  ]);
  assert.ok(Math.abs(r - 0.98) < 1e-9);
});

test("scoreSignals: max() rule across multiple signals", () => {
  const r = scoreSignals([
    { kind: "registry_homepage" },     // 0.85
    { kind: "llms_txt_200" },           // 0.95 — wins
    { kind: "convention_heuristic" },  // 0.50
  ]);
  assert.equal(r, 0.95);
});

test("scoreSignals: caps at 1.0", () => {
  const r = scoreSignals([
    { kind: "llms_txt_200", boost: 0.5 },  // would be 1.45 without cap
  ]);
  assert.equal(r, 1);
});

test("classify: confidence < 0.6 → uncertain", () => {
  assert.equal(classify(0.5).tier, "uncertain");
  assert.equal(classify(0.5).marker, "✗");
});

test("classify: 0.6-0.8 → review", () => {
  assert.equal(classify(0.6).tier, "review");
  assert.equal(classify(0.75).tier, "review");
  assert.equal(classify(0.7).marker, "⚠");
});

test("classify: >= 0.8 → recommended", () => {
  assert.equal(classify(0.8).tier, "recommended");
  assert.equal(classify(0.95).tier, "recommended");
  assert.equal(classify(0.9).marker, "✓");
});
