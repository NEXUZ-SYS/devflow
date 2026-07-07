// Task G3 — E2E: o linter de design dispara pelo CAMINHO REAL de enforcement
// (run-linter-cli.mjs, o que o hooks/post-tool-use invoca): standards-loader resolve
// o std pelo applyTo → sandbox SI-4 executa o linter → VIOLATION formatada.
// Arquivo-alvo em tmpdir (nunca in-place em dir versionado — memória do projeto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve('.');
const CLI = join(REPO, 'scripts/lib/run-linter-cli.mjs');

function lintViaHookPath(absPath) {
  const event = JSON.stringify({ tool: 'Write', path: absPath });
  try {
    return execFileSync('node', [CLI, `--plugin=${REPO}`], { input: event, encoding: 'utf8', cwd: REPO });
  } catch (e) {
    return `${e.stdout || ''}${e.stderr || ''}`;
  }
}

test('E2E: gradient-text dispara VIOLATION pelo run-linter-cli (SI-4 → std-design-antipatterns)', () => {
  const d = mkdtempSync(join(tmpdir(), 'e2e-slop-'));
  const f = join(d, 'hero.css');
  writeFileSync(f, '.hero{background:linear-gradient(90deg,#f0f,#0ff);-webkit-background-clip:text;color:transparent;}');
  const out = lintViaHookPath(f);
  assert.match(out, /std-design-antipatterns|gradient-text/i, `esperava VIOLATION; obtido: ${out}`);
});

test('E2E: css limpo não dispara nada pelo caminho real', () => {
  const d = mkdtempSync(join(tmpdir(), 'e2e-ok-'));
  const f = join(d, 'ok.css');
  writeFileSync(f, '.hero{color:#111111;}');
  const out = lintViaHookPath(f);
  assert.doesNotMatch(out, /violat/i, `não esperava violação; obtido: ${out}`);
});

test('E2E: arquivo backend (.py) é inerte (applyTo front-end)', () => {
  const d = mkdtempSync(join(tmpdir(), 'e2e-be-'));
  const f = join(d, 'app.py');
  writeFileSync(f, 'x = "linear-gradient background-clip: text"  # não é css/jsx');
  const out = lintViaHookPath(f);
  assert.doesNotMatch(out, /std-design-antipatterns/i, `backend não deve acionar o std de design; obtido: ${out}`);
});
