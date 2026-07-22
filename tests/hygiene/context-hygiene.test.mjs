// Testes do CLI de higiene de contexto.
//
// TODA fixture é um repo git real em mkdtemp(tmpdir()) — nunca o repo do projeto.
// (Incidente registrado: um E2E destrutivo apagou WIP não-commitado in-place.)
//
// Datas são explícitas via gitAt(): o timestamp do git tem resolução de 1 segundo,
// e fixture sem data fixa produz teste não-determinístico (medido na fase R:
// 0 de 12 execuções em sucessão rápida aprovaram).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLI = join(process.cwd(), 'scripts/context-hygiene.mjs');

async function makeRepo() {
  const d = await mkdtemp(join(tmpdir(), 'hygiene-'));
  const git = (...a) => execFileSync('git', ['-C', d, ...a], { stdio: 'ignore' });
  const gitAt = (iso, ...a) => execFileSync('git', ['-C', d, ...a], {
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso },
  });
  git('init', '-q');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 'T');
  await mkdir(join(d, 'docs/superpowers/plans'), { recursive: true });
  await mkdir(join(d, 'docs/superpowers/specs'), { recursive: true });
  return { dir: d, git, gitAt };
}

const scanFull = (dir, cwd) =>
  JSON.parse(execFileSync('node', [CLI, 'scan'], { cwd: cwd ?? dir, encoding: 'utf8' }));
const scan = (dir) => scanFull(dir).artifacts;
const archive = (dir, ...paths) =>
  execFileSync('node', [CLI, 'archive', '--confirmed', ...paths], { cwd: dir, encoding: 'utf8' });

// ─────────────────────────── scan: classificação e movable ───────────────────

test('plano tracked e limpo é movable', async () => {
  const { dir, git } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-01-01-x.md'), '# x\n');
  git('add', '-A'); git('commit', '-qm', 'add plan');
  const a = scan(dir).find((x) => x.path.endsWith('2026-01-01-x.md'));
  assert.equal(a.category, 'A');
  assert.equal(a.tracked, true);
  assert.equal(a.dirty, false);
  assert.equal(a.movable, true);
  await rm(dir, { recursive: true, force: true });
});

test('plano untracked NÃO é movable', async () => {
  const { dir } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-01-02-y.md'), '# y\n');
  const a = scan(dir).find((x) => x.path.endsWith('2026-01-02-y.md'));
  assert.equal(a.tracked, false);
  assert.equal(a.movable, false);
  assert.match(a.reason, /untracked/i);
  await rm(dir, { recursive: true, force: true });
});

