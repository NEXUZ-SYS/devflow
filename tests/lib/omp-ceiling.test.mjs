// tests/lib/omp-ceiling.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ompCeilingTier } from "../../scripts/lib/omp-ceiling.mjs";

test("pluginRoot sem omp/omp-roles.yaml → teto nulo (não rotear), sem lançar", () => {
  const plugin = mkdtempSync(join(tmpdir(), "omp-ceiling-plugin-"));
  const proj = mkdtempSync(join(tmpdir(), "omp-ceiling-proj-"));
  assert.equal(ompCeilingTier(plugin, proj, "devflow:architect"), null);
});

test("omp-roles.yaml ilegível (diretório no lugar do arquivo) → teto nulo", () => {
  const plugin = mkdtempSync(join(tmpdir(), "omp-ceiling-plugin-"));
  mkdirSync(join(plugin, "omp/omp-roles.yaml"), { recursive: true });
  assert.equal(ompCeilingTier(plugin, plugin, "x"), null);
});

// ---- D5: arquivo de agente que EXISTE mas não pode ser lido => teto ilegível (não cai no genérico) ----
import { writeFileSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
const PLUGIN = new URL("../..", import.meta.url).pathname;
const projWithAgents = () => {
  const proj = mkdtempSync(join(tmpdir(), "omp-ceiling-agent-"));
  mkdirSync(join(proj, ".context/agents"), { recursive: true });
  return proj;
};

test("agente ausente (ENOENT) cai no teto genérico activities.execution", () => {
  assert.equal(ompCeilingTier(PLUGIN, projWithAgents(), "devflow:ausente"), "standard");
});

test("agente legível dá o tier do frontmatter", () => {
  const p = projWithAgents();
  writeFileSync(join(p, ".context/agents/x.md"), "---\nmodel: haiku\n---\n");
  assert.equal(ompCeilingTier(PLUGIN, p, "devflow:x"), "cheap");
});

test("agente como symlink (para dentro ou para fora) → teto nulo, não o genérico", () => {
  const p = projWithAgents();
  const fora = join(mkdtempSync(join(tmpdir(), "omp-fora-")), "x.md");
  writeFileSync(fora, "---\nmodel: haiku\n---\n");
  symlinkSync(fora, join(p, ".context/agents/x.md"));
  assert.equal(ompCeilingTier(PLUGIN, p, "devflow:x"), null);
  writeFileSync(join(p, ".context/agents/real.md"), "---\nmodel: haiku\n---\n");
  symlinkSync(join(p, ".context/agents/real.md"), join(p, ".context/agents/y.md"));
  assert.equal(ompCeilingTier(PLUGIN, p, "devflow:y"), null);
});

test("agente como FIFO ou maior que o limite → teto nulo, sem travar", () => {
  const p = projWithAgents();
  spawnSync("mkfifo", [join(p, ".context/agents/f.md")]);
  assert.equal(ompCeilingTier(PLUGIN, p, "devflow:f"), null);
  writeFileSync(join(p, ".context/agents/big.md"), "x".repeat(1024 * 1024 + 1));
  assert.equal(ompCeilingTier(PLUGIN, p, "devflow:big"), null);
});

test(".context/agents como symlink de diretório para fora → teto nulo (§9)", () => {
  const p = mkdtempSync(join(tmpdir(), "omp-ceiling-dirlink-"));
  const fora = mkdtempSync(join(tmpdir(), "omp-fora-"));
  writeFileSync(join(fora, "x.md"), "---\nmodel: haiku\n---\n");
  mkdirSync(join(p, ".context"));
  symlinkSync(fora, join(p, ".context/agents"));
  assert.equal(ompCeilingTier(PLUGIN, p, "devflow:x"), null);
});
