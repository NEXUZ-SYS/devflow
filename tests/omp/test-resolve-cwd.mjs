import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectCwd } from "../../omp/lib/resolve-cwd.mjs";
test("sobe até a raiz com .context a partir do file_path (A2)", () => {
  const root = mkdtempSync(join(tmpdir(), "rcwd-"));
  mkdirSync(join(root, ".context"), { recursive: true });
  mkdirSync(join(root, "src/deep"), { recursive: true });
  const f = join(root, "src/deep/a.ts"); writeFileSync(f, "x");
  assert.equal(resolveProjectCwd(f, "/processo/errado"), root);
});
test("sem marcador → fallback", () => {
  assert.equal(resolveProjectCwd("/no/marker/a.ts", "/fb"), "/fb");
});
