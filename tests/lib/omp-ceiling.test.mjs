// tests/lib/omp-ceiling.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ompCeilingTier } from "../../scripts/lib/omp-ceiling.mjs";

test("pluginRoot sem omp/omp-roles.yaml → teto nulo (não rotear), sem lançar", () => {
  const plugin = mkdtempSync(join(tmpdir(), "omp-ceiling-plugin-"));
  const proj = mkdtempSync(join(tmpdir(), "omp-ceiling-proj-"));
  assert.equal(ompCeilingTier(plugin, proj, "devflow:architect"), null);
});

test("omp-roles.yaml ilegível (diretório no lugar do arquivo) → teto nulo", () => {
  const plugin = mkdtempSync(join(tmpdir(), "omp-ceiling-plugin-"));
  mkdirSync(join(plugin, "omp/omp-roles.yaml"), { recursive: true });
  assert.equal(ompCeilingTier(plugin, plugin, "x"), null);
});
