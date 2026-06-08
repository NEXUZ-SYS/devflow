import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";
import { enrichAgentFrontmatter } from "../../scripts/lib/omp-enrich-agents.mjs";
const FILLED = `---\ntype: agent\nname: security-auditor\nrole: specialist\nphases: [R, V]\nstatus: filled\n---\n# Sec\ncorpo filled.\n`;
test("adiciona campos omp; canônicos e corpo intactos (invariante M3)", () => {
  const out = enrichAgentFrontmatter(FILLED, { model: "pi/slow", "thinking-level": "high" });
  const before = parseFrontmatter(FILLED).data, after = parseFrontmatter(out).data;
  assert.equal(after.model, "pi/slow");
  for (const k of ["type", "name", "role", "status"]) assert.equal(JSON.stringify(after[k]), JSON.stringify(before[k]));
  assert.match(parseFrontmatter(out).body, /corpo filled\./);
});
test("idempotente", () => {
  const a = enrichAgentFrontmatter(FILLED, { model: "pi/slow" });
  assert.equal((enrichAgentFrontmatter(a, { model: "pi/slow" }).match(/model: pi\/slow/g) || []).length, 1);
});
test("atualiza valor sem duplicar", () => {
  const a = enrichAgentFrontmatter(FILLED, { model: "default" });
  const b = enrichAgentFrontmatter(a, { model: "pi/slow" });
  assert.ok(b.includes("model: pi/slow") && !b.includes("model: default"));
});
test("valor com newline é rejeitado (M3)", () => {
  assert.throws(() => enrichAgentFrontmatter(FILLED, { model: "x\nstatus: unfilled" }), /valor inválido/);
});
test("CRLF não corrompe", () => {
  const crlf = FILLED.replace(/\n/g, "\r\n");
  assert.match(parseFrontmatter(enrichAgentFrontmatter(crlf, { model: "pi/slow" })).body, /corpo filled\./);
});
