// tests/reversa-import/write.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";
import { writeArtifacts, adrDir } from "../../scripts/reversa-import/write.mjs";

const NOW = "2026-07-23T00:00:00.000Z";

describe("adrDir — layout-aware", () => {
  it("detecta layout v2 pela pasta engineering/", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-lay2-"));
    try {
      mkdirSync(join(dest, ".context", "engineering"), { recursive: true });
      assert.equal(adrDir(dest), join(".context", "engineering", "adrs"));
    } finally { rmSync(dest, { recursive: true, force: true }); }
  });

  it("detecta v2 pelo marcador .layout-version", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-lay2b-"));
    try {
      mkdirSync(join(dest, ".context"), { recursive: true });
      writeFileSync(join(dest, ".context", ".layout-version"), "2\n");
      assert.equal(adrDir(dest), join(".context", "engineering", "adrs"));
    } finally { rmSync(dest, { recursive: true, force: true }); }
  });

  it("cai para v1 quando não há sinal de v2", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-lay1-"));
    try {
      mkdirSync(join(dest, ".context"), { recursive: true });
      assert.equal(adrDir(dest), join(".context", "adrs"));
    } finally { rmSync(dest, { recursive: true, force: true }); }
  });
});

describe("writeArtifacts — espelho + índice + ADRs", () => {
  it("espelha preservando a árvore e NÃO copia o que é linked", () => {
    const src = makeReversaFixture({ profile: "reverse-migration" });
    const dest = mkdtempSync(join(tmpdir(), "rev-mir-"));
    try {
      writeFileSync(join(src, "_reversa_sdd", "grande.md"), "x".repeat(300 * 1024));
      const r = runPipeline({ sourceDir: src, now: NOW });
      const { log } = writeArtifacts(r, { destDir: dest, confirmOverwrite: () => true });

      const espelhado = join(dest, ".context", "imported", "reversa",
        "_reversa_sdd", "migration", "parity_tests", "01-alpha.feature");
      assert.ok(existsSync(espelhado), "árvore preservada no destino");

      const grande = join(dest, ".context", "imported", "reversa", "_reversa_sdd", "grande.md");
      assert.ok(!existsSync(grande), "acima do teto não é copiado");
      assert.ok(log.some(([, s]) => s === "linked"), "registra linked no log");
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("escreve INDEX.md e manifest.json no espelho", () => {
    const src = makeReversaFixture({ profile: "reverse-analysis" });
    const dest = mkdtempSync(join(tmpdir(), "rev-idx-"));
    try {
      const r = runPipeline({ sourceDir: src, now: NOW });
      writeArtifacts(r, { destDir: dest, confirmOverwrite: () => true });
      const base = join(dest, ".context", "imported", "reversa");
      assert.ok(existsSync(join(base, "INDEX.md")));
      assert.equal(JSON.parse(readFileSync(join(base, "manifest.json"), "utf-8")).schema, 2);
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("NÃO escreve em .context/workflow/ nem .context/plans/ — isso é do Planning", () => {
    const src = makeReversaFixture({ profile: "reverse-migration" });
    const dest = mkdtempSync(join(tmpdir(), "rev-wf-"));
    try {
      const r = runPipeline({ sourceDir: src, now: NOW });
      writeArtifacts(r, { destDir: dest, confirmOverwrite: () => true });
      assert.ok(!existsSync(join(dest, ".context", "workflow", "stories.yaml")));
      assert.ok(!existsSync(join(dest, ".context", "workflow", "plans.json")));
      assert.ok(!existsSync(join(dest, ".context", "plans", "imported-prd.md")));
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("escreve as ADRs no layout detectado (v2 → engineering/adrs)", () => {
    const src = makeReversaFixture({ profile: "reverse-analysis" });
    const dest = mkdtempSync(join(tmpdir(), "rev-adr-"));
    try {
      mkdirSync(join(dest, ".context", "engineering"), { recursive: true });
      const r = runPipeline({ sourceDir: src, now: NOW });
      writeArtifacts(r, { destDir: dest, confirmOverwrite: () => true });
      assert.ok(existsSync(join(dest, ".context", "engineering", "adrs", "001-adr-decisao-um-v1.0.0.md")));
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });
});

describe("writeArtifacts — segurança e não-destrutividade", () => {
  it("[H3] recusa copiar ref que é symlink (não segue link)", () => {
    const src = makeReversaFixture({ profile: "reverse-analysis" });
    const dest = mkdtempSync(join(tmpdir(), "rev-sym-"));
    try {
      symlinkSync("/etc/passwd", join(src, "_reversa_sdd", "link.md"));
      const r = runPipeline({ sourceDir: src, now: NOW });
      const { log } = writeArtifacts(r, { destDir: dest, confirmOverwrite: () => true });
      const copied = join(dest, ".context", "imported", "reversa", "_reversa_sdd", "link.md");
      assert.ok(!existsSync(copied), "symlink não deve ser copiado");
      // link.md não vira classificado (walk pula symlink na classify) OU é recusado no write.
      assert.ok(log.every(([l]) => !/link\.md/.test(l)) || log.some(([, s]) => s === "refused-symlink"));
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("[não-destrutivo] respeita confirmOverwrite no espelho (não apaga WIP)", () => {
    const src = makeReversaFixture({ profile: "reverse-analysis" });
    const dest = mkdtempSync(join(tmpdir(), "rev-wip-"));
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
