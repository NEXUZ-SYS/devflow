# Higiene de contexto (anti context-rot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** `context-hygiene` | **Scale:** MEDIUM | **Phase:** P→R
> **Spec:** [`docs/superpowers/specs/2026-07-22-context-hygiene-design.md`](../specs/2026-07-22-context-hygiene-design.md) (commit `4d8f575`)

**Goal:** Dar ao DevFlow a capacidade de identificar artefatos de processo obsoletos e arquivar com segurança os planos já entregues, sem depender de nenhum sinal auto-declarado.

**Architecture:** Um CLI puro (`scripts/context-hygiene.mjs`) inventaria artefatos e emite **fatos** em JSON — nunca veredito. Uma skill (`skills/context-hygiene/`) lê esses fatos, faz o julgamento semântico "a entrega existe no código?" e conduz o consentimento. A recusa de mover arquivo desprotegido é **mecânica no CLI**, não instrução em prosa.

**Tech Stack:** Node ESM zero-dep (`node:child_process`, `node:fs`), `node --test`, git via `execFileSync` com argv.

**Agents:** `feature-developer` (Tasks 1–3), `security-auditor` (revisão da fase R — a feature move arquivos).

> **Revisto na fase R** (architect + security-auditor, achados verificados por probe).
> Correções incorporadas: S1 (coordenadas de `tracked`/`dirty`), S2 (`git()` engolindo falha),
> S3 (guard de pureza não cobria o arquivo), F2.1 (hardcode `.context/`), F4.1 (consentimento
> em prosa), F6.2/F6.3 (dois testes que não passavam). Task 4 (dogfooding) saiu para follow-up.

## Global Constraints

- **ADR-006:** `.context/{docs,agents,skills,plans}` é território dotcontext — nunca escrever/mover ali. Paths de `.context/` resolvem por `scripts/lib/context-paths.mjs`, **nunca hardcode** (a lib já expõe `docs`/`agents`/`skills`/`plans` marcados "INTOCADOS").
- **ADR-011:** ler `.devflow.yaml` só via `scripts/lib/devflow-config.mjs`.
- **ADR-012:** nunca sobrescrever arquivo existente; preservar e reportar. Nunca agir sob `autonomy: autonomous`.
- **ADR-013:** o CLI emite fato observável; quem afirma é o agente, sobre evidência.
- **ADR-014:** proibido derivar frescor/abandono de `mtime` ou de fases concluídas.
- **git só via `execFileSync("git", [...])`** com argv — nunca `sh -c`, nunca string interpolada. **Este controle só existe se a Task 2 estendê-lo** (o guard `finalize-pure` varre apenas `scripts/lib/finalize/`; hoje NÃO alcança este arquivo).
- **Âncora na raiz do repo:** todo comando git e todo path relativo se ancora em `git rev-parse --show-toplevel`, **nunca** em `process.cwd()`. `ls-files` e `status --porcelain` usam sistemas de coordenadas diferentes fora da raiz — misturá-los faz `dirty` degradar para `false` (fail-open sobre WIP).
- **Falha ≠ vazio:** `git()` devolve `null` em erro e `""` só em sucesso-vazio. Falha de `ls-files`/`status` **aborta**; nunca prossegue assumindo "nada sujo".
- **Silêncio apodrece:** saída vazia sempre acompanha a **procedência da busca** (onde procurou, existia?). Vazio-por-limpeza e vazio-por-erro nunca podem ser indistinguíveis — é o mesmo defeito que a spec diagnostica nos checkboxes mortos.
- **Plugin genérico:** zero hardcode deste repo. Sem presumir `CHANGELOG.md`, tags `v*` ou layout DDC. Projeto-cliente sem `docs/superpowers/plans/` = no-op limpo **e explícito**.
- **Testes:** fixtures git reais em `mkdtemp(tmpdir())`. **Nunca** mutar o repo (incidente de wipe).
- **`tests/run-unit.sh` enumera por `git ls-files`** — um teste não-commitado **não roda**. Todo passo RED exige `git add` antes de rodar, senão o "fail" é falso-verde.
- **Datas determinísticas em fixture:** commits e tags com `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` fixos e tag **anotada**. Timestamp do git tem resolução de 1 segundo — fixture sem data explícita produz teste que falha 12 em 12 execuções rápidas.
- `requiredSignals: [unit, lint]` — o contrato do CLI é exercido por subprocess dentro do sinal `unit`; `tests/run-e2e.sh` não ganharia caso novo (isenção declarada, não omissão).

---

## File Structure

