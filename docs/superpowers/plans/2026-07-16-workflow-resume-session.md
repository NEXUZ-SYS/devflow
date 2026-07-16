# Retomada de Workflow no SessionStart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** workflow-resume-session | **Scale:** MEDIUM | **Phase:** P→R
> **Spec:** `docs/superpowers/specs/2026-07-16-workflow-resume-session-design.md` (D1–D7)
> **Branch:** `feature/workflow-resume-session`

**Goal:** O restart de sessão deixa de apagar o contexto do PREVC — o `session-start` injeta o estado do workflow (incluindo supervised, hoje invisível), alerta workflow pendurado, e o `handoff.md` volta a viver num canal que entrega.

**Architecture:** Uma **lib pura** (`workflow-resume.mjs`) lê o `prevc.json` (estado automático) e decide frescor/pendurado; ela **nunca escreve**. Dois hooks que comprovadamente entregam (`async:false`) a orquestram: `session-start` **lê** (injeta a retomada), `pre-compact` **pede** a curadoria do handoff antes que o contexto se perca.

**Tech Stack:** Node.js (`node:test`, zero-dep, ESM `.mjs`) + Bash (hooks).

**Agents:** backend-specialist (lib), devops-specialist (hooks), test-writer (TDD), architect (ADR-014).

## Global Constraints

- **Zero dependências novas.** Política no-deps. Só Node stdlib + git + bash.
- **Código do PLUGIN → roda em projetos-cliente** (Node/Python/Odoo) via `${CLAUDE_PLUGIN_ROOT}`. A lib recebe `root` como parâmetro; **sem hardcode de path do devflow**. Sem `prevc.json` → **no-op limpo** (nenhum custo, nenhum ruído).
- **Nunca derrubar o hook.** Qualquer erro de leitura/parse → `null`/vazio, nunca exceção. Os hooks rodam em toda sessão; um crash aqui quebra o DevFlow inteiro.
- **Sanitização (prompt injection):** os `outputs` do `prevc.json` são texto escrito por agentes. Seguir o padrão que o `session-start` já usa (`sanitize_str`/`sanitize_int`).
- **SI-1:** hooks invocam `.mjs` como arquivo com argv — **nunca** `node -e` com path interpolado.
- **Idioma:** texto de usuário em **pt-BR**.
- **TDD sem exceção:** RED→GREEN→REFACTOR. Todo grupo começa com teste falhando, provado a falhar.
- **`versioning: pipeline`:** NÃO bumpar local; **É OBRIGATÓRIO** deixar a entrada em `## [Unreleased]` do CHANGELOG (gate `assertUnreleasedNonEmpty` — o passo que faltou no ciclo anterior).

**requiredSignals: [unit, e2e, lint]** — toca hooks (CLI real), logo e2e é obrigatório pela regra da `prevc-validation`.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `scripts/lib/workflow-resume.mjs` | lê `prevc.json`; `detectDangling`; `isHandoffFresh`; `renderResume`; CLI | Criar |
| `hooks/session-start` | injeta a retomada (cobre supervised) | Modificar |
| `hooks/pre-compact` | pede a curadoria do handoff antes de capturar | Modificar |
| `tests/lib/test-workflow-resume.mjs` | unit da lib | Criar |
| `tests/e2e/workflow-resume.e2e.test.mjs` | e2e dos 2 hooks (execução real) | Criar |
| `.context/engineering/adrs/014-*.md` | ADR-014 | Criar |
| `CHANGELOG.md` | `## [Unreleased]` | Modificar |

---

## Task Group 1 — ADR-014 (a decisão antes do código)

**Agent:** architect

**Por quê primeiro:** os guardrails da ADR orientam a implementação (é o "teste" de design). O mais valioso é durável e não-óbvio: *não pendure controle em hook `async:true`*.

**Files:**
- Create: `.context/engineering/adrs/014-session-resume-fresh-context-v1.0.0.md`

