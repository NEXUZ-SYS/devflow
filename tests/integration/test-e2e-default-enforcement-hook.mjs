/**
 * TG8 — E2E: enforcement de default SEM eject, pelo hook PostToolUse REAL.
 * Run: node --test tests/integration/test-e2e-default-enforcement-hook.mjs
 *
 * Invoca o script bash hooks/post-tool-use de verdade, com cwd num projeto-tmp
 * SEM nenhum standard próprio (zero eject). O hook deriva PLUGIN_ROOT do seu
 * próprio caminho (= REPO, que tem .claude-plugin/plugin.json + os linters
 * bundlados), passa --plugin ao CLI e o runner enforça o default std-security.
 *
 *   AC1  arquivo com dangerouslySetInnerHTML → o hook injeta VIOLATION std-security
 *   AC2  arquivo conforme → nenhum VIOLATION
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../..");
const HOOK = join(REPO, "hooks/post-tool-use");

let project;

function runHook(filePath) {
  const event = JSON.stringify({ tool_name: "Write", tool_input: { file_path: filePath }, cwd: project });
  return spawnSync("bash", [HOOK], { cwd: project, input: event, encoding: "utf-8", env: { ...process.env } });
}

before(() => {
  project = mkdtempSync(join(tmpdir(), "tg8-noeject-"));
  mkdirSync(join(project, "src"), { recursive: true });
  // Projeto SEM .context/standards — depende 100% dos defaults do plugin.
});

after(() => { if (project && existsSync(project)) rmSync(project, { recursive: true, force: true }); });

describe("TG8 — E2E default enforcement pelo hook real (projeto sem eject)", () => {
  it("AC1: dangerouslySetInnerHTML → hook injeta VIOLATION std-security", () => {
    writeFileSync(join(project, "src/bad.tsx"),
      "export const D = () => <div dangerouslySetInnerHTML={{ __html: x }} />;\n");
    const r = runHook("src/bad.tsx");
    assert.equal(r.status, 0, `hook não deve falhar: ${r.stderr}`);
    assert.match(r.stdout, /VIOLATION/, `esperava VIOLATION no output do hook: ${r.stdout}`);
    assert.match(r.stdout, /std-security/, `esperava std-security: ${r.stdout}`);
  });

  it("AC2: arquivo conforme → nenhum VIOLATION", () => {
    writeFileSync(join(project, "src/ok.tsx"), "export const D = () => <div>{x}</div>;\n");
    const r = runHook("src/ok.tsx");
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /VIOLATION/, `conforme não deve violar: ${r.stdout}`);
  });
});
