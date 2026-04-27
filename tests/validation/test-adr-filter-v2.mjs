// Test that adr-filter SKILL.md was updated for v2 schema (14 cols + Kind filter).
// Self-contained — does not depend on Phase 3 migration of 001/002 (per A2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SKILL = readFileSync('./skills/adr-filter/SKILL.md', 'utf-8');

test('adr-filter Step 1 documents v2 schema (14 cols)', () => {
  for (const col of ['versão', 'categoria', 'kind', 'refines', 'supersedes', 'contrato', 'criada']) {
    assert.match(SKILL, new RegExp(col, 'i'), `column ${col} not documented`);
  }
});

test('adr-filter Step 4c declares status filter rules', () => {
  assert.match(SKILL, /4c.*[Ff]iltro de status/);
  assert.match(SKILL, /Aprovado.*passa/);
  assert.match(SKILL, /Proposto.*\[proposto\]/);
  assert.match(SKILL, /Substituido.*rejeita/);
});

test('adr-filter Step 4d declares Kind filter (NEW code, not just parsing)', () => {
  assert.match(SKILL, /4d.*[Ff]iltro de kind/);
  assert.match(SKILL, /firm.*sem tag/);
  assert.match(SKILL, /gated.*\[gated\]/);
  assert.match(SKILL, /reversible.*\[experimental\]/);
});

test('adr-filter Step 6 emits tags in ADR name', () => {
  assert.match(SKILL, /\[firm\]/);
  assert.match(SKILL, /\[experimental\]/);
  assert.match(SKILL, /\[proposto\]/);
});

test('adr-filter Step 1 supports both v1 and v2 schemas (graceful fallback)', () => {
  assert.match(SKILL, /v1 schema/);
  assert.match(SKILL, /v2 schema/);
});

test('adr-filter rejects Substituido/Descontinuado per Hard Rule #12', () => {
  assert.match(SKILL, /Substituido.*rejeita|Descontinuado.*rejeita/i);
});

// Regression: existing structure (Steps 1-6, anti-patterns, examples) must still be present
test('regression: existing skill structure preserved', () => {
  for (const heading of ['### Step 1', '### Step 2', '### Step 3', '### Step 4', '### Step 5', '### Step 6', '## Anti-patterns']) {
    assert.match(SKILL, new RegExp(heading.replace(/[#-]/g, '\\$&')), `heading missing: ${heading}`);
  }
});
