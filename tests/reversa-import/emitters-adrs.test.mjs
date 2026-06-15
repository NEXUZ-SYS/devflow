// tests/reversa-import/emitters-adrs.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitAdrs } from "../../scripts/reversa-import/emitters/adrs.mjs";
import { parse } from "../../scripts/lib/adr-frontmatter.mjs";

function ir() {
  const x = createIR();
  x.decisions = [
    { id: "D-01", title: "Monólito DDD", status: "resolved", confidence: "official", body: "Escolha: monólito modular." },
    { id: "D-09", title: "Provider de billing", status: "pending", confidence: "gap", body: "" },
  ];
  return x;
}

describe("emitAdrs", () => {
  it("gera um ADR por decisão resolvida, com numeração NNN e slug seguro", () => {
    const adrs = emitAdrs(ir(), { now: "2026-06-15" });
    assert.equal(adrs.length, 1); // só resolvidas viram ADR
    assert.match(adrs[0].filename, /^001-.*-v1\.0\.0\.md$/);
    assert.match(adrs[0].body, /Mon[oó]lito DDD/);
  });

  it("frontmatter passa no parser real e tem todos os campos obrigatórios do audit", () => {
    const [adr] = emitAdrs(ir(), { now: "2026-06-15" });
    const { frontmatter } = parse(adr.body); // não lança = frontmatter bem-formado
    for (const k of ["type", "name", "description", "scope", "stack", "category", "status", "created"]) {
      assert.ok(k in frontmatter, `falta campo obrigatório: ${k}`);
    }
    assert.equal(frontmatter.type, "adr");
    assert.equal(frontmatter.status, "Aprovado");
    assert.equal(frontmatter.source, "reversa");
  });

  it("decisões pendentes NÃO viram ADR (vão para gaps/reconciliação)", () => {
    const adrs = emitAdrs(ir(), { now: "2026-06-15" });
    assert.ok(!adrs.some((a) => a.body.includes("billing")));
  });
});
