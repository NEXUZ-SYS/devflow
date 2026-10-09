---
type: plan
name: router-monitor-toolbar
spec: docs/superpowers/specs/2026-10-09-router-monitor-toolbar-design.md
scale: MEDIUM
autonomy: supervised
created: "2026-10-09"
revised: "2026-10-09 — rev.2 (fase R): restrições do engine das sondas, revisão do architect, onboarding"
requiredSignals: [unit, integration, e2e, lint]
---

# Monitor do roteamento de modelos — Plano de implementação (rev.2)

> **DevFlow workflow:** router-monitor-toolbar | **Scale:** MEDIUM | **Phase:** R→E
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faixa ao vivo acima do prompt com uma linha por agente em execução (sessão e subagentes): `Modelo: m·esforço (origem) | Tempo | Falhas | Retentativas`, sempre ligada em todo projeto com o plugin, e onboarding que verifica que o mod carrega.

**Architecture:** Lógica pura em `scripts/lib/monitor-core.mjs`. A cola com o engine (tudo que usa `$`) mora numa seção "Monitor ao vivo" de `hooks/router.mjs`, porque o engine aceita um módulo por plugin, um hook por evento e só segue `$` até funções do mesmo arquivo (spec §3.1). O `register` compõe cada hook do monitor **por fora** do hook do router. O router publica o modelo/esforço aplicados em `$.state` (`devflow.routing`). O doctor ganha o check `router-monitor`, chamado pelo `project-init` e pelo `config`.

**Tech Stack:** ES modules `.mjs` sem dependências; API de mods do Claude Code (`on`, `$.state`, `$.clock`, `$.agent.list`, `$.ui.resolve`, `h` global); `node --test`; `claude plugin test` / `claude plugin validate`.

**Agents:** feature-developer (Tasks 1, 2, 6), backend-specialist (Tasks 3, 4, 5 — `hooks/router.mjs`, peça sensível à ADR-017; revisão mais cuidadosa na Task 4, que muda o `register`), documentation-writer (Task 7).

**Spec:** `docs/superpowers/specs/2026-10-09-router-monitor-toolbar-design.md` (rev.2)

**requiredSignals:** `[unit, integration, e2e, lint]`

## Global Constraints

- O monitor **só observa**: cada função `mon*` devolve o resultado de `next(...)` com `e` intacto; a lógica própria fica em `try`. Nunca nega, nunca reescreve.
- O monitor nunca lê arquivo do repositório, nunca grava ledger, nunca envia dado para fora; nunca exibe trecho de prompt nem de descrição livre (só tipo, id da task e papel).
- **Restrições do engine (não violar):** `hooks/hooks.json` segue com `modules: ["./router.mjs"]` (um módulo); cada evento é registrado uma vez; o hook passado a `on` é função literal ou nome de função; `$` só é passado a funções declaradas em `hooks/router.mjs` (nunca a função importada). Toda cola com `$` fica em `hooks/router.mjs`.
- `$.state` do plugin `devflow`: `routing` (escrito só pelo router), `monitorRows` e `monitorRetries` (escritos só pelo monitor). Refs com `plugin`/`key` literais. Valores JSON, nunca `undefined` (usar `null`).
- Limites: 50 linhas; 500 chaves de retentativa (sai a mais antiga); 100 loops publicados; id da task só nos primeiros 2048 caracteres do prompt; linha órfã sai após 30 000 ms sem evento quando `$.agent.list()` falha; linhas visíveis `min(6, maxRows − 1)` + `+N agentes`; rótulo cortado em 40 colunas.
- Formato da linha: `{rótulo} Modelo: {modelo sem "claude-"}·{esforço|-} ({roteado|teto|router off}) | Tempo: {mm:ss|h:mm:ss} | Falhas: {streak} | Retentativas: {n|—}`.
- Cores (ThemeKey): `Falhas` `warning` de 1 a `failureStreak − 1`, `error` a partir de `failureStreak` (padrão 3); `Retentativas ≥ 1` `warning`; origem `roteado` `success`, `teto` `subtle`, `router off` `inactive`. Sem cor, omitir a prop `color`.
- Id da task: `description` com `\bTask (\d+[a-z]?)\b` → `Task N`; senão prompt com `^\s*(?:[-*]\s+)?Current story:\s*(S\d+)\b` (multilinha) → `S2`; senão `null`. Papel: `Implement`/`Fix` → `implement`, `Review`/`Re-review` → `review` (início da description). Chave: `tipo::papel|-::id`.
- Um único `$.clock.every(1000)` por instância do módulo, aberto no `session.start`; tick sem linha viva não escreve; trava `inTick`.
- Idioma de código/comentários/commits: pt-BR. Commits sempre com pathspec explícito (há WIP do operador na árvore: `.context/plans/model-routing.md`, `.context/workflow/.checkpoint/last.json`, `.gitignore`, `docs/jev*`, `docs/test-writer.md`, spec session-start — nunca adicionar).
- Subagents de implementação: **proibido** `gh`, criar PR, merge, push. Só commit local na branch `feature/router-monitor-toolbar`.
- Testes nunca alteram arquivo versionado (provas de RED por teste escrito antes do código, nunca editando e revertendo arquivo do repo).

## Review Focus

1. Subagente em **background** que sobrevive ao fim do turno: a linha continua depois do `turn.complete` da sessão (Task 4).
2. **Recarga a quente** no meio da rodada: módulo novo com `$.state` povoado reabre o cronômetro no `session.start` sem zerar contadores (Task 4).
3. **`$.agent.list()` rejeitando**: linha órfã sai pelo critério de 30 s (Task 4).
4. **SDD real**: todos os papéis despachados como `general-purpose`; o reviewer não pode virar retentativa do implementer (Tasks 1 e 4).
5. **`/devflow-route off` e roteamento só de esforço**: `router off` ignora o publicado velho; esforço roteado conta como `roteado` (Tasks 2 e 3).

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/lib/monitor-core.mjs` | criar | estado + formatação, puro |
| `tests/lib/monitor-core.test.mjs` | criar | unit |
| `hooks/router.mjs` | modificar | publicar `devflow.routing` (Task 3); seção "Monitor ao vivo" + `register` composto (Tasks 4–5) |
| `tests/integration/test-router-mod.mjs` | modificar | `$.state` falso + testes da publicação |
| `tests/integration/test-router-monitor-mod.mjs` | criar | monitor via `hooks/router.mjs` real com `$` falso |
| `types/index.d.ts` | criar | contrato `PluginState.devflow` |
| `.claude-plugin/plugin.json` | modificar | `"types": "./types/index.d.ts"` |
| `tests/e2e/router-monitor-validate.e2e.test.mjs` | criar | contrato + `claude plugin validate .` |
| `hooks/router-monitor.test.ts` | criar | kit: faixa montada |
| `hooks/router.test.ts` | modificar | `mock.clock(on)` no `stubEnv` |
| `scripts/lib/doctor.mjs` | modificar | check `router-monitor` |
| `tests/lib/test-doctor-router-monitor.mjs` | criar | unit do check |
| `skills/project-init/SKILL.md`, `skills/config/SKILL.md`, `skills/doctor/SKILL.md` | modificar | onboarding |
| `docs/model-routing.md`, `CHANGELOG.md` | modificar | documentação |

---

### Task 1: monitor-core — estado das linhas, id da task, papel e retentativas

**Agent:** feature-developer
**Tests:** unit

**Files:**
- Create: `scripts/lib/monitor-core.mjs`
- Test: `tests/lib/monitor-core.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces (Tasks 2, 4, 5):
  - constantes `MAX_ROWS=50`, `MAX_KEYS=500`, `PROMPT_SCAN=2048`, `STALE_MS=30000`
  - `createMonitorState(): { rows: Row[], retries: Record<string, number> }`
  - `Row = { id: string, label: string, startedAt: number, lastEventAt: number, model: string|null, effort: string|null, streak: number, retries: number|null }`
  - `extractTaskId({ description?, prompt? }): string|null` · `extractRole(description): "implement"|"review"|null`
  - `onSpawned(state, { agentId, subagentType, description, prompt, model, now }): Row|null`
  - `openMain(state, { now }): void` · `closeMain(state): boolean`
  - `onTool(state, { loopId, isError, now }): boolean` · `onStep(state, { loopId, model, effort, now }): boolean`
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

