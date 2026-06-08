import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { enrichProjectAgents } from "../../scripts/lib/omp-enrich-project-agents.mjs";
test("aplica defaults omp preservando corpo filled", () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-enrich-"));
  mkdirSync(join(dir, ".context/agents"), { recursive: true });
  const f = join(dir, ".context/agents/security-auditor.md");
  writeFileSync(f, `---\ntype: agent\nname: security-auditor\nrole: specialist\nphases: [R, V]\nstatus: filled\n---\n# Sec\ncorpo filled.\n`);
  const changed = enrichProjectAgents(dir);
  assert.ok(changed.includes("security-auditor"));
  const out = readFileSync(f, "utf-8");
  assert.ok(out.includes("model: pi/slow") && out.includes("corpo filled."));
});
test("CLI enriquece e reporta agentes alterados", () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-enrich-cli-"));
  mkdirSync(join(dir, ".context/agents"), { recursive: true });
  const f = join(dir, ".context/agents/code-reviewer.md");
  writeFileSync(f, `---\ntype: agent\nname: code-reviewer\nrole: reviewer\nstatus: filled\n---\n# CR\ncorpo.\n`);
  const script = join(dirname(fileURLToPath(import.meta.url)), "../../scripts/lib/omp-enrich-project-agents.mjs");
  const r = spawnSync(process.execPath, [script, dir], { encoding: "utf-8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /code-reviewer/);
  assert.match(readFileSync(f, "utf-8"), /model: pi\/slow/);
});
