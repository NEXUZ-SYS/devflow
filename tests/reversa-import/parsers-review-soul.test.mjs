// tests/reversa-import/parsers-review-soul.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReview } from "../../scripts/reversa-import/parsers/review.mjs";
import { parseSoul } from "../../scripts/reversa-import/parsers/soul.mjs";

describe("parseReview", () => {
  it("agrega findings CRITICAL/HIGH abertos das auditorias", () => {
    const dir = mkdtempSync(join(tmpdir(), "rev-review-"));
    mkdirSync(join(dir, "_review"), { recursive: true });
    writeFileSync(join(dir, "_review", "final-closure-audit.md"), "- CRITICAL: billing ausente\n- HIGH: sem testes de RLS\n- LOW: typo\n");
    try {
      const r = parseReview(join(dir, "_review"));
      assert.equal(r.findings.length, 2);
      assert.ok(r.findings.some((f) => f.severity === "CRITICAL"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("review dir ausente → findings vazio (tolerante)", () => {
    const r = parseReview(join(tmpdir(), "nao-existe-xyz"));
    assert.deepEqual(r.findings, []);
  });
});

describe("parseSoul", () => {
  it("lê soul.md como blob de metadado narrativo, tolerante a ausência", () => {
    const dir = mkdtempSync(join(tmpdir(), "rev-soul-"));
    mkdirSync(join(dir, ".reversa"), { recursive: true });
    writeFileSync(join(dir, ".reversa", "soul.md"), "# Soul\nVisão do produto.\n");
    try {
      const s = parseSoul(dir);
      assert.ok(s.text.includes("Visão"));
      assert.equal(s.present, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
