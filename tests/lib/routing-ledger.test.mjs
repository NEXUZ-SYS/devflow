// tests/lib/routing-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEntry, LEDGER_KEYS, projectKey, ledgerDirFrom } from "../../scripts/lib/routing-ledger.mjs";
import { aggregate, renderMarkdown } from "../../scripts/lib/routing-report.mjs";

test("buildEntry: só chaves da allowlist, nunca conteúdo", () => {
  const e = buildEntry({
    ts: "2026-10-08T00:00:00.000Z", scope: "subagent", agentType: "devflow:architect", tier: "capable",
    prompt: "segredo", answer: "resposta", errorText: "stack", usage: { input_tokens: 10, output_tokens: "x", note: "y" },
  });
  for (const k of Object.keys(e)) assert.ok(LEDGER_KEYS.includes(k), k);
  assert.deepEqual(e.usage, { input_tokens: 10 });
  assert.equal(JSON.stringify(e).includes("segredo"), false);
});

test("buildEntry: valor livre em campo permitido é descartado (segurança 6)", () => {
  const e = buildEntry({
    agentType: "SEGREDO=sk-ant-abc texto livre", skill: "a".repeat(200), tier: "ultra", phase: "Z",
    source: "qualquer", adapter: "x", escalation: { at: "agora", from: "cheap", to: "SEGREDO", action: "explode" },
  });
  assert.equal(e.agentType, undefined);
  assert.equal(e.skill, undefined);
  assert.equal(e.tier, undefined);
  assert.equal(e.phase, undefined);
  assert.equal(e.source, undefined);
  assert.equal(e.adapter, undefined);
  assert.deepEqual(e.escalation, { from: "cheap" });
});

test("buildEntry aceita ids e nomes legítimos", () => {
  const e = buildEntry({ agentType: "devflow:code-reviewer", model: "claude-opus-5-5", skill: "superpowers:writing-plans", sessionId: "s1a2", agentId: "a42ecfef7cb453ca1", phase: "E", effort: "high", source: "plan", adapter: "mod", scope: "session" });
  assert.equal(Object.keys(e).length, 10);
});

test("projectKey é determinístico, hex de 16 e distingue caminhos", () => {
  assert.equal(projectKey("/a/b"), projectKey("/a/b"));
  assert.notEqual(projectKey("/a/b"), projectKey("/a/c"));
  assert.match(projectKey("/a/b"), /^[0-9a-f]{16}$/);
});

test("ledgerDirFrom prefere XDG_DATA_HOME absoluto e cai para ~/.local/share", () => {
  assert.equal(ledgerDirFrom({ xdgDataHome: "/x", home: "/h", cwd: "/p" }), `/x/devflow-model-routing/${projectKey("/p")}`);
  assert.equal(ledgerDirFrom({ xdgDataHome: "rel", home: "/h", cwd: "/p" }), `/h/.local/share/devflow-model-routing/${projectKey("/p")}`);
});

test("aggregate soma por modelo × agente e conta escaladas e trocas", () => {
  const u = (i, o) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
  const agg = aggregate([
    { scope: "subagent", agentType: "general-purpose", model: "sonnet", usage: u(10, 5) },
    { scope: "subagent", agentType: "general-purpose", model: "sonnet", usage: u(1, 1) },
    { scope: "subagent", agentType: "general-purpose", escalation: { at: "midRun", action: "escalate" } },
    { scope: "session", phase: "E", model: "sonnet", usage: u(100, 10), cacheReadRatio: 0.04, switched: true },
  ]);
  assert.equal(agg.subagents.get("general-purpose").get("sonnet").output_tokens, 6);
  assert.equal(agg.subagents.get("general-purpose").get("sonnet").n, 2);
  assert.equal(agg.midRunSwitches, 1);
  assert.deepEqual(agg.phaseSwitches, [{ phase: "E", cacheReadRatio: 0.04 }]);
  assert.match(renderMarkdown(agg), /general-purpose/);
});

test("aggregate não polui o protótipo com agentType hostil (segurança 8)", () => {
  aggregate([{ scope: "subagent", agentType: "__proto__", model: "polluted", usage: { input_tokens: 1 } }]);
  assert.equal(({}).polluted, undefined);
});

test("libs são puras", () => {
  for (const f of ["routing-ledger.mjs", "routing-report.mjs"]) {
    const src = readFileSync(new URL(`../../scripts/lib/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /from\s+["']node:/, f);
  }
});
