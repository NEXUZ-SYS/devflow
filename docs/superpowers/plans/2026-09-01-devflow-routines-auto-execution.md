> ## ⚠ PLANO ABSORVIDO — não executar como está
>
> **2026-09-01.** Fundido em
> [`2026-09-01-daily-devflow-checkup.md`](./2026-09-01-daily-devflow-checkup.md), que ataca o
> mesmo defeito central. Este arquivo permanece como registro do diagnóstico, que continua
> correto e foi o que encontrou a causa raiz.
>
> **Absorvido:** a separação `shouldRun` × `shouldSuggest` (Task 11 de lá) — que corrigiu um bug
> no próprio plano de destino, onde o `run-checks` filtrava por `shouldSuggest` e teria recebido
> lista vazia depois do `mark-suggested`; o fix do `snoozeUntil` em `dueRoutines`; o
> `routines-render.mjs`; e as três classes de execução, no campo único `execution`.
>
> **Não absorvido, e por quê:**
> - **Executar `/devflow:devflow-doctor` no SessionStart.** Medido: `node scripts/doctor.mjs
>   --json` leva **16,5 s** — 330× o orçamento do checkup diário, e o `TIMEOUT_MS: 120000` do
>   plano não limita isso. O doctor passou a ser **proposto** (classe `confirm`), nunca executado
>   sozinho.
> - **Manter `lastRun`/`nextRun`/`lastSuggested`/`snoozeUntil` no `templates/routines.json`.** O
>   arquivo é versionado; com execução automática e cadência diária, toda sessão sujaria o git e
>   a máquina que rodasse primeiro gravaria `nextRun` para todas as outras. O estado passou para
>   `.context/runtime/routines-state.json`, por máquina.
> - **Injetar até 4000 chars de saída no contexto a cada execução.** O checkup é silencioso
>   quando está tudo certo.
>
> **Dois booleanos → um enum:** `autoRun` + `requiresConfirmation` admitem o estado contraditório
> `autoRun: true` com `requiresConfirmation: true`. Virou `execution: auto|confirm|model`.

# DevFlow Routines — Execução Automática Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer as rotinas de manutenção do DevFlow **executarem** quando vencem, em vez de apenas serem sugeridas — preservando confirmação humana para rotinas que mutam estado.

**Architecture:** Separar o predicado de *sugerir* do de *executar* (hoje ambos passam por `shouldSuggest`, que carrega uma guarda de 1×/dia). Introduzir um registry de comandos shell-executáveis e não-mutantes, executá-los no hook `session-start`, e gravar `lastRun`. Prompts que exigem o modelo (skills/agents) ganham uma instrução de execução imediata; prompts que mutam estado continuam pedindo confirmação.

**Tech Stack:** Node ESM (sem dependências externas), `node:test` + `node:assert/strict` para unit, bash para testes de hook. Datas sempre injetadas (`--today` / `DEVFLOW_TODAY`) — nunca wall-clock.

**Spec:** Não há spec separada. A seção **Evidência do bug** abaixo é a especificação; ela foi levantada por inspeção do código em `devflow@3.1.0` e reproduzida em projeto real.

## Global Constraints

- **Repositório alvo:** `NEXUZ-SYS/devflow`. Nenhuma mudança fora dele.
- **Zero dependências novas.** O plugin não tem `package.json` publicável (`{"private": true}`); tudo é Node ESM stdlib.
- **Datas injetáveis.** Toda função que compara datas recebe `today` explícito. Wall-clock só no boundary da CLI (`todayOf`), como já é hoje.
- **Determinismo nos testes.** Fixtures em `mkdtempSync`; o motor nunca toca nada fora do `cwd`.
- **Retrocompatibilidade de schema.** Ausência de campo = comportamento anterior. `routines.json` já em campo não pode quebrar.
- **Segurança:** nenhum comando com metacaractere de shell; execução por `execFileSync` com argv array, nunca via shell.
- **Idioma:** comentários e mensagens de usuário em português, seguindo o restante do repo.
- **Testes:** `tests/run-unit.sh` (node:test) e `tests/run-integration.sh` (shell) devem passar.

---

## Evidência do bug

### Defeito 1 — Conflação de predicados (causa raiz)

`scripts/routines.mjs`, subcomando `due`:

```js
const due = routines.filter(r => shouldSuggest(r, today));
```

E `scripts/lib/routines.mjs`:

```js
export function shouldSuggest(routine, today) {
  if (routine.enabled === false) return false;
  if (routine.snoozeUntil && !lte(routine.snoozeUntil, today)) return false;
  if (routine.nextRun != null && !lte(routine.nextRun, today)) return false;
  if (routine.lastSuggested === today) return false; // ← guarda de 1x/dia
  return true;
}
```

A guarda `lastSuggested === today` é correta para **surfacing** e errada para **execução**. Consequência: qualquer consumidor que pergunte "o que deve rodar?" recebe lista vazia assim que uma sugestão foi emitida hoje.

**Reprodução:** `hooks/session-start` linha 318 chama `mark-suggested`. Na sessão seguinte do mesmo dia, `routines.mjs due --ids` devolve vazio, mesmo com `lastRun: null` e `nextRun: null`.

