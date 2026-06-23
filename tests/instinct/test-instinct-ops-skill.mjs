// tests/instinct/test-instinct-ops-skill.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('SKILL.md tem frontmatter e contrato de mining', async () => {
  const md = await readFile('skills/instinct-ops/SKILL.md', 'utf-8');
  assert.match(md, /^---[\s\S]*name:\s*instinct-ops/);
  assert.match(md, /mine-read/);
  assert.match(md, /mine-apply/);
  assert.match(md, /match sem[âa]ntico/i);     // I4
  assert.match(md, /\+0\.2|correção do usuário/i); // C1
});
