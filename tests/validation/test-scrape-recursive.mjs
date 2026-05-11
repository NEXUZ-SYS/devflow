#!/usr/bin/env node
// Test suite: scripts/lib/scrape-recursive.mjs — Fase B simplified.
//
// recursiveScrape now populates the docs-mcp-server global store directly
// (no SQLite extraction, no tmp dir). The lib is much smaller — most tests
// here are smoke against the real CLI, gated by SKIP_NETWORK_TESTS=1.
//
// listIndexedLibraries() reads from the global store via `npx ... list`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recursiveScrape,
  listIndexedLibraries,
} from "../../scripts/lib/scrape-recursive.mjs";

const SKIP_NETWORK = process.env.SKIP_NETWORK_TESTS === "1";

test("recursiveScrape: rejects missing library/version/url", async () => {
  await assert.rejects(
    recursiveScrape({ version: "1.0", url: "https://x" }),
    /library, version, and url are required/
  );
  await assert.rejects(
    recursiveScrape({ library: "foo", url: "https://x" }),
    /library, version, and url are required/
  );
  await assert.rejects(
    recursiveScrape({ library: "foo", version: "1.0" }),
    /library, version, and url are required/
  );
});

test("listIndexedLibraries: returns array (empty or populated)", { skip: SKIP_NETWORK }, async () => {
  // Tests that the JSON parsing path works against the real CLI. Doesn't
  // assert specific libs since global store is shared across projects.
  const libs = await listIndexedLibraries();
  assert.ok(Array.isArray(libs), "must return an array");
  for (const entry of libs) {
    assert.equal(typeof entry.library, "string");
    assert.equal(typeof entry.version, "string");
  }
});

test("recursiveScrape: smoke contra zod.dev (network, mutates global store)", { skip: SKIP_NETWORK }, async () => {
  // Real smoke: scrape zod into the user's global store. After this runs,
  // `listIndexedLibraries()` should include zod@4.1.0-test. Marker version
  // chosen to avoid collision with real user data.
  const r = await recursiveScrape({
    library: "zod-smoke",
    version: "0.0.0-test",
    url: "https://zod.dev/",
    maxPages: 3,  // cap low for test speed
    maxDepth: 1,
  });
  assert.equal(r.library, "zod-smoke");
  assert.equal(r.version, "0.0.0-test");

  // Verify the smoke entry is now visible in the global store
  const libs = await listIndexedLibraries();
  const found = libs.find(l => l.library === "zod-smoke" && l.version === "0.0.0-test");
  assert.ok(found, "zod-smoke@0.0.0-test should be visible in list after scrape");
});