### Defeito 2 — Nenhum caminho de execução

`hooks/session-start` linhas 303–321 fazem exatamente três coisas: consultam `due --ids`, montam um texto e chamam `mark-suggested`. O texto injetado diz literalmente *"Apenas sugira — não execute automaticamente"*.

`markRun` existe em `scripts/lib/routines.mjs:96` e **nenhum caller o invoca** fora da skill `devflow:routines`, que só roda quando o usuário digita o comando. Resultado observado em projeto real: `lastRun: null` indefinidamente.

O cabeçalho da lib documenta isso como intenção: *"it SUGGESTS due routines but never executes them"*. Este plano muda essa decisão de design.

### Defeito 3 — `dueRoutines` ignora snooze (latente)

```js
export function dueRoutines(routines, today) {
  return routines.filter(r => r.enabled !== false && (r.nextRun == null || lte(r.nextRun, today)));
}
```

Não checa `snoozeUntil`. O subcomando `list` usa `dueRoutines` para marcar `.due`, então uma rotina adiada pelo usuário aparece como vencida. Qualquer executor construído sobre `dueRoutines` violaria um "agora não" explícito.

### Restrição arquitetural

Um hook shell **não consegue** invocar slash-command nem skill — isso só existe no plano do modelo. Portanto automação completa só é possível para prompts com script executável por trás. O design abaixo é honesto quanto a isso: **três classes** de rotina, não duas.

| Classe | Critério | Ação no SessionStart |
|---|---|---|
| `auto` | todos os prompts no registry shell-safe, `autoRun !== false` | executa e grava `lastRun` |
| `model` | prompt exige o modelo, ou `autoRun: false` | instrui a executar já, sem perguntar |
| `confirm` | `requiresConfirmation: true` | avisa e pergunta; nunca executa |

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `scripts/lib/routines.mjs` | Motor de agendamento: predicados e mutações de estado | Modificar — adicionar `shouldRun`, corrigir `dueRoutines` |
| `scripts/lib/routines-exec.mjs` | Registry de comandos shell-safe, classificação e execução | **Criar** — isolado do motor de datas, que não deve saber sobre processos |
| `scripts/routines.mjs` | CLI | Modificar — novo subcomando `run-auto` |
| `scripts/lib/routines-render.mjs` | Converte o JSON do `run-auto` nos blocos de contexto | **Criar** — montar texto multilinha em sh é frágil; separado fica testável |
| `hooks/session-start` | Injeção de contexto no início da sessão | Modificar — chamar `run-auto` e emitir os três blocos |
| `templates/routines.json` | Template semeado pelo `/devflow config` | Modificar — campos de política documentados |
| `tests/validation/test-routines.mjs` | Unit do motor | Modificar — cobrir `shouldRun` e o snooze |
| `tests/validation/test-routines-exec.mjs` | Unit do executor | **Criar** |
| `tests/validation/test-routines-cli.mjs` | Unit da CLI | Modificar — cobrir `run-auto` |
| `tests/hooks/test-session-start-routines.sh` | Integração do hook | Modificar — cobrir os três blocos |
| `skills/routines/SKILL.md` | Doc do skill | Modificar — refletir execução automática |
| `CHANGELOG.md` | Histórico | Modificar |

`routines-exec.mjs` é arquivo novo em vez de crescer `routines.mjs` porque as responsabilidades são distintas: uma é aritmética de datas pura e testável sem I/O; a outra spawna processos. Misturá-las obrigaria os testes do motor a lidar com mocks de `child_process`.

---

### Task 1: Predicado `shouldRun` e correção do snooze em `dueRoutines`

**Files:**
- Modify: `scripts/lib/routines.mjs:74-86`
- Test: `tests/validation/test-routines.mjs`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: `shouldRun(routine, today) -> boolean` — elegibilidade de **execução**: `enabled !== false`, `nextRun` nulo ou `<= today`, e não sob snooze. Deliberadamente **sem** a guarda `lastSuggested`. `dueRoutines(routines, today) -> Routine[]` passa a honrar snooze.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `tests/validation/test-routines.mjs`:

```js
// ── shouldRun: elegibilidade de EXECUÇÃO (≠ de sugestão) ────────────
test("shouldRun ignora a guarda de 1x/dia do shouldSuggest", () => {
  const r = { id: "a", enabled: true, nextRun: null, lastSuggested: "2026-09-01" };
  assert.equal(shouldSuggest(r, "2026-09-01"), false, "suggest: já sugerida hoje");
  assert.equal(shouldRun(r, "2026-09-01"), true, "run: sugestão não bloqueia execução");
});

test("shouldRun respeita enabled:false", () => {
  const r = { id: "a", enabled: false, nextRun: null };
  assert.equal(shouldRun(r, "2026-09-01"), false);
});

test("shouldRun respeita nextRun no futuro", () => {
  const r = { id: "a", enabled: true, nextRun: "2026-09-08" };
  assert.equal(shouldRun(r, "2026-09-01"), false);
  assert.equal(shouldRun(r, "2026-09-08"), true, "vencimento é inclusivo");
});

test("shouldRun respeita snoozeUntil", () => {
  const r = { id: "a", enabled: true, nextRun: null, snoozeUntil: "2026-09-05" };
  assert.equal(shouldRun(r, "2026-09-01"), false, "sob snooze");
  assert.equal(shouldRun(r, "2026-09-05"), true, "snoozeUntil é exclusivo: no dia já libera");
});

test("dueRoutines honra snoozeUntil (regressão)", () => {
  const rs = [{ id: "a", enabled: true, nextRun: null, snoozeUntil: "2026-09-05" }];
  assert.deepEqual(dueRoutines(rs, "2026-09-01").map(r => r.id), [],
    "rotina adiada não pode aparecer como vencida");
  assert.deepEqual(dueRoutines(rs, "2026-09-05").map(r => r.id), ["a"]);
});
```

