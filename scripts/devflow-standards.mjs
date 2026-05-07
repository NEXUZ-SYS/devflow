#!/usr/bin/env node
// scripts/devflow-standards.mjs — CLI dispatcher for `devflow standards new|verify`.
//
// Usage:
//   devflow standards new <id>          Scaffold .context/standards/std-<id>.md + linter template
//   devflow standards verify             Validate all standards (warnings on weak)
//   devflow standards verify --strict    Exit non-zero if any weak standards found
//   devflow standards verify <id>        Validate a single standard
//
// Per Dependency Policy: pure node:* — uses scripts/lib/{glob,frontmatter,standards-loader}.mjs.

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadStandards } from "./lib/standards-loader.mjs";
import { validateSubset } from "./lib/glob.mjs";

const SCAFFOLD_TEMPLATE = (id) => `---
id: std-${id}
description: <one-line description>
version: 1.0.0
applyTo: ["src/**"]
relatedAdrs: []
enforcement:
  linter: standards/machine/std-${id}.js
---

# Standard: ${id}

## Princípios

<Em prosa, descreva o "porquê" da regra. Standards são para humanos primeiro.>

## Anti-patterns

| Errado | Certo |
|---|---|
| <padrão errado> | <padrão correto + import corretivo> |

## Linter

Ver \`.context/standards/machine/std-${id}.js\`.

## Referência

Ver authoring guide: \`.context/standards/README.md\`.
`;

const LINTER_TEMPLATE = (id) => `#!/usr/bin/env node
// .context/standards/machine/std-${id}.js
// Linter para std-${id}. Recebe filePath via process.argv[2].
// Saída: stdout 'VIOLATION: <msg>' + exit 1 quando violação detectada.

import { readFileSync } from "node:fs";

const filePath = process.argv[2];
if (!filePath) process.exit(0);

const content = readFileSync(filePath, "utf-8");

// TODO: implement rule check.
// Example pattern:
//   const matches = content.match(/badPattern/g);
//   if (matches) {
//     console.log(\`VIOLATION: \${matches.length} instances of badPattern in \${filePath}. Replace with goodPattern.\`);
//     process.exit(1);
//   }

process.exit(0);
`;

async function cmdNew(id, projectRoot) {
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error("Error: id must match /^[a-z][a-z0-9-]*$/");
    process.exit(2);
  }
  const stdsDir = join(projectRoot, ".context", "standards");
  const machineDir = join(stdsDir, "machine");
  await mkdir(machineDir, { recursive: true });

  const stdPath = join(stdsDir, `std-${id}.md`);
  const linterPath = join(machineDir, `std-${id}.js`);

  if (existsSync(stdPath)) {
    console.error(`Error: ${stdPath} already exists`);
    process.exit(1);
  }

  await writeFile(stdPath, SCAFFOLD_TEMPLATE(id));
  if (!existsSync(linterPath)) {
    await writeFile(linterPath, LINTER_TEMPLATE(id));
  }

  console.log(`Created std-${id}:`);
  console.log(`  ${stdPath}`);
  console.log(`  ${linterPath}`);
  console.log("");
  console.log("Next: edit Princípios + Anti-patterns; implement the linter rule check.");
}

async function cmdVerify(targetId, strict, projectRoot) {
  let standards = loadStandards(projectRoot);

  if (targetId) {
    standards = standards.filter(s => s.id === targetId || s.id === `std-${targetId}`);
    if (standards.length === 0) {
      console.error(`No standard found matching: ${targetId}`);
      process.exit(1);
    }
  }

  if (standards.length === 0) {
    console.log("OK: no standards in .context/standards/.");
    return 0;
  }

  let weakCount = 0;
  let invalidCount = 0;

  for (const std of standards) {
    // Validate applyTo subset
    for (const pattern of std.applyTo || []) {
      try {
        validateSubset(pattern);
      } catch (err) {
        console.error(`INVALID ${std.id}: applyTo pattern '${pattern}' — ${err.message}`);
        invalidCount++;
      }
    }
    // Verify linter file exists if declared
    const linter = std.enforcement?.linter;
    if (linter) {
      const linterAbs = resolve(projectRoot, ".context", linter);
      if (!existsSync(linterAbs)) {
        console.error(`INVALID ${std.id}: linter file missing — ${linterAbs}`);
        invalidCount++;
      }
    }
    if (std.weak) {
      console.log(`weak-standard: ${std.id} (no linter, no weakStandardWarning opt-out)`);
      weakCount++;
    }
  }

  console.log("");
  console.log(`Summary: ${standards.length} standards, ${weakCount} weak, ${invalidCount} invalid`);
  if (invalidCount > 0) return 1;
  if (strict && weakCount > 0) {
    console.log("--strict: failing on weak-standards");
    return 1;
  }
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const sub = args[0];

  const projectRoot = process.cwd();

  if (sub === "new") {
    await cmdNew(args[1], projectRoot);
    return;
  }

  if (sub === "verify") {
    const rest = args.slice(1);
    const strict = rest.includes("--strict");
    const targetId = rest.find(a => !a.startsWith("--"));
    const code = await cmdVerify(targetId, strict, projectRoot);
    process.exit(code);
  }

  console.error("Usage: devflow standards <new|verify> [args]");
  console.error("  new <id>              Scaffold std-<id>.md + machine/std-<id>.js");
  console.error("  verify [<id>] [--strict]  Validate standards");
  process.exit(2);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
