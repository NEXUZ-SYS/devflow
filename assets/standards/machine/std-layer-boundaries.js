#!/usr/bin/env node
// assets/standards/machine/std-layer-boundaries.js — linter default bundlado (TCB). SI-4.
// Regra conservadora, baseada em RESOLUÇÃO REAL de path (não regex sobre o import):
//   (a) arquivo em /domain importando algo que resolve para /infra;
//   (b) arquivo em features/<A> importando path INTERNO de features/<B≠A> (além do index).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
const fp = process.argv[2];
if (!fp || !/\.(ts|tsx)$/.test(fp) || !/[\\/]src[\\/]/.test(fp.replace(/\\/g, "/"))) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const norm = p => p.replace(/\\/g, "/");
const self = norm(fp);
const imports = [...c.matchAll(/import\s[^;]*?from\s*['"]([^'"]+)['"]/g)]
  .map(m => m[1]).filter(s => s.startsWith("."));
const inDomain = /\/domain\//.test(self);
const mySlice = self.match(/\/features\/([^/]+)\//);
const hits = [];
for (const spec of imports) {
  const target = norm(resolve(dirname(fp), spec));
  if (inDomain && /\/infra\//.test(target)) hits.push(spec);
  if (mySlice) {
    const t = target.match(/\/features\/([^/]+)\/(.+)/); // resolve p/ outra slice + sub-path
    if (t && t[1] !== mySlice[1] && !/^index(\.\w+)?$/.test(t[2])) hits.push(spec);
  }
}
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} import(s) violando layer boundaries em ${fp} (${hits.join(", ")}). Domínio não importa infra; entre features use a public API (index). Ver std-layer-boundaries › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
