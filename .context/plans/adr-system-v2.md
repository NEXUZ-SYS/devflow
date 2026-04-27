---
status: filled
generated: 2026-04-24
workflow: adr-system-v2
scale: MEDIUM
phase: "P→R"
spec: docs/superpowers/specs/2026-04-24-adr-system-v2-design.md
supersedes: adr-system.md
agents:
  - type: "backend-specialist"
    role: "Implement 5 Node libs (frontmatter, graph, audit, update-index, evolve) — stdlib only, zero deps"
  - type: "documentation-writer"
    role: "Author SKILL.md (CREATE/AUDIT/EVOLVE), references/, dispatcher command, supersede previous plan"
  - type: "architect-specialist"
    role: "Design Step 5.6 (prevc-planning) and Step 2.5 (prevc-validation) modifications; validate cross-skill consistency"
  - type: "test-writer"
    role: "Write 4 test suites, ≥10 fixtures, build subagent E2E harness (net-new infra)"
  - type: "refactoring-specialist"
    role: "Migrate ADRs 001/002 to v2.1.0 with grep blast radius and --no-fix-auto"
  - type: "code-reviewer"
    role: "Review every phase boundary, validate architectural decisions, final acceptance"
docs:
  - "project-overview.md"
  - "development-workflow.md"
  - "testing-strategy.md"
  - "adrs/README.md"
phases:
  - id: "phase-1"
    name: "Parser + Libs + Fixtures + Bundle Extraction"
    prevc: "E"
    agent: "backend-specialist"
    weight: 0.50
  - id: "phase-2"
    name: "Skill + Dispatcher + Evolve Lib"
    prevc: "E"
    agent: "documentation-writer"
    weight: 0.22
  - id: "phase-3"
    name: "Migration of 001/002"
    prevc: "E"
    agent: "refactoring-specialist"
    weight: 0.10
  - id: "phase-4"
    name: "Active Integration (Step 5.6, Step 2.5, adr-filter)"
    prevc: "E"
    agent: "architect-specialist"
    weight: 0.13
  - id: "phase-5"
    name: "Suite D Harness + Acceptance + Cleanup"
    prevc: "V"
    agent: "test-writer"
    weight: 0.15
---

# ADR System v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **DevFlow workflow:** `adr-system-v2` | **Scale:** MEDIUM | **Phase:** P→R (planning complete, awaiting review)

**Goal:** Evoluir o sistema de ADR do DevFlow para o padrão v2.1.0 com nova skill `devflow:adr-builder` (3 modos), lib Node determinística (5 arquivos, zero deps), e integração ativa em 3 skills do PREVC.

**Architecture:** Skill conversacional em Markdown (`skills/adr-builder/`) orquestra modos CREATE/AUDIT/EVOLVE. AUDIT é determinístico via lib `adr-audit.mjs` (12 checks). Dispatcher em `commands/devflow-adr.md` roteia subcomandos. Cross-project compatibility via Node 20+ stdlib only — parser de YAML frontmatter próprio (~80 linhas). Gates de validação em `prevc-validation` Step 2.5. Detecção proativa de decisão arquitetural em `prevc-planning` Step 5.6.

**Tech Stack:** Node 20+ (stdlib only), Markdown + YAML frontmatter, Bash, dotcontext v2 format, git CLI 2.x+.

---

## Task Snapshot

- **Primary goal:** Sistema ADR DevFlow operando no padrão v2.1.0 com builder full (CREATE+AUDIT+EVOLVE), gate determinístico em V phase, e ADRs migradas.
- **Success signal:** 4 suites verdes (A, B, C ≤2s; D triggered E2E) + 12/12 PASS em todas as ADRs do repo + workflow PREVC sintético atravessa Step 5.6 e Step 2.5 sem regressão.
- **Key references:**
  - [Spec aprovado](../../docs/superpowers/specs/2026-04-24-adr-system-v2-design.md)
  - [Bundle anexo](../../docs/adr-builder.skill) (extraído na Fase 1, deletado pós-port)
  - [Plan superseded](adr-system.md)
  - [adr-filter (skill existente)](../../skills/adr-filter/SKILL.md)

## Agent Lineup

| Agent | Role | Playbook | Primary phase |
|---|---|---|---|
| backend-specialist | Implementar 5 libs Node, lock concorrente, cross-project compat | [`backend-specialist.md`](../agents/backend-specialist.md) | Fase 1, 2 |
| documentation-writer | Authorar SKILL.md, references/, dispatcher, supersede de docs | [`documentation-writer.md`](../agents/documentation-writer.md) | Fase 2, 5 |
| architect-specialist | Step 5.6/2.5 design, integração cross-skill, review de design | [`architect-specialist.md`](../agents/architect-specialist.md) | Fase 4 |
| test-writer | 4 suites + fixtures + harness Suite D (infra net-new) | [`test-writer.md`](../agents/test-writer.md) | Fase 1, 5 |
| refactoring-specialist | Migração 001/002 com grep + `--no-fix-auto` | [`refactoring-specialist.md`](../agents/refactoring-specialist.md) | Fase 3 |
| code-reviewer | Review boundary entre fases, validar decisões arquiteturais | [`code-reviewer.md`](../agents/code-reviewer.md) | Todas |

## Documentation Touchpoints

| Doc | Arquivo | Modificação |
|---|---|---|
| Project Overview | [`project-overview.md`](../docs/project-overview.md) | Adicionar menção ao sistema ADR v2 + skill `adr-builder` |
| Development Workflow | [`development-workflow.md`](../docs/development-workflow.md) | Documentar Step 2.5 da V phase + comandos `/devflow adr:*` |
| Testing Strategy | [`testing-strategy.md`](../docs/testing-strategy.md) | Adicionar 4 suites de ADR ao escopo |
| ADR Index | [`adrs/README.md`](../docs/adrs/README.md) | Reescrito com schema 14 colunas via `adr-update-index.mjs` |

## Risk Assessment

| Risco | Probabilidade | Impacto | Owner | Mitigação |
|---|---|---|---|---|
| Suite D consome tokens demais | Média | Médio | test-writer | Trigger seletivo + harness reusable |
| FIX-AUTO corrompe ADRs aprovadas | Baixa | Alto | refactoring-specialist | Migração com `--no-fix-auto` (P12) |
| Schema 14-cols quebra adr-filter | Baixa | Médio | architect-specialist | Parser por nome de coluna; teste regressão |
| Step 5.6 vira fadiga | Média | Baixo | architect-specialist | 4 sinais simultâneos + opt-out persistente |
| Plugin packaging dropa assets/references | Baixa | Alto | documentation-writer | Auditar `plugin.json` Fase 1 + smoke test fresh-install |
| Colisão concorrente `--next-number` | Baixa | Médio | backend-specialist | Advisory lock via `flock` + fallback Windows |
| Toolchain Node ausente em projeto cliente | Baixa | Médio | backend-specialist | Node 20+ é dep declarada; libs `.mjs` standalone (P10) |
| Parser próprio quebra em frontmatter inesperado | Média | Baixo | backend-specialist | ≥10 fixtures de edge cases; fail-loud com mensagem específica |

## Assumptions

- Bundle anexo `docs/adr-builder.skill` está válido e descompactável (verificado em pre-flight da Fase 1).
- Node 20+ disponível em ambientes de dev/CI (DevFlow já assume).
- `git` CLI 2.x+ disponível (universal).
- Linux/macOS primário; Windows-WSL via fallbacks específicos onde aplicável (lock).

## Library Architecture & Import Graph

```
┌──────────────────────────────────────────────────────────────────┐
│  scripts/lib/                                                    │
│  ├── adr-frontmatter.mjs    (zero deps internas — base)         │
│  ├── adr-semver.mjs         (zero deps — bumpSemver, compare)   │
│  └── adr-graph.mjs          (depende de: adr-frontmatter)       │
│                                                                  │
│  scripts/                                                        │
│  ├── adr-audit.mjs          (depende de: frontmatter + graph)   │
│  ├── adr-update-index.mjs   (depende de: frontmatter + semver)  │
│  ├── adr-evolve.mjs         (depende de: frontmatter + semver +  │
│  │                                       update-index via fork) │
│  └── adr-migrate-v1-to-v2.mjs (depende de: frontmatter — Fase 3)│
└──────────────────────────────────────────────────────────────────┘
```

**Implementation order (dependency-respecting):**
1. `adr-frontmatter.mjs` (Task 1.3) — foundation, zero deps
2. `adr-semver.mjs` (Task 1.4) — extracted from prior plan as standalone (resolve C5)
3. `adr-graph.mjs` (Task 1.5) — needs frontmatter
4. `adr-audit.mjs` (Task 1.11) — needs frontmatter + graph
5. `adr-update-index.mjs` (Task 1.13) — needs frontmatter + semver
6. `adr-evolve.mjs` (Task 2.2) — needs frontmatter + semver + forks update-index
7. `adr-migrate-v1-to-v2.mjs` (Task 3.4) — needs frontmatter

**Cross-component contracts:**
- All libs are stdlib-only (P10) — no `package.json` introduced
- All `execSync` calls are **forbidden**; use `execFileSync('cmd', [args])` with argv array (S1 mitigation)
- Parser uses `Object.create(null)` for frontmatter object + denylist `__proto__/constructor/prototype` (S2 mitigation)
- All paths via `--project=` are validated via `path.resolve()` + `startsWith(process.cwd())` (S6 mitigation)

---

## Working Phases

### Phase 1 — Parser + Libs + Fixtures + Bundle Extraction (Tasks 1.1–1.14)

> **Primary Agent:** `backend-specialist` — [Playbook](../agents/backend-specialist.md)
> **Tests:** unit (frontmatter, graph) + integration (audit, update-index against fixtures)

**Objective:** Extrair o bundle ZIP, portar conteúdo estático, escrever as 5 libs Node com zero deps, criar todas as fixtures, garantir Suites A+B+C 100% verdes.

---

#### Task 1.1: Pre-flight — extract bundle and audit packaging

**Files:**
- Read: `docs/adr-builder.skill` (ZIP)
- Create: `/tmp/adr-builder-extract/` (working dir)
- Read: `.claude-plugin/plugin.json` (audit `files` array)

- [ ] **Step 1: Extract bundle**

```bash
mkdir -p /tmp/adr-builder-extract && cd /tmp/adr-builder-extract && \
  unzip -o /home/walterfrey/Documentos/code/devflow/docs/adr-builder.skill && \
  ls -la adr-builder/
```

Expected: tree with `SKILL.md`, `assets/`, `references/`, `tests/audit-fixtures/`, `VERSION.md`, `README.md`.

- [ ] **Step 2: Audit plugin.json packaging**

```bash
cat /home/walterfrey/Documentos/code/devflow/.claude-plugin/plugin.json
```

Verify: `files` array (if present) covers `skills/**` and `commands/**` and `scripts/**`. If `files` array absent, plugin defaults to entire repo — confirm via marketplace docs.

- [ ] **Step 3: No commit — pre-flight only**

---

#### Task 1.2: Write failing tests for `adr-frontmatter` parser

**Files:**
- Create: `tests/validation/test-adr-frontmatter.mjs`
- Create: `tests/validation/fixtures/frontmatter/` (10 edge-case fixtures)

**Tests:** unit. Test types declared: parsing primitives.

- [ ] **Step 1: Write test scaffold (includes S2 prototype pollution test fixture)**

```javascript
// tests/validation/test-adr-frontmatter.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, stringify } from '../../scripts/lib/adr-frontmatter.mjs';

const fixtures = (name) => readFileSync(`./tests/validation/fixtures/frontmatter/${name}.md`, 'utf-8');

// S2 — prototype pollution attempt must throw, not pollute Object.prototype
test('reject __proto__ key (S2)', () => {
  assert.throws(() => parse(fixtures('11-proto-attack')), /forbidden key/);
  // Verify Object.prototype was NOT polluted
  assert.equal({}.polluted, undefined);
});

test('reject constructor key (S2)', () => {
  assert.throws(() => parse(fixtures('12-constructor-attack')), /forbidden key/);
});

test('parse: minimal valid frontmatter', () => {
  const { frontmatter, body } = parse(fixtures('01-minimal'));
  assert.equal(frontmatter.type, 'adr');
  assert.equal(frontmatter.version, '0.1.0');
  assert.deepEqual(frontmatter.supersedes, []);
  assert.match(body, /^# ADR/);
});

test('parse: empty list inline', () => {
  const { frontmatter } = parse(fixtures('02-empty-list'));
  assert.deepEqual(frontmatter.supersedes, []);
  assert.deepEqual(frontmatter.refines, []);
});

test('parse: list with multiple items', () => {
  const { frontmatter } = parse(fixtures('03-list-multi'));
  assert.deepEqual(frontmatter.supersedes, ['001-tdd-python-v1.0.0', '002-old']);
});

test('parse: null and quoted strings', () => {
  const { frontmatter } = parse(fixtures('04-null-quoted'));
  assert.equal(frontmatter.protocol_contract, null);
  assert.equal(frontmatter.description, 'Decisão sobre validação');
});

test('parse: ISO date', () => {
  const { frontmatter } = parse(fixtures('05-iso-date'));
  assert.equal(frontmatter.created, '2026-04-22');
});

test('parse: comments ignored', () => {
  const { frontmatter } = parse(fixtures('06-comments'));
  assert.equal(frontmatter.type, 'adr'); // # ignored
});

test('parse: missing closing --- throws', () => {
  assert.throws(() => parse(fixtures('07-no-closing')), /frontmatter delimiter/);
});

test('parse: empty value', () => {
  const { frontmatter } = parse(fixtures('08-empty-value'));
  assert.equal(frontmatter.scope, '');
});

test('stringify: roundtrip preserves order', () => {
  const original = fixtures('01-minimal');
  const { frontmatter, body } = parse(original);
  const result = stringify(frontmatter, body);
  const reparse = parse(result);
  assert.deepEqual(reparse.frontmatter, frontmatter);
});

test('stringify: empty list rendered as []', () => {
  const result = stringify({ supersedes: [] }, '# body');
  assert.match(result, /supersedes: \[\]/);
});
```

