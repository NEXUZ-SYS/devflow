# AO Bridge — Plano 2: Lib de ondas + heurística + templates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as peças puras e testáveis que o Plano 3 vai orquestrar: cálculo de ondas a partir do DAG de stories (com pipeline e cap de largura), a heurística de ativação do AO, e os geradores de template (`.ao-rules` e `agent-orchestrator.yaml`).

**Architecture:** Três libs puras ESM em `scripts/lib/`, cada uma com uma responsabilidade: `orchestrator-waves.mjs` (DAG → ondas + pipeline), `orchestrator-config.mjs` (estendida com a heurística `shouldParallelize`), `orchestrator-templates.mjs` (geradores de string). Nenhuma faz I/O nem executa o AO — tudo é função pura testável com `node --test`. O Plano 3 consome essas funções.

**Tech Stack:** Node ESM (`.mjs`), `node --test` + `node:assert/strict`. Sem dependências externas.

## Global Constraints

- Idioma de comentários/strings: **pt-BR** (termos técnicos mantidos).
- Funções **puras** (sem I/O, sem efeitos colaterais, determinísticas).
- Ciclo no DAG é **erro** (lançar), nunca silenciar.
- `maxWaveWidth` limita workers simultâneos; **pipeline** (libera story quando suas deps terminam), não barreira por nível.
- Template `agent-orchestrator.yaml`: `permissions: permissionless`, `approved-and-green.auto: false` **sempre** (merge nunca automático). `ci-failed`/`changes-requested` ficam `auto: false` neste plano — o **Plano 4** os ativará ao implementar o loop de reactions.
- `.ao-rules` deve conter os guardrails de git (nunca push/merge na main, sem `--force`) + "conduza via `/devflow scale:SMALL`".
- Libs em `scripts/lib/*.mjs`; testes em `tests/orchestrator/*.test.mjs`; rodar com `node --test <arquivo>`.
- Commits frequentes; mudanças tocam só `scripts/lib/` e `tests/` (NÃO disparam auto-bump de versão).

---

## File Structure

- Create: `scripts/lib/orchestrator-waves.mjs` — `computeWaves()`, `readyStories()`.
- Modify: `scripts/lib/orchestrator-config.mjs` — adiciona `shouldParallelize()`.
- Create: `scripts/lib/orchestrator-templates.mjs` — `aoRulesContent()`, `agentOrchestratorYaml()`.
- Create: `tests/orchestrator/orchestrator-waves.test.mjs`
- Modify: `tests/orchestrator/orchestrator-config.test.mjs` — testes de `shouldParallelize`.
- Create: `tests/orchestrator/orchestrator-templates.test.mjs`
- Modify: `CHANGELOG.md`

---

### Task 1: `computeWaves()` — DAG → ondas por nível (+ detecção de ciclo)

**Files:**
- Create: `scripts/lib/orchestrator-waves.mjs`
- Test: `tests/orchestrator/orchestrator-waves.test.mjs`

**Interfaces:**
- Produces: `computeWaves(stories: {id, depends_on?: string[]}[]): string[][]` — ondas por nível topológico (onda 0 = sem deps; onda N = deps satisfeitas por ondas anteriores). Lança `Error` se houver ciclo. Deps apontando para ids inexistentes são ignoradas.

- [ ] **Step 1: Escrever o teste que falha**

