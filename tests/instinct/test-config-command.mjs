// tests/instinct/test-config-command.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('comando devflow-instinct existe e documenta subcomandos', async () => {
  const md = await readFile('commands/devflow-instinct.md', 'utf-8');
  for (const sub of ['status', 'mine', 'promote', 'prune', 'list'])
    assert.match(md, new RegExp(sub));
});

test('precedência dos toggles documentada (N2)', async () => {
  const md = await readFile('commands/devflow-instinct.md', 'utf-8');
  assert.match(md, /precedência|env.*>.*yaml|enabled:\s*false/i);
});