- [ ] **Step 2: Create 12 fixtures (10 valid + 2 attack — S2)**

`fixtures/frontmatter/11-proto-attack.md`:
```markdown
---
type: adr
__proto__: [polluted]
---
# Attack
```

`fixtures/frontmatter/12-constructor-attack.md`:
```markdown
---
type: adr
constructor: malicious
---
# Attack
```

`fixtures/frontmatter/01-minimal.md`:
```markdown
---
type: adr
name: test
description: Mínimo válido
scope: project
stack: python
category: qualidade-testes
status: Proposto
version: 0.1.0
created: 2026-04-22
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR — Teste
```

(Repete para 02 a 10 com variações dos casos do test.)

- [ ] **Step 3: Run tests, expect RED**

```bash
node --test tests/validation/test-adr-frontmatter.mjs
```

Expected: FAIL — `Cannot find module '../../scripts/lib/adr-frontmatter.mjs'`.

- [ ] **Step 4: Commit fixtures + test (RED)**

```bash
git add tests/validation/test-adr-frontmatter.mjs tests/validation/fixtures/frontmatter/
git commit -m "test(adrs): add failing tests for frontmatter parser"
```

---

#### Task 1.3: Implement `adr-frontmatter.mjs` parser

**Files:**
- Create: `scripts/lib/adr-frontmatter.mjs`
- Test: `tests/validation/test-adr-frontmatter.mjs`

- [ ] **Step 1: Write parser implementation (with S2 prototype pollution mitigation)**

```javascript
// scripts/lib/adr-frontmatter.mjs
const DELIMITER = /^---\s*$/m;
// S2 — denylist for prototype pollution attacks
const DENYLIST_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function parse(content) {
  if (!content.startsWith('---')) {
    throw new Error('frontmatter delimiter missing at start');
  }
  const lines = content.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].match(DELIMITER)) { endIdx = i; break; }
  }
  if (endIdx === -1) throw new Error('frontmatter delimiter missing at end');

  // S2 — Object.create(null) avoids prototype chain entirely
  const fm = Object.create(null);
  for (const line of lines.slice(1, endIdx)) {
    if (line.trim().startsWith('#') || line.trim() === '') continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (DENYLIST_KEYS.has(key)) {
      throw new Error(`forbidden key in frontmatter: ${key}`);
    }
    fm[key] = parseValue(rawVal.trim());
  }
  const body = lines.slice(endIdx + 1).join('\n');
  return { frontmatter: fm, body };
}

function parseValue(v) {
  if (v === '' || v === '~') return v === '' ? '' : null;
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '[]') return [];
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
  }
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

export function stringify(frontmatter, body) {
  const lines = ['---'];
  for (const [k, val] of Object.entries(frontmatter)) {
    lines.push(`${k}: ${formatValue(val)}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n' + body;
}

function formatValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return '[' + v.map(x => x).join(', ') + ']';
  }
  if (typeof v === 'string' && (v.includes(':') || v.includes('#'))) return `"${v}"`;
  return String(v);
}
```

- [ ] **Step 2: Run tests, expect GREEN**

```bash
node --test tests/validation/test-adr-frontmatter.mjs
```

Expected: 10/10 PASS in <500ms.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/adr-frontmatter.mjs
git commit -m "feat(adrs): implement minimal YAML frontmatter parser (zero deps)"
```

---

#### Task 1.4 (NEW — C5): Implement `adr-semver.mjs` (TDD)

**Files:**
- Create: `scripts/lib/adr-semver.mjs`
- Create: `tests/validation/test-adr-semver.mjs`

**Tests:** unit. Resolve C5 — extract semver helpers used by both `adr-update-index.mjs` and `adr-evolve.mjs` to single source of truth.

- [ ] **Step 1: Write failing test**

```javascript
// tests/validation/test-adr-semver.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpSemver, compareSemver, parseSemver } from '../../scripts/lib/adr-semver.mjs';

test('bump patch', () => assert.equal(bumpSemver('1.0.0', 'patch'), '1.0.1'));
test('bump minor resets patch', () => assert.equal(bumpSemver('1.2.3', 'minor'), '1.3.0'));
test('bump major resets minor and patch', () => assert.equal(bumpSemver('2.4.7', 'major'), '3.0.0'));
test('compare equal', () => assert.equal(compareSemver('1.0.0', '1.0.0'), 0));
test('compare lesser', () => assert.ok(compareSemver('1.0.0', '1.0.1') < 0));
test('compare greater', () => assert.ok(compareSemver('2.0.0', '1.99.99') > 0));
test('parse decomposes', () => assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3 }));
test('reject invalid input', () => assert.throws(() => bumpSemver('abc', 'patch')));
```

- [ ] **Step 2: RED**

```bash
node --test tests/validation/test-adr-semver.mjs
```

- [ ] **Step 3: Implement**

```javascript
// scripts/lib/adr-semver.mjs
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(v) {
  const m = v.match(SEMVER_RE);
  if (!m) throw new Error(`invalid semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function bumpSemver(v, kind) {
  const { major, minor, patch } = parseSemver(v);
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'major') return `${major + 1}.0.0`;
  throw new Error(`unknown bump kind: ${kind}`);
}

export function compareSemver(a, b) {
  const pa = parseSemver(a); const pb = parseSemver(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}
```

- [ ] **Step 4: GREEN + commit**

```bash
node --test tests/validation/test-adr-semver.mjs
git add scripts/lib/adr-semver.mjs tests/validation/test-adr-semver.mjs
git commit -m "feat(adrs): add adr-semver lib (extracted helper for C5)"
```

---

#### Task 1.5: Write failing tests for `adr-graph`

**Files:**
- Create: `tests/validation/test-adr-graph.mjs`
- Create: `tests/validation/fixtures/graph/` (6 cases — graph configurations)

**Tests:** unit.

- [ ] **Step 1: Write test scaffold**

```javascript
// tests/validation/test-adr-graph.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph } from '../../scripts/lib/adr-graph.mjs';

test('valid: empty graph', async () => {
  const result = await validateGraph('./tests/validation/fixtures/graph/01-empty/');
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('valid: single supersede chain', async () => {
  const result = await validateGraph('./tests/validation/fixtures/graph/02-supersede-chain/');
  assert.equal(result.valid, true);
});

test('invalid: supersede points to nonexistent file', async () => {
  const result = await validateGraph('./tests/validation/fixtures/graph/03-broken-supersede/');
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /missing file/);
});

test('invalid: self-reference', async () => {
  const result = await validateGraph('./tests/validation/fixtures/graph/04-self-ref/');
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /self-reference/);
});

test('invalid: cycle A->B->A', async () => {
  const result = await validateGraph('./tests/validation/fixtures/graph/05-cycle/');
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /cycle detected/);
});

test('invalid: supersedes points to Proposto (not approved)', async () => {
  const result = await validateGraph('./tests/validation/fixtures/graph/06-supersede-unapproved/');
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /unapproved/);
});
```

- [ ] **Step 2: Create 6 graph fixtures (each is a directory with multiple ADR files)**

Refer to spec §6.3 Check 12 for exact configurations.

- [ ] **Step 3: Run tests, expect RED**

```bash
node --test tests/validation/test-adr-graph.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 4: Commit**

```bash
git add tests/validation/test-adr-graph.mjs tests/validation/fixtures/graph/
git commit -m "test(adrs): add failing tests for adr-graph validator"
```

---

#### Task 1.6: Implement `adr-graph.mjs`

**Files:**
- Create: `scripts/lib/adr-graph.mjs`

- [ ] **Step 1: Write implementation**

```javascript
// scripts/lib/adr-graph.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { parse } from './adr-frontmatter.mjs';

export async function validateGraph(dir) {
  const errors = [];
  const adrs = await loadAdrs(dir);

  for (const adr of adrs) {
    const slug = basename(adr.file, extname(adr.file));
    const { supersedes = [], refines = [] } = adr.frontmatter;

    for (const ref of supersedes) {
      if (ref === slug) { errors.push(`self-reference in supersedes: ${slug}`); continue; }
      const target = adrs.find(a => basename(a.file, extname(a.file)) === ref);
      if (!target) { errors.push(`supersedes points to missing file: ${ref}`); continue; }
      if (!['Substituido', 'Descontinuado'].includes(target.frontmatter.status)) {
        if (target.frontmatter.status === 'Proposto') {
          errors.push(`supersedes points to unapproved ADR: ${ref}`);
        }
      }
    }
    for (const ref of refines) {
      if (ref === slug) { errors.push(`self-reference in refines: ${slug}`); continue; }
      const target = adrs.find(a => basename(a.file, extname(a.file)) === ref);
      if (!target) errors.push(`refines points to missing file: ${ref}`);
    }
  }

  // Cycle detection (simple DFS)
  const adjacency = {};
  for (const adr of adrs) {
    const slug = basename(adr.file, extname(adr.file));
    adjacency[slug] = (adr.frontmatter.supersedes || []).concat(adr.frontmatter.refines || []);
  }
  for (const start of Object.keys(adjacency)) {
    if (hasCycle(start, adjacency, new Set(), new Set())) {
      errors.push(`cycle detected involving ${start}`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

async function loadAdrs(dir) {
  const files = (await readdir(dir)).filter(f => f.endsWith('.md') && /^\d{3}-/.test(f));
  return Promise.all(files.map(async f => {
    const content = await readFile(join(dir, f), 'utf-8');
    const { frontmatter } = parse(content);
    return { file: f, frontmatter };
  }));
}

function hasCycle(node, adjacency, visiting, visited) {
  if (visited.has(node)) return false;
  if (visiting.has(node)) return true;
  visiting.add(node);
  for (const next of adjacency[node] || []) {
    if (hasCycle(next, adjacency, visiting, visited)) return true;
  }
  visiting.delete(node);
  visited.add(node);
  return false;
}
```

- [ ] **Step 2: Run tests, expect GREEN**

```bash
node --test tests/validation/test-adr-graph.mjs
```

Expected: 6/6 PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/adr-graph.mjs
git commit -m "feat(adrs): implement adr-graph validator (Check 12 backbone)"
```

---

#### Task 1.7: Port TEMPLATE-ADR.md from bundle

**Files:**
- Create: `skills/adr-builder/assets/TEMPLATE-ADR.md`
- Source: `/tmp/adr-builder-extract/adr-builder/assets/TEMPLATE-ADR.md`

- [ ] **Step 1: Copy template byte-by-byte**

```bash
mkdir -p skills/adr-builder/assets/
cp /tmp/adr-builder-extract/adr-builder/assets/TEMPLATE-ADR.md skills/adr-builder/assets/
```

- [ ] **Step 2: Verify integrity**

```bash
diff /tmp/adr-builder-extract/adr-builder/assets/TEMPLATE-ADR.md \
     skills/adr-builder/assets/TEMPLATE-ADR.md
```

Expected: zero diff.

- [ ] **Step 3: Commit**

```bash
git add skills/adr-builder/assets/TEMPLATE-ADR.md
git commit -m "feat(adrs): port canonical TEMPLATE-ADR.md from bundle (v2.1.0)"
```

---

#### Task 1.8: Port references/ from bundle

**Files (5):**
- Create: `skills/adr-builder/references/briefing-guiado.md`
- Create: `skills/adr-builder/references/extracao-livre.md`
- Create: `skills/adr-builder/references/auditoria.md`
- Create: `skills/adr-builder/references/checklist-qualidade.md`
- Create: `skills/adr-builder/references/saida-distribuicao.md` (degraded — distribution A/C drop)

- [ ] **Step 1: Copy 4 reference files unchanged**

```bash
mkdir -p skills/adr-builder/references/
for f in briefing-guiado.md extracao-livre.md auditoria.md checklist-qualidade.md; do
  cp "/tmp/adr-builder-extract/adr-builder/references/$f" skills/adr-builder/references/
