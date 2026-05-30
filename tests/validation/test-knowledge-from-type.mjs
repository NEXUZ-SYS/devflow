#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { scaffoldKnowledge } from "../../scripts/lib/knowledge-from-type.mjs";

const TYPE = {
  id: "business-vision", layer: "business", summary: "North-star",
  activation: "always", owner: "business-context",
  sectionTemplate: ["## Por que existimos", "## Para quem"],
};

test("scaffoldKnowledge: gera frontmatter + headers", () => {
  const md = scaffoldKnowledge(TYPE, { name: "vision", version: "1.0.0" });
  assert.match(md, /type: knowledge/);
  assert.match(md, /layer: business/);
  assert.match(md, /name: vision/);
  assert.match(md, /activation: always/);
  assert.match(md, /owner: business-context/);
  assert.match(md, /## Por que existimos/);
  assert.match(md, /## Para quem/);
});

test("scaffoldKnowledge: marca placeholder em cada seção", () => {
  const md = scaffoldKnowledge(TYPE, { name: "vision", version: "1.0.0" });
  assert.ok((md.match(/<!-- TODO: preencher -->/g) || []).length >= 2);
});
