// Task A2+ — testes dos linters de design (contrato SI-4: filePath em argv[2],
// VIOLATION + exit 1 ao violar; exit 0 caso contrário). Fixtures positivo/negativo 1:1 por regra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function runLinter(linter, file) {
  try {
    execFileSync('node', [linter, file], { encoding: 'utf8' });
    return { violated: false, msg: '' };
  } catch (e) {
    return { violated: true, msg: `${e.stdout || ''}${e.stderr || ''}`.trim() };
  }
}

const ANTIPATTERNS = 'assets/standards/machine/std-design-antipatterns.js';
const FX = 'assets/standards/machine/__tests__/design';

// ── gradient-text (slop) ───────────────────────────────────────────────
test('gradient-text: bad viola', () => {
  const r = runLinter(ANTIPATTERNS, `${FX}/gradient-text.bad.css`);
  assert.ok(r.violated, 'esperava VIOLATION');
  assert.match(r.msg, /VIOLATION:.*gradient-text/);
});
test('gradient-text: good não viola', () => {
  assert.equal(runLinter(ANTIPATTERNS, `${FX}/gradient-text.good.css`).violated, false);
});

// ── linter puro: sem eval/exec/rede (invariante de segurança da Revisão R) ──
test('std-design-antipatterns.js é linter puro (sem eval/exec/rede)', () => {
  const src = readFileSync(ANTIPATTERNS, 'utf8');
  for (const forbidden of [/\beval\s*\(/, /\bnew Function\s*\(/, /child_process/, /\bfetch\s*\(/, /require\(\s*['"]https?/, /import\(\s*['"]https?/, /node:http/]) {
    assert.ok(!forbidden.test(src), `linter não pode conter ${forbidden}`);
  }
});
