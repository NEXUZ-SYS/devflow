// Regression test: prevc-confirmation Step 4 must consult .context/.devflow.yaml
// and respect autoFinish before invoking generic finishing-a-development-branch skill.
//
// Why this exists: 2026-04-25 incident on workflow adr-system-v2 where the
// generic skill presented a 4-option menu despite autoFinish: true being set in
// .devflow.yaml. Config-driven projects must not be reduced to interactive prompts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SKILL = readFileSync('./skills/prevc-confirmation/SKILL.md', 'utf-8');

function extractSection(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const next = text.indexOf('\n## ', start + heading.length);
  return text.slice(start, next === -1 ? text.length : next);
}

test('Step 4 declares HARD-GATE that consults .devflow.yaml first', () => {
  const step4 = extractSection(SKILL, '## Step 4');
  assert.match(step4, /HARD-GATE/, 'Step 4 must have HARD-GATE marker');
  assert.match(step4, /\.context\/\.devflow\.yaml/, 'Step 4 must reference .devflow.yaml');
  assert.match(step4, /autoFinish/, 'Step 4 must reference autoFinish key');
});

test('Step 4 documents autoFinish: true → execute directly path', () => {
  const step4 = extractSection(SKILL, '## Step 4');
  assert.match(step4, /autoFinish.*true/i);
  assert.match(step4, /EXECUTAR DIRETO|execu[ts][aã]o\s+direta/i);
  assert.match(step4, /n[ãa]o\s+(invocar|apresentar)/i);
});

test('Step 4 documents autoFinish: false / absent → invoke generic skill', () => {
  const step4 = extractSection(SKILL, '## Step 4');
  assert.match(step4, /autoFinish.*false/i);
  assert.match(step4, /superpowers:finishing-a-development-branch/);
});

test('Step 4 references gh pr merge for prCli: gh path', () => {
  const step4 = extractSection(SKILL, '## Step 4');
  assert.match(step4, /gh pr merge/);
  assert.match(step4, /--squash/);
  assert.match(step4, /--delete-branch/);
});

test('Step 4 includes anti-pattern reminder against re-asking when config decided', () => {
  const step4 = extractSection(SKILL, '## Step 4');
  assert.match(step4, /N[ÃA]O\s+pergunte|n[ãa]o\s+pergunte|n[ãa]o\s+invocar.*menu|N[ÃA]O.*apresentar/i);
});

test('Step 4 references the 2026-04-25 incident as rationale', () => {
  const step4 = extractSection(SKILL, '## Step 4');
  assert.match(step4, /2026-04-25|adr-system-v2/);
});

test('Step 4 declares decision-table mapping autoFinish values to behavior', () => {
  const step4 = extractSection(SKILL, '## Step 4');
  // Should have at least 3 rows mapping true / false / absent
  const tableRows = (step4.match(/^\|.*\|/gm) || []).length;
  assert.ok(tableRows >= 4, `expected decision table with header + 3+ rows, got ${tableRows} table lines`);
});
