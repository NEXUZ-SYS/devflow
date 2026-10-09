import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rubricPrompt, parseAnswers, combine } from "../../scripts/lib/escalation.mjs";
import { TIERS } from "../../scripts/lib/model-routing.mjs";

const TH = { capability: 0.6, claimsDone: 0.8 };
const A = (o) => ({ failure_is_capability: 0.9, claims_done_with_evidence: 0.1, is_stuck: 0.5, needed_tier: "standard", ...o });
const ctx = (o) => ({ current: "cheap", ceiling: "capable", maxTier: null, signalRed: true, midRun: false, thresholds: TH, ...o });

test("rubricPrompt redige e-mail, trunca e pede JSON com as 4 chaves", () => {
  const report = "email a@b.com " + "x".repeat(20000);
  const p = rubricPrompt({ agentType: "general-purpose", tier: "cheap", report, midRun: false });
  assert.doesNotMatch(p, /a@b\.com/);
  assert.ok(p.length < 9500, `prompt grande demais: ${p.length}`);
  for (const k of ["failure_is_capability", "claims_done_with_evidence", "is_stuck", "needed_tier"]) assert.match(p, new RegExp(k));
});

test("rubricPrompt corta antes de redigir: relatório de 1 MB termina rápido (segurança 7)", () => {
  const t0 = Date.now();
  rubricPrompt({ agentType: "x", tier: "cheap", report: "_".repeat(1024 * 1024), midRun: false });
  assert.ok(Date.now() - t0 < 2000, `demorou ${Date.now() - t0} ms`);
});

test("parseAnswers aceita JSON cercado por texto e cerca de código", () => {
  const fence = "`".repeat(3); // cerca montada: três crases literais quebrariam o markdown do plano
  const a = parseAnswers(`ok:\n${fence}json\n{"failure_is_capability":0.7,"claims_done_with_evidence":0,"is_stuck":1,"needed_tier":"capable"}\n${fence}`);
  assert.deepEqual(a, { failure_is_capability: 0.7, claims_done_with_evidence: 0, is_stuck: 1, needed_tier: "capable" });
});

test("parseAnswers recusa números fora de [0,1], tier inválido e lixo", () => {
  for (const t of [
    '{"failure_is_capability":1.5,"claims_done_with_evidence":0,"is_stuck":0,"needed_tier":"cheap"}',
    '{"failure_is_capability":0.5,"claims_done_with_evidence":0,"is_stuck":0,"needed_tier":"ultra"}',
    '{"failure_is_capability":"0.5"}',
    "nada aqui",
    "",
    undefined,
  ]) assert.equal(parseAnswers(t), null, String(t));
});

test("combine — tabela da spec §6.2 (entre tentativas)", () => {
  assert.equal(combine(null, ctx()).action, "keep");
  assert.equal(combine(A({ claims_done_with_evidence: 0.9 }), ctx()).action, "human");
  assert.equal(combine(A({ failure_is_capability: 0.3 }), ctx()).action, "human");
  assert.equal(combine(A(), ctx({ current: "capable" })).action, "human");
  const e = combine(A({ needed_tier: "top" }), ctx());
  assert.deepEqual([e.action, e.tier], ["escalate", "capable"]);
  assert.equal(combine(A({ needed_tier: "cheap" }), ctx()).tier, "standard", "sobe ao menos um degrau");
  assert.equal(combine(A({ needed_tier: "top" }), ctx({ maxTier: "standard" })).tier, "standard");
});

test("combine — no meio da execução, 'human' e teto viram 'keep'", () => {
  assert.equal(combine(A({ failure_is_capability: 0.1 }), ctx({ midRun: true })).action, "keep");
  assert.equal(combine(A(), ctx({ midRun: true, current: "capable" })).action, "keep");
  assert.equal(combine(A({ claims_done_with_evidence: 0.95 }), ctx({ midRun: true })).action, "escalate", "claimsDone não vale no meio");
});

test("propriedade: nenhuma resposta manipulada escala acima do teto ou do maxTier", () => {
  const nums = [0, 0.59, 0.6, 1];
  for (const current of TIERS) for (const ceiling of TIERS) for (const maxTier of [null, ...TIERS]) for (const needed of TIERS)
    for (const cap of nums) for (const midRun of [false, true]) {
      const d = combine(A({ needed_tier: needed, failure_is_capability: cap }), ctx({ current, ceiling, maxTier, midRun }));
      if (d.action !== "escalate") continue;
      assert.ok(TIERS.indexOf(d.tier) <= TIERS.indexOf(ceiling), `${current}/${ceiling}/${needed} → ${d.tier}`);
      if (maxTier) assert.ok(TIERS.indexOf(d.tier) <= TIERS.indexOf(maxTier));
      assert.ok(TIERS.indexOf(d.tier) > TIERS.indexOf(current), "escalada sempre sobe");
    }
});

test("escalation.mjs é puro", () => {
  const src = readFileSync(new URL("../../scripts/lib/escalation.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\s+["']node:/);
});
