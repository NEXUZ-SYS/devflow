# Higiene de contexto (anti context-rot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** `context-hygiene` | **Scale:** MEDIUM | **Phase:** P→R
> **Spec:** [`docs/superpowers/specs/2026-07-22-context-hygiene-design.md`](../specs/2026-07-22-context-hygiene-design.md) (commit `4d8f575`)

**Goal:** Dar ao DevFlow a capacidade de identificar artefatos de processo obsoletos e arquivar com segurança os planos já entregues, sem depender de nenhum sinal auto-declarado.

**Architecture:** Um CLI puro (`scripts/context-hygiene.mjs`) inventaria artefatos e emite **fatos** em JSON — nunca veredito. Uma skill (`skills/context-hygiene/`) lê esses fatos, faz o julgamento semântico "a entrega existe no código?" e conduz o consentimento. A recusa de mover arquivo desprotegido é **mecânica no CLI**, não instrução em prosa.

**Tech Stack:** Node ESM zero-dep (`node:child_process`, `node:fs`), `node --test`, git via `execFileSync` com argv.

**Agents:** `feature-developer` (Tasks 1–4), `security-auditor` (revisão da fase R — a feature move arquivos).

## Global Constraints

- **ADR-006:** `.context/{docs,agents,skills,plans}` é território dotcontext — nunca escrever/mover ali. Paths de `.context/` resolvem por `scripts/lib/context-paths.mjs`, nunca hardcode.
- **ADR-011:** ler `.devflow.yaml` só via `scripts/lib/devflow-config.mjs`.
- **ADR-012:** nunca sobrescrever arquivo existente; preservar e reportar. Nunca agir sob `autonomy: autonomous`.
- **ADR-013:** o CLI emite fato observável; quem afirma é o agente, sobre evidência.
- **ADR-014:** proibido derivar frescor/abandono de `mtime` ou de fases concluídas.
- **git só via `execFileSync("git", [...])`** com argv — nunca `sh -c`, nunca string interpolada (guard `finalize-pure` reprova).
- **Plugin genérico:** zero hardcode deste repo. Sem presumir `CHANGELOG.md`, tags `v*` ou layout DDC. Projeto-cliente sem `docs/superpowers/plans/` = no-op limpo.
- **Testes:** fixtures git reais em `mkdtemp(tmpdir())`. **Nunca** mutar o repo (incidente de wipe).
- **`tests/run-unit.sh` enumera por `git ls-files`** — um teste não-commitado **não roda**. Todo passo RED exige `git add` antes de rodar, senão o "fail" é falso-verde.
- `requiredSignals: [unit, lint]`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `scripts/context-hygiene.mjs` (criar) | CLI: `scan --json` e `archive <paths>`. Fatos + recusa mecânica. |
| `tests/hygiene/context-hygiene.test.mjs` (criar) | 8 casos RED com fixture git em tmpdir. |
| `skills/context-hygiene/SKILL.md` (criar) | Julgamento semântico, consentimento, relatório. |
| `commands/devflow-cleanup.md` (criar) | Entrada `/devflow:devflow-cleanup [--fix]`. |
| `CHANGELOG.md` (modificar) | Entrada em `[Unreleased]`. |

---

### Task 1: CLI `scan` — inventário e classificação

**Files:**
- Create: `scripts/context-hygiene.mjs`
- Test: `tests/hygiene/context-hygiene.test.mjs`

**Interfaces:**
- Produces: `scanArtifacts(cwd) -> Artifact[]` onde
  `Artifact = { path: string, category: 'A'|'B'|'C'|'D'|'E', tracked: boolean, dirty: boolean, hasSpec: boolean, hasTracking: boolean, lastCommit: {sha,date}|null, releasesAfter: number, movable: boolean, reason: string|null }`
- Produces: CLI `node scripts/context-hygiene.mjs scan --json` → `{"artifacts": Artifact[]}` em stdout, exit 0.

- [ ] **Step 1: Escrever os testes que falham (classificação + movable)**

