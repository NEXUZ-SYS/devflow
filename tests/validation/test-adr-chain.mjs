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

// v1.1: stackIdBoost — handles asymmetric token sizes via direct stack-name match
test("findRelatedStandards: matches via stackIdBoost when token overlap is low (asymmetric size)", () => {
  const { root, cleanup } = fixture();
  // Small std (5 tokens), large ADR (~50 tokens with verbose guardrails)
  writeStd(root, "std-zod", {
    description: "schema validation runtime",
    applyTo: ["**/*.ts"],
  });
  const r = findRelatedStandards(
    {
      name: "adr-zod-bff",
      description: "Zod schema validation in BFF",
      stack: "Zod",   // matches std-zod core after strip
      // Large guardrailsText simulates verbose body — Jaccard would dilute, overlap+boost handles it
      guardrailsText: "SEMPRE Schema.parse await request.json primeira linha POST PUT PATCH handler ".repeat(10),
    },
    root
  );
  assert.ok(r.matches.length >= 1, "expected match via stackIdBoost");
  assert.equal(r.matches[0].id, "std-zod");
  assert.ok(r.matches[0].score >= 0.50, `expected score >=0.50 from stackIdBoost, got ${r.matches[0].score}`);
  cleanup();
});

test("findRelatedStandards: stackIdBoost strips camada suffix from std.id", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-typescript-frontend", {
    description: "TS",
    applyTo: ["**/*.ts"],
  });
  const r = findRelatedStandards(
    { name: "adr-typescript-bff", description: "TS in BFF", stack: "TypeScript" },
    root
  );
  // std-typescript-frontend → strip "-frontend" → "typescript" → matches "TypeScript"
  assert.ok(r.matches.length >= 1);
  assert.equal(r.matches[0].id, "std-typescript-frontend");
  cleanup();
});

test("findRelatedStandards: stackIdBoost handles dotted stack names (Next.js → nextjs)", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-nextjs", {
    description: "Next framework conventions",
    applyTo: ["src/app/**"],
  });
  const r = findRelatedStandards(
    { name: "adr-nextjs-frontend", description: "Next 16 in Frontend", stack: "Next.js" },
    root
  );
  assert.ok(r.matches.length >= 1);
  assert.equal(r.matches[0].id, "std-nextjs");
  cleanup();
});

