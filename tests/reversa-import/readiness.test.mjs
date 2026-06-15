// tests/reversa-import/readiness.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { assessReadiness } from "../../scripts/reversa-import/readiness.mjs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("assessReadiness", () => {
  it("projeto green → veredito global green", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      const a = assessReadiness(dir);
      assert.equal(a.global, "green");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("projeto red (CRITICAL aberto + decisão pendente + spec stub) → red", () => {
    const dir = makeReversaFixture({ profile: "red" });
    try {
      const a = assessReadiness(dir);
      assert.equal(a.global, "red");
      assert.ok(a.signals.criticalFindings >= 1, "deve achar CRITICAL no review");
      assert.ok(a.signals.pendingDecisions >= 1, "deve achar decisão pendente");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignora state.json stale: completed:[] não força red sozinho", () => {
    // green tem completed:[] mas tudo pronto → triangulação não rebaixa para red
    const dir = makeReversaFixture({ profile: "green" });
    try {
      const a = assessReadiness(dir);
      assert.notEqual(a.global, "red");
      assert.ok("declaredPhase" in a.signals);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("produz veredito por feature", () => {
    const dir = makeReversaFixture({ profile: "red" });
    try {
      const a = assessReadiness(dir);
      assert.equal(a.perFeature["feat-a"], "red"); // spec stub
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detecta descasamento SDD↔forward (feature SDD sem forward) — sinal §5.1", () => {
    const dir = makeReversaFixture({ profile: "yellow" }); // feat-orfa só em sdd
    try {
      const a = assessReadiness(dir);
      assert.ok(a.signals.sddWithoutForward.includes("feat-orfa"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
