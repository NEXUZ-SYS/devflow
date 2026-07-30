# ADR↔decisão no PREVC — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Revisão R aplicada (2026-06-12):** B1 (evolveHint = sugestão textual, valor único), B3 (`slug`→`adrName`, resolvível por `adr:evolve --resolve`, exemplos reais), B4 (sweep usa `resolveAdrPath`), envelope de schema, `.gitignore`, diacríticos no dedup, correção do path no `prevc-validation`.

**Goal:** Tornar a consideração de ADR consistente e cross-aware no PREVC — ao detectar uma decisão, cruzar com o acervo de ADRs e oferecer EVOLVE/CREATE/silêncio, com heurística 3/4, estendida a R/E/C.

**Architecture:** Separar **julgamento** (LLM, nos `SKILL.md`) de **regra** (lib `.mjs` determinística e testável). Duas libs novas — `adr-decision` (regra de disparo + árvore de ação + parse do bloco de guardrails) e `adr-pending` (estado efêmero de captura). Os quatro `SKILL.md` de fase orquestram as libs via CLI.

**Tech Stack:** Node.js ESM (zero deps, stdlib only), `node:test` + `node:assert/strict`, padrão de CLI dos scripts ADR existentes (`process.argv`, JSON em stdout).

**Spec:** `docs/superpowers/specs/2026-06-11-adr-decisao-prevc-design.md`

---

## Decisões de contrato fixadas na Review

- **Identidade da ADR:** o header do bloco `<ADR_GUARDRAILS>` (emitido tanto pelo hook `session-start` quanto pelo `adr-filter`) usa o campo `name` do frontmatter — **sem prefixo numérico** (ex.: `observability-otel-genai`). `decideAction` repassa esse `name` para `/devflow adr:evolve <name>`, que o resolve por **query fuzzy** (`adr-update-index.mjs --resolve`). Portanto `command`/`evolveHint` são **sugestões textuais** apresentadas ao humano/LLM — NÃO uma invocação determinística de filepath. A classificação final patch/minor/major/refine é do `adr-builder` EVOLVE (interview), não da lib.
- **Paths de ADR:** qualquer scan de ADR usa `resolveAdrPath()` (guardrail ADR-001/ADR-006) — nunca hardcode.
- **`.adr-pending.json`:** envelope versionado `{ "schema": 1, "candidates": [...] }`; efêmero e **gitignored**.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `scripts/lib/adr-decision.mjs` | Funções puras: `evaluateSignals`, `decideAction`, `parseGuardrailsBlock` |
| `scripts/adr-decision.mjs` | CLI fino: subcomandos `evaluate` e `decide` → JSON |
| `scripts/lib/adr-pending.mjs` | Estado efêmero: `appendCandidate`, `readCandidates`, `clearPending`, `normalizePhrase` |
| `skills/prevc-planning/SKILL.md` | Step 3.5 reescrito (3 ramos cross-aware + 3/4) |
| `skills/prevc-review/SKILL.md` | Novo step "ADR conflict gate" |
| `skills/prevc-execution/SKILL.md` | Captura passiva via `appendCandidate` |
| `skills/prevc-confirmation/SKILL.md` | Sweep (via `resolveAdrPath`) + seção no summary + `clearPending` |
| `skills/prevc-validation/SKILL.md` | **Correção pré-existente:** git diff passa a cobrir `.context/engineering/adrs/` |
| `.gitignore` | Ignora `.context/workflow/.adr-pending.json` |
| `tests/validation/test-adr-decision.mjs` | Unit das funções puras + CLI |
| `tests/validation/test-adr-pending.mjs` | Unit do estado efêmero (tmpdir) |
| `tests/validation/test-skill-adr-refs.mjs` | Guard: SKILL.md referenciam CLI/arquivo corretos |
| `tests/integration/test-e2e-adr-decisao-prevc.mjs` | E2E determinístico da cadeia P→E→C |

---

## Task 1: `evaluateSignals` — regra de disparo 3/4

**Files:**
- Create: `scripts/lib/adr-decision.mjs`
- Test: `tests/validation/test-adr-decision.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/validation/test-adr-decision.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSignals } from '../../scripts/lib/adr-decision.mjs';

// núcleo = nonTrivial && affectsStack ; reforço = hasAlternatives || impliesGuardrails
test('evaluateSignals: 4/4 dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true, hasAlternatives: true, impliesGuardrails: true }), true));
test('evaluateSignals: núcleo + 1 reforço (alternativas) dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true, hasAlternatives: true, impliesGuardrails: false }), true));
test('evaluateSignals: núcleo + 1 reforço (guardrails) dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true, hasAlternatives: false, impliesGuardrails: true }), true));
test('evaluateSignals: núcleo sem reforço NÃO dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true, hasAlternatives: false, impliesGuardrails: false }), false));
test('evaluateSignals: reforço sem núcleo (falta affectsStack) NÃO dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: false, hasAlternatives: true, impliesGuardrails: true }), false));
test('evaluateSignals: reforço sem núcleo (falta nonTrivial) NÃO dispara', () =>
  assert.equal(evaluateSignals({ nonTrivial: false, affectsStack: true, hasAlternatives: true, impliesGuardrails: true }), false));
test('evaluateSignals: campos ausentes tratados como false', () =>
  assert.equal(evaluateSignals({ nonTrivial: true, affectsStack: true }), false));
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/validation/test-adr-decision.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/adr-decision.mjs'`

