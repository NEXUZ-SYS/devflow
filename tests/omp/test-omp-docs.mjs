import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
test("doc cobre install, subsistemas e pré-requisitos", () => {
  assert.ok(existsSync("docs/omp-integration.md"));
  const d = readFileSync("docs/omp-integration.md", "utf-8");
  for (const k of ["marketplace add", "standards", "ADR", "knowledge", "MemPalace", "runtime", "python3", "task tool", "devflow omp"]) assert.ok(d.includes(k), `seção ausente: ${k}`);
});
