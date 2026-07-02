// Task A1 — os concerns de design entram na taxonomy do plugin sob a chave real `entries:`
// e são carregados pelo loader (não a chave inexistente `concerns:`, que causava concern invisível).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTaxonomySync } from '../../scripts/lib/taxonomy-loader.mjs';

const TAXONOMY = 'skills/standards-builder/references/taxonomy-of-concerns.yaml';

test('taxonomy carrega os concerns de design (category ui, schema completo dos irmãos)', () => {
  const tax = loadTaxonomySync({ distributedPath: TAXONOMY, projectRoot: null });
  const entries = tax.entries;
  assert.ok(Array.isArray(entries), 'taxonomy.entries deve ser uma lista');
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  for (const id of ['design-antipatterns', 'visual-quality']) {
    assert.ok(byId[id], `falta entry ${id}`);
    assert.equal(byId[id].category, 'ui');
    // schema completo espelhando accessibility/internationalization
    for (const f of ['summary', 'defaultApplyTo', 'principleTemplate', 'antiPatternTemplate', 'linterHints']) {
      assert.ok(byId[id][f] != null, `entry ${id} sem campo ${f}`);
    }
    assert.equal('std' in byId[id], false, 'campo std: não existe no schema (mapeamento por convenção std-<id>)');
  }
});