Adicionar `shouldRun` ao import no topo do arquivo:

```js
import {
  loadRoutines, saveRoutines, nextRunFrom, dueRoutines,
  markRun, snooze, shouldSuggest, markSuggested, shouldRun,
} from "../../scripts/lib/routines.mjs";
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/validation/test-routines.mjs`
Expected: FAIL — `shouldRun is not a function` (SyntaxError no import, pois o módulo não exporta o símbolo).

- [ ] **Step 3: Implementar**

Em `scripts/lib/routines.mjs`, substituir `dueRoutines` e adicionar `shouldRun` logo antes de `shouldSuggest`:

```js
// Uma rotina está sob snooze quando snoozeUntil ainda não chegou.
// snoozeUntil é EXCLUSIVO: no próprio dia a rotina já volta a valer.
function snoozed(routine, today) {
  return routine.snoozeUntil != null && !lte(routine.snoozeUntil, today);
}

// Elegibilidade de EXECUÇÃO. Distinta de shouldSuggest: não carrega a guarda
// de 1x/dia (lastSuggested), que só faz sentido para surfacing. Um item já
// mencionado hoje continua precisando rodar.
export function shouldRun(routine, today) {
  if (routine.enabled === false) return false;
  if (snoozed(routine, today)) return false;
  if (routine.nextRun != null && !lte(routine.nextRun, today)) return false;
  return true;
}

export function dueRoutines(routines, today) {
  return routines.filter(r => shouldRun(r, today));
}
```

E simplificar `shouldSuggest` para reusar o predicado, mantendo só a guarda que lhe é própria:

```js
export function shouldSuggest(routine, today) {
  if (!shouldRun(routine, today)) return false;
  if (routine.lastSuggested === today) return false; // 1x/dia — só para surfacing
  return true;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/validation/test-routines.mjs`
Expected: PASS — incluindo os testes pré-existentes de `shouldSuggest` e `dueRoutines`.

- [ ] **Step 5: Rodar a suíte unit inteira**

Run: `bash tests/run-unit.sh`
Expected: PASS. Se algum teste existente assumia que `dueRoutines` ignora snooze, ele estava codificando o defeito 3 — corrija o teste, não o código.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/routines.mjs tests/validation/test-routines.mjs
git commit -m "fix(routines): separa elegibilidade de execucao da de sugestao

shouldSuggest carregava a guarda de 1x/dia, entao qualquer consumidor
perguntando o que deve RODAR recebia vazio apos a primeira sugestao do dia.
Introduz shouldRun (sem a guarda) e faz dueRoutines honrar snoozeUntil."
```

---

### Task 2: Registry de comandos shell-executáveis e classificação

**Files:**
- Create: `scripts/lib/routines-exec.mjs`
- Test: `tests/validation/test-routines-exec.mjs`

**Interfaces:**
- Consumes: nada de Task 1 (independente; só o CLI da Task 4 junta os dois)
- Produces:
  - `SHELL_EXECUTABLE: Map<string, {script: string, args: string[]}>` — comandos comprovadamente **não-mutantes** que podem rodar sem consentimento.
  - `classifyRoutine(routine) -> "auto" | "model" | "confirm"`

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/validation/test-routines-exec.mjs`:

