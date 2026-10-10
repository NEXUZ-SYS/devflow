# Fase sincronizada no roteamento (H1) e gate de evidência por fase (D5) — Plano de implementação

> **DevFlow workflow:** `routing-phase-sync-and-autonomous-gates` | **Escala:** LARGE | **Fase:** P→R
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o roteamento acompanha a fase real do PREVC dentro do turno (H1), e o `workflow-advance` só passa com a evidência mínima da fase atual (D5).

**Architecture:** H1 muda só o adaptador `hooks/router.mjs` (releitura do `prevc.json` por `(mtimeMs, size)` no `turn.step` e no `agent.spawn`) e renomeia o ponto de entrada da fase no core puro. D5 é uma lib pura (`scripts/lib/phase-evidence.mjs`) com a matriz, um CLI coletor (`scripts/phase-gate.mjs`) e um hook PreToolUse dedicado (`hooks/pre-tool-use-phase-gate`), configurável por `prevc.evidenceGate` no `.devflow.yaml`.

**Tech Stack:** Node ≥ 20 (ESM, `node:test`), bash, git, function hooks do Claude Code (mod).

**Agents:** backend-specialist, test-writer, documentation-writer, architect (ADR).

**Spec:** `docs/superpowers/specs/2026-10-10-routing-phase-sync-and-evidence-gate-design.md`

```yaml
requiredSignals: [unit, integration, e2e, lint, standards]
```

## Global Constraints

- Idioma: pt-BR em código comentado, docs, mensagens de erro e commits (termos técnicos mantidos).
- Commits sempre com caminhos explícitos (`git add <paths>` / `git commit -- <paths>`). NUNCA `git add .`/`-A`. O WIP do operador (`.context/.devflow.yaml`, `.context/plans/model-routing.md`, `.context/workflow/.checkpoint/last.json`, `.gitignore`, `docs/jev-*.md`, `docs/screenshots/`, `docs/test-writer.md`, `tsconfig.json`, `docs/superpowers/specs/2026-10-08-session-start-context-budget-design.md`) nunca entra em commit.
- Repositório público: nenhum caminho local absoluto, nome de projeto privado ou conteúdo de projeto de cliente em código, docs ou commits.
- Testes que mexem em git/arquivos rodam em cópia `mkdtemp` (nunca no repo versionado).
- Subprocessos só por `execFile`/`execFileSync` com argv (nunca `exec` ou interpolação em shell).
- Hooks: saída é um JSON numa linha ou nada; o stdin é lido até o fim; nunca `permissionDecision: "allow"`.
- `prevc.evidenceGate`: `block | warn | off`; ausente → `block`; inválido → `block`; erro interno do coletor → passa com aviso.
- Rodadas dos sinais: `bash tests/run-unit.sh`, `bash tests/run-integration.sh`, `bash tests/run-e2e.sh`, `bash tests/run-lint.sh`.
- Mensagens de commit: Conventional Commits em pt-BR, terminando com as linhas de atribuição da sessão.

## Review Focus

1. `prevc.json` escrito pela metade no meio do turno (escrita não atômica do dotcontext) → o mod mantém a fase anterior e tenta de novo no próximo passo (Task 2, teste "JSON parcial").
2. `stories.yaml` sobrado de um workflow anterior, com stories `pending` → ignorado; não bloqueia a saída de E (Task 5, teste "stories de outro workflow").
3. Squash merge com a branch de feature apagada no remoto → a C conclui porque a base tem commit novo (Task 5, teste "squash na base remota").
4. Projeto sem remoto (o laboratório roda assim) → merge local na `main` conclui a C (Task 5, teste "merge local sem remoto").
5. Mensagem de commit ou `echo` citando "dotcontext workflow advance" entre aspas → o hook não trata como avanço (Task 4, teste do `isAdvanceEvent`; Task 6, E2E com `git commit -m`).

---

## Task 1: Core — `onPhaseChange` (H1)

**Agent:** backend-specialist
**Tier:** cheap
**Standards:** std-commit-hygiene, std-pre-commit-hygiene
**Tests:** unit

**Files:**
- Modify: `scripts/lib/router-core.mjs:19-22`
- Test: `tests/lib/router-core.test.mjs` (acrescentar ao fim)

**Interfaces:**
- Produces: `onPhaseChange(state, { phase }) → void` (fase nova → grava e zera `state.skill`; igual → nada). `onTurnStart` continua exportado e é a mesma função.

- [ ] **Step 1: Escrever o teste que falha** — acrescentar ao fim de `tests/lib/router-core.test.mjs`:

```js
test("H1: onPhaseChange troca a fase e zera a skill; mesma fase preserva a skill; onTurnStart é alias", () => {
  const s = C.createRouterState();
  C.onPhaseChange(s, { phase: "R" });
  C.onSkill(s, { skill: "devflow:prevc-review" });
  C.onPhaseChange(s, { phase: "R" });
  assert.equal(s.skill, "devflow:prevc-review");
  C.onPhaseChange(s, { phase: "E" });
  assert.equal(s.phase, "E");
  assert.equal(s.skill, null);
  C.onPhaseChange(s, { phase: undefined });
  assert.equal(s.phase, null);
  assert.equal(C.onTurnStart, C.onPhaseChange);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/router-core.test.mjs`
Expected: FAIL com `C.onPhaseChange is not a function`.

- [ ] **Step 3: Implementar** — em `scripts/lib/router-core.mjs`, trocar a função `onTurnStart` por:

```js
// Fase nova → grava e zera a skill da sessão. O adaptador chama no turn.start e sempre que o
// prevc.json muda no meio do turno (H1, spec 2026-10-10 §3).
export function onPhaseChange(state, { phase }) {
  const p = phase ?? null;
  if (p !== state.phase) { state.phase = p; state.skill = null; }
}

export const onTurnStart = onPhaseChange; // nome antigo, mantido para consumidores e testes
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/lib/router-core.test.mjs`
Expected: PASS (todos, inclusive os antigos que usam `onTurnStart`).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/router-core.mjs tests/lib/router-core.test.mjs
git commit -m "refactor(router-core): onPhaseChange como ponto único de troca de fase" -- scripts/lib/router-core.mjs tests/lib/router-core.test.mjs
```

---

## Task 2: Adaptador — releitura da fase no `turn.step` e no `agent.spawn` (H1)

**Agent:** backend-specialist
**Tier:** standard
**Handoff from:** Task 1
**Standards:** std-commit-hygiene, std-pre-commit-hygiene
**Tests:** integration (mod carregado de verdade com `$` falso sobre fs real)

**Files:**
- Modify: `hooks/router.mjs` (estado `S`, `safeRead`, `onTurnStart`, `onAgentSpawn`, `routerTurnStep`)
- Test: `tests/integration/test-router-mod.mjs` (acrescentar ao fim; reaproveita `mkRepo`, `load`, `YAML_LEDGER`, `OPUS`, `SONNET`)

**Interfaces:**
- Consumes: `core.onPhaseChange` (Task 1); `phaseFromPrevcJson`, `workflowFromPrevcJson` de `scripts/lib/model-routing.mjs` (existentes).
- Produces: nada exportado; comportamento: fase do roteador = fase do `prevc.json` no momento do passo/despacho.

- [ ] **Step 1: Escrever os testes que falham** — acrescentar ao fim de `tests/integration/test-router-mod.mjs`:

```js
// ─── H1: fase relida no meio do turno ────────────────────────────────────────────────────────────
const PREVC_REL = ".context/runtime/workflows/prevc.json";
// Grava a fase e empurra o mtime para frente: duas escritas no mesmo ms não podem parecer iguais.
function writePrevc(root, text, bumpS) {
  const f = path.join(root, PREVC_REL);
  fs.writeFileSync(f, text);
  const t = new Date(Date.now() + bumpS * 1000);
  fs.utimesSync(f, t, t);
}
const phaseJson = (p) => JSON.stringify({ status: { project: { current_phase: p } } });

async function sessionInR(yaml = YAML_ON) {
  const root = mkRepo(yaml, "R");
  const H = await load({ root });
  await H.call("session.start", {});
  // aprende o ID do sonnet (a troca efetiva de modelo exige um ID completo)
  await H.call("agent.spawn", { prompt: "p", fork: false, subagentType: "devflow:code-reviewer", parentModel: OPUS }, async () => ({ agentId: "a0", model: SONNET }));
  await H.call("turn.start", { text: "x", turnId: "t1" });
  return { root, H };
}
const stepAt = (H, i) => H.step({ turnId: "t1", index: i, model: OPUS, effort: "xhigh", messageCount: i + 1 });

test("H1: a fase muda no meio do turno → o passo seguinte da sessão já usa a fase nova", async () => {
  const { root, H } = await sessionInR();
  assert.equal((await stepAt(H, 0)).model, OPUS); // R: sessão no teto
  writePrevc(root, phaseJson("E"), 5);
  assert.equal((await stepAt(H, 1)).model, SONNET); // E: sessão em standard, sem novo turn.start
});

