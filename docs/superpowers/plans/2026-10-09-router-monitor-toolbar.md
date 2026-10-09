---
type: plan
name: router-monitor-toolbar
spec: docs/superpowers/specs/2026-10-09-router-monitor-toolbar-design.md
scale: MEDIUM
autonomy: supervised
created: "2026-10-09"
requiredSignals: [unit, integration, e2e, lint]
---

# Monitor do roteamento de modelos — Plano de implementação

> **DevFlow workflow:** router-monitor-toolbar | **Scale:** MEDIUM | **Phase:** P→R
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faixa ao vivo acima do prompt com uma linha por agente em execução (sessão e subagentes): `Modelo: m·esforço (origem) | Tempo | Falhas | Retentativas`.

**Architecture:** Lib pura `scripts/lib/monitor-core.mjs` (estado das linhas, id da task, retentativas, streak, formatação) consumida por um segundo módulo de mod, `hooks/router-monitor.mjs`, que observa eventos e desenha a faixa `AbovePrompt`. O `hooks/router.mjs` existente só publica o modelo/esforço **aplicados** e a origem no valor `devflow.routing` do `$.state`.

**Tech Stack:** ES modules `.mjs` sem dependências; API de mods do Claude Code (`on`, `$.state`, `$.clock`, `$.agent.list`, `$.ui.resolve`, `h` global); `node --test`; `claude plugin test` / `claude plugin validate`.

**Agents:** feature-developer (Tasks 1, 2, 4, 5), backend-specialist (Task 3 — router, peça sensível à ADR-017), test-writer + documentation-writer (Task 6).

**Spec:** `docs/superpowers/specs/2026-10-09-router-monitor-toolbar-design.md`

**requiredSignals:** `[unit, integration, e2e, lint]`

## Global Constraints

- O monitor **só observa**: todo hook devolve o resultado de `next(e)` com `e` intacto e é registrado com `.catch(($, e, next) => next(e))`. Nunca nega, nunca reescreve.
- O monitor nunca lê arquivo do repositório, nunca grava ledger, nunca envia dado para fora; nunca exibe trecho de prompt nem de descrição livre (só tipo + id da task).
- `$.state` do plugin `devflow`: chaves `routing` (escrita só pelo router), `monitorRows` e `monitorRetries` (escritas só pelo monitor). Refs com `plugin`/`key` **literais** no código. Valores JSON, nunca `undefined` (usar `null`).
- Limites: 50 linhas rastreadas; 500 chaves de retentativa (sai a mais antiga); id da task só nos primeiros 2048 caracteres do prompt; linha órfã sai após 30 000 ms sem evento quando `$.agent.list()` falha; até 6 linhas visíveis + `+N agentes`; rótulo cortado em 32 colunas.
- Formato da linha: `{rótulo} Modelo: {modelo sem "claude-"}·{esforço|-} ({roteado|teto|router off}) | Tempo: {mm:ss|h:mm:ss} | Falhas: {streak} | Retentativas: {n|—}`.
- Cores (ThemeKey): `Falhas` `warning` de 1 a `failureStreak − 1`, `error` a partir de `failureStreak` (padrão 3); `Retentativas ≥ 1` `warning`; origem `roteado` `success`, `teto` `subtle`, `router off` `inactive`.
- Id da task: `description` com `\bTask (\d+[a-z]?)\b` → `Task N`; senão prompt com `^\s*Current story:\s*(S\d+)\b` (multilinha) → `S2`; senão `null`.
- O router segue as guardrails da ADR-017; a escrita em `$.state` fica em `try` próprio e não altera nada que o router devolve.
- Idioma de código/comentários/commits: pt-BR (termos técnicos mantidos). Commits só com pathspec explícito (há WIP do operador na árvore: `.context/plans/model-routing.md`, `.context/workflow/.checkpoint/last.json`, `.gitignore`, `docs/jev*`, `docs/test-writer.md`, spec session-start — nunca adicionar).
- Subagents de implementação: **proibido** `gh`, criar PR, merge, push. Só commit local na branch `feature/router-monitor-toolbar`.

## Review Focus

1. Subagente em **background** que sobrevive ao fim do turno da sessão: a linha dele deve continuar na faixa depois do `turn.complete` da sessão (teste na Task 4).
2. **Recarga a quente** no meio de uma rodada: um módulo novo, com `$.state` já povoado, deve reabrir o cronômetro no `session.start` sem zerar contadores (teste na Task 4).
3. **`$.agent.list()` rejeitando**: a linha órfã sai pelo critério de 30 s, e não fica para sempre (teste na Task 4).
4. **`Task N` só no corpo do prompt** (não na `description`): não conta como id; só `Current story:` é lido do prompt (teste na Task 1).
5. **`/devflow-route off` no meio da rodada**: as linhas passam a `router off` e o modelo publicado (agora velho) deixa de valer (testes nas Tasks 2 e 3).

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/lib/monitor-core.mjs` | criar | estado + formatação, puro |
| `tests/lib/monitor-core.test.mjs` | criar | unit |
| `hooks/router.mjs` | modificar | publicar `devflow.routing` |
| `tests/integration/test-router-mod.mjs` | modificar | `$.state` falso + testes da publicação |
| `types/index.d.ts` | criar | contrato `PluginState.devflow` |
| `.claude-plugin/plugin.json` | modificar | `"types": "./types/index.d.ts"` |
| `hooks/router-monitor.mjs` | criar | módulo do monitor (eventos, tick, render) |
| `tests/integration/test-router-monitor-mod.mjs` | criar | integração com `$` falso |
| `hooks/router-monitor.test.ts` | criar | smoke do kit |
| `hooks/hooks.json` | modificar | `modules: ["./router.mjs", "./router-monitor.mjs"]` |
| `tests/e2e/router-monitor-validate.e2e.test.mjs` | criar | `claude plugin validate .` |
| `docs/model-routing.md`, `CHANGELOG.md` | modificar | documentação |

---

### Task 1: monitor-core — estado das linhas, id da task e retentativas

**Agent:** feature-developer
**Tests:** unit

**Files:**
- Create: `scripts/lib/monitor-core.mjs`
- Test: `tests/lib/monitor-core.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces (usadas nas Tasks 2, 4 e 5):
  - constantes `MAX_ROWS=50`, `MAX_KEYS=500`, `PROMPT_SCAN=2048`, `STALE_MS=30000`
  - `createMonitorState(): { rows: Row[], retries: Record<string, number> }`
  - `Row = { id: string, label: string, startedAt: number, lastEventAt: number, model: string|null, effort: string|null, streak: number, retries: number|null }`
  - `extractTaskId({ description?, prompt? }): string|null`
  - `onSpawned(state, { agentId, subagentType, description, prompt, model, now }): Row|null`
  - `openMain(state, { now }): void` · `closeMain(state): boolean`
  - `onTool(state, { loopId, isError, now }): boolean`
  - `onStep(state, { loopId, model, effort, now }): boolean` (true quando modelo/esforço mudou)
  - `reap(state, { list: Array<{id, status}>|null, now }): boolean` · `isLive(state): boolean`

- [ ] **Step 1: Escrever o teste falhando**

