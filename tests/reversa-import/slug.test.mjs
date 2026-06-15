// tests/reversa-import/slug.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toSlug } from "../../scripts/reversa-import/slug.mjs";

describe("toSlug", () => {
  it("remove prefixo numérico NNN- e normaliza", () => {
    assert.equal(toSlug("001-auth-workspace-rbac"), "auth-workspace-rbac");
  });
  it("neutraliza path traversal (../, barras, absoluto)", () => {
    assert.equal(toSlug("001-../../../etc/passwd"), "etc-passwd");
    assert.equal(toSlug("/abs/evil"), "abs-evil");
    assert.ok(!toSlug("../../x").includes("/"));
    assert.ok(!toSlug("../../x").includes(".."));
  });
  it("nunca começa com dígito nem fica vazio perigoso", () => {
    assert.ok(!/^\d/.test(toSlug("rev-001-x")));
    assert.equal(toSlug("///"), "imported"); // fallback seguro
  });
  it("aceita acentos do pt-BR colapsando para ascii", () => {
    assert.equal(toSlug("notificações"), "notificacoes");
  });
});
