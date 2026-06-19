# AO Bridge — Plano 3: Fluxo da fase E (orquestração real do AO)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o DevFlow **realmente despachar o AO** na fase E autônoma: quando a heurística aprova, executar as stories em ondas paralelas (workers do AO, cada um rodando `/devflow scale:SMALL`), coletar os PRs, e seguir para V/C global — com fallback para o `autonomous-loop` sequencial quando o AO não está disponível.

**Architecture:** Uma lib pura `orchestrator-dispatch.mjs` (normalização de stories, sanitização, leitura de cap, contagem de independentes) consumida por uma nova ramificação **modo paralelo** no skill `autonomous-loop`. A lib é testável; o skill carrega as instruções de I/O (gerar templates, `ao start`, `ao batch-spawn`, polling, marcar `done`). O modo paralelo só ativa via a heurística do Plano 2; senão, o loop sequencial atual roda intacto.

**Tech Stack:** Node ESM (`.mjs`), `node --test`. Skill em Markdown. Consome as libs dos Planos 1-2 (`orchestrator-config`, `orchestrator-waves`, `orchestrator-templates`).

## Global Constraints

- Idioma: **pt-BR**.
- **`stories.yaml` usa `blocked_by`** (campo existente) — NÃO introduzir `depends_on` no schema; a lib normaliza `blocked_by → depends_on` para as libs de ondas.
- **Merge nunca automático** — o C global mergeia (decisão DevFlow/humano); o AO nunca mergeia.
- **Fallback obrigatório:** AO indisponível (não instalado / não user-scope / `ao start` falha) → degrada para o `autonomous-loop` sequencial, com aviso. Nunca falhar a fase E por causa do AO.
- **Validação de integração holística:** V global roda no código integrado, não em worktrees isolados.
- Bindings do review do P2: `maxWaveWidth` (config) → arg `maxWidth` de `readyStories`; `sanitizeProjectId` antes de gerar o YAML.
- Libs em `scripts/lib/*.mjs`; testes em `tests/orchestrator/*.test.mjs`; rodar com `node --test tests/orchestrator/*.test.mjs` (glob).
- Worker isolado: cada `ao spawn` roda `/devflow scale:SMALL <descrição da story>`; guardrails via `.ao-rules`.

---

## File Structure

- Create: `scripts/lib/orchestrator-dispatch.mjs` — `normalizeStories()`, `sanitizeProjectId()`, `maxWidthFrom()`, `independentCount()`.
- Create: `tests/orchestrator/orchestrator-dispatch.test.mjs`
- Modify: `skills/autonomous-loop/SKILL.md` — ramificação "modo paralelo (AO)" + fallback.
- Modify: `commands/devflow.md` — flags `--parallel` / `--no-parallel`.
- Modify: `CHANGELOG.md`

---

### Task 1: Lib `orchestrator-dispatch.mjs` — normalização e bindings

**Files:**
- Create: `scripts/lib/orchestrator-dispatch.mjs`
- Test: `tests/orchestrator/orchestrator-dispatch.test.mjs`

**Interfaces:**
- Consumes: `computeWaves` de `orchestrator-waves.mjs` (Plano 2).
- Produces:
  - `normalizeStories(stories): {..., depends_on: string[]}[]` — mapeia `blocked_by → depends_on` (preserva `depends_on` se já existir).
  - `sanitizeProjectId(name): string` — kebab seguro para chave YAML/sessão.
  - `maxWidthFrom(config): number` — `config.orchestrator.maxWaveWidth` ou `Infinity`.
  - `independentCount(stories): number` — tamanho da primeira onda (stories sem deps).

- [ ] **Step 1: Escrever o teste que falha**

