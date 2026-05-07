#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  findRelatedStandards,
  findStandardsLinkingAdr,
  extractStackMentions,
  findStackMatches,
  adrHasGuardrails,
} from "../../scripts/lib/adr-chain.mjs";

const TEST_TMP_ROOT = "./tests/validation/tmp/";

function fixture() {
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "chain-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeStd(root, id, fm) {
  const dir = join(root, ".context", "standards");
  mkdirSync(dir, { recursive: true });
  const yaml = [
    "---",
    `id: ${id}`,
    `description: ${fm.description || id}`,
    `version: 1.0.0`,
    `applyTo: ${JSON.stringify(fm.applyTo || ["**/*"])}`,
    `relatedAdrs: ${JSON.stringify(fm.relatedAdrs || [])}`,
    fm.linter ? `enforcement:\n  linter: ${fm.linter}` : "",
    "---",
    "",
    `# ${id}`,
  ].filter(Boolean).join("\n");
  writeFileSync(join(dir, `${id}.md`), yaml + "\n");
}

function writeManifest(root, frameworks) {
  const dir = join(root, ".context", "stacks");
  mkdirSync(dir, { recursive: true });
  const fwLines = Object.entries(frameworks).flatMap(([name, fw]) => {
    const lines = [`  ${name}:`];
    for (const [k, v] of Object.entries(fw)) {
      lines.push(`    ${k}: ${typeof v === "string" ? `"${v}"` : v}`);
    }
    return lines;
  });
  writeFileSync(
    join(dir, "manifest.yaml"),
    ["spec: devflow-stack/v0", "frameworks:", ...fwLines].join("\n") + "\n"
  );
}

// ─── findRelatedStandards ──────────────────────────────────────────────────

test("findRelatedStandards: empty when no standards exist", () => {
  const { root, cleanup } = fixture();
  const r = findRelatedStandards(
    { name: "anything", description: "x", stack: "universal" },
    root
  );
  assert.deepEqual(r.matches, []);
  assert.equal(r.wouldCreate, "std-anything");
  cleanup();
});

test("findRelatedStandards: keyword overlap → match", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-error-handling", {
    description: "How errors are thrown, caught, and propagated",
    applyTo: ["src/**/*.ts"],
  });
  const r = findRelatedStandards(
    {
      name: "error-handling-strategy",
      description: "BaseError pattern + ServiceError hierarchy",
      stack: "typescript",
      guardrailsText: "SEMPRE error chain",
    },
    root
  );
  assert.ok(r.matches.length >= 1, "expected at least 1 match");
  assert.equal(r.matches[0].id, "std-error-handling");
  assert.equal(r.wouldCreate, null, "should not suggest create when match found");
  cleanup();
});

test("findRelatedStandards: stack boost increases score for matching extensions", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-naming", {
    description: "naming conventions",
    applyTo: ["src/**/*.ts"],
  });
  const r = findRelatedStandards(
    { name: "naming-rules", description: "naming conventions for code", stack: "typescript" },
    root
  );
  // Stack boost should bump the jaccard above threshold even if minimal token overlap
  assert.ok(r.matches.length >= 1);
  cleanup();
});

test("findRelatedStandards: skips already-linked standards", () => {
  const { root, cleanup } = fixture();
  // std-error-handling is already linked to this ADR
  writeStd(root, "std-error-handling", {
    description: "error handling rules",
    applyTo: ["src/**/*.ts"],
    relatedAdrs: ["error-handling-strategy"],
  });
  // std-naming is unrelated (no overlap)
  writeStd(root, "std-naming", {
    description: "naming conventions for variables",
    applyTo: ["src/**/*.ts"],
  });
  const r = findRelatedStandards(
    {
      name: "error-handling-strategy",
      description: "error handling rules",
      stack: "typescript",
    },
    root
  );
  // The already-linked std-error-handling is excluded; std-naming has no overlap.
  // Matches should NOT contain std-error-handling.
  const matchIds = r.matches.map(m => m.id);
  assert.ok(!matchIds.includes("std-error-handling"),
    "already-linked std-error-handling must be excluded");
  cleanup();
});

test("findRelatedStandards: returns top-3 sorted by score", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-auth-jwt", { description: "JWT auth rules" });
  writeStd(root, "std-auth-session", { description: "session cookies" });
  writeStd(root, "std-error-handling", { description: "errors" });
  writeStd(root, "std-naming", { description: "naming" });
  const r = findRelatedStandards(
    { name: "jwt-auth-strategy", description: "JWT auth and session", stack: "typescript" },
    root
  );
  assert.ok(r.matches.length <= 3);
  if (r.matches.length >= 2) {
    assert.ok(r.matches[0].score >= r.matches[1].score);
  }
  cleanup();
});

