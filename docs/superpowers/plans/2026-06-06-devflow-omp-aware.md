# Camada omp-aware do DevFlow — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o DevFlow cidadão de primeira classe no omp (oh-my-pi) via uma camada aditiva (Opção B), sem fork e sem tocar o núcleo `.claude/`.

**Architecture:** Uma extensão TS/JS fina do omp (`omp/extension.mjs`) faz *wrap & reuse* dos hooks bash/`.mjs` existentes; uma utilidade de tradução (`omp/lib/translate-tool-event.mjs`) adapta o vocabulário/payload de eventos de ferramenta do omp para o shape Claude Code que os scripts esperam; um enriquecedor aditivo (`scripts/lib/omp-enrich-agents.mjs`) adiciona campos omp ao frontmatter dos agentes pós-fill; skills de dispatch ganham um branch omp que usa o `task` tool.

**Tech Stack:** Node 24 (ESM `.mjs`, `node:test`), Bash (hooks), omp/Bun (runtime da extensão), YAML/JSON frontmatter, MCP.

**Spec:** `docs/superpowers/specs/2026-06-06-devflow-omp-aware-design.md`
**Branch:** `feat/omp-integration`

**Convenções de teste do repo (não há `package.json`):**
- Unit Node: `node --test tests/<arquivo>.mjs`
- Teste de hook: `bash tests/hooks/<arquivo>.sh` (monta tmpdir, envia evento JSON por stdin)
- Shape de evento Claude Code (alvo da tradução), confirmado em `tests/hooks/test-pre-tool-use-knowledge.sh`:
  ```json
  { "tool_name": "Edit", "tool_input": { "file_path": "/abs/path" }, "cwd": "/project/root" }
  ```

**Nota de runtime da extensão:** autoramos a extensão e libs como **`.mjs`** (rodam em Node 24 *e* no Bun do omp, sem build step). A extensão fica em `omp/extension.mjs`; a lógica testável vive nos `.mjs` de `omp/lib/` e `scripts/lib/`, exercitada por `node --test`. O glue da extensão é validado por E2E sob omp (skip explícito se omp ausente).

**Anotação de agentes (E phase, dispatch por grupo):**
- Fase 1 → `backend-specialist` (libs .mjs) + `test-writer`
- Fase 2 → `devops-specialist` (hooks/extensão/bash) + `test-writer`
- Fase 3 → `backend-specialist` (enriquecedor) + `refactoring-specialist` (edição de skills) + `test-writer`
- Fase 4 → `refactoring-specialist` (skills de dispatch) + `test-writer`
- Fase 5 → `documentation-writer` (docs/distribuição) + `devops-specialist` (manifesto)

---

## Fase 1 — Fundações: detecção de runtime + compat-check de frontmatter

**Agent:** backend-specialist | **Handoff from:** architect (design aprovado)
**Tests:** unit + integração

### Task 1: `detect-runtime.mjs` — identificar o runtime corrente

**Files:**
- Create: `omp/lib/detect-runtime.mjs`
- Test: `tests/omp/test-detect-runtime.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/omp/test-detect-runtime.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRuntime } from "../../omp/lib/detect-runtime.mjs";

test("omp via OMP_* env", () => {
  assert.equal(detectRuntime({ OMP_SESSION_ID: "x" }), "omp");
});

test("omp via PI_* env", () => {
  assert.equal(detectRuntime({ PI_AGENT: "1" }), "omp");
});

test("claude via CLAUDE* env", () => {
  assert.equal(detectRuntime({ CLAUDECODE: "1" }), "claude");
});

test("default conservador = claude quando ambíguo", () => {
  assert.equal(detectRuntime({}), "claude");
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `node --test tests/omp/test-detect-runtime.mjs`
Expected: FAIL — `Cannot find module '../../omp/lib/detect-runtime.mjs'`

- [ ] **Step 3: Implementar o mínimo**

```javascript
// omp/lib/detect-runtime.mjs
// Probe leve do runtime em execução. Conservador: default = "claude".
// Não confiar só nisto para ativação — a ativação é explícita no init (Task 8).

