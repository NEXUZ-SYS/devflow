import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const HOOK = join(REPO, 'hooks', 'session-start');
const ENV = { ...process.env, CLAUDE_PLUGIN_ROOT: REPO };

// sandbox com grounding LIGADO (senão o hook não emite <GROUNDING_MODE>)
function sandbox({ state, napkin } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'ss-'));
  mkdirSync(join(d, '.context'), { recursive: true });
  writeFileSync(join(d, '.context/.devflow.yaml'), 'grounding:\n  mode: warn\n  server: docs-mcp-server\n');
  if (state) {
    mkdirSync(join(d, '.context/runtime/workflows'), { recursive: true });
    writeFileSync(join(d, '.context/runtime/workflows/prevc.json'), JSON.stringify(state));
  }
  if (napkin) writeFileSync(join(d, '.context/napkin.md'), napkin);
  return d;
}
const runHook = (cwd) => execFileSync('bash', [HOOK], {
  input: JSON.stringify({ hook_event_name: 'SessionStart', cwd }),
  env: { ...ENV, CLAUDE_PROJECT_DIR: cwd }, cwd, encoding: 'utf8',
});
const ctxOf = (out) => JSON.parse(out)?.hookSpecificOutput?.additionalContext ?? '';

// D9: um byte de controle vindo de QUALQUER fonte (napkin, aqui) não pode invalidar o
// JSON — se invalidar, o Claude Code descarta o DEVFLOW_CONTEXT inteiro (fail-OPEN).
test('escape_for_json: C0 no napkin.md não quebra o JSON nem apaga o GROUNDING_MODE', () => {
  const napkin = 'linha um\x1b[31m com cor ANSI\x0b e vertical tab';
  const out = runHook(sandbox({ napkin }));
  assert.doesNotThrow(() => JSON.parse(out), 'saída do hook deve ser JSON válido mesmo com C0');
  assert.match(ctxOf(out), /GROUNDING_MODE/, 'o GROUNDING_MODE não pode sumir junto');
});