Segue a convenção do repo (`scripts/doctor.mjs` → `./lib/doctor.mjs`; `instinct-cli.mjs` → `./lib/`):
**lib pura testável + CLI fino**.

| Arquivo | Responsabilidade |
|---|---|
| `scripts/lib/context-hygiene.mjs` (criar) | Lógica pura: `scanArtifacts`, `archivePaths`. Fatos + recusa mecânica. |
| `scripts/context-hygiene.mjs` (criar) | CLI fino: `main`, parsing de argv, exit codes. |
| `tests/hygiene/context-hygiene.test.mjs` (criar) | Fixtures git em tmpdir. Classificação chama a lib direto; contrato de exit code chama o CLI. |
| `tests/lib/finalize/finalize-pure.test.mjs` (modificar) | Estender o guard para cobrir os dois arquivos novos (S3). |
| `tests/run-lint.sh` (modificar) | Passar a rodar o guard de pureza (hoje não roda). |
| `skills/context-hygiene/SKILL.md` (criar) | Julgamento semântico, consentimento, relatório. |
| `commands/devflow-cleanup.md` (criar) | Entrada `/devflow:devflow-cleanup [--fix]`. |
| `commands/devflow.md` (modificar) | Listar o comando novo no menu (senão é indescobrível). |
| `CHANGELOG.md` (modificar) | Entrada em `[Unreleased]`. |

---

### Task 1: CLI `scan` — inventário e classificação

**Files:**
- Create: `scripts/lib/context-hygiene.mjs` (lógica pura) e `scripts/context-hygiene.mjs` (CLI fino)
- Test: `tests/hygiene/context-hygiene.test.mjs`

**Interfaces:**
- Produces: `scanArtifacts(cwd) -> Artifact[]` onde
  `Artifact = { path: string, category: 'A'|'B'|'C', tracked: boolean, dirty: boolean, hasSpec: boolean|null, hasTracking: boolean|null, lastCommit: {sha,date}|null, releasesAfter: number, movable: boolean, reason: string|null }`
- Produces: envelope `{ artifacts: Artifact[], scannedDirs: [{path, exists, readOnly?}], root: string, error: string|null }`

> **Escopo das categorias:** esta versão entrega **A, B e C**. As categorias D (docs
> soltos/duplicados) e E (ruído gitignored) da spec ficam **fora de escopo** — "duplicado"
> sem definição operacional vira heurística, que é o que a ADR-014 proíbe. O corte é
> propagado em spec, SKILL.md e CHANGELOG: prometer 5 e entregar 3 faria o agente listar
> D/E sempre vazias, sugerindo "não há duplicados" quando nunca foram procurados.

- Produces: CLI `node scripts/context-hygiene.mjs scan` → o envelope acima em stdout, exit 0.

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
  // gitAt: data explícita. Timestamp do git tem resolução de 1s — fixture sem data
  // fixa produz teste não-determinístico (medido: 0/12 passaram em sucessão rápida).
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

const scan = (dir) =>
  JSON.parse(execFileSync('node', [CLI, 'scan'], { cwd: dir, encoding: 'utf8' })).artifacts;

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
  // Tag ANOTADA: tag leve herda a data do commit apontado, e os dois commits do
  // fixture caem no mesmo segundo (resolução do git) — medido: falha 12/12 em
  // execução rápida. A data é fixada, a asserção NUNCA é afrouxada.
  gitAt('2026-01-02T00:00:00Z', 'tag', '-a', 'v9.9.9', '-m', 'release');
  const a = scan(dir).find((x) => x.path.includes('2026-01-06-old.md'));
  assert.equal(a.releasesAfter, 1, 'fato observável, não veredito');
  await rm(dir, { recursive: true, force: true });
});

test('plano acentuado commitado NÃO é reportado como untracked', async () => {
  const { dir, git } = await makeRepo();
  // core.quotePath=true (default) C-quota não-ASCII no ls-files. Sem -z, este
  // arquivo volta como "...configura\303\247\303\243o.md", não casa a chave, e o
  // CLI declara "untracked" sobre arquivo commitado — fato FALSO (S7).
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
  await writeFile(p, '# ok\nWIP NAO COMMITADO\n');   // suja o arquivo
  // Roda de dentro de um subdiretório: ls-files é relativo ao cwd e
  // status --porcelain é relativo à raiz. Sem ancorar na raiz, dirty vira false
  // e o WIP seria movido — provado por probe na fase R.
  await mkdir(join(dir, 'sub'), { recursive: true });
  const out = JSON.parse(execFileSync('node', [CLI, 'scan'],
    { cwd: join(dir, 'sub'), encoding: 'utf8' }));
  const a = out.artifacts.find((x) => x.path.includes('2026-01-08-wip.md'));
  assert.equal(a.dirty, true, 'sujeira tem de ser vista de qualquer subdiretório');
  assert.equal(a.movable, false);
  await rm(dir, { recursive: true, force: true });
});

