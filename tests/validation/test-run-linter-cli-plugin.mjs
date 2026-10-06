/**
 * TG3 Partes B+C — CLI repassa --plugin; hook relaxa o gate e passa --plugin.
 * Run: node --test tests/validation/test-run-linter-cli-plugin.mjs
 *
 * B (R2): run-linter-cli.mjs aceita --plugin=<path> (preferido) e env
 *   CLAUDE_PLUGIN_ROOT (fallback), repassando ao runner → default enforçado.
 * C (R1/S8): hooks/post-tool-use NÃO gateia mais só em .context/standards e
 *   passa --plugin="${PLUGIN_ROOT}" como token argv distinto (SI-1 preservado).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../..");
const CLI = join(REPO, "scripts/lib/run-linter-cli.mjs");
const HOOK = join(REPO, "hooks/post-tool-use");

let project, plugin;

before(() => {
  plugin = mkdtempSync(join(tmpdir(), "tg3cli-plugin-"));
  mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
  writeFileSync(join(plugin, ".claude-plugin/plugin.json"), '{"name":"devflow"}\n');
  const std = join(plugin, "assets/standards");
  mkdirSync(join(std, "machine"), { recursive: true });
  writeFileSync(join(std, "std-obs.md"),
    `---\nid: std-obs\ndescription: x\nversion: 1.0.0\napplyTo: ["**/*.{ts,tsx}"]\nenforcement:\n  linter: machine/std-obs.js\n---\n## Princípios\n- x\n`);
  writeFileSync(join(std, "machine/std-obs.js"),
    `import { readFileSync } from "node:fs";\nif (readFileSync(process.argv[2],"utf-8").includes("console.log")) { console.log("VIOLATION: obs"); process.exit(1); }\nprocess.exit(0);\n`);

  project = mkdtempSync(join(tmpdir(), "tg3cli-proj-"));
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src/x.ts"), 'export const f = () => console.log("x");\n');
});

after(() => {
  for (const d of [project, plugin]) if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
});

function runCli(args, env) {
  return spawnSync("node", [CLI, ...args], {
    input: '{"tool":"Write","path":"src/x.ts"}',
    cwd: project,
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
}

describe("TG3 — CLI repassa pluginRoot (B)", () => {
  it("--plugin=<verificado> → default enforçado (CLI emite VIOLATION)", () => {
    const r = runCli([`--plugin=${plugin}`], { CLAUDE_PLUGIN_ROOT: "" });
    assert.match(r.stdout, /std-obs|VIOLATION/, `esperava violação no stdout: ${r.stdout}`);
  });

  it("env CLAUDE_PLUGIN_ROOT como fallback → default enforçado", () => {
    const r = runCli([], { CLAUDE_PLUGIN_ROOT: plugin });
    assert.match(r.stdout, /std-obs|VIOLATION/, `esperava violação via env: ${r.stdout}`);
  });

  it("sem --plugin e sem env → project-only (sem violação de default)", () => {
    const r = runCli([], { CLAUDE_PLUGIN_ROOT: "" });
    assert.doesNotMatch(r.stdout, /std-obs/, `sem pluginRoot não deve enforçar default: ${r.stdout}`);
  });
});

describe("TG3 — hook wiring (C: R1 gate + S8 argv)", () => {
  const hook = readFileSync(HOOK, "utf-8");

  // T14 (D5/D9): o bloco do linter do post-tool-use passou a chamar standards-hook-cli
  // --mode=async (mesmo engine do hook síncrono). As duas garantias continuam: sem gate de
  // .context/standards (R1) e raiz do plugin que não vem do ambiente (S8 → D5).
  const linterBlock = (hook.match(/LINTER_OUTPUT=[\s\S]*?\nfi\n/) || [""])[0];

  it("R1: o gate do LINTER não exige .context/standards", () => {
    assert.ok(linterBlock, "bloco do LINTER_OUTPUT não encontrado no hook");
    assert.doesNotMatch(hook, /EDITED_PATH"\s*\]\s*&&\s*\[\s*-d\s*"\$\{PWD\}\/\.context\/standards"/,
      "o gate do linter [ -n EDITED_PATH ] && [ -d .context/standards ] não pode voltar");
    assert.doesNotMatch(linterBlock, /\.context\/standards/, "o bloco do linter não pode depender de .context/standards");
    assert.match(hook, /if \[ "\$TOOL_NAME" = "Edit" \] \|\| \[ "\$TOOL_NAME" = "Write" \]; then\n(?:\s*#.*\n)*\s*LINTER_OUTPUT=/,
      "o linter roda para todo Edit/Write, sem gate adicional");
  });

  it("S8/D5: o hook chama o CLI do engine por argv, com a raiz do próprio hook e sem env", () => {
    assert.match(linterBlock, /node "\$\{PLUGIN_ROOT\}\/scripts\/lib\/standards-hook-cli\.mjs" --mode=async/,
      "o hook deve chamar standards-hook-cli.mjs pelo PLUGIN_ROOT derivado do próprio caminho, modo async");
    assert.doesNotMatch(linterBlock, /CLAUDE_PLUGIN_ROOT/, "a raiz do plugin não pode vir do env (D5)");
  });
});
