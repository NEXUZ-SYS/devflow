// tests/reversa-import/emitters-fidelity-report.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitFidelityReport } from "../../scripts/reversa-import/emitters/fidelity-report.mjs";

function ir() {
  const x = createIR();
  x.project.name = "crm-demo";
  x.features = [
    { slug: "auth", markers: { official: 1, captured: 8, inferred: 1, gap: 0, total: 10 } },
    { slug: "billing", markers: { official: 0, captured: 1, inferred: 2, gap: 3, total: 6 } },
  ];
  x.gaps = [{ feature: "billing", text: "definir provider de pagamento" }];
  return x;
}

describe("emitFidelityReport", () => {
  it("agrega % de confiança por feature e global", () => {
    const md = emitFidelityReport(ir());
    assert.match(md, /auth/);
    assert.match(md, /billing/);
    assert.match(md, /%/);
  });

  it("converte 🔴 lacunas em itens acionáveis 'resolver lacuna'", () => {
    const md = emitFidelityReport(ir());
    assert.match(md, /resolver lacuna/i);
    assert.match(md, /definir provider de pagamento/);
  });
});