test("H1: a fase muda antes do despacho → o ledger do subagente registra a fase nova", async () => {
  const { root, H } = await sessionInR(YAML_LEDGER);
  await stepAt(H, 0);
  writePrevc(root, phaseJson("E"), 5);
  await H.call("agent.spawn", { prompt: "p", fork: false, subagentType: "devflow:documentation-writer", parentModel: OPUS }, async () => ({ agentId: "a1", model: "claude-haiku-5-5" }));
  await H.call("turn.complete", {}, async () => ({ usage: { model: OPUS, input_tokens: 10, output_tokens: 5 } }));
  const entries = H.log.writes.at(-1).text.trim().split("\n").map((l) => JSON.parse(l));
  const sub = entries.find((e) => e.scope === "subagent" && e.agentId === "a1");
  assert.equal(sub.phase, "E");
});

test("H1: mtime e tamanho iguais → o prevc.json não é relido a cada passo", async () => {
  const { H } = await sessionInR();
  const reads = () => H.log.reads.filter((p) => String(p).endsWith(PREVC_REL)).length;
  const before = reads();
  for (let i = 0; i < 4; i++) await stepAt(H, i);
  assert.equal(reads(), before);
});

test("H1: JSON parcial no meio do turno → mantém a fase e relê quando o arquivo fica válido", async () => {
  const { root, H } = await sessionInR();
  await stepAt(H, 0);
  writePrevc(root, "{\"status\":{\"proj", 5); // escrita em andamento
  assert.equal((await stepAt(H, 1)).model, OPUS); // continua em R
  writePrevc(root, phaseJson("E"), 10);
  assert.equal((await stepAt(H, 2)).model, SONNET);
});

