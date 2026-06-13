#!/usr/bin/env node
// assets/standards/machine/std-documentation.js — linter default bundlado (TCB). SI-4.
// Cobre comentário C (//, /* */) E hash (#, Python/Go-build/shell), coerente com
// applyTo {ts,tsx,js,jsx,py,go}. Marcador de issue = #123 | URL | issues/.
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(ts|tsx|js|jsx|py|go)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const hits = c.match(/(?:\/\/|#|\/?\*)\s*(?:TODO|FIXME|HACK)\b(?![^\n]*(?:#\d+|https?:\/\/|issues\/))/g) || [];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} marcador(es) TODO/FIXME/HACK sem issue/dono em ${fp}. Adicione link rastreável (#123 ou URL). Ver std-documentation › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
