// tests/lib/routing-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEntry, LEDGER_KEYS, projectKey, ledgerDirFrom } from "../../scripts/lib/routing-ledger.mjs";
import { aggregate, renderMarkdown, beforeAfter, renderBeforeAfter } from "../../scripts/lib/routing-report.mjs";

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

const U = (i, o) => ({ input_tokens: i, output_tokens: o });
const T0 = "2026-10-08T12:00:00.000Z";
const msg = (iso, scope, model, i, o) => ({ ts: Date.parse(iso), scope, model, usage: U(i, o) });

test("beforeAfter: corte é o menor ts do ledger; janelas e percentuais por modelo", () => {
  const ledger = [
    { ts: "2026-10-08T13:00:00.000Z", scope: "subagent", model: "sonnet", usage: U(10, 30) },
    { ts: T0, scope: "subagent", model: "haiku", usage: U(5, 10) },
    { ts: T0, scope: "session", phase: "E", model: "sonnet", usage: U(7, 4) },
  ];
  const msgs = [
    msg("2026-10-08T11:00:00.000Z", "subagent", "claude-opus-5", 100, 60),
    msg("2026-10-08T11:30:00.000Z", "subagent", "claude-sonnet-5", 50, 40),
    msg("2026-10-08T11:59:59.000Z", "session", "claude-opus-5", 9, 9),
    msg("2026-10-08T14:00:00.000Z", "subagent", "claude-opus-5", 999, 999), // ignorada: ledger tem usage
  ];
  const ba = beforeAfter(ledger, msgs);
  assert.equal(ba.cut, Date.parse(T0));
  assert.equal(ba.subagent.before.get("claude-opus-5").output_tokens, 60);
  assert.equal(ba.subagent.after.get("sonnet").output_tokens, 30);
  assert.equal(ba.subagent.after.has("claude-opus-5"), false);
  assert.equal(ba.session.before.get("claude-opus-5").input_tokens, 9);
  assert.equal(ba.session.after.get("sonnet").input_tokens, 7);
  const md = renderBeforeAfter(ba);
  assert.match(md, /## Antes × depois/);
  assert.match(md, /2026-10-08T12:00:00\.000Z/);
  assert.match(md, /\| antes \| claude-opus-5 \| 0\.1k \| 0\.1k \| 60\.0% \|/);
  assert.match(md, /\| depois \| sonnet \| 0\.0k \| 0\.0k \| 75\.0% \|/);
});

test("beforeAfter: sem usage no ledger, transcripts >= corte entram no depois (clássico/omp)", () => {
  const ledger = [{ ts: T0, scope: "subagent", agentType: "x", escalation: { at: "retry", action: "keep" } }];
  const ba = beforeAfter(ledger, [msg("2026-10-08T10:00:00.000Z", "subagent", "claude-a", 1, 2), msg(T0, "subagent", "claude-b", 3, 8)]);
  assert.equal(ba.subagent.before.get("claude-a").output_tokens, 2);
  assert.equal(ba.subagent.after.get("claude-b").output_tokens, 8);
});

test("beforeAfter: ledger vazio não tem comparativo e a seção diz isso", () => {
  const ba = beforeAfter([], [msg(T0, "subagent", "claude-a", 1, 2)]);
  assert.equal(ba.cut, null);
  assert.match(renderBeforeAfter(ba), /sem comparativo/);
  assert.doesNotMatch(renderBeforeAfter(ba), /\| antes \|/);
});

test("beforeAfter: modelo hostil não polui o protótipo; mensagem sem timestamp válido é ignorada", () => {
  const ba = beforeAfter([{ ts: T0, scope: "subagent", model: "__proto__", usage: U(1, 1) }], [{ ts: NaN, scope: "subagent", model: "claude-z", usage: U(1, 1) }]);
  assert.equal(({}).input_tokens, undefined);
  assert.equal(ba.subagent.before.size, 0);
});

test("renderMarkdown inclui a seção Antes × depois quando recebe o comparativo", () => {
  assert.match(renderMarkdown(aggregate([]), beforeAfter([], [])), /## Antes × depois/);
  assert.doesNotMatch(renderMarkdown(aggregate([])), /Antes × depois/);
});

test("libs são puras", () => {
  for (const f of ["routing-ledger.mjs", "routing-report.mjs"]) {
    const src = readFileSync(new URL(`../../scripts/lib/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /from\s+["']node:/, f);
  }
});