test('scan emite procedência da busca (vazio-limpo ≠ vazio-por-erro)', async () => {
  const d = await mkdtemp(join(tmpdir(), 'hygiene-prov-'));
  execFileSync('git', ['-C', d, 'init', '-q']);
  const out = JSON.parse(execFileSync('node', [CLI, 'scan'], { cwd: d, encoding: 'utf8' }));
  assert.deepEqual(out.artifacts, []);
  const plans = out.scannedDirs.find((s) => s.path === 'docs/superpowers/plans');
  assert.equal(plans.exists, false, 'tem de declarar que o dir não existia');
  await rm(d, { recursive: true, force: true });
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
// lib/context-hygiene.mjs — inventaria artefatos de processo e emite FATOS (nunca veredito).
// O julgamento "a entrega existe no código?" é do agente (D6/ADR-013).
// git só via execFileSync com argv — nunca shell.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, mkdirSync, readFileSync } from "node:fs";
import { join, relative, basename, resolve } from "node:path";
import { contextPaths } from "./context-paths.mjs";

// Convenção do superpowers (writing-plans/brainstorming), estável de 5.0.6 a 6.1.1 —
// não é path deste repo. Sob o trilho DevFlow o dir aparece por construção.
const PLANS_DIR = "docs/superpowers/plans";
const SPECS_DIR = "docs/superpowers/specs";

// git() distingue FALHA de VAZIO: null = comando falhou, "" = sucesso sem saída.
// Engolir a falha como "" faz `dirty` degradar para false — fail-open sobre WIP (S2).
function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,   // default 1MiB estoura em monorepo → ENOBUFS
    }).trim();
  } catch { return null; }
}

// git -z emite paths NUL-separated e sem C-quoting. Sem isso, um plano acentuado
// ("configuração.md") volta C-quotado, não casa a chave, e é reportado como
// "untracked" sendo commitado — fato FALSO num plugin que serve pt-BR/es-ES (S7).
function gitZ(cwd, args) {
  const out = git(cwd, [...args, "-z"]);
  if (out === null) return null;
  return out.split("\0").filter(Boolean);
}

// Não-recursivo por design: `archive/` é subdir, então não é re-escaneado.
// statSync lança em symlink pendurado / arquivo removido no meio da varredura (S10) —
// o CLI degrada, nunca morre com stack trace.
function listMd(dir) {
  if (!existsSync(dir)) return [];
  let entries;
  try { entries = readdirSync(dir); } catch { return []; }
  return entries
    .filter((f) => {
      if (!f.endsWith(".md")) return false;
      try { return statSync(join(dir, f)).isFile(); } catch { return false; }
    })
    .map((f) => join(dir, f));
}