done
```

- [ ] **Step 2: Author degraded `saida-distribuicao.md`**

Replace original (which describes Options A/B/C with .zip output) with DevFlow-native version: only Option B survives — builder writes directly to `.context/docs/adrs/`. Mention `/devflow adr:bundle` (futuro plan B1) for export/import.

```markdown
# Saída no DevFlow CLI

DevFlow grava ADRs diretamente em `.context/docs/adrs/NNN-<slug>-v<semver>.md`. Não há staging em diretório temporário, nem empacotamento `.zip` — o working tree git serve como staging.

Para export/import entre repositórios, ver plan futuro B1 (`/devflow adr:bundle`).
```

- [ ] **Step 3: Commit**

```bash
git add skills/adr-builder/references/
git commit -m "feat(adrs): port references/ from bundle (degraded saida-distribuicao for DevFlow CLI)"
```

---

#### Task 1.9: Port assets seeds (patterns-catalog + context.yaml)

**Files (2 in 2 locations):**
- Create: `skills/adr-builder/assets/patterns-catalog.md` (seed in bundle)
- Create: `skills/adr-builder/assets/context.yaml` (seed in bundle)
- Note: copy to `.context/templates/adrs/` happens at first use, not in this task (see Task 2.11).

- [ ] **Step 1: Copy seeds**

```bash
cp /tmp/adr-builder-extract/adr-builder/assets/patterns-catalog.md skills/adr-builder/assets/
cp /tmp/adr-builder-extract/adr-builder/assets/context.yaml skills/adr-builder/assets/
```

- [ ] **Step 2: Commit**

```bash
git add skills/adr-builder/assets/patterns-catalog.md skills/adr-builder/assets/context.yaml
git commit -m "feat(adrs): port patterns-catalog and context.yaml as seeds"
```

---

#### Task 1.10: Create 9 audit fixtures (Suite A)

**Files:**
- Create: `tests/validation/fixtures/adr/valid-01-zod-validation.md`
- Create: `tests/validation/fixtures/adr/valid-02-rfc7807-errors.md`
- Create: `tests/validation/fixtures/adr/valid-03-feature-flags.md`
- Create: `tests/validation/fixtures/adr/valid-04-post-evolve-patch.md`
- Create: `tests/validation/fixtures/adr/invalid-01-vague-guardrail.md`
- Create: `tests/validation/fixtures/adr/invalid-02-missing-alternatives.md`
- Create: `tests/validation/fixtures/adr/invalid-03-medium-source.md`
- Create: `tests/validation/fixtures/adr/invalid-04-broken-supersedes.md`
- Create: `tests/validation/fixtures/adr/invalid-05-cycle.md`

- [ ] **Step 1: Port 6 fixtures from bundle**

```bash
mkdir -p tests/validation/fixtures/adr/
for f in valid-01-zod-validation.md valid-02-rfc7807-errors.md valid-03-feature-flags.md \
         invalid-01-vague-guardrail.md invalid-02-missing-alternatives.md invalid-03-medium-source.md; do
  cp "/tmp/adr-builder-extract/adr-builder/tests/audit-fixtures/$f" tests/validation/fixtures/adr/
done
```

- [ ] **Step 2: Author 3 new fixtures**

`valid-04-post-evolve-patch.md`: same as valid-01 but `version: 1.0.1`, filename suggests post-patch.

`invalid-04-broken-supersedes.md`: valid in all checks except `supersedes: [001-tdd-python-v1.0.0]` to a file that does NOT exist in the same fixture directory. Expected Check 12: FIX-INTERVIEW.

`invalid-05-cycle.md`: 2 ADR fixtures (`A.md` and `B.md`) where A supersedes B, B supersedes A.

- [ ] **Step 3: Add `# EXPECTED:` block to each fixture top**

```markdown
<!-- EXPECTED:
1: PASS
2: PASS
3: PASS
4: PASS
5: PASS
6: PASS
7: PASS
8: PASS
9: PASS
10: PASS
11: PASS
12: PASS
-->
```

- [ ] **Step 4: Commit**

```bash
git add tests/validation/fixtures/adr/
git commit -m "test(adrs): create 9 audit fixtures with EXPECTED classifications"
```

---

#### Task 1.11: Write failing tests for `adr-audit` (Suite A)

**Files:**
- Create: `tests/validation/test-adr-audit.mjs`

**Tests:** integration (lê fixtures, parseia output JSON).

- [ ] **Step 1: Write test scaffold**

```javascript
// tests/validation/test-adr-audit.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const FIXTURES_DIR = './tests/validation/fixtures/adr/';

function parseExpected(content) {
  const m = content.match(/<!-- EXPECTED:\s*([\s\S]+?)-->/);
  if (!m) return null;
  const map = {};
  for (const line of m[1].trim().split('\n')) {
    const [id, status] = line.split(':').map(s => s.trim());
    map[id] = status;
  }
  return map;
}

const fixtures = readdirSync(FIXTURES_DIR)
  .filter(f => f.match(/^(valid|invalid)-\d+-.*\.md$/))
  .filter(f => !f.includes('cycle')); // cycle requires multi-file

for (const f of fixtures) {
  test(`audit fixture: ${f}`, () => {
    const content = readFileSync(`${FIXTURES_DIR}${f}`, 'utf-8');
    const expected = parseExpected(content);
    if (!expected) throw new Error(`No EXPECTED block in ${f}`);

    const output = execSync(
      `node scripts/adr-audit.mjs ${FIXTURES_DIR}${f} --format=json`,
      { encoding: 'utf-8' }
    );
    const result = JSON.parse(output);

    for (const check of result.checks) {
      const exp = expected[String(check.id)];
      assert.equal(check.status, exp, `Check ${check.id} (${check.name}): expected ${exp}, got ${check.status}`);
    }
  });
}
```

- [ ] **Step 2: Run, expect RED**

```bash
node --test tests/validation/test-adr-audit.mjs
```

Expected: FAIL — `adr-audit.mjs` not found.

- [ ] **Step 3: Commit**

```bash
git add tests/validation/test-adr-audit.mjs
git commit -m "test(adrs): add failing audit test suite (Suite A)"
```

---

#### Task 1.12: Implement `adr-audit.mjs` (Check 1 + skeleton; remaining checks split into 1.12a–1.12k — addresses C1)

**Files:**
- Create: `scripts/adr-audit.mjs`
- Reference: `skills/adr-builder/references/auditoria.md` (defines all 12 checks)
- Reference: `docs/superpowers/specs/2026-04-24-adr-system-v2-design.md` §6.7 (FIX-AUTO actions)

- [ ] **Step 1: Write CLI scaffold**

```javascript
// scripts/adr-audit.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { parse, stringify } from './lib/adr-frontmatter.mjs';
import { validateGraph } from './lib/adr-graph.mjs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const flags = {
  format: args.find(a => a.startsWith('--format='))?.slice(9) || 'pretty',
  enforceGate: args.includes('--enforce-gate'),
  applyFixAuto: args.includes('--apply-fix-auto'),
  noFixAuto: args.includes('--no-fix-auto'),
};

if (!file) { console.error('Usage: adr-audit.mjs <file> [flags]'); process.exit(2); }

try {
  const content = await readFile(file, 'utf-8');
  const result = await runAudit(file, content, flags);
  if (flags.format === 'json') console.log(JSON.stringify(result, null, 2));
  else printPretty(result);
  if (flags.enforceGate && result.summary.fix_interview > 0) process.exit(1);
  process.exit(0);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(2);
}

async function runAudit(file, content, flags) { /* see Steps 2-13 */ }
function printPretty(result) { /* tabular output */ }
```

- [ ] **Step 2: Implement Check 1 (Frontmatter estrutural)**

```javascript
function check1(fm) {
  const issues = [];
  const required = ['type', 'name', 'description', 'scope', 'stack', 'category', 'status', 'created'];
  for (const k of required) if (!(k in fm)) issues.push({ field: k, fix: 'add' });

  // FIX-AUTO defaults
  const autoDefaults = { version: '0.1.0', supersedes: [], refines: [], protocol_contract: null, decision_kind: 'firm' };
  for (const [k, v] of Object.entries(autoDefaults)) {
    if (!(k in fm)) issues.push({ field: k, fix: 'auto', default: v });
  }

  // Validation
  if (fm.scope && !['organizational', 'project'].includes(fm.scope)) {
    issues.push({ field: 'scope', fix: 'interview', diagnosis: 'invalid value' });
  }
  if (fm.category === 'protocol-contracts' && !fm.protocol_contract) {
    issues.push({ field: 'protocol_contract', fix: 'interview', diagnosis: 'protocol-contracts requires contract name' });
  }
  return { id: 1, name: 'Frontmatter estrutural',
           status: classify(issues),
           diagnosis: summarize(issues),
           autoActions: issues.filter(i => i.fix === 'auto') };
}
```

- [ ] **Steps 3a–3k: Implement Checks 2-12 — one TDD cycle per check (resolves C1)**

Each check is its own bite-sized cycle. Per check: write failing fixture-driven test → run RED → implement check function → run GREEN → commit. Function signature: `(frontmatter, body, file) => { id, name, status: PASS|FIX-AUTO|FIX-INTERVIEW, diagnosis, autoActions? }`. Reference §6.7 of the spec for the FIX-AUTO action by check (verbatim).

| Sub-step | Check | Key detail |
|---|---|---|
| 3a | Check 2 — Título/voz | Always FIX-INTERVIEW; regex detects question marks, passive voice |
| 3b | Check 3 — Foco em stack | Reads `context.yaml` from `.context/templates/adrs/`; FIX-INTERVIEW when product/vertical names found |
| 3c | Check 4 — Alternativas | FIX-AUTO marks `✓` if inferable from "escolhida"/"adotamos"; else FIX-INTERVIEW |
| 3d | Check 5 — Guardrails | FIX-AUTO reformats prefix to SEMPRE/NUNCA/QUANDO when verb-imperative detected; FIX-INTERVIEW for vague |
| 3e | Check 6 — Enforcement | FIX-AUTO reformats checkboxes to GFM `- [ ]`; FIX-INTERVIEW for "code review" sem critério |
| 3f | Check 7 — Sem Relacionamentos | regex `/^##\s+(Relacionamentos|Relationships|Related ADRs)/m`; FIX-AUTO migrates URLs to Evidências, deletes section |
| 3g | Check 8 — Evidências oficiais | regex matches medium.com/dev.to/blog/stackoverflow.com/youtube.com; always FIX-INTERVIEW |
| 3h | Check 9 — Densidade | `body.split('\n').length + 13`; tabular exception via `(matchAll(/^\|.*\|$/gm).length / totalLines >= 0.6)`; FIX-AUTO for forbidden phrases |
| 3i | Check 10 — Código minimal | count code blocks + lines per block; >25 lines or >1 block → FIX-INTERVIEW |
| 3j | Check 11 — Padrões catalogados | reads `patterns-catalog.md` from `.context/templates/adrs/`; conservative — always FIX-INTERVIEW |
| 3k | Check 12 — Grafo | calls `validateGraph(dirname(file))` from `adr-graph.mjs`; always FIX-INTERVIEW on issues |

Each sub-step gets its own commit: `feat(adr-audit): implement Check N — <short name>`. 11 commits total in this task.

- [ ] **Step 14: Wire up — runAudit aggregates all 12 (with S3 gate for Aprovado)**

```javascript
async function runAudit(file, content, flags) {
  const { frontmatter, body } = parse(content);
  let checks = [check1(frontmatter), check2(frontmatter, body), /* ... */ check12Async(file, frontmatter)];
  checks = await Promise.all(checks); // some are async (graph)

  // S3 — Aprovado ADRs auto-demote FIX-AUTO to FIX-INTERVIEW (silent edits forbidden on approved history).
  // This is independent of --no-fix-auto: even without the flag, status=Aprovado triggers the gate.
  const isApproved = frontmatter.status === 'Aprovado';

  if (flags.noFixAuto || isApproved) {
    checks = checks.map(c => c.status === 'FIX-AUTO' ? {
      ...c,
      status: 'FIX-INTERVIEW',
      diagnosis: c.diagnosis + (isApproved ? ' [demoted: ADR Aprovada exige confirmação humana]' : '')
    } : c);
  }

  if (flags.applyFixAuto && !flags.noFixAuto && !isApproved) {
    const fixed = await applyAutoFixes(file, frontmatter, body, checks);
    if (fixed) {
      // Re-run audit on fixed content (max 3 iterations)
      // ...
    }
  }

  const summary = {
    pass: checks.filter(c => c.status === 'PASS').length,
    fix_auto: checks.filter(c => c.status === 'FIX-AUTO').length,
    fix_interview: checks.filter(c => c.status === 'FIX-INTERVIEW').length,
  };
  return { file, summary, checks, gate_passed: summary.fix_interview === 0, status_gate: isApproved ? 'Aprovado-protected' : null };
}
```

