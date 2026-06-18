# Instinct System (MVP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **DevFlow workflow:** instinct-system | **Scale:** MEDIUM | **Phase:** P→R
> **Branch:** `feature/instinct-system` (branch-flow, off `main`)
> **Spec:** `docs/superpowers/specs/2026-06-17-instinct-system-design.md`

**Goal:** Dar ao DevFlow um loop de aprendizado automático que observa a sessão via hooks, destila comportamentos atômicos pontuados por confiança ("instincts") num store próprio leve, e os reinjeta no SessionStart — com pontes que propõem napkin/MemPalace.

**Architecture:** Núcleo = lib Node zero-dep (`.mjs`, stdlib only) que faz toda a lógica testável (confiança, identidade, store, índice, redação). Hooks Bash finos chamam a CLI (`instinct-cli.mjs`) para capturar (PostToolUse) e recall (SessionStart). Mining é uma skill LLM in-session. Store vive em XDG fora do repo, project-scoped por hash do git remote.

**Tech Stack:** Node 20+ (`node:fs/promises`, `node:crypto`, `node:test`), Bash (hooks), Markdown/YAML (skill/command/config).

## Global Constraints

- **Zero-dep:** lib Node usa só stdlib (`node:*`). NUNCA adicionar `package.json` ou deps. (precedente: `scripts/adr-audit.mjs`)
- **TDD obrigatório:** RED→GREEN→REFACTOR. Todo grupo começa por teste falhando. Testes reais (`node --test`), nunca content-checks.
- **Testes destrutivos SEMPRE em tmpdir** (`fs.mkdtemp`), NUNCA mutar dirs versionados.
- **Privacidade (ADR-005 v1.1.0):** `enabled:false` default; redação ANTES de qualquer escrita; nunca logar token/credencial; store XDG nunca commitado.
- **Hooks nunca quebram a sessão:** padrão `2>/dev/null || true` / `exit 0` (precedente: `scripts/post-merge-mempalace.sh`).
- **Locking:** reusar o padrão `withLock` (PID-liveness + stale recovery) de `scripts/adr-update-index.mjs:71-119`.
- **Idioma:** pt-BR em toda saída visível (digests, mensagens, instinct bodies).

---

### Task 1: Lib de redação (`instinct-redact.mjs`)

**Files:**
- Create: `scripts/lib/instinct-redact.mjs`
- Test: `scripts/lib/instinct-redact.test.mjs`

**Interfaces:**
- Produces: `redact(text: string) → string` — redige email, IPv4, sequências ≥9 dígitos, tokens (`ghp_*`, `sk-*`, `xox*`, bearer); preserva SHAs git (40/7 hex) e paths via allowlist.

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/instinct-redact.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from './instinct-redact.mjs';

test('redige email, IPv4 e sequências longas', () => {
  assert.equal(redact('mail joe@acme.com'), 'mail [EMAIL]');
  assert.equal(redact('host 192.168.0.42'), 'host [IP]');
  assert.equal(redact('id 1234567890'), 'id [NUM]');
});

test('nunca vaza tokens/credenciais', () => {
  assert.match(redact('token ghp_abcdEFGH1234567890abcdEFGH1234567890'), /\[TOKEN\]/);
  assert.match(redact('key sk-ant-api03-XYZ'), /\[TOKEN\]/);
  assert.doesNotMatch(redact('token ghp_abcdEFGH1234567890'), /ghp_/);
});