test("extractTaskId: Current story no prompt, com e sem marcador de lista (autonomous-loop)", () => {
  assert.equal(mc.extractTaskId({ description: "story", prompt: "Contexto\n- Current story: S2 — login\n" }), "S2");
  assert.equal(mc.extractTaskId({ description: "story", prompt: "Current story: S7 — x" }), "S7");
});

test("extractTaskId: Task N só no corpo do prompt não conta; sem id → null", () => {
  assert.equal(mc.extractTaskId({ description: "investigar", prompt: "Implemente a Task 3 do plano" }), null);
  assert.equal(mc.extractTaskId({}), null);
  assert.equal(mc.extractTaskId({ description: 42, prompt: null }), null);
});

test("extractTaskId: story além de 2048 caracteres do prompt é ignorada", () => {
  const prompt = "x".repeat(mc.PROMPT_SCAN) + "\n- Current story: S9\n";
  assert.equal(mc.extractTaskId({ description: "d", prompt }), null);
});

test("extractRole: Implement/Fix → implement; Review/Re-review → review; resto → null", () => {
  assert.equal(mc.extractRole("Implement Task 3: x"), "implement");
  assert.equal(mc.extractRole("Fix Task 3 findings"), "implement");
  assert.equal(mc.extractRole("Review Task 3 (spec + quality)"), "review");
  assert.equal(mc.extractRole("Re-review Task 3 fix round 1"), "review");
  assert.equal(mc.extractRole("mapear o código"), null);
  assert.equal(mc.extractRole(undefined), null);
});

test("onSpawned: SDD real (tudo general-purpose) — reviewer não vira retentativa do implementer", () => {
  const st = mc.createMonitorState();
  const gp = (agentId, description, now) => mc.onSpawned(st, { agentId, subagentType: "general-purpose", description, prompt: "", model: "sonnet", now });
  const a = gp("a1", "Implement Task 3: parser", 1000);
  assert.deepEqual(a, { id: "a1", label: "general-purpose · Task 3 · implement", startedAt: 1000, lastEventAt: 1000, model: "sonnet", effort: null, streak: 0, retries: 0 });
  assert.equal(gp("a2", "Review Task 3 (spec + quality)", 2000).retries, 0);
  assert.equal(gp("a3", "Re-review Task 3 fix round 1", 3000).retries, 1);
  assert.equal(gp("a4", "Implement Task 3: parser", 4000).retries, 1);
  assert.equal(st.retries["general-purpose::review::Task 3"], 2);
});

test("onSpawned: story sem papel usa '-' na chave; sem id de task → retries null", () => {
  const st = mc.createMonitorState();
  const s = mc.onSpawned(st, { agentId: "a1", subagentType: "devflow:test-writer", description: "story", prompt: "- Current story: S2 — x", now: 1 });
  assert.equal(s.label, "devflow:test-writer · S2");
  assert.equal(st.retries["devflow:test-writer::-::S2"], 1);
  const r = mc.onSpawned(st, { agentId: "a2", subagentType: "Explore", description: "mapear", now: 1 });
  assert.equal(r.retries, null);
  assert.equal(r.label, "Explore");
  assert.equal(mc.onSpawned(st, { subagentType: "Explore", now: 1 }), null);
});

