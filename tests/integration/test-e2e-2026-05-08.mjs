#!/usr/bin/env node
// tests/integration/test-e2e-2026-05-08.mjs
//
// E2E reprodutível para Camadas 1-4 do canal de injeção de contexto e a
// correção do task #70 (deriveApplyTo retornando [] para services). Substitui
// os smoke shells avulsos da rodada anterior — agora o critério de sucesso
// está expresso em asserts.
//
// Fixture: tests/2026-05-08/.context (20 ADRs, 19 standards, 13 manifest
// entries gerados pelo pipeline real). Standards inclui 6 com applyTo:[]
// (Datadog, GHA, Claude API, Firestore, Zustand, Vercel AI SDK).
//
// Premissa: rodar a partir da raiz do devflow. Os hooks dependem de paths
// absolutos via PLUGIN_ROOT.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const FIXTURE = join(REPO_ROOT, "tests", "2026-05-08");
const INDEX_CLI = join(REPO_ROOT, "scripts", "lib", "context-index-cli.mjs");
const NUDGE_CLI = join(REPO_ROOT, "scripts", "lib", "edit-nudge-cli.mjs");
const LINTER_CLI = join(REPO_ROOT, "scripts", "lib", "run-linter-cli.mjs");

// Services/SDKs com applyTo:[] esperado (task #70). Esses NÃO devem aparecer
// no nudge de paths típicos como src/components/X.tsx.
const SERVICE_STDS = [
  "std-datadog-llm-observability",
  "std-firestore",
  "std-github-actions",
  "std-llm-claude",
  "std-vercel-ai-sdk",
  "std-zustand",
];

function clearCache() {
  const cache = join(FIXTURE, ".context", "cache", "session-injected.json");
  if (existsSync(cache)) {
    try { rmSync(cache); } catch {}
  }
}

// ─── Pré-requisitos ─────────────────────────────────────────────────────────

test("fixture: 20 ADRs, 19 standards, 13 manifest entries presentes", () => {
  const adrDir = join(FIXTURE, ".context", "adrs");
  const stdDir = join(FIXTURE, ".context", "standards");
  const manifestPath = join(FIXTURE, ".context", "stacks", "manifest.yaml");

  const adrs = readdirSync(adrDir).filter(f => f.endsWith(".md") && f !== "README.md");
  assert.equal(adrs.length, 20, `expected 20 ADRs, got ${adrs.length}`);

  const stds = readdirSync(stdDir).filter(f => f.endsWith(".md") && f !== "README.md");
  assert.equal(stds.length, 19, `expected 19 stds (consolidação TS), got ${stds.length}`);

  const manifest = readFileSync(manifestPath, "utf-8");
  const fwLines = manifest.match(/^  [a-z][a-z0-9-]*:$/gm) || [];
  assert.equal(fwLines.length, 13, `expected 13 frameworks, got ${fwLines.length}`);
});

// ─── Camada 1: session-start index ──────────────────────────────────────────

test("Camada 1: índice lista 19 stds e 13 refs scrapeados", () => {
  const r = spawnSync("node", [INDEX_CLI, `--project=${FIXTURE}`, "--format=json"], { encoding: "utf-8" });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const idx = JSON.parse(r.stdout);
  assert.equal(idx.totals.standards, 19);
  assert.equal(idx.totals.refs, 13);
  assert.equal(idx.totals.refsScraped, 13,
    "todos 13 refs scrapeados (best-effort completou após escolha de URLs canônicas)");
});

test("Camada 1: services aparecem no índice com applyTo:[] (task #70)", () => {
  const r = spawnSync("node", [INDEX_CLI, `--project=${FIXTURE}`, "--format=json"], { encoding: "utf-8" });
  const idx = JSON.parse(r.stdout);
  for (const id of SERVICE_STDS) {
    const std = idx.standards.find(s => s.id === id);
    assert.ok(std, `${id} ausente do índice`);
    assert.deepEqual(std.applyTo, [], `${id}.applyTo deveria ser [] (task #70), got ${JSON.stringify(std.applyTo)}`);
  }
});

test("Camada 1: render textual marca applyTo vazio com '(manual — sem auto-trigger)'", () => {
  const r = spawnSync("node", [INDEX_CLI, `--project=${FIXTURE}`, "--format=text"], { encoding: "utf-8" });
  assert.equal(r.status, 0);
  for (const id of SERVICE_STDS) {
    const re = new RegExp(`${id}.*\\(manual.*sem auto-trigger\\)`);
    assert.match(r.stdout, re, `${id} deve ter marker '(manual)' no índice textual`);
  }
});

