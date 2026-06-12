// tests/integration/test-e2e-adr-decisao-prevc.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateSignals, decideAction, parseGuardrailsBlock } from '../../scripts/lib/adr-decision.mjs';
import { appendCandidate, readCandidates, clearPending } from '../../scripts/lib/adr-pending.mjs';

const BLOCK = `<ADR_GUARDRAILS>
### observability-otel-genai [firm] (stack: universal)
NUNCA logar payload bruto.
</ADR_GUARDRAILS>`;

test('P: decisão que contradiz ADR existente → evolve major', () => {
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true, hasAlternatives: true, impliesGuardrails: false }), true);
  const adrs = parseGuardrailsBlock(BLOCK);
  assert.equal(adrs[0].name, 'observability-otel-genai');
  // LLM julga relação = contradicts contra a ADR encontrada
  assert.deepEqual(decideAction({ relation: 'contradicts', adrName: adrs[0].name }),
    { action: 'evolve', command: '/devflow adr:evolve observability-otel-genai', evolveHint: 'major' });
});

test('P: decisão sem ADR no bloco → create', () => {
  const adrs = parseGuardrailsBlock('<ADR_GUARDRAILS>\nvazio\n</ADR_GUARDRAILS>');
  assert.equal(adrs.length, 0);
  assert.deepEqual(decideAction({ relation: 'none' }),
    { action: 'create', command: '/devflow adr:new --mode=prefilled' });
});

test('P: decisão alinhada → silent', () =>
  assert.deepEqual(decideAction({ relation: 'aligned' }), { action: 'silent' }));

test('E→C: captura na Execution é varrida no Confirmation e limpa', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-adr-'));
  try {
    // E: decisão emergente capturada (com dup que deve ser ignorada)
    appendCandidate(root, { phrase: 'Adoção de Zod para validação', phase: 'E', relatedAdr: null });
    appendCandidate(root, { phrase: '  adocao de zod para validacao ', phase: 'E', relatedAdr: null });
    // C: sweep lê os candidatos
    const pending = readCandidates(root);
    assert.equal(pending.length, 1);
    assert.equal(decideAction({ relation: 'none' }).action, 'create');
    // C: limpa
    clearPending(root);
    assert.deepEqual(readCandidates(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
