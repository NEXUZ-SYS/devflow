#!/usr/bin/env node
// tests/integration/test-no-public-scraper.mjs
//
// Guard de regressão: garante que a skill scrape-stack-batch usa EXCLUSIVAMENTE
// o docs-mcp-server hospedado via MCP, sem nenhuma referência ao projeto público
// (@arabold/docs-mcp-server) nem invocação npx/CLI local de scrape.
//
// Escopo CRAVADO: apenas `scripts/` + `skills/` (código operacional). `docs/`
// histórico fica fora — menções a @arabold lá são registro congelado.
//
// Combina checks textuais (grep) com checks estruturais (existsSync / import
// parsing) — mais robustos que grep solto contra deriva.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", ".."); // tests/integration → repo root
const SELF = join(REPO, "tests", "integration", "test-no-public-scraper.mjs");

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const SCAN_DIRS = [join(REPO, "scripts"), join(REPO, "skills")];
const FILES = SCAN_DIRS.flatMap((d) => walk(d, [".mjs", ".md", ".json"])).filter(
  (f) => f !== SELF,
);

const rel = (f) => relative(REPO, f);

test("[guard] sem referência ao pacote público @arabold em código operacional", () => {
  const offenders = FILES.filter((f) => readFileSync(f, "utf8").includes("@arabold")).map(rel);
  assert.deepEqual(offenders, [], `@arabold encontrado em: ${offenders.join(", ")}`);
});

test("[guard] sem invocação npx/CLI de scrape docs-mcp-server", () => {
  const re = /npx[\s\S]{0,80}docs-mcp-server[\s\S]{0,80}\bscrape\b/;
  const offenders = FILES.filter((f) => re.test(readFileSync(f, "utf8"))).map(rel);
  assert.deepEqual(offenders, [], `npx scrape encontrado em: ${offenders.join(", ")}`);
});

test("[guard estrutural] scripts/lib/scrape-recursive.mjs foi removido", () => {
  assert.equal(
    existsSync(join(REPO, "scripts", "lib", "scrape-recursive.mjs")),
    false,
    "scrape-recursive.mjs ainda existe — deveria ter sido removido",
  );
});

test("[guard estrutural] pipeline.mjs não importa scrape-recursive nem child_process", () => {
  const p = readFileSync(
    join(REPO, "skills", "scrape-stack-batch", "scripts", "pipeline.mjs"),
    "utf8",
  );
  // Checa nível de IMPORT/uso de código (não menções em comentário/doc).
  const importLines = p
    .split("\n")
    .filter((l) => /^\s*import\b|require\s*\(/.test(l));
  const code = importLines.join("\n");
  assert.ok(!/scrape-recursive/.test(code), "pipeline.mjs ainda importa scrape-recursive");
  assert.ok(!/child_process/.test(code), "pipeline.mjs ainda importa child_process");
  // execFile/exec só fazem sentido se child_process foi importado — já coberto acima,
  // mas garantimos que não há chamada direta no corpo executável.
  const codeNoComments = p.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\bexecFile\s*\(|\bexec\s*\(|\bspawn\s*\(/.test(codeNoComments), "pipeline.mjs ainda chama exec/spawn");
});

test("[guard positivo] SKILL.md Fase D documenta o fluxo MCP hospedado", () => {
  const s = readFileSync(
    join(REPO, "skills", "scrape-stack-batch", "SKILL.md"),
    "utf8",
  );
  for (const tok of ["scrape_docs", "get_job_info", "list_jobs", "search_docs", "list_libraries"]) {
    assert.ok(s.includes(tok), `SKILL.md Fase D não menciona '${tok}'`);
  }
});

test("[guard] .mcp.json docs-mcp-server aponta para o domínio canônico hospedado", () => {
  const mcp = JSON.parse(readFileSync(join(REPO, ".mcp.json"), "utf8"));
  const entry = mcp.mcpServers?.["docs-mcp-server"];
  assert.ok(entry, ".mcp.json não tem entry docs-mcp-server");
  const url = String(entry.url || "");
  assert.ok(!url.includes("localhost:6280"), `ainda aponta para localhost:6280: ${url}`);
  assert.ok(!/a\.run\.app/.test(url), `usa URL crua Cloud Run em vez do domínio: ${url}`);
  assert.ok(url.includes("docs-mcp.nexuz.app"), `não é o domínio canônico: ${url}`);
});
