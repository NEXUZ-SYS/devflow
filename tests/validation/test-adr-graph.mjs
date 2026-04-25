// adr-graph — supersedes/refines integrity validator (Check 12)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph } from '../../scripts/lib/adr-graph.mjs';

const FIX = './tests/validation/fixtures/graph';

test('valid: empty graph', async () => {
  const result = await validateGraph(`${FIX}/01-empty/`);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('valid: single supersede chain (Aprovado supersedes Substituido)', async () => {
  const result = await validateGraph(`${FIX}/02-supersede-chain/`);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('invalid: supersede points to nonexistent file', async () => {
  const result = await validateGraph(`${FIX}/03-broken-supersede/`);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /missing file|nonexistent/i);
});

test('invalid: self-reference', async () => {
  const result = await validateGraph(`${FIX}/04-self-ref/`);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /self-reference/i);
});

test('invalid: cycle A->B->A', async () => {
  const result = await validateGraph(`${FIX}/05-cycle/`);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /cycle/i.test(e)));
});

test('invalid: supersedes points to Proposto (unapproved)', async () => {
  const result = await validateGraph(`${FIX}/06-supersede-unapproved/`);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /unapproved|Proposto/i);
});
