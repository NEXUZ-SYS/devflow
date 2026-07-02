// tests/scripts/test-standards-audit-v2.mjs
// Família path-drift DDC v2: `standards audit <id>` deve localizar o std em
// .context/engineering/standards/ (canônico v2), não só no legado
// .context/standards/. RED: cmdAudit hardcoda .context/standards → "not found".
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert";

const CLI = new URL("../../scripts/devflow-standards.mjs", import.meta.url).pathname;

const root = mkdtempSync(join(tmpdir(), "std-audit-"));
const stdsDir = join(root, ".context", "engineering", "standards");
mkdirSync(stdsDir, { recursive: true });
writeFileSync(join(stdsDir, "std-error-handling.md"), `---
id: std-error-handling
description: Tratamento de erros
version: 1.0.0
applyTo: ["**/*.ts"]
enforcement:
  linter: machine/std-error-handling.js
---
# Error handling
## Princípios
- Falhe cedo, propague com contexto.
`);

let out;
try {
  out = execFileSync("node", [CLI, "audit", "error-handling", `--project=${root}`], { encoding: "utf8" });
} catch (e) {
  // gate FAIL → exit 1; captura stdout/stderr mesmo assim
  out = (e.stdout || "") + (e.stderr || "");
}

assert.ok(/std-error-handling\.md/.test(out), "audit deve rodar contra o std alvo (header)");
assert.ok(!/not found:.*standards\/std-error-handling\.md/.test(out),
  "audit NÃO pode reportar 'not found' do .md — o std existe em engineering/standards");
assert.ok(!/S0[^\n]*FAIL/.test(out),
  "S0 (File exists) deve passar quando o std existe em engineering/standards");

console.log("OK test-standards-audit-v2");
