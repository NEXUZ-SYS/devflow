// tests/lib/models-config.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readModels } from "../../scripts/lib/models-config.mjs";
import * as cfg from "../../scripts/lib/devflow-config.mjs";

const FULL = `git:
  strategy: branch-flow
models:
  enabled: true   # liga
  session: false
  maxTier: capable
  ledger: true
  overrides:
    agents:
      documentation-writer:
        tier: standard
      code-reviewer:
        tier: ultra
    phases:
      E:
        general-purpose:
          tier: cheap
      Z:
        general-purpose:
          tier: cheap
    session:
      phases:
        E: capable
        C: ceiling
  midRun:
    enabled: true
    failureStreak: 4
  thresholds:
    capability: 0.7
    claimsDone: 2
other: 1
`;

test("ausência do bloco = tudo desligado com defaults (midRun desligado — D19)", () => {
  const m = readModels("git:\n  strategy: x\n");
  assert.equal(m.enabled, false);
  assert.equal(m.session, true);
  assert.equal(m.subagents, true);
  assert.equal(m.ledger, false);
  assert.equal(m.maxTier, null);
  assert.deepEqual(m.midRun, { enabled: false, failureStreak: 3 });
  assert.deepEqual(m.thresholds, { capability: 0.6, claimsDone: 0.8 });
});

test("lê o bloco completo, com comentário inline e validação por entrada", () => {
  const m = readModels(FULL);
  assert.equal(m.enabled, true);
  assert.equal(m.session, false);
  assert.equal(m.maxTier, "capable");
  assert.equal(m.ledger, true);
  assert.deepEqual(m.overrides.agents, { "documentation-writer": "standard" });
  assert.deepEqual(m.overrides.phases, { E: { "general-purpose": "cheap" } });
  assert.deepEqual(m.overrides.session.phases, { E: "capable", C: "ceiling" });
  assert.deepEqual(m.midRun, { enabled: true, failureStreak: 4 });
  assert.equal(m.thresholds.capability, 0.7);
  assert.equal(m.thresholds.claimsDone, 0.8, "fora de [0,1] mantém o default");
});

test("valores inválidos nunca ligam o roteamento nem lançam", () => {
  assert.equal(readModels("models:\n  enabled: yes\n").enabled, false);
  assert.equal(readModels("models:\n  enabled: true\n  maxTier: ultra\n").maxTier, null);
  assert.equal(readModels("models:\n  enabled: true\n  midRun:\n    enabled: sim\n").midRun.enabled, false);
  for (const src of ["models:\n  enabled: *ref\n", "models:\n", null, 42, "models:\n  enabled: true\n" + "x".repeat(300 * 1024)]) {
    assert.equal(typeof readModels(src).enabled, "boolean");
  }
});

test("devflow-config reexporta readModels e expõe read-models no CLI", () => {
  assert.equal(cfg.readModels, readModels);
  const dir = mkdtempSync(join(tmpdir(), "models-cfg-"));
  const p = join(dir, ".devflow.yaml");
  writeFileSync(p, FULL);
  const out = execFileSync("node", ["scripts/lib/devflow-config.mjs", "read-models", p], { encoding: "utf8" });
  assert.equal(JSON.parse(out).maxTier, "capable");
});

test("yaml-block e models-config são puros", () => {
  for (const f of ["yaml-block.mjs", "models-config.mjs"]) {
    const src = readFileSync(new URL(`../../scripts/lib/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /from\s+["']node:/, f);
  }
});

test("models.ids: só tier conhecido com ID do próprio tier", () => {
  const m = readModels(`models:
  enabled: true
  ids:
    standard: claude-sonnet-5-5   # verificado
    cheap: claude-opus-5-5
    ultra: claude-x
    capable: opus
`);
  assert.deepEqual(m.ids, { standard: "claude-sonnet-5-5" });
  assert.deepEqual(readModels("models:\n  enabled: true\n").ids, {});
  assert.deepEqual(readModels("").ids, {});
});

test("routes.json traz IDs candidatos válidos para os quatro tiers", async () => {
  const { isTierId } = await import("../../scripts/lib/model-routing.mjs");
  const t = JSON.parse(readFileSync(new URL("../../assets/model-routing/routes.json", import.meta.url), "utf8"));
  for (const tier of ["cheap", "standard", "capable", "top"]) assert.ok(isTierId(t.ids?.[tier], tier), tier);
});