```js
// Run: node --test tests/orchestrator/orchestrator-dispatch.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeStories, sanitizeProjectId, maxWidthFrom, independentCount } from "../../scripts/lib/orchestrator-dispatch.mjs";

describe("normalizeStories", () => {
  it("mapeia blocked_by → depends_on", () => {
    const n = normalizeStories([{ id: "a" }, { id: "b", blocked_by: ["a"] }]);
    assert.deepEqual(n[0].depends_on, []);
    assert.deepEqual(n[1].depends_on, ["a"]);
  });
  it("preserva depends_on se já presente", () => {
    const n = normalizeStories([{ id: "b", depends_on: ["x"], blocked_by: ["y"] }]);
    assert.deepEqual(n[0].depends_on, ["x"]);
  });
  it("entrada vazia → []", () => {
    assert.deepEqual(normalizeStories(), []);
  });
});

describe("sanitizeProjectId", () => {
  it("kebab seguro", () => {
    assert.equal(sanitizeProjectId("Meu App 2"), "meu-app-2");
    assert.equal(sanitizeProjectId("já/com:coisas!"), "j-com-coisas");
  });
  it("vazio → fallback", () => {
    assert.equal(sanitizeProjectId(""), "projeto");
    assert.equal(sanitizeProjectId(null), "projeto");
  });
});

describe("maxWidthFrom", () => {
  it("lê do config", () => {
    assert.equal(maxWidthFrom({ orchestrator: { maxWaveWidth: 3 } }), 3);
  });
  it("ausente/zero → Infinity", () => {
    assert.equal(maxWidthFrom({}), Infinity);
    assert.equal(maxWidthFrom({ orchestrator: { maxWaveWidth: 0 } }), Infinity);
  });
});

describe("independentCount", () => {
  it("conta a primeira onda (sem deps)", () => {
    assert.equal(independentCount([{ id: "a" }, { id: "b" }, { id: "c", blocked_by: ["a"] }]), 2);
  });
  it("vazio → 0", () => {
    assert.equal(independentCount([]), 0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/orchestrator/orchestrator-dispatch.test.mjs`
Expected: FAIL — `Cannot find module '.../orchestrator-dispatch.mjs'`

- [ ] **Step 3: Implementar**

```js
// scripts/lib/orchestrator-dispatch.mjs
// Helpers puros para o despacho paralelo via AO. Consome a lib de ondas.
import { computeWaves } from "./orchestrator-waves.mjs";

/** Normaliza stories do stories.yaml para o formato das libs de ondas (blocked_by → depends_on). */
export function normalizeStories(stories) {
  return (stories || []).map((s) => ({
    ...s,
    depends_on: s.depends_on || s.blocked_by || [],
  }));
}

/** Sanitiza um nome para chave YAML / id de sessão (kebab seguro). */
export function sanitizeProjectId(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "projeto";
}

/** Cap de largura de onda da config; Infinity se ausente/<=0. */
export function maxWidthFrom(config) {
  const w = config && config.orchestrator && config.orchestrator.maxWaveWidth;
  return typeof w === "number" && w > 0 ? w : Infinity;
}

/** Nº de stories na primeira onda (independentes) — entrada da heurística shouldParallelize. */
export function independentCount(stories) {
  const norm = normalizeStories(stories);
  if (norm.length === 0) return 0;
  return computeWaves(norm)[0].length;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/orchestrator/orchestrator-dispatch.test.mjs`
Expected: PASS — 9 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/orchestrator-dispatch.mjs tests/orchestrator/orchestrator-dispatch.test.mjs
git commit -m "feat(orchestrator): lib de despacho — normalize/sanitize/maxWidth/independentCount"
```

---

### Task 2: Modo paralelo no `skills/autonomous-loop`

**Files:**
- Modify: `skills/autonomous-loop/SKILL.md`

**Interfaces:**
- Consumes: `shouldParallelize` (Plano 2), `readyStories`/`computeWaves` (Plano 2), `aoRulesContent`/`agentOrchestratorYaml` (Plano 2), `normalizeStories`/`sanitizeProjectId`/`maxWidthFrom`/`independentCount` (Task 1).

- [ ] **Step 1: Inserir a ramificação de gate (após "Step 1: Load Stories")**

Inserir uma nova seção `## Step 1.6: Gate de Execução Paralela (AO)`:

````markdown
## Step 1.6: Gate de Execução Paralela (AO)

