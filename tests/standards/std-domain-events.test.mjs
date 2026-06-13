// tests/standards/std-domain-events.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-domain-events.js";

describe("std-domain-events linter", () => {
  it("gate: ignora não-.ts (exit 0)", () => {
    assert.equal(lintFile(L, "x.txt", `publish({ type: 'OrderPlaced' })`).code, 0);
  });
  it("BAD: publish de evento sem version no payload", () => {
    const bad = `await bus.publish({ type: 'OrderPlaced', orderId });`;
    assert.equal(lintFile(L, "e.ts", bad).code, 1);
  });
  it("GOOD: publish com version", () => {
    const good = `await bus.publish({ type: 'OrderPlacedV1', version: 1, occurredAt, aggregateId });`;
    assert.equal(lintFile(L, "e.ts", good).code, 0);
  });
  it("GOOD: payload ANINHADO com version (caso normal — não pode dar FP)", () => {
    const good = `await bus.publish({ type: 'X', meta: { trace }, data: { orderId }, version: 2, occurredAt });`;
    assert.equal(lintFile(L, "e.ts", good).code, 0);
  });
  it("BAD: payload aninhado SEM version", () => {
    const bad = `await bus.publish({ type: 'X', meta: { trace }, data: { orderId } });`;
    assert.equal(lintFile(L, "e.ts", bad).code, 1);
  });
  it("BAD: publish multiline sem version", () => {
    const bad = `await bus.publish({\n  type: 'X',\n  orderId,\n});`;
    assert.equal(lintFile(L, "e.ts", bad).code, 1);
  });
});
