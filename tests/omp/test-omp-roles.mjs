import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseYaml } from "../../scripts/lib/frontmatter.mjs";
test("parseia roles e defaults por agente (parser reusado, não regex frágil)", () => {
  const data = parseYaml(readFileSync("omp/omp-roles.yaml", "utf-8"));
  assert.equal(data.activities.brainstorming, "pi/plan");
  assert.equal(data.activities.fanout, "pi/smol");
  assert.equal(data.agent_role_defaults["security-auditor"].model, "pi/slow");
});