test("H1: prevc.json some no meio do turno → mantém a fase (só o turn.start zera)", async () => {
  const { root, H } = await sessionInR();
  writePrevc(root, phaseJson("E"), 5);
  assert.equal((await stepAt(H, 0)).model, SONNET);
  fs.rmSync(path.join(root, PREVC_REL));
  assert.equal((await stepAt(H, 1)).model, SONNET);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/integration/test-router-mod.mjs`
Expected: FAIL nos testes "H1: a fase muda no meio do turno" (`OPUS !== SONNET`), "antes do despacho" (`'R' !== 'E'`) e "JSON parcial" (último passo); os demais podem passar por acaso.

- [ ] **Step 3: Implementar** — em `hooks/router.mjs`:

  a) Constante e estado: logo abaixo de `const MAX_PUB_LOOPS = 100;` acrescentar `const PREVC = ".context/runtime/workflows/prevc.json";` e, no objeto `S`, acrescentar `prevcSig: null,` depois de `workflow: null,`.

  b) Substituir a função `safeRead` por estas duas:

```js
// Contenção da ADR-014 para arquivo do repositório: sem link, só arquivo regular, tamanho limitado,
// caminho real sob a raiz do projeto. Qualquer dúvida → null.
async function safeStat($, rel) {
  try {
    if (!S.cwd) return null;
    const st = await $.fs.stat(`${S.cwd}/${rel}`, { resolve: true }); // absoluto: não depende do cwd do $.fs
    if (st.isLink || st.kind !== "file" || st.size > MAX_FILE) return null;
    if (!st.realPath || !st.realPath.startsWith(S.cwd + "/")) return null;
    return st;
  } catch {
    return null;
  }
}

async function safeRead($, rel) {
  try {
    return (await safeStat($, rel)) ? await $.fs.read(`${S.cwd}/${rel}`) : null;
  } catch {
    return null;
  }
}

// H1 (spec 2026-10-10 §3): a fase vem do prevc.json, relido quando (mtimeMs, size) muda. No turn.start
// (force) lê sempre e arquivo ausente zera a fase, como antes. No meio do turno, qualquer falha (stat,
// leitura, JSON parcial de uma escrita em andamento) mantém a fase atual e tenta de novo no próximo passo.
async function refreshPhase($, force = false) {
  const st = await safeStat($, PREVC);
  if (!st && !force) return;
  const sig = st ? `${st.mtimeMs}:${st.size}` : null;
  if (!force && sig === S.prevcSig) return;
  const text = st ? await safeRead($, PREVC) : null;
  const prevc = text ?? "";
  const phase = phaseFromPrevcJson(prevc);
  if (!force && (text === null || phase === null)) return;
  S.prevcSig = text === null ? null : sig;
  S.workflow = workflowFromPrevcJson(prevc);
  if (active()) core.onPhaseChange(S.core, { phase });
}
```

  c) `onTurnStart` passa a ser:

```js
async function onTurnStart($, e, next) {
  await ensure($);
  // Lê o prevc.json uma vez por turno, com ou sem roteamento: fase p/ o roteador, workflow p/ o escopo do monitor.
  await refreshPhase($, true);
  return next(e);
}
```

  d) Em `onAgentSpawn`, logo depois de `await ensure($);` e antes de `if (!active()) return next(e);`, acrescentar `await refreshPhase($); // H1: os despachos do braço B saíam com a fase do último turn.start`.

  e) Em `routerTurnStep`, logo depois de `await ensure($);` (dentro do `try`), acrescentar `await refreshPhase($);`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/integration/test-router-mod.mjs tests/integration/test-router-monitor-mod.mjs tests/lib/router-core.test.mjs`
Expected: PASS em todos (os antigos também: o `turn.start` mantém o comportamento).

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(router): reler a fase do PREVC no meio do turno quando o prevc.json muda" -- hooks/router.mjs tests/integration/test-router-mod.mjs
```

---

## Task 3: Config — `readEvidenceGate` (D5)

**Agent:** backend-specialist
**Tier:** cheap
**Standards:** std-commit-hygiene, std-pre-commit-hygiene
**Tests:** unit

**Files:**
- Modify: `scripts/lib/devflow-config.mjs` (acrescentar depois de `readBlockField`)
- Create: `tests/lib/devflow-config-evidence-gate.test.mjs`

**Interfaces:**
- Consumes: `readBlockField(src, block, field)` (existente).
- Produces: `readEvidenceGate(src: string) → "block" | "warn" | "off"`.

- [ ] **Step 1: Escrever o teste que falha** — `tests/lib/devflow-config-evidence-gate.test.mjs`:

```js
// tests/lib/devflow-config-evidence-gate.test.mjs — prevc.evidenceGate (D5, spec 2026-10-10 §4.4)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readEvidenceGate } from "../../scripts/lib/devflow-config.mjs";

test("ausente → block (padrão)", () => {
  assert.equal(readEvidenceGate(""), "block");
  assert.equal(readEvidenceGate("git:\n  strategy: branch-flow\n"), "block");
});

test("block, warn e off são lidos; aspas e comentário inline aceitos", () => {
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: warn\n"), "warn");
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: \"off\"  # desligado\n"), "off");
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: block\n"), "block");
});

test("valor inválido → block (fail-closed)", () => {
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: disabled\n"), "block");
  assert.equal(readEvidenceGate("prevc:\n  evidenceGate: WARN\n"), "block");
});

test("evidenceGate em outro bloco não conta", () => {
  assert.equal(readEvidenceGate("git:\n  evidenceGate: off\n"), "block");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/devflow-config-evidence-gate.test.mjs`
Expected: FAIL com `readEvidenceGate is not a function` (ou export ausente).

- [ ] **Step 3: Implementar** — em `scripts/lib/devflow-config.mjs`, depois de `readBlockField`:

```js
// prevc.evidenceGate: block | warn | off (D5, spec 2026-10-10 §4.4). Ausente ou inválido → block.
export function readEvidenceGate(src) {
  const raw = readBlockField(src, "prevc", "evidenceGate");
  const v = raw === null ? null : String(raw).replace(/^["']|["']$/g, "");
  return v === "warn" || v === "off" ? v : "block";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/lib/devflow-config-evidence-gate.test.mjs tests/lib/devflow-config.test.mjs tests/lib/devflow-config-parity.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/devflow-config-evidence-gate.test.mjs
git commit -m "feat(config): ler prevc.evidenceGate com padrão block" -- scripts/lib/devflow-config.mjs tests/lib/devflow-config-evidence-gate.test.mjs
```

---

## Task 4: Lib pura — matriz de evidência (D5)

**Agent:** backend-specialist
**Tier:** standard
**Standards:** std-commit-hygiene, std-pre-commit-hygiene
**Tests:** unit

**Files:**
- Create: `scripts/lib/phase-evidence.mjs`
- Create: `tests/lib/phase-evidence.test.mjs`

**Interfaces:**
- Produces:
  - `PHASES: string[]` = `["P","R","E","V","C"]`; `MIN_PLAN_BODY = 200`.
  - `isAdvanceEvent(ev: object) → boolean`.
  - `leavingPhase(prevc: object) → { phase: string, completes: boolean } | null`.
  - `evaluateTransition(phase: string, facts: Facts) → { ok: boolean, missing: { code, message, howTo }[] }`, com `Facts` = `{ plan?: { linked, bodyChars, review: { verdict } | null, requiredSignals }, git?: { branch, protected, commitsSincePhaseStart, landedOnBase, publishedRemote }, stories?: { open } | null, verify?: { pass, warnOnly, blocks } }`.
  - `renderDecision(mode, phase, result) → string` (JSON numa linha ou `""`).
  - `renderInternalError(message) → string` (JSON `additionalContext`).
  - Códigos: `PLAN_NOT_LINKED`, `PLAN_EMPTY`, `REVIEW_MISSING`, `REVIEW_NOT_PROCEED`, `PROTECTED_BRANCH`, `NO_COMMITS`, `STORIES_OPEN`, `VERIFY_BLOCKED`, `NOT_DELIVERED`.

- [ ] **Step 1: Escrever o teste que falha** — `tests/lib/phase-evidence.test.mjs`:

```js
// tests/lib/phase-evidence.test.mjs — matriz de evidência por fase (D5, spec 2026-10-10 §4.2)
import { test } from "node:test";
import assert from "node:assert/strict";
import * as PE from "../../scripts/lib/phase-evidence.mjs";

const codes = (r) => r.missing.map((m) => m.code);
const prevc = (cur, phases = {}) => ({ status: { project: { current_phase: cur }, phases: { P: {}, R: {}, E: {}, V: {}, C: {}, ...phases } } });

test("isAdvanceEvent: MCP do advance (com e sem force) e CLI invocada como comando", () => {
  assert.equal(PE.isAdvanceEvent({ tool_name: "mcp__dotcontext__workflow-advance", tool_input: {} }), true);
  assert.equal(PE.isAdvanceEvent({ tool_name: "mcp__dotcontext__workflow-advance", tool_input: { force: true } }), true);
  for (const command of ["dotcontext workflow advance", "npx -y @dotcontext/cli workflow advance -o a.md", "cd x && npx @dotcontext/cli@1.2.3 workflow advance", "(dotcontext workflow advance)"]) {
    assert.equal(PE.isAdvanceEvent({ tool_name: "Bash", tool_input: { command } }), true, command);
  }
});

test("isAdvanceEvent: outras ferramentas, status e texto entre aspas não contam", () => {
  assert.equal(PE.isAdvanceEvent({ tool_name: "mcp__dotcontext__workflow-status", tool_input: {} }), false);
  assert.equal(PE.isAdvanceEvent({ tool_name: "Edit", tool_input: { file_path: "x" } }), false);
  for (const command of ["dotcontext workflow status", 'git commit -m "dotcontext workflow advance"', "git commit -m 'fix: dotcontext workflow advance'", "ls"]) {
    assert.equal(PE.isAdvanceEvent({ tool_name: "Bash", tool_input: { command } }), false, command);
  }
  assert.equal(PE.isAdvanceEvent(null), false);
});

test("leavingPhase: fase atual, conclusão na última fase ativa e escalas com fases puladas", () => {
  assert.deepEqual(PE.leavingPhase(prevc("P")), { phase: "P", completes: false });
  assert.deepEqual(PE.leavingPhase(prevc("C")), { phase: "C", completes: true });
  // SMALL: R e C puladas pelo dotcontext → sair de V conclui
  assert.deepEqual(PE.leavingPhase(prevc("V", { R: { status: "skipped" }, C: { status: "skipped" } })), { phase: "V", completes: true });
  assert.equal(PE.leavingPhase(prevc("C", { C: { status: "completed" } })), null);
  assert.equal(PE.leavingPhase({}), null);
  assert.equal(PE.leavingPhase(prevc("X")), null);
});

test("P: plano linkado e com corpo", () => {
  assert.deepEqual(codes(PE.evaluateTransition("P", { plan: { linked: false } })), ["PLAN_NOT_LINKED"]);
  assert.deepEqual(codes(PE.evaluateTransition("P", { plan: { linked: true, bodyChars: 10 } })), ["PLAN_EMPTY"]);
  assert.equal(PE.evaluateTransition("P", { plan: { linked: true, bodyChars: PE.MIN_PLAN_BODY } }).ok, true);
});

test("R: review.verdict PROCEED passa; ausente, REVISE e BLOCK negam", () => {
  const plan = (review) => ({ plan: { linked: true, bodyChars: 999, review } });
  assert.deepEqual(codes(PE.evaluateTransition("R", plan(null))), ["REVIEW_MISSING"]);
  assert.deepEqual(codes(PE.evaluateTransition("R", plan({ verdict: "REVISE" }))), ["REVIEW_NOT_PROCEED"]);
  assert.deepEqual(codes(PE.evaluateTransition("R", plan({ verdict: "BLOCK" }))), ["REVIEW_NOT_PROCEED"]);
  assert.equal(PE.evaluateTransition("R", plan({ verdict: "PROCEED" })).ok, true);
  assert.deepEqual(codes(PE.evaluateTransition("R", { plan: { linked: false } })), ["PLAN_NOT_LINKED"]);
});

test("E: commit na branch de feature e stories fechadas", () => {
  const ok = { git: { branch: "feature/x", protected: false, commitsSincePhaseStart: 2 }, stories: { open: 0 } };
  assert.equal(PE.evaluateTransition("E", ok).ok, true);
  assert.equal(PE.evaluateTransition("E", { ...ok, stories: null }).ok, true);
  assert.deepEqual(codes(PE.evaluateTransition("E", { ...ok, git: { ...ok.git, commitsSincePhaseStart: 0 } })), ["NO_COMMITS"]);
  assert.deepEqual(codes(PE.evaluateTransition("E", { ...ok, git: { ...ok.git, branch: "main", protected: true } })), ["PROTECTED_BRANCH"]);
  assert.deepEqual(codes(PE.evaluateTransition("E", { ...ok, stories: { open: 3 } })), ["STORIES_OPEN"]);
  assert.deepEqual(codes(PE.evaluateTransition("E", {})), ["NO_COMMITS"]);
});

test("V: veredito do verify-gate (warnOnly passa)", () => {
  assert.equal(PE.evaluateTransition("V", { verify: { pass: true, warnOnly: true, blocks: [] } }).ok, true);
  const r = PE.evaluateTransition("V", { verify: { pass: false, warnOnly: false, blocks: [{ signal: "unit", reason: "sem observação" }] } });
  assert.deepEqual(codes(r), ["VERIFY_BLOCKED"]);
  assert.match(r.missing[0].message, /unit: sem observação/);
  assert.deepEqual(codes(PE.evaluateTransition("V", {})), ["VERIFY_BLOCKED"]);
});

test("C: trabalho na base ou branch publicada", () => {
  assert.equal(PE.evaluateTransition("C", { git: { landedOnBase: true, publishedRemote: false } }).ok, true);
  assert.equal(PE.evaluateTransition("C", { git: { landedOnBase: false, publishedRemote: true } }).ok, true);
  assert.deepEqual(codes(PE.evaluateTransition("C", { git: { landedOnBase: false, publishedRemote: false } })), ["NOT_DELIVERED"]);
});

test("renderDecision: block → deny numa linha; warn → additionalContext; ok ou off → vazio", () => {
  const bad = PE.evaluateTransition("P", { plan: { linked: false } });
  const deny = PE.renderDecision("block", "P", bad);
  assert.doesNotMatch(deny, /\n/);
  const d = JSON.parse(deny).hookSpecificOutput;
  assert.equal(d.hookEventName, "PreToolUse");
  assert.equal(d.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /fase P/);
  assert.match(d.permissionDecisionReason, /plan\(\{ action: "link" \}\)/);
  const warn = JSON.parse(PE.renderDecision("warn", "P", bad)).hookSpecificOutput;
  assert.equal(warn.permissionDecision, undefined);
  assert.match(warn.additionalContext, /modo warn/);
  assert.equal(PE.renderDecision("off", "P", bad), "");
  assert.equal(PE.renderDecision("block", "P", { ok: true, missing: [] }), "");
});

test("renderInternalError: aviso sem decisão de permissão", () => {
  const o = JSON.parse(PE.renderInternalError("git ausente")).hookSpecificOutput;
  assert.equal(o.permissionDecision, undefined);
  assert.match(o.additionalContext, /git ausente/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/phase-evidence.test.mjs`
Expected: FAIL com `Cannot find module .../phase-evidence.mjs`.

- [ ] **Step 3: Implementar** — `scripts/lib/phase-evidence.mjs`:

```js
// scripts/lib/phase-evidence.mjs — gate de evidência por fase do PREVC (D5, spec 2026-10-10 §4; ADR-018).
// PURO: recebe fatos já coletados e decide. A coleta (fs, git, verify-gate) é do scripts/phase-gate.mjs.
// Anti-teatro, não anti-adversário: o objetivo é que o caminho de menor esforço passe pelo trabalho real.

export const PHASES = ["P", "R", "E", "V", "C"];
export const MIN_PLAN_BODY = 200;

const ADVANCE_TOOL = "mcp__dotcontext__workflow-advance";
// CLI invocada como comando: no início ou depois de espaço/;/&/|/( — texto entre aspas não casa.
const CLI_ADVANCE = /(?:^|[\s;&|(])(?:npx\s+(?:-y\s+)?)?(?:@dotcontext\/cli(?:@\S+)?|dotcontext)\s+workflow\s+advance\b/;
const TAG = "[devflow phase-gate]";

export function isAdvanceEvent(ev) {
  if (!ev || typeof ev !== "object") return false;
  if (ev.tool_name === ADVANCE_TOOL) return true;
  if (ev.tool_name === "Bash") return CLI_ADVANCE.test(String(ev.tool_input?.command ?? ""));
  return false;
}

// Fase que o advance está fechando. Fases fora da escala vêm como "skipped" no prevc.json do dotcontext.
export function leavingPhase(prevc) {
  const st = prevc?.status;
  const cur = st?.project?.current_phase;
  if (!PHASES.includes(cur)) return null;
  const phases = st.phases ?? {};
  if (phases[cur]?.status === "completed") return null; // workflow já concluído
  const rest = PHASES.slice(PHASES.indexOf(cur) + 1).filter((p) => phases[p]?.status !== "skipped");
  return { phase: cur, completes: rest.length === 0 };
}

const item = (code, message, howTo) => ({ code, message, howTo });
const NOT_LINKED = () => item("PLAN_NOT_LINKED", "nenhum plano linkado ao workflow", 'crie o plano (context scaffoldPlan) e vincule com plan({ action: "link" })');

export function evaluateTransition(phase, f = {}) {
  const missing = [];
  if (phase === "P") {
    if (!f.plan?.linked) missing.push(NOT_LINKED());
    else if ((f.plan.bodyChars ?? 0) < MIN_PLAN_BODY) missing.push(item("PLAN_EMPTY", `o plano linkado tem menos de ${MIN_PLAN_BODY} caracteres de corpo`, "escreva o plano (tarefas, testes, sinais) antes de sair da fase P"));
  } else if (phase === "R") {
    const v = f.plan?.review?.verdict;
    if (!f.plan?.linked) missing.push(NOT_LINKED());
    else if (!v) missing.push(item("REVIEW_MISSING", "o plano não registra a revisão (review.verdict)", "rode a devflow:prevc-review e grave review: { verdict, reviewers, date } no frontmatter do plano"));
    else if (v !== "PROCEED") missing.push(item("REVIEW_NOT_PROCEED", `a revisão terminou em ${v}`, "corrija o plano e revise de novo até PROCEED"));
  } else if (phase === "E") {
    if (f.git?.protected) missing.push(item("PROTECTED_BRANCH", `a branch ${f.git.branch} é protegida`, "faça o trabalho da fase E numa branch de feature"));
    if (!((f.git?.commitsSincePhaseStart ?? 0) > 0)) missing.push(item("NO_COMMITS", "nenhum commit desde o início da fase E", "commite o trabalho da fase E (testes e implementação) na branch de feature"));
    if ((f.stories?.open ?? 0) > 0) missing.push(item("STORIES_OPEN", `${f.stories.open} story(ies) ainda pending/in_progress no stories.yaml`, "termine as stories (ou atualize o status) antes de sair da fase E"));
  } else if (phase === "V") {
    if (!f.verify?.pass) {
      const why = (f.verify?.blocks ?? []).map((b) => `${b.signal}: ${b.reason}`).join("; ") || "sem veredito";
      missing.push(item("VERIFY_BLOCKED", `verify-gate bloqueado (${why})`, "rode os sinais exigidos (verify-run) até o verify-gate passar"));
    }
  } else if (phase === "C") {
    if (!f.git?.landedOnBase && !f.git?.publishedRemote) missing.push(item("NOT_DELIVERED", "o trabalho não chegou à branch base nem a branch foi publicada no remoto", "publique a branch (push) e abra o PR, ou faça o merge, antes de concluir"));
  }
  return { ok: missing.length === 0, missing };
}

const out = (o) => JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...o } });

export function renderDecision(mode, phase, r) {
  if (mode === "off" || r?.ok) return "";
  const head = `${TAG} saída da fase ${phase} sem a evidência mínima (ADR-018):`;
  const lines = r.missing.map((m) => `- ${m.message} → ${m.howTo}`).join("\n");
  if (mode === "warn") return out({ additionalContext: `${head}\n${lines}\n(modo warn: o avanço segue)` });
  return out({ permissionDecision: "deny", permissionDecisionReason: `${head}\n${lines}\nforce: true não contorna este gate.` });
}

export function renderInternalError(message) {
  return out({ additionalContext: `${TAG} não foi possível conferir a evidência da fase (${message}); o avanço segue sem o gate.` });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/lib/phase-evidence.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/phase-evidence.mjs tests/lib/phase-evidence.test.mjs
git commit -m "feat(phase-gate): matriz pura de evidência por fase do PREVC" -- scripts/lib/phase-evidence.mjs tests/lib/phase-evidence.test.mjs
```

---

## Task 5: CLI coletor — `scripts/phase-gate.mjs` (D5)

**Agent:** backend-specialist
**Tier:** capable
**Handoff from:** Tasks 3 e 4
**Standards:** std-commit-hygiene, std-pre-commit-hygiene
**Tests:** integration (repositórios git em `mkdtemp`)

**Files:**
- Create: `scripts/phase-gate.mjs`
- Create: `tests/integration/test-phase-gate.mjs`

**Interfaces:**
- Consumes: `readEvidenceGate` (Task 3); `isAdvanceEvent`, `leavingPhase`, `evaluateTransition`, `renderDecision`, `renderInternalError` (Task 4); `parseFrontmatter` de `scripts/lib/frontmatter.mjs`; `parseGitSection` de `scripts/lib/devflow-config-guard.mjs`; `evaluateGate` de `scripts/lib/verify-gate.mjs`.
- Produces:
  - `linkedPlan(root) → { slug, rel } | null` — o primeiro `plans.json` que **existe** decide (runtime antes do legado), para um legado velho não fingir vínculo.
  - `planFacts(root) → { linked, bodyChars, review, requiredSignals }`.
  - `collectFacts(root, phase, prevc) → Facts`.
  - `decide(event) → string` (o que o hook imprime).
  - Executado direto: lê o evento do stdin e imprime `decide(event)` + `\n` quando não vazio.

- [ ] **Step 1: Escrever os testes que falham** — `tests/integration/test-phase-gate.mjs`:

```js
// tests/integration/test-phase-gate.mjs — coletor do gate de evidência em repositórios git temporários
// (D5, spec 2026-10-10 §4). Nunca toca o repo versionado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { decide, planFacts, collectFacts } from "../../scripts/phase-gate.mjs";

const PREVC = ".context/runtime/workflows/prevc.json";
const ADV = (cwd, input = {}) => ({ tool_name: "mcp__dotcontext__workflow-advance", tool_input: input, cwd });
const BODY = "# Plano\n\n" + "- [ ] tarefa com teste e implementação\n".repeat(10);
const T0 = "2026-01-01T00:00:00.000Z";

const ID = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
function sh(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...ID } }).trim();
}
// Commit com data fixa: a semente fica ANTES de T0 e nunca conta como trabalho da fase E.
function shAt(cwd, date, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...ID, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } }).trim();
}
function write(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}
function commit(root, rel, msg) {
  write(root, rel, `${msg}\n`);
  sh(root, "add", "--", rel);
  sh(root, "commit", "-q", "-m", msg);
}
// Repo com main protegida, workflow na fase `cur` e fases E iniciadas em T0 (passado).
function mkRepo({ cur = "P", phases = {}, yaml = "git:\n  protectedBranches: [main]\n", started = T0 } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "phase-gate-")));
  sh(root, "init", "-q", "-b", "main");
  write(root, ".context/.devflow.yaml", yaml);
  write(root, "seed.txt", "seed\n");
  sh(root, "add", "--", "seed.txt");
  shAt(root, "2025-01-01T00:00:00Z", "commit", "-q", "-m", "seed");
  const ph = { P: { status: "in_progress" }, R: { status: "pending" }, E: { status: "pending", started_at: T0 }, V: { status: "pending" }, C: { status: "pending" }, ...phases };
  write(root, PREVC, JSON.stringify({ status: { project: { current_phase: cur, started }, phases: ph } }));
  return root;
}
function link(root, frontmatter = "", body = BODY) {
  write(root, ".context/runtime/workflows/plans.json", JSON.stringify({ active: [{ slug: "x", path: "plans/x.md" }], primary: "x" }));
  write(root, ".context/plans/x.md", `---\ntype: plan\nrequiredSignals: [unit]\n${frontmatter}---\n${body}`);
}
const decision = (s) => (s ? JSON.parse(s).hookSpecificOutput : null);

test("sem evento de avanço, sem prevc.json ou com evidenceGate: off → calado", () => {
  const root = mkRepo();
  assert.equal(decide({ tool_name: "Bash", tool_input: { command: "ls" }, cwd: root }), "");
  const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "phase-gate-")));
  assert.equal(decide(ADV(bare)), "");
  const off = mkRepo({ yaml: "prevc:\n  evidenceGate: off\n" });
  assert.equal(decide(ADV(off)), "");
});

test("P: sem plano → deny (com force também); plano linkado com corpo → passa", () => {
  const root = mkRepo();
  assert.equal(decision(decide(ADV(root))).permissionDecision, "deny");
  assert.equal(decision(decide(ADV(root, { force: true }))).permissionDecision, "deny");
  link(root);
  assert.equal(decide(ADV(root)), "");
});

test("P: plans.json do runtime vazio não cai no legado velho", () => {
  const root = mkRepo();
  write(root, ".context/runtime/workflows/plans.json", JSON.stringify({ active: [], completed: [] }));
  write(root, ".context/workflow/plans.json", JSON.stringify({ active: [{ slug: "old", path: "plans/old.md" }], primary: "old" }));
  write(root, ".context/plans/old.md", `---\ntype: plan\n---\n${BODY}`);
  assert.equal(planFacts(root).linked, false);
});

test("modo warn: avisa e não nega; valor inválido: nega", () => {
  const warn = mkRepo({ yaml: "prevc:\n  evidenceGate: warn\n" });
  const w = decision(decide(ADV(warn)));
  assert.equal(w.permissionDecision, undefined);
  assert.match(w.additionalContext, /PLAN_NOT_LINKED|nenhum plano/);
  const bad = mkRepo({ yaml: "prevc:\n  evidenceGate: talvez\n" });
  assert.equal(decision(decide(ADV(bad))).permissionDecision, "deny");
});

test("R: review.verdict no frontmatter do plano decide", () => {
  const root = mkRepo({ cur: "R", phases: { P: { status: "completed" }, R: { status: "in_progress" } } });
  link(root);
  assert.match(decision(decide(ADV(root))).permissionDecisionReason, /review\.verdict/);
  link(root, "review:\n  verdict: REVISE\n  reviewers: [architect]\n");
  assert.match(decision(decide(ADV(root))).permissionDecisionReason, /REVISE/);
  link(root, "review:\n  verdict: PROCEED\n  reviewers: [architect, security-auditor]\n  date: \"2026-10-10\"\n");
  assert.equal(decide(ADV(root)), "");
});

test("E: na main protegida e sem commits → deny; commit na feature → passa", () => {
  const root = mkRepo({ cur: "E", phases: { E: { status: "in_progress", started_at: T0 } } });
  const r = decision(decide(ADV(root))).permissionDecisionReason;
  assert.match(r, /protegida/);
  assert.match(r, /nenhum commit/);
  sh(root, "switch", "-q", "-c", "feature/x");
  commit(root, "src.txt", "feat: x");
  assert.equal(decide(ADV(root)), "");
});

test("E: stories deste workflow pendentes negam; stories de outro workflow são ignoradas", () => {
  const started = new Date(Date.now() - 120_000).toISOString();
  const root = mkRepo({ cur: "E", started, phases: { E: { status: "in_progress", started_at: T0 } } });
  sh(root, "switch", "-q", "-c", "feature/x");
  commit(root, "src.txt", "feat: x");
  const stories = (created, status) => `feature: "x"\ncreated: "${created}"\nstories:\n  - id: "S1"\n    title: "a"\n    status: completed\n  - id: "S2"\n    title: "b"\n    status: ${status}\n`;
  write(root, ".context/workflow/stories.yaml", stories(new Date().toISOString(), "pending"));
  assert.match(decision(decide(ADV(root))).permissionDecisionReason, /1 story/);
  write(root, ".context/workflow/stories.yaml", stories("2020-01-01T00:00:00Z", "pending"));
  assert.equal(decide(ADV(root)), "");
});

test("V: verify-gate sem verify: e sem std block → warnOnly passa", () => {
  const root = mkRepo({ cur: "V" });
  link(root);
  const f = collectFacts(root, "V", JSON.parse(fs.readFileSync(path.join(root, PREVC), "utf8")));
  assert.equal(typeof f.verify.pass, "boolean");
  if (f.verify.warnOnly) assert.equal(decide(ADV(root)), "");
});

test("V: verify: declarado e sinal nunca observado → deny com o sinal", () => {
  const root = mkRepo({ cur: "V", yaml: "git:\n  protectedBranches: [main]\nverify:\n  unit: [\"node\", \"--test\"]\n" });
  link(root);
  assert.match(decision(decide(ADV(root))).permissionDecisionReason, /unit/);
});

test("C: merge local sem remoto conclui", () => {
  const root = mkRepo({ cur: "C" });
  sh(root, "switch", "-q", "-c", "feature/x");
  commit(root, "src.txt", "feat: x");
  assert.equal(decision(decide(ADV(root))).permissionDecision, "deny");
  sh(root, "switch", "-q", "main");
  sh(root, "merge", "-q", "--no-ff", "-m", "merge feature/x", "feature/x");
  assert.equal(decide(ADV(root)), "");
});

test("C: branch publicada no remoto conclui; squash na base remota (branch apagada) também", () => {
  const remote = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "phase-gate-remote-")));
  sh(remote, "init", "-q", "--bare", "-b", "main");
  const root = mkRepo({ cur: "C" });
  sh(root, "remote", "add", "origin", remote);
  sh(root, "push", "-q", "origin", "main");
  sh(root, "switch", "-q", "-c", "feature/x");
  commit(root, "src.txt", "feat: x");
  sh(root, "push", "-q", "origin", "feature/x");
  assert.equal(decide(ADV(root)), ""); // publicada
  // squash na base remota feito por outro clone; a branch some do remoto e do local
  const other = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "phase-gate-other-")));
  sh(other, "clone", "-q", remote, ".");
  commit(other, "src.txt", "feat: x (squash)");
  sh(other, "push", "-q", "origin", "main");
  sh(other, "push", "-q", "origin", "--delete", "feature/x");
  sh(root, "fetch", "-q", "--prune", "origin");
  assert.equal(decide(ADV(root)), ""); // base remota tem commit posterior ao início de E
});

test("git ausente (PATH vazio) → passa com aviso, nunca deny", () => {
  const root = mkRepo({ cur: "E" });
  const saved = process.env.PATH;
  process.env.PATH = "";
  try {
    const d = decision(decide(ADV(root)));
    assert.equal(d.permissionDecision, undefined);
    assert.match(d.additionalContext, /não foi possível conferir/);
  } finally {
    process.env.PATH = saved;
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/integration/test-phase-gate.mjs`
Expected: FAIL com `Cannot find module .../scripts/phase-gate.mjs`.

- [ ] **Step 3: Implementar** — `scripts/phase-gate.mjs`:

```js
#!/usr/bin/env node
// scripts/phase-gate.mjs — gate de evidência por fase do PREVC (D5, spec 2026-10-10 §4; ADR-018).
// Lê o evento PreToolUse no stdin, coleta os fatos da fase que o advance fecha e imprime UM JSON numa
// linha (deny ou aviso) ou nada. A decisão é da lib pura scripts/lib/phase-evidence.mjs.
// Subprocessos só por execFileSync com argv. Erro interno → aviso, nunca deny (spec §4.4).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { readEvidenceGate } from "./lib/devflow-config.mjs";
import { parseGitSection } from "./lib/devflow-config-guard.mjs";
import { evaluateGate } from "./lib/verify-gate.mjs";
import { isAdvanceEvent, leavingPhase, evaluateTransition, renderDecision, renderInternalError } from "./lib/phase-evidence.mjs";

const PREVC = ".context/runtime/workflows/prevc.json";
const PLANS = [".context/runtime/workflows/plans.json", ".context/workflow/plans.json"];
const STORIES = ".context/workflow/stories.yaml";
const GIT_TIMEOUT_MS = 5000;

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: GIT_TIMEOUT_MS }).trim();
const readText = (root, rel) => { try { return readFileSync(join(root, rel), "utf8"); } catch { return null; } };

// O primeiro plans.json que EXISTE decide: um legado velho não pode fingir vínculo (spec §7).
export function linkedPlan(root) {
  for (const rel of PLANS) {
    const t = readText(root, rel);
    if (t === null) continue;
    let j;
    try { j = JSON.parse(t); } catch { return null; }
    const active = Array.isArray(j?.active) ? j.active : [];
    const e = active.find((a) => a?.slug === j.primary) ?? active.at(-1);
    return e?.path ? { slug: e.slug, rel: join(".context", e.path) } : null;
  }
  return null;
}

export function planFacts(root) {
  const lp = linkedPlan(root);
  const src = lp ? readText(root, lp.rel) : null;
  if (src === null) return { linked: false, bodyChars: 0, review: null, requiredSignals: [] };
  const { data, body } = parseFrontmatter(src);
  const verdict = data?.review && typeof data.review === "object" ? String(data.review.verdict ?? "").trim().toUpperCase() : "";
  return {
    linked: true,
    bodyChars: String(body ?? "").replace(/\s/g, "").length,
    review: verdict ? { verdict } : null,
    requiredSignals: Array.isArray(data?.requiredSignals) ? data.requiredSignals.map(String) : [],
  };
}

// Stories só deste workflow: `created` ≥ início do workflow. Leitura por linha (o arquivo é gerado pela skill).
function storyFacts(root, prevc) {
  const t = readText(root, STORIES);
  if (t === null) return null;
  const created = Date.parse((t.match(/^created:\s*["']?([^"'\n#]+)/m)?.[1] ?? "").trim());
  const started = Date.parse(prevc?.status?.project?.started ?? "");
  if (!Number.isFinite(created) || (Number.isFinite(started) && created < started)) return null;
  return { open: (t.match(/^\s+status:\s*["']?(pending|in_progress)\b/gm) ?? []).length };
}

function protectedBranches(root) {
  const pb = parseGitSection(readText(root, ".context/.devflow.yaml") ?? "").protectedBranches;
  return Array.isArray(pb) ? pb.map(String) : [];
}

function sinceOf(prevc) {
  return prevc?.status?.phases?.E?.started_at ?? prevc?.status?.project?.started ?? null;
}

function eFacts(root, prevc) {
  const branch = git(root, ["branch", "--show-current"]);
  const since = sinceOf(prevc);
  const log = since ? git(root, ["log", `--since=${since}`, "--format=%H", "HEAD"]) : "";
  return { branch, protected: !!branch && protectedBranches(root).includes(branch), commitsSincePhaseStart: log ? log.split("\n").length : 0 };
}

// Entregue = alguma branch protegida (local ou remota) tem commit posterior ao início de E, ou a branch
// atual está publicada. A saída de E já exige commits fora de branch protegida (spec §4.2).
function cFacts(root, prevc) {
  const branch = git(root, ["branch", "--show-current"]);
  const since = sinceOf(prevc);
  let landedOnBase = false;
  for (const p of protectedBranches(root)) {
    const refs = [`refs/heads/${p}`, ...git(root, ["for-each-ref", "--format=%(refname)", `refs/remotes/*/${p}`]).split("\n").filter(Boolean)];
    for (const ref of refs) {
      let hit = "";
      try { hit = since ? git(root, ["log", "-1", `--since=${since}`, "--format=%H", ref, "--"]) : ""; } catch { hit = ""; } // ref ausente
      if (hit) { landedOnBase = true; break; }
    }
    if (landedOnBase) break;
  }
  const publishedRemote = !!branch && git(root, ["for-each-ref", "--format=%(refname)", `refs/remotes/*/${branch}`]) !== "";
  return { branch, landedOnBase, publishedRemote };
}

export function collectFacts(root, phase, prevc) {
  if (phase === "P" || phase === "R") return { plan: planFacts(root) };
  if (phase === "E") return { git: eFacts(root, prevc), stories: storyFacts(root, prevc) };
  if (phase === "V") return { verify: evaluateGate({ root, requiredSignals: planFacts(root).requiredSignals }) };
  return { git: cFacts(root, prevc) };
}

function rootOf(cwd) {
  const dir = typeof cwd === "string" && cwd ? cwd : process.cwd();
  try { return git(dir, ["rev-parse", "--show-toplevel"]) || dir; } catch { return dir; }
}

export function decide(event) {
  if (!isAdvanceEvent(event)) return "";
  try {
    const root = rootOf(event.cwd);
    const mode = readEvidenceGate(readText(root, ".context/.devflow.yaml") ?? "");
    if (mode === "off") return "";
    let prevc;
    try { prevc = JSON.parse(readText(root, PREVC) ?? ""); } catch { return ""; } // sem workflow: nada a conferir
    const leaving = leavingPhase(prevc);
    if (!leaving) return "";
    return renderDecision(mode, leaving.phase, evaluateTransition(leaving.phase, collectFacts(root, leaving.phase, prevc)));
  } catch (e) {
    return renderInternalError(String(e?.message ?? e).split("\n")[0].slice(0, 200));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let ev = null;
  try { ev = JSON.parse(readFileSync(0, "utf8")); } catch { ev = null; }
  const o = decide(ev);
  if (o) process.stdout.write(o + "\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/integration/test-phase-gate.mjs`
Expected: PASS. Se o teste "git ausente" falhar porque `execFileSync` não encontra `git` só ao resolver a raiz (caindo em `cwd`) e depois em `eFacts`: confirmar que a exceção de `eFacts` chega ao `catch` de `decide` (é o comportamento esperado).

- [ ] **Step 5: Commit**

```bash
git add scripts/phase-gate.mjs tests/integration/test-phase-gate.mjs
git commit -m "feat(phase-gate): coletor de evidência por fase sobre git, plano e verify-gate" -- scripts/phase-gate.mjs tests/integration/test-phase-gate.mjs
```

---

## Task 6: Hook PreToolUse dedicado + registro (D5)

**Agent:** backend-specialist
**Tier:** standard
**Handoff from:** Task 5
**Standards:** std-commit-hygiene, std-pre-commit-hygiene
**Tests:** e2e (hook real pelo `run-hook.cmd`)

**Files:**
- Create: `hooks/pre-tool-use-phase-gate` (executável)
- Modify: `hooks/hooks.json` (bloco `PreToolUse`)
- Create: `tests/hooks/test-pre-tool-use-phase-gate.sh`

**Interfaces:**
- Consumes: `scripts/phase-gate.mjs` (Task 5) via stdin.
- Produces: entrada no `hooks.json` com matcher `Bash|mcp__dotcontext__workflow-advance`, timeout 15.

- [ ] **Step 1: Escrever o teste que falha** — `tests/hooks/test-pre-tool-use-phase-gate.sh`:

```bash
#!/usr/bin/env bash
# tests/hooks/test-pre-tool-use-phase-gate.sh — gate de evidência por fase pelo hook real (D5, ADR-018).
#   1. advance (MCP, com e sem force) negado sem evidência; permitido com evidência;
#   2. CLI do dotcontext no Bash negada; Bash comum e commit citando o texto ficam calados;
#   3. modo warn e off;
#   4. saída sempre um JSON numa linha (ou nada), nunca "allow";
#   5. registro no hooks.json e chamada pelo run-hook.cmd;
#   6. node ausente → calado.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
H="$REPO_ROOT/hooks/pre-tool-use-phase-gate"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
fail=0
export GIT_CONFIG_GLOBAL=/dev/null GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

mkrepo() { # $1 = dir, $2 = yaml extra
  mkdir -p "$1/.context/runtime/workflows"
  git -C "$1" init -q -b main
  printf 'git:\n  protectedBranches: [main]\n%s' "${2:-}" > "$1/.context/.devflow.yaml"
  echo seed > "$1/seed.txt"; git -C "$1" add seed.txt; git -C "$1" commit -q -m seed
  printf '{"status":{"project":{"current_phase":"P","started":"2026-01-01T00:00:00Z"},"phases":{"P":{"status":"in_progress"},"R":{},"E":{},"V":{},"C":{}}}}' > "$1/.context/runtime/workflows/prevc.json"
}
ev_mcp() { # $1 = cwd, $2 = tool_input em JSON (padrão {})
  local inp="${2:-}"; [ -n "$inp" ] || inp='{}'
  python3 -c 'import json,sys; print(json.dumps({"tool_name":"mcp__dotcontext__workflow-advance","tool_input":json.loads(sys.argv[2]),"cwd":sys.argv[1]}))' "$1" "$inp"
}
ev_bash() { python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[2]},"cwd":sys.argv[1]}))' "$1" "$2"; }
dec() { # imprime a decisão (deny|warn|"") e falha se a saída não for um JSON numa linha
  local out; out=$(printf '%s' "$1" | bash "$H")
  [ -z "$out" ] && { echo ""; return; }
  [ "$(printf '%s\n' "$out" | wc -l)" -eq 1 ] || { echo "MULTILINE"; return; }
  printf '%s' "$out" | python3 -c 'import json,sys; o=json.loads(sys.stdin.read())["hookSpecificOutput"]; d=o.get("permissionDecision"); print("ALLOW" if d=="allow" else d or ("warn" if o.get("additionalContext") else ""))'
}
expect() { [ "$1" = "$2" ] || { echo "FAIL ($3): esperava '$2', veio '$1'"; fail=1; }; }

# --- 1 e 2: sem evidência ------------------------------------------------------------------------
R="$TMP/r"; mkrepo "$R"
expect "$(dec "$(ev_mcp "$R")")" deny "advance sem plano"
expect "$(dec "$(ev_mcp "$R" '{"force":true}')")" deny "advance com force"
expect "$(dec "$(ev_bash "$R" 'npx -y @dotcontext/cli workflow advance')")" deny "CLI no Bash"
expect "$(dec "$(ev_bash "$R" 'ls -la')")" "" "Bash comum"
expect "$(dec "$(ev_bash "$R" 'git commit -m "docs: dotcontext workflow advance"')")" "" "commit citando o texto"

# --- 1: com evidência ----------------------------------------------------------------------------
mkdir -p "$R/.context/plans"
printf '{"active":[{"slug":"x","path":"plans/x.md"}],"primary":"x"}' > "$R/.context/runtime/workflows/plans.json"
{ printf -- '---\ntype: plan\n---\n# Plano\n'; for i in $(seq 1 12); do echo "- [ ] tarefa $i com teste e implementação"; done; } > "$R/.context/plans/x.md"
expect "$(dec "$(ev_mcp "$R")")" "" "advance com plano"

# --- 3: warn e off --------------------------------------------------------------------------------
W="$TMP/w"; mkrepo "$W" $'prevc:\n  evidenceGate: warn\n'
expect "$(dec "$(ev_mcp "$W")")" warn "modo warn"
O="$TMP/o"; mkrepo "$O" $'prevc:\n  evidenceGate: off\n'
expect "$(dec "$(ev_mcp "$O")")" "" "modo off"

# --- 5: registro e run-hook.cmd -------------------------------------------------------------------
python3 - "$REPO_ROOT/hooks/hooks.json" <<'PY' || { echo "FAIL: hooks.json sem o phase-gate"; fail=1; }
import json, sys
pre = json.load(open(sys.argv[1]))["hooks"]["PreToolUse"]
hit = [e for e in pre if any("pre-tool-use-phase-gate" in h["command"] for h in e["hooks"])]
assert len(hit) == 1 and hit[0]["matcher"] == "Bash|mcp__dotcontext__workflow-advance", hit
PY
OUT=$(ev_mcp "$TMP/o2" | CLAUDE_PLUGIN_ROOT="$REPO_ROOT" "$REPO_ROOT/hooks/run-hook.cmd" pre-tool-use-phase-gate || true)
[ -z "$OUT" ] || { echo "FAIL: run-hook.cmd sem workflow deveria ficar calado: $OUT"; fail=1; }
[ -x "$H" ] || { echo "FAIL: hook não executável"; fail=1; }

# --- 6: node ausente ------------------------------------------------------------------------------
OUT=$(ev_mcp "$R" | env PATH="/nonexistent" /bin/bash "$H" || true)
[ -z "$OUT" ] || { echo "FAIL: sem node o hook deveria ficar calado: $OUT"; fail=1; }

[ "$fail" -eq 0 ] && echo "OK test-pre-tool-use-phase-gate" || exit 1
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bash tests/hooks/test-pre-tool-use-phase-gate.sh`
Expected: FAIL (hook inexistente: `bash: .../pre-tool-use-phase-gate: No such file or directory`).

- [ ] **Step 3: Implementar o hook** — `hooks/pre-tool-use-phase-gate`:

```bash
#!/usr/bin/env bash
# hooks/pre-tool-use-phase-gate — gate de evidência por fase do PREVC (D5, ADR-018).
# Matcher `Bash|mcp__dotcontext__workflow-advance`. Separado da catraca (pre-tool-use-ratchet), que
# nunca nega por desenho (ADR-015 P0); este nega.
# Caminho rápido só com builtins: evento sem marcador de avanço sai calado. Com marcador, o node decide
# (scripts/phase-gate.mjs) e a saída é UM JSON numa linha (deny ou aviso) ou nada; nunca "allow".
# O stdin é lido até o fim antes de qualquer saída (hook que fecha o stdin cedo perde a decisão).
set -u
EV=""
IFS= read -r -d '' EV || true
case "$EV" in
  *workflow-advance*) ;;
  *dotcontext*workflow*advance*) ;;
  *) exit 0 ;;
esac
command -v node >/dev/null 2>&1 || exit 0
PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
printf '%s' "$EV" | node "${PLUGIN_ROOT}/scripts/phase-gate.mjs" 2>/dev/null
exit 0
```

Depois: `chmod +x hooks/pre-tool-use-phase-gate`.

- [ ] **Step 4: Registrar no `hooks/hooks.json`** — no array `PreToolUse`, depois da entrada do `pre-tool-use-ratchet`, acrescentar:

```json
      {
        "matcher": "Bash|mcp__dotcontext__workflow-advance",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" pre-tool-use-phase-gate",
            "async": false,
            "timeout": 15
          }
        ]
      },
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bash tests/hooks/test-pre-tool-use-phase-gate.sh && bash tests/hooks/test-pre-tool-use-ratchet.sh`
Expected: `OK test-pre-tool-use-phase-gate` e o teste da catraca verde (o registro novo não muda a catraca). Se algum teste de inventário de hooks (`git grep -l "hooks.json" tests/`) reclamar do hook novo, atualizar o inventário nesse teste.

- [ ] **Step 6: Commit**

```bash
git add hooks/pre-tool-use-phase-gate tests/hooks/test-pre-tool-use-phase-gate.sh
git commit -m "feat(hooks): gate de evidência por fase no workflow-advance" -- hooks/pre-tool-use-phase-gate hooks/hooks.json tests/hooks/test-pre-tool-use-phase-gate.sh
```

---

## Task 7: Skills — contrato do `review:` e documentação do gate (D5)

**Agent:** documentation-writer
**Tier:** cheap
**Handoff from:** Task 5
**Standards:** std-commit-hygiene, std-pre-commit-hygiene
**Tests:** unit (contrato: o exemplo da skill passa no coletor real)

**Files:**
- Modify: `skills/prevc-review/SKILL.md` (Step 6 "Gate check")
- Modify: `skills/prevc-flow/SKILL.md` (seção nova "Gate de evidência por fase", antes de "## Anti-Patterns"; e a linha "autonomous mode still respects all quality gates")
- Modify: `skills/autonomous-loop/SKILL.md` e `skills/prevc-execution/SKILL.md` (um parágrafo cada)
- Create: `tests/skills/test-prevc-review-evidence-contract.mjs`

**Interfaces:**
- Consumes: `planFacts(root)` (Task 5), `evaluateTransition` (Task 4).
- Produces: bloco cercado na skill `prevc-review` com a marca `<!-- review-frontmatter -->` na linha anterior, contendo o YAML do `review:`.

- [ ] **Step 1: Escrever o teste que falha** — `tests/skills/test-prevc-review-evidence-contract.mjs`:

```js
// tests/skills/test-prevc-review-evidence-contract.mjs — o exemplo de review: que a prevc-review manda
// gravar tem que passar no coletor real do gate (D5). Contrato, não checagem de texto.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planFacts } from "../../scripts/phase-gate.mjs";
import { evaluateTransition } from "../../scripts/lib/phase-evidence.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("o review: da skill prevc-review abre a saída da fase R no gate", () => {
  const skill = fs.readFileSync(path.join(REPO, "skills/prevc-review/SKILL.md"), "utf8");
  const m = skill.match(/<!-- review-frontmatter -->\s*```yaml\n([\s\S]*?)```/);
  assert.ok(m, "a skill precisa do bloco marcado <!-- review-frontmatter -->");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-contract-"));
  fs.mkdirSync(path.join(root, ".context/runtime/workflows"), { recursive: true });
  fs.mkdirSync(path.join(root, ".context/plans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".context/runtime/workflows/plans.json"), JSON.stringify({ active: [{ slug: "x", path: "plans/x.md" }], primary: "x" }));
  fs.writeFileSync(path.join(root, ".context/plans/x.md"), `---\ntype: plan\n${m[1]}---\n# Plano\n`);
  const r = evaluateTransition("R", { plan: planFacts(root) });
  assert.deepEqual(r.missing, []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/skills/test-prevc-review-evidence-contract.mjs`
Expected: FAIL com "a skill precisa do bloco marcado <!-- review-frontmatter -->".

- [ ] **Step 3: Editar `skills/prevc-review/SKILL.md`** — no Step 6 (Gate check), depois da lista de requisitos, acrescentar:

````markdown
### Registrar o veredito no plano (gate de evidência, ADR-018)

Ao fechar a revisão, grave o veredito no frontmatter do plano linkado (`.context/plans/<slug>.md`). O
`workflow-advance` da fase R é negado pelo hook `pre-tool-use-phase-gate` enquanto este bloco não
existir com `verdict: PROCEED` — em qualquer autonomia, e `force: true` não contorna:

<!-- review-frontmatter -->
```yaml
review:
  verdict: PROCEED
  reviewers: [architect, security-auditor]
  date: "2026-10-10"
```

`verdict` é `PROCEED`, `REVISE` ou `BLOCK` (o mesmo da seção "Recommendation"). Com `REVISE`/`BLOCK` o
plano volta para correção e a revisão é refeita.
````

- [ ] **Step 4: Editar `skills/prevc-flow/SKILL.md`** — trocar a linha `- \`autonomous\` mode still respects all quality gates — it just doesn't ask the human` por `- \`autonomous\` mode still respects all quality gates — it just doesn't ask the human. O gate de evidência por fase (hook \`pre-tool-use-phase-gate\`, ADR-018) vale em todas as autonomias e \`force: true\` não o contorna.` e, antes de `## Anti-Patterns`, acrescentar:

```markdown
## Gate de evidência por fase (ADR-018)

O dotcontext desliga os próprios gates com `autonomous: true`. O DevFlow mantém um gate mecânico no
`workflow-advance` (MCP e CLI), em qualquer autonomia, configurável em `.context/.devflow.yaml`
(`prevc.evidenceGate: block | warn | off`, padrão `block`). Para sair de cada fase:

| Fase | Evidência mínima |
|---|---|
| P | plano linkado ao workflow, com corpo |
| R | `review.verdict: PROCEED` no frontmatter do plano (skill `prevc-review`) |
| E | commit na branch de feature desde o início da fase E; stories deste workflow fechadas |
| V | `verify-gate` aprovado |
| C (concluir) | trabalho na branch base (merge, inclusive squash ou local) ou branch publicada no remoto |

Um deny lista o que falta e como produzir. Não contorne: produza a evidência.
```

- [ ] **Step 5: Editar `skills/autonomous-loop/SKILL.md` e `skills/prevc-execution/SKILL.md`** — em cada uma, na seção de conclusão da fase E, acrescentar o parágrafo:

```markdown
**Saída da fase E (gate de evidência, ADR-018):** o `workflow-advance` só passa com pelo menos um commit
na branch de feature desde o início da fase E (nunca numa branch protegida) e, se houver
`.context/workflow/stories.yaml` deste workflow, sem story `pending` ou `in_progress`.
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test tests/skills/test-prevc-review-evidence-contract.mjs && bash tests/run-lint.sh`
Expected: PASS e lint limpo.

- [ ] **Step 7: Commit**

```bash
git add tests/skills/test-prevc-review-evidence-contract.mjs
git commit -m "docs(skills): veredito da revisão no plano e gate de evidência por fase" -- skills/prevc-review/SKILL.md skills/prevc-flow/SKILL.md skills/autonomous-loop/SKILL.md skills/prevc-execution/SKILL.md tests/skills/test-prevc-review-evidence-contract.mjs
```

---

## Task 8: ADRs — 018 nova (gate de evidência) e ADR-017 v1.1.0 (fase no meio do turno)

**Agent:** architect
**Tier:** standard
**Handoff from:** Tasks 2 e 6
**Standards:** std-commit-hygiene, std-pre-commit-hygiene
**Tests:** lint (auditoria de ADRs)

**Files:**
- Create: `.context/engineering/adrs/018-phase-evidence-gate-v1.0.0.md`
- Modify (evolve): `.context/engineering/adrs/017-model-routing-v1.0.0.md` → `017-model-routing-v1.1.0.md`
- Modify: `.context/engineering/adrs/README.md` (índice, via script)

**Interfaces:** nenhuma de código.

- [ ] **Step 1: Rodar a auditoria antes (linha de base)**

Run: `node scripts/adr-audit.mjs` (ou o comando que a skill `devflow:adr-builder` indicar para auditoria)
Expected: verde; anotar a saída para comparar.

- [ ] **Step 2: Criar a ADR-018** — invocar a skill `devflow:adr-builder` em modo CREATE (pré-preenchido) com: `name: phase-evidence-gate`, número 018 (a 016 está reservada para outra feature), `scope: organizational`, `stack: universal`, `category: arquitetura`, `status: Proposto`, `decision_kind: gated`. Conteúdo, tirado da spec §4 e §6 (D2–D5):
  - **Contexto:** braço C da campanha (PREVC nominal); `autonomous: true` do dotcontext desliga os gates.
  - **Decisão:** hook PreToolUse dedicado nega `workflow-advance` (MCP, `force` incluso) e a CLI no Bash sem a evidência da matriz; `prevc.evidenceGate`.
  - **Alternativas:** só skills; só em autonomous; `autonomous: false` no dotcontext; estender a catraca.
  - **Guardrails:**
    - SEMPRE decidir a evidência na lib pura `scripts/lib/phase-evidence.mjs`; o coletor só junta fatos.
    - NUNCA emitir `allow` do hook; saída é deny, aviso ou nada.
    - NUNCA negar por erro interno do coletor (git ausente, exceção): avisar e deixar passar.
    - QUANDO `prevc.evidenceGate` tiver valor inválido, ENTÃO tratar como `block`.
    - SEMPRE subprocesso por `execFile` com argv.
    - NUNCA depender de `gh`/`glab` para provar a entrega da fase C.
  - **Limites:** anti-teatro, não anti-adversário; edição direta do `prevc.json` e parada antes da C fora do alcance.

- [ ] **Step 3: Evoluir a ADR-017 (minor → 1.1.0)** — invocar `devflow:adr-builder` em modo EVOLVE sobre `model-routing`, acrescentando à Decisão e aos Guardrails:
  - "A fase vem do `prevc.json`, relido no `turn.start` e, no meio do turno, no `turn.step` e no `agent.spawn` quando `(mtimeMs, size)` muda (H1 confirmada na campanha de 2026-10-09)."
  - Guardrail: "QUANDO o `prevc.json` estiver ilegível ou parcial no meio do turno, ENTÃO manter a fase atual (nunca zerar fora do `turn.start`)."

- [ ] **Step 4: Atualizar o índice e auditar**

Run: `node scripts/adr-update-index.mjs && node scripts/adr-audit.mjs && bash tests/run-lint.sh`
Expected: índice com 017 v1.1.0 e 018; auditoria e lint verdes.

- [ ] **Step 5: Commit** (listar os caminhos que o `git status` mostrar como alterados pelas Steps 2–4, sempre explícitos)

```bash
git add .context/engineering/adrs/018-phase-evidence-gate-v1.0.0.md .context/engineering/adrs/017-model-routing-v1.1.0.md
git commit -m "docs(adr): ADR-018 gate de evidência por fase e ADR-017 v1.1.0" -- .context/engineering/adrs/
```

---

## Task 9: CHANGELOG, achados da campanha e backlog

**Agent:** documentation-writer
**Tier:** cheap
**Handoff from:** Task 8
**Standards:** std-commit-hygiene, std-pre-commit-hygiene
**Tests:** lint (guarda do CHANGELOG)

**Files:**
- Modify: `CHANGELOG.md` (seção `[Unreleased]`)
- Modify: `docs/superpowers/2026-10-09-model-routing-lab-findings.md` (seção nova "Campanha 2026-10-09 — resultados")
- Create: `docs/superpowers/2026-10-10-check-prevc-bypass-path-gap.md`

- [ ] **Step 1: Rodar a guarda do CHANGELOG antes**

Run: `node --test tests/scripts/test-changelog-guard.mjs`
Expected: PASS (linha de base).

- [ ] **Step 2: CHANGELOG** — em `[Unreleased]`, acrescentar:

```markdown
### Fixed
- Roteamento de modelos: a fase do PREVC é relida no meio do turno (`turn.step` e `agent.spawn`) quando o `prevc.json` muda; antes ficava presa no `turn.start` e, em `claude -p`, sessão e subagentes rodavam na fase errada (ADR-017 v1.1.0).

### Added
- Gate de evidência por fase: o hook `pre-tool-use-phase-gate` nega o `workflow-advance` (MCP, `force` incluso, e a CLI do dotcontext) sem a evidência mínima da fase atual, em qualquer autonomia. Configurável em `prevc.evidenceGate: block | warn | off` (padrão `block`). ADR-018.
```

- [ ] **Step 3: Achados** — em `docs/superpowers/2026-10-09-model-routing-lab-findings.md`, acrescentar ao fim uma seção "Campanha 2026-10-09 — resultados (n = 1, v3.7.0)" com: A × B × C (duração, aceitação 13/13 nos três, saída 0,58× no B e 0,12× no C); H1 confirmada (`INV-PHASE-SYNC` 12/12 MISS, `INV-SESS` 45/102 MISS, mecanismo pelos turnos de background); D5 (PREVC nominal no C); o que funcionou (tier por task, `INV-EFF` HELD em 62 pontos, defaults por agente, ledger); e "corrigido em" apontando para esta spec. Sem caminhos locais.

- [ ] **Step 4: Backlog** — `docs/superpowers/2026-10-10-check-prevc-bypass-path-gap.md`:

```markdown
# Backlog — lembrete de bypass do PREVC procura o workflow no caminho antigo

`scripts/lib/check-prevc-bypass.mjs` (PostToolUse, ADR-006) procura o workflow ativo em
`.context/harness/workflows/prevc.json`, mas o dotcontext atual grava em
`.context/runtime/workflows/prevc.json`. Efeito: o lembrete `<PREVC_HANDOFF_BYPASS>` dispara a cada
edição de plano mesmo com workflow ativo (falso positivo). Correção provável: ler o caminho do runtime
(com o antigo como fallback) e cobrir no `tests/hooks/test-post-tool-use-prevc-bypass.sh`.
Achado lateral do workflow `routing-phase-sync-and-autonomous-gates` (2026-10-10); fora do escopo dele.
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/scripts/test-changelog-guard.mjs && bash tests/run-lint.sh`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/2026-10-10-check-prevc-bypass-path-gap.md
git commit -m "docs: changelog, resultados da campanha do laboratório e backlog do lembrete de bypass" -- CHANGELOG.md docs/superpowers/2026-10-09-model-routing-lab-findings.md docs/superpowers/2026-10-10-check-prevc-bypass-path-gap.md
```

---

## Pendências para a fase R (da spec §7)

- ~~Onde o `plan link` grava o vínculo~~ — **resolvido na P (2026-10-10):** em `.context/runtime/workflows/plans.json`; o legado `.context/workflow/plans.json` fica parado num plano antigo. Confirma a regra "o primeiro que existe decide" do `linkedPlan`.
- Confirmar que o dotcontext preserva a chave `review:` no frontmatter do plano quando reescreve o arquivo (`plan updatePhase`/`commitPhase`). Se não preservar, o veredito passa para um arquivo próprio e as Tasks 5 e 7 mudam.
- Confirmar o formato do `tool_input` do `workflow-advance` no evento PreToolUse (o gate não depende do `force`, mas o teste E2E simula `{"force": true}`).
