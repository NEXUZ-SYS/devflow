// tests/standards/test-std-security-enforced.mjs
// B6: std-security é um baseline SEMPRE enforçado.
// (a) metadado `activation: always` — reflete a realidade: o linter default roda
//     via post-tool-use independentemente de `activation` (o standards-loader não
//     consome esse campo). always torna o frontmatter honesto e à prova de futuro.
// (b) regressão: o linter std-security dispara por default num .ts com SQL
//     string-interpolada, mesmo num projeto SEM .context/standards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url).pathname;

test("B6(a): std-security declara activation: always (baseline enforçado)", () => {
  const md = readFileSync(join(ROOT, "assets/standards/std-security.md"), "utf-8");
  assert.match(md, /^activation:\s*always\s*$/m, "std-security deve declarar 'activation: always'");
});

test("B6(b): linter std-security dispara por default em SQL string-interpolada", () => {
  const tmp = mkdtempSync(join(tmpdir(), "stdsec-"));
  writeFileSync(join(tmp, "q.ts"), "const q = `SELECT * FROM users WHERE id = ${id}`;\n");
  let out;
  try {
    out = execFileSync("node", [join(ROOT, "scripts/lib/run-linter-cli.mjs"), `--plugin=${ROOT}`], {
      input: JSON.stringify({ tool: "Write", path: "q.ts" }),
      cwd: tmp, encoding: "utf-8",
    });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
  }
  assert.match(out, /std-security/, "std-security deve ser sinalizado por default");
  assert.match(out, /VIOLATION/, "deve reportar VIOLATION do vetor inseguro");
});
