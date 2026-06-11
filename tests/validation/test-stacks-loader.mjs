#!/usr/bin/env node
// tests/validation/test-stacks-loader.mjs
// Unit tests for scripts/lib/stacks-loader.mjs (live-load dual-source).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadStacksMerged, parseStacksLocalDisable } from "../../scripts/lib/stacks-loader.mjs";

const TMP = "./tests/validation/tmp/";

function fx() {
  mkdirSync(TMP, { recursive: true });
  const plugin = mkdtempSync(join(TMP, "plugin-"));
  const proj = mkdtempSync(join(TMP, "proj-"));
  mkdirSync(join(plugin, "assets/stacks/frontend"), { recursive: true });
  mkdirSync(join(plugin, "assets/stacks/validation"), { recursive: true });
  writeFileSync(
    join(plugin, "assets/stacks/manifest.yaml"),
    'spec: devflow-stack/v0\nframeworks:\n  next:\n    version: "16"\n    mcpIndexed: true\n  zod:\n    version: "4"\n    mcpIndexed: true\n',
  );
  writeFileSync(join(plugin, "assets/stacks/frontend/next@16.md"), "---\ntitle: Next.js\npackage: next\n---\n# Next");
  writeFileSync(join(plugin, "assets/stacks/validation/zod@4.md"), "---\ntitle: Zod\n---\n# Zod");
  return {
    plugin,
    proj,
    cleanup: () => {
      rmSync(plugin, { recursive: true, force: true });
      rmSync(proj, { recursive: true, force: true });
    },
  };
}

test("parseStacksLocalDisable: inline e block form", () => {
  assert.deepEqual(parseStacksLocalDisable("disable: [a, b]\n"), ["a", "b"]);
  assert.deepEqual(parseStacksLocalDisable("disable:\n  - a\n  - b\n"), ["a", "b"]);
  assert.deepEqual(parseStacksLocalDisable("outro: 1\n"), []);
});

test("merge: defaults do plugin aparecem quando projeto vazio", () => {
  const { plugin, proj, cleanup } = fx();
  const m = loadStacksMerged(proj, plugin);
  assert.equal(m.frameworks.next.version, "16");
  assert.equal(m.frameworks.next.origin, "default");
  assert.equal(m.frameworks.next.concern, "frontend");
  assert.ok(m.frameworks.next.mdPath.endsWith("frontend/next@16.md"));
  cleanup();
});

test("project-wins: entrada do projeto sobrescreve default por nome", () => {
  const { plugin, proj, cleanup } = fx();
  mkdirSync(join(proj, ".context/engineering/stacks"), { recursive: true });
  writeFileSync(
    join(proj, ".context/engineering/stacks/manifest.yaml"),
    'spec: devflow-stack/v0\nframeworks:\n  next:\n    version: "15"\n    mcpIndexed: true\n',
  );
  const m = loadStacksMerged(proj, plugin);
  assert.equal(m.frameworks.next.version, "15");
  assert.equal(m.frameworks.next.origin, "project");
  cleanup();
});

test("disable: stacks.local.yaml remove a lib do merge", () => {
  const { plugin, proj, cleanup } = fx();
  mkdirSync(join(proj, ".context"), { recursive: true }); // CORREÇÃO 2 do Review
  writeFileSync(join(proj, ".context/stacks.local.yaml"), "disable: [zod]\n");
  const m = loadStacksMerged(proj, plugin);
  assert.ok(m.frameworks.next, "next permanece");
  assert.equal(m.frameworks.zod, undefined, "zod desabilitado");
  cleanup();
});

test("pluginRoot ausente: não quebra, retorna só projeto", () => {
  const { proj, cleanup } = fx();
  const m = loadStacksMerged(proj, undefined);
  assert.equal(m.spec, "devflow-stack/v0");
  assert.deepEqual(m.frameworks, {});
  cleanup();
});