`tests/lib/monitor-core.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as mc from "../../scripts/lib/monitor-core.mjs";

test("extractTaskId: Task N na description (formatos do SDD)", () => {
  assert.equal(mc.extractTaskId({ description: "Implement Task 3: parser" }), "Task 3");
  assert.equal(mc.extractTaskId({ description: "Review Task 12 (spec + quality)" }), "Task 12");
  assert.equal(mc.extractTaskId({ description: "Re-review Task 18b fix round 2" }), "Task 18b");
});

test("extractTaskId: Current story no prompt (autonomous-loop)", () => {
  assert.equal(mc.extractTaskId({ description: "story", prompt: "Contexto\n- Current story: S2 — login\n" }), "S2");
});

test("extractTaskId: Task N só no corpo do prompt não conta; sem id → null", () => {
  assert.equal(mc.extractTaskId({ description: "investigar", prompt: "Implemente a Task 3 do plano" }), null);
  assert.equal(mc.extractTaskId({}), null);
  assert.equal(mc.extractTaskId({ description: 42, prompt: null }), null);
});

test("extractTaskId: story além de 2048 caracteres do prompt é ignorada", () => {
  const prompt = "x".repeat(mc.PROMPT_SCAN) + "\nCurrent story: S9\n";
  assert.equal(mc.extractTaskId({ description: "d", prompt }), null);
});

test("onSpawned: 1º despacho = 0 retentativas; mesmo tipo e task = +1; outro tipo não soma", () => {
  const st = mc.createMonitorState();
  const a = mc.onSpawned(st, { agentId: "a1", subagentType: "devflow:test-writer", description: "Implement Task 3: x", prompt: "", model: "sonnet", now: 1000 });
  assert.deepEqual(a, { id: "a1", label: "devflow:test-writer · Task 3", startedAt: 1000, lastEventAt: 1000, model: "sonnet", effort: null, streak: 0, retries: 0 });
  assert.equal(mc.onSpawned(st, { agentId: "a2", subagentType: "devflow:test-writer", description: "Re-review Task 3 fix round 1", now: 2000 }).retries, 1);
  assert.equal(mc.onSpawned(st, { agentId: "a3", subagentType: "devflow:code-reviewer", description: "Review Task 3", now: 3000 }).retries, 0);
});

test("onSpawned: sem id de task → retries null e rótulo só com o tipo; sem agentId → null", () => {
  const st = mc.createMonitorState();
  const r = mc.onSpawned(st, { agentId: "a1", subagentType: "Explore", description: "mapear", now: 1 });
  assert.equal(r.retries, null);
  assert.equal(r.label, "Explore");
  assert.equal(mc.onSpawned(st, { subagentType: "Explore", now: 1 }), null);
});

test("onSpawned: limite de 500 chaves descarta a mais antiga; 50 linhas preservam a sessão", () => {
  const st = mc.createMonitorState();
  mc.openMain(st, { now: 0 });
  for (let i = 0; i < mc.MAX_KEYS + 1; i++) mc.onSpawned(st, { agentId: `a${i}`, subagentType: "t", description: `Task ${i}`, now: i });
  assert.equal(Object.keys(st.retries).length, mc.MAX_KEYS);
  assert.equal(st.retries["t::Task 0"], undefined);
  assert.equal(st.rows.length, mc.MAX_ROWS);
  assert.equal(st.rows[0].id, "main");
});

test("onTool: erro soma, sucesso zera; loop sem linha → false", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "a1", subagentType: "t", now: 0 });
  assert.equal(mc.onTool(st, { loopId: "a1", isError: true, now: 5 }), true);
  mc.onTool(st, { loopId: "a1", isError: true, now: 6 });
  assert.equal(st.rows[0].streak, 2);
  assert.equal(st.rows[0].lastEventAt, 6);
  mc.onTool(st, { loopId: "a1", isError: false, now: 7 });
  assert.equal(st.rows[0].streak, 0);
  assert.equal(mc.onTool(st, { loopId: "fork-interno", isError: true, now: 8 }), false);
});

test("onStep: atualiza modelo/esforço e diz se mudou", () => {
  const st = mc.createMonitorState();
  mc.openMain(st, { now: 0 });
  assert.equal(mc.onStep(st, { loopId: "main", model: "claude-opus-5-5", effort: "high", now: 1 }), true);
  assert.equal(mc.onStep(st, { loopId: "main", model: "claude-opus-5-5", effort: "high", now: 2 }), false);
  assert.equal(st.rows[0].lastEventAt, 2);
});

test("openMain/closeMain: sessão reabre zerada no topo e fecha sem tocar subagentes", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "a1", subagentType: "t", now: 0 });
  mc.openMain(st, { now: 10 });
  mc.onTool(st, { loopId: "main", isError: true, now: 11 });
  mc.openMain(st, { now: 20 });
  assert.equal(st.rows[0].id, "main");
  assert.equal(st.rows[0].streak, 0);
  assert.equal(st.rows[0].startedAt, 20);
  assert.equal(mc.closeMain(st), true);
  assert.deepEqual(st.rows.map((r) => r.id), ["a1"]);
  assert.equal(mc.closeMain(st), false);
});

test("reap: com lista, sai quem terminou ou sumiu; sessão nunca sai", () => {
  const st = mc.createMonitorState();
  mc.openMain(st, { now: 0 });
  for (const id of ["a1", "a2", "a3", "a4"]) mc.onSpawned(st, { agentId: id, subagentType: "t", now: 0 });
  const list = [{ id: "a1", status: "running" }, { id: "a2", status: "completed" }, { id: "a3", status: "killed" }];
  assert.equal(mc.reap(st, { list, now: 1 }), true);
  assert.deepEqual(st.rows.map((r) => r.id), ["main", "a1"]);
  assert.equal(mc.isLive(st), true);
});

test("reap: sem lista (falhou), sai só quem está sem evento há mais de 30 s", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "velho", subagentType: "t", now: 0 });
  mc.onSpawned(st, { agentId: "novo", subagentType: "t", now: 0 });
  mc.onTool(st, { loopId: "novo", isError: false, now: 20_000 });
  mc.reap(st, { list: null, now: mc.STALE_MS + 1 });
  assert.deepEqual(st.rows.map((r) => r.id), ["novo"]);
  mc.reap(st, { list: null, now: 20_000 + mc.STALE_MS + 1 });
  assert.equal(mc.isLive(st), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/monitor-core.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/lib/monitor-core.mjs`

- [ ] **Step 3: Implementar o mínimo**

`scripts/lib/monitor-core.mjs`:

