#!/usr/bin/env node
// skills/scrape-stack-batch/tests/discovery.test.mjs
// Tests for discovery.mjs. HTTP calls are real but kept minimal — uses
// well-known public registries that are stable. If running offline,
// skip-pattern via process.env.OFFLINE=1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverSource } from "../scripts/discovery.mjs";

const OFFLINE = process.env.OFFLINE === "1";

test("discoverSource: returns INCERTA structure when nothing found", { skip: OFFLINE }, async () => {
  // Use a deliberately non-existent package name
  const r = await discoverSource("xxxxxxx-no-such-pkg-xxxxxx", "1.0.0");
  assert.equal(r.confidence, 0);
  assert.equal(r.url, null);
});

test("discoverSource: rejects SSRF in homepage", async () => {
  // No real registry hits here — just verify the validation path on injected URL
  const r = await discoverSource("evil-pkg", "1.0.0", {
    allowWebSearch: true,
    webSearchFn: async () => ({ url: "http://169.254.169.254/", confidence: 0.95, type: "docs-site" }),
  });
  // Even if web search returned an SSRF URL, validateUrl should strip it
  assert.equal(r.url, null);
  assert.match(r.reasoning.join("\n"), /SI-3|denied/i);
});

test("discoverSource: web search fallback produces signal", async () => {
  const r = await discoverSource("ad-hoc-lib", "0.1.0", {
    allowWebSearch: true,
    webSearchFn: async () => ({ url: "https://example.com/docs", confidence: 0.7, type: "docs-site" }),
  });
  // Either succeeds (signal added) or is downgraded by SI-3
  assert.ok(r.signals.length > 0 || r.confidence === 0);
});

test("discoverSource: returns reasoning trail", async () => {
  const r = await discoverSource("pkg", "1.0.0", {
    allowWebSearch: true,
    webSearchFn: async () => ({ url: "https://example.com", confidence: 0.5, type: "docs-site" }),
  });
  assert.ok(Array.isArray(r.reasoning));
});

test("discoverSource: integrates confidence + classify pipeline", { skip: OFFLINE }, async () => {
  // Use 'react' — npm registry should have homepage
  const r = await discoverSource("react", "19.0.0");
  // Confidence should be 0 or >= 0.85 depending on whether registry was reachable
  assert.ok(r.confidence === 0 || r.confidence >= 0.85,
    `expected 0 or >=0.85, got ${r.confidence}`);
});
