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
  // safe-read.mjs (T14 rodada 1): leitura segura da T9; só importa node:fs (travado abaixo).
  // yaml-block.mjs e models-config.mjs (roteamento de modelos): puros, sem node:* — travados por
  // tests/lib/models-config.test.mjs ("yaml-block e models-config são puros").
  const ALLOWED = new Set(["node:fs", "./frontmatter.mjs", "./safe-read.mjs", "./yaml-block.mjs", "./models-config.mjs"]);
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  for (const imp of imports) {
    assert.ok(ALLOWED.has(imp), `import inesperado: ${imp}`);
  }
});

test("safe-read.mjs (importado pelo parser) só importa node:fs e não tem eval/exec/rede/env", () => {
  const sr = readFileSync(fileURLToPath(new URL("../../scripts/lib/safe-read.mjs", import.meta.url)), "utf8");
  const imports = [...sr.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(imports, ["node:fs"]);
  for (const re of FORBIDDEN) assert.ok(!re.test(sr), `padrão proibido em safe-read.mjs: ${re}`);
});
