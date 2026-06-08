import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInstalledRuntimes } from "../../scripts/lib/detect-installed-runtimes.mjs";
test("só os presentes", () => assert.deepEqual(detectInstalledRuntimes((b) => new Set(["claude","omp"]).has(b)).sort(), ["claude","omp"]));
test("nenhum → vazio", () => assert.deepEqual(detectInstalledRuntimes(() => false), []));