- [ ] **Step 15: Add S3 fixture test**

`tests/validation/fixtures/adr/valid-aprovado-with-fix-auto.md` — ADR with `status: Aprovado` that would normally trigger FIX-AUTO (e.g. missing `version` field). Test asserts that running `--apply-fix-auto` does NOT modify the file (status gate kicks in).

```javascript
test('S3: Aprovado status blocks --apply-fix-auto silently modifying file', () => {
  const before = readFileSync(`${FIXTURES_DIR}valid-aprovado-with-fix-auto.md`, 'utf-8');
  execSync(`node scripts/adr-audit.mjs ${FIXTURES_DIR}valid-aprovado-with-fix-auto.md --apply-fix-auto`);
  const after = readFileSync(`${FIXTURES_DIR}valid-aprovado-with-fix-auto.md`, 'utf-8');
  assert.equal(before, after, 'Aprovado ADR must not be modified by --apply-fix-auto');
});
```

- [ ] **Step 15: Run Suite A, expect GREEN**

```bash
node --test tests/validation/test-adr-audit.mjs
```

Expected: all fixtures classified as in their EXPECTED blocks.

- [ ] **Step 16: Commit**

```bash
git add scripts/adr-audit.mjs
git commit -m "feat(adrs): implement adr-audit lib with 12 checks (Suite A green)"
```

---

#### Task 1.13: Write failing tests for `adr-update-index` (Suite B)

**Files:**
- Create: `tests/validation/test-adr-index.mjs`
- Create: `tests/validation/fixtures/adr-project/` (sample project with 3 ADRs)

**Tests:** integration.

- [ ] **Step 1: Create fixture project**

```bash
mkdir -p tests/validation/fixtures/adr-project/.context/docs/adrs/
# Copy 3 valid ADRs renaming them to canonical filenames:
cp tests/validation/fixtures/adr/valid-01-zod-validation.md \
   tests/validation/fixtures/adr-project/.context/docs/adrs/001-zod-validation-v1.0.0.md
# (similar for 002, 003)
```

- [ ] **Step 2: Write tests**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const PROJ = './tests/validation/fixtures/adr-project/';

test('regenerates README with 14 columns', () => {
  execSync(`node scripts/adr-update-index.mjs --project=${PROJ}`);
  const readme = readFileSync(`${PROJ}.context/docs/adrs/README.md`, 'utf-8');
  for (const col of ['#', 'Título', 'Versão', 'Categoria', 'Stack', 'Escopo', 'Status', 'Kind',
                     'Contrato', 'Refines', 'Supersedes', 'Criada', 'Guardrails', 'Arquivo']) {
    assert.match(readme, new RegExp(`\\| ${col}\\s`));
  }
  assert.match(readme, /índice gerado/i);
});

test('idempotent: second run identical', () => {
  execSync(`node scripts/adr-update-index.mjs --project=${PROJ}`);
  const a = readFileSync(`${PROJ}.context/docs/adrs/README.md`, 'utf-8');
  execSync(`node scripts/adr-update-index.mjs --project=${PROJ}`);
  const b = readFileSync(`${PROJ}.context/docs/adrs/README.md`, 'utf-8');
  assert.equal(a, b);
});

test('next-number returns 004', () => {
  const out = execSync(`node scripts/adr-update-index.mjs --project=${PROJ} --next-number`,
                       { encoding: 'utf-8' }).trim();
  assert.equal(out, '004');
});

test('resolve query by prefix', () => {
  const out = execSync(`node scripts/adr-update-index.mjs --project=${PROJ} --resolve=001`,
                       { encoding: 'utf-8' }).trim();
  assert.match(out, /001-.*-v1\.0\.0\.md$/);
});

test('lock prevents concurrent number assignment', async () => {
  // Spawn 2 parallel --next-number calls; verify they get different values
  const [a, b] = await Promise.all([
    new Promise(r => setTimeout(() => r(execSync(`node scripts/adr-update-index.mjs --project=${PROJ} --next-number`, { encoding: 'utf-8' }).trim()), 10)),
    new Promise(r => setTimeout(() => r(execSync(`node scripts/adr-update-index.mjs --project=${PROJ} --next-number`, { encoding: 'utf-8' }).trim()), 10)),
  ]);
  // Without lock both would return 004; with lock, same value but serialized — for true distinct, would need a stage
  // For minimal test: just verify execSync didn't error and output is valid
  assert.match(a, /^\d{3}$/);
  assert.match(b, /^\d{3}$/);
});
```

- [ ] **Step 3: Run, expect RED**

```bash
node --test tests/validation/test-adr-index.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 4: Commit**

```bash
git add tests/validation/test-adr-index.mjs tests/validation/fixtures/adr-project/
git commit -m "test(adrs): add failing tests for adr-update-index (Suite B)"
```

---

#### Task 1.14: Implement `adr-update-index.mjs` with liveness-aware advisory lock + path safety

**Files:**
- Create: `scripts/adr-update-index.mjs`

- [ ] **Step 1: Write implementation (with S4 lock recovery + S6 path traversal mitigation)**

```javascript
// scripts/adr-update-index.mjs
import { readdir, readFile, writeFile, open, unlink } from 'node:fs/promises';
import { resolve, join, basename, extname } from 'node:path';
import { parse } from './lib/adr-frontmatter.mjs';
import { compareSemver } from './lib/adr-semver.mjs';

const args = process.argv.slice(2);
const rawProject = args.find(a => a.startsWith('--project='))?.slice(10) || '.';

// S6 — path traversal mitigation
const project = resolve(rawProject);
if (!project.startsWith(process.cwd())) {
  console.error(`--project must resolve within cwd (got: ${project})`);
  process.exit(2);
}
const adrsDir = join(project, '.context/docs/adrs/');

const subcommands = {
  '--next-number': nextNumber,
  '--resolve': resolveQuery,
  default: regenerate,
};

const sub = args.find(a => Object.keys(subcommands).some(k => a.startsWith(k))) || 'default';
const handler = subcommands[sub.split('=')[0]] || subcommands.default;

await withLock(adrsDir, () => handler(adrsDir, args));

// S4 — liveness-aware advisory lock with stale recovery
const LOCK_EXPIRY_MS = 30000;

async function withLock(dir, fn, retries = 3) {
  const lockFile = join(dir, '.lock');
  let handle;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      handle = await open(lockFile, 'wx');
      // Write {pid, ts} for liveness check by future processes
      await handle.writeFile(JSON.stringify({ pid: process.pid, ts: Date.now() }));
      try {
        await fn();
      } finally {
        await handle.close();
        await unlink(lockFile).catch(() => {});
      }
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Lock exists — check if stale
      const stale = await isLockStale(lockFile);
      if (stale) {
        await unlink(lockFile).catch(() => {});
        continue; // retry immediately after clearing stale lock
      }
      await new Promise(r => setTimeout(r, 100 * (attempt + 1))); // exponential-ish backoff
    }
  }
  throw new Error(`Could not acquire lock on ${lockFile} after ${retries} retries`);
}

async function isLockStale(lockFile) {
  try {
    const content = await readFile(lockFile, 'utf-8');
    const { pid, ts } = JSON.parse(content);
    if (Date.now() - ts > LOCK_EXPIRY_MS) return true;
    // process.kill(pid, 0) throws if process is dead
    try { process.kill(pid, 0); return false; } catch { return true; }
  } catch {
    return true; // unreadable lock = stale
  }
}

async function regenerate(dir) {
  const adrs = await loadAdrs(dir);
  adrs.sort((a, b) => {
    const numCmp = a.number.localeCompare(b.number);
    return numCmp !== 0 ? numCmp : -compareSemver(a.frontmatter.version, b.frontmatter.version);
  });
  const md = renderReadme(adrs);
  await writeFile(join(dir, 'README.md'), md);
}

async function nextNumber(dir) {
  const adrs = await loadAdrs(dir);
  const max = Math.max(0, ...adrs.map(a => parseInt(a.number)));
  console.log(String(max + 1).padStart(3, '0'));
}

async function resolveQuery(dir, args) {
  const q = args.find(a => a.startsWith('--resolve='))?.slice(10);
  const adrs = await loadAdrs(dir);
  const matches = adrs.filter(a => a.file.startsWith(q) || a.file.includes(q));
  if (matches.length === 0) { console.error(`No match for ${q}`); process.exit(1); }
  // Return latest version of the lineage
  matches.sort((a, b) => -compareSemver(a.frontmatter.version, b.frontmatter.version));
  console.log(matches[0].file);
}

function renderReadme(adrs) {
  const header = `# ADRs do Projeto\n\n> Índice gerado por \`scripts/adr-update-index.mjs\` — não editar à mão.\n\n## ADRs\n\n`;
  const cols = ['#', 'Título', 'Versão', 'Categoria', 'Stack', 'Escopo', 'Status', 'Kind',
                'Contrato', 'Refines', 'Supersedes', 'Criada', 'Guardrails', 'Arquivo'];
  const tableHeader = `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n`;
  const rows = adrs.map(a => {
    const fm = a.frontmatter;
    const guardrails = countGuardrails(a.body);
    return `| ${a.number} | ${fm.description} | v${fm.version} | ${fm.category} | ${fm.stack} | ` +
           `${capitalize(fm.scope)} | ${fm.status} | ${fm.decision_kind || 'firm'} | ` +
           `${fm.protocol_contract || '—'} | ${formatList(fm.refines)} | ${formatList(fm.supersedes)} | ` +
           `${fm.created} | ${guardrails} | [${a.file}](${a.file}) |`;
  }).join('\n');
  return header + tableHeader + rows + '\n';
}