Criar `tests/hygiene/context-hygiene.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLI = join(process.cwd(), 'scripts/context-hygiene.mjs');

// Fixture: repo git real em tmpdir. NUNCA muta o repo do projeto.
async function makeRepo() {
  const d = await mkdtemp(join(tmpdir(), 'hygiene-'));
  const git = (...a) => execFileSync('git', ['-C', d, ...a], { stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 't@t.t');
  git('config', 'user.name', 'T');
  await mkdir(join(d, 'docs/superpowers/plans'), { recursive: true });
  await mkdir(join(d, 'docs/superpowers/specs'), { recursive: true });
  return { dir: d, git };
}

const scan = (dir) =>
  JSON.parse(execFileSync('node', [CLI, 'scan', '--json'], { cwd: dir, encoding: 'utf8' })).artifacts;

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
  const { dir, git } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-01-06-old.md'), '# o\n');
  git('add', '-A'); git('commit', '-qm', 'plan');
  await writeFile(join(dir, 'outro.txt'), 'x');
  git('add', '-A'); git('commit', '-qm', 'depois');
  git('tag', 'v9.9.9');
  const a = scan(dir).find((x) => x.path.includes('2026-01-06-old.md'));
  assert.equal(a.releasesAfter, 1, 'fato observável, não veredito');
  await rm(dir, { recursive: true, force: true });
});

test('repo sem docs/superpowers/plans → no-op limpo, exit 0', async () => {
  const d = await mkdtemp(join(tmpdir(), 'hygiene-empty-'));
  execFileSync('git', ['-C', d, 'init', '-q']);
  const out = execFileSync('node', [CLI, 'scan', '--json'], { cwd: d, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out).artifacts, []);
  await rm(d, { recursive: true, force: true });
});
```

- [ ] **Step 2: Commitar o teste e rodar para ver falhar**

O runner enumera por `git ls-files` — sem `git add`, o teste **não roda** e o RED é falso.

```bash
git add tests/hygiene/context-hygiene.test.mjs
node --test tests/hygiene/context-hygiene.test.mjs
```
Esperado: FAIL — `Cannot find module .../scripts/context-hygiene.mjs`.

- [ ] **Step 3: Implementar o CLI `scan`**

Criar `scripts/context-hygiene.mjs`:

```javascript
// context-hygiene.mjs — inventaria artefatos de processo e emite FATOS (nunca veredito).
// O julgamento "a entrega existe no código?" é do agente (D6/ADR-013).
// git só via execFileSync com argv — nunca shell.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative, basename } from "node:path";

const PLANS_DIR = "docs/superpowers/plans";   // convenção do superpowers, não deste repo
const SPECS_DIR = "docs/superpowers/specs";
const DOTCONTEXT_READONLY = [".context/plans", ".context/docs", ".context/agents", ".context/skills"];

function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { return ""; }
}

function listMd(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && statSync(join(dir, f)).isFile())
    .map((f) => join(dir, f));
}

// slug: tira o prefixo de data e o sufixo -design das specs
const slugOf = (p) => basename(p, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-design$/, "");

export function scanArtifacts(cwd = ".") {
  const out = [];
  const tracked = new Set(git(cwd, ["ls-files"]).split("\n").filter(Boolean));
  const dirty = new Set(
    git(cwd, ["status", "--porcelain"]).split("\n").filter(Boolean)
      .map((l) => l.slice(3).trim()),
  );
  const planFiles = listMd(join(cwd, PLANS_DIR));
  const specFiles = listMd(join(cwd, SPECS_DIR));
  const specSlugs = new Set(specFiles.map(slugOf));
  const planSlugs = new Set(planFiles.map(slugOf));

  const trackingDir = join(cwd, ".context/plans");
  const trackingFiles = listMd(trackingDir).filter((f) => basename(f) !== "README.md");
  const trackingSlugs = new Set(trackingFiles.map(slugOf));

  const tags = git(cwd, ["tag", "--format=%(refname:short)|%(creatordate:unix)"])
    .split("\n").filter(Boolean)
    .map((l) => Number(l.split("|")[1]));

  const describe = (abs, category) => {
    const rel = relative(cwd, abs);
    const isTracked = tracked.has(rel);
    const isDirty = dirty.has(rel);
    const shaLine = git(cwd, ["log", "-1", "--format=%H|%ct", "--", rel]);
    const [sha, ts] = shaLine ? shaLine.split("|") : [null, null];
    const lastCommit = sha ? { sha, date: new Date(Number(ts) * 1000).toISOString() } : null;
    const releasesAfter = ts ? tags.filter((t) => t > Number(ts)).length : 0;

    let movable = false, reason = null;
    if (category !== "A") reason = `categoria ${category} — só diagnóstico`;
    else if (!isTracked) reason = "untracked — o git não protege este arquivo";
    else if (isDirty) reason = "dirty — há modificação não-commitada";
    else movable = true;

    return {
      path: rel, category, tracked: isTracked, dirty: isDirty,
      hasSpec: specSlugs.has(slugOf(abs)),
      hasTracking: trackingSlugs.has(slugOf(abs)),
      lastCommit, releasesAfter, movable, reason,
    };
  };

  for (const p of planFiles) out.push(describe(p, "A"));
  for (const t of trackingFiles) out.push(describe(t, "B"));         // ADR-006: nunca movable
  for (const s of specFiles) if (!planSlugs.has(slugOf(s))) out.push(describe(s, "C"));
  return out;
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === "scan") {
    process.stdout.write(JSON.stringify({ artifacts: scanArtifacts(".") }, null, 2) + "\n");
    process.exit(0);
  }
  process.stderr.write("uso: context-hygiene.mjs scan --json | archive <path>...\n");
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
```