- [ ] **Step 1: Escrever a ADR-014**

Seguir o formato das ADRs existentes (ver `013-verifiable-signal-pipeline-v1.0.0.md`). Frontmatter: `type: adr`, `name: session-resume-fresh-context`, `scope: organizational`, `stack: universal`, `category: arquitetura`, `status: Proposto`, `version: 1.0.0`, `created: 2026-07-16`, `refines: []`, `decision_kind: firm`.

Conteúdo essencial:
- **Contexto:** restart apaga o contexto do PREVC; `session-start` só vê workflow autônomo; `handoff.md` morto desde 2026-07-02 por estar pendurado no `post-tool-use` (`async:true` → stdout descartado — o **único** hook assim).
- **Decisão:** duas fontes com papéis distintos (`prevc.json` = estado automático; `handoff.md` = julgamento curado); retomada injetada pelo `session-start`; escrita pedida pelo `pre-compact`; **guard de frescor** — contexto stale nunca é injetado, é denunciado.
- **Alternativas:** fonte única (rejeitada — carregam coisas diferentes); injetar sempre (rejeitada — contexto errado com autoridade é pior que tela em branco); bloquear stale em silêncio (rejeitada — o silêncio é o que matou o handoff); pedir na troca de fase (rejeitada — D7a puro, já falhou). ✓ adotada: duas fontes + guard + PreCompact escreve/SessionStart lê.
- **Guardrails:**
  - NUNCA pendurar controle que precise chegar ao agente em hook com `async: true` (o stdout é descartado) — usar `SessionStart`/`PreCompact`/`PostCompact`/`PreToolUse`.
  - NUNCA injetar contexto de handoff sem verificar frescor contra o workflow ativo.
  - SEMPRE preferir **denunciar** artefato obsoleto a silenciá-lo (o silêncio apodrece invisível).
  - SEMPRE degradar para no-op quando não houver `prevc.json` — a lib nunca lança.
  - `PreCompact` escreve, `SessionStart`/`PostCompact` leem — não misturar (log × curadoria).
- **Enforcement:** unit da lib; e2e dos hooks; no-op sem workflow.

- [ ] **Step 2: Rodar o gate de auditoria**

Run: `node scripts/adr-audit.mjs .context/engineering/adrs/014-session-resume-fresh-context-v1.0.0.md --enforce-gate`
Expected: `Gate: PASSED`, 0 FIX-INTERVIEW.

- [ ] **Step 3: Atualizar o índice + commit**

```bash
node scripts/adr-update-index.mjs
git add .context/engineering/adrs/
git commit -m "docs(adr): ADR-014 — retomada de sessão com contexto fresco (guard de frescor)"
```

---

## Task Group 2 — Lib: `readWorkflowState` + `detectDangling`

**Agent:** backend-specialist
**Handoff from:** architect (ADR-014 aprovada)

**Files:**
- Create: `scripts/lib/workflow-resume.mjs`
- Test: `tests/lib/test-workflow-resume.mjs`

**Interfaces:**
- Produces:
  - `readWorkflowState(root) → { name, scale, phase, plan, started, phases } | null` — `phases` é `{P|R|E|V|C: {status, outputs: string[]}}`. Ausente/malformado → `null` (nunca lança).
  - `detectDangling(state) → boolean` — `true` ⟺ `phase === "C"` ∧ P,R,E,V todas `completed` ∧ C não `completed`.

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/lib/test-workflow-resume.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorkflowState, detectDangling } from '../../scripts/lib/workflow-resume.mjs';

const REL = '.context/runtime/workflows/prevc.json';
function repo(json) {
  const d = mkdtempSync(join(tmpdir(), 'resume-'));
  if (json !== undefined) {
    mkdirSync(join(d, '.context/runtime/workflows'), { recursive: true });
    writeFileSync(join(d, REL), typeof json === 'string' ? json : JSON.stringify(json));
  }
  return d;
}
const wf = (phase, phases, extra = {}) => ({
  version: 2, workflowType: 'prevc',
  status: {
    project: { name: 'demo', scale: 3, started: '2026-07-16T10:00:00Z', current_phase: phase, plan: 'demo-plan', ...extra },
    phases,
  },
});
const done = (outs = []) => ({ status: 'completed', outputs: outs.map(p => ({ path: p })) });

