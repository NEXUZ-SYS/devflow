/**
 * Phase 7 (Task 7.1) — E2E: enforcement dos linters ENRIQUECIDOS via hook real,
 * SEM eject. Run: node --test tests/integration/test-e2e-enriched-linters-hook.mjs
 *
 * Invoca hooks/post-tool-use de verdade (spawnSync bash), num projeto-tmp SEM
 * .context/standards — depende 100% dos defaults bundlados do plugin. O hook
 * roda com cwd=project, então o relative file_path resolve dentro do projeto-tmp
 * e os linters default enriquecidos (data-modeling, migration, schemas,
 * observability, naming-conventions) disparam.
 *
 * Asserts por SUBSTRING (assert.match com /std-<id>/) para tolerar mais de um
 * standard aplicável ao mesmo arquivo.
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

function runHook(relPath) {
  const event = JSON.stringify({ tool_name: "Write", tool_input: { file_path: relPath }, cwd: project });
  return spawnSync("bash", [HOOK], { cwd: project, input: event, encoding: "utf-8", env: { ...process.env } });
}

before(() => {
  project = mkdtempSync(join(tmpdir(), "p7-enriched-"));
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(project, "db", "migrations"), { recursive: true });
  // Projeto SEM .context/standards — depende 100% dos defaults do plugin.
});

after(() => { if (project && existsSync(project)) rmSync(project, { recursive: true, force: true }); });

const CASES = [
  { rel: "db/migrations/001.sql", body: "CREATE TABLE t (a TIMESTAMP);\n", std: /std-data-modeling/ },
  { rel: "db/migrations/002.sql", body: "CREATE INDEX i ON t(c);\n", std: /std-migration/ },
  { rel: "src/s.ts", body: "export const S = z.object({ p: z.any() });\n", std: /std-schemas/ },
  { rel: "src/o.ts", body: 'export function f(){ console.log("x"); }\n', std: /std-observability/ },
  { rel: "src/n.ts", body: "enum E { A, B }\n", std: /std-naming-conventions/ },
];

describe("Phase 7 — E2E linters enriquecidos via hook real (projeto sem eject)", () => {
  for (const { rel, body, std } of CASES) {
    it(`${rel} → VIOLATION ${std.source}`, () => {
      writeFileSync(join(project, rel), body);
      const r = runHook(rel);
      assert.equal(r.status, 0, `hook não deve falhar: ${r.stderr}`);
      assert.match(r.stdout, /VIOLATION/, `esperava VIOLATION no output do hook: ${r.stdout}`);
      assert.match(r.stdout, std, `esperava ${std.source}: ${r.stdout}`);
    });
  }

  it("src/ok.ts conforme → nenhum VIOLATION", () => {
    writeFileSync(join(project, "src/ok.ts"), "export const x = 1;\n");
    const r = runHook("src/ok.ts");
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /VIOLATION/, `conforme não deve violar: ${r.stdout}`);
  });
});
