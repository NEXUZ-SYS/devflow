// tests/lib/devflow-config-pure.test.mjs
// ADR-011 / segurança: o parser de config é PURO — sem eval/exec/rede/env.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  fileURLToPath(new URL("../../scripts/lib/devflow-config.mjs", import.meta.url)),
  "utf8",
);

const FORBIDDEN = [
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /child_process/,
  /\bexecSync\b/, /\bspawnSync\b/, /\bspawn\s*\(/,
  /\bfetch\s*\(/,
  /\bnode:vm\b/, /\brequire\s*\(/,
  /\bimport\s*\(/,          // import() dinâmico
  /process\.env/,
];

for (const re of FORBIDDEN) {
  test(`source não contém ${re}`, () => {
    assert.ok(!re.test(src), `padrão proibido encontrado: ${re}`);
  });
}

test("só importa de node:fs e do parser interno frontmatter.mjs (zero-dep, sem deps externas)", () => {
  // A invariante é: sem deps de terceiros e sem superfície de eval/exec/rede/env
  // (as regras FORBIDDEN acima cobrem o resto). frontmatter.mjs é o parser YAML
  // interno, puro e zero-dep, reusado por readVerify (ADR-013 refina ADR-011).
  const ALLOWED = new Set(["node:fs", "./frontmatter.mjs"]);
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  for (const imp of imports) {
    assert.ok(ALLOWED.has(imp), `import inesperado: ${imp}`);
  }
});
