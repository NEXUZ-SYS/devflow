#!/usr/bin/env node
// assets/standards/machine/std-design-antipatterns.js — linter default bundlado (TCB). SI-4.
// Regras "slop" (AI tells) portadas de pbakaus/impeccable @cli-v3.2.0 (Apache-2.0),
// cli/engine/rules/checks.mjs. Apenas as decidíveis por parsing estático de UM arquivo
// (ver docs/design-rules-classification.md). Parsing estático puro: sem LLM, sem rede, sem exec.
import { readFileSync } from "node:fs";

const fp = process.argv[2];
if (!fp || !/\.(tsx|jsx|vue|svelte|html|css)$/.test(fp)) process.exit(0);
let c = "";
try {
  c = readFileSync(fp, "utf-8");
} catch {
  process.exit(0);
}

const v = [];

// gradient-text — texto com gradiente (background-clip:text sobre um gradiente) é "AI tell".
if (
  /(?:-webkit-)?background-clip\s*:\s*text/i.test(c) &&
  /(?:linear|radial|conic)-gradient\s*\(/i.test(c)
) {
  v.push(
    'gradient-text — texto com gradiente é "AI tell"; use cor sólida (contraste >= 4.5:1); gradiente só em superfícies'
  );
}

if (v.length > 0) {
  for (const m of v) console.log(`VIOLATION: ${m} [${fp}]`);
  process.exit(1);
}
process.exit(0);
