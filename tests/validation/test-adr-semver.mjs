// adr-semver — semver helpers extracted from adr-update-index/adr-evolve (C5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpSemver, compareSemver, parseSemver } from '../../scripts/lib/adr-semver.mjs';

test('bump patch', () => assert.equal(bumpSemver('1.0.0', 'patch'), '1.0.1'));
test('bump minor resets patch', () => assert.equal(bumpSemver('1.2.3', 'minor'), '1.3.0'));
test('bump major resets minor and patch', () =>
  assert.equal(bumpSemver('2.4.7', 'major'), '3.0.0'));

test('compare equal', () => assert.equal(compareSemver('1.0.0', '1.0.0'), 0));
test('compare lesser by patch', () => assert.ok(compareSemver('1.0.0', '1.0.1') < 0));
test('compare lesser by minor', () => assert.ok(compareSemver('1.0.99', '1.1.0') < 0));
test('compare greater by major', () =>
  assert.ok(compareSemver('2.0.0', '1.99.99') > 0));

test('parse decomposes', () =>
  assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3 }));

test('bump rejects invalid input', () =>
  assert.throws(() => bumpSemver('abc', 'patch'), /invalid semver/));
test('bump rejects unknown kind', () =>
  assert.throws(() => bumpSemver('1.0.0', 'foo'), /unknown bump/));
