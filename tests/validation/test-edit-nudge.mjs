#!/usr/bin/env node
// Test suite: scripts/lib/edit-nudge.mjs (Camada 2 — Read/Edit/Write nudge).
// TDD-first: structural asserts on returned objects + CLI JSON output.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildNudge, isFresh, loadCache, recordInjection, clearCache, extractStandardRules } from "../../scripts/lib/edit-nudge.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";
const CLI = new URL("../../scripts/lib/edit-nudge-cli.mjs", import.meta.url).pathname;

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "nudge-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeManifest(root, frameworks) {
  const dir = join(root, ".context", "stacks");
  mkdirSync(dir, { recursive: true });
  const lines = ["spec: devflow-stack/v0", "frameworks:"];
  for (const [name, fw] of Object.entries(frameworks)) {
    lines.push(`  ${name}:`);
    for (const [k, v] of Object.entries(fw)) {
      lines.push(`    ${k}: ${typeof v === "string" ? `"${v}"` : v}`);
    }
  }
  writeFileSync(join(dir, "manifest.yaml"), lines.join("\n") + "\n");
}

function writeStandard(root, slug, fm, body) {
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  const fmLines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) fmLines.push(`${k}: [${v.map(x => `"${x}"`).join(", ")}]`);
    else if (typeof v === "object" && v !== null) {
      fmLines.push(`${k}:`);
      for (const [kk, vv] of Object.entries(v)) fmLines.push(`  ${kk}: ${vv}`);
    } else fmLines.push(`${k}: ${typeof v === "string" ? `"${v}"` : v}`);
  }
  const defaultBody = "# Standard\n## Princípios\n- foo\n";
  fmLines.push("---", "", body || defaultBody);
  writeFileSync(join(dir, `${slug}.md`), fmLines.join("\n"));
}

function writeAdr(root, slug, fm) {
  const dir = join(root, ".context", "adrs");
  mkdirSync(dir, { recursive: true });
  const fmLines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    fmLines.push(`${k}: ${typeof v === "string" ? `"${v}"` : v}`);
  }
  fmLines.push("---", "", "# ADR\n## Contexto\n## Decisão\n");
  writeFileSync(join(dir, `${slug}.md`), fmLines.join("\n"));
}

function writeRefFile(root, refRel) {
  const dir = join(root, ".context", "stacks", "refs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, ".context", "stacks", refRel), "# Ref\nfoo\n");
}

// ─── buildNudge: matching e formato ─────────────────────────────────────────

test("buildNudge: path with no matching std returns null", () => {
  const { root, cleanup } = fixture();
  try {
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0",
      applyTo: ["**/*.ts"],
    });
    const result = buildNudge({ tool: "Read", path: "src/foo.py", projectRoot: root });
    assert.equal(result, null, "no std applies to .py file");
  } finally { cleanup(); }
});

test("buildNudge: path matched by std applyTo returns nudge with std list", () => {
  const { root, cleanup } = fixture();
  try {
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0",
      applyTo: ["**/*.ts", "**/*.tsx"],
    });
    const r = buildNudge({ tool: "Read", path: "src/foo.ts", projectRoot: root });
    assert.ok(r, "expected non-null nudge");
    assert.deepEqual(r.matchedStandards, ["std-typescript"]);
    assert.equal(r.tool, "Read");
    assert.equal(r.path, "src/foo.ts");
  } finally { cleanup(); }
});

test("buildNudge: derives stack refs via std.relatedAdrs → manifest", () => {
  const { root, cleanup } = fixture();
  try {
    writeAdr(root, "001-adr-typescript-frontend-v1.0.0", {
      type: "adr", name: "adr-typescript-frontend",
      stack: "TypeScript 5.9.x", status: "Aprovado", version: "1.0.0",
    });
    writeManifest(root, {
      typescript: { version: "5.9.0", artisanalRef: "refs/typescript@5.9.0.md" },
    });
    writeRefFile(root, "refs/typescript@5.9.0.md");
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0",
      applyTo: ["**/*.ts"],
      relatedAdrs: ["adr-typescript-frontend"],
    });
    const r = buildNudge({ tool: "Read", path: "src/foo.ts", projectRoot: root });
    assert.ok(r);
    assert.equal(r.derivedRefs.length, 1, `expected 1 ref, got ${JSON.stringify(r.derivedRefs)}`);
    assert.equal(r.derivedRefs[0].lib, "typescript");
    assert.equal(r.derivedRefs[0].status, "scraped");
    assert.equal(r.derivedRefs[0].refPath, "refs/typescript@5.9.0.md");
  } finally { cleanup(); }
});