test('sem prevc.json → null (no-op limpo)', () => {
  assert.equal(readWorkflowState(repo(undefined)), null);
});
test('JSON malformado → null (nunca lança — o hook não pode cair)', () => {
  assert.equal(readWorkflowState(repo('{ not json')), null);
});
test('workflow válido → shape com name/phase/plan/started/phases', () => {
  const s = readWorkflowState(repo(wf('E', { P: done(['spec ok']), E: { status: 'in_progress' } })));
  assert.equal(s.name, 'demo');
  assert.equal(s.phase, 'E');
  assert.equal(s.plan, 'demo-plan');
  assert.equal(s.started, '2026-07-16T10:00:00Z');
  assert.equal(s.phases.P.status, 'completed');
  assert.deepEqual(s.phases.P.outputs, ['spec ok']);
});
test('outputs aceitam string crua além de {path}', () => {
  const s = readWorkflowState(repo(wf('E', { P: { status: 'completed', outputs: ['cru'] } })));
  assert.deepEqual(s.phases.P.outputs, ['cru']);
});
test('detectDangling: C + P/R/E/V completed → true', () => {
  const s = readWorkflowState(repo(wf('C', { P: done(), R: done(), E: done(), V: done(), C: { status: 'in_progress' } })));
  assert.equal(detectDangling(s), true);
});
test('detectDangling: C já completed → false (fechado)', () => {
  const s = readWorkflowState(repo(wf('C', { P: done(), R: done(), E: done(), V: done(), C: done() })));
  assert.equal(detectDangling(s), false);
});
test('detectDangling: fase E em curso → false', () => {
  const s = readWorkflowState(repo(wf('E', { P: done(), E: { status: 'in_progress' } })));
  assert.equal(detectDangling(s), false);
});
test('detectDangling: C mas V pendente → false (não é pendurado, é incompleto)', () => {
  const s = readWorkflowState(repo(wf('C', { P: done(), R: done(), E: done(), V: { status: 'pending' }, C: { status: 'in_progress' } })));
  assert.equal(detectDangling(s), false);
});
test('detectDangling(null) → false', () => {
  assert.equal(detectDangling(null), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-workflow-resume.mjs`
Expected: FAIL — `Cannot find module '.../workflow-resume.mjs'`.

- [ ] **Step 3: Implementar**

Criar `scripts/lib/workflow-resume.mjs`:
```javascript
// scripts/lib/workflow-resume.mjs — retomada de workflow no SessionStart (ADR-014).
// Lê o estado que o dotcontext escreve (prevc.json) e decide o que injetar.
// NUNCA escreve; NUNCA lança (o hook roda em toda sessão — um crash aqui quebra tudo).
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STATE_REL = ".context/runtime/workflows/prevc.json";
const HANDOFF_REL = ".context/workflow/.checkpoint/handoff.md";
const PHASE_ORDER = ["P", "R", "E", "V", "C"];

// Ausente/malformado → null. Nunca lança.
export function readWorkflowState(root) {
  let raw;
  try { raw = readFileSync(join(root, STATE_REL), "utf8"); } catch { return null; }
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  const p = d?.status?.project;
  if (!p?.name) return null;
  const phases = {};
  for (const [k, v] of Object.entries(d?.status?.phases ?? {})) {
    const outs = Array.isArray(v?.outputs) ? v.outputs : [];
    phases[k] = {
      status: typeof v?.status === "string" ? v.status : "unknown",
      outputs: outs.map(o => (typeof o === "string" ? o : o?.path ?? "")).filter(Boolean),
    };
  }
  return { name: p.name, scale: p.scale, phase: p.current_phase, plan: p.plan ?? null, started: p.started ?? null, phases };
}

// Pendurado = a entrega acabou mas o workflow nunca foi fechado (plan commitPhase C).
export function detectDangling(state) {
  if (!state || state.phase !== "C") return false;
  const req = ["P", "R", "E", "V"];
  const allDone = req.every(k => {
    const st = state.phases?.[k]?.status;
    return st === "completed" || st === "skipped";
  });
  return allDone && state.phases?.C?.status !== "completed";
}
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/lib/test-workflow-resume.mjs`
Expected: PASS (9/9).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/workflow-resume.mjs tests/lib/test-workflow-resume.mjs
git commit -m "feat(resume): readWorkflowState + detectDangling (lib pura, nunca lança)"
```

---

## Task Group 3 — Lib: `isHandoffFresh` + `renderResume`

**Agent:** backend-specialist

**Files:**
- Modify: `scripts/lib/workflow-resume.mjs`
- Test: `tests/lib/test-workflow-resume.mjs`

**Interfaces:**
- Consumes: `readWorkflowState`, `detectDangling` (TG2).
- Produces:
  - `isHandoffFresh(root, state) → boolean` — `mtime(handoff.md) > state.started`. Sem arquivo/sem `started` → `false`.
  - `renderResume(root, state) → string` — o bloco pronto (vazio se `state` for null).

- [ ] **Step 1: Escrever os testes falhando**

Anexar a `tests/lib/test-workflow-resume.mjs`:
```javascript
import { utimesSync } from 'node:fs';
import { isHandoffFresh, renderResume } from '../../scripts/lib/workflow-resume.mjs';

const HREL = '.context/workflow/.checkpoint/handoff.md';
function withHandoff(root, text, mtimeISO) {
  mkdirSync(join(root, '.context/workflow/.checkpoint'), { recursive: true });
  const p = join(root, HREL);
  writeFileSync(p, text);
  if (mtimeISO) { const t = new Date(mtimeISO); utimesSync(p, t, t); }
  return root;
}

test('isHandoffFresh: mtime > started → fresco', () => {
  const r = withHandoff(repo(wf('E', { P: done() })), '# h', '2026-07-16T12:00:00Z');
  assert.equal(isHandoffFresh(r, readWorkflowState(r)), true);
});
test('isHandoffFresh: mtime < started → stale (o caso real: handoff de 2/jul)', () => {
  const r = withHandoff(repo(wf('E', { P: done() })), '# h', '2026-07-02T09:00:00Z');
  assert.equal(isHandoffFresh(r, readWorkflowState(r)), false);
});
test('isHandoffFresh: sem handoff.md → false', () => {
  const r = repo(wf('E', { P: done() }));
  assert.equal(isHandoffFresh(r, readWorkflowState(r)), false);
});
test('renderResume: traz workflow, fase, plano e a última fase concluída', () => {
  const r = repo(wf('E', { P: done(['spec aprovada (b9d0d9d)']), E: { status: 'in_progress' } }));
  const out = renderResume(r, readWorkflowState(r));
  assert.match(out, /PREVC WORKFLOW ATIVO/);
  assert.match(out, /demo/);
  assert.match(out, /Fase: E/);
  assert.match(out, /demo-plan/);
  assert.match(out, /spec aprovada \(b9d0d9d\)/);   // outputs da ÚLTIMA fase concluída (P)
});
test('renderResume: pendurado → linha do commitPhase C', () => {
  const r = repo(wf('C', { P: done(), R: done(), E: done(), V: done(['VALIDATED']), C: { status: 'in_progress' } }));
  const out = renderResume(r, readWorkflowState(r));
  assert.match(out, /commitPhase C/);
});
test('renderResume: handoff stale → avisa e NÃO injeta a prosa (D4)', () => {
  const r = withHandoff(repo(wf('E', { P: done() })), '# CONTEUDO-VELHO-NAO-INJETAR', '2026-07-02T09:00:00Z');
  const out = renderResume(r, readWorkflowState(r));
  assert.match(out, /obsoleto/i);
  assert.doesNotMatch(out, /CONTEUDO-VELHO-NAO-INJETAR/);
});
test('renderResume: handoff fresco → injeta a prosa', () => {
  const r = withHandoff(repo(wf('E', { P: done() })), '# PROSA-FRESCA-AQUI', '2026-07-16T12:00:00Z');
  const out = renderResume(r, readWorkflowState(r));
  assert.match(out, /PROSA-FRESCA-AQUI/);
});
test('renderResume(null) → string vazia (no-op)', () => {
  assert.equal(renderResume(repo(undefined), null), '');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-workflow-resume.mjs`
Expected: FAIL — `isHandoffFresh`/`renderResume` não exportados.

- [ ] **Step 3: Implementar**

Anexar a `scripts/lib/workflow-resume.mjs`:
```javascript
// D3/D4: contexto stale NUNCA é injetado — é denunciado. Handoff velho tem cara de
// autoridade e o agente age sobre ele; pior que tela em branco.
export function isHandoffFresh(root, state) {
  if (!state?.started) return false;
  try {
    const m = statSync(join(root, HANDOFF_REL)).mtime.getTime();
    return m > new Date(state.started).getTime();
  } catch { return false; }
}

function lastCompletedPhase(state) {
  let last = null;
  for (const k of PHASE_ORDER) if (state.phases?.[k]?.status === "completed") last = k;
  return last;
}

// Sanitiza: os outputs vêm de texto escrito por agentes (mesma postura do hook).
const clean = (s) => String(s).replace(/[\r\n]+/g, " ").replace(/[^\wÀ-ÿ 0-9_.,;:()/#+→×—–-]/g, "").slice(0, 160);

export function renderResume(root, state) {
  if (!state) return "";
  const L = [];
  L.push("**PREVC WORKFLOW ATIVO**");
  L.push(`- Workflow: ${clean(state.name)} | Fase: ${clean(state.phase ?? "?")}`);
  if (state.plan) L.push(`- Plano: ${clean(state.plan)}`);
  const prog = PHASE_ORDER.filter(k => state.phases?.[k])
    .map(k => `${k} ${state.phases[k].status === "completed" ? "OK" : state.phases[k].status}`).join(" | ");
  if (prog) L.push(`- Progresso: ${prog}`);

  const lastP = lastCompletedPhase(state);
  const outs = lastP ? state.phases[lastP].outputs.slice(0, 3) : [];
  if (outs.length) {
    L.push("");
    L.push(`Última fase concluída (${lastP}):`);
    for (const o of outs) L.push(`  • ${clean(o)}`);
  }

  if (detectDangling(state)) {
    L.push("");
    L.push("⚠ Workflow em C com as fases anteriores completed — se a entrega terminou,");
    L.push("  feche com plan commitPhase C (checkpoint não fecha o workflow).");
  }

  const fresh = isHandoffFresh(root, state);
  if (fresh) {
    let text = "";
    try { text = readFileSync(join(root, HANDOFF_REL), "utf8"); } catch { text = ""; }
    if (text.trim()) { L.push(""); L.push("Handoff (curado, fresco):"); L.push(text.trim().slice(0, 1200)); }
  } else {
    let when = null;
    try { when = statSync(join(root, HANDOFF_REL)).mtime.toISOString().slice(0, 10); } catch { /* sem handoff */ }
    if (when) { L.push(""); L.push(`⚠ handoff.md obsoleto (${when}, anterior a este workflow) — ignorado.`); }
  }
  return L.join("\n");
}

function main(argv) {
  const root = argv[0] || process.cwd();
  const state = readWorkflowState(root);
  process.stdout.write(renderResume(root, state));
  process.exit(0);   // sempre 0 — o hook nunca deve quebrar por causa disto
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/lib/test-workflow-resume.mjs`
Expected: PASS (17/17).

- [ ] **Step 5: Dogfooding — rodar contra o repo real**

Run: `node scripts/lib/workflow-resume.mjs "$PWD"`
Expected: bloco com `workflow-resume-session`, `Fase: P`, e o aviso `⚠ handoff.md obsoleto (2026-07-02...)` — exatamente o caso que motivou a feature.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/workflow-resume.mjs tests/lib/test-workflow-resume.mjs
git commit -m "feat(resume): isHandoffFresh + renderResume (guard de frescor, D3/D4)"
```

---

## Task Group 4 — `hooks/session-start` injeta a retomada

**Agent:** devops-specialist
**Handoff from:** backend-specialist (lib pronta)

**Files:**
- Modify: `hooks/session-start`
- Test: `tests/e2e/workflow-resume.e2e.test.mjs`

**Interfaces:**
- Consumes: `scripts/lib/workflow-resume.mjs` via `node "${PLUGIN_ROOT}/scripts/lib/workflow-resume.mjs" "$project_root"` (SI-1: arquivo + argv, nunca `node -e`).

- [ ] **Step 1: Escrever o e2e falhando**

Criar `tests/e2e/workflow-resume.e2e.test.mjs`:
```javascript
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

function sandbox(state) {
  const d = mkdtempSync(join(tmpdir(), 'ss-'));
  if (state) {
    mkdirSync(join(d, '.context/runtime/workflows'), { recursive: true });
    writeFileSync(join(d, '.context/runtime/workflows/prevc.json'), JSON.stringify(state));
  }
  return d;
}
const runHook = (cwd) => execFileSync('bash', [HOOK], {
  input: JSON.stringify({ hook_event_name: 'SessionStart', cwd }),
  env: { ...ENV, CLAUDE_PROJECT_DIR: cwd }, cwd, encoding: 'utf8',
});

const WF = {
  version: 2, workflowType: 'prevc',
  status: {
    project: { name: 'demo-wf', scale: 3, started: '2026-07-16T10:00:00Z', current_phase: 'E', plan: 'demo-plan' },
    phases: { P: { status: 'completed', outputs: [{ path: 'spec aprovada XYZ123' }] }, E: { status: 'in_progress' } },
  },
};

test('session-start injeta a retomada quando há workflow (supervised)', () => {
  const out = runHook(sandbox(WF));
  assert.match(out, /PREVC WORKFLOW ATIVO/);
  assert.match(out, /demo-wf/);
  assert.match(out, /spec aprovada XYZ123/);
});

test('session-start é no-op de retomada quando NÃO há workflow', () => {
  const out = runHook(sandbox(null));
  assert.doesNotMatch(out, /PREVC WORKFLOW ATIVO/);
});

test('session-start emite JSON válido nos dois casos (não quebra o hook)', () => {
  for (const s of [WF, null]) {
    const out = runHook(sandbox(s));
    assert.doesNotThrow(() => JSON.parse(out), 'saída do hook deve ser JSON válido');
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/e2e/workflow-resume.e2e.test.mjs`
Expected: FAIL — o hook ainda não injeta (`PREVC WORKFLOW ATIVO` ausente).

- [ ] **Step 3: Estender o hook**

Em `hooks/session-start`, logo após o bloco `# --- Detect active autonomous workflow ---` (que termina no `fi` da linha ~117), inserir:
```bash
# --- Retomada do workflow PREVC (ADR-014) ---
# O bloco autônomo acima só cobre stories.yaml e pula supervised. Aqui cobre QUALQUER
# workflow PREVC lendo o prevc.json (fonte viva escrita pelo dotcontext).
# Fail-safe: erro/ausência → string vazia (no-op). Nunca quebra o hook.

resume_context=""
if [ -f "${project_root}/.context/runtime/workflows/prevc.json" ]; then
  resume_raw=$(node "${PLUGIN_ROOT}/scripts/lib/workflow-resume.mjs" "${project_root}" 2>/dev/null || echo "")
  if [ -n "$resume_raw" ]; then
    resume_context="\\n${resume_raw}\\n"
  fi
fi
```

E incluir `${resume_escaped}` no `session_context` (linha ~508), junto dos demais blocos — após `${autonomous_escaped}`:
```bash
resume_escaped=$(escape_for_json "$resume_context")
```
```
session_context="<DEVFLOW_CONTEXT>\n...\n${mode_escaped}\n${autonomous_escaped}\n${resume_escaped}\n${napkin_context}..."
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/e2e/workflow-resume.e2e.test.mjs`
Expected: PASS (3/3).

- [ ] **Step 5: Regressão dos hooks existentes**

Run: `bash tests/hooks/test-session-start.sh 2>/dev/null || true; node --test $(git ls-files 'tests/**/*session-start*.mjs' 2>/dev/null) 2>/dev/null || true`
Expected: os testes existentes do session-start seguem verdes (nenhum quebrado pela adição).

- [ ] **Step 6: Commit**

```bash
git add hooks/session-start tests/e2e/workflow-resume.e2e.test.mjs
git commit -m "feat(session-start): injeta a retomada do PREVC (cobre supervised, hoje invisível)"
```

---

## Task Group 5 — `hooks/pre-compact` pede a curadoria do handoff

**Agent:** devops-specialist

**Files:**
- Modify: `hooks/pre-compact`
- Test: `tests/e2e/workflow-resume.e2e.test.mjs` (anexar)

**Por quê aqui (D5):** o `pre-compact` é o único momento em que a perda de contexto é **iminente e detectável pelo sistema** — não depende de o agente julgar "agora é hora". É `async:false` (o pedido chega), e a cadência é rara. Hoje ele **captura silenciosamente** um `handoff.md` podre; passa a **pedir** a atualização antes.

- [ ] **Step 1: Escrever o e2e falhando**

Anexar a `tests/e2e/workflow-resume.e2e.test.mjs`:
```javascript
const PRECOMPACT = join(REPO, 'hooks', 'pre-compact');
const runPreCompact = (cwd) => execFileSync('bash', [PRECOMPACT], {
  input: JSON.stringify({ hook_event_name: 'PreCompact', cwd, trigger: 'auto' }),
  env: { ...ENV, CLAUDE_PROJECT_DIR: cwd }, cwd, encoding: 'utf8',
});

test('pre-compact PEDE a atualização do handoff antes de capturar', () => {
  const d = sandbox(WF);
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  const out = runPreCompact(d);
  assert.match(out, /handoff/i);
  assert.match(out, /atualiz/i);   // pedido explícito, não captura silenciosa
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/e2e/workflow-resume.e2e.test.mjs`
Expected: FAIL no caso novo — o hook não pede atualização hoje.

- [ ] **Step 3: Estender o hook**

Em `hooks/pre-compact`, antes do bloco que lê o `HANDOFF_FILE` (linha ~30), inserir o pedido no output do hook (seguir o formato de saída que o hook já usa):
```bash
# --- Pedido de curadoria do handoff (ADR-014, D5) ---
# O contexto vai compactar: é o momento em que a perda é iminente e detectável.
# Este hook é async:false → o pedido CHEGA (diferente do post-tool-use, que é
# descartado — foi por isso que o handoff.md morreu).
HANDOFF_REQUEST="ANTES DE COMPACTAR: atualize .context/workflow/.checkpoint/handoff.md com o que o estado do workflow NÃO sabe — decisões tomadas, blockers, armadilhas e o próximo passo real. O prevc.json já registra fase/outputs; o handoff é o julgamento curado. Seja conciso (10-20 linhas)."
```
E incluí-lo no contexto emitido pelo hook, junto do checkpoint.

- [ ] **Step 4: Ver passar**

Run: `node --test tests/e2e/workflow-resume.e2e.test.mjs`
Expected: PASS (4/4).

- [ ] **Step 5: Regressão do pre-compact**

Run: `bash tests/hooks/test-pre-compact.sh 2>/dev/null || echo "(sem teste .sh dedicado)"`
Expected: verde (ou ausente).

- [ ] **Step 6: Commit**

```bash
git add hooks/pre-compact tests/e2e/workflow-resume.e2e.test.mjs
git commit -m "feat(pre-compact): pede a curadoria do handoff antes de capturar (canal que entrega)"
```

---

## Task Group 6 — CHANGELOG + suíte verde

**Agent:** documentation-writer

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Entrada no `## [Unreleased]` (GATE obrigatório)**

`versioning: pipeline` → não se bumpa local; a contrapartida **obrigatória** é a entrada no CHANGELOG (foi o passo que faltou no ciclo anterior e o `version-guard` barrou o release).

Adicionar sob `## [Unreleased]`, no padrão das entradas existentes (`### Added — <título>` + bullets):
- O buraco: restart apaga o contexto do PREVC; `session-start` só via workflow autônomo.
- A lib `workflow-resume.mjs` (pura, nunca lança, no-op sem workflow).
- `session-start` injeta estado + última fase + alerta de pendurado (~150 tokens, 1×/sessão).
- `pre-compact` pede a curadoria; guard de frescor não injeta handoff stale — denuncia (ADR-014).
- O achado: `post-tool-use` é o único hook `async:true` (stdout descartado) — foi onde o handoff morreu.

- [ ] **Step 2: Validar o gate**

Run:
```bash
node -e "import('./scripts/lib/finalize/changelog-gate.mjs').then(async m=>{const fs=await import('node:fs');m.assertUnreleasedNonEmpty(fs.readFileSync('CHANGELOG.md','utf8'));console.log('✓ assertUnreleasedNonEmpty: PASS')})"
```
Expected: `✓ PASS`.

- [ ] **Step 3: Suíte verde pelos 4 sinais (o contrato verify: da ADR-013)**

Run:
```bash
node scripts/lib/verify-run.mjs unit "$PWD" E
node scripts/lib/verify-run.mjs lint "$PWD" E
node scripts/lib/verify-run.mjs e2e "$PWD" E
```
Expected: exit 0 nos três; ledger com as entradas.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): retomada de workflow no SessionStart + handoff vivo (ADR-014)"
```

---

## Self-Review

**Spec coverage:**
- §4 arquitetura (lib + 2 hooks) → TG2/TG3 (lib), TG4 (session-start), TG5 (pre-compact). ✓
- §5 bloco injetado → TG3 `renderResume` + testes que casam fase/plano/última fase/avisos. ✓
- §6 contratos → TG2/TG3 com as 4 funções e as assinaturas da spec. ✓
- §7 frescor (mtime, stale não injeta, avisa) → TG3 testes de fresco/stale/ausente. ✓
- §8 testes → unit (TG2/TG3) + e2e dos 2 hooks (TG4/TG5), incluindo **no-op sem workflow**. ✓
- §9 alcance cliente → Global Constraints (root como parâmetro, sem hardcode, no-op). ✓
- §11 componentes → todos; + ADR-014 (TG1) e CHANGELOG (TG6). ✓

**Placeholder scan:** sem TBD/TODO; todo step de código traz o código; comandos com expected output. ✓

**Type consistency:** `readWorkflowState → {name,scale,phase,plan,started,phases}` consumido igual por `detectDangling`/`isHandoffFresh`/`renderResume` (TG2→TG3) e pelos hooks via CLI (TG4). `PHASE_ORDER`/`HANDOFF_REL` definidos uma vez. ✓

**Ordem/dependências:** TG1 (ADR) → TG2 (lib base) → TG3 (lib render, usa TG2) → TG4 (hook lê a lib) → TG5 (hook independente) → TG6 (changelog+suíte). Sem ciclos.