```js
#!/usr/bin/env node
// tests/validation/test-routines-exec.mjs
// Unit do executor de rotinas. Classificação é pura (sem I/O).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHELL_EXECUTABLE, classifyRoutine } from "../../scripts/lib/routines-exec.mjs";

const doctor = { type: "command", value: "/devflow:devflow-doctor" };

test("registry só contém comandos não-mutantes conhecidos", () => {
  assert.equal(SHELL_EXECUTABLE.has("/devflow:devflow-doctor"), true);
  assert.equal(SHELL_EXECUTABLE.has("/devflow update"), false,
    "update muta estado — nunca pode entrar no registry");
});

test("classifica como auto quando todos os prompts são shell-safe", () => {
  assert.equal(classifyRoutine({ id: "a", prompts: [doctor] }), "auto");
});

test("requiresConfirmation vence tudo", () => {
  assert.equal(
    classifyRoutine({ id: "a", requiresConfirmation: true, prompts: [doctor] }),
    "confirm");
});

test("autoRun:false rebaixa para model mesmo sendo shell-safe", () => {
  assert.equal(classifyRoutine({ id: "a", autoRun: false, prompts: [doctor] }), "model");
});

test("prompt fora do registry vira model", () => {
  assert.equal(
    classifyRoutine({ id: "a", prompts: [{ type: "command", value: "/devflow prd" }] }),
    "model");
});

test("prompt do tipo skill ou agent vira model", () => {
  assert.equal(classifyRoutine({ id: "a", prompts: [{ type: "skill", value: "x" }] }), "model");
  assert.equal(classifyRoutine({ id: "a", prompts: [{ type: "agent", value: "x" }] }), "model");
});

test("mistura de shell-safe com não-safe vira model", () => {
  assert.equal(
    classifyRoutine({ id: "a", prompts: [doctor, { type: "command", value: "/devflow prd" }] }),
    "model", "basta um prompt não-executável para o conjunto exigir o modelo");
});

test("prompts vazio vira model — nunca auto", () => {
  assert.equal(classifyRoutine({ id: "a", prompts: [] }), "model");
  assert.equal(classifyRoutine({ id: "a" }), "model");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/validation/test-routines-exec.mjs`
Expected: FAIL — `Cannot find module '../../scripts/lib/routines-exec.mjs'`.

- [ ] **Step 3: Implementar a parte de classificação**

Criar `scripts/lib/routines-exec.mjs`:

```js
// scripts/lib/routines-exec.mjs
// Execução de rotinas de manutenção.
//
// Um hook shell NÃO consegue invocar slash-command nem skill — isso só existe
// no plano do modelo. Portanto só automatizamos prompts com script por trás.
// O registry abaixo é a fronteira de segurança: entra apenas comando
// comprovadamente NÃO-MUTANTE, porque roda sem consentimento do usuário.
//
// Separado de routines.mjs de propósito: aquele módulo é aritmética de datas
// pura; este spawna processos. Manter juntos obrigaria os testes do motor a
// mockar child_process.

import { execFileSync } from "node:child_process";
import { join } from "node:path";

// scripts/doctor.mjs se declara "Diagnose-only: NEVER applies repairs" —
// reparos exigem a skill e consentimento. Por isso pode rodar sozinho.
export const SHELL_EXECUTABLE = new Map([
  ["/devflow:devflow-doctor", { script: "scripts/doctor.mjs", args: ["--json"] }],
]);

// "auto"    → pode executar sozinha agora
// "model"   → precisa de um turno do agente (skill/agent/comando sem script)
// "confirm" → muta estado; exige confirmação explícita do usuário
export function classifyRoutine(routine) {
  if (routine.requiresConfirmation === true) return "confirm";
  if (routine.autoRun === false) return "model";
  const prompts = routine.prompts || [];
  if (prompts.length === 0) return "model";
  const allShell = prompts.every(
    p => p && p.type === "command" && SHELL_EXECUTABLE.has(p.value)
  );
  return allShell ? "auto" : "model";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/validation/test-routines-exec.mjs`
Expected: PASS — 8 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/routines-exec.mjs tests/validation/test-routines-exec.mjs
git commit -m "feat(routines): registry de comandos shell-safe e classificacao

Tres classes: auto (executa sozinha), model (precisa do agente) e confirm
(muta estado, pergunta). O registry so aceita comando nao-mutante, porque
roda sem consentimento."
```

---

### Task 3: Executor com gravação de `lastRun`

**Files:**
- Modify: `scripts/lib/routines-exec.mjs`
- Test: `tests/validation/test-routines-exec.mjs`

**Interfaces:**
- Consumes: `SHELL_EXECUTABLE` e `classifyRoutine` da Task 2; `markRun(cwd, id, today)` de `scripts/lib/routines.mjs:96`
- Produces: `runRoutineShell(cwd, routine, pluginRoot) -> {ok: boolean, output: string}` — executa todos os prompts em ordem, para no primeiro erro, **não** grava estado (quem grava é o caller, na Task 4).

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `tests/validation/test-routines-exec.mjs`:

```js
import { runRoutineShell } from "../../scripts/lib/routines-exec.mjs";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Cria um pluginRoot falso cujo scripts/doctor.mjs é um stub previsível.
function fakePlugin(body) {
  const dir = mkdtempSync(join(tmpdir(), "devflow-plugin-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts", "doctor.mjs"), body);
  return dir;
}

test("runRoutineShell executa o prompt e devolve a saída", () => {
  const root = fakePlugin('process.stdout.write("DIAGNOSTICO_OK");');
  const r = runRoutineShell(process.cwd(), { id: "a", prompts: [doctor] }, root);
  assert.equal(r.ok, true);
  assert.match(r.output, /DIAGNOSTICO_OK/);
});

test("runRoutineShell devolve ok:false quando o script falha", () => {
  const root = fakePlugin('process.stderr.write("BOOM"); process.exit(3);');
  const r = runRoutineShell(process.cwd(), { id: "a", prompts: [doctor] }, root);
  assert.equal(r.ok, false);
  assert.match(r.output, /BOOM|ERRO/);
});