- [ ] **Step 3: Implementar o mínimo**

```javascript
// scripts/lib/adr-decision.mjs
// adr-decision — regra determinística de disparo/ação de ADR no PREVC.
// Julgamento (sinais booleanos, relação) vem do LLM; a regra vive aqui (testável).
// Zero deps — Node stdlib only.

export function evaluateSignals(signals = {}) {
  const nonTrivial = Boolean(signals.nonTrivial);
  const affectsStack = Boolean(signals.affectsStack);
  const hasAlternatives = Boolean(signals.hasAlternatives);
  const impliesGuardrails = Boolean(signals.impliesGuardrails);
  const core = nonTrivial && affectsStack;                     // núcleo obrigatório
  const reinforcement = hasAlternatives || impliesGuardrails;  // ≥1 reforço
  return core && reinforcement;
}
```

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `node --test tests/validation/test-adr-decision.mjs`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/adr-decision.mjs tests/validation/test-adr-decision.mjs
git commit -m "feat(adr-decision): evaluateSignals com regra 3/4 (núcleo+reforço)"
```

---

## Task 2: `decideAction` — árvore EVOLVE/CREATE/silêncio

**Files:**
- Modify: `scripts/lib/adr-decision.mjs`
- Test: `tests/validation/test-adr-decision.mjs`

Contrato (Review B1/B3): `adrName` é o `name` frontmatter (sem prefixo), resolvível por `adr:evolve`. `command`/`evolveHint` são sugestões textuais.

- [ ] **Step 1: Escrever o teste que falha** (acrescentar ao arquivo de teste)

```javascript
import { decideAction } from '../../scripts/lib/adr-decision.mjs';

test('decideAction: contradicts → evolve major', () =>
  assert.deepEqual(decideAction({ relation: 'contradicts', adrName: 'observability-otel-genai' }),
    { action: 'evolve', command: '/devflow adr:evolve observability-otel-genai', evolveHint: 'major' }));
test('decideAction: extends → evolve minor', () =>
  assert.deepEqual(decideAction({ relation: 'extends', adrName: 'observability-otel-genai' }),
    { action: 'evolve', command: '/devflow adr:evolve observability-otel-genai', evolveHint: 'minor' }));
test('decideAction: aligned → silent', () =>
  assert.deepEqual(decideAction({ relation: 'aligned', adrName: 'observability-otel-genai' }),
    { action: 'silent' }));
test('decideAction: none → create', () =>
  assert.deepEqual(decideAction({ relation: 'none' }),
    { action: 'create', command: '/devflow adr:new --mode=prefilled' }));
test('decideAction: relação inválida lança', () =>
  assert.throws(() => decideAction({ relation: 'foo' }), /unknown relation/));
test('decideAction: evolve sem adrName lança', () =>
  assert.throws(() => decideAction({ relation: 'contradicts' }), /adrName required/));
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/validation/test-adr-decision.mjs`
Expected: FAIL — `decideAction is not a function`

- [ ] **Step 3: Implementar o mínimo** (acrescentar à lib)

```javascript
// adrName: o campo `name` do frontmatter (ex.: "observability-otel-genai"),
// repassado a `/devflow adr:evolve <name>` que resolve via query fuzzy.
// command/evolveHint são SUGESTÕES textuais — a classificação final do kind
// (patch/minor/major/refine) é do adr-builder EVOLVE via interview.
export function decideAction({ relation, adrName } = {}) {
  if (relation === 'aligned') return { action: 'silent' };
  if (relation === 'none') return { action: 'create', command: '/devflow adr:new --mode=prefilled' };
  if (relation === 'contradicts' || relation === 'extends') {
    if (!adrName) throw new Error('adrName required for evolve');
    const evolveHint = relation === 'contradicts' ? 'major' : 'minor';
    return { action: 'evolve', command: `/devflow adr:evolve ${adrName}`, evolveHint };
  }
  throw new Error(`unknown relation: ${relation}`);
}
```

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `node --test tests/validation/test-adr-decision.mjs`
Expected: PASS (13 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/adr-decision.mjs tests/validation/test-adr-decision.mjs
git commit -m "feat(adr-decision): decideAction (evolve/create/silent)"
```

