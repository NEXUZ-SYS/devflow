// tests/instinct/test-config-interview.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('entrevista do config oferece o Instinct System com enquadramento não-redundante', async () => {
  const md = await readFile('skills/config/SKILL.md', 'utf-8');
  assert.match(md, /Instinct System/, 'a entrevista menciona o Instinct System');
  // clareza do que ativa: captura AUTOMÁTICA de tool-use
  assert.match(md, /autom[áa]tic/i);
  // não-redundância: distingue explicitamente de MemPalace e napkin
  assert.match(md, /MemPalace/);
  assert.match(md, /napkin/);
  assert.match(md, /prop[õo]/i, 'deixa claro que PROPÕE pros outros (não duplica)');
  // opt-in / privacidade: default off
  assert.match(md, /default off|enabled:\s*false|Recomendado/i);
});

test('regra de geração liga instincts.enabled à resposta da pergunta', async () => {
  const md = await readFile('skills/config/SKILL.md', 'utf-8');
  // a seção instincts só é gerada com enabled:true se o usuário respondeu Sim
  assert.match(md, /instincts:[\s\S]*enabled:\s*true/);
});