```js
// Estado da faixa do monitor de roteamento (puro: sem `$`, sem node:*). Spec: 2026-10-09-router-monitor-toolbar.
export const MAX_ROWS = 50;
export const MAX_KEYS = 500;
export const PROMPT_SCAN = 2048;
export const STALE_MS = 30_000;

const DONE = new Set(["completed", "failed", "killed"]);
const TASK_RE = /\bTask (\d+[a-z]?)\b/;
const STORY_RE = /^\s*Current story:\s*(S\d+)\b/m;

export function createMonitorState() {
  return { rows: [], retries: {} };
}

export function extractTaskId({ description, prompt } = {}) {
  const d = typeof description === "string" ? description.match(TASK_RE) : null;
  if (d) return `Task ${d[1]}`;
  const p = typeof prompt === "string" ? prompt.slice(0, PROMPT_SCAN).match(STORY_RE) : null;
  return p ? p[1] : null;
}

function bumpRetry(state, key) {
  const seen = state.retries[key] ?? 0;
  delete state.retries[key]; // reinsere no fim: a ordem de inserção é a idade
  state.retries[key] = seen + 1;
  const keys = Object.keys(state.retries);
  for (let i = 0; i < keys.length - MAX_KEYS; i++) delete state.retries[keys[i]];
  return seen;
}

export function onSpawned(state, { agentId, subagentType, description, prompt, model, now }) {
  if (typeof agentId !== "string" || !agentId) return null;
  const type = typeof subagentType === "string" && subagentType ? subagentType : "agente";
  const taskId = extractTaskId({ description, prompt });
  const retries = taskId ? bumpRetry(state, `${type}::${taskId}`) : null;
  const row = {
    id: agentId, label: taskId ? `${type} · ${taskId}` : type, startedAt: now, lastEventAt: now,
    model: typeof model === "string" && model ? model : null, effort: null, streak: 0, retries,
  };
  state.rows = state.rows.filter((r) => r.id !== agentId);
  state.rows.push(row);
  while (state.rows.length > MAX_ROWS) {
    const i = state.rows.findIndex((r) => r.id !== "main");
    state.rows.splice(i < 0 ? 0 : i, 1);
  }
  return row;
}

export function openMain(state, { now }) {
  state.rows = state.rows.filter((r) => r.id !== "main");
  state.rows.unshift({ id: "main", label: "sessão", startedAt: now, lastEventAt: now, model: null, effort: null, streak: 0, retries: null });
}

export function closeMain(state) {
  const n = state.rows.length;
  state.rows = state.rows.filter((r) => r.id !== "main");
  return state.rows.length !== n;
}

export function onTool(state, { loopId, isError, now }) {
  const row = state.rows.find((r) => r.id === loopId);
  if (!row) return false;
  row.streak = isError ? row.streak + 1 : 0;
  row.lastEventAt = now;
  return true;
}

export function onStep(state, { loopId, model, effort, now }) {
  const row = state.rows.find((r) => r.id === loopId);
  if (!row) return false;
  let changed = false;
  if (typeof model === "string" && model && model !== row.model) { row.model = model; changed = true; }
  if (typeof effort === "string" && effort && effort !== row.effort) { row.effort = effort; changed = true; }
  row.lastEventAt = now;
  return changed;
}

export function reap(state, { list, now }) {
  const before = state.rows.length;
  const status = Array.isArray(list) ? new Map(list.map((a) => [a?.id, a?.status])) : null;
  state.rows = state.rows.filter((r) => {
    if (r.id === "main") return true;
    if (status) return status.has(r.id) && !DONE.has(status.get(r.id));
    return now - r.lastEventAt <= STALE_MS;
  });
  return state.rows.length !== before;
}

export const isLive = (state) => state.rows.length > 0;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/lib/monitor-core.test.mjs`
Expected: PASS (12 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/monitor-core.mjs tests/lib/monitor-core.test.mjs
git commit -m "feat(router-monitor): estado das linhas, id da task e retentativas (lib pura)" -- scripts/lib/monitor-core.mjs tests/lib/monitor-core.test.mjs
```

---

### Task 2: monitor-core — formatação da faixa

**Agent:** feature-developer
**Tests:** unit

**Files:**
- Modify: `scripts/lib/monitor-core.mjs` (acrescentar ao fim)
- Test: `tests/lib/monitor-core.test.mjs` (acrescentar ao fim)

**Interfaces:**
- Consumes: `createMonitorState`, `onSpawned`, `openMain`, `onTool`, `onStep` (Task 1).
- Produces (usadas na Task 5):
  - constantes `VISIBLE=6`, `LABEL_COLS=32`, `DEFAULT_FAILURE_STREAK=3`
  - `Routing = { active: boolean, failureStreak: number, loops: Record<string, { model: string|null, effort: string|null, origin: "roteado"|"teto" }> }`
  - `fmtDuration(ms): string` · `shortModel(model): string` · `originOf(routing|undefined, loopId): "roteado"|"teto"|"router off"`
  - `view(state, { routing, now, visible? }): { rows: ViewRow[], more: number }`
  - `ViewRow = { id, label, model, origin, originColor, time, streak, streakColor, retries, retriesColor }` (`model` já como `sonnet-5-5·medium`; cores são ThemeKey ou `undefined`)
  - `lineText(viewRow): string`

- [ ] **Step 1: Escrever o teste falhando**

Acrescentar a `tests/lib/monitor-core.test.mjs`:

```js
test("fmtDuration: mm:ss e h:mm:ss; negativo vira 00:00", () => {
  assert.equal(mc.fmtDuration(72_000), "01:12");
  assert.equal(mc.fmtDuration(3_600_000 + 61_000), "1:01:01");
  assert.equal(mc.fmtDuration(-5), "00:00");
});

test("shortModel: tira claude-; alias como veio; vazio → ?", () => {
  assert.equal(mc.shortModel("claude-sonnet-5-5"), "sonnet-5-5");
  assert.equal(mc.shortModel("haiku"), "haiku");
  assert.equal(mc.shortModel(null), "?");
});

test("originOf: roteado/teto com router ativo; router off sem valor ou desligado", () => {
  const routing = { active: true, failureStreak: 3, loops: { a1: { model: "haiku", effort: "low", origin: "roteado" } } };
  assert.equal(mc.originOf(routing, "a1"), "roteado");
  assert.equal(mc.originOf(routing, "a2"), "teto");
  assert.equal(mc.originOf(undefined, "a1"), "router off");
  assert.equal(mc.originOf({ ...routing, active: false }, "a1"), "router off");
});

test("view: sessão primeiro, subagentes por início, modelo publicado vence o observado", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "b", subagentType: "devflow:test-writer", description: "Implement Task 3: x", model: "sonnet", now: 2000 });
  mc.onSpawned(st, { agentId: "a", subagentType: "Explore", now: 1000 });
  mc.openMain(st, { now: 0 });
  mc.onStep(st, { loopId: "main", model: "claude-opus-5-5", effort: "high", now: 0 });
  const routing = { active: true, failureStreak: 3, loops: { b: { model: "claude-sonnet-5-5", effort: "medium", origin: "roteado" } } };
  const v = mc.view(st, { routing, now: 74_000 });
  assert.deepEqual(v.rows.map((r) => r.id), ["main", "a", "b"]);
  const b = v.rows[2];
  assert.equal(b.model, "sonnet-5-5·medium");
  assert.equal(b.origin, "roteado");
  assert.equal(b.originColor, "success");
  assert.equal(b.time, "01:12");
  assert.equal(mc.lineText(b), "devflow:test-writer · Task 3     Modelo: sonnet-5-5·medium (roteado) | Tempo: 01:12 | Falhas: 0 | Retentativas: 0");
  assert.equal(v.rows[0].model, "opus-5-5·high");
  assert.equal(v.rows[0].origin, "teto");
  assert.equal(v.rows[1].model, "?·-");
  assert.equal(v.rows[1].retries, "—");
});

test("view: router desligado ignora o publicado (velho) e marca router off", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "a1", subagentType: "t", model: "claude-opus-5-5", now: 0 });
  const routing = { active: false, failureStreak: 3, loops: { a1: { model: "haiku", effort: "low", origin: "roteado" } } };
  const r = mc.view(st, { routing, now: 0 }).rows[0];
  assert.equal(r.model, "opus-5-5·-");
  assert.equal(r.origin, "router off");
  assert.equal(r.originColor, "inactive");
});