test("onSpawned: limite de 500 chaves descarta a mais antiga; 50 linhas preservam a sessão", () => {
  const st = mc.createMonitorState();
  mc.openMain(st, { now: 0 });
  for (let i = 0; i < mc.MAX_KEYS + 1; i++) mc.onSpawned(st, { agentId: `a${i}`, subagentType: "t", description: `Task ${i}`, now: i });
  assert.equal(Object.keys(st.retries).length, mc.MAX_KEYS);
  assert.equal(st.retries["t::-::Task 0"], undefined);
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
const STORY_RE = /^\s*(?:[-*]\s+)?Current story:\s*(S\d+)\b/m;
const IMPLEMENT_RE = /^\s*(?:Implement|Fix)\b/i;
const REVIEW_RE = /^\s*(?:Re-?review|Review)\b/i;

export function createMonitorState() {
  return { rows: [], retries: {} };
}

export function extractTaskId({ description, prompt } = {}) {
  const d = typeof description === "string" ? description.match(TASK_RE) : null;
  if (d) return `Task ${d[1]}`;
  const p = typeof prompt === "string" ? prompt.slice(0, PROMPT_SCAN).match(STORY_RE) : null;
  return p ? p[1] : null;
}

// O SDD despacha implementer e reviewer como general-purpose: o papel separa as chaves.
export function extractRole(description) {
  if (typeof description !== "string") return null;
  if (IMPLEMENT_RE.test(description)) return "implement";
  if (REVIEW_RE.test(description)) return "review";
  return null;
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
  const role = taskId ? extractRole(description) : null;
  const retries = taskId ? bumpRetry(state, `${type}::${role ?? "-"}::${taskId}`) : null;
  const label = taskId ? `${type} · ${taskId}${role ? ` · ${role}` : ""}` : type;
  const row = {
    id: agentId, label, startedAt: now, lastEventAt: now,
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
Expected: PASS (13 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/monitor-core.mjs tests/lib/monitor-core.test.mjs
git commit -m "feat(router-monitor): estado das linhas, id da task, papel e retentativas (lib pura)" -- scripts/lib/monitor-core.mjs tests/lib/monitor-core.test.mjs
```

---

### Task 2: monitor-core — formatação da faixa

**Agent:** feature-developer
**Tests:** unit

**Files:**
- Modify: `scripts/lib/monitor-core.mjs` (acrescentar ao fim)
- Test: `tests/lib/monitor-core.test.mjs` (acrescentar ao fim)

**Interfaces:**
- Consumes: Task 1.
- Produces (Task 5):
  - constantes `VISIBLE=6`, `LABEL_COLS=40`, `DEFAULT_FAILURE_STREAK=3`
  - `Routing = { active: boolean, failureStreak: number, loops: Record<string, { model: string|null, effort: string|null, origin: "roteado"|"teto" }> }`
  - `fmtDuration(ms)`, `shortModel(model)`, `originOf(routing|undefined, loopId)`, `visibleFor(maxRows): number`
  - `view(state, { routing, now, visible? }): { rows: ViewRow[], more: number }`
  - `ViewRow = { id, label, model, origin, originColor, time, streak, streakColor, retries, retriesColor }` (cores: ThemeKey ou `undefined`)
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

test("visibleFor: min(6, maxRows − 1); maxRows inválido → 6; nunca menos de 1", () => {
  assert.equal(mc.visibleFor(20), 6);
  assert.equal(mc.visibleFor(5), 4);
  assert.equal(mc.visibleFor(1), 1);
  assert.equal(mc.visibleFor(undefined), 6);
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
  assert.equal(mc.lineText(b), "devflow:test-writer · Task 3 · implement Modelo: sonnet-5-5·medium (roteado) | Tempo: 01:12 | Falhas: 0 | Retentativas: 0");
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

test("view: visible + more; rótulo cortado em 40 colunas com reticências", () => {
  const st = mc.createMonitorState();
  for (let i = 0; i < 9; i++) mc.onSpawned(st, { agentId: `a${i}`, subagentType: "devflow:um-tipo-de-agente-com-nome-enorme", now: i });
  const v = mc.view(st, { routing: undefined, now: 10 });
  assert.equal(v.rows.length, mc.VISIBLE);
  assert.equal(v.more, 3);
  assert.equal(v.rows[0].label.length, mc.LABEL_COLS);
  assert.ok(v.rows[0].label.endsWith("…"));
  assert.equal(mc.view(st, { routing: undefined, now: 10, visible: 2 }).more, 7);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/monitor-core.test.mjs`
Expected: FAIL — `mc.fmtDuration is not a function` (e as demais funções novas)

- [ ] **Step 3: Implementar o mínimo**

Acrescentar ao fim de `scripts/lib/monitor-core.mjs`:

```js
export const VISIBLE = 6;
export const LABEL_COLS = 40;
export const DEFAULT_FAILURE_STREAK = 3;
const ORIGIN_COLOR = { roteado: "success", teto: "subtle", "router off": "inactive" };

export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const p = (n) => String(n).padStart(2, "0");
  const mmss = `${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  return h ? `${h}:${mmss}` : mmss;
}

export function shortModel(model) {
  return typeof model === "string" && model ? model.replace(/^claude-/, "") : "?";
}

export function originOf(routing, loopId) {
  if (routing?.active !== true) return "router off";
  return routing.loops?.[loopId]?.origin === "roteado" ? "roteado" : "teto";
}

// Linhas que cabem na faixa: o prop maxRows da AbovePrompt menos a linha "+N agentes".
export function visibleFor(maxRows) {
  return Number.isInteger(maxRows) && maxRows > 0 ? Math.max(1, Math.min(VISIBLE, maxRows - 1)) : VISIBLE;
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
Expected: PASS (22 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/monitor-core.mjs tests/lib/monitor-core.test.mjs
git commit -m "feat(router-monitor): formatação da faixa (tempo, modelo, origem, cores, +N)" -- scripts/lib/monitor-core.mjs tests/lib/monitor-core.test.mjs
```

---

### Task 3: router publica a decisão aplicada em `devflow.routing` + contrato do `$.state`

**Agent:** backend-specialist (revisão focada: nada do que o router devolve muda; ADR-017)
**Tests:** integration + e2e

**Files:**
- Modify: `hooks/router.mjs`
- Create: `types/index.d.ts`
- Modify: `.claude-plugin/plugin.json`
- Test: `tests/integration/test-router-mod.mjs`
- Create: `tests/e2e/router-monitor-validate.e2e.test.mjs`

**Interfaces:**
- Consumes: `tierOf` não é necessário; nada novo de outras tasks.
- Produces (Tasks 4–5): valor `$.state` `{ plugin: "devflow", key: "routing" }` com a forma `Routing` (Task 2). `loops.main` = sessão; `loops[agentId]` = subagente roteado. Contrato `types/index.d.ts` com `routing`, `monitorRows`, `monitorRetries`.

- [ ] **Step 1: Escrever os testes falhando**

(a) `tests/e2e/router-monitor-validate.e2e.test.mjs`:

```js
// e2e: o plugin real declara o contrato de $.state e passa no `claude plugin validate .`.
// O validate é pulado com aviso quando o `claude` não está instalado (mesma regra do tests/run-integration.sh).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const hasClaude = spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0;

test("plugin.json aponta o contrato e ele declara as chaves do monitor; hooks.json segue com um módulo", () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(REPO, ".claude-plugin/plugin.json"), "utf8"));
  assert.equal(plugin.types, "./types/index.d.ts");
  const types = fs.readFileSync(path.join(REPO, "types/index.d.ts"), "utf8");
  for (const k of ["routing", "monitorRows", "monitorRetries"]) assert.match(types, new RegExp(`\\b${k}:`));
  assert.doesNotMatch(types, /export\s*\{\s*\}/); // o validate recusa export que não seja de tipo
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO, "hooks/hooks.json"), "utf8"));
  assert.deepEqual(hooks.modules, ["./router.mjs"]); // o engine aceita um módulo por plugin
});

test("claude plugin validate . passa", { skip: hasClaude ? false : "claude ausente — validate NÃO rodou" }, () => {
  const r = spawnSync("claude", ["plugin", "validate", "."], { cwd: REPO, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});
```

(b) Em `tests/integration/test-router-mod.mjs`, dentro de `load()`:
- assinatura: `async function load({ root, env = ON, statOverride, complete, stateThrows = false } = {})`
- logo no início do corpo: `const flags = { stateThrows };`
- `const log = { reads: [], writes: [], completes: [], status: [], state: {} };`
- acrescentar ao objeto `$`, depois de `ui: …,`:

```js
    state: {
      get: async (r) => ({ value: log.state[r.key], version: 0 }),
      set: async (r, v) => { if (flags.stateThrows) throw new Error("state off"); log.state[r.key] = JSON.parse(JSON.stringify(v)); return { isSet: true, version: 1 }; },
    },
```
- no `return` de `load`, acrescentar `flags`: `return { call, step, spawn, turn, log, $, flags };`

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

test("monitor: tipo não roteável não publica loop (o monitor mostra teto)", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  await H.spawn({ subagentType: "Explore", parentModel: OPUS });
  assert.equal(H.log.state.routing.active, true);
  assert.equal(H.log.state.routing.loops.a1, undefined);
});

test("monitor: só o esforço roteado na sessão já conta como roteado", async () => {
  const H = await load({ root: mkRepo() });
  const first = await H.turn(); // fase E, sem ID de sonnet aprendido: só o esforço muda
  assert.equal(first.effort, "medium");
  const main = H.log.state.routing.loops.main;
  assert.equal(main.model, OPUS);
  assert.equal(main.effort, "medium");
  assert.equal(main.origin, "roteado");
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

test("monitor: $.state.set lançando não muda o que o router devolve, e a publicação é tentada de novo", async () => {
  const H = await load({ root: mkRepo(), stateThrows: true });
  await H.turn();
  const seen = await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS });
  assert.equal(seen.model, "haiku");
  assert.equal(H.log.state.routing, undefined);
  H.flags.stateThrows = false;
  await H.call("command.run", { command: "devflow-route", args: "status" });
  assert.equal(H.log.state.routing.active, true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/e2e/router-monitor-validate.e2e.test.mjs tests/integration/test-router-mod.mjs`
Expected: FAIL — o e2e (`plugin.types` é `undefined`) e os testes novos de integração (`Cannot read properties of undefined (reading 'active')` / `'loops'`). Os testes antigos passam.

- [ ] **Step 3: Implementar o mínimo**

Em `hooks/router.mjs`:

1. Depois de `const MAX_LEDGER_LINES = 2000;` (linha 11):

```js
const ROUTING = { plugin: "devflow", key: "routing" }; // lido pelo monitor ao vivo (seção abaixo)
const MAX_PUB_LOOPS = 100;
```

2. No objeto `S` (linhas 12–25), acrescentar antes de `sessionKey`: `pub: {},` e `pubLast: "",`.

3. Depois de `const active = …` (linha 27):

```js
function pubLoop(id, entry) {
  if (JSON.stringify(S.pub[id]) === JSON.stringify(entry)) return;
  delete S.pub[id];
  S.pub[id] = entry;
  const ks = Object.keys(S.pub);
  for (let i = 0; i < ks.length - MAX_PUB_LOOPS; i++) delete S.pub[ks[i]];
}

// Monitor (spec 2026-10-09-router-monitor-toolbar §3.4): só publica; nunca muda o que o router decide.
async function publish($) {
  try {
    const value = { active: active(), failureStreak: S.config.midRun?.failureStreak ?? 3, loops: S.pub };
    const json = JSON.stringify(value);
    if (json === S.pubLast) return;
    await $.state.set(ROUTING, value);
    S.pubLast = json; // só depois do set: falha é tentada de novo na próxima publicação
  } catch {}
}
```

4. Ao fim de `ensure($)`, depois de `if (S.config.enabled) await detectOtherRouter($);`: `await publish($);`

5. Em `onCommand`, logo antes de `const c = S.core;`: `await publish($);`

6. Em `onAgentSpawn`, dentro de `if (res && "agentId" in res) { … }`, depois da linha do `ledger(...)`:

```js
    if (route) {
      const effortRouted = S.core.userEffort != null && route.effort != null && route.effort !== S.core.userEffort;
      pubLoop(res.agentId, { model: res.model ?? null, effort: route.effort ?? null, origin: route.tier !== route.ceiling || effortRouted ? "roteado" : "teto" });
      await publish($);
    }
```

7. No hook `turn.step` (linhas 187–206), dentro do `if (active()) { … }`, depois do bloco `if (e.agentId) … else { … }` (ainda dentro do `if (active())`):

```js
        if (e.agentId && patch && S.pub[e.agentId]) {
          const cur = S.pub[e.agentId];
          pubLoop(e.agentId, { ...cur, model: patch.model ?? cur.model, effort: patch.effort ?? cur.effort });
        } else if (!e.agentId) {
          pubLoop("main", { model: patch?.model ?? e.model ?? null, effort: patch?.effort ?? e.effort ?? null, origin: patch?.model || patch?.effort ? "roteado" : "teto" });
        }
        await publish($);
```

Criar `types/index.d.ts`:

```ts
// Contrato do $.state do plugin devflow (o claude plugin validate confere as chaves usadas no módulo).
// Só exports de tipo: o validate recusa qualquer outro export.
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

Run: `node --test tests/e2e/router-monitor-validate.e2e.test.mjs tests/integration/test-router-mod.mjs tests/lib/router-core.test.mjs`
Expected: PASS (com `claude` instalado o validate roda; sem ele, aparece como SKIP com o aviso).

Run: `claude plugin test .` (se `claude` existir)
Expected: os 5 testes de `hooks/router.test.ts` seguem passando.

- [ ] **Step 5: Commit**

```bash
git add hooks/router.mjs types/index.d.ts .claude-plugin/plugin.json tests/integration/test-router-mod.mjs tests/e2e/router-monitor-validate.e2e.test.mjs
git commit -m "feat(router-monitor): router publica modelo/esforço aplicados e origem em \$.state; contrato do plugin" -- hooks/router.mjs types/index.d.ts .claude-plugin/plugin.json tests/integration/test-router-mod.mjs tests/e2e/router-monitor-validate.e2e.test.mjs
```

---

### Task 4: monitor no `router.mjs` — eventos, composição e cronômetro

**Agent:** backend-specialist (revisão mais cuidadosa: muda o `register` do router)
**Tests:** integration

**Files:**
- Modify: `hooks/router.mjs`
- Test: `tests/integration/test-router-monitor-mod.mjs`

**Interfaces:**
- Consumes: Task 1 inteira (`import * as mc from "../scripts/lib/monitor-core.mjs"`); `publish`/`ROUTING` (Task 3).
- Produces (Task 5): objeto de módulo `M = { st, hydrating, timer, inTick }`, refs `ROWS`/`RETRIES`, funções `monHydrate($)`, `monTick($)`, `monSessionStart`, `monTurnStart`, `monAgentSpawn`, `monToolCall`, `monTurnComplete`, `monTurnStep` (gerador), e o hook do router extraído para `async function* routerTurnStep($, e, next)`.

- [ ] **Step 1: Escrever o teste falhando**

`tests/integration/test-router-monitor-mod.mjs`:

```js
// Testa o monitor ao vivo dentro de hooks/router.mjs de verdade: register(on) coleta os hooks; `$` falso
// com $.state, relógio controlável e $.agent.list configurável. Sem DEVFLOW_MODEL_ROUTING o router fica
// desligado (o monitor tem que funcionar mesmo assim). O kit (hooks/router-monitor.test.ts) cobre o engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let n = 0;

globalThis.h = (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) });
const textOf = (node) => (node === null || node === undefined ? "" : typeof node === "string" || typeof node === "number" ? String(node) : node.children.map(textOf).join(""));

async function load({ store = {}, list = async () => [], throwsState = false } = {}) {
  const mod = await import(pathToFileURL(path.join(REPO, "hooks/router.mjs")).href + `?t=${n++}`);
  const hooks = {};
  const on = (ev, a, b) => { hooks[ev] = { h: b ?? a, c: null }; return { catch(c) { hooks[ev].c = c; return this; } }; };
  mod.register(on);
  const clock = { now: 0, timers: [] };
  const writes = [];
  const fail = async () => { throw new Error("ENOENT"); };
  const $ = {
    plugin: { root: REPO },
    env: { get: async () => undefined },
    session: { cwd: async () => null },
    settings: { read: async () => ({ enabledPlugins: {} }) },
    command: { register: async () => ({}) },
    fs: { stat: fail, read: fail, write: async () => {} },
    model: { complete: async () => ({ isAnswered: false, reason: "empty-reply" }) },
    state: {
      get: async (r) => { if (throwsState) throw new Error("x"); return { value: store[r.key], version: 0 }; },
      set: async (r, v) => { if (throwsState) throw new Error("x"); store[r.key] = JSON.parse(JSON.stringify(v)); writes.push(r.key); return { isSet: true, version: 1 }; },
    },
    clock: {
      now: async () => clock.now,
      every: (ms, fn) => { const t = { ms, fn, cancelled: false, cancel() { t.cancelled = true; } }; clock.timers.push(t); return t; },
    },
    agent: { list },
    ui: { resolve: () => ({ Box: "Box", Text: "Text" }), status: () => {}, toast: () => {} },
  };
  const call = async (ev, e, nextImpl = async (x) => x) => {
    const { h, c } = hooks[ev];
    let called = false, settled;
    const next = async (x) => { called = true; settled = await nextImpl(x); return settled; };
    try { return await h($, e, next); } catch (err) { return c ? c($, e, async (x) => (called ? settled : next(x))) : { skipped: String(err) }; }
  };
  const step = async (e) => {
    let sent;
    const gen = hooks["turn.step"].h($, e, async function* (x) { sent = x; return { ok: true }; });
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    return sent;
  };
  const live = () => clock.timers.filter((t) => !t.cancelled);
  const tick = async () => { for (const t of live()) t.fn(); await new Promise((r) => setTimeout(r, 0)); };
  const start = () => call("session.start", {}, async () => ({}));
  const spawn = (e, agentId = "a1", model = "claude-sonnet-5-5") =>
    call("agent.spawn", { prompt: "", description: "", subagentType: "general-purpose", parentModel: "claude-opus-5-5", fork: false, ...e }, async () => ({ model, agentId }));
  return { call, step, spawn, tick, live, start, clock, store, writes, hooks };
}

test("session.start abre um único cronômetro de 1 s, também num segundo session.start", async () => {
  const H = await load();
  await H.start();
  await H.start();
  assert.equal(H.live().length, 1);
  assert.equal(H.live()[0].ms, 1000);
});

test("SDD real: resultado do spawn intacto; reviewer e implementer contam separados", async () => {
  const H = await load();
  await H.start();
  const res = await H.spawn({ description: "Implement Task 3: parser" }, "a1");
  assert.deepEqual(res, { model: "claude-sonnet-5-5", agentId: "a1" });
  await H.spawn({ description: "Review Task 3 (spec + quality)" }, "a2");
  await H.spawn({ description: "Re-review Task 3 fix round 1" }, "a3");
  await H.spawn({ description: "Implement Task 3: parser" }, "a4");
  const by = Object.fromEntries(H.store.monitorRows.map((r) => [r.id, r]));
  assert.equal(by.a1.label, "general-purpose · Task 3 · implement");
  assert.deepEqual([by.a1.retries, by.a2.retries, by.a3.retries, by.a4.retries], [0, 0, 1, 1]);
  assert.equal(H.store.monitorRetries["general-purpose::review::Task 3"], 2);
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

test("turn.start abre a sessão; turn.step anota modelo/esforço e repassa e intacto (router desligado)", async () => {
  const H = await load();
  await H.call("turn.start", { text: "oi", turnId: "t1" });
  const e = { turnId: "t1", index: 0, model: "claude-opus-5-5", effort: "high", messageCount: 1 };
  assert.deepEqual(await H.step(e), e);
  const main = H.store.monitorRows[0];
  assert.equal(main.id, "main");
  assert.equal(main.model, "claude-opus-5-5");
  assert.equal(main.effort, "high");
  assert.equal(H.store.routing.active, false);
});

test("background: fim do turno fecha só a sessão; o subagente segue até a lista dizer completed", async () => {
  let status = "running";
  const H = await load({ list: async () => [{ id: "a1", status }] });
  await H.start();
  await H.call("turn.start", { text: "x", turnId: "t1" });
  await H.spawn({ description: "Task 2" });
  await H.call("turn.complete", { text: "fim" }, async () => ({ usage: {} }));
  assert.deepEqual(H.store.monitorRows.map((r) => r.id), ["a1"]);
  await H.tick();
  assert.deepEqual(H.store.monitorRows.map((r) => r.id), ["a1"]);
  status = "completed";
  await H.tick();
  assert.deepEqual(H.store.monitorRows, []);
});

test("agent.list rejeitando: linha órfã sai após 30 s sem evento", async () => {
  const H = await load({ list: async () => { throw new Error("indisponível"); } });
  await H.start();
  await H.spawn({ description: "Task 4" });
  H.clock.now = 10_000;
  await H.tick();
  assert.equal(H.store.monitorRows.length, 1);
  H.clock.now = 30_001;
  await H.tick();
  assert.equal(H.store.monitorRows.length, 0);
});

test("tick sem linha viva não escreve nada", async () => {
  const H = await load();
  await H.start();
  const before = H.writes.length;
  await H.tick();
  await H.tick();
  assert.equal(H.writes.length, before);
});

test("recarga a quente: módulo novo com $.state povoado reabre o cronômetro e mantém contadores", async () => {
  const store = {};
  const H1 = await load({ store, list: async () => [{ id: "a1", status: "running" }] });
  await H1.start();
  await H1.spawn({ description: "Implement Task 5: x" });
  const H2 = await load({ store, list: async () => [{ id: "a1", status: "running" }] });
  await H2.start();
  assert.equal(H2.live().length, 1);
  await H2.spawn({ description: "Implement Task 5: x" }, "a2");
  assert.equal(store.monitorRows.find((r) => r.id === "a2").retries, 1);
  assert.ok(store.monitorRows.some((r) => r.id === "a1"));
});

test("$.state lançando: todo hook devolve o resultado de next com e intacto", async () => {
  const H = await load({ throwsState: true });
  assert.deepEqual(await H.start(), {});
  assert.deepEqual(await H.spawn({ description: "Task 1" }), { model: "claude-sonnet-5-5", agentId: "a1" });
  const seen = [];
  await H.call("tool.call", { tool: "Bash", agentId: "a1" }, async (x) => { seen.push(x); return { text: "ok" }; });
  assert.deepEqual(seen, [{ tool: "Bash", agentId: "a1" }]);
  const e = { turnId: "t", index: 0, model: "m", effort: "low", messageCount: 1 };
  assert.deepEqual(await H.step(e), e);
  assert.deepEqual(await H.call("turn.start", { text: "x", turnId: "t" }, async () => "SEGUIU"), "SEGUIU");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/integration/test-router-monitor-mod.mjs`
Expected: FAIL — sem cronômetro (`live().length` 0) e sem `monitorRows` (`Cannot read properties of undefined`).

- [ ] **Step 3: Implementar o mínimo**

Em `hooks/router.mjs`:

1. Acrescentar aos imports (depois da linha 8): `import * as mc from "../scripts/lib/monitor-core.mjs";`

2. Extrair o gerador inline do `turn.step` (linhas 187–206, já com o acréscimo da Task 3) para uma função nomeada, declarada antes do `register`, com o **mesmo corpo**:

```js
async function* routerTurnStep($, e, next) {
  let patch = null;
  try {
    // … corpo atual inalterado, incluindo o bloco de publicação da Task 3 …
  } catch { patch = null; }
  const rw = {};
  if (patch?.model) rw.model = patch.model;
  if (patch?.effort) rw.effort = patch.effort;
  return yield* next(Object.keys(rw).length ? { ...e, ...rw } : e);
}
```

3. Antes de `/** @type {import('claude-code').Register} */`, acrescentar a seção do monitor:

```js
// ─── Monitor ao vivo (spec 2026-10-09-router-monitor-toolbar, M5/M9) ─────────────────────────────
// Só observa: cada mon* devolve o resultado de next com e intacto; a lógica própria fica em try.
// Mora neste arquivo porque o engine só segue `$` até funções declaradas no arquivo dos on(...).
const ROWS = { plugin: "devflow", key: "monitorRows" };
const RETRIES = { plugin: "devflow", key: "monitorRetries" };
const TICK_MS = 1000;
const M = { st: null, hydrating: null, timer: null, inTick: false };

async function monLoad($) {
  const [rows, retries] = await Promise.all([$.state.get(ROWS), $.state.get(RETRIES)]);
  return { rows: Array.isArray(rows?.value) ? rows.value.map((r) => ({ ...r })) : [], retries: { ...(retries?.value ?? {}) } };
}

// Cópia de trabalho única: hooks concorrentes esperam a mesma leitura (nenhum sobrescreve o outro).
async function monHydrate($) {
  if (M.st) return M.st;
  if (!M.hydrating) M.hydrating = monLoad($).finally(() => { M.hydrating = null; });
  M.st = await M.hydrating;
  return M.st;
}

async function monTick($) {
  if (M.inTick || !M.st || !mc.isLive(M.st)) return; // sem linha viva: nada a escrever
  M.inTick = true;
  try {
    let list = null;
    try { list = await $.agent.list(); } catch { list = null; }
    mc.reap(M.st, { list, now: await $.clock.now() });
    await $.state.set(ROWS, M.st.rows); // grava sempre: a escrita redesenha a faixa e anda o cronômetro
  } catch {} finally { M.inTick = false; }
}

async function monSessionStart($, e, next) {
  const r = await next(e);
  try {
    await monHydrate($);
    if (!M.timer) M.timer = $.clock.every(TICK_MS, () => { void monTick($); });
  } catch {}
  return r;
}

async function monTurnStart($, e, next) {
  try {
    await monHydrate($);
    mc.openMain(M.st, { now: await $.clock.now() });
    await $.state.set(ROWS, M.st.rows);
  } catch {}
  return next(e);
}

async function monAgentSpawn($, e, next) {
  const res = await next(e);
  try {
    if (res && typeof res.agentId === "string") {
      await monHydrate($);
      mc.onSpawned(M.st, { agentId: res.agentId, subagentType: e.subagentType, description: e.description, prompt: e.prompt, model: res.model, now: await $.clock.now() });
      await $.state.set(ROWS, M.st.rows);
      await $.state.set(RETRIES, M.st.retries);
    }
  } catch {}
  return res;
}

async function monToolCall($, e, next) {
  const res = await next(e);
  try {
    await monHydrate($);
    if (mc.onTool(M.st, { loopId: e.agentId ?? "main", isError: !!res?.isError, now: await $.clock.now() })) await $.state.set(ROWS, M.st.rows);
  } catch {}
  return res;
}

async function monTurnComplete($, e, next) {
  const res = await next(e);
  try {
    if (!e.agentId) {
      await monHydrate($);
      if (mc.closeMain(M.st)) await $.state.set(ROWS, M.st.rows);
    }
  } catch {}
  return res;
}

async function* monTurnStep($, e, next) {
  try {
    await monHydrate($);
    if (mc.onStep(M.st, { loopId: e.agentId ?? "main", model: e.model, effort: e.effort, now: await $.clock.now() })) await $.state.set(ROWS, M.st.rows);
  } catch {}
  return yield* next(e);
}
```

4. Substituir o `register` inteiro por (o monitor envolve o router por fora; hooks literais):

```js
/** @type {import('claude-code').Register} */
export const register = (on) => {
  on("session.start", ($, e, next) => monSessionStart($, e, (x) => onSessionStart($, x, next))).catch(($, e, next) => next(e));
  on("command.run", onCommand).catch(($, e, next) => next(e));
  on("turn.start", ($, e, next) => monTurnStart($, e, (x) => onTurnStart($, x, next))).catch(($, e, next) => next(e));
  on("agent.spawn", ($, e, next) => monAgentSpawn($, e, (x) => onAgentSpawn($, x, next))).catch(($, e, next) => next(e));
  on("tool.call", ($, e, next) => monToolCall($, e, (x) => onToolCall($, x, next))).catch(($, e, next) => next(e));
  on("turn.complete", ($, e, next) => monTurnComplete($, e, (x) => onTurnComplete($, x, next))).catch(($, e, next) => next(e));
  on("turn.step", async function* ($, e, next) { return yield* monTurnStep($, e, (x) => routerTurnStep($, x, next)); });
};
```

5. Atualizar o comentário do topo (linhas 1–3) acrescentando: `// Também hospeda o monitor ao vivo (seção "Monitor ao vivo"): o engine aceita um módulo por plugin.`

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/integration/test-router-monitor-mod.mjs tests/integration/test-router-mod.mjs`
Expected: PASS (9 novos + todos os do router).

Run: `claude plugin validate .` e `claude plugin test .` (se `claude` existir)
Expected: validate sem erro; os testes de `hooks/router.test.ts` passam.

- [ ] **Step 5: Commit**

```bash
git add hooks/router.mjs tests/integration/test-router-monitor-mod.mjs
git commit -m "feat(router-monitor): monitor ao vivo envolve os hooks do router (spawn, ferramentas, passos, cronômetro)" -- hooks/router.mjs tests/integration/test-router-monitor-mod.mjs
```

---

### Task 5: faixa `AbovePrompt` e testes do kit

**Agent:** backend-specialist
**Tests:** integration (node com `$` falso + `claude plugin test .`)

**Files:**
- Modify: `hooks/router.mjs`
- Create: `hooks/router-monitor.test.ts`
- Modify: `hooks/router.test.ts`
- Test: `tests/integration/test-router-monitor-mod.mjs` (acrescentar)

**Interfaces:**
- Consumes: `mc.view`, `mc.visibleFor`, `mc.LABEL_COLS` (Task 2); `ROWS`, `ROUTING` (Tasks 3–4).
- Produces: hook `ui.render` com matcher `{ component: "AbovePrompt" }`.

- [ ] **Step 1: Escrever o teste falhando**

Acrescentar ao fim de `tests/integration/test-router-monitor-mod.mjs`:

```js
const render = (H, props = { hasSurvey: false, maxRows: 20 }) =>
  H.call("ui.render", { component: "AbovePrompt", surface: "terminal", props }, async () => "ENGINE");

test("render: sem linha viva a faixa cede ao engine", async () => {
  const H = await load();
  assert.equal(await render(H), "ENGINE");
});

test("render: hasSurvey cede ao engine mesmo com linha viva", async () => {
  const H = await load();
  await H.spawn({ description: "Task 1" });
  assert.equal(await render(H, { hasSurvey: true, maxRows: 20 }), "ENGINE");
});

test("render: linha com modelo publicado, origem, tempo, falhas e retentativas; cor ausente omitida", async () => {
  const H = await load();
  await H.spawn({ description: "Implement Task 3: x" }, "a1");
  await H.spawn({ description: "Implement Task 3: x" }, "a2");
  H.store.routing = { active: true, failureStreak: 3, loops: { a2: { model: "claude-sonnet-5-5", effort: "medium", origin: "roteado" } } };
  H.clock.now = 72_000;
  const tree = await render(H);
  assert.equal(tree.tag, "Box");
  assert.equal(tree.props.flexDirection, "column");
  const lines = tree.children.map(textOf);
  const a2 = lines.find((l) => l.includes("Retentativas: 1"));
  assert.ok(a2.startsWith("general-purpose · Task 3 · implement"));
  assert.ok(a2.includes("Modelo: sonnet-5-5·medium (roteado) | Tempo: 01:12 | Falhas: 0 | Retentativas: 1"));
  assert.ok(lines.find((l) => l.includes("Retentativas: 0")).includes("(teto)"));
  const first = tree.children[0];
  assert.equal(first.props.wrap, "truncate-end");
  const falhas = first.children.find((c) => typeof c === "object" && textOf(c).startsWith("Falhas"));
  assert.equal("color" in falhas.props, false);
});

test("render: router desligado marca router off", async () => {
  const H = await load();
  await H.spawn({ description: "Task 1" });
  assert.ok(textOf(await render(H)).includes("(router off)"));
});

test("render: maxRows limita as linhas e mostra +N agentes", async () => {
  const H = await load();
  for (let i = 0; i < 8; i++) await H.spawn({ description: `Task ${i}` }, `a${i}`);
  const tree = await render(H, { hasSurvey: false, maxRows: 5 });
  assert.equal(tree.children.length, 5);
  assert.equal(textOf(tree.children[4]), "+4 agentes");
});

test("render: $.state lançando cede ao engine", async () => {
  const H = await load({ throwsState: true });
  assert.equal(await render(H), "ENGINE");
});
```

Criar `hooks/router-monitor.test.ts`:

```ts
// hooks/router-monitor.test.ts — roda com `claude plugin test .`. Prova no engine que a faixa do monitor
// desenha a linha de um despacho (terminal e desktop). Comportamento fino: tests/integration/test-router-monitor-mod.mjs.
// No kit: `mock.clock` é obrigatório para $.clock.every; Text não guarda `key` (buscar por texto).
import { test, expect, mock } from "claude-code/testing";

const BAND = { plugin: "devflow", component: "AbovePrompt", props: { hasSurvey: false, maxRows: 20 } } as const;

test("despacho do SDD aparece na faixa com tipo, task e papel", async ($, on) => {
  mock.clock(on);
  on("agent.spawn", async () => ({ model: "claude-haiku-5-5", agentId: "a1" }));
  await $.agent.spawn({ prompt: "x", description: "Implement Task 3: parser", subagentType: "general-purpose" });
  for (const surface of ["terminal", "desktop"] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as any);
    expect(await ui.find({ text: /general-purpose · Task 3 · implement/ })).toBeDefined();
    expect(await ui.find({ text: /Retentativas: 0/ })).toBeDefined();
  }
});
```

Em `hooks/router.test.ts`:
- trocar `import { test, expect } from "claude-code/testing";` por `import { test, expect, mock } from "claude-code/testing";`
- primeira linha do corpo de `stubEnv`: `mock.clock(on); // o monitor abre $.clock.every no session.start`

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/integration/test-router-monitor-mod.mjs`
Expected: FAIL nos 6 testes novos — `Cannot destructure property 'h' of 'hooks[ev]' as it is undefined` (não há hook `ui.render`).

- [ ] **Step 3: Implementar o mínimo**

Em `hooks/router.mjs`, na seção "Monitor ao vivo", depois de `monTurnStep`:

```js
// Desenho: lê de $.state (assina o redesenho), nunca escreve aqui. h(...) global, sem JSX, para seguir
// importável no node. Sem cor, a prop `color` fica de fora.
async function monRender($, e, next) {
  if (e.props?.hasSurvey) return next(e);
  let rows, routing;
  try {
    [rows, routing] = await Promise.all([$.state.get(ROWS), $.state.get(ROUTING)]);
  } catch { return next(e); }
  const st = { rows: Array.isArray(rows?.value) ? rows.value : [], retries: {} };
  if (!mc.isLive(st)) return next(e);
  const v = mc.view(st, { routing: routing?.value, now: await $.clock.now(), visible: mc.visibleFor(e.props?.maxRows) });
  const { Box, Text } = $.ui.resolve(e);
  const tint = (color) => (color ? { color } : {});
  const line = (r) => h(Text, { wrap: "truncate-end" },
    h(Text, { bold: true }, r.label.padEnd(mc.LABEL_COLS)),
    ` Modelo: ${r.model} `,
    h(Text, tint(r.originColor), `(${r.origin})`),
    ` | Tempo: ${r.time} | `,
    h(Text, tint(r.streakColor), `Falhas: ${r.streak}`),
    " | ",
    h(Text, tint(r.retriesColor), `Retentativas: ${r.retries}`));
  return h(Box, { flexDirection: "column" },
    ...v.rows.map(line),
    v.more ? h(Text, { dimColor: true }, `+${v.more} agentes`) : null);
}
```

No `register`, acrescentar como última linha:

```js
  on("ui.render", { component: "AbovePrompt" }, monRender).catch(($, e, next) => next(e));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/integration/test-router-monitor-mod.mjs`
Expected: PASS (15 testes)

Run: `bash tests/run-integration.sh`
Expected: PASS, incluindo `claude plugin test .` com `router.test.ts` (5) e `router-monitor.test.ts` (1).

Run: `claude plugin validate .`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add hooks/router.mjs hooks/router-monitor.test.ts hooks/router.test.ts tests/integration/test-router-monitor-mod.mjs
git commit -m "feat(router-monitor): faixa AbovePrompt por agente e testes do kit" -- hooks/router.mjs hooks/router-monitor.test.ts hooks/router.test.ts tests/integration/test-router-monitor-mod.mjs
```

---

### Task 6: onboarding — check `router-monitor` no doctor, init e config

**Agent:** feature-developer
**Tests:** unit

**Files:**
- Modify: `scripts/lib/doctor.mjs`
- Create: `tests/lib/test-doctor-router-monitor.mjs`
- Modify: `skills/project-init/SKILL.md` (novo Step 0.8, depois do Step 0.7)
- Modify: `skills/config/SKILL.md` (seção `### 4. Confirmar e informar`)
- Modify: `skills/doctor/SKILL.md` (lista de checks, se houver)

**Interfaces:**
- Consumes: `claudeVersionOf(ctx)` e `belowMin(version)` já existentes em `scripts/lib/doctor.mjs`.
- Produces: check `{ id: "router-monitor" }` em `CHECKS`; rodável por `node scripts/doctor.mjs --check router-monitor`.

- [ ] **Step 1: Escrever o teste falhando**

`tests/lib/test-doctor-router-monitor.mjs`:

```js
// tests/lib/test-doctor-router-monitor.mjs — o monitor é sempre ligado; o onboarding só verifica que o mod carrega.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECKS } from "../../scripts/lib/doctor.mjs";

const check = CHECKS.find((c) => c.id === "router-monitor");
const cwd = () => mkdtempSync(join(tmpdir(), "doctor-rm-")); // sem .context: o check não depende do repo

test("check registrado, não destrutivo, severidade warn", () => {
  assert.ok(check);
  assert.equal(check.destructive, false);
  assert.equal(check.severity, "warn");
});

test("versão testada → OK, citando a versão", () => {
  const r = check.run({ cwd: cwd(), claudeVersion: "2.1.296 (Claude Code)" });
  assert.equal(r.status, "OK");
  assert.match(r.diagnosis, /2\.1\.296/);
});

test("anterior a 2.1.293 → WARN com reparo", () => {
  const r = check.run({ cwd: cwd(), claudeVersion: "2.1.292 (Claude Code)" });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /2\.1\.293/);
  assert.match(r.repair, /Atualize o Claude Code/);
});

test("versão ilegível → WARN", () => {
  const r = check.run({ cwd: cwd(), claudeVersion: "" });
  assert.equal(r.status, "WARN");
  assert.match(r.repair, /claude --version/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-doctor-router-monitor.mjs`
Expected: FAIL — `check` é `undefined`.

- [ ] **Step 3: Implementar o mínimo**

Em `scripts/lib/doctor.mjs`, depois do objeto `modelRouting`:

```js
// Monitor ao vivo do roteamento: sempre ligado em todo projeto com o plugin (spec 2026-10-09-router-monitor-toolbar M8).
// O onboarding só verifica que o Claude Code carrega o mod (hooks.json → modules).
const routerMonitor = {
  id: "router-monitor",
  title: "Monitor ao vivo do roteamento (faixa acima do prompt)",
  severity: "warn",
  destructive: false,
  run(ctx) {
    const version = claudeVersionOf(ctx);
    if (!/\d+\.\d+\.\d+/.test(String(version))) {
      return { status: "WARN", diagnosis: "Não foi possível ler a versão do Claude Code; o monitor ao vivo só aparece quando o mod carrega.", repair: "Confira `claude --version` (testado a partir de 2.1.293)." };
    }
    if (belowMin(version)) {
      return { status: "WARN", diagnosis: `Claude Code ${version} é anterior à versão testada (2.1.293): o monitor ao vivo e o roteamento por mod podem não carregar.`, repair: "Atualize o Claude Code." };
    }
    return { status: "OK", diagnosis: `Monitor ao vivo do roteamento disponível (Claude Code ${version}).`, repair: "" };
  },
};
```

E acrescentar `routerMonitor` ao fim do array `CHECKS` (depois de `modelRouting`).

Em `skills/project-init/SKILL.md`, depois do Step 0.7 e antes de `## Initialization Strategy`:

````markdown
## Step 0.8: Monitor ao vivo do roteamento (verificação)

O DevFlow mostra, acima do prompt, uma linha por agente em execução (modelo·esforço e origem, tempo, falhas, retentativas). É **sempre ligado** e não grava nada no projeto; aqui só se verifica que o Claude Code carrega o mod:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/doctor.mjs" --check router-monitor
```

Mostre o resultado ao usuário. WARN não bloqueia o init: repasse o reparo indicado (normalmente atualizar o Claude Code).
````

Em `skills/config/SKILL.md`, ao fim da seção `### 4. Confirmar e informar` (antes de `### 4.5`):

````markdown
Em seguida, verifique o monitor ao vivo do roteamento (sempre ligado; nada a configurar) e mostre o resultado:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/doctor.mjs" --check router-monitor
```

WARN não bloqueia: repasse o reparo indicado.
````

Em `skills/doctor/SKILL.md`: se a skill lista os checks, acrescentar `router-monitor` (monitor ao vivo; WARN quando o Claude Code é anterior a 2.1.293 ou a versão é ilegível) no mesmo formato das linhas vizinhas. Se não lista, não mexer.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/lib/test-doctor-router-monitor.mjs tests/lib/test-doctor-model-routing.mjs && node scripts/doctor.mjs --check router-monitor`
Expected: PASS; o comando imprime o check `router-monitor` com OK nesta máquina.

Run: `bash tests/run-unit.sh`
Expected: PASS (se algum teste listar os checks ou o conteúdo das skills, ajustá-lo ao check novo).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/doctor.mjs tests/lib/test-doctor-router-monitor.mjs skills/project-init/SKILL.md skills/config/SKILL.md skills/doctor/SKILL.md
git commit -m "feat(router-monitor): onboarding verifica que o mod carrega (check router-monitor no doctor, init e config)" -- scripts/lib/doctor.mjs tests/lib/test-doctor-router-monitor.mjs skills/project-init/SKILL.md skills/config/SKILL.md skills/doctor/SKILL.md
```

---

### Task 7: documentação, CHANGELOG e os quatro sinais

**Agent:** documentation-writer
**Tests:** e2e (rodada completa dos sinais)

**Files:**
- Modify: `docs/model-routing.md` (nova seção antes de `## Medição`; se não houver esse título, ao fim)
- Modify: `CHANGELOG.md` (seção `[Unreleased]`)

**Interfaces:**
- Consumes: tudo das Tasks 1–6.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Documentar**

Em `docs/model-routing.md`, nova seção:

```markdown
## Monitor ao vivo

Em todo projeto com o DevFlow, uma faixa acima do prompt mostra uma linha por agente em execução (a sessão e cada subagente):

    general-purpose · Task 3 · review        Modelo: sonnet-5-5·medium (roteado) | Tempo: 01:12 | Falhas: 0 | Retentativas: 1

- **Modelo** e esforço aplicados. A origem diz de onde veio a escolha: `roteado` (o roteador mudou o modelo ou o esforço), `teto` (o roteador não mexeu) ou `router off` (roteamento desligado: o modelo é o que o Claude Code escolheu).
- **Tempo:** desde o despacho (subagente) ou o início do turno (sessão).
- **Falhas:** falhas de ferramenta seguidas, a contagem que dispara a escalada no meio; amarelo a partir de 1, vermelho ao chegar ao `failureStreak` (padrão 3).
- **Retentativas:** quantas vezes a mesma task foi despachada de novo para o mesmo papel. A task vem do `Task N` da descrição do despacho (subagent-driven-development) ou da linha `Current story: S<n>` do prompt (autonomous-loop); o papel separa implementação de revisão. No subagent-driven-development, a revisão conta as rodadas de re-review e a implementação conta os implementers novos (as rodadas que sobem de modelo); um implementer retomado por mensagem não conta. Sem task, `—`.

A faixa só aparece com agente em execução, mostra até 6 linhas (menos em terminal baixo; `+N agentes` além disso) e nunca exibe o texto do prompt. O monitor só observa: não muda modelo, não lê arquivos do repositório e não grava ledger, e funciona com o roteamento desligado, para comparar o antes e o depois. Ele vem sempre ligado; o `/devflow init`, o `/devflow config` e o `/devflow:devflow-doctor` (check `router-monitor`) verificam se o seu Claude Code carrega o mod.
```

Em `CHANGELOG.md`, sob `## [Unreleased]` (criar `### Added` se não existir):

```markdown
- Monitor ao vivo do roteamento de modelos: faixa acima do prompt com modelo·esforço aplicados e origem (`roteado`/`teto`/`router off`), cronômetro, falhas de ferramenta seguidas e retentativas da mesma task por papel, para cada agente em execução; sempre ligado. Check `router-monitor` no doctor, chamado pelo `/devflow init` e pelo `/devflow config`.
```

- [ ] **Step 2: Rodar os quatro sinais**

Run: `bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-e2e.sh && bash tests/run-lint.sh`
Expected: tudo PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/model-routing.md CHANGELOG.md
git commit -m "docs(router-monitor): monitor ao vivo no guia de roteamento e changelog" -- docs/model-routing.md CHANGELOG.md
```

---

## Verificação ao vivo (fase V, manual)

`claude -p` não desenha a faixa. Na fase V: sessão interativa `claude --plugin-dir .` com `models.enabled: true` e `DEVFLOW_MODEL_ROUTING=1`, uma rodada SDD curta (implement + review + 1 re-review) e um erro de ferramenta forçado; capturar a faixa mostrando `(roteado)`, `Falhas` subindo e `Retentativas: 1` na linha do review. Repetir com `/devflow-route off` e conferir `(router off)`.
