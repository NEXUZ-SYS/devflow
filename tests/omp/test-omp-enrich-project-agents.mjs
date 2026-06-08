import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