test("findRelatedStandards: derives wouldCreate slug stripping common ADR suffixes", () => {
  const { root, cleanup } = fixture();
  const r = findRelatedStandards(
    { name: "adopt-base-error-strategy", description: "x" },
    root
  );
  // Should drop "adopt-" prefix and "-strategy" suffix
  assert.equal(r.wouldCreate, "std-base-error");
  cleanup();
});

// ─── findStandardsLinkingAdr (Check #13 helper) ────────────────────────────

test("findStandardsLinkingAdr: finds standards that reference ADR by slug", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-foo", { relatedAdrs: ["error-handling-strategy"] });
  writeStd(root, "std-bar", { relatedAdrs: [] });
  const linked = findStandardsLinkingAdr("error-handling-strategy", root);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].id, "std-foo");
  cleanup();
});

test("findStandardsLinkingAdr: empty when no standard references ADR", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-foo", { relatedAdrs: ["other-adr"] });
  const linked = findStandardsLinkingAdr("error-handling-strategy", root);
  assert.equal(linked.length, 0);
  cleanup();
});

// ─── extractStackMentions ──────────────────────────────────────────────────

test("extractStackMentions: extracts <lib>@<version> from arquitetura ADR", () => {
  const adr = {
    category: "arquitetura",
    description: "Adopt Next.js 15.0.0",
    body: "We will use next@15.0.0 and react@19.0.0 with prisma@5.18.0.",
  };
  const m = extractStackMentions(adr);
  const ids = m.map(x => `${x.lib}@${x.version}`).sort();
  assert.deepEqual(ids, ["next@15.0.0", "prisma@5.18.0", "react@19.0.0"]);
});

test("extractStackMentions: dedups repeats", () => {
  const adr = {
    category: "arquitetura",
    body: "next@15.0.0 in middleware. next@15.0.0 in pages. ",
  };
  const m = extractStackMentions(adr);
  assert.equal(m.length, 1);
});

test("extractStackMentions: empty for non-arquitetura categories", () => {
  const adr = {
    category: "principios-codigo",
    body: "next@15.0.0 with react@19.0.0",
  };
  assert.deepEqual(extractStackMentions(adr), []);
});

test("extractStackMentions: rejects path-traversal-shaped lib names (re-uses input-resolver safety)", () => {
  const adr = {
    category: "arquitetura",
    body: "Adopt ../../../tmp/pwned@1.0.0 right now",
  };
  assert.deepEqual(extractStackMentions(adr), []);
});

// ─── findStackMatches ──────────────────────────────────────────────────────

test("findStackMatches: status='linked' when version matches manifest", () => {
  const { root, cleanup } = fixture();
  writeManifest(root, {
    next: { version: "15.0.0", artisanalRef: "refs/next@15.0.0.md" },
  });
  const r = findStackMatches([{ lib: "next", version: "15.0.0" }], root);
  assert.equal(r[0].status, "linked");
  assert.equal(r[0].existingRef, "refs/next@15.0.0.md");
  cleanup();
});

test("findStackMatches: status='drift' when manifest has different version", () => {
  const { root, cleanup } = fixture();
  writeManifest(root, {
    next: { version: "15.0.0", artisanalRef: "refs/next@15.0.0.md" },
  });
  const r = findStackMatches([{ lib: "next", version: "16.0.0" }], root);
  assert.equal(r[0].status, "drift");
  assert.equal(r[0].currentVersion, "15.0.0");
  cleanup();
});

test("findStackMatches: status='new' when lib absent from manifest", () => {
  const { root, cleanup } = fixture();
  writeManifest(root, {
    next: { version: "15.0.0", artisanalRef: "refs/next@15.0.0.md" },
  });
  const r = findStackMatches([{ lib: "jose", version: "5.0.0" }], root);
  assert.equal(r[0].status, "new");
  cleanup();
});

test("findStackMatches: status='skipped' when manifest has skipDocs:true", () => {
  const { root, cleanup } = fixture();
  writeManifest(root, {
    postgres: { version: "17.0.0", skipDocs: true },
  });
  const r = findStackMatches([{ lib: "postgres", version: "18.0.0" }], root);
  assert.equal(r[0].status, "skipped");
  cleanup();
});

// ─── adrHasGuardrails ──────────────────────────────────────────────────────

test("adrHasGuardrails: detects ## Guardrails heading", () => {
  assert.equal(adrHasGuardrails("# ADR\n\n## Guardrails\n- rule"), true);
  assert.equal(adrHasGuardrails("# ADR\n\n## Decisão\n- x"), false);
  assert.equal(adrHasGuardrails(""), false);
  assert.equal(adrHasGuardrails(null), false);
});
