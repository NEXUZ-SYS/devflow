#!/usr/bin/env node
// tests/validation/test-stacks-filter-cli.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildStacksContext, renderStacksText } from "../../scripts/lib/stacks-filter-cli.mjs";

const TMP = "./tests/validation/tmp/";

function fx(pkgDeps) {
  mkdirSync(TMP, { recursive: true });
  const plugin = mkdtempSync(join(TMP, "plg-"));
  const proj = mkdtempSync(join(TMP, "prj-"));
  mkdirSync(join(plugin, "assets/stacks/frontend"), { recursive: true });
  mkdirSync(join(plugin, "assets/stacks/ai"), { recursive: true });
  writeFileSync(
    join(plugin, "assets/stacks/manifest.yaml"),
    'spec: devflow-stack/v0\nframeworks:\n  next:\n    version: "16"\n    mcpIndexed: true\n  harness-engineering:\n    version: "n/a"\n    skipDocs: true\n',
  );
  writeFileSync(join(plugin, "assets/stacks/frontend/next@16.md"), "---\ntitle: Next\n---\n#");
  writeFileSync(join(plugin, "assets/stacks/ai/harness-engineering.md"), "---\ntitle: Harness\n---\n#");
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

test("bloco contém o stack detectado e o ponteiro MCP", () => {
  const { plugin, proj, cleanup } = fx({ next: "16" });
  const ctx = buildStacksContext(proj, plugin, "implementar página");
  const txt = renderStacksText(ctx);
  assert.match(txt, /next@16/);
  assert.match(txt, /search_docs/);
  assert.match(txt, /STACKS filtered="true"/);
  cleanup();
});

test("keyword-match libera harness-engineering quando a task menciona agent", () => {
  const { plugin, proj, cleanup } = fx({ next: "16" });
  const ctx = buildStacksContext(proj, plugin, "construir um agent com harness");
  assert.ok(ctx.matched.map((x) => x.lib).includes("harness-engineering"));
  cleanup();
});

test("sem keyword, harness-engineering não entra", () => {
  const { plugin, proj, cleanup } = fx({ next: "16" });
  const ctx = buildStacksContext(proj, plugin, "ajustar css");
  assert.ok(!ctx.matched.map((x) => x.lib).includes("harness-engineering"));
  cleanup();
});