test("findRelatedStandards: stackIdBoost does NOT match unrelated libs", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-typescript", { description: "TS", applyTo: ["**/*.ts"] });
  const r = findRelatedStandards(
    { name: "adr-ruff-backend", description: "Python linter", stack: "ruff" },
    root
  );
  // ruff !== typescript — should not match
  assert.equal(r.matches.length, 0, "should not match TS std for Ruff ADR");
  cleanup();
});

// Patch (b) regression — strip 'adr-' prefix (and v1.2: camada suffix)
test("findRelatedStandards: strips 'adr-' prefix from wouldCreate slug", () => {
  const { root, cleanup } = fixture();
  const r1 = findRelatedStandards(
    { name: "adr-typescript-frontend", description: "x" },
    root
  );
  // v1.2: also strips '-frontend' camada suffix → consolidated std-typescript
  assert.equal(r1.wouldCreate, "std-typescript");

  const r2 = findRelatedStandards(
    { name: "adr-zod-bff", description: "y" },
    root
  );
  assert.equal(r2.wouldCreate, "std-zod");

  // 'adr-' + 'adopt-' compose: strip both
  const r3 = findRelatedStandards(
    { name: "adr-adopt-pino-logging", description: "z" },
    root
  );
  assert.equal(r3.wouldCreate, "std-pino-logging");
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

// v1.1: category gate removed — extracts from any category
test("extractStackMentions: extracts from non-arquitetura categories (v1.1)", () => {
  const adr = {
    category: "principios-codigo",
    body: "ruff@0.9.0 with pytest@8.0.0",
  };
  const m = extractStackMentions(adr);
  const ids = m.map(x => `${x.lib}@${x.version}`).sort();
  assert.deepEqual(ids, ["pytest@8.0.0", "ruff@0.9.0"]);
});

test("extractStackMentions: extracts from qualidade-testes category (v1.1)", () => {
  const adr = {
    category: "qualidade-testes",
    body: "zod@4.1.0 + vitest@1.6.0 + msw@2.0.0",
  };
  const m = extractStackMentions(adr);
  const ids = m.map(x => `${x.lib}@${x.version}`).sort();
  assert.deepEqual(ids, ["msw@2.0.0", "vitest@1.6.0", "zod@4.1.0"]);
});

test("extractStackMentions: rejects path-traversal-shaped lib names (re-uses input-resolver safety)", () => {
  const adr = {
    category: "arquitetura",
    body: "Adopt ../../../tmp/pwned@1.0.0 right now",
  };
  assert.deepEqual(extractStackMentions(adr), []);
});

// Patch (a) regression — tolerant version regex + normalization
test("extractStackMentions: accepts x.y.x wildcard and normalizes to x.y.0", () => {
  const adr = {
    category: "arquitetura",
    body: "Use next@16.2.x and react@19.0.x in this layer.",
  };
  const m = extractStackMentions(adr);
  const ids = m.map(x => `${x.lib}@${x.version}`).sort();
  assert.deepEqual(ids, ["next@16.2.0", "react@19.0.0"]);
});

test("extractStackMentions: accepts bare major or major.minor and pads to x.y.z", () => {
  const adr = {
    category: "arquitetura",
    body: "We pin next@16 and prisma@5.18 in this project.",
  };
  const m = extractStackMentions(adr);
  const ids = m.map(x => `${x.lib}@${x.version}`).sort();
  assert.deepEqual(ids, ["next@16.0.0", "prisma@5.18.0"]);
});

test("extractStackMentions: preserves pre-release suffix after normalization", () => {
  const adr = {
    category: "arquitetura",
    body: "Use react@19.0.0-rc.1 for the new server actions API.",
  };
  const m = extractStackMentions(adr);
  assert.equal(m.length, 1);
  assert.equal(m[0].lib, "react");
  assert.equal(m[0].version, "19.0.0-rc.1");
});

test("extractStackMentions: dedups identical normalized versions", () => {
  const adr = {
    category: "arquitetura",
    body: "next@16.2.x in middleware. next@16.2.0 in layout. next@16.2 in pages.",
  };
  const m = extractStackMentions(adr);
  // All three forms normalize to next@16.2.0 — should dedup to 1
  assert.equal(m.length, 1);
  assert.equal(m[0].version, "16.2.0");
});

test("extractStackMentions: skips degenerate '0' bare version", () => {
  const adr = {
    category: "arquitetura",
    body: "There are 0 issues in milestone foo@0.",  // noise
  };
  // foo@0 normalizes to 0.0.0 — degenerate, dropped
  const m = extractStackMentions(adr);
  assert.deepEqual(m, []);
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

// ─── Bug #4: dedup-stricter LINK gate (regression from manual fixture run) ───
// Failing case observed: ADR(stack="Zod") matched std-react-frontend at 0.33
// because both shared the "frontend" token — a cross-domain false positive.
// Fix: require either tokenOverlap >= 0.50 OR stackIdBoost > 0 (stack identity).

test("findRelatedStandards: rejects cross-domain match (Zod ADR vs std-react-frontend, shared 'frontend' only)", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-react-frontend", {
    description: "React frontend conventions",
    applyTo: ["src/**/*.tsx"],
  });
  const r = findRelatedStandards(
    {
      name: "adr-zod-frontend",
      description: "Zod 4.1 schema validation runtime no Frontend",
      stack: "Zod 4.1",
      guardrailsText: "SEMPRE parse no boundary",
    },
    root
  );
  assert.deepEqual(r.matches, [],
    "Zod ADR must NOT match std-react-frontend via shared 'frontend' token alone");
  // v1.2: deriveStdId strips camada suffix → consolidated std-zod
  assert.equal(r.wouldCreate, "std-zod",
    "should fall through to CREATE consolidated std-zod (no camada suffix)");
  cleanup();
});

test("findRelatedStandards: accepts same-stack match (Zod ADR vs std-zod-bff via stackIdBoost)", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-zod-bff", {
    description: "Zod schemas at BFF boundary",
    applyTo: ["src/app/api/**/*.ts"],
  });
  const r = findRelatedStandards(
    {
      name: "adr-zod-frontend",
      description: "Zod 4.1 schema validation runtime no Frontend",
      stack: "Zod",
      guardrailsText: "SEMPRE parse",
    },
    root
  );
  assert.equal(r.matches.length, 1, "stack identity should drive LINK across camadas");
  assert.equal(r.matches[0].id, "std-zod-bff");
  cleanup();
});

test("findRelatedStandards: rejects pytest ADR vs std-python-backend (lib/lang shared word 'backend' only)", () => {
  const { root, cleanup } = fixture();
  writeStd(root, "std-python-backend", {
    description: "Python language conventions for the backend layer",
    applyTo: ["**/*.py"],
  });
  const r = findRelatedStandards(
    {
      name: "adr-pytest-backend",
      description: "pytest 8.x test runner no Backend FastAPI",
      stack: "pytest 8.x",
      guardrailsText: "SEMPRE arrange-act-assert",
    },
    root
  );
  assert.deepEqual(r.matches, [],
    "pytest ADR must NOT collapse onto std-python-backend (different domains: lang vs testing)");
  cleanup();
});

test("findRelatedStandards: keeps strong textual match even without stackIdBoost", () => {
  const { root, cleanup } = fixture();
  // Standard with description that overlaps heavily with ADR description,
  // but stack id is unrelated — strong textual signal alone should LINK.
  writeStd(root, "std-error-handling-strategy", {
    description: "BaseError ServiceError hierarchy retry idempotency",
    applyTo: ["src/**"],
  });
  const r = findRelatedStandards(
    {
      name: "adr-error-handling",
      description: "BaseError ServiceError hierarchy retry idempotency policy",
      stack: "TypeScript",
      guardrailsText: "SEMPRE chain BaseError",
    },
    root
  );
  assert.ok(r.matches.length >= 1,
    "high textual overlap (>=0.50) should LINK without needing stackIdBoost");
  cleanup();
});

