import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHookOutput } from "../../omp/lib/parse-hook-output.mjs";

test("additionalContext (session-start/post-compact)", () => {
  const r = parseHookOutput(JSON.stringify({ hookSpecificOutput: { additionalContext: "CTX" } }));
  assert.deepEqual(r, { contextToInject: "CTX", block: false, reason: null });
});
test("permissionDecision deny → block (git-guard C1)", () => {
  const r = parseHookOutput(JSON.stringify({ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "branch protegida" } }));
  assert.equal(r.block, true);
  assert.equal(r.reason, "branch protegida");
  assert.equal(r.contextToInject, null);
});
test("permissionDecision ask → block conservador", () => {
  assert.equal(parseHookOutput(JSON.stringify({ hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "?" } })).block, true);
});
test("allow/vazio → prossegue sem contexto", () => {
  assert.deepEqual(parseHookOutput(JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } })), { contextToInject: null, block: false, reason: null });
  assert.deepEqual(parseHookOutput(""), { contextToInject: null, block: false, reason: null });
});
test("additional_context (snake_case) também aceito", () => {
  assert.equal(parseHookOutput(JSON.stringify({ additional_context: "C2" })).contextToInject, "C2");
});
test("texto puro não-JSON → injeta como contexto (fallback)", () => {
  assert.equal(parseHookOutput("texto cru de hook legado").contextToInject, "texto cru de hook legado");
});
test("stdout MISTO: knowledge raw + deny JSON → block (deny vence; não injeta blob)", () => {
  const mixed = `<KNOWLEDGE_ONDEMAND>\nVision do produto\n</KNOWLEDGE_ONDEMAND>\n{\n "hookSpecificOutput": { "permissionDecision": "deny", "permissionDecisionReason": "branch protegida" }\n}`;
  const r = parseHookOutput(mixed);
  assert.equal(r.block, true);
  assert.equal(r.reason, "branch protegida");
  assert.ok(!String(r.contextToInject ?? "").includes("permissionDecision"));
});
test("stdout MISTO: knowledge raw + additionalContext JSON → injeta ambos", () => {
  const mixed = `<KNOWLEDGE_ONDEMAND>\nPersona X\n</KNOWLEDGE_ONDEMAND>\n{ "hookSpecificOutput": { "additionalContext": "STD-idx" } }`;
  const r = parseHookOutput(mixed);
  assert.equal(r.block, false);
  assert.match(r.contextToInject, /Persona X/);
  assert.match(r.contextToInject, /STD-idx/);
});
