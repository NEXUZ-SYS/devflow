// tests/lib/finalize/finalize-pure.test.mjs
// Segurança: os helpers de finalização chamam git só via execFileSync (argv),
// nunca shell:true/eval/rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../../scripts/lib/finalize/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".mjs"));
const FORBIDDEN = [/\beval\s*\(/, /new\s+Function\s*\(/, /shell\s*:\s*true/, /\bexecSync\s*\(/, /\bfetch\s*\(/, /\bimport\s*\(/];

for (const f of files) {
  const src = readFileSync(dir + f, "utf8");
  for (const re of FORBIDDEN) {
    test(`${f} não contém ${re}`, () => {
      assert.ok(!re.test(src), `padrão proibido em ${f}: ${re}`);
    });
  }
}
