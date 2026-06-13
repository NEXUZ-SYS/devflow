// tests/standards/std-accessibility.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-accessibility.js";

describe("std-accessibility linter", () => {
  it("gate: ignora não-{tsx,jsx} (exit 0)", () => {
    assert.equal(lintFile(L, "x.ts", `<div onClick={h}>`).code, 0);
  });
  it("BAD: <div onClick> como botão", () => {
    assert.equal(lintFile(L, "B.tsx", `<div onClick={handler}>x</div>`).code, 1);
  });
  it("BAD: tabIndex positivo", () => {
    assert.equal(lintFile(L, "T.tsx", `<input tabIndex={1} />`).code, 1);
  });
  it("BAD: <img> sem alt", () => {
    assert.equal(lintFile(L, "I.tsx", `<img src="/a.png" />`).code, 1);
  });
  it("BAD: <div onClick> multiline (atributos quebrados em linhas)", () => {
    assert.equal(lintFile(L, "M.tsx", `<div\n  className="x"\n  onClick={handler}>y</div>`).code, 1);
  });
  it("GOOD: div com role=button + tabIndex 0 + onClick (padrão a11y válido)", () => {
    assert.equal(lintFile(L, "Role.tsx", `<div role="button" tabIndex={0} onClick={h}>x</div>`).code, 0);
  });
  it("GOOD: button + tabIndex 0 + img com alt", () => {
    const good = `<button onClick={h}>x</button><input tabIndex={0} /><img src="/a.png" alt="logo" />`;
    assert.equal(lintFile(L, "Ok.tsx", good).code, 0);
  });
});
