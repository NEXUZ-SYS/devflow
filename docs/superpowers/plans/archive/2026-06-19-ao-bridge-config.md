# AO Bridge — Plano 1: Config & Entrevista do Orquestrador

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuário declare e configure o uso do Agent Orchestrator (AO) para execução paralela, via a entrevista do `/devflow config` (com reuso no `/devflow init` Step 0.6), gravando a seção `orchestrator:` no `.context/.devflow.yaml`.

**Architecture:** Uma lib pura e testável (`scripts/lib/orchestrator-config.mjs`) concentra as duas operações determinísticas — detectar o escopo do plugin e gerar o bloco YAML da seção. Os skills `config` e `project-init` consomem essa lib (via `node`) e cuidam só da I/O (entrevista, leitura/escrita do arquivo). Nada executa o AO ainda — este plano só configura.

**Tech Stack:** Node ESM (`.mjs`), test runner nativo `node --test` + `node:assert/strict`. Sem dependências externas. Skills em Markdown.

## Global Constraints

- Idioma de todo conteúdo gerado/visível: **pt-BR** (termos técnicos mantidos).
- `mode` default da seção orchestrator: **`suggest`**. Valores válidos: `auto | suggest | off`.
- **Pré-condição bloqueante:** só gravar `orchestrator.enabled: true` se o plugin DevFlow **e** superpowers estiverem em `--scope user` (Step 0.6). Caso contrário, gravar `enabled: false` e orientar.
- Defaults do bloco: `provider: ao`, `trigger.scales: [LARGE]`, `trigger.minIndependentStories: 3`, `maxWaveWidth: 4`.
- Patch incremental: ao reconfigurar, a seção `orchestrator:` é adicionada/substituída sem tocar nas demais seções do `.devflow.yaml`.
- Libs em `scripts/lib/*.mjs` (ESM); testes em `tests/orchestrator/*.test.mjs`; rodar com `node --test <arquivo>`.
- Commits frequentes; mudanças em `skills/` disparam auto-bump de versão (esperado).

---

## File Structure

- Create: `scripts/lib/orchestrator-config.mjs` — funções puras: `parsePluginUserScope()`, `orchestratorBlock()`.
- Create: `tests/orchestrator/orchestrator-config.test.mjs` — testes das funções puras.
- Modify: `skills/config/SKILL.md` — nova pergunta da entrevista + geração da seção + patch incremental.
- Modify: `skills/project-init/SKILL.md` — Step 0.6 reusa a lib (oferece configurar orchestrator após validar escopo).
- Modify: `CHANGELOG.md` — entrada da feature.

---

### Task 1: Lib — `parsePluginUserScope()`

**Files:**
- Create: `scripts/lib/orchestrator-config.mjs`
- Test: `tests/orchestrator/orchestrator-config.test.mjs`

**Interfaces:**
- Produces: `parsePluginUserScope(output: string, pluginName: string): boolean` — `true` se a saída de `claude plugin list` contém pelo menos uma entrada de `pluginName` com `Scope: user`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// Run: node --test tests/orchestrator/orchestrator-config.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePluginUserScope } from "../../scripts/lib/orchestrator-config.mjs";

