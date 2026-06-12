#!/usr/bin/env node
// Test suite: scrape --auto-fallback iterates discoveryHints when --from fails.
//
// Failure-mode contract (verified empirically 2026-05-08):
//   - Success: exit code 0, stdout starts with "OK: <refPath>"
//   - Failure: exit code 1, stderr contains "SCRAPE FAILED:"
//   - Reliable detector is exit code, NOT string matching on output.
//
// We don't run the real pipeline (npx + network) — that would make tests
// slow and flaky. Instead, we use the dry-run path AND we test the
// auto-fallback URL-ordering logic by inspecting dry-run output.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { formatScrapeOk } from "../../scripts/devflow-stacks.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
const CLI = new URL("../../scripts/devflow-stacks.mjs", import.meta.url).pathname;

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "fallback-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeManifest(root, frameworks) {
  const dir = join(root, ".context", "stacks");
  mkdirSync(dir, { recursive: true });
  const lines = ["spec: devflow-stack/v0", "frameworks:"];
  for (const [name, fw] of Object.entries(frameworks)) {
    lines.push(`  ${name}:`);
    for (const [k, v] of Object.entries(fw)) {
      if (Array.isArray(v)) {
        lines.push(`    ${k}: [${v.map(x => `"${x}"`).join(", ")}]`);
      } else {
        lines.push(`    ${k}: ${typeof v === "string" ? `"${v}"` : v}`);
      }
    }
  }
  writeFileSync(join(dir, "manifest.yaml"), lines.join("\n") + "\n");
}

// ─── Unit: formatScrapeOk reflete o contrato atual de runPipeline ──────────

test("formatScrapeOk reflete o novo contrato: VALIDADO (não indexed) + redireciona p/ skill", () => {
  // runPipeline agora devolve o spec validado; quem indexa é a tool MCP
  // scrape_docs (hospedado), orquestrada pela skill — o CLI não pode afirmar "indexed".
  const result = { library: "zod", version: "4.1.0", url: "https://zod.dev/" };
  const out = formatScrapeOk(result);
  assert.match(out, /VALIDADO/);
  assert.match(out, /zod@4\.1\.0/);
  assert.match(out, /zod\.dev/);
  assert.doesNotMatch(out, /indexed/i, "CLI não deve afirmar indexação — quem indexa é a tool MCP");
});

// ─── Sem --auto-fallback: comportamento atual preservado ───────────────────

test("scrape sem --auto-fallback: dry-run usa apenas --from", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: {
        version: "1.0.0",
        artisanalRef: "refs/foo@1.0.0.md",
        discoveryHints: ["https://b.example/", "https://c.example/"],
      },
    });
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html", "--from=https://a.example/",
      "--dry-run", `--project=${root}`,
    ], { encoding: "utf-8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Would scrape foo@1\.0\.0.*a\.example/);
    // Não deve mencionar URLs do manifest
    assert.ok(!r.stdout.includes("b.example"), "fallback URLs não devem aparecer sem --auto-fallback");
  } finally { cleanup(); }
});

// ─── Com --auto-fallback: lista de URLs a tentar ────────────────────────────

test("scrape --auto-fallback dry-run lista todas URLs (--from + discoveryHints)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: {
        version: "1.0.0",
        artisanalRef: "refs/foo@1.0.0.md",
        discoveryHints: ["https://b.example/", "https://c.example/"],
      },
    });
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html", "--from=https://a.example/",
      "--auto-fallback", "--dry-run", `--project=${root}`,
    ], { encoding: "utf-8" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // Dry-run deve listar TODAS as URLs em ordem (--from primeiro, depois hints)
    assert.match(r.stdout, /a\.example/);
    assert.match(r.stdout, /b\.example/);
    assert.match(r.stdout, /c\.example/);
    // Ordem: a antes de b antes de c
    const idxA = r.stdout.indexOf("a.example");
    const idxB = r.stdout.indexOf("b.example");
    const idxC = r.stdout.indexOf("c.example");
    assert.ok(idxA < idxB, "--from deve ser tentada primeiro");
    assert.ok(idxB < idxC, "discoveryHints na ordem do manifest");
  } finally { cleanup(); }
});