```js
// Run: node --test tests/orchestrator/orchestrator-waves.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeWaves } from "../../scripts/lib/orchestrator-waves.mjs";

describe("computeWaves", () => {
  it("tudo independente → uma única onda", () => {
    const w = computeWaves([{ id: "a" }, { id: "b" }, { id: "c" }]);
    assert.deepEqual(w, [["a", "b", "c"]]);
  });
  it("cadeia linear → uma onda por nível", () => {
    const w = computeWaves([
      { id: "a" },
      { id: "b", depends_on: ["a"] },
      { id: "c", depends_on: ["b"] },
    ]);
    assert.deepEqual(w, [["a"], ["b"], ["c"]]);
  });
  it("diamante → níveis corretos", () => {
    const w = computeWaves([
      { id: "a" },
      { id: "b", depends_on: ["a"] },
      { id: "c", depends_on: ["a"] },
      { id: "d", depends_on: ["b", "c"] },
    ]);
    assert.deepEqual(w, [["a"], ["b", "c"], ["d"]]);
  });
  it("ignora deps para ids inexistentes", () => {
    const w = computeWaves([{ id: "a", depends_on: ["x"] }]);
    assert.deepEqual(w, [["a"]]);
  });
  it("lança em ciclo", () => {
    assert.throws(
      () => computeWaves([{ id: "a", depends_on: ["b"] }, { id: "b", depends_on: ["a"] }]),
      /[Cc]iclo/
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/orchestrator/orchestrator-waves.test.mjs`
Expected: FAIL — `Cannot find module '.../orchestrator-waves.mjs'`

- [ ] **Step 3: Implementar**

```js
// scripts/lib/orchestrator-waves.mjs
// Cálculo de ondas (waves) a partir do DAG de dependências entre stories.
// Puro e determinístico — sem I/O.

/** Deps de uma story, filtradas para ids que existem no conjunto. */
function realDeps(story, ids) {
  return (story.depends_on || []).filter((d) => ids.has(d));
}

/**
 * Agrupa stories em ondas por nível topológico.
 * Onda 0 = sem dependências; onda N = todas as deps em ondas anteriores.
 * Lança Error se houver ciclo. Deps para ids inexistentes são ignoradas.
 */
export function computeWaves(stories) {
  const ids = new Set(stories.map((s) => s.id));
  const waves = [];
  const done = new Set();
  while (done.size < stories.length) {
    const wave = stories
      .filter((s) => !done.has(s.id) && realDeps(s, ids).every((d) => done.has(d)))
      .map((s) => s.id);
    if (wave.length === 0) {
      const restantes = stories.filter((s) => !done.has(s.id)).map((s) => s.id);
      throw new Error(`Ciclo de dependências detectado entre: ${restantes.join(", ")}`);
    }
    waves.push(wave);
    wave.forEach((id) => done.add(id));
  }
  return waves;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/orchestrator/orchestrator-waves.test.mjs`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/orchestrator-waves.mjs tests/orchestrator/orchestrator-waves.test.mjs
git commit -m "feat(orchestrator): computeWaves — DAG de stories em ondas topológicas"
```

---

### Task 2: `readyStories()` — pipeline + cap de largura

**Files:**
- Modify: `scripts/lib/orchestrator-waves.mjs`
- Test: `tests/orchestrator/orchestrator-waves.test.mjs`

**Interfaces:**
- Consumes: `realDeps` (mesmo módulo).
- Produces: `readyStories(stories, doneIds: string[], inFlightIds: string[], maxWidth = Infinity): string[]` — ids prontos para despachar AGORA: deps todas em `doneIds`, ainda não feitos nem em voo, respeitando os slots livres (`maxWidth - inFlight`). É o pipeline real (libera story assim que suas deps terminam, sem esperar a onda inteira).

- [ ] **Step 1: Escrever o teste que falha**

```js
// adicionar ao tests/orchestrator/orchestrator-waves.test.mjs
import { readyStories } from "../../scripts/lib/orchestrator-waves.mjs";