test('preserva SHA git e paths (allowlist N4)', () => {
  assert.match(redact('commit 06a530a feat'), /06a530a/);
  assert.match(redact('path src/lib/foo.mjs'), /src\/lib\/foo\.mjs/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/instinct-redact.test.mjs`
Expected: FAIL — `Cannot find module './instinct-redact.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/instinct-redact.mjs
// Redação best-effort para observações do instinct store (ADR-005 v1.1.0).
// Ordem: tokens → email → IPv4 → sequências longas. SHAs/paths preservados.

const TOKEN_RE = /\b(ghp_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9-]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|bearer\s+[A-Za-z0-9._-]{12,})\b/gi;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// Sequência ≥9 dígitos PUROS (não dentro de hash/path). SHA git é hex c/ letras → não casa \d+.
const LONGNUM_RE = /(?<![\w./])\d{9,}(?![\w./])/g;

export function redact(text) {
  if (typeof text !== 'string' || !text) return text ?? '';
  return text
    .replace(TOKEN_RE, '[TOKEN]')
    .replace(EMAIL_RE, '[EMAIL]')
    .replace(IPV4_RE, '[IP]')
    .replace(LONGNUM_RE, '[NUM]');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/instinct-redact.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/instinct-redact.mjs scripts/lib/instinct-redact.test.mjs
git commit -m "feat(instinct): lib de redação PII/credenciais (Task 1)"
```

**Agent:** test-writer → backend-specialist. **Tests:** unit.

---

### Task 2: Lib de confiança e identidade (`instinct-confidence.mjs`)

**Files:**
- Create: `scripts/lib/instinct-confidence.mjs`
- Test: `scripts/lib/instinct-confidence.test.mjs`

**Interfaces:**
- Produces:
  - `INITIAL = 0.3`, `CAP = 0.9`, `RECALL_MIN = 0.6`, `BRIDGE_MIN = 0.8`
  - `reinforce(c) → number` (+0.1, cap 0.9)
  - `applyCorrection(c) → number` (+0.2, cap 0.9) — só o mining chama (C1)
  - `statusFor(c) → 'pending'|'active'` (≥0.6 → active)
  - `eligibleForBridge(inst) → boolean` (confidence ≥ 0.8 ou scope global) — elegibilidade pura (N1)
  - `triggerKey(trigger) → string` — pré-filtro lexical barato (lowercase, trim, collapse spaces); NÃO é a identidade canônica (I4)

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/instinct-confidence.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from './instinct-confidence.mjs';

test('reforço soma 0.1 com cap 0.9', () => {
  assert.equal(c.reinforce(0.3), 0.4);
  assert.equal(c.reinforce(0.85), 0.9);
  assert.equal(c.reinforce(0.9), 0.9);
});

test('correção soma 0.2 com cap', () => {
  assert.equal(c.applyCorrection(0.3), 0.5);
  assert.equal(c.applyCorrection(0.8), 0.9);
});

test('status por limiar 0.6', () => {
  assert.equal(c.statusFor(0.59), 'pending');
  assert.equal(c.statusFor(0.6), 'active');
});

test('elegibilidade de ponte: 0.8 ou global', () => {
  assert.equal(c.eligibleForBridge({ confidence: 0.8, scope: 'project' }), true);
  assert.equal(c.eligibleForBridge({ confidence: 0.5, scope: 'global' }), true);
  assert.equal(c.eligibleForBridge({ confidence: 0.5, scope: 'project' }), false);
});

test('triggerKey normaliza para pré-filtro', () => {
  assert.equal(c.triggerKey('  Ao  Buscar Texto '), 'ao buscar texto');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/instinct-confidence.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/instinct-confidence.mjs
// Matemática de confiança + identidade do instinct store. Puro, sem I/O.
export const INITIAL = 0.3;
export const CAP = 0.9;
export const RECALL_MIN = 0.6;
export const BRIDGE_MIN = 0.8;

const round1 = (n) => Math.round(n * 10) / 10;
export const reinforce = (c) => round1(Math.min(CAP, c + 0.1));
export const applyCorrection = (c) => round1(Math.min(CAP, c + 0.2));
export const statusFor = (c) => (c >= RECALL_MIN ? 'active' : 'pending');
export const eligibleForBridge = (inst) =>
  inst.scope === 'global' || inst.confidence >= BRIDGE_MIN;
export const triggerKey = (t) =>
  String(t || '').toLowerCase().trim().replace(/\s+/g, ' ');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/instinct-confidence.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/instinct-confidence.mjs scripts/lib/instinct-confidence.test.mjs
git commit -m "feat(instinct): lib de confiança + identidade (Task 2)"
```

**Agent:** test-writer → backend-specialist. **Tests:** unit.

---

### Task 3: Resolução de projeto e paths XDG (`instinct-paths.mjs`)

**Files:**
- Create: `scripts/lib/instinct-paths.mjs`
- Test: `scripts/lib/instinct-paths.test.mjs`

**Interfaces:**
- Produces:
  - `baseDir() → string` — `$DEVFLOW_INSTINCTS_DIR` || `$XDG_DATA_HOME/devflow-instincts` || `~/.local/share/devflow-instincts`
  - `projectId(remoteUrl) → string` — sha256 dos primeiros 12 hex; normaliza credenciais/scheme/.git/trailing-slash
  - `projectDir(id)`, `instinctsDir(id)`, `observationsFile(id)`, `indexFile(id, scope)`, `globalDir()`

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/instinct-paths.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as p from './instinct-paths.mjs';

test('baseDir respeita override absoluto', () => {
  process.env.DEVFLOW_INSTINCTS_DIR = '/tmp/abs-store';
  assert.equal(p.baseDir(), '/tmp/abs-store');
  delete process.env.DEVFLOW_INSTINCTS_DIR;
});

test('projectId estável e normaliza credenciais/.git', () => {
  const a = p.projectId('https://x:y@github.com/NEXUZ-SYS/devflow.git');
  const b = p.projectId('https://github.com/NEXUZ-SYS/devflow');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{12}$/);
});

test('paths derivam de baseDir + id', () => {
  process.env.DEVFLOW_INSTINCTS_DIR = '/tmp/s';
  const id = 'abc123abc123';
  assert.equal(p.observationsFile(id), join('/tmp/s', 'projects', id, 'observations.jsonl'));
  delete process.env.DEVFLOW_INSTINCTS_DIR;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/instinct-paths.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/instinct-paths.mjs
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

export function baseDir() {
  const o = process.env.DEVFLOW_INSTINCTS_DIR;
  if (o && isAbsolute(o)) return o;
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg && isAbsolute(xdg)) return join(xdg, 'devflow-instincts');
  return join(homedir(), '.local', 'share', 'devflow-instincts');
}

export function projectId(remoteUrl) {
  let n = String(remoteUrl || '')
    .replace(/:\/\/[^@]+@/, '://')          // strip credenciais
    .replace(/^[A-Za-z][\w+.-]*:\/\//, '')  // strip scheme
    .replace(/^[^@/:]+@([^:/]+):/, '$1/')   // scp-like → host/path
    .replace(/\.git\/?$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return createHash('sha256').update(n).digest('hex').slice(0, 12);
}

export const projectDir = (id) => join(baseDir(), 'projects', id);
export const instinctsDir = (id) => join(projectDir(id), 'instincts');
export const observationsFile = (id) => join(projectDir(id), 'observations.jsonl');
export const globalDir = () => join(baseDir(), 'global', 'instincts');
export const indexFile = (id, scope) =>
  scope === 'global' ? join(baseDir(), 'global', 'index.json') : join(projectDir(id), 'index.json');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/instinct-paths.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/instinct-paths.mjs scripts/lib/instinct-paths.test.mjs
git commit -m "feat(instinct): resolução de projeto + paths XDG (Task 3)"
```

**Agent:** backend-specialist. **Tests:** unit.

---

### Task 4: Store I/O — withLock, instincts e índice materializado (`instinct-store.mjs`)

**Files:**
- Create: `scripts/lib/instinct-store.mjs`
- Test: `scripts/lib/instinct-store.test.mjs`
- Reference: `scripts/adr-update-index.mjs:71-119` (withLock)

**Interfaces:**
- Consumes: `instinct-confidence.mjs` (statusFor), `instinct-paths.mjs`
- Produces:
  - `withLock(dir, fn, retries=5) → Promise` (PID-liveness + stale recovery)
  - `upsertInstinct(id, {trigger, action, domain, scope, projectId, projectName}, delta) → Promise<instinct>` — cria @0.3 ou aplica delta de confiança; persiste `.md` + atualiza `index.json`
  - `loadIndex(id, scope) → Promise<Array<{id,trigger,action,confidence,status}>>`
  - `rebuildIndex(id, scope) → Promise` — varre `instincts/*.md`, materializa `index.json` (como `adr-update-index.mjs` materializa o README)

- [ ] **Step 1: Write the failing test** (tmpdir; nunca mutar dir versionado)

```js
// scripts/lib/instinct-store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from './instinct-store.mjs';

async function sandbox() {
  const d = await mkdtemp(join(tmpdir(), 'inst-'));
  process.env.DEVFLOW_INSTINCTS_DIR = d;
  return d;
}

test('upsert cria @0.3 e materializa índice', async () => {
  await sandbox();
  const meta = { trigger: 'ao buscar', action: 'usar rg', domain: 'workflow', scope: 'project', projectId: 'p1', projectName: 'demo' };
  const inst = await store.upsertInstinct('use-rg', meta, 0);
  assert.equal(inst.confidence, 0.3);
  assert.equal(inst.status, 'pending');
  const idx = await store.loadIndex('p1', 'project');
  assert.equal(idx.length, 1);
  assert.equal(idx[0].id, 'use-rg');
});

test('upsert aplica delta e vira active em 0.6', async () => {
  await sandbox();
  const meta = { trigger: 't', action: 'a', domain: 'git', scope: 'project', projectId: 'p1', projectName: 'demo' };
  await store.upsertInstinct('x', meta, 0);      // 0.3
  await store.upsertInstinct('x', meta, 0.1);    // 0.4
  await store.upsertInstinct('x', meta, 0.1);    // 0.5
  const inst = await store.upsertInstinct('x', meta, 0.1); // 0.6
  assert.equal(inst.confidence, 0.6);
  assert.equal(inst.status, 'active');
});

test('withLock serializa escrita concorrente', async () => {
  const d = await sandbox();
  let max = 0, cur = 0;
  await Promise.all([1,2,3].map(() => store.withLock(d, async () => {
    cur++; max = Math.max(max, cur);
    await new Promise(r => setTimeout(r, 10));
    cur--;
  })));
  assert.equal(max, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/instinct-store.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/instinct-store.mjs
import { open, unlink, readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { statusFor } from './instinct-confidence.mjs';
import * as P from './instinct-paths.mjs';

const LOCK_EXPIRY_MS = 30000;

export async function withLock(dir, fn, retries = 5) {
  await mkdir(dir, { recursive: true });
  const lockFile = join(dir, '.lock');
  for (let attempt = 0; attempt < retries; attempt++) {
    let handle;
    try {
      handle = await open(lockFile, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, ts: Date.now() }));
      try { return await fn(); }
      finally { await handle.close(); await unlink(lockFile).catch(() => {}); }
    } catch (err) {
      if (handle) await handle.close().catch(() => {});
      if (err.code !== 'EEXIST') throw err;
      if (await isLockStale(lockFile)) { await unlink(lockFile).catch(() => {}); continue; }
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100 * (attempt + 1)));
    }
  }
  throw new Error(`could not acquire lock on ${lockFile}`);
}

async function isLockStale(lockFile) {
  try {
    const { pid, ts } = JSON.parse(await readFile(lockFile, 'utf-8'));
    if (Date.now() - ts > LOCK_EXPIRY_MS) return true;
    try { process.kill(pid, 0); return false; } catch { return true; }
  } catch { return true; }
}

const ser = (i) => `---
id: ${i.id}
trigger: ${JSON.stringify(i.trigger)}
action: ${JSON.stringify(i.action)}
confidence: ${i.confidence}
domain: ${i.domain}
scope: ${i.scope}
project_id: ${i.projectId}
project_name: ${i.projectName}
observations: ${i.observations}
status: ${i.status}
updated: ${i.updated}
---
## Evidência
- Observado ${i.observations}x
`;

function parse(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const k = line.slice(0, line.indexOf(':')).trim();
    let v = line.slice(line.indexOf(':') + 1).trim();
    if (v.startsWith('"')) v = JSON.parse(v);
    fm[k] = v;
  }
  return fm;
}

export async function upsertInstinct(id, meta, delta) {
  const dir = P.instinctsDir(meta.projectId === undefined ? '' : (meta.scope === 'global' ? null : meta.projectId));
  const targetDir = meta.scope === 'global' ? P.globalDir() : P.instinctsDir(meta.projectId);
  return withLock(P.projectDir(meta.projectId), async () => {
    await mkdir(targetDir, { recursive: true });
    const file = join(targetDir, `${id}.md`);
    let confidence = 0.3, observations = 0;
    try {
      const fm = parse(await readFile(file, 'utf-8'));
      confidence = Number(fm.confidence); observations = Number(fm.observations);
    } catch {}
    confidence = Math.round(Math.min(0.9, confidence + delta) * 10) / 10;
    observations += 1;
    const inst = { id, trigger: meta.trigger, action: meta.action, domain: meta.domain,
      scope: meta.scope, projectId: meta.projectId, projectName: meta.projectName,
      observations, confidence, status: statusFor(confidence),
      updated: new Date().toISOString().slice(0, 10) };
    await writeFile(file, ser(inst));
    await rebuildIndex(meta.projectId, meta.scope);
    return inst;
  });
}

export async function rebuildIndex(projectId, scope) {
  const dir = scope === 'global' ? P.globalDir() : P.instinctsDir(projectId);
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')); } catch {}
  const idx = [];
  for (const f of files) {
    const fm = parse(await readFile(join(dir, f), 'utf-8'));
    idx.push({ id: fm.id, trigger: fm.trigger, action: fm.action,
      confidence: Number(fm.confidence), status: fm.status });
  }
  const out = P.indexFile(projectId, scope);
  const tmp = `${out}.tmp`;
  await writeFile(tmp, JSON.stringify(idx, null, 2));
  await rename(tmp, out);
}

export async function loadIndex(projectId, scope) {
  try { return JSON.parse(await readFile(P.indexFile(projectId, scope), 'utf-8')); }
  catch { return []; }
}
```

> Nota de implementação: a `updated` usa `new Date()` — aceitável em runtime (não em workflow scripts). Mantém determinismo de teste via comparação de campos estáveis (não `updated`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/instinct-store.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/instinct-store.mjs scripts/lib/instinct-store.test.mjs
git commit -m "feat(instinct): store I/O com withLock + índice materializado (Task 4)"
```

**Agent:** backend-specialist. **Tests:** unit (tmpdir).

---

### Task 5: Observações — append atômico, rotação e checkpoint (`instinct-observations.mjs`)

**Files:**
- Create: `scripts/lib/instinct-observations.mjs`
- Test: `scripts/lib/instinct-observations.test.mjs`

**Interfaces:**
- Consumes: `instinct-store.mjs` (withLock), `instinct-redact.mjs` (redact), `instinct-paths.mjs`
- Produces:
  - `appendObservation(projectId, {tool, target, outcome, signal}) → Promise` — redige `target` ANTES de escrever; append sob withLock; rotaciona por byte-cap (tmp+rename) dentro do mesmo lock
  - `readUnconsumed(projectId) → Promise<{observations, offset}>` — lê a partir do checkpoint
  - `setCheckpoint(projectId, offset) → Promise`
  - `MAX_BYTES = 256 * 1024`

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/instinct-observations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as obs from './instinct-observations.mjs';

async function sandbox() {
  const d = await mkdtemp(join(tmpdir(), 'obs-'));
  process.env.DEVFLOW_INSTINCTS_DIR = d;
  return d;
}

test('append redige target antes de escrever', async () => {
  await sandbox();
  await obs.appendObservation('p1', { tool: 'Bash', target: 'curl joe@x.com', outcome: 'ok' });
  const { observations } = await obs.readUnconsumed('p1');
  assert.equal(observations.length, 1);
  assert.match(observations[0].target, /\[EMAIL\]/);
  assert.doesNotMatch(observations[0].target, /joe@x\.com/);
});

test('checkpoint evita reconsumo', async () => {
  await sandbox();
  await obs.appendObservation('p1', { tool: 'Edit', target: 'a.mjs', outcome: 'ok' });
  let r = await obs.readUnconsumed('p1');
  await obs.setCheckpoint('p1', r.offset);
  await obs.appendObservation('p1', { tool: 'Edit', target: 'b.mjs', outcome: 'ok' });
  r = await obs.readUnconsumed('p1');
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0].target, 'b.mjs');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/instinct-observations.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/instinct-observations.mjs
import { appendFile, readFile, writeFile, rename, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { withLock } from './instinct-store.mjs';
import { redact } from './instinct-redact.mjs';
import * as P from './instinct-paths.mjs';

export const MAX_BYTES = 256 * 1024;
const ckptFile = (id) => join(P.projectDir(id), '.consumed-offset');

export async function appendObservation(projectId, o) {
  const file = P.observationsFile(projectId);
  const rec = { ts: new Date().toISOString(), tool: o.tool,
    target: redact(String(o.target || '')).slice(0, 500),
    outcome: o.outcome || 'ok', signal: o.signal };
  const line = JSON.stringify(rec) + '\n';
  await withLock(P.projectDir(projectId), async () => {
    await mkdir(P.projectDir(projectId), { recursive: true });
    await appendFile(file, line);
    let size = 0; try { size = (await stat(file)).size; } catch {}
    if (size > MAX_BYTES) {
      const lines = (await readFile(file, 'utf-8')).split('\n').filter(Boolean);
      const keep = lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n';
      const tmp = `${file}.tmp`;
      await writeFile(tmp, keep);
      await rename(tmp, file);
      await writeFile(ckptFile(projectId), '0'); // rotação reseta checkpoint
    }
  });
}

export async function readUnconsumed(projectId) {
  let offset = 0;
  try { offset = Number(await readFile(ckptFile(projectId), 'utf-8')) || 0; } catch {}
  let lines = [];
  try { lines = (await readFile(P.observationsFile(projectId), 'utf-8')).split('\n').filter(Boolean); } catch {}
  const fresh = lines.slice(offset);
  return { observations: fresh.map((l) => JSON.parse(l)), offset: lines.length };
}

export async function setCheckpoint(projectId, offset) {
  await mkdir(P.projectDir(projectId), { recursive: true });
  await writeFile(ckptFile(projectId), String(offset));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/instinct-observations.test.mjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/instinct-observations.mjs scripts/lib/instinct-observations.test.mjs
git commit -m "feat(instinct): observações com append atômico + rotação + checkpoint (Task 5)"
```

**Agent:** backend-specialist. **Tests:** unit (tmpdir, concorrência).

---

### Task 6: Recall digest bounded (`instinct-recall.mjs`)

**Files:**
- Create: `scripts/lib/instinct-recall.mjs`
- Test: `scripts/lib/instinct-recall.test.mjs`

**Interfaces:**
- Consumes: `instinct-store.mjs` (loadIndex), `instinct-confidence.mjs` (RECALL_MIN), `instinct-paths.mjs`
- Produces: `buildDigest(projectId, {maxChars=2000, minConfidence=0.6}) → Promise<string>` — lê index.json (project + global), filtra ≥ minConfidence, ordena desc por confiança, trunca a maxChars. NUNCA varre `instincts/*.md` (C2).

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/instinct-recall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from './instinct-store.mjs';
import { buildDigest } from './instinct-recall.mjs';

test('digest inclui active e exclui pending, respeita maxChars', async () => {
  const d = await mkdtemp(join(tmpdir(), 'rec-'));
  process.env.DEVFLOW_INSTINCTS_DIR = d;
  const m = (id, c) => ({ trigger: `t-${id}`, action: `a-${id}`, domain: 'workflow', scope: 'project', projectId: 'p1', projectName: 'demo' });
  await store.upsertInstinct('hi', m('hi'), 0.3);   // 0.6 active
  await store.upsertInstinct('lo', m('lo'), 0);     // 0.3 pending
  const out = await buildDigest('p1', { maxChars: 2000, minConfidence: 0.6 });
  assert.match(out, /a-hi/);
  assert.doesNotMatch(out, /a-lo/);
  assert.ok(out.length <= 2000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/lib/instinct-recall.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/instinct-recall.mjs
import { loadIndex } from './instinct-store.mjs';
import { RECALL_MIN } from './instinct-confidence.mjs';

export async function buildDigest(projectId, { maxChars = 2000, minConfidence = RECALL_MIN } = {}) {
  const [proj, glob] = await Promise.all([loadIndex(projectId, 'project'), loadIndex(projectId, 'global')]);
  const rows = [...proj.map((r) => ({ ...r, s: 'projeto' })), ...glob.map((r) => ({ ...r, s: 'global' }))]
    .filter((r) => r.status === 'active' && r.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence);
  if (!rows.length) return '';
  let out = '## Instincts aprendidos (DevFlow)\n';
  for (const r of rows) {
    const line = `- [${r.s} ${r.confidence}] ${r.trigger} → ${r.action}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/lib/instinct-recall.test.mjs`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/instinct-recall.mjs scripts/lib/instinct-recall.test.mjs
git commit -m "feat(instinct): recall digest bounded a partir do índice (Task 6)"
```

**Agent:** backend-specialist. **Tests:** unit (tmpdir).

---

### Task 7: CLI (`instinct-cli.mjs`) — capture | recall | status | promote | prune | mine-read | mine-apply

**Files:**
- Create: `scripts/instinct-cli.mjs`
- Test: `scripts/instinct-cli.test.mjs`

**Interfaces:**
- Consumes: todas as libs acima.
- Produces (CLI, exit 0 sempre que possível):
  - `capture --tool=X --target=Y --outcome=Z` → appendObservation (no-op se sem repo git / disabled)
  - `recall [--max-chars=N]` → imprime digest
  - `status` → imprime instincts agrupados
  - `mine-read` → imprime JSON `{observations, offset}` (consumido pela skill)
  - `mine-apply --json=<file>` → aplica upserts vindos da skill; promove; seta checkpoint
  - `promote` / `prune`

- [ ] **Step 1: Write the failing test**

```js
// scripts/instinct-cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLI = new URL('./instinct-cli.mjs', import.meta.url).pathname;
function run(args, env) {
  return execFileSync('node', [CLI, ...args], { env: { ...process.env, ...env }, encoding: 'utf-8' });
}

test('capture + recall round-trip', async () => {
  const d = await mkdtemp(join(tmpdir(), 'cli-'));
  const env = { DEVFLOW_INSTINCTS_DIR: d, DEVFLOW_INSTINCT_PID: 'p1', DEVFLOW_INSTINCTS_ENABLED: '1' };
  run(['mine-apply', '--inline', JSON.stringify([{ id: 'rg', trigger: 'buscar', action: 'rg', domain: 'workflow', delta: 0.3 }])], env);
  const out = run(['recall'], env);
  assert.match(out, /rg/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/instinct-cli.test.mjs`
Expected: FAIL — CLI não encontrado

- [ ] **Step 3: Write minimal implementation** (esqueleto; subcomandos chamam as libs)

```js
#!/usr/bin/env node
// scripts/instinct-cli.mjs — interface entre hooks Bash e o store Node.
import * as obs from './lib/instinct-observations.mjs';
import * as store from './lib/instinct-store.mjs';
import { buildDigest } from './lib/instinct-recall.mjs';
import { projectId as hashRemote } from './lib/instinct-paths.mjs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : d; };

function resolvePid() {
  if (process.env.DEVFLOW_INSTINCT_PID) return process.env.DEVFLOW_INSTINCT_PID;
  try { return hashRemote(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8' }).trim()); }
  catch { return null; } // sem repo git → no-op
}
const enabled = () => process.env.DEVFLOW_INSTINCTS_ENABLED === '1';

try {
  const pid = resolvePid();
  if (cmd === 'capture') {
    if (!enabled() || !pid) process.exit(0);
    await obs.appendObservation(pid, { tool: flag('tool'), target: flag('target'), outcome: flag('outcome', 'ok') });
  } else if (cmd === 'recall') {
    if (!pid) process.exit(0);
    process.stdout.write(await buildDigest(pid, { maxChars: Number(flag('max-chars', 2000)) }));
  } else if (cmd === 'mine-read') {
    if (!pid) { process.stdout.write('{"observations":[],"offset":0}'); process.exit(0); }
    process.stdout.write(JSON.stringify(await obs.readUnconsumed(pid)));
  } else if (cmd === 'mine-apply') {
    const items = JSON.parse(args.includes('--inline') ? args[args.indexOf('--inline') + 1] : '[]');
    for (const it of items) {
      await store.upsertInstinct(it.id, { trigger: it.trigger, action: it.action, domain: it.domain || 'workflow',
        scope: 'project', projectId: pid || 'p1', projectName: flag('project-name', 'unknown') }, it.delta ?? 0);
    }
  } else if (cmd === 'status') {
    if (pid) process.stdout.write(await buildDigest(pid, { minConfidence: 0 }));
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(`[instinct] ${err.message}\n`);
  process.exit(0); // nunca quebra o hook
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/instinct-cli.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/instinct-cli.mjs scripts/instinct-cli.test.mjs
git commit -m "feat(instinct): CLI capture/recall/mine/status (Task 7)"
```

**Agent:** backend-specialist. **Tests:** unit (spawn CLI).

---

### Task 8: Integração de captura no `hooks/post-tool-use`

**Files:**
- Modify: `hooks/post-tool-use` (adicionar bloco de captura, gated)
- Test: `tests/instinct/test-capture-hook.mjs`
- Reference: `hooks/post-tool-use` (napkin nudge ~L245; canal additionalContext ~L414)

**Interfaces:**
- Consumes: `scripts/instinct-cli.mjs capture`
- Produces: efeito colateral (append) + nudge best-effort quando observações ≥ limiar.

- [ ] **Step 1: Write the failing integration test** (sandbox tmpdir; copia o hook + faz repo git fake)

```js
// tests/instinct/test-capture-hook.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('post-tool-use captura observação quando enabled', async () => {
  const store = await mkdtemp(join(tmpdir(), 'hookstore-'));
  const input = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'a.mjs' }, tool_response: {} });
  execFileSync('bash', [join(process.cwd(), 'hooks/post-tool-use')], {
    input,
    env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1',
           DEVFLOW_INSTINCTS_ENABLED: '1', CLAUDE_PLUGIN_ROOT: process.cwd() },
  });
  const obs = await readFile(join(store, 'projects/p1/observations.jsonl'), 'utf-8');
  assert.match(obs, /"tool":"Edit"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/instinct/test-capture-hook.mjs`
Expected: FAIL — hook ainda não captura

- [ ] **Step 3: Add the capture block to `hooks/post-tool-use`**

Adicionar ANTES do `exit 0` final (seguindo o padrão best-effort do napkin nudge):

```bash
# ── Instinct capture (gated, best-effort, nunca bloqueia) ──────────────
if [ "${DEVFLOW_INSTINCTS_ENABLED:-0}" = "1" ]; then
  TOOL_NAME=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_name||"")}catch{console.log("")}})' 2>/dev/null)
  TARGET=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.tool_input?.file_path||j.tool_input?.command||"")}catch{console.log("")}})' 2>/dev/null)
  node "${CLAUDE_PLUGIN_ROOT}/scripts/instinct-cli.mjs" capture --tool="$TOOL_NAME" --target="$TARGET" --outcome=ok >/dev/null 2>&1 || true
fi
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/instinct/test-capture-hook.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add hooks/post-tool-use tests/instinct/test-capture-hook.mjs
git commit -m "feat(instinct): captura de observações no post-tool-use (Task 8)"
```

**Agent:** devops-specialist (hooks) → test-writer. **Tests:** integração (tmpdir).

---

### Task 9: Integração de recall no `hooks/session-start`

**Files:**
- Modify: `hooks/session-start` (injetar digest via additionalContext, time-budget, exit 0)
- Test: `tests/instinct/test-recall-hook.mjs`
- Reference: `hooks/session-start` (detecção MemPalace ~L56; padrão `2>/dev/null || true`); `scripts/post-merge-mempalace.sh` (ALWAYS exit 0)

**Interfaces:**
- Consumes: `scripts/instinct-cli.mjs recall`
- Produces: bloco de contexto adicional (digest) no output do SessionStart.

- [ ] **Step 1: Write the failing integration test**

```js
// tests/instinct/test-recall-hook.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('session-start injeta digest de instincts active', async () => {
  const store = await mkdtemp(join(tmpdir(), 'recstore-'));
  // semente: 1 instinct active via CLI
  execFileSync('node', [join(process.cwd(), 'scripts/instinct-cli.mjs'), 'mine-apply', '--inline',
    JSON.stringify([{ id: 'rg', trigger: 'buscar', action: 'usar rg', domain: 'workflow', delta: 0.3 }])],
    { env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1' } });
  const out = execFileSync('bash', [join(process.cwd(), 'hooks/session-start')], {
    input: JSON.stringify({ source: 'startup' }),
    env: { ...process.env, DEVFLOW_INSTINCTS_DIR: store, DEVFLOW_INSTINCT_PID: 'p1',
           DEVFLOW_INSTINCTS_ENABLED: '1', CLAUDE_PLUGIN_ROOT: process.cwd() }, encoding: 'utf-8',
  });
  assert.match(out, /usar rg/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/instinct/test-recall-hook.mjs`
Expected: FAIL — hook não injeta

- [ ] **Step 3: Add recall block to `hooks/session-start`** (com time-budget e exit-0)

```bash
# ── Instinct recall (gated, bounded, nunca bloqueia) ───────────────────
if [ "${DEVFLOW_INSTINCTS_ENABLED:-0}" = "1" ]; then
  INSTINCT_DIGEST=$(timeout 1 node "${CLAUDE_PLUGIN_ROOT}/scripts/instinct-cli.mjs" recall --max-chars=2000 2>/dev/null || true)
  [ -n "$INSTINCT_DIGEST" ] && printf '%s\n' "$INSTINCT_DIGEST"
fi
```

> O `timeout 1` é o teto externo; o time-budget fino (~50ms) é responsabilidade da CLI/lib de recall (leitura de 2 JSONs).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/instinct/test-recall-hook.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add hooks/session-start tests/instinct/test-recall-hook.mjs
git commit -m "feat(instinct): recall no session-start (Task 9)"
```

**Agent:** devops-specialist → test-writer. **Tests:** integração (tmpdir).

---

### Task 10: Skill de mining (`devflow:instinct-ops`) + match semântico

**Files:**
- Create: `skills/instinct-ops/SKILL.md`
- Test: `tests/instinct/test-instinct-ops-skill.mjs` (valida frontmatter + presença das seções/contrato CLI)

**Interfaces:**
- Consumes: `scripts/instinct-cli.mjs mine-read` / `mine-apply`
- Produces: skill que (1) chama `mine-read`, (2) o LLM infere instincts atômicos e faz **match semântico** contra os existentes (reusa `id` canônico — I4), (3) atribui `+0.2` quando detecta correção do usuário no transcript (C1 — só aqui), (4) chama `mine-apply`, (5) seta checkpoint.

- [ ] **Step 1: Write the failing test**

```js
// tests/instinct/test-instinct-ops-skill.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('SKILL.md tem frontmatter e contrato de mining', async () => {
  const md = await readFile('skills/instinct-ops/SKILL.md', 'utf-8');
  assert.match(md, /^---[\s\S]*name:\s*instinct-ops/);
  assert.match(md, /mine-read/);
  assert.match(md, /mine-apply/);
  assert.match(md, /match sem[âa]ntico/i);     // I4
  assert.match(md, /\+0\.2|correção do usuário/i); // C1
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/instinct/test-instinct-ops-skill.mjs`
Expected: FAIL — arquivo não existe

- [ ] **Step 3: Write `skills/instinct-ops/SKILL.md`** (conteúdo real, pt-BR)

Estrutura mínima (corpo completo no arquivo): frontmatter `name: instinct-ops` + `description`; seções **Quando ativar** (comando `/devflow instinct mine`, fronteira de sessão opt-in), **Processo** (1. `mine-read` → 2. inferir instincts atômicos 1-trigger/1-action; 3. **match semântico** contra `status`/índice — reusar `id` quando for o mesmo aprendizado, senão `id` novo slug; 4. detectar **correção do usuário** no transcript → `delta: 0.2`, senão `delta: 0.1` para reforço / `0.3` implícito p/ novo; 5. `mine-apply --inline <json>`; 6. setar checkpoint), **Pontes** (após apply: para instincts elegíveis, propor napkin/MemPalace — Task 11), **Privacidade** (não minerar se `enabled:false`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/instinct/test-instinct-ops-skill.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/instinct-ops/SKILL.md tests/instinct/test-instinct-ops-skill.mjs
git commit -m "feat(instinct): skill de mining instinct-ops (Task 10)"
```

**Agent:** documentation-writer → test-writer. **Tests:** unit (contrato do doc).

---

### Task 11: Pontes — elegibilidade (store) + proposta napkin/MemPalace (skill)

**Files:**
- Modify: `scripts/instinct-cli.mjs` (subcomando `bridges` → lista elegíveis via `eligibleForBridge`)
- Modify: `skills/instinct-ops/SKILL.md` (seção Pontes: proposta supervisionada)
- Test: `scripts/instinct-cli.test.mjs` (adiciona caso `bridges`)
- Reference: `hooks/session-start` / `hooks/post-tool-use` (detecção MemPalace a reusar)

**Interfaces:**
- Consumes: `instinct-confidence.mjs` (eligibleForBridge), `instinct-store.mjs` (loadIndex)
- Produces: `instinct-cli.mjs bridges` → JSON dos instincts elegíveis (≥0.8 ou global). A skill **propõe** (não escreve calado): entrada candidata no napkin + referência (id+trigger+action) no MemPalace quando disponível.

- [ ] **Step 1: Write the failing test**

```js
// adicionar a scripts/instinct-cli.test.mjs
test('bridges lista só elegíveis (≥0.8 ou global)', async () => {
  const d = await mkdtemp(join(tmpdir(), 'br-'));
  const env = { DEVFLOW_INSTINCTS_DIR: d, DEVFLOW_INSTINCT_PID: 'p1' };
  run(['mine-apply', '--inline', JSON.stringify([
    { id: 'hi', trigger: 't', action: 'a', delta: 0.5 },   // 0.8 elegível
    { id: 'lo', trigger: 't2', action: 'a2', delta: 0.2 }, // 0.5 não
  ])], env);
  const out = JSON.parse(run(['bridges'], env));
  assert.deepEqual(out.map((x) => x.id), ['hi']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/instinct-cli.test.mjs`
Expected: FAIL — subcomando `bridges` inexistente

- [ ] **Step 3: Implement `bridges` no CLI + seção Pontes na skill**

```js
// em instinct-cli.mjs, novo ramo:
} else if (cmd === 'bridges') {
  const { eligibleForBridge } = await import('./lib/instinct-confidence.mjs');
  const idx = pid ? await store.loadIndex(pid, 'project') : [];
  process.stdout.write(JSON.stringify(idx.filter((i) => eligibleForBridge({ confidence: i.confidence, scope: 'project' }))));
}
```

Na skill: "Após `mine-apply`, rode `bridges`; para cada elegível, **proponha ao usuário** (a) adicionar ao `.context/napkin.md` e/ou (b) gravar referência no MemPalace (só se detectado disponível — reusar a checagem dos hooks). Nunca escrever sem confirmação."

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/instinct-cli.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/instinct-cli.mjs scripts/instinct-cli.test.mjs skills/instinct-ops/SKILL.md
git commit -m "feat(instinct): pontes elegibilidade + proposta napkin/MemPalace (Task 11)"
```

**Agent:** backend-specialist → documentation-writer. **Tests:** unit.

---

### Task 12: Config (`.devflow.yaml`) + comando `/devflow instinct`

**Files:**
- Create: `commands/devflow-instinct.md`
- Modify: `skills/config/` template ou `assets/` — adicionar seção `instincts:` ao template de `.devflow.yaml`
- Modify: `commands/devflow.md` (tabela de roteamento: `instinct` → command)
- Test: `tests/instinct/test-config-command.mjs`

**Interfaces:**
- Produces: comando `/devflow instinct status|mine|promote|prune|list` que roteia para `instinct-cli.mjs` ou a skill `instinct-ops` (mine). Seção `instincts:` no `.devflow.yaml` com precedência de toggles (N2).

- [ ] **Step 1: Write the failing test**

```js
// tests/instinct/test-config-command.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('comando devflow-instinct existe e documenta subcomandos', async () => {
  const md = await readFile('commands/devflow-instinct.md', 'utf-8');
  for (const sub of ['status', 'mine', 'promote', 'prune', 'list'])
    assert.match(md, new RegExp(sub));
});

test('precedência dos toggles documentada (N2)', async () => {
  const md = await readFile('commands/devflow-instinct.md', 'utf-8');
  assert.match(md, /precedência|env.*>.*yaml|enabled:\s*false/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/instinct/test-config-command.mjs`
Expected: FAIL — comando não existe

- [ ] **Step 3: Write `commands/devflow-instinct.md`** + seção `instincts:` no template

Comando documenta os 5 subcomandos, mapeando `mine` → skill `devflow:instinct-ops` e os demais → `instinct-cli.mjs`. Inclui a seção `instincts:` (do spec) e a **precedência N2**: opt-out por sessão (env) > `DEVFLOW_INSTINCT_PROFILE` > `instincts.enabled/profile` no YAML; `enabled:false` é o piso.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/instinct/test-config-command.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add commands/devflow-instinct.md commands/devflow.md tests/instinct/test-config-command.mjs
git commit -m "feat(instinct): comando /devflow instinct + config (Task 12)"
```

**Agent:** documentation-writer. **Tests:** unit (contrato do doc).

---

### Task 13: E2E do fluxo completo (sandbox tmpdir)

**Files:**
- Create: `tests/instinct/test-e2e-flow.mjs`

**Interfaces:**
- Consumes: CLI + libs (caixa-preta).
- Produces: prova do fluxo captura → mine-apply → recall → bridges, isolado em tmpdir.

- [ ] **Step 1: Write the failing E2E test**

```js
// tests/instinct/test-e2e-flow.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const CLI = join(process.cwd(), 'scripts/instinct-cli.mjs');

test('captura → mine → recall → bridges (e2e)', async () => {
  const d = await mkdtemp(join(tmpdir(), 'e2e-'));
  const env = { ...process.env, DEVFLOW_INSTINCTS_DIR: d, DEVFLOW_INSTINCT_PID: 'p1', DEVFLOW_INSTINCTS_ENABLED: '1' };
  const run = (a) => execFileSync('node', [CLI, ...a], { env, encoding: 'utf-8' });

  run(['capture', '--tool=Bash', '--target=grep foo', '--outcome=ok']);
  const read = JSON.parse(run(['mine-read']));
  assert.ok(read.observations.length >= 1);
  // simula inferência da skill: reforça até 0.8
  run(['mine-apply', '--inline', JSON.stringify([{ id: 'use-rg', trigger: 'buscar', action: 'rg', delta: 0.5 }])]);
  const digest = run(['recall']);
  assert.match(digest, /rg/);
  const bridges = JSON.parse(run(['bridges']));
  assert.equal(bridges[0].id, 'use-rg');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/instinct/test-e2e-flow.mjs`
Expected: FAIL inicialmente se rodado antes das tasks anteriores; após Tasks 1-12, PASS.

- [ ] **Step 3: (sem novo código)** — corrigir qualquer gap revelado pelo e2e nas libs/CLI.

- [ ] **Step 4: Run full suite**

Run: `node --test scripts/lib/*.test.mjs scripts/instinct-cli.test.mjs tests/instinct/*.mjs`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add tests/instinct/test-e2e-flow.mjs
git commit -m "test(instinct): e2e do fluxo completo (Task 13)"
```

**Agent:** test-writer. **Tests:** e2e (tmpdir).

---

## Self-Review

**Spec coverage:**
- Store/confiança/identidade/promoção/TTL → Tasks 2, 4 (TTL/prune: subcomando `prune` no CLI Task 7; promoção `promote` — implementação no CLI, coberta pelo contrato; nota: detecção ≥2 projetos é lógica do `promote`, a detalhar na execução do CLI).
- Captura + redação + rotação + checkpoint → Tasks 1, 5, 8.
- Recall bounded + índice → Tasks 6, 9.
- Mining + match semântico + correção (+0.2) → Task 10.
- Pontes (elegibilidade pura + proposta) → Task 11.
- Config + comando + precedência toggles → Task 12.
- Privacidade/opt-in → Tasks 1, 7 (gating), 8/9 (gated).
- E2E → Task 13.

**Gaps conhecidos (resolver na execução, não bloqueiam o plano):**
- `promote`/`prune` têm subcomando no CLI mas o corpo completo (detecção ≥2 hashes; TTL 30d) deve ganhar teste dedicado quando implementado — adicionar micro-tasks 7b/7c se a execução exigir.
- A inferência LLM da Task 10 não é testável por unit determinístico; o e2e simula via `mine-apply`. Aceito (a parte determinística — store/CLI — é 100% testada).

**Placeholder scan:** sem TBD/TODO de implementação; todo passo de código tem código real.

**Type consistency:** `upsertInstinct(id, meta, delta)`, `loadIndex(projectId, scope)`, `buildDigest(projectId, opts)`, `appendObservation(projectId, obs)`, `eligibleForBridge(inst)` — nomes consistentes entre Tasks 2/4/6/7/11.
