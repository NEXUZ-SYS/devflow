#!/usr/bin/env node
// assets/standards/machine/std-accessibility.js — linter default bundlado (TCB). SI-4.
// `[^>]` casa \n (tags multiline OK). Isenta div/span COM role= (padrão a11y válido).
import { readFileSync } from "node:fs";
const fp = process.argv[2];
if (!fp || !/\.(tsx|jsx)$/.test(fp)) process.exit(0);
let c = "";
try { c = readFileSync(fp, "utf-8"); } catch { process.exit(0); }
const divClick = (c.match(/<(?:div|span)\b[^>]*?\sonClick[^>]*>/g) || [])
  .filter(tag => !/\brole\s*=/.test(tag));
const hits = [
  ...divClick,
  ...(c.match(/tabIndex\s*=\s*\{?\s*["']?[1-9]/g) || []),
  ...(c.match(/<img\b(?![^>]*\salt[=\s/>])[^>]*>/g) || []),
];
if (hits.length > 0) {
  console.log(`VIOLATION: ${hits.length} caso(s) de a11y (div/span onClick sem role / tabIndex positivo / img sem alt) em ${fp}. Use <button>, tabIndex 0/-1, alt em toda <img>. Ver std-accessibility › Anti-patterns.`);
  process.exit(1);
}
process.exit(0);