test("buildNudge: pending-scrape ref still listed (LLM knows it was declared)", () => {
  const { root, cleanup } = fixture();
  try {
    writeAdr(root, "001-adr-zod-frontend-v1.0.0", {
      type: "adr", name: "adr-zod-frontend",
      stack: "Zod 4.1", status: "Aprovado", version: "1.0.0",
    });
    writeManifest(root, {
      zod: { version: "4.1.0", artisanalRef: "refs/zod@4.1.0.md" },
    });
    writeStandard(root, "std-zod", {
      id: "std-zod", description: "Zod", version: "1.0.0",
      applyTo: ["**/*.ts"],
      relatedAdrs: ["adr-zod-frontend"],
    });
    const r = buildNudge({ tool: "Edit", path: "src/foo.ts", projectRoot: root });
    assert.ok(r);
    assert.equal(r.derivedRefs.length, 1);
    assert.equal(r.derivedRefs[0].status, "pending-scrape");
  } finally { cleanup(); }
});

// ─── Cache: silenciar repetições + TTL ──────────────────────────────────────

test("cache: recordInjection persists, loadCache returns same set", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context"), { recursive: true });
    recordInjection(root, "std-typescript");
    recordInjection(root, "std-zod");
    const c = loadCache(root);
    assert.ok(c.injected.includes("std-typescript"));
    assert.ok(c.injected.includes("std-zod"));
  } finally { cleanup(); }
});

test("buildNudge: silences std already in cache (no duplicate)", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context"), { recursive: true });
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0",
      applyTo: ["**/*.ts"],
    });
    recordInjection(root, "std-typescript");
    const r = buildNudge({ tool: "Read", path: "src/foo.ts", projectRoot: root });
    assert.equal(r, null, "std already injected — should not nudge again");
  } finally { cleanup(); }
});

test("isFresh: cache with old ts (>6h) is stale", () => {
  const sixHoursMs = 6 * 60 * 60 * 1000;
  const stale = { ts: new Date(Date.now() - sixHoursMs - 1).toISOString(), injected: ["x"] };
  const fresh = { ts: new Date().toISOString(), injected: ["x"] };
  assert.equal(isFresh(stale), false);
  assert.equal(isFresh(fresh), true);
});

test("loadCache: stale cache file is ignored, returns empty", () => {
  const { root, cleanup } = fixture();
  try {
    const cacheDir = join(root, ".context", "cache");
    mkdirSync(cacheDir, { recursive: true });
    const stale = {
      ts: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      injected: ["std-old"],
    };
    writeFileSync(join(cacheDir, "session-injected.json"), JSON.stringify(stale));
    const c = loadCache(root);
    assert.deepEqual(c.injected, [], "stale cache should reset");
  } finally { cleanup(); }
});

// ─── CLI: edit-nudge-cli.mjs ────────────────────────────────────────────────

test("CLI nudge: reads JSON {tool,path} from stdin, emits additionalContext", () => {
  const { root, cleanup } = fixture();
  try {
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0",
      applyTo: ["**/*.ts"],
    });
    const input = JSON.stringify({ tool: "Read", path: "src/foo.ts" });
    const r = spawnSync("node", [CLI, `--project=${root}`], {
      encoding: "utf-8", input,
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(r.stdout.trim().length > 0, "expected non-empty additionalContext");
    assert.match(r.stdout, /std-typescript/);
    assert.match(r.stdout, /src\/foo\.ts/);
  } finally { cleanup(); }
});

test("CLI nudge: empty output when no std applies (silent)", () => {
  const { root, cleanup } = fixture();
  try {
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0",
      applyTo: ["**/*.ts"],
    });
    const input = JSON.stringify({ tool: "Read", path: "README.md" });
    const r = spawnSync("node", [CLI, `--project=${root}`], { encoding: "utf-8", input });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "", "no std → silent (no spam)");
  } finally { cleanup(); }
});

test("CLI nudge: ignores unknown tool, silent", () => {
  const { root, cleanup } = fixture();
  try {
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0",
      applyTo: ["**/*.ts"],
    });
    const input = JSON.stringify({ tool: "Bash", path: "src/foo.ts" });
    const r = spawnSync("node", [CLI, `--project=${root}`], { encoding: "utf-8", input });
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "", "Bash tool not relevant → silent");
  } finally { cleanup(); }
});

test("CLI nudge: --record flag persists std-id to cache after emitting", () => {
  // The hook needs to record what was injected so subsequent calls in the
  // same session know to skip. Without --record, calls are stateless (useful
  // for dry-run / preview).
  const { root, cleanup } = fixture();
  try {
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0",
      applyTo: ["**/*.ts"],
    });
    const input = JSON.stringify({ tool: "Read", path: "src/foo.ts" });
    const r = spawnSync("node", [CLI, `--project=${root}`, "--record"], {
      encoding: "utf-8", input,
    });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /std-typescript/);
    // Second call should be silent
    const r2 = spawnSync("node", [CLI, `--project=${root}`, "--record"], {
      encoding: "utf-8", input,
    });
    assert.equal(r2.status, 0);
    assert.equal(r2.stdout.trim(), "", "second invocation should be cached → silent");
  } finally { cleanup(); }
});

