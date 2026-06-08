import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectInstalledRuntimes } from "../../scripts/lib/detect-installed-runtimes.mjs";
test("só os presentes", () => assert.deepEqual(detectInstalledRuntimes((b) => new Set(["claude","omp"]).has(b)).sort(), ["claude","omp"]));
test("nenhum → vazio", () => assert.deepEqual(detectInstalledRuntimes(() => false), []));
test("CLI imprime JSON array dos runtimes instalados", () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), "../../scripts/lib/detect-installed-runtimes.mjs");
  const r = spawnSync(process.execPath, [script], { encoding: "utf-8" });
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout.trim());
  assert.ok(Array.isArray(parsed));
});