// ─── Bug #5: prose-form stack mention extraction (manifest-as-source-of-truth) ───
// Failing case observed: ADRs write "Next.js 16.2.x" / "Zod 4.1" (natural prose),
// but extractStackMentions only matched the strict <lib>@<version> form. Result:
// every chain-suggest call returned `stacks: []`, blocking scrape/link/drift offers.
// Fix: tier-2 prose extraction restricted to libs already declared in manifest.yaml
// (avoids false positives like "Section 1.2"); accepts display-name aliases.

test("extractStackMentions: prose form matched when lib declared in manifest", () => {
  const { root, cleanup } = fixture();
  writeManifest(root, {
    next: { version: "16.2.0", artisanalRef: "refs/next@16.2.0.md" },
    zod:  { version: "4.1.0", artisanalRef: "refs/zod@4.1.0.md" },
  });
  const adr = {
    description: "Next.js 16.2.x como framework Frontend; valida com Zod 4.1.",
    body: "Adotar Next.js 16.2.x. Esquemas via Zod 4.1.",
  };
  const mentions = extractStackMentions(adr, { projectRoot: root });
  const libs = mentions.map(m => m.lib).sort();
  assert.deepEqual(libs, ["next", "zod"],
    "prose form 'Next.js 16.2.x' and 'Zod 4.1' should be detected via manifest");
  const next = mentions.find(m => m.lib === "next");
  assert.equal(next.version, "16.2.0", "version should be normalized to x.y.z");
  cleanup();
});

test("extractStackMentions: prose form ignored when manifest is empty (no false positives)", () => {
  const { root, cleanup } = fixture();
  writeManifest(root, {});
  const adr = {
    description: "Section 1.2 mentions Phase 3.0 of Process 2.5",
    body: "TypeScript 5.9.x and Next.js 16 are mentioned but not declared",
  };
  const mentions = extractStackMentions(adr, { projectRoot: root });
  assert.deepEqual(mentions, [],
    "without manifest declarations, prose form must not produce any mentions");
  cleanup();
});

test("extractStackMentions: strict @-form still works without manifest (tier-1 unchanged)", () => {
  const { root, cleanup } = fixture();
  // No manifest — tier-1 strict regex must keep working for new libs
  const adr = {
    description: "Discovered new lib: vitest@2.1.0",
    body: "Adopt vitest@2.1.0 across all packages",
  };
  const mentions = extractStackMentions(adr, { projectRoot: root });
  assert.ok(mentions.find(m => m.lib === "vitest" && m.version === "2.1.0"),
    "strict <lib>@<version> form must keep working without manifest (Tier 1)");
  cleanup();
});

// ─── Consolidated std naming: strip camada-suffix in deriveStdId ────────────
// Convention: one std per lib, applyTo widens across camadas. Avoids the v1.0
// per-camada explosion (std-zod-frontend / std-zod-bff / std-zod-data-infra).

test("findRelatedStandards: wouldCreate strips camada-suffix (consolidates std-X across camadas)", () => {
  const { root, cleanup } = fixture();
  const r1 = findRelatedStandards(
    { name: "adr-zod-frontend", description: "Zod no Frontend", stack: "Zod" },
    root
  );
  assert.equal(r1.wouldCreate, "std-zod", "frontend ADR → consolidated std-zod");

  const r2 = findRelatedStandards(
    { name: "adr-zod-bff", description: "Zod no BFF", stack: "Zod" },
    root
  );
  assert.equal(r2.wouldCreate, "std-zod", "bff ADR → same consolidated std-zod");

  const r3 = findRelatedStandards(
    { name: "adr-typescript-data-infra", description: "TS infra", stack: "TypeScript" },
    root
  );
  assert.equal(r3.wouldCreate, "std-typescript", "data-infra suffix stripped");

  const r4 = findRelatedStandards(
    { name: "adr-husky-lint-staged-frontend", description: "Husky", stack: "Husky" },
    root
  );
  assert.equal(r4.wouldCreate, "std-husky-lint-staged", "multi-word slug strips only trailing camada");

  cleanup();
});

test("findRelatedStandards: deriveStdId leaves slug intact when no camada suffix", () => {
  const { root, cleanup } = fixture();
  const r = findRelatedStandards(
    { name: "adr-error-handling-strategy", description: "Error handling", stack: "TypeScript" },
    root
  );
  // -strategy suffix stripped, no camada suffix to strip
  assert.equal(r.wouldCreate, "std-error-handling");
  cleanup();
});

test("extractStackMentions: prose form does not require manifest when called without projectRoot (back-compat)", () => {
  // Caller without projectRoot (older callers) should still get tier-1 results
  const adr = {
    description: "Ref to next@16.2.0",
    body: "",
  };
  const mentions = extractStackMentions(adr);
  assert.ok(mentions.find(m => m.lib === "next" && m.version === "16.2.0"),
    "tier-1 strict form must keep working with single-arg back-compat call");
});