test("runRoutineShell recusa prompt fora do registry", () => {
  const root = fakePlugin('process.stdout.write("x");');
  const r = runRoutineShell(process.cwd(),
    { id: "a", prompts: [{ type: "command", value: "/devflow update" }] }, root);
  assert.equal(r.ok, false, "fora do registry nunca executa");
  assert.match(r.output, /registry/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/validation/test-routines-exec.mjs`
Expected: FAIL — `runRoutineShell is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar a `scripts/lib/routines-exec.mjs`:

```js
const MAX_OUTPUT = 4000;   // o resultado entra no contexto do modelo
const TIMEOUT_MS = 120000;

// Executa os prompts em ordem; para no primeiro erro. NÃO grava estado —
// markRun é responsabilidade do caller, para que o executor siga puro o
// suficiente para testar sem fixture de routines.json.
export function runRoutineShell(cwd, routine, pluginRoot) {
  const outputs = [];
  for (const p of routine.prompts || []) {
    const spec = p && p.type === "command" ? SHELL_EXECUTABLE.get(p.value) : null;
    if (!spec) {
      return { ok: false, output: `prompt '${p && p.value}' fora do registry shell-safe` };
    }
    try {
      outputs.push(execFileSync(
        process.execPath,
        [join(pluginRoot, spec.script), ...spec.args],
        { cwd, encoding: "utf8", timeout: TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] }
      ));
    } catch (e) {
      const msg = (e.stderr || e.message || "").toString();
      return { ok: false, output: `ERRO em ${p.value}: ${msg}`.slice(0, MAX_OUTPUT) };
    }
  }
  return { ok: true, output: outputs.join("\n").slice(0, MAX_OUTPUT) };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/validation/test-routines-exec.mjs`
Expected: PASS — 11 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/routines-exec.mjs tests/validation/test-routines-exec.mjs
git commit -m "feat(routines): executor de prompts shell-safe

execFileSync com argv array (nunca shell), timeout de 120s e saida truncada
em 4000 chars, que e o que entra no contexto do modelo."
```

---

### Task 4: Subcomando `run-auto` na CLI

**Files:**
- Modify: `scripts/routines.mjs:24-36`
- Test: `tests/validation/test-routines-cli.mjs`

**Interfaces:**
- Consumes: `shouldRun` (Task 1), `classifyRoutine` e `runRoutineShell` (Tasks 2–3), `markRun` e `loadRoutines` já existentes
- Produces: `routines.mjs run-auto [--today YYYY-MM-DD] [--plugin-root PATH]` — imprime JSON `{ executed: [{id, ok, output}], needsModel: [id], needsConfirmation: [{id, commands}] }` e sai 0 sempre (nunca trava o SessionStart).

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/validation/test-routines-cli.mjs` (seguindo o padrão de invocação já usado no arquivo):

```js
test("run-auto executa rotina auto, grava lastRun e classifica as demais", () => {
  const pluginRoot = fakePlugin('process.stdout.write("OK_DOCTOR");');
  const dir = repoWith([
    { id: "auto-one", enabled: true, frequency: "7d", nextRun: null,
      lastRun: null, lastSuggested: "2026-09-01",
      prompts: [{ type: "command", value: "/devflow:devflow-doctor" }] },
    { id: "needs-model", enabled: true, frequency: "7d", nextRun: null,
      prompts: [{ type: "skill", value: "devflow:context-sync" }] },
    { id: "needs-confirm", enabled: true, frequency: "30d", nextRun: null,
      requiresConfirmation: true,
      prompts: [{ type: "command", value: "/devflow update" }] },
  ]);

  const out = JSON.parse(run(dir, ["run-auto", "--today", "2026-09-01",
                                   "--plugin-root", pluginRoot]));

  assert.deepEqual(out.executed.map(e => e.id), ["auto-one"]);
  assert.equal(out.executed[0].ok, true);
  assert.match(out.executed[0].output, /OK_DOCTOR/);
  assert.deepEqual(out.needsModel, ["needs-model"]);
  assert.deepEqual(out.needsConfirmation.map(c => c.id), ["needs-confirm"]);

  // lastRun gravado e nextRun recalculado pela frequência
  const saved = JSON.parse(readFileSync(join(dir, ".context", "routines.json"), "utf8"));
  const one = saved.routines.find(r => r.id === "auto-one");
  assert.equal(one.lastRun, "2026-09-01", "lastRun gravado — o bug original");
  assert.equal(one.nextRun, "2026-09-08", "nextRun = today + 7d");

  // rotinas não executadas não têm estado alterado
  assert.equal(saved.routines.find(r => r.id === "needs-confirm").lastRun, undefined);
});

test("run-auto não executa rotina sob snooze", () => {
  const pluginRoot = fakePlugin('process.stdout.write("NAO_DEVIA_RODAR");');
  const dir = repoWith([
    { id: "adiada", enabled: true, frequency: "7d", nextRun: null,
      snoozeUntil: "2026-09-05",
      prompts: [{ type: "command", value: "/devflow:devflow-doctor" }] },
  ]);
  const out = JSON.parse(run(dir, ["run-auto", "--today", "2026-09-01",
                                   "--plugin-root", pluginRoot]));
  assert.deepEqual(out.executed, []);
  assert.deepEqual(out.needsModel, []);
});
```

Se `fakePlugin` ainda não existir neste arquivo, copiar a definição da Task 3 para o topo dele.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/validation/test-routines-cli.mjs`
Expected: FAIL — a CLI não reconhece `run-auto`; a saída não é JSON parseável.

- [ ] **Step 3: Implementar**

Em `scripts/routines.mjs`, adicionar aos imports:

```js
import { classifyRoutine, runRoutineShell } from "./lib/routines-exec.mjs";
```

E inserir o subcomando logo após o bloco `due`:

```js
  if (cmd === "run-auto") {
    // Usa shouldRun (não shouldSuggest): a guarda de 1x/dia vale para
    // surfacing, não para execução.
    const pluginRoot = arg(args, "--plugin-root")
      || join(dirname(fileURLToPath(import.meta.url)), "..");
    const { routines } = loadRoutines(cwd);
    const out = { executed: [], needsModel: [], needsConfirmation: [] };

    for (const r of routines.filter(x => shouldRun(x, today))) {
      const cls = classifyRoutine(r);
      if (cls === "confirm") {
        out.needsConfirmation.push({
          id: r.id,
          commands: (r.prompts || []).map(p => p.value),
        });
        continue;
      }
      if (cls === "model") { out.needsModel.push(r.id); continue; }

      const res = runRoutineShell(cwd, r, pluginRoot);
      if (res.ok) markRun(cwd, r.id, today);
      out.executed.push({ id: r.id, ok: res.ok, output: res.output });
    }
    console.log(JSON.stringify(out));
    return process.exit(0);
  }
```

Garantir que `shouldRun`, `markRun`, `dirname` e `fileURLToPath` estejam importados no topo:

```js
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRoutines, shouldRun, markRun, /* … já existentes … */ } from "./lib/routines.mjs";
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/validation/test-routines-cli.mjs`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte unit inteira**

Run: `bash tests/run-unit.sh`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/routines.mjs tests/validation/test-routines-cli.mjs
git commit -m "feat(routines): subcomando run-auto

Executa as rotinas auto vencidas, grava lastRun e classifica o resto em
needsModel/needsConfirmation. Sai 0 sempre — nunca trava o SessionStart."
```

---

### Task 5: Ligar o hook `session-start`

**Files:**
- Modify: `hooks/session-start:303-321`
- Test: `tests/hooks/test-session-start-routines.sh`

**Interfaces:**
- Consumes: `routines.mjs run-auto` (Task 4)
- Produces: três blocos no `additionalContext` — `<DEVFLOW_ROUTINES_EXECUTED>`, `<DEVFLOW_ROUTINES_RUN_NOW>`, `<DEVFLOW_ROUTINES_NEED_CONFIRMATION>`. O bloco `<DEVFLOW_ROUTINES_DUE>` deixa de existir.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar a `tests/hooks/test-session-start-routines.sh`, seguindo o padrão de fixture já usado no arquivo:

```bash
echo "── execução automática ──"
PROJ=$(mktemp -d -p "$TMPROOT")
mkdir -p "$PROJ/.context"
cat > "$PROJ/.context/routines.json" <<'JSON'
{ "routines": [
  { "id": "context-maintenance", "enabled": true, "frequency": "7d",
    "lastRun": null, "nextRun": null, "lastSuggested": "2026-09-01",
    "prompts": [{ "type": "command", "value": "/devflow:devflow-doctor" }] }
] }
JSON
OUT=$(cd "$PROJ" && DEVFLOW_TODAY=2026-09-01 \
  "${PROJECT_ROOT}/hooks/run-hook.cmd" session-start <<< '{}')

assert_contains "emite bloco EXECUTED" "$OUT" "DEVFLOW_ROUTINES_EXECUTED"
assert_not_contains "não emite mais o bloco DUE" "$OUT" "DEVFLOW_ROUTINES_DUE"
assert_not_contains "não instrui a apenas sugerir" "$OUT" "Apenas sugira"

LASTRUN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$PROJ/.context/routines.json','utf8')).routines[0].lastRun)")
assert_contains "lastRun gravado (o bug original)" "$LASTRUN" "2026-09-01"

echo "── rotina que exige confirmação ──"
PROJ2=$(mktemp -d -p "$TMPROOT")
mkdir -p "$PROJ2/.context"
cat > "$PROJ2/.context/routines.json" <<'JSON'
{ "routines": [
  { "id": "devflow-update", "enabled": true, "frequency": "30d",
    "lastRun": null, "nextRun": null, "requiresConfirmation": true,
    "prompts": [{ "type": "command", "value": "/devflow update" }] }
] }
JSON
OUT2=$(cd "$PROJ2" && DEVFLOW_TODAY=2026-09-01 \
  "${PROJECT_ROOT}/hooks/run-hook.cmd" session-start <<< '{}')

assert_contains "pede confirmação" "$OUT2" "DEVFLOW_ROUTINES_NEED_CONFIRMATION"
LR2=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$PROJ2/.context/routines.json','utf8')).routines[0].lastRun)")
assert_contains "não executou" "$LR2" "null"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bash tests/hooks/test-session-start-routines.sh`
Expected: FAIL — o hook ainda emite `DEVFLOW_ROUTINES_DUE` e `lastRun` continua `null`.

- [ ] **Step 3: Implementar**

Em `hooks/session-start`, substituir integralmente o bloco das linhas 303–321 por:

```sh
# --- Routines: executa as vencidas (file-based maintenance scheduler) ---
# Antes este bloco apenas SUGERIA e chamava mark-suggested, então lastRun
# ficava null para sempre. Agora run-auto executa a classe `auto`, e devolve
# as demais classificadas. Nunca trava o SessionStart: erro → contexto vazio.

routines_ctx=""
if [ -f "${project_root}/.context/routines.json" ] && command -v node >/dev/null 2>&1; then
  ra_json=$(cd "${project_root}" && node "${PLUGIN_ROOT}/scripts/routines.mjs" run-auto 2>/dev/null || echo "")
  if [ -n "$ra_json" ]; then
    rt_text=$(printf '%s' "$ra_json" | node "${PLUGIN_ROOT}/scripts/lib/routines-render.mjs" 2>/dev/null || echo "")
    if [ -n "$rt_text" ]; then
      rt_escaped=$(escape_for_json "$rt_text")
      routines_ctx="\\n${rt_escaped}\\n"
    fi
  fi
fi
```

Criar `scripts/lib/routines-render.mjs`, que lê o JSON do `run-auto` no stdin e imprime o texto dos blocos:

```js
#!/usr/bin/env node
// scripts/lib/routines-render.mjs
// Converte a saída de `routines.mjs run-auto` nos blocos de contexto do
// SessionStart. Separado do hook porque montar texto multilinha em sh é
// frágil, e assim o formato fica testável isoladamente.
let raw = "";
process.stdin.on("data", c => (raw += c));
process.stdin.on("end", () => {
  let d;
  try { d = JSON.parse(raw); } catch { process.exit(0); }
  const out = [];

  if ((d.executed || []).length) {
    out.push("<DEVFLOW_ROUTINES_EXECUTED>");
    out.push("As rotinas abaixo JA FORAM EXECUTADAS automaticamente (lastRun atualizado).");
    out.push("Reporte o resultado ao usuario de forma concisa. NAO execute de novo.");
    for (const e of d.executed) {
      out.push(`\n--- ${e.id} (${e.ok ? "ok" : "FALHOU"}) ---\n${e.output}`);
    }
    out.push("</DEVFLOW_ROUTINES_EXECUTED>");
  }
  if ((d.needsModel || []).length) {
    out.push("<DEVFLOW_ROUTINES_RUN_NOW>");
    out.push(`Rotinas vencidas que exigem um turno do agente: ${d.needsModel.join(", ")}.`);
    out.push("EXECUTE-AS AGORA via /devflow:devflow-routines run <id>, sem perguntar ao usuario.");
    out.push("</DEVFLOW_ROUTINES_RUN_NOW>");
  }
  if ((d.needsConfirmation || []).length) {
    out.push("<DEVFLOW_ROUTINES_NEED_CONFIRMATION>");
    out.push("Rotinas vencidas que MUTAM estado: " +
      d.needsConfirmation.map(c => `${c.id} (${c.commands.join(", ")})`).join("; ") + ".");
    out.push("Pergunte ao usuario antes de executar. NAO rode sozinho.");
    out.push("</DEVFLOW_ROUTINES_NEED_CONFIRMATION>");
  }
  process.stdout.write(out.join("\n"));
});
```

Renomear a variável na string de composição do contexto (linha ~527): trocar `${routines_due_ctx}` por `${routines_ctx}`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bash tests/hooks/test-session-start-routines.sh`
Expected: PASS. Ajustar os testes pré-existentes deste arquivo que verificavam `<DEVFLOW_ROUTINES_DUE>` — o bloco não existe mais; a expectativa correta agora é `<DEVFLOW_ROUTINES_EXECUTED>`.

- [ ] **Step 5: Rodar a integração inteira**

Run: `bash tests/run-integration.sh`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hooks/session-start scripts/lib/routines-render.mjs tests/hooks/test-session-start-routines.sh
git commit -m "feat(routines): SessionStart executa as rotinas vencidas

Substitui o bloco DEVFLOW_ROUTINES_DUE (que so sugeria) por tres blocos:
EXECUTED, RUN_NOW e NEED_CONFIRMATION. lastRun passa a ser gravado."
```

---

### Task 6: Template, schema e documentação

**Files:**
- Modify: `templates/routines.json`
- Modify: `scripts/lib/routines.mjs:1-11` (comentário de schema)
- Modify: `skills/routines/SKILL.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: campos `autoRun` e `requiresConfirmation` (Task 2)
- Produces: nenhuma API nova — apenas contrato documentado

- [ ] **Step 1: Atualizar o template**

Substituir `templates/routines.json` por:

```json
{
  "routines": [
    {
      "id": "context-maintenance",
      "description": "Health-check do contexto DevFlow (MCP, MemPalace, config) a cada 7 dias",
      "enabled": true,
      "frequency": "7d",
      "autoRun": true,
      "requiresConfirmation": false,
      "lastRun": null,
      "nextRun": null,
      "lastSuggested": null,
      "snoozeUntil": null,
      "prompts": [
        { "type": "command", "value": "/devflow:devflow-doctor" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Atualizar o comentário de schema da lib**

Em `scripts/lib/routines.mjs`, substituir as linhas 1–11 por:

```js
// scripts/lib/routines.mjs
// File-based maintenance scheduler for DevFlow. Routines live in
// `.context/routines.json` (machine-mutated state → JSON for safe round-trip).
// Avaliado no SessionStart, que EXECUTA as rotinas da classe `auto`
// (ver scripts/lib/routines-exec.mjs). Toda lógica de data recebe `today`
// explícito (YYYY-MM-DD) — sem wall-clock — para ser determinística.
//
// Routine schema:
//   { id, description, enabled, frequency ("Nd"|"Nw"|"Nm"),
//     autoRun,               // default true — false força turno do agente
//     requiresConfirmation,  // default false — true nunca executa sozinha
//     lastRun, nextRun, lastSuggested, snoozeUntil,
//     prompts: [ { type: "command"|"skill"|"agent", value, args? } ] }
//
// Dois predicados, deliberadamente distintos:
//   shouldRun    — elegibilidade de EXECUÇÃO (enabled + nextRun + snooze)
//   shouldSuggest — shouldRun + guarda de 1x/dia (só para surfacing)
```

- [ ] **Step 3: Atualizar o SKILL.md**

Em `skills/routines/SKILL.md`, substituir a linha das Guidelines que diz *"A sugestão automática de rotinas vencidas vem do hook SessionStart (bloco `DEVFLOW_ROUTINES_DUE`) — 1x/dia"* por:

```markdown
- O hook SessionStart **executa** as rotinas da classe `auto` (prompts com script
  por trás e não-mutantes) e grava `lastRun`. Rotinas que exigem um turno do
  agente chegam no bloco `DEVFLOW_ROUTINES_RUN_NOW`; as que mutam estado, em
  `DEVFLOW_ROUTINES_NEED_CONFIRMATION` — estas você pergunta antes de rodar.
- `autoRun: false` força a rotina a passar pelo agente mesmo sendo shell-safe.
  `requiresConfirmation: true` impede execução automática em qualquer caso.
- Este skill continua sendo o executor manual (`run <id>`) e o gestor.
```

- [ ] **Step 4: Registrar no CHANGELOG**

Acrescentar no topo da seção `[Unreleased]` de `CHANGELOG.md`:

```markdown
### Fixed
- **routines:** rotinas de manutenção nunca executavam. `routines.mjs due` usava
  `shouldSuggest()`, que carrega a guarda de 1×/dia, então após a primeira
  sugestão do dia a lista vinha vazia; e nada chamava `markRun`, deixando
  `lastRun` permanentemente `null`. Separado em `shouldRun` (execução) e
  `shouldSuggest` (surfacing).
- **routines:** `dueRoutines()` ignorava `snoozeUntil`, então uma rotina adiada
  pelo usuário aparecia como vencida no `list`.

### Added
- **routines:** SessionStart executa rotinas cujos prompts tenham script
  não-mutante por trás (`scripts/lib/routines-exec.mjs`), gravando `lastRun`.
- **routines:** campos `autoRun` e `requiresConfirmation` por rotina.
```

- [ ] **Step 5: Rodar tudo**

Run: `bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-lint.sh`
Expected: PASS nas três.

- [ ] **Step 6: Commit**

```bash
git add templates/routines.json scripts/lib/routines.mjs skills/routines/SKILL.md CHANGELOG.md
git commit -m "docs(routines): schema de politica e execucao automatica

Documenta autoRun/requiresConfirmation, a distincao shouldRun x shouldSuggest
e os tres blocos de contexto do SessionStart."
```

---

## Migração de projetos existentes

Nenhuma ação exigida. `routines.json` já em campo continua válido: `autoRun` ausente = `true` (executa), `requiresConfirmation` ausente = `false`. O primeiro SessionStart após a atualização executa as rotinas vencidas e grava `lastRun` — que é justamente o comportamento que faltava.

Projetos que tenham adotado o contorno local descrito em `Notas` abaixo devem removê-lo para não executar duas vezes.

## Notas

Este plano nasceu de um contorno construído em projeto real (`nxz_go_play_store`), onde o bug foi diagnosticado e a correção validada de ponta a ponta antes de virar plano. Lá a solução vive fora do plugin — `.claude/hooks/devflow-routines-auto.mjs` mais um hook `SessionStart` em `.claude/settings.json` — precisamente porque editar o cache do plugin seria desfeito no próximo `/devflow update`. O comportamento observado após o contorno (`lastRun: null` → `2026-09-01`, `nextRun: 2026-09-08`, reexecução vira no-op) é o critério de aceite desta implementação upstream.