test("view: cores de Falhas pelo failureStreak e de Retentativas ≥ 1", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "a1", subagentType: "t", description: "Task 1", now: 0 });
  mc.onSpawned(st, { agentId: "a2", subagentType: "t", description: "Task 1", now: 1 });
  const routing = { active: true, failureStreak: 2, loops: {} };
  const color = () => mc.view(st, { routing, now: 0 }).rows.find((r) => r.id === "a1").streakColor;
  assert.equal(color(), undefined);
  mc.onTool(st, { loopId: "a1", isError: true, now: 1 });
  assert.equal(color(), "warning");
  mc.onTool(st, { loopId: "a1", isError: true, now: 2 });
  assert.equal(color(), "error");
  const a2 = mc.view(st, { routing, now: 0 }).rows.find((r) => r.id === "a2");
  assert.equal(a2.retries, "1");
  assert.equal(a2.retriesColor, "warning");
});

test("view: failureStreak inválido cai no padrão 3", () => {
  const st = mc.createMonitorState();
  mc.onSpawned(st, { agentId: "a1", subagentType: "t", now: 0 });
  for (let i = 0; i < 2; i++) mc.onTool(st, { loopId: "a1", isError: true, now: i });
  assert.equal(mc.view(st, { routing: { active: true, failureStreak: "x", loops: {} }, now: 0 }).rows[0].streakColor, "warning");
});

test("view: até 6 linhas + more; rótulo cortado em 32 colunas com reticências", () => {
  const st = mc.createMonitorState();
  for (let i = 0; i < 9; i++) mc.onSpawned(st, { agentId: `a${i}`, subagentType: "devflow:um-tipo-de-agente-com-nome-enorme", now: i });
  const v = mc.view(st, { routing: undefined, now: 10 });
  assert.equal(v.rows.length, mc.VISIBLE);
  assert.equal(v.more, 3);
  assert.equal(v.rows[0].label.length, mc.LABEL_COLS);
  assert.ok(v.rows[0].label.endsWith("…"));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/monitor-core.test.mjs`
Expected: FAIL — `mc.fmtDuration is not a function` (e demais funções novas)

- [ ] **Step 3: Implementar o mínimo**

Acrescentar ao fim de `scripts/lib/monitor-core.mjs`:

```js
export const VISIBLE = 6;
export const LABEL_COLS = 32;
export const DEFAULT_FAILURE_STREAK = 3;
const ORIGIN_COLOR = { roteado: "success", teto: "subtle", "router off": "inactive" };

export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const p = (n) => String(n).padStart(2, "0");
  const ms_ = `${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  return h ? `${h}:${ms_}` : ms_;
}

export function shortModel(model) {
  return typeof model === "string" && model ? model.replace(/^claude-/, "") : "?";
}

export function originOf(routing, loopId) {
  if (routing?.active !== true) return "router off";
  return routing.loops?.[loopId]?.origin === "roteado" ? "roteado" : "teto";
}

const cut = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

export function view(state, { routing, now, visible = VISIBLE }) {
  const fs = routing?.failureStreak;
  const limit = Number.isInteger(fs) && fs > 0 ? fs : DEFAULT_FAILURE_STREAK;
  const subs = state.rows.filter((r) => r.id !== "main").sort((a, b) => a.startedAt - b.startedAt);
  const ordered = [...state.rows.filter((r) => r.id === "main"), ...subs];
  const rows = ordered.slice(0, visible).map((r) => {
    const pub = routing?.active === true ? routing.loops?.[r.id] : undefined; // desligado: o publicado é velho
    const origin = originOf(routing, r.id);
    return {
      id: r.id,
      label: cut(r.label, LABEL_COLS),
      model: `${shortModel(pub?.model ?? r.model)}·${pub?.effort ?? r.effort ?? "-"}`,
      origin, originColor: ORIGIN_COLOR[origin],
      time: fmtDuration(now - r.startedAt),
      streak: r.streak, streakColor: r.streak <= 0 ? undefined : r.streak >= limit ? "error" : "warning",
      retries: r.retries === null ? "—" : String(r.retries), retriesColor: r.retries > 0 ? "warning" : undefined,
    };
  });
  return { rows, more: Math.max(0, ordered.length - visible) };
}

export function lineText(v) {
  return `${v.label.padEnd(LABEL_COLS)} Modelo: ${v.model} (${v.origin}) | Tempo: ${v.time} | Falhas: ${v.streak} | Retentativas: ${v.retries}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/lib/monitor-core.test.mjs`
Expected: PASS (20 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/monitor-core.mjs tests/lib/monitor-core.test.mjs
git commit -m "feat(router-monitor): formatação da faixa (tempo, modelo, origem, cores, +N)" -- scripts/lib/monitor-core.mjs tests/lib/monitor-core.test.mjs
```

---

### Task 3: router publica a decisão aplicada em `devflow.routing`

**Agent:** backend-specialist (revisão leve focada em: nada do que o router devolve muda; ADR-017)
**Tests:** integration

**Files:**
- Modify: `hooks/router.mjs`
- Create: `types/index.d.ts`
- Modify: `.claude-plugin/plugin.json`
- Test: `tests/integration/test-router-mod.mjs`

**Interfaces:**
- Consumes: `tierOf` de `scripts/lib/model-routing.mjs` (já exportado).
- Produces (lido nas Tasks 4 e 5): valor `$.state` `{ plugin: "devflow", key: "routing" }` com a forma `Routing` da Task 2. `loops.main` = sessão; `loops[agentId]` = subagente roteado.

- [ ] **Step 1: Escrever o teste falhando**

Em `tests/integration/test-router-mod.mjs`, dentro de `load()`:
- trocar `const log = { reads: [], writes: [], completes: [], status: [] };` por
  `const log = { reads: [], writes: [], completes: [], status: [], state: {} };`
- acrescentar ao objeto `$`, depois de `ui: …,`, a linha:

```js
    state: {
      get: async (r) => ({ value: log.state[r.key], version: 0 }),
      set: async (r, v) => { if (stateThrows) throw new Error("state off"); log.state[r.key] = JSON.parse(JSON.stringify(v)); return { isSet: true, version: 1 }; },
    },
```
- e a assinatura de `load` passa a `async function load({ root, env = ON, statOverride, complete, stateThrows = false } = {})`.

Acrescentar ao fim do arquivo:

```js
test("monitor: spawn roteado publica modelo, esforço e origem aplicados", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS });
  const r = H.log.state.routing;
  assert.equal(r.active, true);
  assert.equal(r.failureStreak, 3);
  assert.equal(r.loops.a1.model, "haiku");
  assert.equal(r.loops.a1.origin, "roteado");
  assert.equal(typeof r.loops.a1.effort, "string");
});

test("monitor: spawn no teto não vira roteado", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  await H.spawn({ subagentType: "devflow:architect", parentModel: SONNET });
  const l = H.log.state.routing.loops.a1;
  assert.ok(!l || l.origin === "teto");
});

test("monitor: passo da sessão publica o modelo aplicado (não o e.model do usuário)", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, SONNET);
  await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 });
  const main = H.log.state.routing.loops.main;
  assert.equal(main.model, SONNET);
  assert.equal(main.origin, "roteado");
});

test("monitor: failureStreak vem do .devflow.yaml", async () => {
  const H = await load({ root: mkRepo("models:\n  enabled: true\n  midRun:\n    failureStreak: 5\n") });
  await H.turn();
  assert.equal(H.log.state.routing.failureStreak, 5);
});

test("monitor: /devflow-route off publica active false; sem opt-in também", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  await H.call("command.run", { command: "devflow-route", args: "off" });
  assert.equal(H.log.state.routing.active, false);
  const H2 = await load({ root: mkRepo(), env: { HOME: "/home/t" } });
  await H2.turn();
  assert.equal(H2.log.state.routing.active, false);
});

test("monitor: $.state.set lançando não muda o que o router devolve", async () => {
  const H = await load({ root: mkRepo(), stateThrows: true });
  await H.turn();
  const seen = await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS });
  assert.equal(seen.model, "haiku");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/integration/test-router-mod.mjs`
Expected: FAIL nos 5 primeiros testes novos (`Cannot read properties of undefined (reading 'active')` / `'loops'`); o 6º e os antigos passam.

- [ ] **Step 3: Implementar o mínimo**

Em `hooks/router.mjs`:

1. Trocar a linha de import de `model-routing.mjs` por:

```js
import { effectiveConfig, phaseFromPrevcJson, tierOf } from "../scripts/lib/model-routing.mjs";
```

2. Depois de `const MAX_LEDGER_LINES = 2000;`:

```js
const ROUTING = { plugin: "devflow", key: "routing" }; // lido pelo hooks/router-monitor.mjs
const MAX_PUB_LOOPS = 100;
```

3. No objeto `S`, acrescentar os campos `pub: {},` e `pubLast: "",`.

4. Depois da função `active`:

```js
function pubLoop(id, entry) {
  if (JSON.stringify(S.pub[id]) === JSON.stringify(entry)) return;
  delete S.pub[id];
  S.pub[id] = entry;
  const ks = Object.keys(S.pub);
  for (let i = 0; i < ks.length - MAX_PUB_LOOPS; i++) delete S.pub[ks[i]];
}

// Monitor (spec 2026-10-09-router-monitor-toolbar): só publica; nunca muda o que o router decide.
async function publish($) {
  try {
    const value = { active: active(), failureStreak: S.config.midRun?.failureStreak ?? 3, loops: S.pub };
    const json = JSON.stringify(value);
    if (json === S.pubLast) return;
    S.pubLast = json;
    await $.state.set(ROUTING, value);
  } catch {}
}
```

5. Na última linha de `ensure($)` (depois de `if (S.config.enabled) await detectOtherRouter($);`): `await publish($);`

6. Em `onCommand`, logo antes de `const c = S.core;`: `await publish($);`

7. Em `onAgentSpawn`, dentro de `if (res && "agentId" in res) { … }`, depois da linha do `ledger(...)`:

```js
    if (route) {
      pubLoop(res.agentId, { model: res.model ?? null, effort: route.effort ?? null, origin: route.tier !== route.ceiling ? "roteado" : "teto" });
      await publish($);
    }
```

8. No hook `turn.step`, dentro do `if (active()) { … }`, depois do bloco `if (e.agentId) … else { … }` (ainda dentro do `if (active())`):

```js
        if (e.agentId && patch && S.pub[e.agentId]) {
          const cur = S.pub[e.agentId];
          pubLoop(e.agentId, { ...cur, model: patch.model ?? cur.model, effort: patch.effort ?? cur.effort });
        } else if (!e.agentId) {
          const teto = tierOf(S.core.userModel);
          const routed = !S.sessionOff && !!S.core.sessionTier && !!teto && S.core.sessionTier !== teto;
          pubLoop("main", { model: patch?.model ?? e.model ?? null, effort: patch?.effort ?? e.effort ?? null, origin: routed ? "roteado" : "teto" });
        }
        await publish($);
```

Criar `types/index.d.ts`:

```ts
// Contrato do $.state do plugin devflow (claude plugin validate confere as chaves usadas nos módulos).
export type RoutingOrigin = "roteado" | "teto";
export type RoutingLoop = { model: string | null; effort: string | null; origin: RoutingOrigin };
export type RoutingSnapshot = { active: boolean; failureStreak: number; loops: Record<string, RoutingLoop> };
export type MonitorRow = {
  id: string; label: string; startedAt: number; lastEventAt: number;
  model: string | null; effort: string | null; streak: number; retries: number | null;
};

declare module "claude-code" {
  interface PluginState {
    devflow: {
      routing: RoutingSnapshot;
      monitorRows: MonitorRow[];
      monitorRetries: Record<string, number>;
    };
  }
}
```

Em `.claude-plugin/plugin.json`, acrescentar depois de `"license": "MIT",` a linha `"types": "./types/index.d.ts",` (sem mexer em `version`).

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/integration/test-router-mod.mjs && node --test tests/lib/router-core.test.mjs`
Expected: PASS (antigos + 6 novos)

Run: `claude plugin validate .` (se `claude` existir)
Expected: sem erro sobre `$.state` / `types`.

- [ ] **Step 5: Commit**

```bash
git add hooks/router.mjs types/index.d.ts .claude-plugin/plugin.json tests/integration/test-router-mod.mjs
git commit -m "feat(router-monitor): router publica modelo/esforço aplicados e origem em \$.state" -- hooks/router.mjs types/index.d.ts .claude-plugin/plugin.json tests/integration/test-router-mod.mjs
```

---

### Task 4: módulo do monitor — eventos e cronômetro

**Agent:** feature-developer
**Tests:** integration

**Files:**
- Create: `hooks/router-monitor.mjs`
- Test: `tests/integration/test-router-monitor-mod.mjs`

**Interfaces:**
- Consumes: Task 1 inteira; valor `routing` (Task 3) só na Task 5.
- Produces: `register(on)`; valores `$.state` `monitorRows` (`Row[]`) e `monitorRetries`; hooks em `session.start`, `turn.start`, `agent.spawn`, `tool.call`, `turn.step`, `turn.complete`. A Task 5 acrescenta o `ui.render`.

- [ ] **Step 1: Escrever o teste falhando**

`tests/integration/test-router-monitor-mod.mjs`:

```js
// Testa hooks/router-monitor.mjs de verdade: register(on) coleta os hooks; `$` falso com $.state,
// relógio controlável e $.agent.list configurável. O kit (hooks/router-monitor.test.ts) é só smoke de carga.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let n = 0;

globalThis.h = (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) });
const textOf = (node) => (node === null || node === undefined ? "" : typeof node === "string" || typeof node === "number" ? String(node) : node.children.map(textOf).join(""));

