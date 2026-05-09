#!/usr/bin/env node
// Test suite: scripts/lib/scrape-recursive.mjs — multi-page scrape via
// docs-mcp-server `scrape` subcommand + SQLite extraction.
//
// Network tests skippable via SKIP_NETWORK_TESTS=1 (CI without internet).
// Unit tests build a fake SQLite store with the same schema as
// docs-mcp-server v2.2.1 and exercise the extract path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  extractFromStore,
  recursiveScrape,
} from "../../scripts/lib/scrape-recursive.mjs";

const SKIP_NETWORK = process.env.SKIP_NETWORK_TESTS === "1";

function makeFakeStore() {
  const dir = mkdtempSync(join(tmpdir(), "fake-store-"));
  const dbPath = join(dir, "documents.db");
  const db = new DatabaseSync(dbPath);
  // Mirror real schema (only tables we actually query)
  db.exec(`
    CREATE TABLE libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      library_id INTEGER NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      depth INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      content TEXT,
      metadata TEXT
    );
  `);
  db.close();
  return { dir, dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedStore(dbPath, pages) {
  const db = new DatabaseSync(dbPath);
  db.prepare("INSERT INTO libraries (name) VALUES (?)").run("testlib");
  db.prepare("INSERT INTO versions (library_id, name) VALUES (1, ?)").run("1.0.0");
  for (const p of pages) {
    const r = db.prepare(
      "INSERT INTO pages (version_id, url, title, depth) VALUES (1, ?, ?, ?)"
    ).run(p.url, p.title || null, p.depth ?? 0);
    const pageId = r.lastInsertRowid;
    for (const chunk of p.chunks) {
      db.prepare("INSERT INTO documents (page_id, content) VALUES (?, ?)").run(pageId, chunk);
    }
  }
  db.close();
}

// ─── extractFromStore: lê SQLite e produz markdown consolidado ──────────────

test("extractFromStore: empty DB returns empty markdown + 0 pageCount", () => {
  const { dbPath, cleanup } = makeFakeStore();
  try {
    const r = extractFromStore(dbPath);
    assert.equal(r.pageCount, 0);
    assert.equal(r.chunkCount, 0);
    assert.equal(r.markdown, "");
  } finally { cleanup(); }
});

test("extractFromStore: 1 página, 1 chunk → markdown com URL header + content", () => {
  const { dbPath, cleanup } = makeFakeStore();
  try {
    seedStore(dbPath, [
      { url: "https://example.com/", title: "Intro", depth: 0, chunks: ["Hello world"] },
    ]);
    const r = extractFromStore(dbPath);
    assert.equal(r.pageCount, 1);
    assert.equal(r.chunkCount, 1);
    assert.match(r.markdown, /https:\/\/example\.com\//);
    assert.match(r.markdown, /Intro/);
    assert.match(r.markdown, /Hello world/);
  } finally { cleanup(); }
});

test("extractFromStore: múltiplas páginas → ordenadas por depth, depth 0 primeiro", () => {
  const { dbPath, cleanup } = makeFakeStore();
  try {
    seedStore(dbPath, [
      { url: "https://x.com/api", title: "API", depth: 1, chunks: ["api content"] },
      { url: "https://x.com/", title: "Index", depth: 0, chunks: ["index content"] },
      { url: "https://x.com/guide", title: "Guide", depth: 1, chunks: ["guide content"] },
    ]);
    const r = extractFromStore(dbPath);
    assert.equal(r.pageCount, 3);
    // Index (depth 0) deve aparecer antes de API e Guide (depth 1)
    const idxIdx = r.markdown.indexOf("Index");
    const apiIdx = r.markdown.indexOf("API");
    assert.ok(idxIdx < apiIdx, "depth 0 deve preceder depth 1");
  } finally { cleanup(); }
});

test("extractFromStore: múltiplos chunks por página são concatenados na ordem de id", () => {
  const { dbPath, cleanup } = makeFakeStore();
  try {
    seedStore(dbPath, [
      { url: "https://a.com/", title: "A", depth: 0, chunks: ["chunk1", "chunk2", "chunk3"] },
    ]);
    const r = extractFromStore(dbPath);
    assert.equal(r.pageCount, 1);
    assert.equal(r.chunkCount, 3);
    const c1 = r.markdown.indexOf("chunk1");
    const c2 = r.markdown.indexOf("chunk2");
    const c3 = r.markdown.indexOf("chunk3");
    assert.ok(c1 < c2 && c2 < c3, "chunks devem manter ordem");
  } finally { cleanup(); }
});

test("extractFromStore: page sem chunks (orphan page) é ignorada", () => {
  const { dbPath, cleanup } = makeFakeStore();
  try {
    const db = new DatabaseSync(dbPath);
    db.prepare("INSERT INTO libraries (name) VALUES (?)").run("testlib");
    db.prepare("INSERT INTO versions (library_id, name) VALUES (1, ?)").run("1.0.0");
    // Page sem documents associados
    db.prepare("INSERT INTO pages (version_id, url, title, depth) VALUES (1, ?, ?, ?)")
      .run("https://orphan.com/", "Orphan", 0);
    db.close();
    const r = extractFromStore(dbPath);
    assert.equal(r.pageCount, 0, "página sem chunks não conta");
  } finally { cleanup(); }
});

test("extractFromStore: throws claro quando DB não existe", () => {
  assert.throws(
    () => extractFromStore("/tmp/devflow-nonexistent-db-xyz.sqlite"),
    /not found|does not exist|ENOENT/i
  );
});

// ─── recursiveScrape: real network (smoke) ──────────────────────────────────

test("recursiveScrape: smoke contra zod.dev (network)", { skip: SKIP_NETWORK }, async () => {
  // Smoke real: roda scrape contra zod.dev/ com max-pages=5 (cap baixo para
  // teste rápido). Espera ≥3 páginas (zod.dev/ + algumas sub-rotas linkadas).
  const r = await recursiveScrape({
    library: "zod",
    version: "4.1.0",
    url: "https://zod.dev/",
    maxPages: 5,
    maxDepth: 2,
    scope: "hostname",
  });
  assert.ok(r.pageCount >= 3, `esperado ≥3 páginas, got ${r.pageCount}`);
  assert.ok(r.markdown.length > 5000, `esperado >5KB de markdown, got ${r.markdown.length}`);
  assert.match(r.markdown, /zod/i, "markdown deve conter conteúdo do zod");
});
