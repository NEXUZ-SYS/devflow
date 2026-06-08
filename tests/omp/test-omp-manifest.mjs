import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
test("package.json declara omp.extensions e NÃO duplica version", () => {
  assert.ok(existsSync("package.json"));
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  assert.ok(Array.isArray(pkg.omp?.extensions) && pkg.omp.extensions.includes("./omp/extension.mjs"));
  assert.ok(!("version" in pkg), "version não deve viver no package.json (fonte de verdade é plugin.json)");
  assert.equal(pkg.private, true);
});
