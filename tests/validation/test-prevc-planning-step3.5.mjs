// Test ensures Step 3.5 (ADR opportunity check) is wired into prevc-planning.
// Doc-test approach: parse SKILL.md text and assert structural elements per spec §6.4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SKILL = readFileSync('./skills/prevc-planning/SKILL.md', 'utf-8');

function extractSection(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const next = text.indexOf('## ', start + heading.length);
  return text.slice(start, next === -1 ? text.length : next);
}

test('Step 3.5 exists between Step 3 and Step 4', () => {
  const idx3 = SKILL.indexOf('## Step 3: Enrich Spec');
  const idx35 = SKILL.indexOf('## Step 3.5');
  const idx4 = SKILL.indexOf('## Step 4: Write Plan');
  assert.ok(idx3 < idx35 && idx35 < idx4, 'Step 3.5 must sit between Step 3 and Step 4');
});

test('Step 3.5 declares 4 signals', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  for (const sig of ['Escolha entre alternativas', 'stack/arquitetura', 'guardrails', 'Não-trivial']) {
    assert.match(section, new RegExp(sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `signal missing: ${sig}`);
  }
});

test('Step 3.5 declares opt-out skip_adr_offer', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  assert.match(section, /skip_adr_offer/);
});

test('Step 3.5 mechanism is LLM-instruction (P11), not regex/lib', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  assert.match(section, /instru[çc][ãa]o/i);
  assert.match(section, /n[ãa]o[\s ]+[ée][\s ]+regex/i);
});

test('Step 3.5 references /devflow adr:new for option (a)', () => {
  const section = extractSection(SKILL, '## Step 3.5');
  assert.match(section, /\/devflow adr:new/);
  assert.match(section, /--mode=prefilled/);
});
