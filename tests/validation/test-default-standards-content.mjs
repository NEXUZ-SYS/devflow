#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const DIR = "assets/standards";
const UNIVERSAL = ["std-security","std-runtime-validation","std-error-handling","std-test-discipline",
  "std-observability","std-performance","std-documentation","std-code-review","std-grounding",
  "std-naming-conventions","std-migration","std-data-modeling","std-api-conventions",
  "std-secret-conventions","std-schemas","std-commit-hygiene"];
const CONDITIONAL = ["std-accessibility","std-internationalization","std-caching","std-state-management"];

test("todos os defaults universais + condicionais existem", () => {
  for (const id of [...UNIVERSAL, ...CONDITIONAL])
    assert.ok(existsSync(join(DIR, `${id}.md`)), `falta ${id}.md`);
});

test("cada default é concern-first, warn-only, frontmatter completo (estrutural)", () => {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
    const { data, body } = parseFrontmatter(readFileSync(join(DIR, f), "utf-8"));
    assert.ok(data.id?.startsWith("std-"), `${f}: id deve começar com std-`);
    assert.ok(!/^std-(zod|postgres|firebase|react|next|express)\b/.test(data.id), `${f}: id lib-centric (ADR-002 S7)`);
    assert.equal(data.source, "devflow-default", `${f}: source deve ser devflow-default`);
    assert.equal(data.enforcement?.linter ?? null, null, `${f}: default é warn-only (linter null)`);
    assert.ok(Array.isArray(data.applyTo) && data.applyTo.length, `${f}: applyTo obrigatório`);
    assert.ok(data.description && data.version, `${f}: description+version obrigatórios`);
    assert.ok(/## Princípios|## Anti-patterns/.test(body), `${f}: corpo sem seções`);
    assert.doesNotMatch(body, /<!--\s*TODO/i, `${f}: placeholder de scaffold (estrutural) presente`);
  }
});

test("NÃO há contracts DB-específicos nos defaults", () => {
  for (const bad of ["std-postgres","std-pgvector","std-bigquery","std-firebase-firestore"])
    assert.ok(!existsSync(join(DIR, `${bad}.md`)), `${bad} não deveria ser default (vai pro stacks)`);
});