describe("parsePluginUserScope", () => {
  it("false quando só há project-scope", () => {
    const out = "  ❯ devflow@NEXUZ-SYS\n    Scope: project\n    Status: ✔ enabled\n";
    assert.equal(parsePluginUserScope(out, "devflow@NEXUZ-SYS"), false);
  });
  it("true quando há uma entrada user-scope (após várias project)", () => {
    const out =
      "  ❯ devflow@NEXUZ-SYS\n    Scope: project\n" +
      "  ❯ devflow@NEXUZ-SYS\n    Scope: user\n    Status: ✔ enabled\n";
    assert.equal(parsePluginUserScope(out, "devflow@NEXUZ-SYS"), true);
  });
  it("true quando só há user-scope", () => {
    const out = "  ❯ superpowers@claude-plugins-official\n    Scope: user\n";
    assert.equal(parsePluginUserScope(out, "superpowers@"), true);
  });
  it("false para saída vazia ou plugin ausente", () => {
    assert.equal(parsePluginUserScope("", "devflow@NEXUZ-SYS"), false);
    assert.equal(parsePluginUserScope("  ❯ outro@x\n    Scope: user\n", "devflow@NEXUZ-SYS"), false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/orchestrator/orchestrator-config.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/orchestrator-config.mjs'`

- [ ] **Step 3: Implementar a função mínima**

```js
// scripts/lib/orchestrator-config.mjs
// Funções puras para configurar a integração com o Agent Orchestrator (AO).

/**
 * Detecta se `claude plugin list` reporta o plugin em --scope user.
 * Aceita múltiplas entradas (o mesmo plugin pode aparecer em vários escopos).
 */
export function parsePluginUserScope(output, pluginName) {
  if (!output || !pluginName) return false;
  let inPlugin = false;
  for (const line of output.split("\n")) {
    if (line.includes(pluginName)) { inPlugin = true; continue; }
    if (!inPlugin) continue;
    if (/Scope:\s*user/i.test(line)) return true;
    if (/Scope:\s*\S/i.test(line)) { inPlugin = false; continue; } // escopo desta entrada não é user
    if (line.includes("❯")) inPlugin = false; // próximo plugin sem ser o alvo
  }
  return false;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/orchestrator/orchestrator-config.test.mjs`
Expected: PASS — 4 testes ok.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/orchestrator-config.mjs tests/orchestrator/orchestrator-config.test.mjs
git commit -m "feat(orchestrator): parsePluginUserScope para detecção de escopo do plugin"
```

---

### Task 2: Lib — `orchestratorBlock()`

**Files:**
- Modify: `scripts/lib/orchestrator-config.mjs`
- Test: `tests/orchestrator/orchestrator-config.test.mjs`

**Interfaces:**
- Consumes: nada de Task 1 (mesmo arquivo, função independente).
- Produces: `orchestratorBlock(answers?: object): string` — string YAML da seção `orchestrator:`. `answers` aceita `{enabled, provider, mode, scales, minIndependentStories, maxWaveWidth}` com os defaults das Global Constraints. Se `enabled:false`, retorna bloco mínimo (`enabled: false`).

- [ ] **Step 1: Escrever o teste que falha**

```js
// adicionar ao tests/orchestrator/orchestrator-config.test.mjs
import { orchestratorBlock } from "../../scripts/lib/orchestrator-config.mjs";

describe("orchestratorBlock", () => {
  it("usa os defaults (mode=suggest, scales=[LARGE], width=4)", () => {
    const b = orchestratorBlock();
    assert.match(b, /^orchestrator:/m);
    assert.match(b, /enabled: true/);
    assert.match(b, /provider: ao/);
    assert.match(b, /mode: suggest/);
    assert.match(b, /scales: \[LARGE\]/);
    assert.match(b, /minIndependentStories: 3/);
    assert.match(b, /maxWaveWidth: 4/);
  });
  it("respeita overrides", () => {
    const b = orchestratorBlock({ mode: "auto", scales: ["MEDIUM", "LARGE"], maxWaveWidth: 6 });
    assert.match(b, /mode: auto/);
    assert.match(b, /scales: \[MEDIUM, LARGE\]/);
    assert.match(b, /maxWaveWidth: 6/);
  });
  it("bloco mínimo quando enabled:false", () => {
    const b = orchestratorBlock({ enabled: false });
    assert.match(b, /enabled: false/);
    assert.doesNotMatch(b, /maxWaveWidth/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/orchestrator/orchestrator-config.test.mjs`
Expected: FAIL — `orchestratorBlock is not a function` (export ausente).

- [ ] **Step 3: Implementar a função**

```js
// adicionar a scripts/lib/orchestrator-config.mjs

/** Gera a string YAML da seção `orchestrator:` do .devflow.yaml. */
export function orchestratorBlock(answers = {}) {
  const {
    enabled = true,
    provider = "ao",
    mode = "suggest",
    scales = ["LARGE"],
    minIndependentStories = 3,
    maxWaveWidth = 4,
  } = answers;
  if (!enabled) return "orchestrator:\n  enabled: false\n";
  return [
    "orchestrator:",
    "  enabled: true",
    `  provider: ${provider}`,
    `  mode: ${mode}`,
    "  trigger:",
    `    scales: [${scales.join(", ")}]`,
    `    minIndependentStories: ${minIndependentStories}`,
    `  maxWaveWidth: ${maxWaveWidth}`,
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/orchestrator/orchestrator-config.test.mjs`
Expected: PASS — 7 testes ok (4 da Task 1 + 3 desta).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/orchestrator-config.mjs tests/orchestrator/orchestrator-config.test.mjs
git commit -m "feat(orchestrator): orchestratorBlock gera a seção YAML com defaults"
```

---

### Task 3: Entrevista no `skills/config/SKILL.md`

**Files:**
- Modify: `skills/config/SKILL.md` (Step 2 — entrevista; Step 3 — geração; Step 5 — patch incremental)

**Interfaces:**
- Consumes: `parsePluginUserScope()` e `orchestratorBlock()` (Tasks 1-2), chamadas via `node`.

- [ ] **Step 1: Adicionar a pergunta da entrevista (Step 2.6)**

Inserir, após a última pergunta da seção `### 2.` (entrevista), um novo bloco:

````markdown
### 2.6 (opcional) Orquestrador de execução paralela (Agent Orchestrator)

Validar a pré-condição (plugin em --scope user) antes de oferecer:

```bash
node -e "import('$CLAUDE_PLUGIN_ROOT/scripts/lib/orchestrator-config.mjs').then(m=>{const o=require('child_process').execSync('claude plugin list 2>/dev/null').toString();const ok=m.parsePluginUserScope(o,'devflow@NEXUZ-SYS')&&m.parsePluginUserScope(o,'superpowers@');console.log(ok?'USER_SCOPE_OK':'NEEDS_USER_SCOPE')})"
```

- Se `NEEDS_USER_SCOPE`: NÃO oferecer ativação. Informar que, para usar o AO, é preciso
  `claude plugin install devflow@NEXUZ-SYS --scope user` (+ superpowers), e gravar `orchestrator.enabled: false`.
- Se `USER_SCOPE_OK`, perguntar:

AskUserQuestion:
- Pergunta: "Usar o Agent Orchestrator para execução paralela na fase E (para casos quando necessário)?"
- Opções:
  - "Sugerir quando compensar (recomendado)" → `mode: suggest`
  - "Automático" → `mode: auto`
  - "Não usar" → `enabled: false`
````

- [ ] **Step 2: Verificar o texto inserido**

Run: `grep -n "2.6 (opcional) Orquestrador" skills/config/SKILL.md`
Expected: uma linha (a seção existe).

- [ ] **Step 3: Adicionar a geração da seção (Step 3)**

Na seção `### 3. Gerar .context/.devflow.yaml`, após as seções existentes, inserir:

````markdown
**Seção `orchestrator:`** — gerar com a lib (não escrever à mão):

```bash
node -e "import('$CLAUDE_PLUGIN_ROOT/scripts/lib/orchestrator-config.mjs').then(m=>process.stdout.write(m.orchestratorBlock({mode:'<MODE>',enabled:<ENABLED>})))"
```

Substituir `<MODE>` pela escolha do Step 2.6 e `<ENABLED>` por `true`/`false`. Anexar a saída ao `.devflow.yaml`.
````

- [ ] **Step 4: Adicionar reconhecimento no patch incremental (Step 5)**

Na subseção de regras do modo patch incremental (Step 5.3), adicionar a linha:

```markdown
- **`orchestrator:`** — se ausente, gerar via `orchestratorBlock()` e anexar; se presente, substituir o bloco inteiro preservando as demais seções.
```

- [ ] **Step 5: Commit**

```bash
git add skills/config/SKILL.md
git commit -m "feat(config): entrevista e geração da seção orchestrator (AO)"
```

---

### Task 4: Reuso no `skills/project-init/SKILL.md` (Step 0.6)

**Files:**
- Modify: `skills/project-init/SKILL.md` (Step 0.6)

**Interfaces:**
- Consumes: o mesmo fluxo da Task 3 (a sub-rotina de oferta do orchestrator).

- [ ] **Step 1: Estender o Step 0.6**

Ao final do Step 0.6 (após a validação de escopo já existente), adicionar:

````markdown
**Após validar o escopo:** se `USER_SCOPE_OK` e o usuário indicou uso do AO, oferecer configurar a seção `orchestrator:` agora — reusando a sub-rotina do `devflow:config` (Step 2.6 + geração via `orchestratorBlock()`). Se o usuário preferir decidir depois, apontar `/devflow config`. Não duplicar a lógica: delegar ao fluxo do config.
````

- [ ] **Step 2: Verificar**

Run: `grep -n "reusando a sub-rotina do .devflow:config" skills/project-init/SKILL.md`
Expected: uma linha.

- [ ] **Step 3: Commit**

```bash
git add skills/project-init/SKILL.md
git commit -m "feat(init): Step 0.6 oferece configurar orchestrator reusando o config"
```

---

### Task 5: CHANGELOG + verificação final

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Adicionar entrada no topo do CHANGELOG**

Inserir após o cabeçalho `## [Unreleased]`/topo (seguindo o padrão Keep a Changelog), uma entrada `### Added` descrevendo: seção `orchestrator:` no `.devflow.yaml`, entrevista no config + reuso no init Step 0.6, gatilho `mode` (suggest default), pré-condição user-scope. Versão será bumpada pelo pre-commit hook.

- [ ] **Step 2: Rodar a suíte da feature**

Run: `node --test tests/orchestrator/orchestrator-config.test.mjs`
Expected: PASS — 7 testes.

- [ ] **Step 3: Verificar que nada quebrou nos skills tocados**

Run: `node -e "import('./scripts/lib/orchestrator-config.mjs').then(m=>console.log(typeof m.parsePluginUserScope, typeof m.orchestratorBlock))"`
Expected: `function function`

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): config do orchestrator (AO) — Plano 1"
```

---

## Self-Review

**1. Spec coverage (vs §4 do spec):** seção `orchestrator:` ✓ (Tasks 2-3), entrevista config ✓ (Task 3), reuso init/Step 0.6 ✓ (Task 4), pré-condição user-scope ✓ (Tasks 1,3), patch incremental ✓ (Task 3 Step 4). Heurística/ondas/fluxo da fase E → **fora deste plano** (Planos 2 e 3, por design).

**2. Placeholder scan:** sem TBD/TODO; código completo em cada step; `<MODE>`/`<ENABLED>` são substituições explicadas, não placeholders de plano.

**3. Type consistency:** `parsePluginUserScope(output, pluginName)` e `orchestratorBlock(answers)` usados de forma idêntica em testes e skills. Defaults batem com as Global Constraints.

**Nota de fronteira:** este plano só **configura**; nenhuma linha dispara o AO. O consumo da config acontece no Plano 3.
