// tests/reversa-import/parsers-decisions.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDecisions } from "../../scripts/reversa-import/parsers/decisions.mjs";

function makeDecisionsDir() {
  const dir = mkdtempSync(join(tmpdir(), "rev-dec-"));
  mkdirSync(join(dir, "_decisions"), { recursive: true });
  writeFileSync(join(dir, "_decisions", "paradigm-decision.md"),
    "# Paradigma\n## D-01 — Monólito DDD\nEscolha: monólito modular.\n## D-02 — Postgres + JSONB\nEscolha: Postgres.\n");
  writeFileSync(join(dir, "_decisions", "pending-decisions.md"),
    "# Pendências\n- D-09: definir provider de billing\n");
  return dir;
}

describe("parseDecisions", () => {
  it("extrai decisões resolvidas com id e título", () => {
    const dir = makeDecisionsDir();
    try {
      const ds = parseDecisions(dir);
      const d01 = ds.find((d) => d.id === "D-01");
      assert.equal(d01.title, "Monólito DDD");
      assert.equal(d01.status, "resolved");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marca decisões pendentes com status pending", () => {
    const dir = makeDecisionsDir();
    try {
      const ds = parseDecisions(dir);
      const d09 = ds.find((d) => d.id === "D-09");
      assert.equal(d09.status, "pending");
      assert.equal(d09.confidence, "gap");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