Antes da seleção story-by-story, decidir se a fase E roda em **paralelo via AO** ou **sequencial** (loop atual). Procedimento (o agente executa, lendo os arquivos e chamando as libs):

1. **Disponibilidade do AO** (`AO_OK`): `command -v ao` resolve **E** o plugin está em user-scope. Reusar o comando de detecção do Step 0.6 do `project-init` (`parsePluginUserScope` sobre `claude plugin list` para `devflow@NEXUZ-SYS` e `superpowers@`). Qualquer falha → `AO_OK=false`.
2. Ler `.context/.devflow.yaml` (seção `orchestrator`) e `.context/workflow/stories.yaml` (stories com `id` + `blocked_by`).
3. **Nº de independentes** (`N`): passar as stories como JSON e computar —
   ```bash
   node -e "import('$CLAUDE_PLUGIN_ROOT/scripts/lib/orchestrator-dispatch.mjs').then(m=>process.stdout.write(String(m.independentCount($STORIES_JSON))))"
   ```
   onde `$STORIES_JSON` é o array `[{id, blocked_by}]` extraído do stories.yaml.
4. **Decisão** —
   ```bash
   node -e "import('$CLAUDE_PLUGIN_ROOT/scripts/lib/orchestrator-config.mjs').then(m=>process.stdout.write(m.shouldParallelize({config:$CFG_JSON, scale:'$SCALE', independentCount:$N, aoAvailable:$AO_OK}).decision))"
   ```
   onde `$CFG_JSON` é `{orchestrator: {...}}` extraído do `.devflow.yaml`, `$SCALE` é a escala do workflow, `$N` é o passo 3, `$AO_OK` é o passo 1.

- Override por flag: `--parallel` força `parallel`; `--no-parallel` força `sequential` (ganha do `.devflow.yaml`).
- `decision: "sequential"` → seguir o loop atual (Steps 2-4). FIM deste step.
- `decision: "ask"` → perguntar ao operador (AskUserQuestion: "N stories independentes em <escala> — paralelizar via AO (N workers) ou sequencial?"). Resposta decide.
- `decision: "parallel"` → ir para o Step 1.7 (modo paralelo).
- **Fallback:** se `AO_OK=0` em qualquer ponto, forçar `sequential` com aviso ("AO indisponível — rodando sequencial; para paralelizar, instale o plugin em --scope user").
````

- [ ] **Step 2: Inserir o modo paralelo (`## Step 1.7: Execução em Ondas via AO`)**

````markdown
## Step 1.7: Execução em Ondas via AO (quando decision = parallel)

**Setup (uma vez):**
1. Gerar `.ao-rules` no repo do projeto via `aoRulesContent()`.
2. Gerar `agent-orchestrator.yaml` (num dir de controle) via `agentOrchestratorYaml({ projectId: sanitizeProjectId(nome), repo, path, port, sessionPrefix })`.
3. `cd <dir-controle> && ao start <projectId>` (sobe dashboard + supervisor). Se falhar → **fallback sequencial**.

**Loop de ondas (pipeline):**
1. Carregar stories de `.context/workflow/stories.yaml`; `norm = normalizeStories(stories)`; `maxW = maxWidthFrom(config)`.
2. `done` = ids com `status: completed`; `inFlight` = ids com `status: in_progress` (sessão viva).
3. `prontas = readyStories(norm, done, inFlight, maxW)`. Se vazio e nada in-flight e nem tudo done → erro de DAG (ciclo) → escalar.
4. Para cada id em `prontas`: marcar `status: in_progress` em stories.yaml; `ao spawn <id> --prompt "/devflow scale:SMALL <story.title + acceptance>"` (cada worker roda DevFlow-mini com TDD; guardrails via `.ao-rules`).
5. Polling: `curl -s localhost:<port>/api/sessions` (ou `ao status`) → quando a sessão de uma story abre PR, marcar a story `status: completed` (+ guardar a URL do PR). Reactions ci-failed/changes-requested ficam OFF no P3 (Plano 4 as ativa) — falha de worker → marcar `failed` e aplicar retry/escalonamento do loop atual.
6. Repetir 3-5 até `done.length === stories.length`. Pipeline: novas stories liberam assim que suas deps terminam (não espera a onda inteira).