// slug: tira o prefixo de data; o sufixo -design só é removido para SPECS.
// Removê-lo indiscriminadamente faria um plano "token-design.md" parear com a
// spec "token-design-design.md" (F7.6).
const slugOf = (p, isSpec) => {
  const base = basename(p, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return isSpec ? base.replace(/-design$/, "") : base;
};

// Plano vinculado ao workflow ativo, lido do estado do PREVC. Degrada para null
// em qualquer erro — nunca lança, nunca bloqueia o scan.
function readActivePlanPath(root) {
  for (const p of ["runtime/workflows/prevc.json", "workflow/prevc.json"]) {
    try {
      const raw = readFileSync(join(root, ".context", p), "utf8");
      const plan = JSON.parse(raw)?.plan?.sources?.plan ?? JSON.parse(raw)?.activePlanPath;
      if (typeof plan === "string" && plan) return plan;
    } catch { /* segue para o próximo candidato */ }
  }
  return null;
}

export function scanArtifacts(cwd = ".") {
  // ÂNCORA: tudo se mede da raiz do repo. `ls-files` é relativo ao cwd e
  // `status --porcelain` é relativo à raiz — fora da raiz as chaves não batem e
  // `dirty` vira false para arquivo COM WIP (S1, fail-open provado por probe).
  const root = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (root === null) {
    return { artifacts: [], scannedDirs: [], error: "não é um repositório git" };
  }

  const trackedList = gitZ(root, ["ls-files", "--full-name"]);
  const statusList = gitZ(root, ["status", "--porcelain"]);
  // Falha de qualquer um dos dois ABORTA. Prosseguir com conjunto vazio faria
  // "nada está sujo" — exatamente o fail-open que a salvaguarda existe para evitar.
  if (trackedList === null || statusList === null) {
    return { artifacts: [], scannedDirs: [], error: "git ls-files/status falhou — nada é movível" };
  }

  const tracked = new Set(trackedList);
  const dirty = new Set(
    statusList
      .filter((l) => !l.startsWith("??"))          // untracked não é "modificado" (F7.5)
      .map((l) => l.slice(3))
      .flatMap((p) => p.split(" -> "))             // rename staged: R old -> new (S11)
      .filter(Boolean),
  );

  const rel = (abs) => relative(root, abs);

  // Planos: README/INDEX não é artefato de processo — arquivar o índice do próprio
  // diretório seria absurdo (S15). Candidato exige prefixo de data (convenção superpowers).
  const isPlanFile = (f) => /^\d{4}-\d{2}-\d{2}-/.test(basename(f));
  const planFiles = listMd(join(root, PLANS_DIR)).filter(isPlanFile);
  const specFiles = listMd(join(root, SPECS_DIR));
  const specSlugs = new Set(specFiles.map((s) => slugOf(s, true)));
  const planSlugs = new Set(planFiles.map((p) => slugOf(p, false)));

  // ADR-006: o path do território dotcontext vem da lib canônica, nunca hardcode.
  // A própria lib marca estas chaves como "dotcontext-managed (INTOCADOS)".
  const cp = contextPaths(root);
  const trackingFiles = listMd(cp.plans).filter((f) => basename(f) !== "README.md");
  const trackingSlugs = new Set(trackingFiles.map((f) => slugOf(f, false)));

  // Tag ANOTADA tem creatordate própria; tag leve herda a data do commit apontado.
  // Fato bruto — quem interpreta é o LLM (ADR-014 proíbe virar veredito de abandono).
  const tagLines = git(root, ["tag", "-l", "--format=%(refname:short)|%(creatordate:unix)"]) ?? "";
  const tags = tagLines.split("\n").filter(Boolean).map((l) => Number(l.split("|")[1]));

  // O plano do workflow ATIVO nunca é movível — arquivá-lo no meio do próprio
  // workflow quebraria o ponteiro de retomada do SessionStart (ADR-014/v1.30.0).
  const activePlan = readActivePlanPath(root);

  const describe = (abs, category) => {
    const r = rel(abs);
    const isTracked = tracked.has(r);
    const isDirty = dirty.has(r);
    const shaLine = git(root, ["log", "-1", "--format=%H|%ct", "--", r]);
    const [sha, ts] = shaLine ? shaLine.split("|") : [null, null];
    const lastCommit = sha ? { sha, date: new Date(Number(ts) * 1000).toISOString() } : null;
    const releasesAfter = ts ? tags.filter((t) => t > Number(ts)).length : 0;

    let movable = false, reason = null;
    if (category === "B") reason = "ADR-006: território dotcontext — nunca movido";
    else if (category !== "A") reason = `categoria ${category} — só diagnóstico`;
    else if (activePlan && r === activePlan) reason = "plano do workflow ativo";
    else if (!isTracked) reason = "untracked — o git não protege este arquivo";
    else if (isDirty) reason = "dirty — há modificação não-commitada";
    else movable = true;

    return {
      path: r, category, tracked: isTracked, dirty: isDirty,
      // hasSpec/hasTracking só fazem sentido para planos (numa spec, hasSpec se
      // compararia consigo mesma e seria sempre true — fato sem significado).
      hasSpec: category === "A" ? specSlugs.has(slugOf(abs, false)) : null,
      hasTracking: category === "A" ? trackingSlugs.has(slugOf(abs, false)) : null,
      lastCommit, releasesAfter, movable, reason,
    };
  };

  const out = [];
  for (const p of planFiles) out.push(describe(p, "A"));
  for (const t of trackingFiles) out.push(describe(t, "B"));         // ADR-006: nunca movable
  for (const s of specFiles) if (!planSlugs.has(slugOf(s, true))) out.push(describe(s, "C"));

  // PROCEDÊNCIA: sem isto, "achei nada porque está limpo" e "achei nada porque
  // procurei no lugar errado" produzem a mesma saída — o defeito que a spec condena.
  const scannedDirs = [
    { path: PLANS_DIR, exists: existsSync(join(root, PLANS_DIR)) },
    { path: SPECS_DIR, exists: existsSync(join(root, SPECS_DIR)) },
    { path: rel(cp.plans), exists: existsSync(cp.plans), readOnly: true },
  ];
  return { artifacts: out, scannedDirs, root, error: null };
}

function main(argv) {
  const cmd = argv[0];

  if (cmd === "scan") {
    // exitCode em vez de exit(): process.exit logo após um write grande pode
    // truncar em pipe, e a skill lê justamente por pipe (S9).
    process.stdout.write(JSON.stringify(scanArtifacts("."), null, 2) + "\n");
    process.exitCode = 0;
    return;
  }

  if (cmd === "archive") {
    const flags = argv.slice(1).filter((a) => a.startsWith("-"));
    const paths = argv.slice(1).filter((a) => !a.startsWith("-"));

    // Flags desconhecidas são ERRO, nunca descartadas em silêncio (S14).
    const unknown = flags.filter((f) => f !== "--confirmed" && f !== "--json");
    if (unknown.length) {
      process.stderr.write(`archive: flag desconhecida: ${unknown.join(", ")}\n`);
      process.exitCode = 2; return;
    }

    // GATE MECÂNICO de consentimento. A spec argumenta que guardrail em prosa é
    // racionalizável por um agente — então o consentimento não pode viver só no
    // Markdown da skill. Só a skill emite --confirmed, depois do "sim" do operador.
    if (!flags.includes("--confirmed")) {
      process.stderr.write(
        "archive: exige --confirmed (consentimento humano registrado pela skill)\n");
      process.exitCode = 2; return;
    }
    if (paths.length === 0) {
      process.stderr.write("archive: nenhum path\n");
      process.exitCode = 2; return;
    }

    const { moved, refused } = archivePaths(".", paths);
    // Saída estruturada como no scan — o agente lê dado, não parseia prosa (ADR-013).
    process.stdout.write(JSON.stringify({ moved, refused }, null, 2) + "\n");
    for (const r of refused) process.stderr.write(`refused: ${r.path} — ${r.reason}\n`);

    // Exit distingue os três estados. Um único código para "parcial" e "nada" faria
    // o agente reprocessar os já movidos e concluir que a ferramenta quebrou (F6.1).
    process.exitCode = refused.length === 0 ? 0 : (moved.length > 0 ? 3 : 1);
    return;
  }

  process.stderr.write("uso: context-hygiene.mjs scan | archive --confirmed <path>...\n");
  process.exitCode = 2;
}

// pathToFileURL: import.meta.url é percent-encoded e argv[1] não. Interpolar cru
// faz main() NÃO rodar quando o path tem espaço — CLI sai 0 imprimindo nada, e a
// skill quebra no JSON.parse de string vazia (S8). Plugin roda via $CLAUDE_PLUGIN_ROOT.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
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
  execFileSync('node', [CLI, 'archive', '--confirmed', ...paths], { cwd: dir, encoding: 'utf8' });

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
  // git mv apenas ESTAGIA o rename. Sem commitar, --follow percorre commits onde
  // o destino não existe e devolve VAZIO — verificado: o assert falharia sempre.
  // Commitar aqui também documenta o contrato: o CLI deixa a árvore com rename staged.
  git('commit', '-qm', 'archive');
  const log = execFileSync('git', ['-C', dir, 'log', '--follow', '--format=%s', '--', dest],
    { encoding: 'utf8' });
  assert.match(log, /add/, 'git mv preserva o histórico');
  await rm(dir, { recursive: true, force: true });
});

