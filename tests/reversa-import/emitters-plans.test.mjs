// tests/reversa-import/emitters-plans.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitPlans } from "../../scripts/reversa-import/emitters/plans.mjs";

function ir() {
  const x = createIR();
  x.project.name = "crm-demo";
  x.features = [
    { slug: "auth-workspace-rbac", requirements: "- RN-01: senha forte\n- AC-01: token", specLineCount: 40, hasForward: true, hasSdd: true, markers: { gap: 0 } },
  ];
  return x;
}

describe("emitPlans", () => {
  it("gera plans.json com o shape real do registry (item completo)", () => {
    const { plansJson } = emitPlans(ir(), { now: "2026-06-15T00:00:00.000Z" });
    const obj = JSON.parse(plansJson);
    assert.ok(Array.isArray(obj.active));
    assert.deepEqual(obj.completed, []);
    assert.equal(obj.primary, "auth-workspace-rbac");
    const item = obj.active[0];
    for (const k of ["slug", "path", "title", "summary", "linkedAt", "status", "approval_status"]) {
      assert.ok(k in item, `falta chave do item: ${k}`);
    }
    assert.equal(item.status, "active");
    assert.equal(item.approval_status, "pending");
    assert.equal(item.path, "plans/auth-workspace-rbac.md");
  });

  it("gera um esqueleto plan.md por feature com critérios de aceitação", () => {
    const { planSkeletons } = emitPlans(ir(), { now: "2026-06-15T00:00:00.000Z" });
    assert.equal(planSkeletons.length, 1);
    assert.match(planSkeletons[0].body, /AC-01/);
    assert.match(planSkeletons[0].feature, /auth-workspace-rbac/);
  });
});