test("scrape --auto-fallback dedupa URL repetida (--from coincide com hint)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: {
        version: "1.0.0",
        artisanalRef: "refs/foo@1.0.0.md",
        discoveryHints: [
          "https://a.example/",   // duplicate of --from
          "https://b.example/",
        ],
      },
    });
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html", "--from=https://a.example/",
      "--auto-fallback", "--dry-run", `--project=${root}`,
    ], { encoding: "utf-8" });
    assert.equal(r.status, 0);
    // a.example aparece 1x (dedup), b.example aparece 1x
    const aMatches = (r.stdout.match(/a\.example/g) || []).length;
    assert.equal(aMatches, 1, "URL duplicada deve aparecer 1x apenas");
  } finally { cleanup(); }
});

test("scrape --auto-fallback sem hints no manifest: tenta apenas --from", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: { version: "1.0.0", artisanalRef: "refs/foo@1.0.0.md" },  // no hints
    });
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html", "--from=https://a.example/",
      "--auto-fallback", "--dry-run", `--project=${root}`,
    ], { encoding: "utf-8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /a\.example/);
  } finally { cleanup(); }
});

test("scrape --auto-fallback lib não existente no manifest: usa apenas --from", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});  // empty manifest
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html", "--from=https://a.example/",
      "--auto-fallback", "--dry-run", `--project=${root}`,
    ], { encoding: "utf-8" });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    // Não deve falhar — apenas tentar a URL passada
    assert.match(r.stdout, /a\.example/);
  } finally { cleanup(); }
});

// ─── Novo contrato: o CLI VALIDA e redireciona; o scrape roda na tool MCP ──
// O `devflow stacks scrape` não executa mais o scrape (não toca a rede). Ele
// valida o spec (npm-spec + SI-3) e instrui a invocar a skill, que faz o scrape
// via `mcp__docs-mcp-server__scrape_docs` no servidor hospedado. Logo:
//   - URL com formato válido (mesmo host inalcançável) → exit 0 + VALIDADO
//     (alcançabilidade é problema do scrape server-side, não da validação)
//   - URL bloqueada por SI-3 (SSRF) → exit 1 + VALIDATION FAILED

test("scrape sem --auto-fallback: valida e redireciona para a skill (sem executar scrape)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html",
      "--from=https://nonexistent-host.invalid/",  // formato válido; alcance é do scrape MCP
      `--project=${root}`,
    ], { encoding: "utf-8", timeout: 60000 });
    assert.equal(r.status, 0, `esperava exit 0; stderr: ${r.stderr}`);
    assert.match(r.stdout, /VALIDADO: foo@1\.0\.0/);
    assert.match(r.stdout, /devflow:scrape-stack-batch/, "redireciona para a skill");
    assert.doesNotMatch(r.stdout, /indexed/i, "CLI não afirma indexação");
  } finally { cleanup(); }
});

test("scrape: URL bloqueada por SI-3 (SSRF) → exit 1 + VALIDATION FAILED", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html",
      "--from=https://169.254.169.254/",  // cloud metadata → SI-3 bloqueia
      `--project=${root}`,
    ], { encoding: "utf-8", timeout: 60000 });
    assert.equal(r.status, 1, `esperava exit 1; stdout: ${r.stdout}`);
    assert.match(r.stderr, /VALIDATION FAILED:/);
  } finally { cleanup(); }
});

test("scrape --auto-fallback: valida e lista URLs de fallback para a skill", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: {
        version: "1.0.0",
        artisanalRef: "refs/foo@1.0.0.md",
        discoveryHints: ["https://hint-b.example/"],
      },
    });
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html",
      "--from=https://primary.example/",
      "--auto-fallback", `--project=${root}`,
    ], { encoding: "utf-8", timeout: 60000 });
    assert.equal(r.status, 0, `esperava exit 0; stderr: ${r.stderr}`);
    assert.match(r.stdout, /VALIDADO: foo@1\.0\.0/);
    assert.match(r.stdout, /fallback/i);
    assert.match(r.stdout, /hint-b\.example/, "lista o hint de fallback p/ a skill");
  } finally { cleanup(); }
});
