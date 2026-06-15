// tests/reversa-import/parsers-state.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { parseState } from "../../scripts/reversa-import/parsers/state.mjs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("parseState", () => {
  it("extrai project/language/target/phase do state.json", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      const p = parseState(dir);
      assert.equal(p.name, "fixture-green");
      assert.equal(p.language, "Português");
      assert.equal(p.declaredPhase, "concluido-especificacao");
      assert.equal(p.target, "Demo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("state.json ausente → fragmento com nulls (tolerante)", () => {
    const dir = makeReversaFixture({ profile: "green" });
    rmSync(`${dir}/.reversa/state.json`, { force: true });
    try {
      const p = parseState(dir);
      assert.equal(p.name, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
