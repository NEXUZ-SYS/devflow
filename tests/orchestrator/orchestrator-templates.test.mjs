// Run: node --test tests/orchestrator/orchestrator-templates.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aoRulesContent, agentOrchestratorYaml } from "../../scripts/lib/orchestrator-templates.mjs";

describe("aoRulesContent", () => {
  it("contém guardrails de git e o trilho DevFlow", () => {
    const r = aoRulesContent();
    assert.match(r, /\/devflow scale:SMALL/);
    assert.match(r, /NUNCA.*push/i);
    assert.match(r, /NUNCA.*merge/i);
    assert.match(r, /--force/);
  });
});

describe("agentOrchestratorYaml", () => {
  const y = agentOrchestratorYaml({ projectId: "meu-app", repo: "org/meu-app", path: "/home/u/meu-app", port: 3100, sessionPrefix: "app" });
  it("permissionless + agentRulesFile", () => {
    assert.match(y, /permissions: permissionless/);
    assert.match(y, /agentRulesFile: \.ao-rules/);
  });
  it("approved-and-green NUNCA auto (merge manual)", () => {
    assert.match(y, /approved-and-green:\s*\n\s*auto: false/);
  });
  it("injeta projectId, repo, path, port", () => {
    assert.match(y, /meu-app:/);
    assert.match(y, /repo: "org\/meu-app"/);
    assert.match(y, /path: "\/home\/u\/meu-app"/);
    assert.match(y, /port: 3100/);
  });
});
