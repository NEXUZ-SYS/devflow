#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditKnowledge } from "../../scripts/lib/knowledge-audit.mjs";

const VALID = `---
type: knowledge
layer: business
name: vision
description: North-star
activation: always
owner: business-context
version: 1.0.0
---
## Por que existimos
Somos X para Y.
`;

test("auditKnowledge: doc completo passa K1-K5", () => {
  const r = auditKnowledge(VALID);
  assert.equal(r.ok, true);
  assert.equal(r.failures.length, 0);
});

test("auditKnowledge: K1 frontmatter incompleto falha", () => {
  const src = "---\ntype: knowledge\nlayer: business\n---\ncorpo\n";
  const r = auditKnowledge(src);
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.startsWith("K1")));
});

test("auditKnowledge: K2 placeholder TODO falha", () => {
  const src = VALID.replace("Somos X para Y.", "<!-- TODO: preencher -->");
  const r = auditKnowledge(src);
  assert.ok(r.failures.some((f) => f.startsWith("K2")));
});

test("auditKnowledge: K3 activation inválida falha", () => {
  const src = VALID.replace("activation: always", "activation: sometimes");
  const r = auditKnowledge(src);
  assert.ok(r.failures.some((f) => f.startsWith("K3")));
});

test("auditKnowledge: K4 layer inválida falha", () => {
  const src = VALID.replace("layer: business", "layer: marketing");
  const r = auditKnowledge(src);
  assert.ok(r.failures.some((f) => f.startsWith("K4")));
});