test('plano tracked porém sujo NÃO é movable', async () => {
  const { dir, git } = await makeRepo();
  const p = join(dir, 'docs/superpowers/plans/2026-01-03-z.md');
  await writeFile(p, '# z\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  await writeFile(p, '# z modificado\n');
  const a = scan(dir).find((x) => x.path.endsWith('2026-01-03-z.md'));
  assert.equal(a.tracked, true);
  assert.equal(a.dirty, true);
  assert.equal(a.movable, false);
  assert.match(a.reason, /dirty|modifica/i);
  await rm(dir, { recursive: true, force: true });
});

test('tracking em .context/plans NUNCA é movable, mesmo tracked e limpo', async () => {
  const { dir, git } = await makeRepo();
  await mkdir(join(dir, '.context/plans'), { recursive: true });
  await writeFile(join(dir, '.context/plans/orfao.md'), '---\nstatus: filled\n---\n');
  git('add', '-A'); git('commit', '-qm', 'add tracking');
  const a = scan(dir).find((x) => x.path.includes('.context/plans/orfao.md'));
  assert.equal(a.category, 'B');
  assert.equal(a.tracked, true);
  assert.equal(a.dirty, false);
  assert.equal(a.movable, false, 'ADR-006: território dotcontext');
  await rm(dir, { recursive: true, force: true });
});

test('spec sem plano-par é categoria C', async () => {
  const { dir, git } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/specs/2026-01-04-sozinha-design.md'), '# s\n');
  git('add', '-A'); git('commit', '-qm', 'add spec');
  const a = scan(dir).find((x) => x.path.includes('sozinha-design.md'));
  assert.equal(a.category, 'C');
  assert.equal(a.movable, false);
  await rm(dir, { recursive: true, force: true });
});

test('plano com spec pareada marca hasSpec', async () => {
  const { dir, git } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-01-05-feat.md'), '# f\n');
  await writeFile(join(dir, 'docs/superpowers/specs/2026-01-05-feat-design.md'), '# f\n');
  git('add', '-A'); git('commit', '-qm', 'add pair');
  const a = scan(dir).find((x) => x.path.includes('plans/2026-01-05-feat.md'));
  assert.equal(a.hasSpec, true);
  await rm(dir, { recursive: true, force: true });
});

test('releasesAfter conta tags criadas após o último commit do plano', async () => {
  const { dir, git, gitAt } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-01-06-old.md'), '# o\n');
  git('add', '-A');
  gitAt('2026-01-01T00:00:00Z', 'commit', '-qm', 'plan');
  await writeFile(join(dir, 'outro.txt'), 'x');
  git('add', '-A');
  gitAt('2026-01-01T00:10:00Z', 'commit', '-qm', 'depois');
  // Tag ANOTADA: a leve herda a data do commit apontado, e os dois commits do
  // fixture cairiam no mesmo segundo. A asserção NUNCA é afrouxada para >=,
  // porque isso corromperia o próprio fato que o LLM lê como indício.
  gitAt('2026-01-02T00:00:00Z', 'tag', '-a', 'v9.9.9', '-m', 'release');
  const a = scan(dir).find((x) => x.path.includes('2026-01-06-old.md'));
  assert.equal(a.releasesAfter, 1, 'fato observável, não veredito');
  await rm(dir, { recursive: true, force: true });
});

test('repo sem docs/superpowers/plans → no-op limpo, exit 0', async () => {
  const d = await mkdtemp(join(tmpdir(), 'hygiene-empty-'));
  execFileSync('git', ['-C', d, 'init', '-q']);
  const out = execFileSync('node', [CLI, 'scan'], { cwd: d, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out).artifacts, []);
  await rm(d, { recursive: true, force: true });
});

test('plano acentuado commitado NÃO é reportado como untracked', async () => {
  const { dir, git } = await makeRepo();
  // core.quotePath=true (default) C-quota não-ASCII no ls-files. Sem -z este
  // arquivo volta como "...configura\303\247\303\243o.md", não casa a chave, e o
  // CLI declararia "untracked" sobre arquivo commitado — fato FALSO num plugin
  // que serve pt-BR/es-ES.
  await writeFile(join(dir, 'docs/superpowers/plans/2026-01-07-configuração.md'), '# c\n');
  git('add', '-A'); git('commit', '-qm', 'add acentuado');
  const a = scan(dir).find((x) => x.path.includes('configuração'));
  assert.equal(a.tracked, true, 'acento não pode virar untracked');
  assert.equal(a.movable, true);
  await rm(dir, { recursive: true, force: true });
});

test('scan de subdiretório mede dirty corretamente (fail-open S1)', async () => {
  const { dir, git } = await makeRepo();
  const p = join(dir, 'docs/superpowers/plans/2026-01-08-wip.md');
  await writeFile(p, '# ok\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  await writeFile(p, '# ok\nWIP NAO COMMITADO\n');
  // ls-files é relativo ao cwd; status --porcelain é relativo à raiz. Sem ancorar
  // na raiz, as chaves não batem, dirty vira false e o WIP seria movido.
  await mkdir(join(dir, 'sub'), { recursive: true });
  const a = scanFull(dir, join(dir, 'sub')).artifacts
    .find((x) => x.path.includes('2026-01-08-wip.md'));
  assert.equal(a.dirty, true, 'sujeira tem de ser vista de qualquer subdiretório');
  assert.equal(a.movable, false);
  await rm(dir, { recursive: true, force: true });
});

test('scan emite procedência da busca (vazio-limpo ≠ vazio-por-erro)', async () => {
  const d = await mkdtemp(join(tmpdir(), 'hygiene-prov-'));
  execFileSync('git', ['-C', d, 'init', '-q']);
  const out = scanFull(d);
  assert.deepEqual(out.artifacts, []);
  const plans = out.scannedDirs.find((s) => s.path === 'docs/superpowers/plans');
  assert.equal(plans.exists, false, 'tem de declarar que o dir não existia');
  await rm(d, { recursive: true, force: true });
});

test('scan fora de repo git declara o erro, não finge estar limpo', async () => {
  const d = await mkdtemp(join(tmpdir(), 'hygiene-nogit-'));
  await mkdir(join(d, 'docs/superpowers/plans'), { recursive: true });
  await writeFile(join(d, 'docs/superpowers/plans/2026-02-06-x.md'), '# x\n');
  const out = scanFull(d);
  assert.deepEqual(out.artifacts, []);
  assert.match(out.error ?? '', /git/i, 'falha tem de ser declarada, não silenciada');
  await rm(d, { recursive: true, force: true });
});

test('README.md no dir de planos não é candidato a arquivamento', async () => {
  const { dir, git } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/README.md'), '# índice\n');
  git('add', '-A'); git('commit', '-qm', 'add readme');
  const a = scan(dir).find((x) => x.path.endsWith('plans/README.md'));
  assert.equal(a, undefined, 'arquivar o índice do próprio diretório é absurdo');
  await rm(dir, { recursive: true, force: true });
});

// ─────────────────────────────── archive ─────────────────────────────────────

test('archive SEM --confirmed recusa (gate mecânico de consentimento)', async () => {
  const { dir, git } = await makeRepo();
  const p = 'docs/superpowers/plans/2026-02-00-gate.md';
  await writeFile(join(dir, p), '# g\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  assert.throws(
    () => execFileSync('node', [CLI, 'archive', p], { cwd: dir, encoding: 'utf8' }),
    (e) => e.status === 2 && /--confirmed/.test(String(e.stderr)),
    'o consentimento não pode viver só na prosa da skill',
  );
  assert.ok(existsSync(join(dir, p)), 'nada foi movido');
  await rm(dir, { recursive: true, force: true });
});

test('archive move plano movable e preserva histórico', async () => {
  const { dir, git } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-02-01-ok.md'), '# ok\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  archive(dir, 'docs/superpowers/plans/2026-02-01-ok.md');

  const dest = 'docs/superpowers/plans/archive/2026-02-01-ok.md';
  assert.ok(existsSync(join(dir, dest)), 'movido para archive/');
  assert.ok(!existsSync(join(dir, 'docs/superpowers/plans/2026-02-01-ok.md')));
  // git mv apenas ESTAGIA. Sem commitar, --follow percorre commits onde o destino
  // não existe e devolve vazio. Commitar aqui documenta o contrato: a árvore fica
  // com rename staged e alguém precisa commitar.
  git('commit', '-qm', 'archive');
  const log = execFileSync('git', ['-C', dir, 'log', '--follow', '--format=%s', '--', dest],
    { encoding: 'utf8' });
  assert.match(log, /add/, 'git mv preserva o histórico');
  await rm(dir, { recursive: true, force: true });
});

test('archive RECUSA untracked com exit != 0', async () => {
  const { dir } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-02-02-wip.md'), '# wip\n');
  assert.throws(
    () => archive(dir, 'docs/superpowers/plans/2026-02-02-wip.md'),
    (e) => e.status !== 0 && /untracked/i.test(String(e.stderr)),
  );
  assert.ok(existsSync(join(dir, 'docs/superpowers/plans/2026-02-02-wip.md')), 'não foi movido');
  await rm(dir, { recursive: true, force: true });
});

test('archive RECUSA dirty com exit != 0', async () => {
  const { dir, git } = await makeRepo();
  const p = join(dir, 'docs/superpowers/plans/2026-02-03-sujo.md');
  await writeFile(p, '# a\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  await writeFile(p, '# a editado\n');
  assert.throws(
    () => archive(dir, 'docs/superpowers/plans/2026-02-03-sujo.md'),
    (e) => e.status !== 0 && /dirty|modifica/i.test(String(e.stderr)),
  );
  assert.ok(existsSync(p), 'não foi movido');
  await rm(dir, { recursive: true, force: true });
});

test('archive RECUSA path de .context/plans citando ADR-006 (a CAUSA, não só o exit)', async () => {
  const { dir, git } = await makeRepo();
  await mkdir(join(dir, '.context/plans'), { recursive: true });
  await writeFile(join(dir, '.context/plans/t.md'), '---\n---\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  // Assertar só status !== 0 passaria por qualquer motivo — inclusive um crash.
  // No invariante mais crítico do design, o teste prova a CAUSA.
  assert.throws(
    () => archive(dir, '.context/plans/t.md'),
    (e) => e.status !== 0 && /dotcontext|ADR-006|território/i.test(String(e.stderr)),
  );
  assert.ok(existsSync(join(dir, '.context/plans/t.md')));
  await rm(dir, { recursive: true, force: true });
});

test('archive RECUSA .context/docs (fora do inventário, guard explícito)', async () => {
  const { dir, git } = await makeRepo();
  await mkdir(join(dir, '.context/docs'), { recursive: true });
  await writeFile(join(dir, '.context/docs/algo.md'), '# a\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  assert.throws(
    () => archive(dir, '.context/docs/algo.md'),
    (e) => e.status !== 0 && /dotcontext|ADR-006|território/i.test(String(e.stderr)),
  );
  assert.ok(existsSync(join(dir, '.context/docs/algo.md')));
  await rm(dir, { recursive: true, force: true });
});

test('archive RECUSA path fora do inventário (allowlist / traversal)', async () => {
  const { dir, git } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-02-05-x.md'), '# x\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  for (const evil of ['../../../etc/passwd.md', '/etc/passwd', 'outro/lugar.md']) {
    assert.throws(
      () => archive(dir, evil),
      (e) => e.status !== 0,
      `deve recusar: ${evil}`,
    );
  }
  assert.ok(existsSync(join(dir, 'docs/superpowers/plans/2026-02-05-x.md')), 'intacto');
  await rm(dir, { recursive: true, force: true });
});

test('archive RECUSA quando destino já existe (ADR-012)', async () => {
  const { dir, git } = await makeRepo();
  await mkdir(join(dir, 'docs/superpowers/plans/archive'), { recursive: true });
  await writeFile(join(dir, 'docs/superpowers/plans/2026-02-04-dup.md'), '# novo\n');
  await writeFile(join(dir, 'docs/superpowers/plans/archive/2026-02-04-dup.md'), '# antigo\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  assert.throws(
    () => archive(dir, 'docs/superpowers/plans/2026-02-04-dup.md'),
    (e) => e.status !== 0 && /exist/i.test(String(e.stderr)),
  );
  const antigo = readFileSync(join(dir, 'docs/superpowers/plans/archive/2026-02-04-dup.md'), 'utf8');
  assert.match(antigo, /antigo/, 'nunca sobrescreve');
  await rm(dir, { recursive: true, force: true });
});

test('archive parcial: move os válidos, recusa os outros, exit 3', async () => {
  const { dir, git } = await makeRepo();
  const ok = 'docs/superpowers/plans/2026-02-07-ok.md';
  const wip = 'docs/superpowers/plans/2026-02-08-wip.md';
  await writeFile(join(dir, ok), '# ok\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  await writeFile(join(dir, wip), '# untracked\n');
  // Um código só para "parcial" e "nada" faz o agente reprocessar os já movidos,
  // receber "não encontrado" e concluir que a ferramenta quebrou.
  let err;
  try { archive(dir, ok, wip); } catch (e) { err = e; }
  assert.equal(err.status, 3, 'parcial = 3');
  assert.ok(existsSync(join(dir, 'docs/superpowers/plans/archive/2026-02-07-ok.md')));
  assert.ok(existsSync(join(dir, wip)), 'o untracked continua onde estava');
  await rm(dir, { recursive: true, force: true });
});

test('archive rejeita flag desconhecida em vez de descartá-la em silêncio', async () => {
  const { dir } = await makeRepo();
  assert.throws(
    () => execFileSync('node', [CLI, 'archive', '--confirmed', '--turbo', 'x.md'],
      { cwd: dir, encoding: 'utf8' }),
    (e) => e.status === 2 && /desconhecida/i.test(String(e.stderr)),
  );
  await rm(dir, { recursive: true, force: true });
});
