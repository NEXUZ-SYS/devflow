// Suite A — adr-frontmatter parser unit tests
// Validates: minimal YAML subset (key: value, [], lists, null/~, dates, bool, comments)
// Security: S2 prototype pollution via __proto__/constructor keys must throw
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, stringify } from '../../scripts/lib/adr-frontmatter.mjs';

const fixtures = (name) =>
  readFileSync(`./tests/validation/fixtures/frontmatter/${name}.md`, 'utf-8');

test('parse: minimal valid frontmatter', () => {
  const { frontmatter, body } = parse(fixtures('01-minimal'));
  assert.equal(frontmatter.type, 'adr');
  assert.equal(frontmatter.version, '0.1.0');
  assert.deepEqual(frontmatter.supersedes, []);
  assert.deepEqual(frontmatter.refines, []);
  assert.equal(frontmatter.protocol_contract, null);
  assert.equal(frontmatter.decision_kind, 'firm');
  assert.match(body, /^\s*# ADR/);
});

test('parse: empty list inline', () => {
  const { frontmatter } = parse(fixtures('02-empty-list'));
  assert.deepEqual(frontmatter.supersedes, []);
  assert.deepEqual(frontmatter.refines, []);
});

test('parse: list with multiple items', () => {
  const { frontmatter } = parse(fixtures('03-list-multi'));
  assert.deepEqual(frontmatter.supersedes, ['001-tdd-python-v1.0.0', '002-old']);
});

test('parse: null and quoted strings', () => {
  const { frontmatter } = parse(fixtures('04-null-quoted'));
  assert.equal(frontmatter.protocol_contract, null);
  assert.equal(frontmatter.description, 'Decisão sobre validação');
});

test('parse: ISO date', () => {
  const { frontmatter } = parse(fixtures('05-iso-date'));
  assert.equal(frontmatter.created, '2026-04-22');
});

test('parse: comments ignored', () => {
  const { frontmatter } = parse(fixtures('06-comments'));
  assert.equal(frontmatter.type, 'adr');
  assert.equal(frontmatter.name, 'test');
});

test('parse: missing closing --- throws', () => {
  assert.throws(() => parse(fixtures('07-no-closing')), /frontmatter delimiter/);
});

test('parse: empty value', () => {
  const { frontmatter } = parse(fixtures('08-empty-value'));
  assert.equal(frontmatter.scope, '');
});

test('parse: boolean values', () => {
  const { frontmatter } = parse(fixtures('09-boolean'));
  assert.equal(frontmatter.draft, true);
  assert.equal(frontmatter.deprecated, false);
});

test('parse: tilde as null', () => {
  const { frontmatter } = parse(fixtures('10-tilde-null'));
  assert.equal(frontmatter.protocol_contract, null);
});

// S2 — prototype pollution attempts must throw, not pollute Object.prototype
test('reject __proto__ key (S2)', () => {
  assert.throws(() => parse(fixtures('11-proto-attack')), /forbidden key/);
  // Verify Object.prototype was NOT polluted
  const probe = {};
  assert.equal(probe.polluted, undefined);
});

test('reject constructor key (S2)', () => {
  assert.throws(() => parse(fixtures('12-constructor-attack')), /forbidden key/);
});

test('stringify: roundtrip preserves frontmatter', () => {
  const original = fixtures('01-minimal');
  const { frontmatter, body } = parse(original);
  const result = stringify(frontmatter, body);
  const reparse = parse(result);
  assert.deepEqual(reparse.frontmatter, frontmatter);
});

test('stringify: empty list rendered as []', () => {
  const result = stringify({ supersedes: [] }, '# body');
  assert.match(result, /supersedes: \[\]/);
});

test('stringify: null rendered as null', () => {
  const result = stringify({ protocol_contract: null }, '# body');
  assert.match(result, /protocol_contract: null/);
});