async function load({ store = {}, list = async () => [], throwsState = false } = {}) {
  const mod = await import(pathToFileURL(path.join(REPO, "hooks/router-monitor.mjs")).href + `?t=${n++}`);
  const hooks = {};
  const on = (ev, a, b) => { const h = b ?? a; hooks[ev] = { h, c: null }; return { catch(c) { hooks[ev].c = c; return this; } }; };
  mod.register(on);
  const clock = { now: 0, timers: [] };
  const $ = {
    state: {
      get: async (r) => { if (throwsState) throw new Error("x"); return { value: store[r.key], version: 0 }; },
      set: async (r, v) => { if (throwsState) throw new Error("x"); store[r.key] = JSON.parse(JSON.stringify(v)); return { isSet: true, version: 1 }; },
    },
    clock: {
      now: async () => clock.now,
      every: (ms, fn) => { const t = { ms, fn, cancelled: false, cancel() { t.cancelled = true; } }; clock.timers.push(t); return t; },
    },
    agent: { list },
    ui: { resolve: () => ({ Box: "Box", Text: "Text" }) },
  };
  const call = async (ev, e, nextImpl = async (x) => x) => {
    const { h, c } = hooks[ev];
    const next = async (x) => nextImpl(x);
    try { return await h($, e, next); } catch (err) { return c ? c($, e, next) : { skipped: String(err) }; }
  };
  const step = async (e) => {
    let sent;
    const gen = hooks["turn.step"].h($, e, async function* (x) { sent = x; return { ok: true }; });
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    return sent;
  };
  const live = () => clock.timers.filter((t) => !t.cancelled);
  const tick = async () => { for (const t of live()) await t.fn(); await new Promise((r) => setTimeout(r, 0)); };
  const spawn = (e, agentId = "a1", model = "claude-sonnet-5-5") =>
    call("agent.spawn", { prompt: "", description: "", subagentType: "devflow:test-writer", parentModel: "claude-opus-5-5", ...e }, async () => ({ model, agentId }));
  return { call, step, spawn, tick, live, clock, store, hooks };
}

