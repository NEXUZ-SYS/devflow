import { test } from "node:test";
import assert from "node:assert/strict";
import { ompEventToPermEvent } from "../../omp/lib/permissions-bridge.mjs";
import { evaluatePermissions } from "../../scripts/lib/permissions-evaluator.mjs";

test("bash → exec(command), shape plano", () => {
  assert.deepEqual(ompEventToPermEvent({ toolName: "bash", input: { command: "rm -rf /tmp" } }), { tool: "Bash", command: "rm -rf /tmp" });
});
test("edit/write/ast_edit → fs(path)", () => {
  assert.equal(ompEventToPermEvent({ toolName: "ast_edit", input: { path: "/p/a.ts" } }).path, "/p/a.ts");
});
test("read → Read(path)", () => {
  const r = ompEventToPermEvent({ toolName: "read", input: { path: "/p/b.ts" } });
  assert.equal(r.tool, "Read"); assert.equal(r.path, "/p/b.ts");
});
test("mcp__* → tool (nome preservado)", () => {
  assert.equal(ompEventToPermEvent({ toolName: "mcp__dotcontext__plan" }).tool, "mcp__dotcontext__plan");
});
test("web_search/browser → net(url)", () => {
  assert.equal(ompEventToPermEvent({ toolName: "browser", input: { url: "http://169.254.169.254/x" } }).url, "http://169.254.169.254/x");
});
test("EXEC DENY: rm -rf /tmp bloqueado pelo evaluator real", async () => {
  const cfg = { spec: "devflow-permissions/v0", evaluationOrder: ["deny","allow","mode","callback"], deny: { exec: ["rm -rf /*"] }, allow: {}, mode: "prompt", callback: { url: null } };
  const d = await evaluatePermissions(ompEventToPermEvent({ toolName: "bash", input: { command: "rm -rf /tmp" } }), cfg);
  assert.equal(d.decision, "deny");
});
test("NET DENY: SSRF metadata bloqueado", async () => {
  const cfg = { spec: "devflow-permissions/v0", evaluationOrder: ["deny","allow","mode","callback"], deny: { net: ["169.254.169.254/*"] }, allow: {}, mode: "prompt", callback: { url: null } };
  const d = await evaluatePermissions(ompEventToPermEvent({ toolName: "browser", input: { url: "169.254.169.254/latest" } }), cfg);
  assert.equal(d.decision, "deny");
});
