// Testes para a lib orchestrator-config.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePluginUserScope, orchestratorBlock, shouldParallelize } from "../../scripts/lib/orchestrator-config.mjs";

describe("parsePluginUserScope", () => {
  it("false quando só há project-scope", () => {
    const out = "  ❯ devflow@NEXUZ-SYS\n    Scope: project\n    Status: ✔ enabled\n";
    assert.equal(parsePluginUserScope(out, "devflow@NEXUZ-SYS"), false);
  });
  it("true quando há uma entrada user-scope (após várias project)", () => {
    const out =
      "  ❯ devflow@NEXUZ-SYS\n    Scope: project\n" +
      "  ❯ devflow@NEXUZ-SYS\n    Scope: user\n    Status: ✔ enabled\n";
    assert.equal(parsePluginUserScope(out, "devflow@NEXUZ-SYS"), true);
  });
  it("true quando só há user-scope", () => {
    const out = "  ❯ superpowers@claude-plugins-official\n    Scope: user\n";
    assert.equal(parsePluginUserScope(out, "superpowers@"), true);
  });
  it("false para saída vazia ou plugin ausente", () => {
    assert.equal(parsePluginUserScope("", "devflow@NEXUZ-SYS"), false);
    assert.equal(parsePluginUserScope("  ❯ outro@x\n    Scope: user\n", "devflow@NEXUZ-SYS"), false);
  });
});

describe("orchestratorBlock", () => {
  it("usa os defaults (mode=suggest, scales=[LARGE], width=4)", () => {
    const b = orchestratorBlock();
    assert.match(b, /^orchestrator:/m);
    assert.match(b, /enabled: true/);
    assert.match(b, /provider: ao/);
    assert.match(b, /mode: suggest/);
    assert.match(b, /scales: \[LARGE\]/);
    assert.match(b, /minIndependentStories: 3/);
    assert.match(b, /maxWaveWidth: 4/);
  });
  it("respeita overrides", () => {
    const b = orchestratorBlock({ mode: "auto", scales: ["MEDIUM", "LARGE"], maxWaveWidth: 6 });
    assert.match(b, /mode: auto/);
    assert.match(b, /scales: \[MEDIUM, LARGE\]/);
    assert.match(b, /maxWaveWidth: 6/);
  });
  it("bloco mínimo quando enabled:false", () => {
    const b = orchestratorBlock({ enabled: false });
    assert.match(b, /enabled: false/);
    assert.doesNotMatch(b, /maxWaveWidth/);
  });
});

describe("shouldParallelize", () => {
  const base = { orchestrator: { enabled: true, mode: "suggest", trigger: { scales: ["LARGE"], minIndependentStories: 3 } } };
  it("sequential quando orchestrator ausente/disabled", () => {
    assert.equal(shouldParallelize({ config: {}, scale: "LARGE", independentCount: 5, aoAvailable: true }).decision, "sequential");
    assert.equal(shouldParallelize({ config: { orchestrator: { enabled: false } }, scale: "LARGE", independentCount: 5, aoAvailable: true }).decision, "sequential");
  });
  it("sequential quando AO indisponível (fallback)", () => {
    assert.equal(shouldParallelize({ config: base, scale: "LARGE", independentCount: 5, aoAvailable: false }).decision, "sequential");
  });
  it("sequential quando escala fora de trigger.scales", () => {
    assert.equal(shouldParallelize({ config: base, scale: "MEDIUM", independentCount: 5, aoAvailable: true }).decision, "sequential");
  });
  it("sequential quando independentes < min", () => {
    assert.equal(shouldParallelize({ config: base, scale: "LARGE", independentCount: 2, aoAvailable: true }).decision, "sequential");
  });
  it("ask quando mode=suggest e critérios batem", () => {
    assert.equal(shouldParallelize({ config: base, scale: "LARGE", independentCount: 4, aoAvailable: true }).decision, "ask");
  });
  it("parallel quando mode=auto e critérios batem", () => {
    const cfg = { orchestrator: { ...base.orchestrator, mode: "auto" } };
    assert.equal(shouldParallelize({ config: cfg, scale: "LARGE", independentCount: 4, aoAvailable: true }).decision, "parallel");
  });
});
