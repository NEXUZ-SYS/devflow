import { test } from "node:test";
import assert from "node:assert/strict";
import { missingDeps } from "../../omp/lib/run-bash-hook.mjs";
test("detecta deps ausentes (probe injetável)", () => {
  const present = new Set(["bash", "node"]);
  assert.deepEqual(missingDeps((b) => present.has(b)), ["python3"]);
});
test("tudo presente → vazio", () => { assert.deepEqual(missingDeps(() => true), []); });