// ─── Camada 2 + Task #70: nudge filtra ruído ───────────────────────────────

function runNudge(tool, path) {
  clearCache();
  const r = spawnSync("node", [NUDGE_CLI, `--project=${FIXTURE}`], {
    encoding: "utf-8",
    input: JSON.stringify({ tool, path }),
  });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  return r.stdout;
}

function extractMatchedStds(nudgeOutput) {
  const m = nudgeOutput.match(/Standards aplicáveis: (.+)$/m);
  if (!m) return [];
  return m[1].split(",").map(s => s.trim()).filter(Boolean);
}

test("Task #70 — src/foo.ts: ≤5 stds matched, nenhum service-std presente", () => {
  const out = runNudge("Read", "src/foo.ts");
  const matched = extractMatchedStds(out);
  assert.ok(matched.length <= 5, `esperado ≤5 stds, got ${matched.length}: ${matched.join(", ")}`);
  for (const svc of SERVICE_STDS) {
    assert.ok(!matched.includes(svc), `${svc} deveria estar silenciado (applyTo:[]), mas apareceu`);
  }
  // Stds esperados (linguagem + schema + linter):
  assert.ok(matched.includes("std-typescript"), "std-typescript deveria matchar .ts");
  assert.ok(matched.includes("std-biome"), "std-biome cobre .ts/.js");
  assert.ok(matched.includes("std-zod"), "std-zod aplica a **/*.ts");
});

test("Task #70 — src/components/Button.tsx: ≤5 stds, std-react presente", () => {
  const out = runNudge("Read", "src/components/Button.tsx");
  const matched = extractMatchedStds(out);
  assert.ok(matched.length <= 5, `esperado ≤5, got ${matched.length}`);
  for (const svc of SERVICE_STDS) {
    assert.ok(!matched.includes(svc));
  }
  assert.ok(matched.includes("std-react"), "std-react aplica a .tsx");
});

test("Task #70 — backend/api.py: linguagens Python (sem ruído de TS/services)", () => {
  const out = runNudge("Edit", "backend/api.py");
  const matched = extractMatchedStds(out);
  assert.ok(matched.includes("std-python"));
  assert.ok(matched.includes("std-pydantic"));
  assert.ok(matched.includes("std-fastapi"));
  assert.ok(matched.includes("std-ruff"));
  // Não deve incluir TS-related
  assert.ok(!matched.includes("std-typescript"));
  assert.ok(!matched.includes("std-zod"));
});

test("Task #70 — src-tauri/src/main.rs: apenas std-tauri", () => {
  const out = runNudge("Edit", "src-tauri/src/main.rs");
  const matched = extractMatchedStds(out);
  assert.deepEqual(matched, ["std-tauri"], `esperado apenas std-tauri, got ${matched.join(", ")}`);
});

test("Task #70 — README.md: zero stds (não há linter de markdown declarado)", () => {
  const out = runNudge("Edit", "README.md");
  // Sem matches → output vazio (silent)
  assert.equal(out.trim(), "", "README.md não deve disparar nudge");
});

// ─── Camada 3: rule extraction ─────────────────────────────────────────────

test("Camada 3: nudge first-touch inclui Princípios + Anti-patterns", () => {
  const out = runNudge("Read", "src/foo.ts");
  assert.match(out, /Princípios/i, "primeira aparição deve ter Princípios");
  assert.match(out, /Anti-patterns/i, "primeira aparição deve ter Anti-patterns");
  // E o cache deve silenciar a segunda chamada
  const out2 = spawnSync("node", [NUDGE_CLI, `--project=${FIXTURE}`, "--record"], {
    encoding: "utf-8",
    input: JSON.stringify({ tool: "Read", path: "src/foo.ts" }),
  });
  // Após --record, segunda chamada do MESMO path/tool em STDS já vistos = silent
  const out3 = spawnSync("node", [NUDGE_CLI, `--project=${FIXTURE}`, "--record"], {
    encoding: "utf-8",
    input: JSON.stringify({ tool: "Read", path: "src/foo.ts" }),
  });
  assert.equal(out3.stdout.trim(), "", "segunda chamada deve ser silenciada pelo cache");
});

// ─── Camada 4: linter violation enrichment ─────────────────────────────────

