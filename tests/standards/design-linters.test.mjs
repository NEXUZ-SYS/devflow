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

// ── Task A3 — regras `slop` estáticas (std-design-antipatterns) ────────────
// Cada regra: fixture .bad viola com a mensagem da regra; fixture .good não viola.
// (gradient-text já coberto acima.) Extensão escolhida por natureza da regra:
// .css p/ declarações de estilo, .html p/ heurísticas de texto/markup.
const SLOP_RULES = [
  ['side-tab', 'css'],
  ['border-accent-on-rounded', 'css'],
  ['overused-font', 'css'],
  ['single-font', 'css'],
  ['flat-type-hierarchy', 'css'],
  ['ai-color-palette', 'css'],
  ['cream-palette', 'css'],
  ['monotonous-spacing', 'css'],
  ['bounce-easing', 'css'],
  ['italic-serif-display', 'css'],
  ['extreme-negative-tracking', 'css'],
  ['gpt-thin-border-wide-shadow', 'css'],
  ['repeating-stripes-gradient', 'css'],
  ['codex-grid-background', 'css'],
  ['numbered-section-markers', 'html'],
  ['em-dash-overuse', 'html'],
  ['marketing-buzzword', 'html'],
  ['aphoristic-cadence', 'html'],
  ['theater-slop-phrase', 'html'],
  ['image-hover-transform', 'css'],
];
for (const [rule, ext] of SLOP_RULES) {
  test(`${rule}: bad viola`, () => {
    const r = runLinter(ANTIPATTERNS, `${FX}/${rule}.bad.${ext}`);
    assert.ok(r.violated, `esperava VIOLATION em ${rule}`);
    assert.match(r.msg, new RegExp(`VIOLATION:.*${rule}`));
  });
  test(`${rule}: good não viola`, () => {
    assert.equal(runLinter(ANTIPATTERNS, `${FX}/${rule}.good.${ext}`).violated, false);
  });
}

// ── Task A4 — regras `quality` estáticas não-a11y (std-visual-quality) ─────
const VISUAL_QUALITY = 'assets/standards/machine/std-visual-quality.js';
const QUALITY_RULES = [
  ['broken-image', 'html'],
  ['layout-transition', 'css'],
  ['justified-text', 'css'],
  ['all-caps-body', 'css'],
  ['wide-tracking', 'css'],
];
for (const [rule, ext] of QUALITY_RULES) {
  test(`${rule}: bad viola`, () => {
    const r = runLinter(VISUAL_QUALITY, `${FX}/${rule}.bad.${ext}`);
    assert.ok(r.violated, `esperava VIOLATION em ${rule}`);
    assert.match(r.msg, new RegExp(`VIOLATION:.*${rule}`));
  });
  test(`${rule}: good não viola`, () => {
    assert.equal(runLinter(VISUAL_QUALITY, `${FX}/${rule}.good.${ext}`).violated, false);
  });
}
test('std-visual-quality.js é linter puro (sem eval/exec/rede)', () => {
  const src = readFileSync(VISUAL_QUALITY, 'utf8');
  for (const forbidden of [/\beval\s*\(/, /\bnew Function\s*\(/, /child_process/, /\bfetch\s*\(/, /require\(\s*['"]https?/, /import\(\s*['"]https?/, /node:http/]) {
    assert.ok(!forbidden.test(src), `linter não pode conter ${forbidden}`);
  }
});

// ── Task A5 — regras a11y estáticas (std-accessibility, linter de produção) ─
const ACCESSIBILITY = 'assets/standards/machine/std-accessibility.js';
test('skipped-heading (html): bad viola', () => {
  const r = runLinter(ACCESSIBILITY, `${FX}/skipped-heading.bad.html`);
  assert.ok(r.violated);
  assert.match(r.msg, /VIOLATION:.*skipped-heading/);
});
test('skipped-heading (html): good não viola', () => {
  assert.equal(runLinter(ACCESSIBILITY, `${FX}/skipped-heading.good.html`).violated, false);
});
test('skipped-heading (tsx): bad viola (regra roda em jsx/tsx)', () => {
  const r = runLinter(ACCESSIBILITY, `${FX}/skipped-heading.bad.tsx`);
  assert.ok(r.violated);
  assert.match(r.msg, /VIOLATION:.*skipped-heading/);
});
test('tiny-text (css): bad viola', () => {
  const r = runLinter(ACCESSIBILITY, `${FX}/tiny-text.bad.css`);
  assert.ok(r.violated);
  assert.match(r.msg, /VIOLATION:.*tiny-text/);
});
test('tiny-text (css): good não viola', () => {
  assert.equal(runLinter(ACCESSIBILITY, `${FX}/tiny-text.good.css`).violated, false);
});
// Regressão: comportamento JSX preservado — div onClick sem role AINDA viola.
test('regressão: .tsx com div onClick sem role ainda viola', () => {
  const r = runLinter(ACCESSIBILITY, `${FX}/div-onclick.bad.tsx`);
  assert.ok(r.violated, 'a regra JSX de a11y deve continuar disparando em tsx');
  assert.match(r.msg, /VIOLATION:/);
});
