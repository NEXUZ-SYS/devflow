// tests/reversa-import/markers.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanMarkers, MARKER } from "../../scripts/reversa-import/markers.mjs";

describe("scanMarkers", () => {
  it("conta cada nível de confiança num texto", () => {
    const text = "🟦 oficial\n🟢 capturado\n🟢 outro\n🟡 inferido\n🔴 lacuna";
    const r = scanMarkers(text);
    assert.equal(r.official, 1);
    assert.equal(r.captured, 2);
    assert.equal(r.inferred, 1);
    assert.equal(r.gap, 1);
    assert.equal(r.total, 5);
  });

  it("extrai as linhas de lacuna (🔴) como itens acionáveis", () => {
    const text = "ok\n🔴 falta definir auth provider\nmais\n🔴 sem schema de billing";
    const r = scanMarkers(text);
    assert.deepEqual(r.gaps, [
      "falta definir auth provider",
      "sem schema de billing",
    ]);
  });

  it("texto sem marcadores retorna zeros e gaps vazio", () => {
    const r = scanMarkers("nenhum marcador aqui");
    assert.equal(r.total, 0);
    assert.deepEqual(r.gaps, []);
  });

  it("MARKER expõe os glyphs canônicos", () => {
    assert.equal(MARKER.official, "🟦");
    assert.equal(MARKER.gap, "🔴");
  });
});