test("spawn com Task 3 cria a linha, devolve o resultado intacto e abre o cronômetro", async () => {
  const H = await load();
  const res = await H.spawn({ description: "Implement Task 3: parser" });
  assert.deepEqual(res, { model: "claude-sonnet-5-5", agentId: "a1" });
  const row = H.store.monitorRows[0];
  assert.equal(row.label, "devflow:test-writer · Task 3");
  assert.equal(row.retries, 0);
  assert.equal(H.live().length, 1);
  assert.equal(H.live()[0].ms, 1000);
});

test("redespacho da mesma task do mesmo tipo vira Retentativas 1", async () => {
  const H = await load();
  await H.spawn({ description: "Implement Task 3: parser" }, "a1");
  await H.spawn({ description: "Implement Task 3: parser (fix)" }, "a2");
  assert.equal(H.store.monitorRows.find((r) => r.id === "a2").retries, 1);
  assert.equal(H.store.monitorRetries["devflow:test-writer::Task 3"], 2);
});

test("tool.call: erros somam no loop do subagente, sucesso zera, agentId sem linha é ignorado", async () => {
  const H = await load();
  await H.spawn({ description: "Task 1" });
  const err = async () => ({ isError: true, text: "falhou" });
  assert.deepEqual(await H.call("tool.call", { tool: "Bash", agentId: "a1" }, err), { isError: true, text: "falhou" });
  await H.call("tool.call", { tool: "Bash", agentId: "a1" }, err);
  assert.equal(H.store.monitorRows[0].streak, 2);
  await H.call("tool.call", { tool: "Bash", agentId: "a1" }, async () => ({ text: "ok" }));
  assert.equal(H.store.monitorRows[0].streak, 0);
  await H.call("tool.call", { tool: "Bash", agentId: "fork-interno" }, err);
  assert.equal(H.store.monitorRows.length, 1);
});

test("turn.start abre a sessão; turn.step anota modelo/esforço e repassa e intacto", async () => {
  const H = await load();
  await H.call("turn.start", { text: "oi", turnId: "t1" });
  const e = { turnId: "t1", index: 0, model: "claude-opus-5-5", effort: "high", messageCount: 1 };
  assert.deepEqual(await H.step(e), e);
  const main = H.store.monitorRows[0];
  assert.equal(main.id, "main");
  assert.equal(main.model, "claude-opus-5-5");
  assert.equal(main.effort, "high");
});

test("background: fim do turno da sessão fecha só a sessão; o subagente segue até a lista dizer completed", async () => {
  let status = "running";
  const H = await load({ list: async () => [{ id: "a1", status }] });
  await H.call("turn.start", { text: "x", turnId: "t1" });
  await H.spawn({ description: "Task 2" });
  await H.call("turn.complete", { text: "fim" }, async () => ({ usage: {} }));
  assert.deepEqual(H.store.monitorRows.map((r) => r.id), ["a1"]);
  await H.tick();
  assert.deepEqual(H.store.monitorRows.map((r) => r.id), ["a1"]);
  status = "completed";
  await H.tick();
  assert.deepEqual(H.store.monitorRows, []);
  assert.equal(H.live().length, 0);
});

test("agent.list rejeitando: linha órfã sai após 30 s sem evento", async () => {
  const H = await load({ list: async () => { throw new Error("indisponível"); } });
  await H.spawn({ description: "Task 4" });
  H.clock.now = 10_000;
  await H.tick();
  assert.equal(H.store.monitorRows.length, 1);
  H.clock.now = 30_001;
  await H.tick();
  assert.equal(H.store.monitorRows.length, 0);
});

test("recarga a quente: módulo novo com $.state povoado reabre o cronômetro e mantém contadores", async () => {
  const store = {};
  const H1 = await load({ store, list: async () => [{ id: "a1", status: "running" }] });
  await H1.spawn({ description: "Task 5" });
  const H2 = await load({ store, list: async () => [{ id: "a1", status: "running" }] });
  await H2.call("session.start", {}, async () => ({}));
  assert.equal(H2.live().length, 1);
  await H2.spawn({ description: "Task 5" }, "a2");
  assert.equal(store.monitorRows.find((r) => r.id === "a2").retries, 1);
});