describe("readyStories", () => {
  const stories = [
    { id: "a" },
    { id: "b", depends_on: ["a"] },
    { id: "c", depends_on: ["a"] },
    { id: "d", depends_on: ["b", "c"] },
  ];
  it("início: só os sem deps", () => {
    assert.deepEqual(readyStories(stories, [], []), ["a"]);
  });
  it("após 'a' pronto: libera b e c (pipeline)", () => {
    assert.deepEqual(readyStories(stories, ["a"], []), ["b", "c"]);
  });
  it("respeita maxWidth e in-flight", () => {
    assert.deepEqual(readyStories(stories, ["a"], ["b"], 2), ["c"]);
    assert.deepEqual(readyStories(stories, ["a"], ["b", "c"], 2), []);
  });
  it("d só quando b e c terminam", () => {
    assert.deepEqual(readyStories(stories, ["a", "b"], []), ["c"]);
    assert.deepEqual(readyStories(stories, ["a", "b", "c"], []), ["d"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/orchestrator/orchestrator-waves.test.mjs`
Expected: FAIL — `readyStories is not a function`.

- [ ] **Step 3: Implementar**

```js
// adicionar a scripts/lib/orchestrator-waves.mjs

/**
 * Stories prontas para despachar agora (pipeline + cap de largura).
 * Pronta = não feita, não em voo, e todas as deps reais em doneIds.
 * Limita ao número de slots livres (maxWidth - inFlight).
 */
export function readyStories(stories, doneIds, inFlightIds, maxWidth = Infinity) {
  const ids = new Set(stories.map((s) => s.id));
  const done = new Set(doneIds);
  const inFlight = new Set(inFlightIds);
  const slots = maxWidth - inFlight.size;
  if (slots <= 0) return [];
  const ready = stories
    .filter(
      (s) =>
        !done.has(s.id) &&
        !inFlight.has(s.id) &&
        realDeps(s, ids).every((d) => done.has(d))
    )
    .map((s) => s.id);
  return ready.slice(0, slots);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/orchestrator/orchestrator-waves.test.mjs`
Expected: PASS — 9 testes (5 + 4).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/orchestrator-waves.mjs tests/orchestrator/orchestrator-waves.test.mjs
git commit -m "feat(orchestrator): readyStories — pipeline de despacho com cap de largura"
```

---

### Task 3: `shouldParallelize()` — heurística de ativação

**Files:**
- Modify: `scripts/lib/orchestrator-config.mjs`
- Test: `tests/orchestrator/orchestrator-config.test.mjs`

**Interfaces:**
- Produces: `shouldParallelize({ config, scale, independentCount, aoAvailable }): { decision: "parallel" | "sequential" | "ask", reason: string }` — decide o caminho na fase E. `config` é o objeto `.devflow.yaml` parseado (lê `config.orchestrator`). `decision: "ask"` quando `mode: suggest` e os critérios batem (o caller pergunta ao humano).

- [ ] **Step 1: Escrever o teste que falha**

```js
// adicionar ao tests/orchestrator/orchestrator-config.test.mjs
import { shouldParallelize } from "../../scripts/lib/orchestrator-config.mjs";

describe("shouldParallelize", () => {
  const base = { orchestrator: { enabled: true, mode: "suggest", trigger: { scales: ["LARGE"], minIndependentStories: 3 } } };
  it("sequential quando orchestrator ausente/disabled", () => {
    assert.equal(shouldParallelize({ config: {}, scale: "LARGE", independentCount: 5, aoAvailable: true }).decision, "sequential");
    assert.equal(shouldParallelize({ config: { orchestrator: { enabled: false } }, scale: "LARGE", independentCount: 5, aoAvailable: true }).decision, "sequential");
  });
  it("sequential quando AO indisponível (fallback)", () => {
    assert.equal(shouldParallelize({ config: base, scale: "LARGE", independentCount: 5, aoAvailable: false }).decision, "sequential");
  });
  it("sequential quando escala fora de trigger.scales", () => {
    assert.equal(shouldParallelize({ config: base, scale: "MEDIUM", independentCount: 5, aoAvailable: true }).decision, "sequential");
  });
  it("sequential quando independentes < min", () => {
    assert.equal(shouldParallelize({ config: base, scale: "LARGE", independentCount: 2, aoAvailable: true }).decision, "sequential");
  });
  it("ask quando mode=suggest e critérios batem", () => {
    assert.equal(shouldParallelize({ config: base, scale: "LARGE", independentCount: 4, aoAvailable: true }).decision, "ask");
  });
  it("parallel quando mode=auto e critérios batem", () => {
    const cfg = { orchestrator: { ...base.orchestrator, mode: "auto" } };
    assert.equal(shouldParallelize({ config: cfg, scale: "LARGE", independentCount: 4, aoAvailable: true }).decision, "parallel");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/orchestrator/orchestrator-config.test.mjs`
Expected: FAIL — `shouldParallelize is not a function`.

- [ ] **Step 3: Implementar**

```js
// adicionar a scripts/lib/orchestrator-config.mjs

/**
 * Heurística de ativação do AO na fase E.
 * Retorna { decision, reason }: "sequential" (fallback/desligado/fora de critério),
 * "ask" (mode=suggest e critérios batem → caller pergunta) ou "parallel" (mode=auto).
 */
export function shouldParallelize({ config, scale, independentCount, aoAvailable }) {
  const o = config && config.orchestrator;
  if (!o || o.enabled === false) return { decision: "sequential", reason: "orchestrator desabilitado" };
  if (!aoAvailable) return { decision: "sequential", reason: "AO indisponível (fallback sequencial)" };
  const scales = (o.trigger && o.trigger.scales) || ["LARGE"];
  if (!scales.includes(scale)) return { decision: "sequential", reason: `escala ${scale} fora de [${scales.join(", ")}]` };
  const min = (o.trigger && o.trigger.minIndependentStories) ?? 3;
  if (independentCount < min) return { decision: "sequential", reason: `${independentCount} stories independentes < mínimo ${min}` };
  if (o.mode === "auto") return { decision: "parallel", reason: "mode=auto e critérios atendidos" };
  return { decision: "ask", reason: "mode=suggest e critérios atendidos — confirmar com o operador" };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/orchestrator/orchestrator-config.test.mjs`
Expected: PASS — 13 testes (7 do Plano 1 + 6 desta task).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/orchestrator-config.mjs tests/orchestrator/orchestrator-config.test.mjs
git commit -m "feat(orchestrator): shouldParallelize — heurística de ativação da fase E"
```

---

### Task 4: Templates — `aoRulesContent()` + `agentOrchestratorYaml()`

**Files:**
- Create: `scripts/lib/orchestrator-templates.mjs`
- Test: `tests/orchestrator/orchestrator-templates.test.mjs`

**Interfaces:**
- Produces:
  - `aoRulesContent(): string` — conteúdo do `.ao-rules` (guardrails + trilho DevFlow).
  - `agentOrchestratorYaml({ projectId, repo, path, port?, sessionPrefix? }): string` — YAML do `agent-orchestrator.yaml`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// Run: node --test tests/orchestrator/orchestrator-templates.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aoRulesContent, agentOrchestratorYaml } from "../../scripts/lib/orchestrator-templates.mjs";

describe("aoRulesContent", () => {
  it("contém guardrails de git e o trilho DevFlow", () => {
    const r = aoRulesContent();
    assert.match(r, /\/devflow scale:SMALL/);
    assert.match(r, /NUNCA.*push/i);
    assert.match(r, /NUNCA.*merge/i);
    assert.match(r, /--force/);
  });
});

describe("agentOrchestratorYaml", () => {
  const y = agentOrchestratorYaml({ projectId: "meu-app", repo: "org/meu-app", path: "/home/u/meu-app", port: 3100, sessionPrefix: "app" });
  it("permissionless + agentRulesFile", () => {
    assert.match(y, /permissions: permissionless/);
    assert.match(y, /agentRulesFile: \.ao-rules/);
  });
  it("approved-and-green NUNCA auto (merge manual)", () => {
    assert.match(y, /approved-and-green:\s*\n\s*auto: false/);
  });
  it("injeta projectId, repo, path, port", () => {
    assert.match(y, /meu-app:/);
    assert.match(y, /repo: org\/meu-app/);
    assert.match(y, /path: \/home\/u\/meu-app/);
    assert.match(y, /port: 3100/);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/orchestrator/orchestrator-templates.test.mjs`
Expected: FAIL — `Cannot find module '.../orchestrator-templates.mjs'`.

- [ ] **Step 3: Implementar**

```js
// scripts/lib/orchestrator-templates.mjs
// Geradores de template para a integração com o Agent Orchestrator (AO). Puros.

/** Conteúdo do arquivo .ao-rules (regras injetadas em todo worker do AO). */
export function aoRulesContent() {
  return `Conduza CADA tarefa pelo trilho DevFlow: comece executando /devflow scale:SMALL com a descricao da tarefa e siga TDD (RED -> GREEN -> REFACTOR).

GUARDRAILS DE GIT (inegociaveis):
- NUNCA faca push para a branch main/master.
- NUNCA faca merge de PR.
- Trabalhe apenas na branch do seu worktree; abra PR e pare.
- Nao use --force.

Idioma: pt-BR.
`;
}

/**
 * YAML do agent-orchestrator.yaml.
 * approved-and-green fica SEMPRE auto:false (merge nunca automático).
 * ci-failed/changes-requested ficam auto:false neste plano; o Plano 4 (reactions) os ativa.
 */
export function agentOrchestratorYaml({ projectId, repo, path, port = 3000, sessionPrefix = "dev" }) {
  return `$schema: https://raw.githubusercontent.com/ComposioHQ/agent-orchestrator/main/schema/config.schema.json
port: ${port}
defaults:
  runtime: tmux
  agent: claude-code
  workspace: worktree
projects:
  ${projectId}:
    repo: ${repo}
    path: ${path}
    defaultBranch: main
    sessionPrefix: ${sessionPrefix}
    agentConfig:
      permissions: permissionless
    agentRulesFile: .ao-rules
    reactions:
      ci-failed:
        auto: false
      changes-requested:
        auto: false
      approved-and-green:
        auto: false
`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/orchestrator/orchestrator-templates.test.mjs`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/orchestrator-templates.mjs tests/orchestrator/orchestrator-templates.test.mjs
git commit -m "feat(orchestrator): geradores de .ao-rules e agent-orchestrator.yaml"
```

---

### Task 5: CHANGELOG + verificação final

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Adicionar entrada sob `## [Unreleased]`**

Adicionar uma entrada `### Added` descrevendo: lib de ondas (`computeWaves`/`readyStories` com pipeline e cap), heurística `shouldParallelize`, e geradores de template (`.ao-rules`/`agent-orchestrator.yaml`, com `approved-and-green` sempre manual). Notar que são peças internas — ainda não acionadas (o Plano 3 as orquestra).

- [ ] **Step 2: Rodar a suíte completa de orchestrator**

Run: `node --test tests/orchestrator/`
Expected: PASS — 17 testes (waves 9 + config 13 inclui... na verdade config 13, templates 4, waves 9 → confira a soma na saída; todos devem passar, 0 falhas).

- [ ] **Step 3: Verificar exports**

Run: `node -e "import('./scripts/lib/orchestrator-waves.mjs').then(m=>console.log(typeof m.computeWaves, typeof m.readyStories)); import('./scripts/lib/orchestrator-templates.mjs').then(m=>console.log(typeof m.aoRulesContent, typeof m.agentOrchestratorYaml))"`
Expected: `function function` (duas linhas).

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): lib de ondas, heurística e templates do orchestrator — Plano 2"
```

---

## Self-Review

**1. Spec coverage (vs §6/§7 do spec):** DAG/pipeline ✓ (Tasks 1-2), heurística de ativação ✓ (Task 3), templates `.ao-rules`+`agent-orchestrator.yaml` com auto-merge OFF ✓ (Task 4). Fluxo da fase E (despacho/coleta/V-C) → **fora deste plano** (Plano 3). Reactions auto-fix → **Plano 4**.

**2. Placeholder scan:** sem TBD/TODO; código completo em cada step.

**3. Type consistency:** `computeWaves(stories)` e `readyStories(stories, doneIds, inFlightIds, maxWidth)` coerentes entre tasks e testes. `shouldParallelize({config, scale, independentCount, aoAvailable}) → {decision, reason}` idêntico em teste e impl. `decision` ∈ {parallel, sequential, ask} consumido pelo Plano 3. Templates: assinaturas batem.

**Nota de fronteira:** este plano só **prepara as peças** (puras). Nada despacha o AO nem lê/escreve arquivos do projeto — isso é o Plano 3.