**Encerramento:**
- Coletados todos os PRs → seguir para **V global** (fase Validation, no código integrado) e **C global** (fase Confirmation, merge ordenado pelo DAG via `computeWaves(norm)`, sem auto-merge).
- `ao stop` ao final.
````

- [ ] **Step 3: Verificar inserção**

Run: `grep -nE "Step 1.6|Step 1.7|fallback sequencial|readyStories" skills/autonomous-loop/SKILL.md`
Expected: linhas das duas seções + menção a fallback e readyStories.

- [ ] **Step 4: Commit**

```bash
git add skills/autonomous-loop/SKILL.md
git commit -m "feat(autonomous-loop): modo paralelo via AO (ondas + fallback sequencial)"
```

---

### Task 3: Flags `--parallel`/`--no-parallel` + CHANGELOG

**Files:**
- Modify: `commands/devflow.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Documentar as flags no help do comando**

Em `commands/devflow.md`, na seção AUTONOMY do help e na tabela de argumentos, adicionar:

```markdown
  /devflow auto <d> --parallel      Força execução em ondas via AO (se disponível)
  /devflow auto <d> --no-parallel   Força execução sequencial (ignora orchestrator)
```

E uma linha em "Arguments": `--parallel` / `--no-parallel` — override pontual do gatilho do orchestrator (ganha do `.devflow.yaml`).

- [ ] **Step 2: Verificar**

Run: `grep -nE "\-\-parallel|\-\-no-parallel" commands/devflow.md`
Expected: as linhas adicionadas.

- [ ] **Step 3: CHANGELOG**

Adicionar entrada sob `## [Unreleased]`: fase E ganha modo paralelo via AO (ondas com pipeline, gate por heurística, fallback sequencial, flags `--parallel`/`--no-parallel`); merge permanece manual. Notar que reactions (auto-fix) virão no Plano 4.

- [ ] **Step 4: Verificação final + commit**

Run: `node --test tests/orchestrator/*.test.mjs`
Expected: PASS — 35 testes (config 13 + waves 9 + templates 4 + dispatch 9).

```bash
git add commands/devflow.md CHANGELOG.md
git commit -m "feat(devflow): flags --parallel/--no-parallel + changelog do modo paralelo (Plano 3)"
```

---

## Self-Review

**1. Spec coverage (vs §5/§7 do spec):** despacho por ondas ✓ (Task 2), heurística/gate ✓ (Task 2 Step 1, consome Plano 2), polling/coleta de PRs ✓ (Task 2 Step 2), V/C global ✓ (encerramento, delega às fases), fallback ✓ (Task 2), flags ✓ (Task 3), `blocked_by`→`depends_on` ✓ (Task 1). Reactions (auto-fix) → **Plano 4** (explicitamente OFF aqui).

**2. Placeholder scan:** Task 1 tem código completo. Os snippets bash da Task 2 contêm comentários `/* ... */` em UM ponto (montagem do comando de decisão) — o implementer deve completá-lo com o carregamento de config+stories; sinalizado como o único ponto que exige composição, não transcrição. **Ação para o implementer:** completar esse snippet lendo `.devflow.yaml` (YAML→objeto) e `stories.yaml`, chamando `independentCount` e `shouldParallelize`.

**3. Type consistency:** `normalizeStories`/`sanitizeProjectId`/`maxWidthFrom`/`independentCount` coerentes entre lib, testes e uso no skill. Consome `readyStories(norm, done, inFlight, maxW)` com a assinatura exata do Plano 2.

**Nota de fronteira:** a Task 2 é majoritariamente instrução de skill (I/O), verificável por `grep`, não por unit test — a parte testável (Task 1) é a lib pura. O merge e o V/C global delegam às fases existentes (prevc-validation/confirmation), preservando os gates e guardrails.