test("$.state lançando: todo hook devolve o resultado de next com e intacto", async () => {
  const H = await load({ throwsState: true });
  assert.deepEqual(await H.spawn({ description: "Task 1" }), { model: "claude-sonnet-5-5", agentId: "a1" });
  const seen = [];
  await H.call("tool.call", { tool: "Bash", agentId: "a1" }, async (x) => { seen.push(x); return { text: "ok" }; });
  assert.deepEqual(seen, [{ tool: "Bash", agentId: "a1" }]);
  const e = { turnId: "t", index: 0, model: "m", effort: "low", messageCount: 1 };
  assert.deepEqual(await H.step(e), e);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/integration/test-router-monitor-mod.mjs`
Expected: FAIL — `Cannot find module .../hooks/router-monitor.mjs`

- [ ] **Step 3: Implementar o mínimo**

`hooks/router-monitor.mjs`:

```js
// Monitor ao vivo do roteamento de modelos (spec 2026-10-09-router-monitor-toolbar).
// Só observa: todo hook devolve o resultado de next(e) com e intacto; nunca lê arquivo nem grava ledger.
import * as mc from "../scripts/lib/monitor-core.mjs";

const ROWS = { plugin: "devflow", key: "monitorRows" };
const RETRIES = { plugin: "devflow", key: "monitorRetries" };
const TICK_MS = 1000;

let S = null; // cópia de trabalho; a verdade persistente fica em $.state (sobrevive a hot reload)
let hydrating = null;
let timer = null;

async function hydrate($) {
  if (S) return S;
  hydrating ??= (async () => {
    const [rows, retries] = await Promise.all([$.state.get(ROWS), $.state.get(RETRIES)]);
    S = { rows: Array.isArray(rows?.value) ? rows.value.map((r) => ({ ...r })) : [], retries: { ...(retries?.value ?? {}) } };
    return S;
  })();
  try { return await hydrating; } finally { hydrating = null; }
}

async function save($) {
  await $.state.set(ROWS, S.rows);
  await $.state.set(RETRIES, S.retries);
}

function startTick($) {
  if (timer || !S || !mc.isLive(S)) return;
  timer = $.clock.every(TICK_MS, () => { void onTick($); });
}

async function onTick($) {
  try {
    let list = null;
    try { list = await $.agent.list(); } catch { list = null; }
    mc.reap(S, { list, now: await $.clock.now() });
    await save($); // grava sempre: a escrita redesenha a faixa e anda o cronômetro
    if (!mc.isLive(S)) { timer?.cancel(); timer = null; }
  } catch {}
}

async function onSessionStart($, e, next) {
  const r = await next(e);
  try { await hydrate($); startTick($); } catch {}
  return r;
}

async function onTurnStart($, e, next) {
  try {
    await hydrate($);
    mc.openMain(S, { now: await $.clock.now() });
    await save($);
    startTick($);
  } catch {}
  return next(e);
}

async function onAgentSpawn($, e, next) {
  const res = await next(e);
  try {
    if (res && typeof res.agentId === "string") {
      await hydrate($);
      mc.onSpawned(S, { agentId: res.agentId, subagentType: e.subagentType, description: e.description, prompt: e.prompt, model: res.model, now: await $.clock.now() });
      await save($);
      startTick($);
    }
  } catch {}
  return res;
}

async function onToolCall($, e, next) {
  const res = await next(e);
  try {
    await hydrate($);
    if (mc.onTool(S, { loopId: e.agentId ?? "main", isError: !!res?.isError, now: await $.clock.now() })) await save($);
  } catch {}
  return res;
}

async function onTurnComplete($, e, next) {
  const res = await next(e);
  try {
    if (!e.agentId) {
      await hydrate($);
      if (mc.closeMain(S)) await save($);
    }
  } catch {}
  return res;
}

/** @type {import('claude-code').Register} */
export const register = (on) => {
  on("session.start", onSessionStart).catch(($, e, next) => next(e));
  on("turn.start", onTurnStart).catch(($, e, next) => next(e));
  on("agent.spawn", onAgentSpawn).catch(($, e, next) => next(e));
  on("tool.call", onToolCall).catch(($, e, next) => next(e));
  on("turn.complete", onTurnComplete).catch(($, e, next) => next(e));
  on("turn.step", async function* ($, e, next) {
    try {
      await hydrate($);
      if (mc.onStep(S, { loopId: e.agentId ?? "main", model: e.model, effort: e.effort, now: await $.clock.now() })) await save($);
    } catch {}
    return yield* next(e);
  });
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/integration/test-router-monitor-mod.mjs`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add hooks/router-monitor.mjs tests/integration/test-router-monitor-mod.mjs
git commit -m "feat(router-monitor): módulo observa spawn, ferramentas e passos com cronômetro" -- hooks/router-monitor.mjs tests/integration/test-router-monitor-mod.mjs
```

---

### Task 5: módulo do monitor — faixa `AbovePrompt`, registro no plugin e smoke do kit

**Agent:** feature-developer
**Tests:** integration (node com `$` falso + `claude plugin test .`)

**Files:**
- Modify: `hooks/router-monitor.mjs`
- Modify: `hooks/hooks.json` (linha `"modules"`)
- Create: `hooks/router-monitor.test.ts`
- Test: `tests/integration/test-router-monitor-mod.mjs` (acrescentar)

**Interfaces:**
- Consumes: `mc.view`, `mc.LABEL_COLS` (Task 2); valores `monitorRows` (Task 4) e `routing` (Task 3).
- Produces: hook `ui.render` com matcher `{ component: "AbovePrompt" }`.

- [ ] **Step 1: Escrever o teste falhando**

Acrescentar ao fim de `tests/integration/test-router-monitor-mod.mjs`:

```js
const render = (H, props = { hasSurvey: false }) =>
  H.call("ui.render", { component: "AbovePrompt", surface: "terminal", props }, async () => "ENGINE");

test("render: sem linha viva a faixa cede ao engine", async () => {
  const H = await load();
  assert.equal(await render(H), "ENGINE");
});

test("render: hasSurvey cede ao engine mesmo com linha viva", async () => {
  const H = await load();
  await H.spawn({ description: "Task 1" });
  assert.equal(await render(H, { hasSurvey: true }), "ENGINE");
});

test("render: linha com modelo publicado, origem, tempo, falhas e retentativas", async () => {
  const store = { routing: { active: true, failureStreak: 3, loops: { a2: { model: "claude-sonnet-5-5", effort: "medium", origin: "roteado" } } } };
  const H = await load({ store });
  await H.spawn({ description: "Implement Task 3: x" }, "a1");
  await H.spawn({ description: "Implement Task 3: x" }, "a2");
  H.clock.now = 72_000;
  const tree = await render(H);
  const lines = tree.children.map(textOf);
  const a2 = lines.find((l) => l.includes("Retentativas: 1"));
  assert.ok(a2.startsWith("devflow:test-writer · Task 3"));
  assert.ok(a2.includes("Modelo: sonnet-5-5·medium (roteado) | Tempo: 01:12 | Falhas: 0 | Retentativas: 1"));
  const a1 = lines.find((l) => l.includes("Retentativas: 0"));
  assert.ok(a1.includes("(teto)"));
  assert.equal(tree.tag, "Box");
  assert.equal(tree.props.flexDirection, "column");
  assert.equal(tree.children[0].props.wrap, "truncate-end");
});

test("render: sem valor routing a linha marca router off", async () => {
  const H = await load();
  await H.spawn({ description: "Task 1" });
  assert.ok(textOf(await render(H)).includes("(router off)"));
});

test("render: mais de 6 agentes mostra +N agentes", async () => {
  const H = await load();
  for (let i = 0; i < 8; i++) await H.spawn({ description: `Task ${i}` }, `a${i}`);
  const tree = await render(H);
  assert.equal(tree.children.length, 7);
  assert.equal(textOf(tree.children[6]), "+2 agentes");
});

test("render: $.state lançando cede ao engine", async () => {
  const H = await load({ throwsState: true });
  assert.equal(await render(H), "ENGINE");
});
```

Criar `hooks/router-monitor.test.ts`:

```ts
// hooks/router-monitor.test.ts — roda com `claude plugin test .`. Smoke: o módulo carrega no engine
// e um despacho com Task N vira linha em monitorRows. Comportamento fino: tests/integration/test-router-monitor-mod.mjs.
import { test, expect } from "claude-code/testing";

test("despacho com Task 3 vira linha do monitor", async ($, on) => {
  on("agent.spawn", async () => ({ model: "claude-haiku-5-5", agentId: "a1" }));
  on("agent.list", async () => ({ value: [{ id: "a1", description: "d", type: "devflow:test-writer", status: "running" }] }));
  await $.agent.spawn({ prompt: "x", description: "Implement Task 3: parser", subagentType: "devflow:test-writer" });
  const { value } = await $.state.get({ plugin: "devflow", key: "monitorRows" });
  expect(value?.some((r) => r.label === "devflow:test-writer · Task 3")).toBe(true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/integration/test-router-monitor-mod.mjs`
Expected: FAIL nos 6 testes novos — `Cannot destructure property 'h' of 'hooks[ev]' as it is undefined` (não há hook `ui.render`).

- [ ] **Step 3: Implementar o mínimo**

Em `hooks/router-monitor.mjs`:

1. Depois de `const RETRIES = …`: `const ROUTING = { plugin: "devflow", key: "routing" }; // publicado por hooks/router.mjs`

2. Antes de `/** @type {import('claude-code').Register} */`:

```js
// Desenho: lê de $.state (assina o redesenho); nunca escreve aqui. Usa h(...) global, sem JSX, para seguir importável no node.
async function onRender($, e, next) {
  if (e.props?.hasSurvey) return next(e);
  let rows, routing;
  try {
    [rows, routing] = await Promise.all([$.state.get(ROWS), $.state.get(ROUTING)]);
  } catch { return next(e); }
  const st = { rows: Array.isArray(rows?.value) ? rows.value : [], retries: {} };
  if (!mc.isLive(st)) return next(e);
  const v = mc.view(st, { routing: routing?.value, now: await $.clock.now() });
  const { Box, Text } = $.ui.resolve(e);
  const line = (r) => h(Text, { key: r.id, wrap: "truncate-end" },
    h(Text, { bold: true }, r.label.padEnd(mc.LABEL_COLS)),
    ` Modelo: ${r.model} `,
    h(Text, { color: r.originColor }, `(${r.origin})`),
    ` | Tempo: ${r.time} | `,
    h(Text, { color: r.streakColor }, `Falhas: ${r.streak}`),
    " | ",
    h(Text, { color: r.retriesColor }, `Retentativas: ${r.retries}`));
  return h(Box, { flexDirection: "column" },
    ...v.rows.map(line),
    v.more ? h(Text, { key: "more", dimColor: true }, `+${v.more} agentes`) : null);
}
```

3. No `register`, acrescentar:

```js
  on("ui.render", { component: "AbovePrompt" }, onRender).catch(($, e, next) => next(e));
```

Em `hooks/hooks.json`, trocar `"modules": ["./router.mjs"],` por `"modules": ["./router.mjs", "./router-monitor.mjs"],`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/integration/test-router-monitor-mod.mjs`
Expected: PASS (14 testes)

Run: `bash tests/run-integration.sh`
Expected: PASS, incluindo `claude plugin test .` com `router.test.ts` e `router-monitor.test.ts`. Se o kit não aceitar o stub de `agent.list` nesse formato, ajustar o stub ao que o tipo `OpValueOf['agent.list']` pede (`claude-code/testing`), sem mudar o módulo.

Run: `claude plugin validate .`
Expected: sem erro (o hook `ui.render` e as chaves `monitorRows`/`monitorRetries`/`routing` batem com `types/index.d.ts`).

- [ ] **Step 5: Commit**

```bash
git add hooks/router-monitor.mjs hooks/hooks.json hooks/router-monitor.test.ts tests/integration/test-router-monitor-mod.mjs
git commit -m "feat(router-monitor): faixa AbovePrompt por agente e registro do módulo" -- hooks/router-monitor.mjs hooks/hooks.json hooks/router-monitor.test.ts tests/integration/test-router-monitor-mod.mjs
```

---

### Task 6: e2e do contrato, documentação e CHANGELOG

**Agent:** test-writer (e2e) → documentation-writer (docs)
**Tests:** e2e

**Files:**
- Create: `tests/e2e/router-monitor-validate.e2e.test.mjs`
- Modify: `docs/model-routing.md` (nova seção antes de `## Medição` — ou, se não houver esse título, ao fim)
- Modify: `CHANGELOG.md` (seção `[Unreleased]`)

**Interfaces:**
- Consumes: tudo das Tasks 3–5.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Escrever o teste falhando**

`tests/e2e/router-monitor-validate.e2e.test.mjs`:

```js
// e2e: o plugin real passa no `claude plugin validate .` com o módulo do monitor e o contrato de $.state.
// Pulado com aviso quando o `claude` não está instalado (mesma regra do tests/run-integration.sh).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hasClaude = spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0;

test("hooks.json registra o módulo do monitor e o plugin.json aponta o contrato", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO, "hooks/hooks.json"), "utf8"));
  assert.deepEqual(hooks.modules, ["./router.mjs", "./router-monitor.mjs"]);
  const plugin = JSON.parse(fs.readFileSync(path.join(REPO, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal(plugin.types, "./types/index.d.ts");
  const types = fs.readFileSync(path.join(REPO, "types/index.d.ts"), "utf8");
  for (const k of ["routing", "monitorRows", "monitorRetries"]) assert.match(types, new RegExp(`\\b${k}:`));
});

test("claude plugin validate . passa", { skip: hasClaude ? false : "claude ausente — validate NÃO rodou" }, () => {
  const r = spawnSync("claude", ["plugin", "validate", "."], { cwd: REPO, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
```

- [ ] **Step 2: Rodar e confirmar o estado**

Run: `node --test tests/e2e/router-monitor-validate.e2e.test.mjs`
Expected: PASS se as Tasks 3–5 estão feitas. Para provar que o teste morde, trocar temporariamente em `hooks/hooks.json` a lista para `["./router.mjs"]`, rodar e ver FAIL no 1º teste (`deepEqual`); desfazer com `git checkout -- hooks/hooks.json` e rodar de novo (PASS).

- [ ] **Step 3: Documentar**

Em `docs/model-routing.md`, nova seção:

```markdown
## Monitor ao vivo

Com o plugin carregado como mod, uma faixa acima do prompt mostra uma linha por agente em execução (a sessão e cada subagente):

    devflow:test-writer · Task 3     Modelo: sonnet-5-5·medium (roteado) | Tempo: 01:12 | Falhas: 0 | Retentativas: 1

- **Modelo** e esforço aplicados. A origem diz de onde veio a escolha: `roteado` (o roteador escolheu um tier abaixo do teto), `teto` (o roteador não mexeu) ou `router off` (roteamento desligado: o modelo é o que o Claude Code escolheu).
- **Tempo:** desde o despacho (subagente) ou o início do turno (sessão).
- **Falhas:** falhas de ferramenta seguidas, a mesma contagem que dispara a escalada no meio; amarelo a partir de 1, vermelho ao chegar ao `failureStreak` (padrão 3).
- **Retentativas:** quantas vezes a mesma task foi redespachada para o mesmo tipo de agente. A task é reconhecida pelo `Task N` da descrição do despacho (subagent-driven-development) ou pela linha `Current story: S<n>` do prompt (autonomous-loop); sem isso, `—`.

A faixa aparece só enquanto há agente em execução, mostra até 6 linhas (`+N agentes` além disso) e nunca exibe o texto do prompt. O monitor só observa: não muda modelo, não lê arquivos do repositório e não grava ledger. Ele funciona com o roteamento desligado, para comparar o antes e o depois.
```

Em `CHANGELOG.md`, sob `## [Unreleased]` (criar `### Added` se não existir):

```markdown
- Monitor ao vivo do roteamento de modelos: faixa acima do prompt com modelo·esforço aplicados e origem (`roteado`/`teto`/`router off`), cronômetro, falhas de ferramenta seguidas e retentativas da mesma task, por agente em execução (`hooks/router-monitor.mjs`).
```

- [ ] **Step 4: Rodar os quatro sinais**

Run: `bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-e2e.sh && bash tests/run-lint.sh`
Expected: tudo PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/router-monitor-validate.e2e.test.mjs docs/model-routing.md CHANGELOG.md
git commit -m "test(router-monitor): e2e do contrato do plugin; docs e changelog do monitor ao vivo" -- tests/e2e/router-monitor-validate.e2e.test.mjs docs/model-routing.md CHANGELOG.md
```

---

## Verificação ao vivo (fase V, manual)

`claude -p` não desenha a faixa. Na fase V: sessão interativa `claude --plugin-dir .` com `models.enabled: true` e `DEVFLOW_MODEL_ROUTING=1`, uma rodada SDD curta com 2 subagentes e 1 redespacho forçado da mesma task; capturar a faixa mostrando `(roteado)`, `Falhas` subindo num erro forçado e `Retentativas: 1`. Repetir com `/devflow-route off` e conferir `(router off)`.
