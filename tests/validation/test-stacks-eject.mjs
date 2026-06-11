#!/usr/bin/env node
// tests/validation/test-stacks-eject.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cmdEject } from "../../scripts/devflow-stacks.mjs";

const TMP = "./tests/validation/tmp/";

function fx() {
  mkdirSync(TMP, { recursive: true });
  const plugin = mkdtempSync(join(TMP, "plg-"));
  const proj = mkdtempSync(join(TMP, "prj-"));
  mkdirSync(join(plugin, "assets/stacks/frontend"), { recursive: true });
  writeFileSync(join(plugin, "assets/stacks/frontend/next@16.md"), "---\ntitle: Next\n---\n# Next");
  return {
    plugin,
    proj,
    cleanup: () => {
      rmSync(plugin, { recursive: true, force: true });
      rmSync(proj, { recursive: true, force: true });
    },
  };
}

test("eject copia o .md do default para o projeto (resolve concern)", async () => {
  const { plugin, proj, cleanup } = fx();
  const code = await cmdEject("next", proj, { pluginRoot: plugin });
  assert.equal(code, 0);
  const dest = join(proj, ".context/engineering/stacks/frontend/next@16.md");
  assert.ok(existsSync(dest), "destino criado");
  assert.match(readFileSync(dest, "utf-8"), /# Next/);
  cleanup();
});

test("eject sem --force falha se destino já existe", async () => {
  const { plugin, proj, cleanup } = fx();
  await cmdEject("next", proj, { pluginRoot: plugin });
  const code = await cmdEject("next", proj, { pluginRoot: plugin });
  assert.notEqual(code, 0);
  const forced = await cmdEject("next", proj, { pluginRoot: plugin, force: true });
  assert.equal(forced, 0);
  cleanup();
});

test("eject falha em lib inexistente", async () => {
  const { plugin, proj, cleanup } = fx();
  const code = await cmdEject("inexistente", proj, { pluginRoot: plugin });
  assert.notEqual(code, 0);
  cleanup();
});

test("eject rejeita nome com traversal", async () => {
  const { plugin, proj, cleanup } = fx();
  const code = await cmdEject("../../etc/passwd", proj, { pluginRoot: plugin });
  assert.notEqual(code, 0);
  assert.ok(!existsSync(join(proj, ".context")), "nada escrito");
  cleanup();
});