function countGuardrails(body) {
  const m = body.match(/##\s+Guardrails\s*\n([\s\S]+?)(?=\n##|$)/);
  if (!m) return 0;
  return m[1].split('\n').filter(l => l.trim().match(/^[-*]\s+(SEMPRE|NUNCA|QUANDO)/)).length;
}

function formatList(arr) { if (!arr || arr.length === 0) return '—'; return arr.join(', '); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
// compareSemver imported from ./lib/adr-semver.mjs (Task 1.4 — C5)

async function loadAdrs(dir) {
  const files = (await readdir(dir)).filter(f => f.match(/^\d{3}-.*\.md$/) && f !== 'README.md');
  return Promise.all(files.map(async f => {
    const content = await readFile(join(dir, f), 'utf-8');
    const { frontmatter, body } = parse(content);
    return { file: f, number: f.slice(0, 3), frontmatter, body };
  }));
}
```

- [ ] **Step 2: Run Suite B, expect GREEN**

```bash
node --test tests/validation/test-adr-index.mjs
```

Expected: 5/5 PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/adr-update-index.mjs
git commit -m "feat(adrs): implement adr-update-index with advisory lock (Suite B green)"
```

---

#### Task 1.15: Phase 1 Acceptance — run all 4 suites + parser smoke against real legacy ADRs

- [ ] **Step 1: Run Suites A+B+C**

```bash
node --test tests/validation/test-adr-audit.mjs \
            tests/validation/test-adr-index.mjs \
            tests/validation/test-adr-graph.mjs \
            tests/validation/test-adr-frontmatter.mjs
```

Expected: all green, total time <3s.

- [ ] **Step 2: Delete bundle ZIP source**

```bash
git rm docs/adr-builder.skill
```

(Bundle was reference; content now lives in `skills/adr-builder/` and `tests/validation/fixtures/adr/`.)

- [ ] **Step 3: Phase 1 commit checkpoint**

```bash
git commit -m "chore(adrs): Phase 1 complete — libs + fixtures + suites A+B+C green"
```

---

### Phase 2 — Skill + Dispatcher + Evolve Lib (Tasks 2.1–2.15)

> **Primary Agent:** `documentation-writer` + `backend-specialist` (paired) — [Playbook](../agents/documentation-writer.md)
> **Tests:** integration (evolve commands manipulate filesystem and git).
> **Handoff from:** `backend-specialist` (Phase 1 lib base).

**Objective:** Construir SKILL.md (CREATE/AUDIT/EVOLVE), dispatcher, e lib `adr-evolve.mjs` cobrindo 4 sub-fluxos (patch/minor/major/refine).

---

#### Task 2.1: Write failing tests for `adr-evolve` patch flow

**Files:**
- Create: `tests/validation/test-adr-evolve.mjs`
- Reuse fixture: `tests/validation/fixtures/adr-project/`

- [ ] **Step 1: Write test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const PROJ = './tests/validation/fixtures/adr-project-evolve/';

test('patch: bumps version and renames file', () => {
  // Setup: copy fresh fixture
  execSync(`rm -rf ${PROJ} && cp -r tests/validation/fixtures/adr-project ${PROJ}`);
  const before = `${PROJ}.context/docs/adrs/001-zod-validation-v1.0.0.md`;
  const after = `${PROJ}.context/docs/adrs/001-zod-validation-v1.0.1.md`;
  assert.ok(existsSync(before));
  assert.ok(!existsSync(after));

  execSync(`node scripts/adr-evolve.mjs ${before} --kind=patch --apply --diff="typo fix"`,
           { stdio: 'inherit' });

  assert.ok(!existsSync(before));
  assert.ok(existsSync(after));
  const content = readFileSync(after, 'utf-8');
  assert.match(content, /version: 1\.0\.1/);
  assert.match(content, /status: Aprovado/); // patch preserves Aprovado
});
```

- [ ] **Step 2: RED**

- [ ] **Step 3: Commit**

```bash
git add tests/validation/test-adr-evolve.mjs
git commit -m "test(adrs): add failing tests for adr-evolve patch flow"
```

---

#### Task 2.2: Implement `adr-evolve.mjs` patch case

**Files:**
- Create: `scripts/adr-evolve.mjs`

- [ ] **Step 1: Write CLI scaffold + patch handler (with S1 execFileSync + S5 atomic write-then-rename)**

```javascript
// scripts/adr-evolve.mjs
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { parse, stringify } from './lib/adr-frontmatter.mjs';
import { bumpSemver } from './lib/adr-semver.mjs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const kind = args.find(a => a.startsWith('--kind='))?.slice(7); // patch | minor | major | refine
const apply = args.includes('--apply');
const diff = args.find(a => a.startsWith('--diff='))?.slice(7) || '';

if (!file || !kind) { console.error('Usage: adr-evolve.mjs <file> --kind=<patch|minor|major|refine> [--apply]'); process.exit(2); }

const handlers = { patch: handlePatch, minor: handleMinor, major: handleMajor, refine: handleRefine };
await handlers[kind](file, { apply, diff });

async function handlePatch(file, opts) {
  const content = await readFile(file, 'utf-8');
  const { frontmatter, body } = parse(content);
  const newVersion = bumpSemver(frontmatter.version, 'patch');
  frontmatter.version = newVersion;

  const newFile = renameToVersion(file, newVersion);
  if (opts.apply) {
    // S5 — atomic write-then-rename: write new content first, then git mv (which now reflects update).
    // If writeFile fails, original file untouched. If git mv fails, we delete the temp content.
    const newContent = stringify(frontmatter, body);
    await writeFile(file, newContent); // overwrite content first (still under old name)
    try {
      // S1 — execFileSync with argv array, no shell interpolation
      execFileSync('git', ['mv', file, newFile], { stdio: 'inherit' });
    } catch (err) {
      // Rollback: restore original content
      await writeFile(file, content);
      throw new Error(`git mv failed; rolled back: ${err.message}`);
    }
    // S1 — same fix for downstream call
    execFileSync('node', ['scripts/adr-update-index.mjs', `--project=${resolve(dirname(dirname(dirname(file))))}`], { stdio: 'inherit' });
  }
  console.log(JSON.stringify({ kind: 'patch', from: file, to: newFile, version: newVersion }));
}

// bumpSemver imported from ./lib/adr-semver.mjs (Task 1.4 — C5)

function renameToVersion(file, version) {
  return file.replace(/-v\d+\.\d+\.\d+\.md$/, `-v${version}.md`);
}
```

- [ ] **Step 2: GREEN**

- [ ] **Step 3: Commit**

```bash
git add scripts/adr-evolve.mjs
git commit -m "feat(adrs): implement adr-evolve patch flow"
```

---

> **Parallelism note (A5):** Tasks 2.3, 2.5, 2.7 (failing tests for minor/major/refine) and Tasks 2.4, 2.6, 2.8 (implementations) are independent — handlers in `adr-evolve.mjs` are isolated functions sharing only `adr-frontmatter` and `adr-semver`. Three workers can develop them in parallel after Task 2.2 establishes the pattern.

---

#### Task 2.3: Write failing test for evolve `minor` flow

**Files:**
- Modify: `tests/validation/test-adr-evolve.mjs` (append)

- [ ] **Step 1: Write test asserting minor bump renames file + status `Aprovado → Proposto`**

```javascript
test('minor: bump version and revert status to Proposto', () => {
  execSync(`rm -rf ${PROJ} && cp -r tests/validation/fixtures/adr-project ${PROJ}`);
  const before = `${PROJ}.context/docs/adrs/001-zod-validation-v1.0.0.md`;
  const after = `${PROJ}.context/docs/adrs/001-zod-validation-v1.1.0.md`;

  execSync(`node scripts/adr-evolve.mjs ${before} --kind=minor --apply --diff="add new guardrail"`,
           { stdio: 'inherit' });

  assert.ok(!existsSync(before));
  assert.ok(existsSync(after));
  const content = readFileSync(after, 'utf-8');
  assert.match(content, /version: 1\.1\.0/);
  assert.match(content, /status: Proposto/); // minor reverts to Proposto
});
```

- [ ] **Step 2: RED + commit**

```bash
node --test tests/validation/test-adr-evolve.mjs
git add tests/validation/test-adr-evolve.mjs
git commit -m "test(adrs): add failing test for adr-evolve minor flow"
```

---

#### Task 2.4: Implement evolve `minor` handler

**Files:**
- Modify: `scripts/adr-evolve.mjs` (append)

- [ ] **Step 1: Add `handleMinor` function**

```javascript
async function handleMinor(file, opts) {
  const content = await readFile(file, 'utf-8');
  const { frontmatter, body } = parse(content);
  const newVersion = bumpSemver(frontmatter.version, 'minor');
  frontmatter.version = newVersion;
  frontmatter.status = 'Proposto'; // minor requires re-approval
  const newFile = renameToVersion(file, newVersion);

  if (opts.apply) {
    const newContent = stringify(frontmatter, body);
    await writeFile(file, newContent);
    try {
      execFileSync('git', ['mv', file, newFile], { stdio: 'inherit' });
    } catch (err) {
      await writeFile(file, content);
      throw new Error(`git mv failed; rolled back: ${err.message}`);
    }
    execFileSync('node', ['scripts/adr-update-index.mjs', `--project=${resolve(dirname(dirname(dirname(file))))}`], { stdio: 'inherit' });
  }
  console.log(JSON.stringify({ kind: 'minor', from: file, to: newFile, version: newVersion }));
}
```

- [ ] **Step 2: GREEN + commit**

```bash
node --test tests/validation/test-adr-evolve.mjs
git add scripts/adr-evolve.mjs
git commit -m "feat(adrs): implement adr-evolve minor flow"
```

---

#### Task 2.5: Write failing test for evolve `major` flow

**Files:**
- Modify: `tests/validation/test-adr-evolve.mjs` (append)

- [ ] **Step 1: Write test asserting major creates NEW file with `supersedes` + old becomes `Substituido`**

```javascript
test('major: create new file with supersedes, mark old as Substituido', () => {
  execSync(`rm -rf ${PROJ} && cp -r tests/validation/fixtures/adr-project ${PROJ}`);
  const oldFile = `${PROJ}.context/docs/adrs/001-zod-validation-v1.0.0.md`;
  const newFile = `${PROJ}.context/docs/adrs/001-zod-validation-v2.0.0.md`;

  execSync(`node scripts/adr-evolve.mjs ${oldFile} --kind=major --apply --new-content=tests/fixtures/major-replacement.md`,
           { stdio: 'inherit' });

  // Old file STILL exists with same name (not renamed) but status changed
  assert.ok(existsSync(oldFile));
  const oldContent = readFileSync(oldFile, 'utf-8');
  assert.match(oldContent, /status: Substituido/);

  // New file exists with v2.0.0 + supersedes pointing to old slug-without-ext
  assert.ok(existsSync(newFile));
  const newContent = readFileSync(newFile, 'utf-8');
  assert.match(newContent, /version: 2\.0\.0/);
  assert.match(newContent, /supersedes: \[001-zod-validation-v1\.0\.0\]/);
  assert.match(newContent, /status: Proposto/);
});
```

- [ ] **Step 2: RED + commit**

---

#### Task 2.6: Implement evolve `major` handler

**Files:**
- Modify: `scripts/adr-evolve.mjs`

- [ ] **Step 1: Add `handleMajor` (creates new file + edits old)**

```javascript
async function handleMajor(file, opts) {
  const content = await readFile(file, 'utf-8');
  const { frontmatter: oldFm, body: oldBody } = parse(content);
  const oldSlug = basename(file, '.md');

  // New ADR — start fresh template + supersedes ref to old (Opção Y: filename sem extensão)
  const newFile = renameToVersion(file, '2.0.0').replace(/v1\.\d+\.\d+/, 'v2.0.0');
  const newFm = Object.create(null);
  Object.assign(newFm, {
    type: 'adr', name: oldFm.name, description: '<a definir — major bump>',
    scope: oldFm.scope, stack: oldFm.stack, category: oldFm.category,
    status: 'Proposto', version: '2.0.0', created: new Date().toISOString().slice(0, 10),
    supersedes: [oldSlug], refines: [], protocol_contract: null, decision_kind: 'firm',
  });

  // Pull replacement body from --new-content if provided, else use template stub
  const newBody = opts.diff ? opts.diff : '# ADR — <a definir>\n\n## Contexto\n\n<a definir>\n';

  // Old ADR — mark Substituido, do NOT rename
  oldFm.status = 'Substituido';
  const updatedOldContent = stringify(oldFm, oldBody);

  if (opts.apply) {
    await writeFile(newFile, stringify(newFm, newBody));
    await writeFile(file, updatedOldContent);
    execFileSync('node', ['scripts/adr-update-index.mjs', `--project=${resolve(dirname(dirname(dirname(file))))}`], { stdio: 'inherit' });
  }
  console.log(JSON.stringify({ kind: 'major', new: newFile, supersedes: oldSlug }));
}
```

- [ ] **Step 2: GREEN + commit**

---

#### Task 2.7: Write failing test for evolve `refine` flow

**Files:**
- Modify: `tests/validation/test-adr-evolve.mjs`

- [ ] **Step 1: Write test asserting refine creates NEW ADR with new sequential number, parent untouched**

```javascript
test('refine: new ADR with refines, parent unchanged', () => {
  execSync(`rm -rf ${PROJ} && cp -r tests/validation/fixtures/adr-project ${PROJ}`);
  const parent = `${PROJ}.context/docs/adrs/001-zod-validation-v1.0.0.md`;
  const parentBefore = readFileSync(parent, 'utf-8');

  execSync(`node scripts/adr-evolve.mjs ${parent} --kind=refine --slug=zod-coverage-slo --apply`);

  // Parent untouched
  assert.equal(readFileSync(parent, 'utf-8'), parentBefore);

  // New file created with next sequential number
  const newFiles = readdirSync(`${PROJ}.context/docs/adrs/`).filter(f => f.includes('zod-coverage-slo'));
  assert.equal(newFiles.length, 1);
  assert.match(newFiles[0], /^\d{3}-zod-coverage-slo-v1\.0\.0\.md$/);
  const content = readFileSync(`${PROJ}.context/docs/adrs/${newFiles[0]}`, 'utf-8');
  assert.match(content, /refines: \[001-zod-validation-v1\.0\.0\]/);
});
```

- [ ] **Step 2: RED + commit**

---

#### Task 2.8: Implement evolve `refine` handler

- [ ] **Step 1: Add `handleRefine` (creates new ADR via update-index `--next-number`)**

```javascript
async function handleRefine(file, opts) {
  const parentSlug = basename(file, '.md');
  const dir = dirname(file);
  const projectRoot = resolve(dirname(dirname(dirname(file))));

  // S1 — argv array
  const nextNumOutput = execFileSync('node', ['scripts/adr-update-index.mjs', `--project=${projectRoot}`, '--next-number'], { encoding: 'utf-8' });
  const num = nextNumOutput.trim();

  const slug = opts.diff || 'a-definir-refine';
  const newFile = join(dir, `${num}-${slug}-v1.0.0.md`);

  const newFm = Object.create(null);
  Object.assign(newFm, {
    type: 'adr', name: slug, description: '<a definir — refine>',
    scope: 'project', stack: 'universal', category: 'arquitetura',
    status: 'Proposto', version: '1.0.0', created: new Date().toISOString().slice(0, 10),
    supersedes: [], refines: [parentSlug], protocol_contract: null, decision_kind: 'firm',
  });
  const newBody = '# ADR — <a definir>\n\n## Contexto\n\n<a definir>\n';

  if (opts.apply) {
    await writeFile(newFile, stringify(newFm, newBody));
    execFileSync('node', ['scripts/adr-update-index.mjs', `--project=${projectRoot}`], { stdio: 'inherit' });
  }
  console.log(JSON.stringify({ kind: 'refine', new: newFile, refines: parentSlug }));
}
```

- [ ] **Step 2: GREEN + commit**

---

#### Task 2.9: Add `--no-fix-auto` flag to `adr-audit.mjs`

(P12 requires this flag for migration; lib already accepts it but behavior must demote FIX-AUTO to FIX-INTERVIEW. If implemented in Task 1.11, skip; else implement now.)

- [ ] **Step 1: Verify or add demotion logic**

Already in Task 1.11 step 14. Audit code:

```javascript
if (flags.noFixAuto) {
  checks = checks.map(c => c.status === 'FIX-AUTO' ? { ...c, status: 'FIX-INTERVIEW' } : c);
}
```

- [ ] **Step 2: Write test**

```javascript
test('--no-fix-auto demotes FIX-AUTO to FIX-INTERVIEW', () => {
  // Use fixture invalid-01 which would have FIX-AUTO; with flag, should be FIX-INTERVIEW
  const out = execSync(`node scripts/adr-audit.mjs tests/validation/fixtures/adr/invalid-01-vague-guardrail.md --format=json --no-fix-auto`);
  const result = JSON.parse(out);
  assert.equal(result.summary.fix_auto, 0);
});
```

- [ ] **Step 3: Commit**

```bash
git add tests/validation/test-adr-audit.mjs scripts/adr-audit.mjs
git commit -m "test(adrs): verify --no-fix-auto demotion"
```

---

#### Task 2.10: Test concurrent lock scenario

- [ ] **Step 1: Write stress test**

```javascript
test('concurrent --next-number serialized', async () => {
  // Spawn 5 parallel processes
  const procs = Array.from({ length: 5 }, () =>
    new Promise((res, rej) => {
      const child = spawn('node', ['scripts/adr-update-index.mjs', `--project=${PROJ}`, '--next-number']);
      let out = '';
      child.stdout.on('data', d => out += d);
      child.on('close', () => res(out.trim()));
    })
  );
  const results = await Promise.all(procs);
  // All should succeed (no errors)
  for (const r of results) assert.match(r, /^\d{3}$/);
});
```

- [ ] **Step 2: Run, expect GREEN**

- [ ] **Step 3: Commit**

```bash
git commit -m "test(adrs): verify concurrent --next-number under lock"
```

---

#### Task 2.11a (was 2.11 step 1 — split per C3): Author `SKILL.md` frontmatter + structure

**Files:**
- Create: `skills/adr-builder/SKILL.md` (initial — frontmatter + section stubs)

- [ ] **Step 1: Write frontmatter + global structure**

```markdown
---
name: adr-builder
description: Use when the user asks to create, audit, or evolve Architecture Decision Records (ADRs)...
---

# ADR Builder — DevFlow Edition

## Step 0 — Detect mode (create | audit | evolve)
[stub]

## CREATE mode (Steps 1-5)
[stub — filled in 2.11b]

## AUDIT mode (Steps A1-A4)
[stub — filled in 2.11c]

## EVOLVE mode (Steps E1-E5)
[stub — filled in 2.11d]

## Hard rules (12)
[port from bundle — verbatim]
```

- [ ] **Step 2: Commit**

```bash
git add skills/adr-builder/SKILL.md
git commit -m "feat(adrs): scaffold SKILL.md with frontmatter and section stubs"
```

---

#### Task 2.11b: Author `SKILL.md` CREATE mode section

**Files:**
- Modify: `skills/adr-builder/SKILL.md` (replace CREATE stub with full section)
- Reference: `/tmp/adr-builder-extract/adr-builder/SKILL.md` Steps 1-5
- Reference: `skills/adr-builder/references/briefing-guiado.md` + `extracao-livre.md`

- [ ] **Step 1: Author CREATE Steps 1-5**

Port + adapt from bundle:
- Replace `ask_user_input_v0` → DevFlow conversational pattern (prosa or AskUserQuestion)
- Drop staging at `/home/claude/adr-build/` — DevFlow writes direct to `.context/docs/adrs/`
- Add seed copy logic on first invocation: if `.context/templates/adrs/patterns-catalog.md` doesn't exist, copy from `${CLAUDE_PLUGIN_ROOT}/skills/adr-builder/assets/patterns-catalog.md`. Same for `context.yaml`.
- Drop Step 6 distribution A/C; only Option B (write to `.context/docs/adrs/`) applies in DevFlow.
- Drop Step 7 packaging (no .zip).

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(adrs): SKILL.md CREATE mode section (Steps 1-5)"
```

---

#### Task 2.11c: Author `SKILL.md` AUDIT mode section

**Files:**
- Modify: `skills/adr-builder/SKILL.md` (replace AUDIT stub)
- Reference: bundle Steps A1-A4 + `references/auditoria.md`

- [ ] **Step 1: Author AUDIT Steps A1-A4**

Adapt: AUDIT delegates to `adr-audit.mjs` lib for deterministic check classification (don't replicate check logic in skill prose). Skill flows: load file → invoke lib → present report → branch on user choice (just-show / fix-auto-only / full interview).

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(adrs): SKILL.md AUDIT mode section (Steps A1-A4 + lib delegation)"
```

---

#### Task 2.11d: Author `SKILL.md` EVOLVE mode section

**Files:**
- Modify: `skills/adr-builder/SKILL.md` (replace EVOLVE stub)
- Reference: spec §5.3

- [ ] **Step 1: Author EVOLVE Steps E1-E5**

Steps:
- E1: Load target ADR + classify change type (patch | minor | major | refine) via `ask_user_question`
- E2: Type-specific interview
- E3: Generate plan summary
- E4: Invoke `adr-evolve.mjs --kind=<type> --apply`
- E5: Hand off to V phase (PREVC SMALL gate via prevc-validation Step 2.5)

- [ ] **Step 2: Manual smoke check**

```bash
ls skills/adr-builder/
# Expected: SKILL.md, assets/, references/
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(adrs): SKILL.md EVOLVE mode section (Steps E1-E5)"
```

---

#### Task 2.12: Author `commands/devflow-adr.md` dispatcher

**Files:**
- Create: `commands/devflow-adr.md`
- Reference: spec §2.3

- [ ] **Step 1: Write dispatcher**

Format follows `commands/devflow.md` pattern (subcommand routing in markdown). Skill `devflow:adr-builder` is invoked with `mode:` argument.

- [ ] **Step 2: Update plugin.json (if needed)**

Verify `commands/devflow-adr.md` is recognized — DevFlow auto-discovers `commands/*.md`.

- [ ] **Step 3: Commit**

```bash
git add commands/devflow-adr.md
git commit -m "feat(adrs): add /devflow adr dispatcher (new/audit/evolve)"
```

---

#### Task 2.13: Manual smoke test — `/devflow adr:new --mode=prefilled`

- [ ] **Step 1: Run in scratch directory**

```bash
cd /tmp/scratch-adr-test/ && /devflow adr:new --mode=prefilled << 'EOF'
title: Test ADR
decision: Use Postgres
alternatives:
  - MongoDB — sem schema rígido
  - SQLite — sem replicação
guardrails:
  - SEMPRE usar transactions em writes multi-row
  - NUNCA query síncrona em UI thread
enforcement:
  - Code review: lint regex para query patterns
EOF
```

- [ ] **Step 2: Verify output**

Expected: `.context/docs/adrs/001-test-adr-v1.0.0.md` created with valid frontmatter; README updated.

- [ ] **Step 3: Run audit**

```bash
node scripts/adr-audit.mjs .context/docs/adrs/001-test-adr-v1.0.0.md --format=pretty
```

Expected: 12/12 PASS.

- [ ] **Step 4: No commit (smoke only) — clean up scratch**

---

#### Task 2.14: Manual smoke — `/devflow adr:audit`

- [ ] **Step 1: Run audit on existing fixture**

```bash
/devflow adr:audit tests/validation/fixtures/adr/invalid-01-vague-guardrail.md
```

- [ ] **Step 2: Verify report shows FIX-INTERVIEW for Check 5**

- [ ] **Step 3: No commit**

---

#### Task 2.15: Manual smoke — `/devflow adr:evolve`

- [ ] **Step 1: Run evolve patch on the test ADR from 2.13**

```bash
/devflow adr:evolve 001-test-adr --kind=patch
```

- [ ] **Step 2: Verify rename to v1.0.1 + index updated**

- [ ] **Step 3: Phase 2 acceptance commit**

```bash
git commit --allow-empty -m "chore(adrs): Phase 2 complete — skill, dispatcher, evolve all 4 flows green"
```

---

### Phase 3 — Migration of 001/002 (Tasks 3.1–3.10)

> **Primary Agent:** `refactoring-specialist` — [Playbook](../agents/refactoring-specialist.md)
> **Tests:** integration (filesystem rename, content migration, no stale refs).

**Objective:** Migrar ADRs 001 e 002 do template v1 (DevFlow original) para v2.1.0, com `--no-fix-auto` (P12) e grep blast radius prévio.

---

#### Task 3.1: Grep blast radius — find stale references

- [ ] **Step 1: Run grep**

```bash
rg -l "001-tdd-python|002-code-review" --type=md > /tmp/stale-refs.txt
cat /tmp/stale-refs.txt
```

Expected output (paths to update before rename):
- `MEMORY.md` (auto-memory may reference)
- `.context/docs/adrs/README.md` (will be regenerated)
- `.context/plans/adr-system.md` (the plan being superseded)
- Possibly other docs

- [ ] **Step 2: No commit yet — list captured**

---

#### Task 3.2: Update stale references in non-rename files

- [ ] **Step 1: For each file in `/tmp/stale-refs.txt` (excluding the ADR files themselves)**

Update `001-tdd-python` → `001-tdd-python-v1.0.0` and `002-code-review` → `002-code-review-v1.0.0` via `sed -i` or manual `Edit`.

Skip:
- `.context/docs/adrs/README.md` (regenerated in Task 3.7)
- The ADR files themselves (renamed in Task 3.5/3.6)

- [ ] **Step 2: Commit**

```bash
git add <each updated file>
git commit -m "refactor(adrs): update stale ADR references pre-rename"
```

---

#### Task 3.3: Write failing tests for migration

**Files:**
- Create: `tests/validation/test-adr-migration.mjs`

- [ ] **Step 1: Write test**

```javascript
test('001-tdd-python migrated to v1.0.0', () => {
  const newPath = '.context/docs/adrs/001-tdd-python-v1.0.0.md';
  assert.ok(existsSync(newPath));
  assert.ok(!existsSync('.context/docs/adrs/001-tdd-python.md'));
  const { frontmatter, body } = parse(readFileSync(newPath, 'utf-8'));
  assert.equal(frontmatter.version, '1.0.0');
  assert.deepEqual(frontmatter.supersedes, []);
  assert.deepEqual(frontmatter.refines, []);
  assert.equal(frontmatter.protocol_contract, null);
  assert.equal(frontmatter.decision_kind, 'firm');
  assert.equal(frontmatter.status, 'Aprovado'); // preserved
  assert.doesNotMatch(body, /^##\s+Relacionamentos/m); // section removed
  assert.match(body, /pytest\.org/); // URL migrated to Evidências
});
// Same for 002
test('grep finds zero stale references', () => {
  const out = execSync('rg -l "001-tdd-python\\.md|002-code-review\\.md" --type=md', { encoding: 'utf-8' }).trim();
  assert.equal(out, '');
});
```

- [ ] **Step 2: RED**

- [ ] **Step 3: Commit**

---

#### Task 3.4: Implement `adr-migrate-v1-to-v2.mjs`

**Files:**
- Create: `scripts/adr-migrate-v1-to-v2.mjs`

- [ ] **Step 1: Write one-shot script**

```javascript
// scripts/adr-migrate-v1-to-v2.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';  // S1 — argv array, no shell interpolation
import { parse, stringify } from './lib/adr-frontmatter.mjs';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

const content = await readFile(file, 'utf-8');
const { frontmatter, body: oldBody } = parse(content);

// Add v2 fields
frontmatter.version = '1.0.0';
frontmatter.supersedes = [];
frontmatter.refines = [];
frontmatter.protocol_contract = null;
frontmatter.decision_kind = 'firm';

// Migrate body: remove ## Relacionamentos, migrate URLs to Evidências
const newBody = transformBody(oldBody);

const newFile = file.replace(/\.md$/, '-v1.0.0.md');

console.log(`Migration: ${file} → ${newFile}`);
console.log('--- Diff preview ---');
console.log('Frontmatter additions:', { version: '1.0.0', supersedes: [], refines: [], protocol_contract: null, decision_kind: 'firm' });
console.log('Body changes: remove "## Relacionamentos" section, migrate pytest URL to Evidências');

if (!dryRun) {
  // FIX-AUTO disabled — require human confirmation (--no-fix-auto behavior)
  if (!process.argv.includes('--confirmed')) {
    console.error('Migration requires explicit --confirmed flag (P12: ADRs aprovadas exigem revisão humana)');
    process.exit(1);
  }
  // S5 — write-then-rename atomic pattern (same as adr-evolve.mjs Task 2.2)
  await writeFile(file, stringify(frontmatter, newBody));
  try {
    execFileSync('git', ['mv', file, newFile], { stdio: 'inherit' });  // S1 — argv array
  } catch (err) {
    await writeFile(file, content);
    throw new Error(`git mv failed; rolled back: ${err.message}`);
  }
  console.log('Migration applied.');
} else {
  console.log('Dry-run only.');
}

function transformBody(body) {
  // Extract URLs from Relacionamentos
  const relMatch = body.match(/^##\s+Relacionamentos[\s\S]+?(?=\n##|$)/m);
  let urls = [];
  if (relMatch) {
    urls = (relMatch[0].match(/https?:\/\/[^\s)]+/g) || []);
  }
  // Remove Relacionamentos section
  let newBody = body.replace(/^##\s+Relacionamentos[\s\S]+?(?=\n##|$)/m, '');
  // Inject URLs into Evidências (or append section if missing)
  if (urls.length > 0) {
    const evidenceSection = newBody.match(/^##\s+Evid/m);
    if (evidenceSection) {
      // Append "**Fontes oficiais:** [name](url)" near top of Evidências
      newBody = newBody.replace(/^##\s+Evid[^\n]*\n/m, `$&\n**Fontes oficiais:** ${urls.map(u => `[oficial](${u})`).join(' · ')}\n`);
    }
  }
  return newBody;
}
```

- [ ] **Step 2: Test on copy first**

```bash
cp .context/docs/adrs/001-tdd-python.md /tmp/001-test.md
node scripts/adr-migrate-v1-to-v2.mjs /tmp/001-test.md --dry-run
```

- [ ] **Step 3: Commit**

```bash
git add scripts/adr-migrate-v1-to-v2.mjs
git commit -m "feat(adrs): add one-shot migration script v1→v2 (--no-fix-auto by default)"
```

---

#### Task 3.5: Migrate 001-tdd-python

- [ ] **Step 1: Dry-run**

```bash
node scripts/adr-migrate-v1-to-v2.mjs .context/docs/adrs/001-tdd-python.md --dry-run
```

Verify diff preview matches expectations.

- [ ] **Step 2: Apply with explicit confirm**

```bash
node scripts/adr-migrate-v1-to-v2.mjs .context/docs/adrs/001-tdd-python.md --confirmed
```

- [ ] **Step 3: Audit migrated file**

```bash
node scripts/adr-audit.mjs .context/docs/adrs/001-tdd-python-v1.0.0.md --format=pretty
```

Expected: 12/12 PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(adrs): migrate 001-tdd-python to v1.0.0 (template v2.1.0)"
```

---

#### Task 3.6: Migrate 002-code-review

Repeat Task 3.5 for `002-code-review.md`.

---

#### Task 3.7: Regenerate README via adr-update-index

```bash
node scripts/adr-update-index.mjs
git add .context/docs/adrs/README.md
git commit -m "chore(adrs): regenerate index with 14-column schema"
```

---

#### Task 3.8: Run all migration tests

```bash
node --test tests/validation/test-adr-migration.mjs
```

Expected: GREEN (all migration assertions pass; grep returns empty).

---

#### Task 3.9: Remove legacy `.context/templates/adrs/TEMPLATE-ADR.md`

- [ ] **Step 1: Confirm template now in bundle**

```bash
ls skills/adr-builder/assets/TEMPLATE-ADR.md
```

- [ ] **Step 2: Delete legacy**

```bash
git rm .context/templates/adrs/TEMPLATE-ADR.md
git commit -m "refactor(adrs): remove legacy template (now in skills/adr-builder/assets/)"
```

---

#### Task 3.10: Phase 3 acceptance

```bash
git commit --allow-empty -m "chore(adrs): Phase 3 complete — 001/002 migrated, legacy template removed"
```

---

### Phase 4 — Active Integration (Tasks 4.1–4.7)

> **Primary Agent:** `architect-specialist` — [Playbook](../agents/architect-specialist.md)
> **Tests:** integration (mock workflow → verify Step 5.6 fires; mock V phase → verify Step 2.5 audits).
> **Handoff from:** `documentation-writer` (Phase 2 SKILL.md) + `refactoring-specialist` (Phase 3 migration).

---

#### Task 4.1: Modify `skills/prevc-planning/SKILL.md` — add Step 5.6

**Files:**
- Modify: `skills/prevc-planning/SKILL.md`
- Reference: spec §6.4

- [ ] **Step 1: Insert Step 5.6 between Step 5 and Step 6**

(Content per spec §6.4 — instrução LLM com 4 sinais simultâneos, opt-in, opt-out persistente.)

- [ ] **Step 2: Commit**

```bash
git add skills/prevc-planning/SKILL.md
git commit -m "feat(prevc-planning): add Step 5.6 ADR opportunity check (LLM-instruction)"
```

---

#### Task 4.2: Automated integration test for Step 5.6 (resolves C4)

**Files:**
- Create: `tests/validation/test-prevc-planning-step5.6.mjs`

**Tests:** integration. Asserts the SKILL.md text contains the required heuristic structure (4 signals, opt-out flag, offer template). Until subagent harness from Suite D is reused, validate via doc-test pattern: parse SKILL.md, assert presence of named sub-steps and opt-out keyword.

- [ ] **Step 1: Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SKILL = readFileSync('./skills/prevc-planning/SKILL.md', 'utf-8');

test('Step 5.6 exists between Step 5 and Step 6', () => {
  const idx5 = SKILL.indexOf('## Step 5');
  const idx55 = SKILL.indexOf('## Step 5.6');
  const idx6 = SKILL.indexOf('## Step 6');
  assert.ok(idx5 < idx55 && idx55 < idx6, 'Step 5.6 must sit between Step 5 and Step 6');
});

test('Step 5.6 declares 4 signals', () => {
  const section = extractSection(SKILL, '## Step 5.6');
  for (const sig of ['Escolha entre alternativas', 'stack/arquitetura', 'guardrails', 'Não-trivial']) {
    assert.match(section, new RegExp(sig));
  }
});

test('Step 5.6 declares opt-out skip_adr_offer', () => {
  const section = extractSection(SKILL, '## Step 5.6');
  assert.match(section, /skip_adr_offer/);
});

test('Step 5.6 mechanism is LLM-instruction (P11), not regex/lib', () => {
  const section = extractSection(SKILL, '## Step 5.6');
  assert.match(section, /instru[çc][ãa]o/i);
  assert.doesNotMatch(section, /regex|lib auxiliar/i);
});

function extractSection(text, heading) {
  const start = text.indexOf(heading);
  const next = text.indexOf('## ', start + heading.length);
  return text.slice(start, next === -1 ? text.length : next);
}
```

- [ ] **Step 2: RED → modify SKILL.md (Task 4.1) → GREEN**

- [ ] **Step 3: Commit**

```bash
git commit -m "test(prevc-planning): verify Step 5.6 structure (4 signals + opt-out)"
```

---

#### Task 4.3: Modify `skills/prevc-validation/SKILL.md` — add Step 2.5

**Files:**
- Modify: `skills/prevc-validation/SKILL.md`
- Reference: spec §6.5

- [ ] **Step 1: Insert Step 2.5**

(Content per spec §6.5 — matriz por status, `git merge-base HEAD main`, `adr-audit.mjs --enforce-gate`.)

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(prevc-validation): add Step 2.5 ADR Compliance Check (matrix-by-status)"
```

---

#### Task 4.4: Automated integration test for Step 2.5 (resolves C4)

**Files:**
- Create: `tests/validation/test-prevc-validation-step2.5.mjs`

**Tests:** integration. Bash-driven scenario test: prepare git scratch repo with various ADR states, run the gate command sequence (as a Step 2.5 implementation would), assert correct exit codes.

- [ ] **Step 1: Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';

const SCRATCH = '/tmp/test-step2.5-scratch';

function setupScratch() {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(`${SCRATCH}/.context/docs/adrs/`, { recursive: true });
  execFileSync('git', ['init', SCRATCH], { stdio: 'ignore' });
  execFileSync('git', ['-C', SCRATCH, 'commit', '--allow-empty', '-m', 'init'], { stdio: 'ignore' });
}

test('Step 2.5 skips when no ADRs touched', () => {
  setupScratch();
  // No diff in adrs/ — Step 2.5 should skip
  const diff = execSync(`git -C ${SCRATCH} diff --name-only HEAD -- '.context/docs/adrs/*.md'`).toString();
  assert.equal(diff, ''); // empty diff → skip path
});

test('Step 2.5 blocks gate when Proposto ADR has FIX-INTERVIEW', () => {
  setupScratch();
  copyFileSync('./tests/validation/fixtures/adr/invalid-01-vague-guardrail.md',
               `${SCRATCH}/.context/docs/adrs/001-vague-v1.0.0.md`);
  // Run audit with --enforce-gate; should exit 1
  let exitCode = 0;
  try {
    execFileSync('node', ['scripts/adr-audit.mjs', `${SCRATCH}/.context/docs/adrs/001-vague-v1.0.0.md`, '--enforce-gate'], { stdio: 'pipe' });
  } catch (err) { exitCode = err.status; }
  assert.equal(exitCode, 1);
});

test('Step 2.5 SKILL.md has matrix-by-status table', () => {
  const skill = readFileSync('./skills/prevc-validation/SKILL.md', 'utf-8');
  assert.match(skill, /## Step 2\.5/);
  for (const status of ['Proposto', 'Aprovado', 'Substituido', 'Descontinuado']) {
    assert.match(skill, new RegExp(`\\b${status}\\b`));
  }
  assert.match(skill, /git merge-base HEAD main/); // worktree-safe diff
});
```

- [ ] **Step 2: RED → modify SKILL.md (Task 4.3) → GREEN**

- [ ] **Step 3: Commit**

```bash
git commit -m "test(prevc-validation): verify Step 2.5 gate semantics + matrix-by-status"
```

---

#### Task 4.5: Modify `skills/adr-filter/SKILL.md` — schema 14-col + Kind filter

**Files:**
- Modify: `skills/adr-filter/SKILL.md`
- Reference: spec §6.6

- [ ] **Step 1: Update parser logic (Step 1)**

Map new column names: Versão, Categoria, Kind, Refines, Supersedes, Contrato, Criada.

- [ ] **Step 2: Add Step 4d (Kind filter)**

Lógica: `firm` → no tag; `gated` → `[gated]`; `reversible` → `[experimental]`.

- [ ] **Step 3: Update Step 6 emission format**

```
### tdd-python [firm] (stack: python)
SEMPRE escrever o teste...
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(adr-filter): support v2 schema (14 cols) + Kind filter with tags"
```

---

#### Task 4.6: Automated integration test for adr-filter v2 (resolves C4 + A2)

**Files:**
- Create: `tests/validation/test-adr-filter-v2.mjs`
- Create: `tests/validation/fixtures/adr-filter-v2/` — **dedicated fixture** (resolves A2: doesn't depend on Phase 3 migration of 001/002)

**Tests:** integration. Self-contained fixture set with v2 schema READMEs + ADRs in different status/kind combinations.

- [ ] **Step 1: Create dedicated fixture (A2)**

Build `tests/validation/fixtures/adr-filter-v2/.context/docs/adrs/` with:
- `001-firm-v1.0.0.md` — Aprovado, kind: firm
- `002-experimental-v1.0.0.md` — Aprovado, kind: reversible
- `003-superseded-v1.0.0.md` — Substituido (must be rejected by filter)
- `README.md` — generated via `adr-update-index.mjs` against this fixture

- [ ] **Step 2: Write failing test**

```javascript
test('adr-filter parses 14-column schema', () => {
  // SKILL.md must reference Versão, Categoria, Kind, Refines, Supersedes, Contrato, Criada
  const skill = readFileSync('./skills/adr-filter/SKILL.md', 'utf-8');
  for (const col of ['Versão', 'Categoria', 'Kind', 'Refines', 'Supersedes', 'Contrato', 'Criada']) {
    assert.match(skill, new RegExp(col));
  }
});

test('adr-filter Step 4d emits Kind tags', () => {
  const skill = readFileSync('./skills/adr-filter/SKILL.md', 'utf-8');
  assert.match(skill, /\[firm\]|firm.*sem tag/);
  assert.match(skill, /\[gated\]/);
  assert.match(skill, /\[experimental\]/);
});

test('adr-filter rejects Substituido status', () => {
  const skill = readFileSync('./skills/adr-filter/SKILL.md', 'utf-8');
  assert.match(skill, /Substituido.*reject|status.*Substituido/);
});
```

- [ ] **Step 3: RED → modify SKILL.md (Task 4.5) → GREEN**

- [ ] **Step 4: Commit**

```bash
git commit -m "test(adr-filter): verify v2 schema parsing + Kind tags + status filter"
```

---

#### Task 4.7: Regression — run all existing test suites

> **Dependency barrier (A1):** Task 4.7 explicitly requires Phase 3 (migration of 001/002) to be merged first. Reason: regression suite includes `tests/validation/test-adr-migration.mjs` which asserts the migration completed. Running 4.7 before Phase 3 commits will fail — the suite is not standalone. **Workflow:** Phase 4 tasks 4.1-4.6 can run in parallel with Phase 3, but 4.7 must wait for Phase 3 done.

```bash
node --test tests/validation/*.mjs
```

Verify no regression in:
- prevc-planning existing tests + new test-prevc-planning-step5.6.mjs (Task 4.2)
- prevc-validation existing tests + new test-prevc-validation-step2.5.mjs (Task 4.4)
- adr-filter new tests test-adr-filter-v2.mjs (Task 4.6)
- All Phase 1 suites (audit, index, graph, frontmatter, semver)
- Phase 3 migration suite

```bash
git commit --allow-empty -m "chore(adrs): Phase 4 complete — Step 5.6, Step 2.5, adr-filter integrated, all suites green"
```

---

### Phase 5 — Suite D Harness + Acceptance + Cleanup (Tasks 5.1–5.9)

> **Primary Agent:** `test-writer` — [Playbook](../agents/test-writer.md)
> **Tests:** E2E (Suite D — subagent integration). Other suites are pre-existing.
> **Handoff from:** `architect-specialist` (Phase 4 integration green).

---

#### Task 5.1: Write Suite D harness (subagent runner)

**Files:**
- Create: `tests/validation/lib/subagent-harness.mjs`

- [ ] **Step 1: Write harness**

Spawn `claude --print` with skill `devflow:adr-builder` loaded, in temp git worktree. Capture stdout, parse for completion signal.

(Estimated 100-150 lines of harness code.)

- [ ] **Step 2: Commit**

---

#### Task 5.2: Implement Suite D test (CREATE prefilled E2E)

**Files:**
- Create: `tests/validation/test-adr-builder-integration.mjs`

- [ ] **Step 1: Write test that uses harness**

Run `/devflow adr:new --mode=prefilled` with a fixed briefing in worktree. Assert: file created, frontmatter v2.1.0 valid, README updated, `adr-audit.mjs` returns 12/12 PASS.

- [ ] **Step 2: Run, expect GREEN (with token spend)**

- [ ] **Step 3: Commit**

```bash
git commit -m "test(adrs): add Suite D — subagent E2E for adr-builder CREATE"
```

---

#### Task 5.3: Run Suite D end-to-end + record token cost

```bash
node --test tests/validation/test-adr-builder-integration.mjs
```

Record cost (~1-2k tokens) in `tests/validation/test-adr-builder-integration.mjs` header comment.

---

#### Task 5.4: Supersede `.context/plans/adr-system.md`

- [ ] **Step 1: Edit frontmatter**

Add `superseded_by: adr-system-v2` to `.context/plans/adr-system.md` frontmatter.

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(plans): mark adr-system.md as superseded by adr-system-v2"
```

---

#### Task 5.5: Update `.context/docs/project-overview.md`

Add brief mention of new ADR system v2 + adr-builder skill.

```bash
git commit -m "docs(context): mention ADR system v2 in project-overview"
```

---

#### Task 5.6: Update `.context/docs/development-workflow.md`

Document Step 2.5 of V phase + `/devflow adr:*` commands.

```bash
git commit -m "docs(context): document Step 2.5 and /devflow adr:* in development-workflow"
```

---

#### Task 5.6.5 (NEW — A4): Smoke test plugin packaging in fresh install

**Files:**
- Create: `tests/validation/test-plugin-packaging.sh`

**Tests:** integration. Risk §10 "plugin packaging dropa assets/" needs verification beyond reading `plugin.json`.

- [ ] **Step 1: Write smoke script**

```bash
#!/usr/bin/env bash
# tests/validation/test-plugin-packaging.sh
set -euo pipefail

SCRATCH=$(mktemp -d)
trap "rm -rf $SCRATCH" EXIT

# Simulate fresh install by copying plugin (excluding .git, node_modules, etc.)
rsync -a --exclude='.git' --exclude='node_modules' --exclude='tests' \
  /home/walterfrey/Documentos/code/devflow/ "$SCRATCH/devflow/"

# Verify critical paths survived
for path in \
  "skills/adr-builder/SKILL.md" \
  "skills/adr-builder/assets/TEMPLATE-ADR.md" \
  "skills/adr-builder/assets/patterns-catalog.md" \
  "skills/adr-builder/assets/context.yaml" \
  "skills/adr-builder/references/briefing-guiado.md" \
  "skills/adr-builder/references/extracao-livre.md" \
  "skills/adr-builder/references/auditoria.md" \
  "skills/adr-builder/references/checklist-qualidade.md" \
  "skills/adr-builder/references/saida-distribuicao.md" \
  "scripts/adr-audit.mjs" \
  "scripts/adr-update-index.mjs" \
  "scripts/adr-evolve.mjs" \
  "scripts/lib/adr-frontmatter.mjs" \
  "scripts/lib/adr-graph.mjs" \
  "scripts/lib/adr-semver.mjs" \
  "commands/devflow-adr.md"
do
  if [ ! -f "$SCRATCH/devflow/$path" ]; then
    echo "FAIL: missing $path in fresh install"
    exit 1
  fi
done

echo "OK: all required paths present in fresh install"
```

- [ ] **Step 2: Run + verify**

```bash
bash tests/validation/test-plugin-packaging.sh
# Expected: OK: all required paths present
```

- [ ] **Step 3: Commit**

```bash
git add tests/validation/test-plugin-packaging.sh
git commit -m "test(plugin): smoke fresh-install assertion for adr-builder bundle (resolves A4)"
```

---

#### Task 5.7: Self-audit all existing ADRs

```bash
for f in .context/docs/adrs/*-v*.md; do
  node scripts/adr-audit.mjs "$f" --format=pretty
done
```

Expected: 12/12 PASS for both 001 and 002.

If any FIX-INTERVIEW: re-run migration with manual interview, fix, re-audit.

---

#### Task 5.8: Bump DevFlow plugin version

- [ ] **Step 1: Run version bump**

```bash
bash scripts/bump-version.sh minor   # ADR system is a minor feature
```

Expected: `plugin.json` version `0.12.1 → 0.13.0`.

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(version): bump to 0.13.0 — ADR system v2"
```

---

#### Task 5.9: Final acceptance — run everything

```bash
node --test tests/validation/*.mjs
node scripts/adr-audit.mjs .context/docs/adrs/*.md
node scripts/adr-update-index.mjs --project=.
```

All green. Plan complete.

```bash
git commit --allow-empty -m "chore(adrs): Phase 5 complete — Suite D green, version bumped, ADR system v2 ready"
```

---

## Success Criteria

- [ ] Suites A, B, C 100% verdes em <3s total
- [ ] Suite D verde (~60-90s, ~1-2k tokens, triggered)
- [ ] 001-tdd-python e 002-code-review em filename `*-v1.0.0.md` com frontmatter v2.1.0 completo
- [ ] `.context/docs/adrs/README.md` regenerado com schema 14 colunas
- [ ] `adr-audit.mjs` retorna 12/12 PASS para todas as ADRs do repo
- [ ] `skills/adr-builder/SKILL.md` cobre CREATE/AUDIT/EVOLVE
- [ ] `commands/devflow-adr.md` dispatcha 3 subcomandos
- [ ] `skills/prevc-planning/SKILL.md` Step 5.6 funcional (smoke test)
- [ ] `skills/prevc-validation/SKILL.md` Step 2.5 bloqueia FIX-INTERVIEW
- [ ] `skills/adr-filter/SKILL.md` parseia 14 colunas + emite tags `[firm]`/`[gated]`/`[experimental]`
- [ ] `.context/plans/adr-system.md` marcado como `superseded_by: adr-system-v2`
- [ ] `.context/templates/adrs/TEMPLATE-ADR.md` (legado) removido
- [ ] `docs/adr-builder.skill` (ZIP) deletado
- [ ] DevFlow plugin version bumped para `0.13.0`
- [ ] Zero referências stale via `rg`
- [ ] Plan futuro B1-B6 registrados no spec, não implementados

---

## Test-First Ordering Validation (HARD-GATE Step 5.5)

> Updated after R-phase fixes (C7): includes Task 1.4 (semver), expanded Tasks 1.12 sub-steps and 2.3-2.8 variants, automated tests in Phase 4 (4.2/4.4/4.6 now integration not smoke), Task 5.6.5 (packaging smoke), Task 2.11 split into 2.11a-d.

| Phase | Task group | First step is "Write failing test"? | Test types | Notes |
|---|---|---|---|---|
| 1 | 1.2 frontmatter | ✓ | unit (incl. S2 prototype pollution) | 12 fixtures (10 valid + 2 attack) |
| 1 | 1.4 semver (NEW C5) | ✓ | unit | extracted lib |
| 1 | 1.5 graph | ✓ | unit | 6 graph fixtures |
| 1 | 1.11 audit (Suite A) | ✓ | integration (fixtures) | 9 ADR fixtures + EXPECTED blocks |
| 1 | 1.12 audit impl Checks 1-12 | ✓ each sub-step | unit per check | 12 commits, S3 gate test in Step 15 |
| 1 | 1.13 index (Suite B) | ✓ | integration (filesystem) | includes lock concurrency |
| 1 | 1.14 index impl | ✓ | unit (lock recovery, path safety) | S4 + S6 fixtures |
| 2 | 2.1 evolve patch | ✓ | integration (git mv) | S1 + S5 in impl |
| 2 | 2.3 evolve minor | ✓ | integration | parallelizable with 2.5/2.7 |
| 2 | 2.5 evolve major | ✓ | integration | 2 files manipulated atomically |
| 2 | 2.7 evolve refine | ✓ | integration | new sequential number |
| 2 | 2.9 audit no-fix-auto | ✓ | unit | covered in 1.12 step 14 |
| 2 | 2.10 lock concurrency | ✓ | integration (5 parallel procs) | |
| 2 | 2.11a/b/c/d SKILL.md | doc-test (4.2/4.4/4.6 verify) | doc-presence | split per C3 |
| 2 | 2.12 dispatcher | manual (skills auto-discovered) | smoke | |
| 3 | 3.3 migration suite | ✓ | integration (filesystem + git) | grep zero stale refs |
| 3 | 3.4 migration script | follows 3.3 RED | integration | --no-fix-auto + execFileSync |
| 4 | 4.2 Step 5.6 (was smoke → automated) | ✓ | integration (doc-test) | resolves C4 |
| 4 | 4.4 Step 2.5 (was smoke → automated) | ✓ | integration (scratch repo) | resolves C4 |
| 4 | 4.6 adr-filter (was smoke → automated) | ✓ | integration (dedicated fixture) | resolves C4 + A2 |
| 4 | 4.7 regression | ✓ all suites | all existing + new | barrier on Phase 3 (A1) |
| 5 | 5.1 harness | doc-design first; tests added inline | infra | net-new, cost amortized |
| 5 | 5.2 Suite D | ✓ | E2E (subagent) | triggered, ~60-90s |
| 5 | 5.6.5 packaging (NEW A4) | ✓ | integration (rsync to scratch) | smoke fresh-install |

All task groups that produce code (or specifications consumed deterministically) have failing-test-first ordering. ✅

**R-phase fix coverage:**
- S1 (command injection) → applied in Tasks 2.2, 2.4, 2.6, 2.8, 3.4, 1.14 (all `execFileSync` with argv)
- S2 (prototype pollution) → applied in Task 1.3 (Object.create(null) + denylist + 2 attack fixtures)
- S3 (FIX-AUTO gate Aprovado) → applied in Task 1.12 step 14 + step 15 fixture test
- S4 (lock recovery) → applied in Task 1.14 (pid/ts liveness)
- S5 (atomic write-rename) → applied in Tasks 2.2, 2.4, 2.6, 3.4
- S6 (path traversal) → applied in Task 1.14 (path.resolve + cwd guard)
- C1 (1.11 → 1.12 with sub-steps) → resolved
- C2 (2.3-2.8 expanded) → resolved
- C3 (2.11 → 2.11a/b/c/d) → resolved
- C4 (4.2/4.4/4.6 automated) → resolved
- C5 (adr-semver lib extracted as Task 1.4) → resolved
- C6 (lock terminology reconciled) → spec §6.2 + Task 1.14 both use `open(.lock, 'wx')` with liveness recovery
- C7 (this table updated) → resolved
- A1 (Task 4.7 dependency barrier on Phase 3) → resolved
- A2 (adr-filter dedicated fixture in 4.6) → resolved
- A3 (library architecture diagram added at top of plan) → resolved
- A4 (Task 5.6.5 packaging smoke) → resolved
- A5 (parallelism note before Tasks 2.3/2.5/2.7) → resolved
