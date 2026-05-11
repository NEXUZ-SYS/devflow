#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReproToken, hashToolDefinitions } from "../../scripts/lib/repro-token.mjs";

test("computeReproToken: returns 64-char hex (sha256)", () => {
  const t = computeReproToken({
    model: "claude-opus-4.7",
    params: { temperature: 0.7 },
    lockHash: "abc123",
    toolDefinitionsHash: "def456",
  });
  assert.match(t, /^[0-9a-f]{64}$/);
});

test("computeReproToken: deterministic for same inputs", () => {
  const input = {
    model: "claude-opus-4.7",
    params: { temperature: 0.7, max_tokens: 1024 },
    lockHash: "lock-abc",
    toolDefinitionsHash: "tools-xyz",
  };
  const a = computeReproToken(input);
  const b = computeReproToken(input);
  assert.equal(a, b, "same inputs must produce same token");
});

test("computeReproToken: different inputs produce different tokens", () => {
  const a = computeReproToken({ model: "claude-opus-4.7", params: {}, lockHash: "x", toolDefinitionsHash: "y" });
  const b = computeReproToken({ model: "claude-sonnet-4.6", params: {}, lockHash: "x", toolDefinitionsHash: "y" });
  assert.notEqual(a, b);
});

test("computeReproToken: param order doesn't affect token (canonical)", () => {
  const a = computeReproToken({
    model: "claude-opus-4.7",
    params: { a: 1, b: 2, c: 3 },
    lockHash: "x", toolDefinitionsHash: "y",
  });
  const b = computeReproToken({
    model: "claude-opus-4.7",
    params: { c: 3, b: 2, a: 1 },
    lockHash: "x", toolDefinitionsHash: "y",
  });
  assert.equal(a, b, "param order shouldn't change token (canonical JSON)");
});

test("computeReproToken: handles missing fields gracefully", () => {
  const t = computeReproToken({});
  assert.match(t, /^[0-9a-f]{64}$/);
});

test("hashToolDefinitions: deterministic + sensitive to changes", () => {
  const tools = [
    { name: "Read", description: "Read a file" },
    { name: "Write", description: "Write a file" },
  ];
  const a = hashToolDefinitions(tools);
  const b = hashToolDefinitions(tools);
  assert.equal(a, b);

  const modified = [
    { name: "Read", description: "Read a file" },
    { name: "Write", description: "Modified description" },
  ];
  const c = hashToolDefinitions(modified);
  assert.notEqual(a, c);
});

test("hashToolDefinitions: order-insensitive (sorts by name)", () => {
  const t1 = [{ name: "B", description: "b" }, { name: "A", description: "a" }];
  const t2 = [{ name: "A", description: "a" }, { name: "B", description: "b" }];
  assert.equal(hashToolDefinitions(t1), hashToolDefinitions(t2));
});

test("hashToolDefinitions: empty list returns stable hash", () => {
  const a = hashToolDefinitions([]);
  const b = hashToolDefinitions([]);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});