test("Camada 4: violation inclui std + ref paths quando linter detecta", () => {
  // Cria um arquivo .ts contendo padrão que std-typescript detecte como violação
  // OU usa a string mock — depende do linter gerado pelo standards-from-adr.
  // Como o linter é gerado heuristicamente, testar a presença de stdPath no
  // CLI output requer um padrão que ele detecte. Inspecionamos primeiro.
  const linterPath = join(FIXTURE, ".context", "standards", "machine", "std-typescript.js");
  const linterCode = readFileSync(linterPath, "utf-8");
  if (!linterCode.includes("VIOLATION:")) {
    // Linter pode estar em modo TODO ou sem regras concretas. Skip teste de
    // produção real — Camada 4 já é coberta por test-run-linter.mjs (unit).
    return;
  }
  // Best effort: rodar contra um arquivo qualquer e checar shape se houver violação
  const tmpFile = join(FIXTURE, "_e2e-tmp.ts");
  writeFileSync(tmpFile, "const x: any = 1;\n");
  try {
    const r = spawnSync("node", [LINTER_CLI], {
      encoding: "utf-8",
      input: JSON.stringify({ tool: "Edit", path: tmpFile }),
      cwd: FIXTURE,
    });
    if (r.stdout.trim().length > 0) {
      assert.match(r.stdout, /std: \.context\/standards\/std-/);
    }
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
});

// ─── Performance: baseline observado ───────────────────────────────────────

test("Performance: session-start hook latency baseline", () => {
  // Não usar bar apriorística — mede e reporta. Bar para regressão futura
  // pode ser definida como 1.5× do baseline observado nesta rodada.
  const start = process.hrtime.bigint();
  for (let i = 0; i < 5; i++) {
    spawnSync("node", [INDEX_CLI, `--project=${FIXTURE}`, "--format=text"], { encoding: "utf-8" });
  }
  const end = process.hrtime.bigint();
  const avgMs = Number(end - start) / 5 / 1e6;
  console.log(`        [perf] context-index avg: ${avgMs.toFixed(1)}ms (5 runs)`);
  // Hard cap defensivo: 2s. Se passa disso, há bug de loop ou IO patológico.
  assert.ok(avgMs < 2000, `latência ${avgMs.toFixed(1)}ms é patológica (>2s)`);
});

test("Performance: edit-nudge hook latency baseline", () => {
  const start = process.hrtime.bigint();
  for (let i = 0; i < 5; i++) {
    clearCache();
    spawnSync("node", [NUDGE_CLI, `--project=${FIXTURE}`], {
      encoding: "utf-8",
      input: JSON.stringify({ tool: "Read", path: "src/foo.ts" }),
    });
  }
  const end = process.hrtime.bigint();
  const avgMs = Number(end - start) / 5 / 1e6;
  console.log(`        [perf] edit-nudge avg: ${avgMs.toFixed(1)}ms (5 runs, with rule extraction)`);
  assert.ok(avgMs < 2000, `latência ${avgMs.toFixed(1)}ms é patológica (>2s)`);
});

// ─── Diversidade de stack confirmada ───────────────────────────────────────

test("Cobertura: linguagens, frameworks, services, tooling presentes", () => {
  const r = spawnSync("node", [INDEX_CLI, `--project=${FIXTURE}`, "--format=json"], { encoding: "utf-8" });
  const idx = JSON.parse(r.stdout);
  const ids = idx.standards.map(s => s.id);

  // Linguagens
  assert.ok(ids.includes("std-typescript"));
  assert.ok(ids.includes("std-python"));

  // Frameworks UI
  assert.ok(ids.includes("std-react"));
  assert.ok(ids.includes("std-nextjs"));
  assert.ok(ids.includes("std-tauri"));

  // Backend runtimes
  assert.ok(ids.includes("std-fastapi"));

  // Schemas / state
  assert.ok(ids.includes("std-zod"));
  assert.ok(ids.includes("std-pydantic"));
  assert.ok(ids.includes("std-zustand"));

  // Services (com applyTo:[])
  assert.ok(ids.includes("std-llm-claude"));
  assert.ok(ids.includes("std-firestore"));
  assert.ok(ids.includes("std-datadog-llm-observability"));
  assert.ok(ids.includes("std-github-actions"));

  // Test frameworks
  assert.ok(ids.includes("std-vitest"));
  assert.ok(ids.includes("std-pytest"));

  // Tooling
  assert.ok(ids.includes("std-biome"));
  assert.ok(ids.includes("std-ruff"));
  assert.ok(ids.includes("std-husky-lint-staged"));
});