---

## Task 3: `parseGuardrailsBlock` — extrair ADRs do bloco

**Files:**
- Modify: `scripts/lib/adr-decision.mjs`
- Test: `tests/validation/test-adr-decision.mjs`

Tanto o hook `session-start` quanto o `adr-filter` emitem headers `### <name> [tags...] (stack: <stack>)`. O hook emite sem `[tags]`; o `adr-filter` pode incluí-las. O parser cobre ambos.

- [ ] **Step 1: Escrever o teste que falha** (acrescentar)

```javascript
import { parseGuardrailsBlock } from '../../scripts/lib/adr-decision.mjs';

const BLOCK_FILTER = `<ADR_GUARDRAILS filtered="true">
Loaded 2 of 6 active ADR(s), filtered for task: "x".

### observability-otel-genai [firm] (stack: universal)
NUNCA logar payload bruto.

### permissions-vendor-neutral [proposto] (stack: universal)
SEMPRE deny-first.
</ADR_GUARDRAILS>`;

const BLOCK_HOOK = `<ADR_GUARDRAILS>
### adr-path-migration-to-context-root (stack: universal)
SEMPRE usar resolveAdrPath.
</ADR_GUARDRAILS>`;

test('parseGuardrailsBlock: formato adr-filter (com tags)', () =>
  assert.deepEqual(parseGuardrailsBlock(BLOCK_FILTER), [
    { name: 'observability-otel-genai', stack: 'universal', tags: ['firm'] },
    { name: 'permissions-vendor-neutral', stack: 'universal', tags: ['proposto'] },
  ]));
test('parseGuardrailsBlock: formato hook (sem tags)', () =>
  assert.deepEqual(parseGuardrailsBlock(BLOCK_HOOK), [
    { name: 'adr-path-migration-to-context-root', stack: 'universal', tags: [] },
  ]));
test('parseGuardrailsBlock: bloco sem ADRs → []', () =>
  assert.deepEqual(parseGuardrailsBlock('<ADR_GUARDRAILS>\nnada\n</ADR_GUARDRAILS>'), []));
test('parseGuardrailsBlock: entrada vazia/nula → []', () => {
  assert.deepEqual(parseGuardrailsBlock(''), []);
  assert.deepEqual(parseGuardrailsBlock(null), []);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/validation/test-adr-decision.mjs`
Expected: FAIL — `parseGuardrailsBlock is not a function`

- [ ] **Step 3: Implementar o mínimo** (acrescentar à lib)