- [ ] **Step 4: Rodar os testes até passarem**

```bash
node --test tests/hygiene/context-hygiene.test.mjs
```
Esperado: 8 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add scripts/context-hygiene.mjs tests/hygiene/context-hygiene.test.mjs
git commit -m "feat(hygiene): CLI scan emite fatos de artefatos (D6)"
```

---

### Task 2: CLI `archive` — movimento com recusa mecânica

**Files:**
- Modify: `scripts/context-hygiene.mjs`
- Test: `tests/hygiene/context-hygiene.test.mjs`

**Interfaces:**
- Consumes: `scanArtifacts` (Task 1)
- Produces: `node scripts/context-hygiene.mjs archive <path>...` → `git mv` para `<PLANS_DIR>/archive/`; exit 0 no sucesso, exit 1 + motivo no stderr na recusa.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `tests/hygiene/context-hygiene.test.mjs`:

```javascript
const archive = (dir, ...paths) =>
  execFileSync('node', [CLI, 'archive', ...paths], { cwd: dir, encoding: 'utf8' });

test('archive move plano movable e preserva histórico', async () => {
  const { dir, git } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-02-01-ok.md'), '# ok\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  archive(dir, 'docs/superpowers/plans/2026-02-01-ok.md');

  const dest = 'docs/superpowers/plans/archive/2026-02-01-ok.md';
  assert.ok(existsSync(join(dir, dest)), 'movido para archive/');
  assert.ok(!existsSync(join(dir, 'docs/superpowers/plans/2026-02-01-ok.md')));
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

test('archive RECUSA path de .context/plans (ADR-006)', async () => {
  const { dir, git } = await makeRepo();
  await mkdir(join(dir, '.context/plans'), { recursive: true });
  await writeFile(join(dir, '.context/plans/t.md'), '---\n---\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  assert.throws(
    () => archive(dir, '.context/plans/t.md'),
    (e) => e.status !== 0,
  );
  assert.ok(existsSync(join(dir, '.context/plans/t.md')));
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
  const antigo = execFileSync('cat',
    [join(dir, 'docs/superpowers/plans/archive/2026-02-04-dup.md')], { encoding: 'utf8' });
  assert.match(antigo, /antigo/, 'nunca sobrescreve');
  await rm(dir, { recursive: true, force: true });
});
```

Adicionar ao topo do arquivo de teste: `import { existsSync } from 'node:fs';`

- [ ] **Step 2: Rodar para ver falhar**

```bash
git add tests/hygiene/context-hygiene.test.mjs
node --test tests/hygiene/context-hygiene.test.mjs
```
Esperado: os 5 novos falham (`archive` não implementado); os 8 da Task 1 continuam passando.

- [ ] **Step 3: Implementar `archive`**

Em `scripts/context-hygiene.mjs`, acrescentar antes de `main` (`mkdirSync` já foi
importado na Task 1 — não duplicar o import):

```javascript
export function archivePaths(cwd, paths) {
  const facts = scanArtifacts(cwd);
  const byPath = new Map(facts.map((f) => [f.path, f]));
  const moved = [], refused = [];

  for (const p of paths) {
    const f = byPath.get(p);
    if (!f) { refused.push({ path: p, reason: "não encontrado no inventário" }); continue; }
    if (!f.movable) { refused.push({ path: p, reason: f.reason }); continue; }

    const dest = join(PLANS_DIR, "archive", basename(p));
    if (existsSync(join(cwd, dest))) {
      refused.push({ path: p, reason: `destino já existe: ${dest} — preservado, nada sobrescrito` });
      continue;
    }
    mkdirSync(join(cwd, PLANS_DIR, "archive"), { recursive: true });
    try {
      execFileSync("git", ["-C", cwd, "mv", p, dest], { stdio: ["ignore", "ignore", "pipe"] });
      moved.push({ path: p, dest });
    } catch (e) {
      refused.push({ path: p, reason: `git mv falhou: ${String(e.stderr || e.message).trim()}` });
    }
  }
  return { moved, refused };
}
```

E no `main`, antes do fallback de uso:

```javascript
  if (cmd === "archive") {
    const paths = argv.slice(1).filter((a) => !a.startsWith("-"));
    if (paths.length === 0) { process.stderr.write("archive: nenhum path\n"); process.exit(2); }
    const { moved, refused } = archivePaths(".", paths);
    for (const m of moved) process.stdout.write(`moved: ${m.path} -> ${m.dest}\n`);
    for (const r of refused) process.stderr.write(`refused: ${r.path} — ${r.reason}\n`);
    process.exit(refused.length > 0 ? 1 : 0);
  }
```

- [ ] **Step 4: Rodar até passar**

```bash
node --test tests/hygiene/context-hygiene.test.mjs
```
Esperado: 13 pass, 0 fail.

- [ ] **Step 5: Verificar que o guard de pureza continua verde**

```bash
bash tests/run-lint.sh
```
Esperado: exit 0 (git só via `execFileSync` com argv — sem shell).

- [ ] **Step 6: Commit**

```bash
git add scripts/context-hygiene.mjs tests/hygiene/context-hygiene.test.mjs
git commit -m "feat(hygiene): archive com recusa mecânica (D4/ADR-006/ADR-012)"
```

---

### Task 3: Skill e comando

**Files:**
- Create: `skills/context-hygiene/SKILL.md`
- Create: `commands/devflow-cleanup.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `node "$CLAUDE_PLUGIN_ROOT/scripts/context-hygiene.mjs" scan --json` e `archive <paths>`

- [ ] **Step 1: Escrever `skills/context-hygiene/SKILL.md`**

```markdown
---
name: context-hygiene
description: Use quando o projeto acumulou artefatos de processo obsoletos (planos entregues, specs órfãs, trackings pendurados) e o contexto do agente está poluído — "limpar o projeto", "context rot", "arquivar planos entregues", "/devflow cleanup". Diagnostica 5 categorias e arquiva com segurança só os planos com entrega observável.
---

# Higiene de contexto

Retira de circulação artefatos de processo que já cumpriram seu papel, para o agente
parar de ler material obsoleto com aparência de autoridade.

**Announce at start:** "I'm using the devflow:context-hygiene skill to audit context rot."

## Princípio

Nenhum sinal auto-declarado é confiável (checkbox, `progress:`, status no frontmatter):
ninguém volta para marcar o artefato depois da entrega. O critério é **entrega
observável no código** — o CLI dá os fatos, você dá o veredito (ADR-013).

## Step 1 — Coletar fatos

    node "$CLAUDE_PLUGIN_ROOT/scripts/context-hygiene.mjs" scan --json

Se `artifacts` vier vazio, informe "nenhum artefato de processo encontrado" e pare.

## Step 2 — Julgar (só categoria A)

Para cada artefato `category: "A"` com `movable: true`, abra o plano e verifique se o
que ele descreve **existe hoje no código**: o arquivo/função/skill citada existe? há
teste? saiu release depois? Use `releasesAfter` como indício, **nunca** como prova — é
fato bruto, não veredito (ADR-014 proíbe inferir entrega de data/inatividade).

Veredito por plano: `ENTREGUE` (evidência encontrada) · `EM ABERTO` (não encontrada) ·
`INCERTO` (evidência ambígua — na dúvida, **não** arquive).

## Step 3 — Apresentar

Tabela com: plano · veredito · **a evidência concreta** que o sustenta · `movable`.
Liste à parte, sem propor ação:
- **B** trackings órfãos — território dotcontext (ADR-006), só denúncia
- **C/D/E** specs órfãs, docs duplicados, ruído gitignored

Nunca prossiga sem `--fix` — sem a flag, o diagnóstico é o entregável.

## Step 4 — Consentimento e ação

Peça confirmação explícita listando exatamente o que será movido. Nunca execute sob
`autonomy: autonomous` (ADR-012). Então:

    node "$CLAUDE_PLUGIN_ROOT/scripts/context-hygiene.mjs" archive <paths...>

O CLI recusa sozinho o que o git não protege — se ele recusar, **relate a recusa**, não
tente contornar.

## Step 5 — Relatório

Movidos · recusados com motivo · reportados sem ação. Declare a limitação: `archive/`
some da listagem, mas `grep`/`glob` ainda alcançam a pasta.

## Anti-patterns

| Pensamento | Realidade |
|---|---|
| "O checkbox está desmarcado, então não foi entregue" | Sinal morto. Verifique o código. |
| "Está parado há meses, deve estar entregue" | Plano abandonado também para. ADR-014 proíbe. |
| "Vou limpar o `.context/plans/` também" | ADR-006: território dotcontext. Só denuncie. |
| "O CLI recusou, vou mover na mão" | A recusa é a salvaguarda. Relate. |
| "Untracked está obsoleto mesmo, apago" | Untracked = git não protege = WIP possível. |
```

- [ ] **Step 2: Escrever `commands/devflow-cleanup.md`**

```markdown
---
description: Audita context rot e arquiva planos entregues (diagnóstico por padrão; --fix para agir)
---

# /devflow:devflow-cleanup

Invoca a skill `devflow:context-hygiene`.

## Usage

    /devflow:devflow-cleanup           # só diagnóstico
    /devflow:devflow-cleanup --fix     # propõe arquivamento sob confirmação

## Behavior

1. Invoke `devflow:context-hygiene`
2. Sem `--fix`: para no relatório de diagnóstico
3. Com `--fix`: propõe o arquivamento e exige confirmação explícita antes de mover
```

- [ ] **Step 3: Entrada no CHANGELOG**

Em `CHANGELOG.md`, sob `## [Unreleased]` → `### Added`:

```markdown
- **Higiene de contexto** — `/devflow:devflow-cleanup` diagnostica artefatos de processo
  obsoletos em 5 categorias e arquiva planos com entrega observável. Só move arquivo que
  o git protege (`tracked && !dirty`, via `git mv`); `.context/` é território dotcontext e
  nunca é tocado (ADR-006). Diagnóstico por padrão, ação só com `--fix` + confirmação.
```

- [ ] **Step 4: Verificar que a skill é bem-formada**

```bash
head -5 skills/context-hygiene/SKILL.md
bash tests/run-lint.sh
```
Esperado: frontmatter com `name` e `description`; lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add skills/context-hygiene/ commands/devflow-cleanup.md CHANGELOG.md
git commit -m "feat(hygiene): skill context-hygiene + /devflow:devflow-cleanup"
```

---

### Task 4: Dogfooding — auditar e arquivar os planos deste repo

**Files:**
- Move: `docs/superpowers/plans/*.md` → `docs/superpowers/plans/archive/`

**Interfaces:**
- Consumes: o CLI e a skill das Tasks 1–3.

- [ ] **Step 1: Rodar o scan real**

```bash
node scripts/context-hygiene.mjs scan --json > /tmp/hygiene-scan.json
node -e "const a=require('/tmp/hygiene-scan.json').artifacts; console.log('A:',a.filter(x=>x.category==='A').length,'movable:',a.filter(x=>x.movable).length,'B:',a.filter(x=>x.category==='B').length,'C:',a.filter(x=>x.category==='C').length)"
```
Esperado: ~38 em A, 35 movable (3 untracked recusados), ~7 em B.

- [ ] **Step 2: Julgar cada candidato**

Seguir o Step 2 da skill: abrir cada plano `movable: true` e buscar a entrega no código.
Registrar veredito + evidência. Os 3 untracked (`devflow-e2e-fixes`,
`auto-release-opt-in`, `harness-sensors-catalog-gap`) já vêm recusados pelo CLI — os dois
últimos declaram "não implementado — backlog", então o veredito bate com a recusa.

- [ ] **Step 3: Apresentar ao operador e obter confirmação**

Tabela com plano · veredito · evidência. **Não** prosseguir sem aprovação explícita.

- [ ] **Step 4: Arquivar os aprovados**

```bash
node scripts/context-hygiene.mjs archive <paths aprovados...>
```

- [ ] **Step 5: Verificar o resultado**

```bash
ls docs/superpowers/plans/*.md | wc -l        # só os vivos
ls docs/superpowers/plans/archive/*.md | wc -l
git log --follow --format=%s -- docs/superpowers/plans/archive/<um-arquivo>.md | tail -3
```
Esperado: histórico preservado nos movidos.

- [ ] **Step 6: Commit**

```bash
git add -A docs/superpowers/plans/
git commit -m "chore(hygiene): arquiva planos entregues (dogfooding)"
```

---

## Verificação final

- [ ] `bash tests/run-unit.sh` → exit 0
- [ ] `bash tests/run-lint.sh` → exit 0
- [ ] `node scripts/verify/verify-gate.mjs` → requiredSignals `[unit, lint]` observados verdes

A fase V **observa o ledger** — nunca afirma que passou (ADR-013).
