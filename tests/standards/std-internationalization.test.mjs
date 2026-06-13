// tests/standards/std-internationalization.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintFile } from "./_helper.mjs";
const L = "std-internationalization.js";

describe("std-internationalization linter", () => {
  it("gate de path: ignora não-{tsx,jsx,ts} (exit 0)", () => {
    assert.equal(lintFile(L, "notas.txt", `if (count === 1) {}`).code, 0);
  });
  it("BAD: plural manual count === 1 (ternário)", () => {
    const r = lintFile(L, "Cart.tsx", `const label = count === 1 ? 'item' : 'itens';`);
    assert.equal(r.code, 1);
    assert.match(r.out, /VIOLATION/);
  });
  it("BAD: moeda concatenada com símbolo", () => {
    assert.equal(lintFile(L, "Price.tsx", `const p = '$' + value.toFixed(2);`).code, 1);
  });
  it("BAD: toLocaleString() sem locale", () => {
    assert.equal(lintFile(L, "Date.tsx", `d.toLocaleDateString();`).code, 1);
  });
  it("BAD: margin-left físico (RTL)", () => {
    assert.equal(lintFile(L, "Box.tsx", `const s = { 'margin-left': '16px' };`).code, 1);
  });
  it("GOOD: ICU + Intl com locale + logical prop", () => {
    const good = `t('items', { count }); new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }); const s = { 'margin-inline-start': '16px' };`;
    assert.equal(lintFile(L, "Ok.tsx", good).code, 0);
  });
  it("GOOD: toFixed(2) financeiro sem símbolo (não é moeda formatada)", () => {
    assert.equal(lintFile(L, "Calc.tsx", `const ratio = (a / b).toFixed(2); const total = sum.toFixed(2);`).code, 0);
  });
  it("GOOD: count === 1 como guarda (sem ternário, não é plural)", () => {
    assert.equal(lintFile(L, "Guard.tsx", `if (page.count === 1) { goToFirst(); }`).code, 0);
  });
});