```javascript
// Header emitido por hook/adr-filter: "### <name> [tag]... (stack: <stack>)".
// O hook (session-start) omite [tags]; o adr-filter pode incluí-las. Ambos têm (stack:).
const HEADER_RE = /^###\s+(.+?)\s*((?:\[[^\]]+\]\s*)*)\(stack:\s*([^)]+)\)\s*$/;

export function parseGuardrailsBlock(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  for (const line of text.split('\n')) {
    const m = line.match(HEADER_RE);
    if (!m) continue;
    const tags = (m[2].match(/\[([^\]]+)\]/g) || []).map(t => t.slice(1, -1).trim());
    out.push({ name: m[1].trim(), stack: m[3].trim(), tags });
  }
  return out;
}
```
> `stack`/`tags` são extraídos para o LLM ponderar ao classificar a relação (ex.: ignorar ADR de stack diferente, tratar `[experimental]` como não-bloqueante). Consumo é do julgamento LLM, não da árvore determinística.

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `node --test tests/validation/test-adr-decision.mjs`
Expected: PASS (18 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/adr-decision.mjs tests/validation/test-adr-decision.mjs
git commit -m "feat(adr-decision): parseGuardrailsBlock (formatos hook e adr-filter)"
```

---

## Task 4: CLI `adr-decision.mjs` — `evaluate` e `decide`

**Files:**
- Create: `scripts/adr-decision.mjs`
- Test: `tests/validation/test-adr-decision.mjs`

- [ ] **Step 1: Escrever o teste que falha** (acrescentar — invoca o CLI via execFileSync)

```javascript
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const CLI = resolve(import.meta.dirname, '../../scripts/adr-decision.mjs');
const run = (args) => JSON.parse(execFileSync('node', [CLI, ...args], { encoding: 'utf-8' }));

test('CLI evaluate: núcleo+reforço → trigger true', () =>
  assert.deepEqual(run(['evaluate', '--non-trivial=true', '--affects-stack=true', '--alternatives=true', '--guardrails=false']),
    { trigger: true }));
test('CLI evaluate: núcleo sem reforço → trigger false', () =>
  assert.deepEqual(run(['evaluate', '--non-trivial=true', '--affects-stack=true', '--alternatives=false', '--guardrails=false']),
    { trigger: false }));
test('CLI decide: contradicts → evolve major', () =>
  assert.deepEqual(run(['decide', '--relation=contradicts', '--name=observability-otel-genai']),
    { action: 'evolve', command: '/devflow adr:evolve observability-otel-genai', evolveHint: 'major' }));
test('CLI decide: none → create', () =>
  assert.deepEqual(run(['decide', '--relation=none']),
    { action: 'create', command: '/devflow adr:new --mode=prefilled' }));
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/validation/test-adr-decision.mjs`
Expected: FAIL — CLI não existe (exit não-zero)

- [ ] **Step 3: Implementar o mínimo**

```javascript
#!/usr/bin/env node
// scripts/adr-decision.mjs — CLI fino sobre lib/adr-decision.mjs.
// Usado pelos SKILL.md das fases PREVC para aplicar a regra de ADR
// deterministicamente (julgamento dos sinais/relação vem do LLM).
//
// Divergência intencional do padrão dos outros CLIs ADR: NÃO há --format nem
// findProjectRoot — entrada é só por flags, saída é sempre JSON puro em stdout,
// não há arquivo/projectRoot a resolver.
//
// Usage:
//   adr-decision.mjs evaluate --non-trivial=BOOL --affects-stack=BOOL --alternatives=BOOL --guardrails=BOOL
//   adr-decision.mjs decide --relation=contradicts|extends|aligned|none [--name=<adrName>]

import { evaluateSignals, decideAction } from './lib/adr-decision.mjs';

const argv = process.argv.slice(2);
const sub = argv[0];
const flag = (name) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const bool = (name) => flag(name) === 'true';

try {
  if (sub === 'evaluate') {
    const trigger = evaluateSignals({
      nonTrivial: bool('non-trivial'),
      affectsStack: bool('affects-stack'),
      hasAlternatives: bool('alternatives'),
      impliesGuardrails: bool('guardrails'),
    });
    console.log(JSON.stringify({ trigger }));
  } else if (sub === 'decide') {
    console.log(JSON.stringify(decideAction({ relation: flag('relation'), adrName: flag('name') })));
  } else {
    console.error('Usage: adr-decision.mjs <evaluate|decide> [flags]');
    process.exit(2);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
```

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `node --test tests/validation/test-adr-decision.mjs`
Expected: PASS (22 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/adr-decision.mjs tests/validation/test-adr-decision.mjs
git commit -m "feat(adr-decision): CLI evaluate/decide"
```

---

## Task 5: `adr-pending.mjs` — estado efêmero de captura

**Files:**
- Create: `scripts/lib/adr-pending.mjs`
- Modify: `.gitignore`
- Test: `tests/validation/test-adr-pending.mjs`

Envelope versionado `{ schema: 1, candidates: [...] }`; `readCandidates` tolera array cru legacy (schema 0). Dedup normaliza diacríticos (pt-BR).

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/validation/test-adr-pending.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendCandidate, readCandidates, clearPending, normalizePhrase } from '../../scripts/lib/adr-pending.mjs';

function fresh() { return mkdtempSync(join(tmpdir(), 'adr-pending-')); }
const FILE = (root) => join(root, '.context/workflow/.adr-pending.json');

test('readCandidates: arquivo ausente → []', () => {
  const root = fresh();
  try { assert.deepEqual(readCandidates(root), []); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('appendCandidate: cria arquivo com envelope schema e persiste', () => {
  const root = fresh();
  try {
    appendCandidate(root, { phrase: 'Adotar Vitest', phase: 'E', relatedAdr: 'jest-config' });
    assert.deepEqual(readCandidates(root), [{ phrase: 'Adotar Vitest', phase: 'E', relatedAdr: 'jest-config' }]);
    const raw = JSON.parse(require('node:fs').readFileSync(FILE(root), 'utf-8'));
    assert.equal(raw.schema, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('readCandidates: tolera array cru legacy (schema 0)', () => {
  const root = fresh();
  try {
    mkdirSync(join(root, '.context/workflow'), { recursive: true });
    writeFileSync(FILE(root), JSON.stringify([{ phrase: 'X', phase: 'E', relatedAdr: null }]));
    assert.equal(readCandidates(root).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('appendCandidate: dedup por frase normalizada (espaços + diacríticos)', () => {
  const root = fresh();
  try {
    appendCandidate(root, { phrase: 'Adoção de Zod', phase: 'E', relatedAdr: null });
    appendCandidate(root, { phrase: '  adocao   de zod ', phase: 'C', relatedAdr: null });
    assert.equal(readCandidates(root).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('appendCandidate: relatedAdr default null', () => {
  const root = fresh();
  try {
    appendCandidate(root, { phrase: 'X', phase: 'E' });
    assert.equal(readCandidates(root)[0].relatedAdr, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('readCandidates: JSON corrompido → []', () => {
  const root = fresh();
  try {
    mkdirSync(join(root, '.context/workflow'), { recursive: true });
    writeFileSync(FILE(root), '{ não é json');
    assert.deepEqual(readCandidates(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('clearPending: remove candidatos', () => {
  const root = fresh();
  try {
    appendCandidate(root, { phrase: 'X', phase: 'E' });
    clearPending(root);
    assert.deepEqual(readCandidates(root), []);
    assert.equal(existsSync(FILE(root)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('normalizePhrase: lowercase + colapso de espaços + sem diacríticos', () =>
  assert.equal(normalizePhrase('  Adoção   de Zod '), 'adocao de zod'));
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `node --test tests/validation/test-adr-pending.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/adr-pending.mjs'`

- [ ] **Step 3: Implementar o mínimo**

```javascript
// scripts/lib/adr-pending.mjs
// adr-pending — estado efêmero de "decisões candidatas a ADR" capturadas na
// Execution e varridas no Confirmation. Vive em
// <root>/.context/workflow/.adr-pending.json (envelope { schema, candidates }).
// Efêmero e gitignored. Zero deps.
//
// NOTA de concorrência: read-modify-write não-atômico. Sob dispatch paralelo de
// subagents, dois appends concorrentes podem perder um candidato (last-write-wins,
// degradação graciosa — o git diff do Confirmation é a segunda rede). Aceitável
// para estado best-effort; não usar para dados que não possam ser perdidos.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SCHEMA = 1;

function pendingPath(root) {
  return join(root, '.context', 'workflow', '.adr-pending.json');
}

export function normalizePhrase(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

export function readCandidates(root) {
  const fp = pendingPath(root);
  if (!existsSync(fp)) return [];
  try {
    const data = JSON.parse(readFileSync(fp, 'utf-8'));
    if (Array.isArray(data)) return data;                  // legacy schema 0
    return Array.isArray(data.candidates) ? data.candidates : [];
  } catch {
    return [];
  }
}

export function appendCandidate(root, { phrase, phase, relatedAdr = null }) {
  const candidates = readCandidates(root);
  const key = normalizePhrase(phrase);
  if (candidates.some(c => normalizePhrase(c.phrase) === key)) return candidates;
  candidates.push({ phrase, phase, relatedAdr: relatedAdr ?? null });
  const fp = pendingPath(root);
  mkdirSync(dirname(fp), { recursive: true });
  writeFileSync(fp, JSON.stringify({ schema: SCHEMA, candidates }, null, 2) + '\n');
  return candidates;
}

export function clearPending(root) {
  rmSync(pendingPath(root), { force: true });
}
```

- [ ] **Step 4: Rodar e confirmar passagem**

Run: `node --test tests/validation/test-adr-pending.mjs`
Expected: PASS (8 testes)

- [ ] **Step 5: Adicionar ao `.gitignore`**

Acrescente a linha (se a seção não existir, crie-a ao final):
```
# DevFlow — estado efêmero de captura de decisões (PREVC)
.context/workflow/.adr-pending.json
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/adr-pending.mjs tests/validation/test-adr-pending.mjs .gitignore
git commit -m "feat(adr-pending): estado efêmero versionado + gitignore"
```

---

## Task 6: `prevc-planning` Step 3.5 — reescrita cross-aware

**Files:**
- Modify: `skills/prevc-planning/SKILL.md:125-161` (substituir todo o Step 3.5)

> **Verificação:** editorial. Cobertura comportamental via E2E (Task 10) + guard (Task 9).

- [ ] **Step 1: Substituir a seção "## Step 3.5"** pelo conteúdo abaixo

````markdown
## Step 3.5: ADR opportunity check (cross-aware)

After the spec is enriched and BEFORE writing the implementation plan, evaluate whether the design contains an architectural decision and **cruze com as ADRs já carregadas no Step 1** (bloco `<ADR_GUARDRAILS>`).

**Princípio:** o *julgamento* (sinais, relação) é seu (LLM); a *regra* (disparo 3/4 e a ação) é aplicada por `scripts/adr-decision.mjs` — não reimplemente em prosa.

### a) Detecção (heurística 3/4: núcleo + reforço)

Avalie 4 sinais como booleanos:

| Sinal | Papel | Como detectar |
|---|---|---|
| **não-trivial** | núcleo (obrigatório) | Task não é bugfix, rename, typo, refactor cosmético |
| **afeta stack/arquitetura** | núcleo (obrigatório) | Menciona framework, biblioteca, padrão, protocolo, ferramenta de infra |
| **alternativas** | reforço (≥1) | ≥2 opções com tradeoffs ("X vs Y", "em vez de") |
| **implica guardrails** | reforço (≥1) | Cria regras de uso recorrentes ("sempre X", "evitar Y") |

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-decision.mjs evaluate \
  --non-trivial=<bool> --affects-stack=<bool> --alternatives=<bool> --guardrails=<bool>
```
Se `{"trigger": false}` → pule para o Step 4.

### b) Cruzamento com ADRs existentes

Se disparou, classifique a **relação** da decisão contra as ADRs presentes no bloco `<ADR_GUARDRAILS>` (cada header traz o `name` da ADR; use-o como identificador):

- **contradicts** — substitui/contraria uma ADR aprovada
- **extends** — adiciona/refina sem contrariar
- **aligned** — já coberta, sem novidade
- **none** — nenhuma ADR do bloco trata do tema

Na dúvida entre `aligned` e `contradicts/extends`, **prefira oferecer** (falso positivo > falso negativo).
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-decision.mjs decide --relation=<relation> [--name=<adrName>]
```
`<adrName>` é o `name` do header (ex.: `observability-otel-genai`); `adr:evolve` o resolve por query.

### c) Ação

- **`action: "silent"`** (aligned) → siga para o Step 4 **sem nenhuma menção**.
- **`action: "evolve"`** → ofereça registrar a mudança na ADR existente, citando a ADR-alvo e o `evolveHint` (sugestão — o kind final é do `adr-builder` EVOLVE):

  > Detectei que esta decisão **<contradiz|estende>** a ADR **`<adrName>`**:
  >   "<frase-chave exata do spec>"
  >
  > - **(a) Sim**, rodar `<command>` (sugestão: `<evolveHint>`)
  > - **(b) Não**, seguir direto para o plan
  > - **(c) Não oferecer novamente neste workflow** (`skip_adr_offer=true`)

- **`action: "create"`** (none) → oferta de CREATE:

  > Detectei uma decisão arquitetural sem ADR correspondente:
  >   "<frase-chave exata do spec>"
  >
  > - **(a) Sim**, rodar `/devflow adr:new --mode=prefilled` com pré-preenchimento
  > - **(b) Não**, seguir direto para o plan
  > - **(c) Não oferecer novamente neste workflow** (`skip_adr_offer=true`)

**Comportamento por escolha:**
- **(a)** — suspende o fluxo, spawna o workflow filho (`adr:evolve` ou `adr:new`). Ao concluir, controle volta ao Step 4 com a ADR disponível.
- **(b)** — segue ao Step 4.
- **(c)** — escreve `skip_adr_offer: true` no workflow metadata. **Cobre todo o workflow** (Planning e o sweep do Confirmation).

A oferta sempre cita a frase-chave exata do spec (transparência).
````

- [ ] **Step 2: Verificar a edição**

Run: `grep -n "adr-decision.mjs\|cross-aware\|skip_adr_offer" skills/prevc-planning/SKILL.md`
Expected: referências presentes ao CLI, ao título cross-aware e ao opt-out de workflow inteiro.

- [ ] **Step 3: Commit**

```bash
git add skills/prevc-planning/SKILL.md
git commit -m "feat(prevc-planning): Step 3.5 cross-aware (evolve/create/silent + 3/4)"
```

---

## Task 7: `prevc-review`, `prevc-execution`, `prevc-confirmation` — fases R/E/C

**Files:**
- Modify: `skills/prevc-review/SKILL.md` (novo step antes do gate de aprovação)
- Modify: `skills/prevc-execution/SKILL.md` (captura no ponto de handoff/diary)
- Modify: `skills/prevc-confirmation/SKILL.md` (sweep antes da finalização + summary)

> **Verificação:** editorial; coberto pelo E2E (Task 10) + guard (Task 9).

- [ ] **Step 1: `prevc-review` — inserir o step "ADR conflict gate"** antes do gate de aprovação

````markdown
## Step R.x: ADR conflict gate

Antes de aprovar o plano, releia-o contra os guardrails carregados no bloco `<ADR_GUARDRAILS>` (Planning Step 1):

1. **Conflito plano×guardrail** — algum passo do plano viola um SEMPRE/NUNCA/QUANDO de ADR aprovada? Se sim, **sinalize como BLOCK** (não é oferta — é gate): aponte a ADR e o guardrail violado; o plano deve ser corrigido ou a ADR evoluída antes de avançar.
2. **Decisão nova no plano** — o plano introduziu uma decisão arquitetural que o Planning não capturou? Se sim, aplique o cruzamento do Planning Step 3.5 (b/c) reusando `scripts/adr-decision.mjs` e ofereça evolve/create. Respeite `skip_adr_offer`.
````

- [ ] **Step 2: `prevc-execution` — inserir captura passiva** no ponto onde o handoff/diary registra "decisions made"

````markdown
### Captura de decisão emergente (passiva — não interrompe o loop)

Se durante a implementação surgir uma **decisão arquitetural não prevista no plano** (escolha de lib/contrato, desvio de design), registre-a para o sweep do Confirmation, sem parar o trabalho:

```bash
node -e "import('${CLAUDE_PLUGIN_ROOT}/scripts/lib/adr-pending.mjs').then(m => m.appendCandidate(process.cwd(), { phrase: '<frase-chave da decisão>', phase: 'E', relatedAdr: '<adrName ou vazio>' }))"
```
Use `relatedAdr` (o `name` da ADR) quando a decisão tocar uma ADR existente; deixe vazio caso contrário. A dedup é automática.
````

- [ ] **Step 3: `prevc-confirmation` — inserir o sweep** antes de invocar a finalização e a seção no completion summary

````markdown
## Step C.x: ADR sweep (rede de segurança)

Antes de finalizar o branch:

1. Leia os candidatos capturados na Execution:
   ```bash
   node -e "import('${CLAUDE_PLUGIN_ROOT}/scripts/lib/adr-pending.mjs').then(m => console.log(JSON.stringify(m.readCandidates(process.cwd()))))"
   ```
2. Detecte ADRs tocadas no workflow (paths via `resolveAdrPath`, nunca hardcode — guardrail ADR-001/006):
   ```bash
   ADR_GLOBS=$(node -e "import('${CLAUDE_PLUGIN_ROOT}/scripts/lib/path-resolver.mjs').then(m => { const p = m.resolveAdrPath(process.cwd()); console.log(p.readPaths.map(d => d + '/*.md').join(' ')); })")
   BASE=$(git merge-base HEAD "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@origin/@@' || echo main)")
   git diff --name-only "$BASE"...HEAD -- $ADR_GLOBS
   ```
3. Para cada candidato **sem ADR já registrada**, classifique a relação e resolva a ação com `scripts/adr-decision.mjs decide`. Apresente as ofertas **em lote** (uma lista única evolve/create). **Respeite `skip_adr_offer`** — se ativo, pule o sweep silenciosamente.
4. Limpe o estado:
   ```bash
   node -e "import('${CLAUDE_PLUGIN_ROOT}/scripts/lib/adr-pending.mjs').then(m => m.clearPending(process.cwd()))"
   ```

**Completion summary:** acrescente a seção **"ADRs criadas/evoluídas neste workflow"**, listando os nomes tocados (passo 2) e o resultado do sweep.
````

- [ ] **Step 4: Verificar as três edições**

Run: `grep -l "adr-pending\|adr-decision\|ADR conflict gate\|ADR sweep\|resolveAdrPath" skills/prevc-review/SKILL.md skills/prevc-execution/SKILL.md skills/prevc-confirmation/SKILL.md`
Expected: os três arquivos listados.

- [ ] **Step 5: Commit**

```bash
git add skills/prevc-review/SKILL.md skills/prevc-execution/SKILL.md skills/prevc-confirmation/SKILL.md
git commit -m "feat(prevc): ADR conflict gate (R), captura (E), sweep com resolveAdrPath (C)"
```

---

## Task 8: Correção pré-existente do `prevc-validation` (path canônico)

**Files:**
- Modify: `skills/prevc-validation/SKILL.md:103,130`

O git diff do gate de auditoria não cobre `.context/engineering/adrs/` (path canônico real desde DDC v1.0), então a fase V não detecta ADRs tocadas. Correção mínima aprovada pelo usuário.

- [ ] **Step 1: Ajustar os dois globs** — adicionar o path canônico

Linha 103 e linha 130: trocar
```
-- '.context/adrs/*.md' '.context/docs/adrs/*.md'
```
por
```
-- '.context/engineering/adrs/*.md' '.context/adrs/*.md' '.context/docs/adrs/*.md'
```

- [ ] **Step 2: Verificar**

Run: `grep -n "engineering/adrs" skills/prevc-validation/SKILL.md`
Expected: as linhas 103 e 130 agora incluem `.context/engineering/adrs/*.md`.

- [ ] **Step 3: Commit**

```bash
git add skills/prevc-validation/SKILL.md
git commit -m "fix(prevc-validation): git diff cobre .context/engineering/adrs (path canônico)"
```

---

## Task 9: Guard de referências dos SKILL.md

**Files:**
- Create: `tests/validation/test-skill-adr-refs.mjs`

Pega regressão de path: se alguém renomear o CLI/arquivo, a referência no doc quebra silenciosamente.

- [ ] **Step 1: Escrever o teste**

```javascript
// tests/validation/test-skill-adr-refs.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf-8');

test('planning referencia o CLI adr-decision', () =>
  assert.match(read('skills/prevc-planning/SKILL.md'), /adr-decision\.mjs/));
test('execution referencia adr-pending (appendCandidate)', () => {
  const t = read('skills/prevc-execution/SKILL.md');
  assert.match(t, /adr-pending\.mjs/);
  assert.match(t, /appendCandidate/);
});
test('confirmation referencia readCandidates, clearPending e resolveAdrPath', () => {
  const t = read('skills/prevc-confirmation/SKILL.md');
  assert.match(t, /readCandidates/);
  assert.match(t, /clearPending/);
  assert.match(t, /resolveAdrPath/);
});
test('review referencia o conflict gate', () =>
  assert.match(read('skills/prevc-review/SKILL.md'), /ADR conflict gate/));
test('validation cobre o path canônico engineering/adrs', () =>
  assert.match(read('skills/prevc-validation/SKILL.md'), /engineering\/adrs/));
```

- [ ] **Step 2: Rodar e confirmar passagem** (edições das Tasks 6-8 já existem)

Run: `node --test tests/validation/test-skill-adr-refs.mjs`
Expected: PASS (5 testes). Se FALHAR, corrija a referência no SKILL.md correspondente.

- [ ] **Step 3: Commit**

```bash
git add tests/validation/test-skill-adr-refs.mjs
git commit -m "test(prevc): guard de referências ADR nos SKILL.md"
```

---

## Task 10: E2E determinístico da cadeia P→E→C

**Files:**
- Create: `tests/integration/test-e2e-adr-decisao-prevc.mjs`

Testa a **cadeia determinística** (libs integradas) que os SKILL.md orquestram — sem depender de um LLM. Simula os julgamentos como o SKILL.md faria.

- [ ] **Step 1: Escrever o teste**

```javascript
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
```

- [ ] **Step 2: Rodar e confirmar passagem** (libs das Tasks 1-5 já existem)

Run: `node --test tests/integration/test-e2e-adr-decisao-prevc.mjs`
Expected: PASS (4 testes)

- [ ] **Step 3: Rodar a suíte ADR inteira**

Run: `node --test tests/validation/test-adr-decision.mjs tests/validation/test-adr-pending.mjs tests/validation/test-skill-adr-refs.mjs tests/integration/test-e2e-adr-decisao-prevc.mjs`
Expected: PASS (todos)

- [ ] **Step 4: Commit**

```bash
git add tests/integration/test-e2e-adr-decisao-prevc.mjs
git commit -m "test(adr): E2E determinístico da cadeia P→E→C"
```

---

## Self-Review (cobertura do spec + achados da Review)

- **Step 3.5 cross-aware (EVOLVE/CREATE/silêncio)** → Tasks 1-4 (regra) + Task 6 (instrução). ✓
- **Heurística 3/4** → Task 1 + Task 6. ✓
- **Caso alinhado = silêncio** → Task 2 (aligned→silent) + Task 6c. ✓
- **R = gate de conflito** → Task 7 Step 1. ✓
- **E = captura passiva** → Task 5 + Task 7 Step 2. ✓
- **C = sweep + summary + clear** → Task 7 Step 3. ✓
- **`.adr-pending.json` efêmero/versionado/gitignored** → Task 5. ✓
- **Cruzamento reusa bloco (hook + adr-filter)** → Task 3 + Task 6b. ✓
- **`skip_adr_offer` cobre workflow inteiro** → Task 6c + Task 7 (sweep respeita). ✓
- **TDD real (lib) + E2E** → Tasks 1-5, 9, 10. ✓
- **[Review B1] evolveHint/command = sugestão textual** → Task 2 (valor único + comentário). ✓
- **[Review B3] identidade da ADR = `name` resolvível** → Tasks 2,3,4 (`adrName`, exemplos reais). ✓
- **[Review B4] sweep usa `resolveAdrPath` + base dinâmica** → Task 7 Step 3. ✓
- **[Review] correção do path no prevc-validation** → Task 8. ✓

Consistência de tipos: `evaluateSignals({nonTrivial,affectsStack,hasAlternatives,impliesGuardrails})→bool`; `decideAction({relation,adrName})→{action,command?,evolveHint?}`; `parseGuardrailsBlock(text)→[{name,stack,tags}]`; `appendCandidate(root,{phrase,phase,relatedAdr})`. Usados de forma idêntica em todas as tasks e no E2E. ✓
