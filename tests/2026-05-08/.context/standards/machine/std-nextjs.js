#!/usr/bin/env node
// .context/standards/machine/std-nextjs.js
// Linter para std-nextjs. Recebe filePath via process.argv[2].
// Saída: stdout 'VIOLATION: <msg>' + exit 1 quando violação detectada.

import { readFileSync } from "node:fs";

const filePath = process.argv[2];
if (!filePath) process.exit(0);

const content = readFileSync(filePath, "utf-8");

// TODO: implement rule check.
// Example pattern:
//   const matches = content.match(/badPattern/g);
//   if (matches) {
//     console.log(`VIOLATION: ${matches.length} instances of badPattern in ${filePath}. Replace with goodPattern.`);
//     process.exit(1);
//   }

process.exit(0);