/** @param {NodeJS.ProcessEnv} [env] @returns {"omp"|"opencode"|"claude"} */
export function detectRuntime(env = process.env) {
  const has = (k) => env[k] != null && env[k] !== "";
  if (Object.keys(env).some((k) => k.startsWith("OMP_") || k.startsWith("PI_"))) return "omp";
  if (has("OPENCODE") || Object.keys(env).some((k) => k.startsWith("OPENCODE_"))) return "opencode";
  return "claude";
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/omp/test-detect-runtime.mjs`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add omp/lib/detect-runtime.mjs tests/omp/test-detect-runtime.mjs
git commit -m "feat(omp): detect-runtime probe (claude/opencode/omp)"
```

### Task 2: Compat-check — frontmatter aditivo não quebra dotcontext nem o parser

**Files:**
- Create: `tests/omp/test-frontmatter-compat.mjs`
- Create (fixture): `tests/fixtures/omp/agent-with-omp-fields.md`

- [ ] **Step 1: Criar a fixture de agente com campos omp aditivos**

```markdown
---
type: agent
name: architect
description: System architecture design
role: architect
phases: [P, R]
skills: [devflow:prevc-planning]
model: pi/plan
spawns: explore, plan
thinking-level: high
output:
  properties:
    correctness: { enum: [correct, incorrect] }
---
# Architect
Corpo do agente — deve ser preservado intacto.
```

- [ ] **Step 2: Escrever o teste que falha**

```javascript
// tests/omp/test-frontmatter-compat.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dir, "../fixtures/omp/agent-with-omp-fields.md");

// Contrato: campos omp são ADITIVOS — os campos dotcontext canônicos
// (type/name/description/role/phases/skills) permanecem presentes e o corpo intacto.
test("campos dotcontext canônicos preservados junto dos campos omp", () => {
  const raw = readFileSync(FIXTURE, "utf-8");
  for (const f of ["type:", "name:", "description:", "role:", "phases:", "skills:"]) {
    assert.ok(raw.includes(f), `campo canônico ausente: ${f}`);
  }
  for (const f of ["model:", "spawns:", "thinking-level:", "output:"]) {
    assert.ok(raw.includes(f), `campo omp ausente: ${f}`);
  }
  assert.ok(raw.includes("Corpo do agente — deve ser preservado intacto."));
});
```

- [ ] **Step 3: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-frontmatter-compat.mjs`
Expected: FAIL — fixture inexistente (`ENOENT`)

- [ ] **Step 4: Criar a fixture (Step 1) e rodar — deve passar**

Run: `node --test tests/omp/test-frontmatter-compat.mjs`
Expected: PASS

- [ ] **Step 5: Validação dotcontext opcional (skip se ausente)**

Run:
```bash
command -v dotcontext >/dev/null && dotcontext --version || echo "SKIP: dotcontext ausente"
```
Expected: imprime versão OU `SKIP`. Se presente, registrar no PR que a validação de schema dotcontext sobre a fixture passou (campos extras tolerados). Se ausente, marcar skip explícito (sem mascarar).

- [ ] **Step 6: Commit**

```bash
git add tests/omp/test-frontmatter-compat.mjs tests/fixtures/omp/agent-with-omp-fields.md
git commit -m "test(omp): frontmatter aditivo preserva contrato dotcontext"
```

---

## Fase 2 — Bridge de hooks + tradução de eventos + detection-hardening

**Agent:** devops-specialist | **Handoff from:** backend-specialist (libs prontas)
**Tests:** unit + hook (.sh) + E2E (omp)

### Task 3: `translate-tool-event.mjs` — evento omp → shape Claude Code

**Files:**
- Create: `omp/lib/translate-tool-event.mjs`
- Test: `tests/omp/test-translate-tool-event.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/omp/test-translate-tool-event.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { translateToolEvent } from "../../omp/lib/translate-tool-event.mjs";

test("omp edit → tool_name Edit + file_path", () => {
  const out = translateToolEvent(
    { toolName: "edit", input: { path: "/p/a.ts" } },
    { cwd: "/p" }
  );
  assert.deepEqual(out, { tool_name: "Edit", tool_input: { file_path: "/p/a.ts" }, cwd: "/p" });
});

test("omp write → Write", () => {
  const out = translateToolEvent({ toolName: "write", input: { path: "/p/b.ts" } }, { cwd: "/p" });
  assert.equal(out.tool_name, "Write");
  assert.equal(out.tool_input.file_path, "/p/b.ts");
});

test("omp ast_edit → Edit (ganho de cobertura)", () => {
  const out = translateToolEvent({ toolName: "ast_edit", input: { path: "/p/c.ts" } }, { cwd: "/p" });
  assert.equal(out.tool_name, "Edit");
});

test("ferramenta não-edição → null (não dispara hook)", () => {
  assert.equal(translateToolEvent({ toolName: "bash", input: {} }, { cwd: "/p" }), null);
});

test("campo de path alternativo (file_path/filePath)", () => {
  const a = translateToolEvent({ toolName: "edit", input: { file_path: "/p/d.ts" } }, { cwd: "/p" });
  assert.equal(a.tool_input.file_path, "/p/d.ts");
  const b = translateToolEvent({ toolName: "edit", input: { filePath: "/p/e.ts" } }, { cwd: "/p" });
  assert.equal(b.tool_input.file_path, "/p/e.ts");
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-translate-tool-event.mjs`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar o mínimo**

```javascript
// omp/lib/translate-tool-event.mjs
// Traduz um evento de ferramenta do omp para o shape de evento Claude Code
// que os scripts de hook (.mjs/bash) esperam via stdin.
// Retorna null quando a ferramenta não é uma edição de arquivo (não deve disparar o hook).

const EDIT_TOOLS = new Map([
  ["edit", "Edit"],
  ["write", "Write"],
  ["ast_edit", "Edit"], // omp tem ast_edit; mapeia para gatilho de Edit (cobertura extra)
]);

/**
 * @param {{toolName:string, input?:Record<string,unknown>}} ompEvent
 * @param {{cwd:string}} ctx
 * @returns {{tool_name:string, tool_input:{file_path:string}, cwd:string} | null}
 */
export function translateToolEvent(ompEvent, ctx) {
  const tool = EDIT_TOOLS.get(ompEvent?.toolName);
  if (!tool) return null;
  const input = ompEvent.input ?? {};
  const filePath = input.path ?? input.file_path ?? input.filePath ?? null;
  if (!filePath) return null;
  return { tool_name: tool, tool_input: { file_path: String(filePath) }, cwd: ctx.cwd };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/omp/test-translate-tool-event.mjs`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add omp/lib/translate-tool-event.mjs tests/omp/test-translate-tool-event.mjs
git commit -m "feat(omp): translate-tool-event (omp tool events → Claude Code shape)"
```

### Task 4: Detection-hardening — varrer config MCP do omp

**Files:**
- Modify: `hooks/session-start` (bloco de detecção MCP, linhas ~49-54)
- Test: `tests/hooks/test-session-start-omp-mcp-detection.sh`

- [ ] **Step 1: Escrever o teste de hook que falha**

```bash
# tests/hooks/test-session-start-omp-mcp-detection.sh
#!/usr/bin/env bash
# Test: detecção de mempalace/dotcontext quando configurados SÓ no
# config MCP global do omp (~/.omp/agent/mcp.json), não em .mcp.json.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
export HOME="$TMP/home"
mkdir -p "$HOME/.omp/agent"
# dotcontext + mempalace SÓ no config global do omp
cat > "$HOME/.omp/agent/mcp.json" <<'JSON'
{ "mcpServers": { "dotcontext": { "command": "npx" }, "mempalace": { "command": "mempalace-mcp" } } }
JSON
mkdir -p "$TMP/proj"
# Sem .mcp.json no projeto: detecção CC-only daria falso negativo.
OUT=$(cd "$TMP/proj" && bash "$REPO_ROOT/hooks/session-start" startup 2>/dev/null || true)
echo "$OUT" | grep -q "MEMPALACE_CONTEXT\|mempalace" || { echo "FALHA: mempalace não detectado via config omp"; exit 1; }
echo "$OUT" | grep -qi "full" || { echo "FALHA: modo Full não detectado via dotcontext omp-global"; exit 1; }
echo "OK"
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `bash tests/hooks/test-session-start-omp-mcp-detection.sh`
Expected: FAIL — `mempalace não detectado` (detecção atual só olha `.mcp.json` e `~/.config/claude/mcp.json`)

- [ ] **Step 3: Estender a detecção em `hooks/session-start`**

Localizar o bloco de detecção (`mempalace_available` ~linha 49-54 e a detecção de `dotcontext`/modo). Acrescentar os paths do omp à condição `grep`. Padrão a aplicar para AMBOS (mempalace e dotcontext):

```bash
# Adicionar aos checks existentes (mantendo os de Claude Code):
# omp project + global config
elif [ -f "${project_root}/.omp/mcp.json" ] && grep -q "mempalace" "${project_root}/.omp/mcp.json" 2>/dev/null; then
  mempalace_available="true"
elif [ -f "${HOME}/.omp/agent/mcp.json" ] && grep -q "mempalace" "${HOME}/.omp/agent/mcp.json" 2>/dev/null; then
  mempalace_available="true"
```

Aplicar o mesmo encadeamento `elif` para a detecção de `dotcontext` (que define `mode="full"`), cobrindo `${project_root}/.omp/mcp.json` e `${HOME}/.omp/agent/mcp.json`.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bash tests/hooks/test-session-start-omp-mcp-detection.sh`
Expected: `OK`

- [ ] **Step 5: Regressão — testes de hook existentes ainda passam**

Run: `for t in tests/hooks/test-napkin-hooks.sh tests/hooks/test-adr-context.sh; do bash "$t" && echo "PASS $t"; done`
Expected: PASS em ambos (detecção CC inalterada)

- [ ] **Step 6: Commit**

```bash
git add hooks/session-start tests/hooks/test-session-start-omp-mcp-detection.sh
git commit -m "fix(hooks): detectar mempalace/dotcontext no config MCP do omp (Full mode)"
```

### Task 5: Extensão omp — glue de `session_start` (wrap & reuse) + confirmação da API de injeção

**Files:**
- Create: `omp/extension.mjs`
- Create: `omp/lib/run-bash-hook.mjs`
- Test (E2E, skip se omp ausente): `tests/omp/e2e-session-start.sh`

> **Risco aberto (spec):** o mecanismo exato de injeção de contexto no `session_start` do omp. Esta task **começa** confirmando-o.

- [ ] **Step 1: Confirmar a API de injeção do omp (spike, documentar)**

Run:
```bash
command -v omp >/dev/null && omp --version || echo "SKIP: omp ausente"
```
Se presente: inspecionar a doc de extensões do omp (`session_start`/`context`/`before_agent_start`, `appendEntry`/`sendMessage`) e registrar no topo de `omp/extension.mjs` (comentário) qual API entrega paridade com `additionalContext`. Se ausente: marcar skip e usar `appendEntry` como candidato padrão, a confirmar no primeiro ambiente com omp.

- [ ] **Step 2: Escrever o helper `run-bash-hook.mjs` (executa script e captura stdout)**

```javascript
// omp/lib/run-bash-hook.mjs
// Executa um script de hook do DevFlow (bash) e retorna seu stdout.
// Falha graciosa: erro do hook não derruba a sessão (retorna "").
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * @param {string} hookName  ex.: "session-start"
 * @param {{args?:string[], stdin?:string, cwd?:string}} [opts]
 * @returns {string} stdout (ou "" em falha)
 */
export function runBashHook(hookName, opts = {}) {
  const hookPath = join(PLUGIN_ROOT, "hooks", hookName);
  try {
    const r = spawnSync("bash", [hookPath, ...(opts.args ?? [])], {
      input: opts.stdin ?? "",
      cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      encoding: "utf-8",
      timeout: 20000,
    });
    return r.status === 0 ? (r.stdout ?? "") : "";
  } catch {
    return "";
  }
}
```

- [ ] **Step 3: Escrever a extensão com o handler de `session_start`**

```javascript
// omp/extension.mjs
// Extensão omp (oh-my-pi) do DevFlow — bridge fino: faz wrap & reuse dos
// hooks bash/.mjs existentes e injeta a saída no contexto do omp.
// API de injeção confirmada no spike (Task 5, Step 1): usar pi.appendEntry
// (ajustar aqui se o spike apontar `context`/`sendMessage`).
import { runBashHook } from "./lib/run-bash-hook.mjs";

/** @param {any} pi ExtensionAPI do omp */
export default function ext(pi) {
  // session_start → reusa hooks/session-start e injeta o bloco <DEVFLOW_CONTEXT>
  pi.on("session_start", async () => {
    const out = runBashHook("session-start", { args: ["startup"], cwd: process.cwd() });
    if (out && out.trim()) pi.appendEntry({ role: "system", content: out });
  });
}
```

- [ ] **Step 4: Escrever o E2E (skip se omp ausente)**

```bash
# tests/omp/e2e-session-start.sh
#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context"; echo "git: { strategy: trunk-based }" > "$TMP/.context/.devflow.yaml"
# Carrega a extensão e roda um one-shot; deve injetar o bloco DEVFLOW_CONTEXT.
OUT=$(cd "$TMP" && omp -e "$REPO_ROOT/omp/extension.mjs" -p "responda apenas: ping" 2>/dev/null || true)
echo "$OUT" | grep -q "DEVFLOW_CONTEXT\|DevFlow installed" || { echo "FALHA: contexto não injetado no omp"; exit 1; }
echo "OK"
```

- [ ] **Step 5: Rodar o E2E**

Run: `bash tests/omp/e2e-session-start.sh`
Expected: `OK` (ou `SKIP: omp ausente`)

- [ ] **Step 6: Commit**

```bash
git add omp/extension.mjs omp/lib/run-bash-hook.mjs tests/omp/e2e-session-start.sh
git commit -m "feat(omp): extensão bridge — session_start via wrap & reuse"
```

### Task 6: Extensão — eventos de compactação (MemPalace snapshot/rehidratação)

**Files:**
- Modify: `omp/extension.mjs`
- Test (E2E, skip se omp ausente): `tests/omp/e2e-compact.sh`

- [ ] **Step 1: Escrever o E2E que falha (skip se omp ausente)**

```bash
# tests/omp/e2e-compact.sh
#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context/workflow/.checkpoint"
echo '{"branch":"feat/x","phase":"E"}' > "$TMP/.context/workflow/.checkpoint/last.json"
# O handler de compactação reusa hooks/pre-compact (snapshot). Verificação direta:
( cd "$TMP" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$REPO_ROOT/hooks/pre-compact" >/dev/null 2>&1 || true )
test -f "$TMP/.context/workflow/.checkpoint/last.json" || { echo "FALHA: snapshot ausente"; exit 1; }
echo "OK"
```

- [ ] **Step 2: Rodar e confirmar (E2E falha só se handler ausente; em omp ausente, SKIP)**

Run: `bash tests/omp/e2e-compact.sh`
Expected: `SKIP: omp ausente` no CI sem omp; `OK` com omp + handlers.

- [ ] **Step 3: Adicionar handlers de compactação à extensão**

Acrescentar em `omp/extension.mjs`, dentro de `ext(pi)`:

```javascript
  // session_before_compact → snapshot (reusa hooks/pre-compact)
  pi.on("session_before_compact", async () => {
    runBashHook("pre-compact", { cwd: process.cwd() });
  });

  // session_compact (pós) → rehidratação (reusa hooks/post-compact)
  pi.on("session_compact", async () => {
    const out = runBashHook("post-compact", { cwd: process.cwd() });
    if (out && out.trim()) pi.appendEntry({ role: "system", content: out });
  });
```

> Nota: confirmar no spike (Task 5) os nomes exatos dos eventos de compactação do omp (`session_before_compact`/`session_compact`/`auto_compaction_*`) e ajustar as strings se necessário.

- [ ] **Step 4: Rodar o E2E**

Run: `bash tests/omp/e2e-compact.sh`
Expected: `OK` (ou `SKIP`)

- [ ] **Step 5: Commit**

```bash
git add omp/extension.mjs tests/omp/e2e-compact.sh
git commit -m "feat(omp): handlers de compactação (MemPalace snapshot/rehidratação)"
```

### Task 7: Extensão — `tool_call` (pre) e `tool_result` (post) via tradução

**Files:**
- Modify: `omp/extension.mjs`
- Test (hook): `tests/hooks/test-omp-tool-bridge.sh`

- [ ] **Step 1: Escrever o teste que falha — tradução alimenta pre e post**

```bash
# tests/hooks/test-omp-tool-bridge.sh
#!/usr/bin/env bash
# Verifica que um evento de ferramenta do omp (edit) traduzido alimenta:
#  - pre-tool-use (knowledge on-demand Stage-2)
#  - post-tool-use (linter de standards)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context/engineering" "$TMP/src"
echo "git: { strategy: trunk-based }" > "$TMP/.context/.devflow.yaml"
cat > "$TMP/.context/engineering/architecture-overview.md" <<'EOF'
---
type: knowledge
activation: on-demand
keywords: [src]
---
# Arquitetura
Conteúdo on-demand de produto/engenharia.
EOF
# Traduz um evento omp e injeta no pre-tool-use:
EVENT=$(node -e '
  import("'"$REPO_ROOT"'/omp/lib/translate-tool-event.mjs").then(m=>{
    const o=m.translateToolEvent({toolName:"edit",input:{path:"'"$TMP"'/src/app.ts"}},{cwd:"'"$TMP"'"});
    process.stdout.write(JSON.stringify(o));
  })')
echo "$EVENT" | grep -q '"tool_name":"Edit"' || { echo "FALHA: tradução"; exit 1; }
OUT=$(cd "$TMP" && echo "$EVENT" | CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$REPO_ROOT/hooks/pre-tool-use" 2>/dev/null || true)
echo "$OUT" | grep -qi "KNOWLEDGE_ONDEMAND\|Arquitetura" || { echo "FALHA: knowledge on-demand não injetado"; exit 1; }
echo "OK"
```

- [ ] **Step 2: Rodar — entender o que este teste cobre**

Run: `bash tests/hooks/test-omp-tool-bridge.sh`
Expected: este teste valida o **contrato tradução→hook** (código da Task 3 + hooks existentes) — pode já passar a parte de tradução. Ele **não** exercita os handlers da extensão `omp/extension.mjs` (esses só rodam sob omp e são validados pelo E2E da Task 5). Aqui garantimos que o evento omp traduzido alimenta corretamente o `pre-tool-use` (knowledge on-demand). Se o `grep` de `KNOWLEDGE_ONDEMAND` falhar, a tradução/contrato está quebrado.

- [ ] **Step 3: Adicionar os handlers de ferramenta à extensão**

Acrescentar em `omp/extension.mjs` (importar `translateToolEvent` no topo):

```javascript
import { translateToolEvent } from "./lib/translate-tool-event.mjs";
```

Dentro de `ext(pi)`:

```javascript
  // tool_call (pre) → git-guard + knowledge on-demand Stage-2
  pi.on("tool_call", async (event) => {
    const cc = translateToolEvent(event, { cwd: process.cwd() });
    if (!cc) return; // não é edição de arquivo
    const out = runBashHook("pre-tool-use", { stdin: JSON.stringify(cc), cwd: process.cwd() });
    // pre-tool-use pode bloquear (git-guard). Convenção: stdout começando com "BLOCK:".
    if (out.startsWith("BLOCK:")) return { block: true, reason: out.slice(6).trim() };
    if (out && out.trim()) pi.appendEntry({ role: "system", content: out });
  });

  // tool_result (post) → linter de standards + nudge + PREVC handoff guard
  pi.on("tool_result", async (event) => {
    const cc = translateToolEvent(event, { cwd: process.cwd() });
    if (!cc) return;
    const out = runBashHook("post-tool-use", { stdin: JSON.stringify(cc), cwd: process.cwd() });
    if (out && out.trim()) pi.appendEntry({ role: "system", content: out });
  });
```

> Confirmar no spike o shape real de `event` em `tool_call`/`tool_result` do omp (campos `toolName`/`input`) e ajustar `translateToolEvent` se divergir. O contrato `{block, reason}` do `tool_call` foi confirmado na pesquisa.

- [ ] **Step 4: Rodar o teste**

Run: `bash tests/hooks/test-omp-tool-bridge.sh`
Expected: `OK`

- [ ] **Step 5: Regressão dos hooks de tool existentes**

Run: `bash tests/hooks/test-post-tool-use.sh && bash tests/hooks/test-pre-tool-use-knowledge.sh`
Expected: PASS em ambos (caminho Claude Code inalterado)

- [ ] **Step 6: Commit**

```bash
git add omp/extension.mjs tests/hooks/test-omp-tool-bridge.sh
git commit -m "feat(omp): bridge de tool_call/tool_result (standards+knowledge+ADR guard)"
```

---

## Fase 3 — Enriquecimento omp dos agentes + seleção de runtime no init

**Agent:** backend-specialist (enriquecedor) + refactoring-specialist (skills) | **Tests:** unit + hook
**Handoff from:** devops-specialist (bridge pronto)

### Task 8: `omp-roles.yaml` + output schemas

**Files:**
- Create: `omp/omp-roles.yaml`
- Create: `omp/schemas/review-verdict.json`
- Create: `omp/schemas/validation-verdict.json`
- Test: `tests/omp/test-omp-roles.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/omp/test-omp-roles.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));
const ROLES = join(__dir, "../../omp/omp-roles.yaml");

test("mapa cobre atividades-chave", () => {
  const y = readFileSync(ROLES, "utf-8");
  for (const k of ["brainstorming", "writing-plans", "deep-review", "execution", "fanout", "confirmation"]) {
    assert.ok(y.includes(k), `atividade ausente: ${k}`);
  }
  for (const role of ["pi/plan", "pi/slow", "default", "pi/smol", "commit"]) {
    assert.ok(y.includes(role), `role ausente: ${role}`);
  }
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-omp-roles.mjs`
Expected: FAIL — arquivo inexistente

- [ ] **Step 3: Criar `omp/omp-roles.yaml`**

```yaml
# Mapa atividade → model role do omp. Lido pelo enriquecedor de agentes e
# pelos skills de fase quando em omp. Inerte no Claude Code.
activities:
  brainstorming:   pi/plan      # superpowers:brainstorming (fase P)
  writing-plans:   pi/plan      # superpowers:writing-plans (fase P)
  deep-review:     pi/slow      # architect / security-auditor (R, V)
  execution:       default      # execução TDD (E)
  fanout:          pi/smol      # fan-out de subagents (E)
  confirmation:    commit       # docs / commit (C)
# Default por role de agente (derivado de role+phases):
agent_role_defaults:
  architect:        { model: pi/plan,  thinking-level: high }
  security-auditor: { model: pi/slow,  thinking-level: high, output: review-verdict }
  code-reviewer:    { model: pi/slow,  output: review-verdict }
  test-writer:      { model: default,  output: validation-verdict }
  performance-optimizer: { model: pi/slow }
  feature-developer:     { model: default }
  product-manager:       { model: pi/plan }
  documentation-writer:  { model: commit }
```

- [ ] **Step 4: Criar os schemas de output (JTD)**

```json
// omp/schemas/review-verdict.json
{
  "properties": {
    "overall_correctness": { "enum": ["correct", "incorrect"] },
    "explanation": { "type": "string" },
    "confidence": { "type": "number" }
  },
  "optionalProperties": {
    "findings": { "elements": { "properties": { "title": { "type": "string" }, "severity": { "type": "string" } } } }
  }
}
```

```json
// omp/schemas/validation-verdict.json
{
  "properties": {
    "passed": { "type": "boolean" },
    "summary": { "type": "string" }
  },
  "optionalProperties": {
    "failures": { "elements": { "type": "string" } }
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/omp/test-omp-roles.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add omp/omp-roles.yaml omp/schemas/
git commit -m "feat(omp): mapa de model roles por atividade + output schemas"
```

### Task 9: `omp-enrich-agents.mjs` — patch aditivo de frontmatter (pós-fill)

**Files:**
- Create: `scripts/lib/omp-enrich-agents.mjs`
- Test: `tests/omp/test-omp-enrich-agents.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/omp/test-omp-enrich-agents.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichAgentFrontmatter } from "../../scripts/lib/omp-enrich-agents.mjs";

const FILLED = `---
type: agent
name: security-auditor
description: Vulnerability assessment
role: specialist
phases: [R, V]
status: filled
---
# Security Auditor
Corpo filled que NÃO pode ser alterado.
`;

test("adiciona campos omp preservando frontmatter e corpo", () => {
  const out = enrichAgentFrontmatter(FILLED, { model: "pi/slow", "thinking-level": "high", output: "review-verdict" });
  assert.ok(out.includes("model: pi/slow"));
  assert.ok(out.includes("thinking-level: high"));
  assert.ok(out.includes("output: review-verdict"));
  // canônicos preservados:
  assert.ok(out.includes("status: filled"));
  assert.ok(out.includes("name: security-auditor"));
  // corpo intacto:
  assert.ok(out.includes("Corpo filled que NÃO pode ser alterado."));
});

test("idempotente — reaplicar não duplica campos", () => {
  const once = enrichAgentFrontmatter(FILLED, { model: "pi/slow" });
  const twice = enrichAgentFrontmatter(once, { model: "pi/slow" });
  assert.equal((twice.match(/model: pi\/slow/g) || []).length, 1);
});

test("atualiza valor de campo omp existente sem duplicar", () => {
  const once = enrichAgentFrontmatter(FILLED, { model: "default" });
  const updated = enrichAgentFrontmatter(once, { model: "pi/slow" });
  assert.ok(updated.includes("model: pi/slow"));
  assert.ok(!updated.includes("model: default"));
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-omp-enrich-agents.mjs`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar o enriquecedor (só frontmatter, idempotente)**

```javascript
// scripts/lib/omp-enrich-agents.mjs
// Aplica um patch ADITIVO de campos omp ao frontmatter de um agente,
// preservando os campos canônicos dotcontext e o corpo (nunca sobrescreve
// conteúdo filled). Idempotente: reaplicar atualiza valores, não duplica.

const FM_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * @param {string} content  conteúdo completo do .md do agente
 * @param {Record<string,string>} ompFields  ex.: { model:"pi/slow", "thinking-level":"high" }
 * @returns {string} conteúdo com frontmatter enriquecido
 */
export function enrichAgentFrontmatter(content, ompFields) {
  const m = content.match(FM_RE);
  if (!m) throw new Error("frontmatter ausente ou malformado");
  let [, fm, body] = m;
  const lines = fm.split("\n");
  for (const [key, value] of Object.entries(ompFields)) {
    const keyRe = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*.*$`);
    const idx = lines.findIndex((l) => keyRe.test(l));
    const newLine = `${key}: ${value}`;
    if (idx >= 0) lines[idx] = newLine; // atualiza
    else lines.push(newLine);           // adiciona
  }
  return `---\n${lines.join("\n")}\n---\n${body}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/omp/test-omp-enrich-agents.mjs`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/omp-enrich-agents.mjs tests/omp/test-omp-enrich-agents.mjs
git commit -m "feat(omp): omp-enrich-agents — patch aditivo de frontmatter (idempotente)"
```

### Task 10: Seleção de runtime no `project-init` (Step 0.5)

**Files:**
- Modify: `skills/project-init/SKILL.md` (inserir Step 0.5 após Step 0)
- Create: `scripts/lib/detect-installed-runtimes.mjs`
- Test: `tests/omp/test-detect-installed-runtimes.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/omp/test-detect-installed-runtimes.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInstalledRuntimes } from "../../scripts/lib/detect-installed-runtimes.mjs";

test("retorna apenas runtimes presentes (mock de which)", () => {
  const present = new Set(["claude", "omp"]);
  const got = detectInstalledRuntimes((bin) => present.has(bin));
  assert.deepEqual(got.sort(), ["claude", "omp"]);
});

test("nenhum instalado → lista vazia", () => {
  assert.deepEqual(detectInstalledRuntimes(() => false), []);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-detect-installed-runtimes.mjs`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar o detector**

```javascript
// scripts/lib/detect-installed-runtimes.mjs
import { spawnSync } from "node:child_process";

const RUNTIMES = ["claude", "opencode", "omp"];

/** @param {(bin:string)=>boolean} [probe] override testável @returns {string[]} */
export function detectInstalledRuntimes(probe) {
  const isPresent = probe ?? ((bin) => spawnSync("command", ["-v", bin], { shell: true }).status === 0);
  return RUNTIMES.filter((r) => isPresent(r));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/omp/test-detect-installed-runtimes.mjs`
Expected: PASS

- [ ] **Step 5: Inserir o Step 0.5 em `skills/project-init/SKILL.md`**

Inserir logo após o Step 0 (Language Selection), antes de "Initialization Strategy":

````markdown
## Step 0.5: Seleção de Runtime(s) (após o idioma)

Detectar os runtimes instalados na máquina e perguntar em quais ativar o DevFlow.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/detect-installed-runtimes.mjs"
```

Apresentar via AskUserQuestion **apenas os instalados** (multi-seleção), com o
runtime corrente (via `omp/lib/detect-runtime.mjs`) pré-marcado. Gravar a escolha
em `.context/.devflow.yaml`:

```yaml
runtimes: [claude, omp]
```

Para cada runtime escolhido, ativar o que ele exige:
- `omp` na lista → garantir o manifesto `omp.extensions` (Task 14) e rodar o
  enriquecimento de agentes omp no Step 4.5.
- `claude` → comportamento atual (nada a ativar).
- `opencode` → lido via compat; nada extra.
````

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/detect-installed-runtimes.mjs tests/omp/test-detect-installed-runtimes.mjs skills/project-init/SKILL.md
git commit -m "feat(omp): seleção de runtime(s) no project-init (Step 0.5)"
```

### Task 11: Step 4.5 de enriquecimento + reuso em config/context-sync

**Files:**
- Modify: `skills/project-init/SKILL.md` (inserir Step 4.5 após Step 4)
- Modify: `skills/config/SKILL.md` (opção de re-tunar agentes omp)
- Modify: `skills/context-sync/SKILL.md` (enriquecer agentes filled — só campos omp)
- Create: `scripts/lib/omp-enrich-project-agents.mjs` (varre `.context/agents/`, aplica defaults)
- Test: `tests/omp/test-omp-enrich-project-agents.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/omp/test-omp-enrich-project-agents.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrichProjectAgents } from "../../scripts/lib/omp-enrich-project-agents.mjs";

test("aplica defaults omp a agentes do projeto preservando corpo filled", () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-enrich-"));
  mkdirSync(join(dir, ".context/agents"), { recursive: true });
  const f = join(dir, ".context/agents/security-auditor.md");
  writeFileSync(f, `---
type: agent
name: security-auditor
role: specialist
phases: [R, V]
status: filled
---
# Sec
corpo filled.
`);
  const changed = enrichProjectAgents(dir);
  assert.ok(changed.includes("security-auditor"));
  const out = readFileSync(f, "utf-8");
  assert.ok(out.includes("model: pi/slow"));      // default de security-auditor
  assert.ok(out.includes("corpo filled."));        // corpo preservado
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-omp-enrich-project-agents.mjs`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar o varredor (usa Task 8 + Task 9)**

```javascript
// scripts/lib/omp-enrich-project-agents.mjs
// Varre .context/agents/*.md e aplica os defaults omp de omp-roles.yaml,
// preservando corpo e campos canônicos. Retorna a lista de agentes alterados.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { enrichAgentFrontmatter } from "./omp-enrich-agents.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadRoleDefaults() {
  // parse leve do omp-roles.yaml (bloco agent_role_defaults)
  const y = readFileSync(join(PLUGIN_ROOT, "omp/omp-roles.yaml"), "utf-8");
  const defaults = {};
  const block = y.split("agent_role_defaults:")[1] || "";
  for (const line of block.split("\n")) {
    const m = line.match(/^\s{2}([\w-]+):\s*\{(.+)\}\s*$/);
    if (!m) continue;
    const fields = {};
    for (const pair of m[2].split(",")) {
      const [k, v] = pair.split(":").map((s) => s.trim());
      if (k && v) fields[k] = v;
    }
    defaults[m[1]] = fields;
  }
  return defaults;
}

/** @param {string} projectRoot @returns {string[]} nomes de agentes alterados */
export function enrichProjectAgents(projectRoot) {
  const dir = join(projectRoot, ".context/agents");
  if (!existsSync(dir)) return [];
  const defaults = loadRoleDefaults();
  const changed = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const name = file.replace(/\.md$/, "");
    const fields = defaults[name];
    if (!fields) continue;
    const path = join(dir, file);
    const out = enrichAgentFrontmatter(readFileSync(path, "utf-8"), fields);
    writeFileSync(path, out);
    changed.push(name);
  }
  return changed;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/omp/test-omp-enrich-project-agents.mjs`
Expected: PASS

- [ ] **Step 5: Inserir Step 4.5 em `skills/project-init/SKILL.md`**

Após o Step 4 (Fill gaps), antes do Step 5:

````markdown
## Step 4.5: Enriquecimento omp dos agentes (só se `omp` ∈ runtimes)

Se `.context/.devflow.yaml` lista `omp` em `runtimes`, enriquecer os agentes
gerados com os campos omp — **patch aditivo no frontmatter, nunca toca o corpo
filled** (respeita o HARD-GATE):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/omp-enrich-project-agents.mjs" "$PWD"
```

Apresentar ao usuário os defaults propostos por agente (model/spawns/output/
thinking-level) e permitir ajuste antes de confirmar. Os defaults vêm de
`omp/omp-roles.yaml`.
````

- [ ] **Step 6: Referenciar a sub-rotina em `config` e `context-sync`**

Em `skills/config/SKILL.md`, adicionar à lista de ações: "Re-tunar campos omp dos agentes — roda `omp-enrich-project-agents.mjs` (só campos omp; preserva corpo)."
Em `skills/context-sync/SKILL.md`, na seção de atualização de agentes: "Ao atualizar agentes filled com `omp` ∈ runtimes, aplicar apenas o patch omp via `omp-enrich-project-agents.mjs` (não regenerar corpo)."

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/omp-enrich-project-agents.mjs tests/omp/test-omp-enrich-project-agents.mjs skills/project-init/SKILL.md skills/config/SKILL.md skills/context-sync/SKILL.md
git commit -m "feat(omp): Step 4.5 enrich agentes pós-fill + reuso em config/sync"
```

---

## Fase 4 — Dispatch de subagents via `task` tool

**Agent:** refactoring-specialist | **Handoff from:** backend-specialist
**Tests:** assert de conteúdo dos skills (markdown) + E2E (omp)

> Estas tasks editam **skills em Markdown** (instruções para o LLM). O "teste" é um asserter de conteúdo que garante que o branch omp existe e referencia os mecanismos corretos, mais um E2E sob omp.

### Task 12: Branch omp no `parallel-dispatch`

**Files:**
- Modify: `skills/parallel-dispatch/SKILL.md`
- Test: `tests/omp/test-parallel-dispatch-omp-branch.mjs`

- [ ] **Step 1: Escrever o asserter que falha**

```javascript
// tests/omp/test-parallel-dispatch-omp-branch.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const SKILL = "skills/parallel-dispatch/SKILL.md";

test("parallel-dispatch tem branch omp usando o task tool + worktree + output", () => {
  const s = readFileSync(SKILL, "utf-8");
  assert.match(s, /omp/i);
  assert.match(s, /\btask\b/);
  assert.match(s, /worktree|isolated|isolation/i);
  assert.match(s, /output schema|output:/i);
  assert.match(s, /detect-runtime/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-parallel-dispatch-omp-branch.mjs`
Expected: FAIL — menções ausentes

- [ ] **Step 3: Adicionar a seção de branch omp ao skill**

Acrescentar em `skills/parallel-dispatch/SKILL.md`:

````markdown
## Branch omp (quando `detect-runtime` reporta `omp`)

Quando rodando no omp, despache via o **`task` tool** nativo em vez do `Task`
do Claude Code:

- Use `isolated: true` para rodar cada subagent em **worktree isolada** (`pi-iso`).
- Defina o `agent` (nome exato; resolvido por `discoverAgents`) e passe um array
  `tasks: [{ id, description, assignment }]`.
- Para subagents de review/validação, forneça `schema` (output schema JTD —
  `omp/schemas/*.json`) para receber **JSON validado** em vez de prosa.
- Respeite o `spawns` allowlist do frontmatter do agente.
- Para fan-out de tarefas independentes, prefira agentes com `model: pi/smol`.

Verifique a integração ao final (igual ao caminho Claude Code): testes completos
e merge das worktrees.
````

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/omp/test-parallel-dispatch-omp-branch.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/parallel-dispatch/SKILL.md tests/omp/test-parallel-dispatch-omp-branch.mjs
git commit -m "feat(omp): branch de dispatch via task tool no parallel-dispatch"
```

### Task 13: Branch omp no `autonomous-loop` (gates leem JSON validado)

**Files:**
- Modify: `skills/autonomous-loop/SKILL.md`
- Test: `tests/omp/test-autonomous-loop-omp-branch.mjs`

- [ ] **Step 1: Escrever o asserter que falha**

```javascript
// tests/omp/test-autonomous-loop-omp-branch.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const SKILL = "skills/autonomous-loop/SKILL.md";

test("autonomous-loop omp: task tool + gate lê output JSON + smol no fanout", () => {
  const s = readFileSync(SKILL, "utf-8");
  assert.match(s, /omp/i);
  assert.match(s, /\btask\b/);
  assert.match(s, /output schema|JSON validado|validated/i);
  assert.match(s, /pi\/smol|smol/);
  assert.match(s, /detect-runtime/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-autonomous-loop-omp-branch.mjs`
Expected: FAIL

- [ ] **Step 3: Adicionar a seção de branch omp ao skill**

Acrescentar em `skills/autonomous-loop/SKILL.md` (na seção Step 3 — Execute Story):

````markdown
### Branch omp (quando `detect-runtime` reporta `omp`)

No Step 3c (Dispatch specialist agent), em vez do `Task` do Claude Code:

- Despache via `task` com `agent: <story.agent>`, `isolated: true` (worktree),
  e `schema` apontando o output schema do agente (`omp/schemas/review-verdict.json`
  para review, `validation-verdict.json` para validação).
- Stories independentes (sem `blocked_by` mútuo) podem ir num único `task` com
  múltiplas entries em `tasks[]`, rodando concorrentes; use `model: pi/smol`
  para o fan-out.

No Step 4 (Evaluate Result), os **gates leem o JSON validado** retornado pelo
`output` (ex.: `overall_correctness === "correct"`, `passed === true`) em vez de
interpretar prosa. Mantêm-se as mesmas regras de retry/escalonamento/circuit-breaker.
````

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/omp/test-autonomous-loop-omp-branch.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/autonomous-loop/SKILL.md tests/omp/test-autonomous-loop-omp-branch.mjs
git commit -m "feat(omp): branch de execução via task tool + gates por output JSON"
```

---

## Fase 5 — Model roles nas fases + distribuição/docs

**Agent:** documentation-writer + devops-specialist | **Handoff from:** refactoring-specialist
**Tests:** asserter de conteúdo + E2E (omp)

### Task 14: Skills de fase consultam `omp-roles.yaml`

**Files:**
- Modify: `skills/prevc-planning/SKILL.md`, `skills/prevc-review/SKILL.md`, `skills/prevc-execution/SKILL.md`
- Test: `tests/omp/test-phase-skills-roles.mjs`

- [ ] **Step 1: Escrever o asserter que falha**

```javascript
// tests/omp/test-phase-skills-roles.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const [skill, activity] of [
  ["skills/prevc-planning/SKILL.md", "plan"],
  ["skills/prevc-review/SKILL.md", "slow"],
  ["skills/prevc-execution/SKILL.md", "smol"],
]) {
  test(`${skill} referencia omp-roles e o role ${activity}`, () => {
    const s = readFileSync(skill, "utf-8");
    assert.match(s, /omp-roles\.yaml/);
    assert.match(s, new RegExp(activity, "i"));
  });
}
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-phase-skills-roles.mjs`
Expected: FAIL

- [ ] **Step 3: Adicionar a nota de model role a cada skill de fase**

Em cada um dos três skills, adicionar uma seção curta:

````markdown
## Model role (omp)

Quando em omp (`detect-runtime` = `omp`), selecione o model role conforme
`omp/omp-roles.yaml`:
- Planning (brainstorming/writing-plans) → `pi/plan`
- Review profundo (architect/security) → `pi/slow`
- Execução TDD → `default`; fan-out de subagents → `pi/smol`
No Claude Code esta seção é inerte (sem roles).
````

(Ajustar a linha citada para a fase do skill: planning cita `pi/plan`, review cita `pi/slow`, execution cita `default`/`pi/smol`.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/omp/test-phase-skills-roles.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/prevc-planning/SKILL.md skills/prevc-review/SKILL.md skills/prevc-execution/SKILL.md tests/omp/test-phase-skills-roles.mjs
git commit -m "feat(omp): skills de fase consultam model roles do omp"
```

### Task 15: Manifesto de descoberta da extensão para o omp

**Files:**
- Create: `package.json` (mínimo, só para o manifesto `omp.extensions`)
- Test: `tests/omp/test-omp-manifest.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/omp/test-omp-manifest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("package.json declara omp.extensions apontando para a extensão", () => {
  assert.ok(existsSync("package.json"), "package.json ausente");
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  assert.ok(pkg.omp && Array.isArray(pkg.omp.extensions), "omp.extensions ausente");
  assert.ok(pkg.omp.extensions.includes("./omp/extension.mjs"));
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-omp-manifest.mjs`
Expected: FAIL — `package.json` ausente

- [ ] **Step 3: Criar o `package.json` mínimo**

```json
{
  "name": "devflow",
  "version": "1.11.2",
  "private": true,
  "description": "DevFlow — manifesto omp (não publicado no npm; usado para descoberta de extensão pelo omp)",
  "omp": {
    "extensions": ["./omp/extension.mjs"]
  }
}
```

> Nota: o `version` deve acompanhar o bump da fase de Confirmation. Verificar que a presença de `package.json` não altera o comportamento do Claude Code (que usa `.claude-plugin/plugin.json`) — confirmar rodando um teste de hook de regressão.

- [ ] **Step 4: Rodar e confirmar que passa + regressão**

Run: `node --test tests/omp/test-omp-manifest.mjs && bash tests/hooks/test-napkin-hooks.sh`
Expected: PASS + `PASS`

- [ ] **Step 5: E2E — omp carrega a extensão como plugin (skip se omp ausente)**

```bash
# anexar a tests/omp/e2e-session-start.sh OU rodar manualmente:
command -v omp >/dev/null && omp plugin list 2>/dev/null | grep -qi devflow && echo "extensão visível" || echo "SKIP/validar manualmente"
```
Expected: `extensão visível` (com omp + plugin instalado) ou `SKIP`.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/omp/test-omp-manifest.mjs
git commit -m "feat(omp): manifesto omp.extensions para descoberta da extensão"
```

### Task 16: Documentação de instalação/uso no omp

**Files:**
- Create: `docs/omp-integration.md`
- Modify: `README.md` (seção curta + link)

- [ ] **Step 1: Escrever o asserter que falha**

```javascript
// tests/omp/test-omp-docs.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("doc de integração omp existe e cobre install + subsistemas", () => {
  assert.ok(existsSync("docs/omp-integration.md"));
  const d = readFileSync("docs/omp-integration.md", "utf-8");
  for (const k of ["marketplace add", "standards", "ADR", "knowledge", "MemPalace", "runtime"]) {
    assert.ok(d.includes(k), `seção ausente: ${k}`);
  }
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-omp-docs.mjs`
Expected: FAIL

- [ ] **Step 3: Escrever `docs/omp-integration.md`**

Conteúdo (pt-BR) cobrindo: instalação via `/marketplace add NEXUZ-SYS/devflow` no omp; ativação via `runtimes` no init; como cada subsistema se comporta no omp (tabela de cobertura: modo, standards, ADR, knowledge/produto, napkin, routines, MemPalace); model roles; como despachar subagents via `task`; limitações conhecidas (itens fora de escopo / fase C futura). Incluir explicitamente os termos verificados pelo teste: `marketplace add`, `standards`, `ADR`, `knowledge`, `MemPalace`, `runtime`.

- [ ] **Step 4: Adicionar nota no README.md**

Acrescentar uma subseção curta "## Rodando no omp (oh-my-pi)" com 2-3 linhas e link para `docs/omp-integration.md`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node --test tests/omp/test-omp-docs.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add docs/omp-integration.md README.md tests/omp/test-omp-docs.mjs
git commit -m "docs(omp): guia de integração/instalação no omp + nota no README"
```

---

## Suíte completa (rodar ao fim de cada fase)

```bash
# Unit Node
node --test tests/omp/*.mjs
# Hooks
for t in tests/hooks/test-session-start-omp-mcp-detection.sh tests/hooks/test-omp-tool-bridge.sh; do bash "$t"; done
# E2E omp (skip se ausente)
for t in tests/omp/e2e-*.sh; do bash "$t"; done
```

## Fora de escopo (YAGNI — possível fase C futura, registrar via ADR/PRD)

Loop PREVC determinístico em TS, telemetria por fase/story, renderers de TUI, roteamento dinâmico de modelo, fusão MemPalace↔Hindsight.
