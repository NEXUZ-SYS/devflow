#!/usr/bin/env node
// tests/validation/test-context-index-stacks.mjs
// Integração: o índice SessionStart filtra stacks default pelo framework detectado,
// mantém entradas declaradas pelo projeto, e não regride o índice de standards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildContextIndex } from "../../scripts/lib/context-index.mjs";

const TMP = "./tests/validation/tmp/";

function fx(pkgDeps) {
  mkdirSync(TMP, { recursive: true });
  const plugin = mkdtempSync(join(TMP, "plg-"));
  const proj = mkdtempSync(join(TMP, "prj-"));
  mkdirSync(join(plugin, "assets/stacks/frontend"), { recursive: true });
  mkdirSync(join(plugin, "assets/stacks/validation"), { recursive: true });
  mkdirSync(join(plugin, "assets/standards"), { recursive: true });
  writeFileSync(
    join(plugin, "assets/stacks/manifest.yaml"),
    'spec: devflow-stack/v0\nframeworks:\n  next:\n    version: "16"\n    mcpIndexed: true\n  zod:\n    version: "4"\n    mcpIndexed: true\n',
  );
  writeFileSync(join(plugin, "assets/stacks/frontend/next@16.md"), "---\ntitle: Next\n---\n#");
  writeFileSync(join(plugin, "assets/stacks/validation/zod@4.md"), "---\ntitle: Zod\n---\n#");
  if (pkgDeps) writeFileSync(join(proj, "package.json"), JSON.stringify({ dependencies: pkgDeps }));
  return {
    plugin,
    proj,
    cleanup: () => {
      rmSync(plugin, { recursive: true, force: true });
      rmSync(proj, { recursive: true, force: true });
    },
  };
}

test("índice mostra só stacks do framework detectado (next), não zod", () => {
  const { plugin, proj, cleanup } = fx({ next: "16" });
  const idx = buildContextIndex(proj, plugin);
  const libs = idx.refs.map((r) => r.lib);
  assert.ok(libs.includes("next"), "next detectado via dep");
  assert.ok(!libs.includes("zod"), "zod não está nas deps → fora do índice");
  cleanup();
});

test("entrada declarada pelo projeto sempre aparece (não filtrada por dep)", () => {
  const { plugin, proj, cleanup } = fx({ next: "16" });
  mkdirSync(join(proj, ".context/engineering/stacks/database"), { recursive: true });
  writeFileSync(
    join(proj, ".context/engineering/stacks/manifest.yaml"),
    'spec: devflow-stack/v0\nframeworks:\n  pgvector:\n    version: "0.8"\n    mcpIndexed: true\n',
  );
  const idx = buildContextIndex(proj, plugin);
  const libs = idx.refs.map((r) => r.lib);
  assert.ok(libs.includes("pgvector"), "pgvector declarado no projeto aparece sem dep");
  assert.ok(libs.includes("next"), "default detectado segue aparecendo");
  cleanup();
});

test("regressão: índice de standards permanece com forma intacta", () => {
  const { plugin, proj, cleanup } = fx({ next: "16" });
  const idx = buildContextIndex(proj, plugin);
  assert.ok(Array.isArray(idx.standards));
  assert.ok(idx.totals && typeof idx.totals.standards === "number");
  cleanup();
});
