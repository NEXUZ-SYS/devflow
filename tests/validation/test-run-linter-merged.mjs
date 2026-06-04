/**
 * TG2 — runLintersFor usa loadStandardsMerged + reconciliação readStandardsFromDir.
 * Run: node --test tests/validation/test-run-linter-merged.mjs
 *
 * Prova, no nível do RUNNER (sem hook/CLI ainda — isso é TG3), que um default do
 * plugin com linter bundlado é enforçado num projeto SEM eject, e que o override
 * por id (projeto vence) funciona. Também fixa R11/A1: readStandardsFromDir valida
 * applyTo (validateSubset) como loadStandards — globs inválidos são descartados.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLintersFor } from "../../scripts/lib/run-linter.mjs";
import { loadStandardsMerged } from "../../scripts/lib/standards-loader.mjs";

let project, plugin;

const LINTER = (marker, msg) => `import { readFileSync } from "node:fs";
const c = readFileSync(process.argv[2], "utf-8");
if (c.includes(${JSON.stringify(marker)})) { console.log("VIOLATION: " + ${JSON.stringify(msg)}); process.exit(1); }
process.exit(0);
`;

const STD = (id, linterRel, extra = "") => `---
id: ${id}
description: teste
version: 1.0.0
applyTo: ["**/*.{ts,tsx}"]
enforcement:
  linter: ${linterRel}
${extra}---
## Princípios
- x
`;

before(() => {
  // Plugin fake: 1 default (std-obs) com linter bundlado que pega "console.log".
  plugin = mkdtempSync(join(tmpdir(), "tg2-plugin-"));
  const pStd = join(plugin, "assets/standards");
  mkdirSync(join(pStd, "machine"), { recursive: true });
  writeFileSync(join(pStd, "std-obs.md"), STD("std-obs", "machine/std-obs.js"));
  writeFileSync(join(pStd, "machine/std-obs.js"), LINTER("console.log", "default-obs"));
  // Default com applyTo INVÁLIDO (negação extglob) — deve ser descartado (R11).
  writeFileSync(join(pStd, "std-bad.md"),
    `---\nid: std-bad\ndescription: x\nversion: 1.0.0\napplyTo: ["!(foo).ts"]\nenforcement:\n  linter: null\n---\n## Princípios\n- x\n`);

  // Projeto fake SEM standards próprios, com um arquivo violador.
  project = mkdtempSync(join(tmpdir(), "tg2-proj-"));
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src/x.ts"), 'export const f = () => console.log("x");\n');
});

after(() => {
  for (const d of [project, plugin]) if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
});

describe("TG2 — enforcement de default via runner (loadStandardsMerged)", () => {
  it("AC1: projeto SEM eject + default com linter bundlado → 1 violação (origin default)", async () => {
    const res = await runLintersFor({ tool: "Write", path: "src/x.ts" }, project, plugin);
    assert.equal(res.violations.length, 1, `esperava 1, veio ${JSON.stringify(res.violations)}`);
    assert.equal(res.violations[0].id, "std-obs");
    assert.match(res.violations[0].msg, /default-obs/);
    assert.equal(res.rejected.length, 0, `SI-4 rejeitou: ${JSON.stringify(res.rejected)}`);
  });

  it("AC2: project override por id vence (linter do projeto roda, não o default)", async () => {
    // Projeto ejeta std-obs com um linter próprio que pega outro marcador.
    const projMachine = join(project, ".context/engineering/standards/machine");
    mkdirSync(projMachine, { recursive: true });
    writeFileSync(join(project, ".context/engineering/standards/std-obs.md"),
      STD("std-obs", "engineering/standards/machine/std-obs.js"));
    writeFileSync(join(projMachine, "std-obs.js"), LINTER("PROJ_MARK", "project-obs"));
    // arquivo passa a conter o marcador do projeto, não console.log
    writeFileSync(join(project, "src/x.ts"), "export const v = 'PROJ_MARK';\n");

    const res = await runLintersFor({ tool: "Write", path: "src/x.ts" }, project, plugin);
    assert.equal(res.violations.length, 1, JSON.stringify(res.violations));
    assert.match(res.violations[0].msg, /project-obs/, "linter do PROJETO deve ter rodado (override)");
  });

  it("AC3 (R11): default com applyTo inválido é descartado por loadStandardsMerged", () => {
    const merged = loadStandardsMerged(project, plugin);
    assert.ok(!merged.some(s => s.id === "std-bad"), "std-bad (applyTo inválido) não deve ser carregado");
    assert.ok(merged.some(s => s.id === "std-obs"), "std-obs (válido) deve ser carregado");
  });
});
