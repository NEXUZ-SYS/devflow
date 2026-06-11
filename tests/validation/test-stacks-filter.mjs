#!/usr/bin/env node
// tests/validation/test-stacks-filter.mjs
// Unit tests for scripts/lib/stacks-filter.mjs (detecção + filtro por framework).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { filterStacks, detectProjectDeps } from "../../scripts/lib/stacks-filter.mjs";

const TMP = "./tests/validation/tmp/";

function proj(pkg) {
  mkdirSync(TMP, { recursive: true });
  const root = mkdtempSync(join(TMP, "filter-"));
  if (pkg) writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const MERGED = {
  frameworks: {
    next: { version: "16", mcpIndexed: true, mdPath: "/p/frontend/next@16.md" },
    zod: { version: "4", mcpIndexed: true, mdPath: "/p/validation/zod@4.md" },
    tailwind: { version: "4", mcpIndexed: true, mdPath: "/p/frontend/tailwind@4.md" },
    "vercel-ai-sdk": { version: "4", mcpIndexed: true, mdPath: "/p/ai/vercel-ai-sdk.md" },
    node: { version: "24", mcpIndexed: true, mdPath: "/p/runtime/node@24.md" },
    postgres: { version: "16", skipDocs: true, mdPath: "/p/database/postgres.md" },
    bigquery: { version: "latest", mcpIndexed: true, mdPath: "/p/database/bigquery.md" },
    "harness-engineering": { version: "n/a", skipDocs: true, mdPath: "/p/ai/harness-engineering.md" },
    gemini: { version: "latest", skipDocs: true, mdPath: "/p/ai/gemini.md" },
  },
};

const ALIAS = {
  tailwind: ["tailwindcss"],
  "vercel-ai-sdk": ["ai"],
  postgres: ["pg", "postgres", "drizzle-orm", "@prisma/client"],
  bigquery: ["@google-cloud/bigquery"],
};

test("detectProjectDeps: lê deps + devDeps do package.json", () => {
  const { root, cleanup } = proj({ dependencies: { next: "16" }, devDependencies: { vitest: "2" } });
  const { deps, hasPackageJson } = detectProjectDeps(root);
  assert.ok(hasPackageJson);
  assert.ok(deps.has("next"));
  assert.ok(deps.has("vitest"));
  cleanup();
});

test("detecta libs por dep direta e por alias", () => {
  const { root, cleanup } = proj({ dependencies: { next: "16", tailwindcss: "4", ai: "4" } });
  const libs = filterStacks(MERGED, root, { alias: ALIAS }).matched.map((x) => x.lib);
  assert.ok(libs.includes("next"));
  assert.ok(libs.includes("tailwind"));
  assert.ok(libs.includes("vercel-ai-sdk"));
  assert.ok(!libs.includes("zod"), "zod não está nas deps");
  cleanup();
});

test("node sempre incluído quando há package.json", () => {
  const { root, cleanup } = proj({ dependencies: { next: "16" } });
  const libs = filterStacks(MERGED, root, { alias: ALIAS }).matched.map((x) => x.lib);
  assert.ok(libs.includes("node"));
  cleanup();
});

test("postgres/bigquery via pacote-cliente", () => {
  const { root, cleanup } = proj({ dependencies: { pg: "8", "@google-cloud/bigquery": "7" } });
  const libs = filterStacks(MERGED, root, { alias: ALIAS }).matched.map((x) => x.lib);
  assert.ok(libs.includes("postgres"));
  assert.ok(libs.includes("bigquery"));
  cleanup();
});

test("harness-engineering e gemini NUNCA auto-incluídos", () => {
  const { root, cleanup } = proj({ dependencies: { "@google/genai": "1" } });
  const libs = filterStacks(MERGED, root, { alias: ALIAS }).matched.map((x) => x.lib);
  assert.ok(!libs.includes("harness-engineering"));
  assert.ok(!libs.includes("gemini"));
  cleanup();
});

test("projeto sem package.json → vazio (nem node)", () => {
  const { root, cleanup } = proj(null);
  const r = filterStacks(MERGED, root, { alias: ALIAS });
  assert.equal(r.matched.length, 0);
  cleanup();
});

test("reason: registra motivo da inclusão", () => {
  const { root, cleanup } = proj({ dependencies: { next: "16" } });
  const { reason } = filterStacks(MERGED, root, { alias: ALIAS });
  assert.equal(reason.next, "dep:next");
  assert.equal(reason.node, "runtime:package.json");
  cleanup();
});
