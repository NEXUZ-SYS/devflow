// tests/standards/std-layer-boundaries.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-layer-boundaries.js";

describe("std-layer-boundaries linter", () => {
  it("gate: ignora fora de src/ (exit 0)", () => {
    assert.equal(lintFile(L, "x.ts", `import { db } from '../infra/db';`).code, 0);
  });
  it("BAD: domínio importa infra (import relativo p/ infra)", () => {
    assert.equal(lintFile(L, "src/domain/order.ts", `import { pg } from '../infra/pg';`).code, 1);
  });
  it("BAD: import de path interno entre features (fora do index)", () => {
    assert.equal(lintFile(L, "src/features/a/ui.ts", `import x from '../b/model/internal';`).code, 1);
  });
  it("GOOD: import via public API (index) de outra feature", () => {
    assert.equal(lintFile(L, "src/features/a/ui.ts", `import { x } from '../b';`).code, 0);
  });
  it("GOOD: import de segmento irmão DENTRO do próprio slice (FP fix)", () => {
    assert.equal(lintFile(L, "src/features/a/ui/x.ts", `import { u } from '../lib/util';`).code, 0);
  });
});
