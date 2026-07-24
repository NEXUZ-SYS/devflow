// tests/reversa-import/e2e-write.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";
import { writeArtifacts } from "../../scripts/reversa-import/write.mjs";

const NOW = "2026-07-23T00:00:00.000Z";

describe("e2e — pipeline + escrita", () => {
  it("importa o perfil reverse-migration de ponta a ponta", () => {
    const src = makeReversaFixture({ profile: "reverse-migration" });
    const dest = mkdtempSync(join(tmpdir(), "rev-e2e-"));
    try {
      mkdirSync(join(dest, ".context", "engineering"), { recursive: true }); // layout v2
      const r = runPipeline({ sourceDir: src, now: NOW });
      const { log } = writeArtifacts(r, { destDir: dest, confirmOverwrite: () => true });

      const base = join(dest, ".context", "imported", "reversa");
      assert.ok(existsSync(join(base, "INDEX.md")));
      assert.ok(existsSync(join(base, "manifest.json")));
      assert.ok(existsSync(join(base, "_reversa_sdd", "migration", "handoff.md")),
        "âncora espelhada no caminho original");
      assert.ok(existsSync(join(dest, ".context", "engineering", "adrs")),
        "ADRs no layout v2");
      assert.ok(!existsSync(join(dest, ".context", "workflow")),
        "importador não escreve em workflow/");
      assert.ok(log.every(([, s]) => s !== "refused-traversal"));
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("segunda escrita sobre destino idêntico não reescreve nada", () => {
    const src = makeReversaFixture({ profile: "reverse-analysis" });
    const dest = mkdtempSync(join(tmpdir(), "rev-e2e2-"));
    try {
      const r = runPipeline({ sourceDir: src, now: NOW });
      writeArtifacts(r, { destDir: dest, confirmOverwrite: () => true });
      const { log } = writeArtifacts(r, { destDir: dest, confirmOverwrite: () => false });
      assert.ok(log.every(([, s]) => s === "unchanged" || s === "linked"),
        `tudo inalterado na 2a passada: ${JSON.stringify(log.filter(([, s]) => s !== "unchanged" && s !== "linked"))}`);
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("WIP do usuário no destino é preservado quando ele recusa a sobrescrita", () => {
    const src = makeReversaFixture({ profile: "reverse-analysis" });
    const dest = mkdtempSync(join(tmpdir(), "rev-e2e3-"));
    try {
      const alvo = join(dest, ".context", "imported", "reversa", "INDEX.md");
      mkdirSync(join(dest, ".context", "imported", "reversa"), { recursive: true });
      writeFileSync(alvo, "MEU TRABALHO EM ANDAMENTO");
      const r = runPipeline({ sourceDir: src, now: NOW });
      writeArtifacts(r, { destDir: dest, confirmOverwrite: () => false });
      assert.equal(readFileSync(alvo, "utf-8"), "MEU TRABALHO EM ANDAMENTO");
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