test('archive RECUSA path fora do inventário (allowlist / traversal)', async () => {
  const { dir, git } = await makeRepo();
  await writeFile(join(dir, 'docs/superpowers/plans/2026-02-05-x.md'), '# x\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  for (const evil of ['../../../etc/passwd.md', '/etc/passwd', './docs/superpowers/plans/2026-02-05-x.md']) {
    assert.throws(
      () => archive(dir, evil),
      (e) => e.status !== 0,
      `deve recusar: ${evil}`,
    );
  }
  assert.ok(existsSync(join(dir, 'docs/superpowers/plans/2026-02-05-x.md')), 'intacto');
  await rm(dir, { recursive: true, force: true });
});

test('archive RECUSA quando o git status falha (nunca assume "nada sujo")', async () => {
  const d = await mkdtemp(join(tmpdir(), 'hygiene-nogit-'));
  await mkdir(join(d, 'docs/superpowers/plans'), { recursive: true });
  await writeFile(join(d, 'docs/superpowers/plans/2026-02-06-x.md'), '# x\n');
  // Sem `git init`: não é repo. O scan tem de abortar, não devolver dirty vazio.
  const out = JSON.parse(execFileSync('node', [CLI, 'scan'], { cwd: d, encoding: 'utf8' }));
  assert.deepEqual(out.artifacts, []);
  assert.match(out.error ?? '', /git/i, 'falha tem de ser declarada, não silenciada');
  await rm(d, { recursive: true, force: true });
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
  // Assertar só `status !== 0` passaria por qualquer motivo — inclusive um crash.
  // No invariante mais crítico do design, o teste tem de provar a CAUSA (S5b).
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

test('archive parcial: move os válidos, recusa os outros, exit 3', async () => {
  const { dir, git } = await makeRepo();
  const ok = 'docs/superpowers/plans/2026-02-07-ok.md';
  const wip = 'docs/superpowers/plans/2026-02-08-wip.md';
  await writeFile(join(dir, ok), '# ok\n');
  git('add', '-A'); git('commit', '-qm', 'add');
  await writeFile(join(dir, wip), '# untracked\n');   // nunca commitado
  // Exit precisa distinguir "parcial" de "nada movido": com um código só, o agente
  // reprocessa os já movidos, recebe "não encontrado" e conclui que quebrou (F6.1).
  let err;
  try { archive(dir, ok, wip); } catch (e) { err = e; }
  assert.equal(err.status, 3, 'parcial = 3');
  assert.ok(existsSync(join(dir, 'docs/superpowers/plans/archive/2026-02-07-ok.md')));
  assert.ok(existsSync(join(dir, wip)), 'o untracked continua onde estava');
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
  const scan = scanArtifacts(cwd);
  if (scan.error) return { moved: [], refused: paths.map((p) => ({ path: p, reason: scan.error })) };

  const root = scan.root;
  const cp = contextPaths(root);
  const byPath = new Map(scan.artifacts.map((f) => [f.path, f]));
  const moved = [], refused = [];
  const seen = new Set();

  for (const p of paths) {
    // Dedup: sem isto o 2º idêntico "recusa" com a mensagem errada de destino
    // existente — descrevendo como conflito o arquivo que ele mesmo acabou de mover (S13).
    if (seen.has(p)) { refused.push({ path: p, reason: "path duplicado na mesma invocação" }); continue; }
    seen.add(p);

    // Guard 1 — território dotcontext, EXPLÍCITO e antes de tudo. Não depender do
    // inventário para isso: hoje ele protege por não enumerar, mas o dia em que
    // alguém ampliar o listMd a proteção evaporaria em silêncio (S5).
    const abs = resolve(root, p);
    if (abs === cp.root || abs.startsWith(cp.root + "/")) {
      refused.push({ path: p, reason: "ADR-006: território dotcontext — nunca movido" });
      continue;
    }

    // Guard 2 — containment: o alvo tem de estar sob o dir de planos, sempre.
    const plansAbs = join(root, PLANS_DIR);
    if (!abs.startsWith(plansAbs + "/")) {
      refused.push({ path: p, reason: `fora de ${PLANS_DIR} — recusado` });
      continue;
    }

    // Guard 3 — allowlist por igualdade exata contra o inventário gerado pelo scan.
    const f = byPath.get(p);
    if (!f) { refused.push({ path: p, reason: "não encontrado no inventário" }); continue; }
    if (!f.movable) { refused.push({ path: p, reason: f.reason }); continue; }

    // Guard 4 — reconfere a sujeira IMEDIATAMENTE antes de mover. Fecha a janela
    // TOCTOU entre o scan e este mv (um editor salvando durante o laço) — S12.
    const nowDirty = git(root, ["status", "--porcelain", "--", p]);
    if (nowDirty === null || nowDirty !== "") {
      refused.push({ path: p, reason: "ficou sujo entre o scan e o mv — recusado" });
      continue;
    }

    const dest = join(PLANS_DIR, "archive", basename(p));
    if (existsSync(join(root, dest))) {
      refused.push({ path: p, reason: `destino já existe: ${dest} — preservado, nada sobrescrito` });
      continue;
    }
    mkdirSync(join(root, PLANS_DIR, "archive"), { recursive: true });
    try {
      // --end-of-options: hoje o prefixo do dir impede que p comece com "-", mas a
      // proteção seria incidental. O repo já pagou esse preço (uma base "--output="
      // fez o git ESCREVER arquivo). Defesa explícita custa um token.
      execFileSync("git", ["-C", root, "mv", "--end-of-options", p, dest],
        { stdio: ["ignore", "ignore", "pipe"] });
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
Esperado: 21 pass, 0 fail.

- [ ] **Step 5: Fazer o guard de pureza EXISTIR para estes arquivos**

O plano afirmava que `finalize-pure` reprovaria shell aqui. **Não reprovaria**: ele varre
só `scripts/lib/finalize/`, e `run-lint.sh` nem o executa. `bash tests/run-lint.sh` sairia
verde mesmo com `execSync("git mv " + p)`. Um controle que existe só na prosa é
exatamente o que esta feature combate — então o controle passa a existir.

Em `tests/lib/finalize/finalize-pure.test.mjs`, generalizar a lista de alvos:

```javascript
// Antes: só scripts/lib/finalize/. O guard de pureza vale para todo código que
// invoca git — não só para o subsistema onde nasceu.
const TARGETS = [
  { dir: fileURLToPath(new URL("../../../scripts/lib/finalize/", import.meta.url)) },
  { dir: fileURLToPath(new URL("../../../scripts/lib/", import.meta.url)),
    only: ["context-hygiene.mjs"] },
  { dir: fileURLToPath(new URL("../../../scripts/", import.meta.url)),
    only: ["context-hygiene.mjs"] },
];
```

RED primeiro: adicionar ao teste um caso que leia os arquivos novos e reprove
`shell: true`, `execSync(`, `eval(` e interpolação de string em comando git. Confirmar que
falha se alguém introduzir `execSync`, e passa com a implementação por argv.

Depois, em `tests/run-lint.sh`, acrescentar a execução do guard:

```bash
node --test tests/lib/finalize/finalize-pure.test.mjs
```

- [ ] **Step 6: Rodar o lint e confirmar que agora ele VÊ os arquivos**

```bash
bash tests/run-lint.sh
```
Esperado: exit 0 — e, diferente de antes, o guard de fato inspecionou
`scripts/context-hygiene.mjs` e `scripts/lib/context-hygiene.mjs`.

- [ ] **Step 7: Commit**

```bash
git add scripts/context-hygiene.mjs scripts/lib/context-hygiene.mjs \
        tests/hygiene/context-hygiene.test.mjs \
        tests/lib/finalize/finalize-pure.test.mjs tests/run-lint.sh
git commit -m "feat(hygiene): archive com recusa mecânica + guard de pureza estendido"
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
description: Use quando o projeto acumulou artefatos de processo obsoletos (planos entregues, specs órfãs, trackings pendurados) e o contexto do agente está poluído — "limpar o projeto", "context rot", "arquivar planos entregues", "/devflow cleanup". Diagnostica 3 categorias e arquiva com segurança só os planos com entrega observável.
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

    node "$CLAUDE_PLUGIN_ROOT/scripts/context-hygiene.mjs" scan

Se `error` não for `null`, **reporte o erro e pare** — não trate como "está limpo".

Se `artifacts` vier vazio, **sempre** informe junto a procedência de `scannedDirs`:
"nenhum artefato encontrado — procurei em `docs/superpowers/plans` (não existe) e
`.context/plans` (não existe)". Vazio-porque-limpo e vazio-porque-procurei-no-lugar-errado
não podem produzir a mesma frase; é o defeito que esta skill existe para combater.

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
- **C** specs órfãs

Para todo plano com `hasTracking: true`, declare: *"o tracking `.context/plans/<slug>.md`
referencia este path e ficará com link morto — a ADR-006 impede corrigir automaticamente."*
Consertar não dá; calar não pode.

Nunca prossiga sem `--fix` — sem a flag, o diagnóstico é o entregável.

## Step 4 — Consentimento e ação

Peça confirmação explícita listando exatamente o que será movido. Nunca execute sob
`autonomy: autonomous` (ADR-012). Só depois do "sim" do operador, emita `--confirmed`:

    node "$CLAUDE_PLUGIN_ROOT/scripts/context-hygiene.mjs" archive --confirmed <paths...>

O `--confirmed` é gate **mecânico**: sem ele o CLI recusa com exit 2. Emiti-lo sem ter
perguntado é um ato deliberado e rastreável no comando — não uma omissão.

O CLI recusa sozinho o que o git não protege — se ele recusar, **relate a recusa**, não
tente contornar.

## Step 5 — Relatório

Movidos · recusados com motivo · reportados sem ação.

Declare sempre estas duas coisas:
1. **A árvore ficou com renames estagiados** — `git mv` estagia mas não commita. Instrua a
   commitar (`chore(hygiene): arquiva planos entregues`) ou a reverter
   (`git reset && git checkout .`). Sob `autoFinish: true`, renames esquecidos no stage
   entram em commit alheio.
2. **A limitação**: `archive/` some da listagem, mas `grep`/`glob` ainda alcançam a pasta.

## Anti-patterns

| Pensamento | Realidade |
|---|---|
| "O checkbox está desmarcado, então não foi entregue" | Sinal morto. Verifique o código. |
| "Está parado há meses, deve estar entregue" | Plano abandonado também para. ADR-014 proíbe. |
| "Vou limpar o `.context/plans/` também" | ADR-006: território dotcontext. Só denuncie. |
| "O CLI recusou, vou mover na mão" | A recusa é a salvaguarda. Relate. |
| "Untracked está obsoleto mesmo, apago" | Untracked = git não protege = WIP possível. |
| "Vazio, então está tudo limpo" | Pode ser que eu tenha procurado no lugar errado. Leia `scannedDirs`. |
| "Passo `--confirmed` porque é óbvio que ele quer" | O gate existe porque o óbvio já errou antes. Pergunte. |
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

- [ ] **Step 3: Listar o comando no menu do `/devflow`**

Em `commands/devflow.md`, na tabela de comandos relacionados e no bloco de help, ao lado
de `devflow-doctor` e `devflow-routines`:

```
  /devflow:devflow-cleanup [--fix]    Audita context rot e arquiva planos entregues
```

Sem isso o comando existe mas é indescobrível por quem digita `/devflow help`.

- [ ] **Step 4: Entrada no CHANGELOG**

Em `CHANGELOG.md`, sob `## [Unreleased]` → `### Added`:

```markdown
- **Higiene de contexto** — `/devflow:devflow-cleanup` diagnostica artefatos de processo
  obsoletos em 3 categorias (planos ativos, trackings órfãos, specs órfãs) e arquiva
  planos com entrega observável. Só move arquivo que o git protege
  (`tracked && !dirty`, via `git mv`); `.context/` é território dotcontext e nunca é
  tocado (ADR-006). Diagnóstico por padrão; mover exige `--fix` + confirmação humana,
  com gate mecânico `--confirmed` no CLI.
```

- [ ] **Step 5: Verificar que a skill é bem-formada**

```bash
head -5 skills/context-hygiene/SKILL.md
bash tests/run-lint.sh
```
Esperado: frontmatter com `name` e `description`; lint exit 0 — e desta vez o lint
**de fato** varre os arquivos novos (o guard foi estendido na Task 2).

- [ ] **Step 6: Commit**

```bash
git add skills/context-hygiene/ commands/devflow-cleanup.md commands/devflow.md CHANGELOG.md
git commit -m "feat(hygiene): skill context-hygiene + /devflow:devflow-cleanup"
```

---

### ~~Task 4: Dogfooding~~ — movida para follow-up

**Removida deste plano na fase R**, por recomendação convergente do architect e do
security-auditor:

- Rodaria a ferramenta no seu momento **menos validado**, sobre ~40 arquivos reais, com
  28 arquivos sujos no working tree — exatamente o cenário que S1/S2 mostraram ser
  fail-open antes das correções.
- Poluiria o diff da feature: ~5 arquivos de código + ~35 renames, impedindo o revisor
  de separar a ferramenta da limpeza.
- Não tinha critério de conclusão nem ramo definido para "o operador recusa".

**Follow-up:** depois do merge, rodar `/devflow:devflow-cleanup --fix` neste repo como
primeiro uso real, em commit próprio (`chore(hygiene): arquiva planos entregues`).
A spec continua querendo dogfooding — só não no mesmo PR que entrega a ferramenta.

---

## Verificação final

Os sinais precisam ser **executados** (gravam o ledger) antes de o gate **observá-los**.
`verify-gate` sem argumento de sinais avalia lista vazia e passa — falso verde.

```bash
node scripts/lib/verify-run.mjs unit .
node scripts/lib/verify-run.mjs lint .
node scripts/lib/verify-gate.mjs . unit,lint
```

- [ ] `verify-run unit` → exit 0
- [ ] `verify-run lint` → exit 0 (com o guard de pureza já cobrindo os arquivos novos)
- [ ] `verify-gate . unit,lint` → "todos os requiredSignals observados verdes com digest atual"

A fase V **observa o ledger** — nunca afirma que passou (ADR-013).
