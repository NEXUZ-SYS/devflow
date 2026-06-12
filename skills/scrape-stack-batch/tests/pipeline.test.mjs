#!/usr/bin/env node
// skills/scrape-stack-batch/tests/pipeline.test.mjs
// Unit tests for pipeline.mjs. Fase B: pipeline populates global
// docs-mcp-server store directly — no .md file output, no consolidate
// stage. Heavy smoke test (real scrape) gated by RUN_SMOKE=1 (~30s + network).

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "../scripts/pipeline.mjs";

test("resolve: accepts valid library@version + url", async () => {
  const r = await resolve({
    library: "next",
    version: "15.0.0",
    url: "https://github.com/vercel/next.js",
    type: "github",
  });
  assert.equal(r.library, "next");
  assert.equal(r.version, "15.0.0");
  assert.equal(r.url, "https://github.com/vercel/next.js");
  assert.equal(r.type, "github");
});

test("resolve: rejects invalid library name (shell metachars)", async () => {
  await assert.rejects(
    resolve({ library: "evil; rm -rf", version: "1.0.0", url: "https://example.com" }),
    /invalid library/i
  );
});

test("resolve: rejects path-traversal library name (CRITICAL audit fix)", async () => {
  await assert.rejects(
    resolve({ library: "../../../tmp/pwned", version: "1.0.0", url: "https://example.com" }),
    /traversal|invalid library/i
  );
  await assert.rejects(
    resolve({ library: "../etc/passwd", version: "1.0.0", url: "https://example.com" }),
    /traversal|invalid library/i
  );
  await assert.rejects(
    resolve({ library: "/etc/passwd", version: "1.0.0", url: "https://example.com" }),
    /invalid library/i
  );
});

test("resolve: rejects invalid version (whitespace)", async () => {
  await assert.rejects(
    resolve({ library: "foo", version: "1.0 .0", url: "https://example.com" }),
    /invalid version/i
  );
});

test("resolve: rejects SSRF URL (cloud metadata)", async () => {
  await assert.rejects(
    resolve({
      library: "foo",
      version: "1.0.0",
      url: "https://169.254.169.254/",
    }),
    /denied|metadata/i
  );
});

test("resolve: rejects missing url", async () => {
  await assert.rejects(
    resolve({ library: "foo", version: "1.0.0" }),
    /url required/i
  );
});

// Fase "hosted MCP": runPipeline NÃO executa scrape — apenas valida e devolve
// o spec que a skill passa para mcp__docs-mcp-server__scrape_docs. Quem indexa
// é a tool MCP contra o servidor hospedado, orquestrada pela skill. Logo este
// teste é puro (sem rede, sem gate) e NÃO afirma `indexed`.
test("runPipeline: devolve o scrape spec validado (sem executar scrape, sem 'indexed')", async () => {
  const { runPipeline } = await import("../scripts/pipeline.mjs");
  const spec = await runPipeline({
    library: "is-odd",
    version: "4.0.0",
    url: "https://github.com/i-voted-for-trump/is-odd",
    type: "github",
  });
  assert.equal(spec.library, "is-odd");
  assert.equal(spec.version, "4.0.0");
  assert.equal(spec.url, "https://github.com/i-voted-for-trump/is-odd");
  assert.equal(spec.type, "github");
  // knobs default repassados à tool MCP (scope/maxPages/maxDepth)
  assert.equal(spec.scope, "hostname");
  assert.equal(spec.maxPages, 50);
  assert.equal(spec.maxDepth, 3);
  // contrato novo: NÃO afirma indexação (quem indexa é a tool MCP hospedada)
  assert.equal("indexed" in spec, false);
});

test("runPipeline: rejeita URL SSRF antes de produzir o spec (SI-3 client-side)", async () => {
  const { runPipeline } = await import("../scripts/pipeline.mjs");
  await assert.rejects(
    runPipeline({ library: "foo", version: "1.0.0", url: "https://169.254.169.254/" }),
    /denied|metadata/i,
  );
});