test("clearCache: removes the cache file so next session starts clean", () => {
  // Cache TTL alone (6h) silences nudges across distinct conversations within
  // the window — clearCache is what session-start calls to prevent that.
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context"), { recursive: true });
    recordInjection(root, "std-typescript");
    assert.equal(loadCache(root).injected.length, 1, "precondition: 1 entry");
    clearCache(root);
    const c = loadCache(root);
    assert.deepEqual(c.injected, [], "after clearCache, cache must be empty");
  } finally { cleanup(); }
});

test("CLI nudge: --clear flag wipes cache and exits without reading stdin", () => {
  const { root, cleanup } = fixture();
  try {
    mkdirSync(join(root, ".context"), { recursive: true });
    recordInjection(root, "std-x");
    const r = spawnSync("node", [CLI, `--project=${root}`, "--clear"], {
      encoding: "utf-8", input: "",
    });
    assert.equal(r.status, 0);
    assert.deepEqual(loadCache(root).injected, []);
  } finally { cleanup(); }
});

// ─── Camada 3: regras (Princípios + Anti-patterns) na primeira ocorrência ──

test("extractStandardRules: parses '## Princípios' section", () => {
  const body = `# std
## Princípios
- regra A
- regra B

## Outra
foo`;
  const r = extractStandardRules(body);
  assert.match(r.principios, /regra A/);
  assert.match(r.principios, /regra B/);
  assert.equal(r.antiPatterns, "", "missing section → empty string, not undefined");
});

test("extractStandardRules: parses '## Anti-patterns' section", () => {
  const body = `# std
## Anti-patterns
| Errado | Certo |
|---|---|
| any | unknown |

## Linter`;
  const r = extractStandardRules(body);
  assert.match(r.antiPatterns, /any/);
  assert.match(r.antiPatterns, /unknown/);
});

test("extractStandardRules: returns empty fields when no recognized sections", () => {
  const r = extractStandardRules("# std\nblah blah");
  assert.equal(r.principios, "");
  assert.equal(r.antiPatterns, "");
});

test("buildNudge: first-touch injects rules in nudge.rules", () => {
  // Camada 3: na primeira aparição de um std numa sessão, o nudge inclui
  // Princípios + Anti-patterns extraídos do body — não só o id. Isso dá ao
  // LLM a regra inteira sem precisar de Read separado no std.
  const { root, cleanup } = fixture();
  try {
    const body = `# std
## Princípios
- TS strict total
- sem any

## Anti-patterns
| Errado | Certo |
|---|---|
| any | unknown |
`;
    writeStandard(root, "std-typescript", {
      id: "std-typescript", description: "TS", version: "1.0.0",
      applyTo: ["**/*.ts"],
    }, body);
    const r = buildNudge({ tool: "Read", path: "src/foo.ts", projectRoot: root });
    assert.ok(r);
    assert.ok(r.rules, "expected nudge.rules on first touch");
    assert.equal(r.rules.length, 1);
    assert.equal(r.rules[0].stdId, "std-typescript");
    assert.match(r.rules[0].principios, /TS strict/);
    assert.match(r.rules[0].antiPatterns, /any/);
  } finally { cleanup(); }
});

test("CLI nudge: first-touch text output includes Princípios block", () => {
  const { root, cleanup } = fixture();
  try {
    const body = `# std
## Princípios
- foo bar baz qux

## Anti-patterns
- WRONG: a
`;
    writeStandard(root, "std-x", {
      id: "std-x", description: "X", version: "1.0.0", applyTo: ["**/*.ts"],
    }, body);
    const input = JSON.stringify({ tool: "Read", path: "src/a.ts" });
    const r = spawnSync("node", [CLI, `--project=${root}`, "--record"], {
      encoding: "utf-8", input,
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /Princípios/, "first-touch must include Princípios header");
    assert.match(r.stdout, /foo bar baz qux/);
    // Second invocation: silenced (cache active)
    const r2 = spawnSync("node", [CLI, `--project=${root}`, "--record"], {
      encoding: "utf-8", input,
    });
    assert.equal(r2.stdout.trim(), "", "second touch silenced (no rule re-injection)");
  } finally { cleanup(); }
});

test("CLI nudge: malformed stdin input is silent (don't break the hook)", () => {
  const { root, cleanup } = fixture();
  try {
    const r = spawnSync("node", [CLI, `--project=${root}`], {
      encoding: "utf-8", input: "not json",
    });
    assert.equal(r.status, 0, "must exit 0 even on bad input");
    assert.equal(r.stdout.trim(), "");
  } finally { cleanup(); }
});
