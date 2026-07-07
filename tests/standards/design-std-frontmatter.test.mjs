// Task A6 — os .md dos std de design têm frontmatter válido espelhando os defaults irmãos
// (source/activation/relatedAdrs/applyTo/enforcement.linter) e entram no MANIFEST.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFrontmatter } from '../../scripts/lib/frontmatter.mjs';

function fm(p) {
  return parseFrontmatter(readFileSync(p, 'utf8')).data;
}

const STDS = [
  ['std-design-antipatterns', 'machine/std-design-antipatterns.js'],
  ['std-visual-quality', 'machine/std-visual-quality.js'],
];

for (const [id, linter] of STDS) {
  test(`${id} frontmatter válido (espelha os defaults irmãos)`, () => {
    const f = fm(`assets/standards/${id}.md`);
    assert.equal(f.id, id);
    assert.equal(f.enforcement.linter, linter);
    assert.deepEqual(f.applyTo, ['**/*.{tsx,jsx,vue,svelte,html,css}']);
    assert.equal(f.source, 'devflow-default');
    assert.ok(f.activation, 'falta activation');
    assert.ok(Array.isArray(f.relatedAdrs) && f.relatedAdrs.includes('ADR-010'), 'relatedAdrs deve incluir ADR-010');
  });
}

test('MANIFEST inclui os dois std de design', () => {
  const manifest = readFileSync('assets/standards/MANIFEST.txt', 'utf8');
  assert.match(manifest, /^std-design-antipatterns\.md$/m);
  assert.match(manifest, /^std-visual-quality\.md$/m);
});
