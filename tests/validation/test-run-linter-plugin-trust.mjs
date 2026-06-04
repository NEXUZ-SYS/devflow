/**
 * TG3 Parte A — trust-anchor do pluginRoot (R5/S3) no runner.
 * Run: node --test tests/validation/test-run-linter-plugin-trust.mjs
 *
 * verifyPluginRoot exige o marker .claude-plugin/plugin.json. runLintersFor
 * degrada para project-only (sem enforce de default) quando o pluginRoot não é
 * verificado — nunca executa um "linter default" de um dir não-confiável (anti-RCE
 * via CLAUDE_PLUGIN_ROOT envenenado).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLintersFor, verifyPluginRoot } from "../../scripts/lib/run-linter.mjs";

let project, trustedPlugin, fakePlugin;

function buildPlugin(dir, withMarker) {
  if (withMarker) {
    mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(dir, ".claude-plugin/plugin.json"), '{"name":"devflow"}\n');
  }
  const std = join(dir, "assets/standards");
  mkdirSync(join(std, "machine"), { recursive: true });
  writeFileSync(join(std, "std-obs.md"),
    `---\nid: std-obs\ndescription: x\nversion: 1.0.0\napplyTo: ["**/*.{ts,tsx}"]\nenforcement:\n  linter: machine/std-obs.js\n---\n## Princípios\n- x\n`);
  writeFileSync(join(std, "machine/std-obs.js"),
    `import { readFileSync } from "node:fs";\nif (readFileSync(process.argv[2],"utf-8").includes("console.log")) { console.log("VIOLATION: obs"); process.exit(1); }\nprocess.exit(0);\n`);
}

before(() => {
  trustedPlugin = mkdtempSync(join(tmpdir(), "tg3-trusted-"));
  buildPlugin(trustedPlugin, true);   // COM marker
  fakePlugin = mkdtempSync(join(tmpdir(), "tg3-fake-"));
  buildPlugin(fakePlugin, false);     // SEM marker (dir "envenenado")

  project = mkdtempSync(join(tmpdir(), "tg3-proj-"));
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src/x.ts"), 'export const f = () => console.log("x");\n');
});

after(() => {
  for (const d of [project, trustedPlugin, fakePlugin]) if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
});

describe("TG3 — trust-anchor do pluginRoot (S3)", () => {
  it("verifyPluginRoot: true com marker, false sem marker / undefined", () => {
    assert.equal(verifyPluginRoot(trustedPlugin), true);
    assert.equal(verifyPluginRoot(fakePlugin), false);
    assert.equal(verifyPluginRoot(undefined), false);
    assert.equal(verifyPluginRoot("/nao/existe"), false);
  });

  it("pluginRoot VERIFICADO → default enforçado (1 violação)", async () => {
    const res = await runLintersFor({ tool: "Write", path: "src/x.ts" }, project, trustedPlugin);
    assert.equal(res.violations.length, 1, JSON.stringify(res.violations));
    assert.equal(res.violations[0].id, "std-obs");
  });

  it("pluginRoot NÃO verificado (sem marker) → degrada p/ project-only (0 violações)", async () => {
    const res = await runLintersFor({ tool: "Write", path: "src/x.ts" }, project, fakePlugin);
    assert.equal(res.violations.length, 0,
      `dir não-confiável não deve executar 'linter default': ${JSON.stringify(res.violations)}`);
  });
});
