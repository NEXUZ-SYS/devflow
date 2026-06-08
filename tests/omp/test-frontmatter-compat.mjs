import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dir, "../fixtures/omp/agent-with-omp-fields.md");

test("parser do repo lê campos canônicos E omp; corpo intacto", () => {
  const { data, body } = parseFrontmatter(readFileSync(FIXTURE, "utf-8"));
  for (const f of ["type", "name", "description", "role", "phases", "skills"]) assert.ok(f in data, `canônico ausente: ${f}`);
  for (const f of ["model", "spawns", "thinking-level", "output"]) assert.ok(f in data, `omp ausente: ${f}`);
  assert.match(body, /Corpo do agente — deve ser preservado intacto\./);
});
