// Test ensures Step 3.5 (ADR opportunity check, cross-aware) is wired into prevc-planning.
// Doc-test approach: parse SKILL.md text and assert structural elements.
// Atualizado para o design cross-aware (feature adr-decisao-prevc, 2026-06):
// a regra de detecção/ação agora vive em scripts/adr-decision.mjs (lib testável);
// o Step 3.5 oferece EVOLVE/CREATE/silêncio cruzando com ADRs já carregadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SKILL = readFileSync('./skills/prevc-planning/SKILL.md', 'utf-8');

function extractSection(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  // próximo heading nível-2 REAL ('\n## ' não casa '\n### ')
  const next = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, next === -1 ? text.length : next);
}

test('Step 3.5 exists between Step 3 and Step 4', () => {
  const idx3 = SKILL.indexOf('## Step 3: Enrich Spec');
  const idx35 = SKILL.indexOf('## Step 3.5');
  const idx4 = SKILL.indexOf('## Step 4: Write Plan');
  assert.ok(idx3 < idx35 && idx35 < idx4, 'Step 3.5 must sit between Step 3 and Step 4');
});

test('Step 3.5 declara os 4 sinais (grafia cross-aware)', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  for (const sig of ['não-trivial', 'afeta stack/arquitetura', 'alternativas', 'implica guardrails']) {
    assert.match(section, new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `signal missing: ${sig}`);
  }
});

test('Step 3.5 declara heurística 3/4 (núcleo + reforço)', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  assert.match(section, /3\/4/);
  assert.match(section, /n[úu]cleo/i);
  assert.match(section, /refor[çc]o/i);
});

test('Step 3.5 é cross-aware: declara as 4 relações', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  for (const rel of ['contradicts', 'extends', 'aligned', 'none']) {
    assert.match(section, new RegExp(rel), `relation missing: ${rel}`);
  }
});

test('Step 3.5 declara as 3 ações (silent/evolve/create)', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  assert.match(section, /"silent"/);
  assert.match(section, /"evolve"/);
  assert.match(section, /"create"/);
});

test('Step 3.5 invoca a lib adr-decision (evaluate e decide)', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  assert.match(section, /adr-decision\.mjs evaluate/);
  assert.match(section, /adr-decision\.mjs decide/);
});

test('Step 3.5 oferece EVOLVE e CREATE conforme o cruzamento', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  assert.match(section, /adr:evolve/);            // ramo evolve usa <command> preenchido pela lib
  assert.match(section, /\/devflow adr:new/);     // ramo create cita o comando literal
  assert.match(section, /--mode=prefilled/);
});

test('Step 3.5: opt-out skip_adr_offer cobre todo o workflow', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  assert.match(section, /skip_adr_offer/);
  assert.match(section, /todo o workflow/i);
});
