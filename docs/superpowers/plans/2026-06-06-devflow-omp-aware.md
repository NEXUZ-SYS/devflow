# Camada omp-aware do DevFlow — Plano de Implementação (rev. pós-review)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o DevFlow cidadão de primeira classe no omp (oh-my-pi) via uma camada aditiva (Opção B), sem fork e sem tocar o núcleo `.claude/`.

**Architecture:** Uma extensão fina do omp (`omp/extension.mjs`) faz *wrap & reuse* dos hooks bash/`.mjs` existentes. Duas utilidades puras fazem a ponte de contrato: `translate-tool-event.mjs` (evento omp → shape Claude Code, na ida) e `parse-hook-output.mjs` (envelope JSON dos hooks → `{contextToInject, block, reason}`, na volta). Um enriquecedor aditivo (`omp-enrich-agents.mjs`) adiciona campos omp ao frontmatter dos agentes pós-fill; skills de dispatch ganham um branch omp via `task` tool.

**Tech Stack:** Node 24 (ESM `.mjs`, `node:test`), Bash + python3 (hooks), omp/Bun (runtime da extensão), YAML/JSON frontmatter, MCP.

**Spec:** `docs/superpowers/specs/2026-06-06-devflow-omp-aware-design.md`
**Branch:** `feat/omp-integration`

### Mudanças desta revisão (fase R — architect + code-reviewer + security-auditor)

A review pegou defeitos de **contrato verificáveis hoje**, todos corrigidos aqui sem mudar a arquitetura:

1. **🔴 Os hooks emitem JSON, não texto cru nem `BLOCK:`.** `session-start`/`post-compact` emitem `{"hookSpecificOutput":{"additionalContext":"..."}}`; `pre-tool-use` bloqueia com `{"hookSpecificOutput":{"permissionDecision":"deny",...}}` e `exit 0` (ev.: `hooks/pre-tool-use:319-348`). → Novo módulo puro **`parse-hook-output.mjs`** (Task 5) parseia o envelope e mapeia `permissionDecision deny/ask → {block,reason}`. Sem isso o git-guard viraria no-op silencioso no omp.
2. **Spike promovido a Task 3 (GATE):** API de injeção do omp, nomes de evento e formato de extensão (`.mjs` vs `.ts`) são confirmados ANTES de escrever a extensão.
3. **`cwd` derivado do evento/`file_path`, não de `process.cwd()`** (worktrees `pi-iso` quebram process.cwd) — Task 4 + Task 9.
4. **`python3` é pré-requisito não-declarado** dos hooks (14 chamadas no post, 9 no pre): probe **visível** (não silêncio) em `run-bash-hook.mjs` + doc.
5. **Step 4.5 já existe** (`project-init/SKILL.md:509`, Skills README) → enrich omp renumerado para **Step 4.6**.
6. **Reuso de `scripts/lib/frontmatter.mjs`** (parser CRLF-aware) para o invariante; YAML do `omp-roles.yaml` em formato padrão parseado por helper reusado.
7. **Validação de `file_path`** (controle/traversal) e **escape de valores de frontmatter** (evitar forjar `\nstatus: unfilled`).
8. **Injeção via canal de contexto, não `role:system`** (evita escalonamento de privilégio de conteúdo local).
9. **Tasks de skill-markdown ganham E2E real sob omp** (não só content-check); `package.json` mínimo sem `version`.

**Convenções de teste (não há `package.json` de build):** unit `node --test tests/<arquivo>.mjs`; hook `bash tests/hooks/<arquivo>.sh`; E2E omp `bash tests/omp/e2e-*.sh` (skip explícito se omp ausente).
**Shape de evento Claude Code (confirmado em `tests/hooks/test-pre-tool-use-knowledge.sh:46`):** `{ "tool_name":"Edit", "tool_input":{"file_path":"/abs"}, "cwd":"/root" }`.

**Anotação de agentes (E phase):** Fase 1 → `backend-specialist`+`test-writer`; Fase 2 → `devops-specialist`+`test-writer`; Fase 3 → `backend-specialist`+`refactoring-specialist`; Fase 4 → `refactoring-specialist`; Fase 5 → `documentation-writer`+`devops-specialist`.

---

## Fase 1 — Fundações: detecção de runtime + compat-check

**Agent:** backend-specialist | **Tests:** unit + integração

### Task 1: `detect-runtime.mjs`

**Files:** Create `omp/lib/detect-runtime.mjs`; Test `tests/omp/test-detect-runtime.mjs`

- [ ] **Step 1: Teste que falha**

```javascript
// tests/omp/test-detect-runtime.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRuntime } from "../../omp/lib/detect-runtime.mjs";

test("omp via OMP_*", () => assert.equal(detectRuntime({ OMP_SESSION_ID: "x" }), "omp"));
test("omp via PI_*", () => assert.equal(detectRuntime({ PI_AGENT: "1" }), "omp"));
test("claude via CLAUDECODE", () => assert.equal(detectRuntime({ CLAUDECODE: "1" }), "claude"));
test("default conservador = claude", () => assert.equal(detectRuntime({}), "claude"));
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-detect-runtime.mjs`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar**

```javascript
// omp/lib/detect-runtime.mjs
// Probe leve do runtime corrente. Conservador: default = "claude".
// NÃO é o mecanismo de ativação — a ativação é explícita no init (Task 12).
/** @param {NodeJS.ProcessEnv} [env] @returns {"omp"|"opencode"|"claude"} */
export function detectRuntime(env = process.env) {
  const keys = Object.keys(env);
  if (keys.some((k) => k.startsWith("OMP_") || k.startsWith("PI_"))) return "omp";
  if (env.OPENCODE || keys.some((k) => k.startsWith("OPENCODE_"))) return "opencode";
  return "claude";
}
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `node --test tests/omp/test-detect-runtime.mjs` → PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add omp/lib/detect-runtime.mjs tests/omp/test-detect-runtime.mjs
git commit -m "feat(omp): detect-runtime probe (claude/opencode/omp)"
```

### Task 2: Compat-check — frontmatter aditivo não quebra dotcontext

**Files:** Create `tests/omp/test-frontmatter-compat.mjs`; Create `tests/fixtures/omp/agent-with-omp-fields.md`

- [ ] **Step 1: Criar fixture**

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
output: review-verdict
---
# Architect
Corpo do agente — deve ser preservado intacto.
```

- [ ] **Step 2: Teste que falha (usa o parser real do repo)**

```javascript
// tests/omp/test-frontmatter-compat.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dir, "../fixtures/omp/agent-with-omp-fields.md");

test("parser do repo lê campos canônicos E omp; corpo intacto", () => {
  const { data, body } = parseFrontmatter(readFileSync(FIXTURE, "utf-8"));
  for (const f of ["type", "name", "description", "role", "phases", "skills"]) assert.ok(f in data, `canônico ausente: ${f}`);
  for (const f of ["model", "spawns", "thinking-level", "output"]) assert.ok(f in data, `omp ausente: ${f}`);
  assert.match(body, /Corpo do agente — deve ser preservado intacto\./);
});
```

- [ ] **Step 3: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-frontmatter-compat.mjs`
Expected: FAIL — fixture inexistente (ENOENT)

- [ ] **Step 4: Criar a fixture (Step 1), rodar → PASS**

Run: `node --test tests/omp/test-frontmatter-compat.mjs` → PASS

- [ ] **Step 5: Validação dotcontext opcional (skip se ausente)**

Run: `command -v dotcontext >/dev/null && echo "validar schema sobre a fixture" || echo "SKIP: dotcontext ausente"`
Registrar no PR o resultado (campos extras tolerados) ou o skip explícito.

- [ ] **Step 6: Commit**

```bash
git add tests/omp/test-frontmatter-compat.mjs tests/fixtures/omp/agent-with-omp-fields.md
git commit -m "test(omp): frontmatter aditivo preserva contrato dotcontext (parser real)"
```

---

## Fase 2 — Bridge: spike → utilidades puras → extensão

**Agent:** devops-specialist | **Tests:** unit + hook + E2E omp

### Task 3 [GATE]: Spike da API de extensão do omp

> **Bloqueante.** Confirma fatos que governam Tasks 7/8/9 antes de escrever a extensão. Nada de código de extensão até este gate fechar.

**Files:** Create `omp/SPIKE-omp-api.md`

- [ ] **Step 1: Probe de disponibilidade**

Run: `command -v omp >/dev/null && omp --version || echo "SKIP: omp ausente — preencher o spike no primeiro ambiente com omp"`

- [ ] **Step 2: Confirmar e documentar em `omp/SPIKE-omp-api.md`** (com omp presente; senão registrar TODO bloqueante)

Responder, citando a doc/observação do omp:
1. **Formato de extensão aceito:** `.mjs` puro carrega? Ou exige `.ts`/`index.js`? Campo de manifesto correto (`omp.extensions`)?
2. **API de injeção de contexto no `session_start`:** qual entrega paridade com o `additionalContext` do Claude Code? (`pi.appendEntry`? evento `context`? `sendMessage`?) Qual `role` evita autoridade de system prompt indevida?
3. **Nomes exatos dos eventos:** `session_start`, compactação (`session_before_compact`/`session_compact`/`auto_compaction_*`), `tool_call`, `tool_result`.
4. **Shape do payload de `tool_call`/`tool_result`:** campos de nome de ferramenta e de path (`toolName`/`input.path`?), e se carrega `cwd`/`workspaceRoot`.
5. **Contrato de bloqueio em `tool_call`:** formato do retorno `{block, reason}`; existe equivalente de `ask`?

- [ ] **Step 3: Gate**

Marcar no topo do spike: `STATUS: confirmado` (ou `STATUS: pendente — bloqueia Tasks 7-9`). As Tasks 7/8/9 referenciam este doc; ajustar nomes de evento/API ali conforme o confirmado.

- [ ] **Step 4: Commit**

```bash
git add omp/SPIKE-omp-api.md
git commit -m "docs(omp): spike da API de extensão (gate da fase 2)"
```

### Task 4: `translate-tool-event.mjs` (cwd do evento + validação de path)

**Files:** Create `omp/lib/translate-tool-event.mjs`; Test `tests/omp/test-translate-tool-event.mjs`

- [ ] **Step 1: Teste que falha**

```javascript
// tests/omp/test-translate-tool-event.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { translateToolEvent } from "../../omp/lib/translate-tool-event.mjs";

test("edit → Edit + file_path; cwd do evento tem prioridade", () => {
  const out = translateToolEvent({ toolName: "edit", input: { path: "/p/a.ts" }, cwd: "/proj" }, { cwd: "/fallback" });
  assert.deepEqual(out, { tool_name: "Edit", tool_input: { file_path: "/p/a.ts" }, cwd: "/proj" });
});
test("sem cwd no evento → usa ctx.cwd", () => {
  const out = translateToolEvent({ toolName: "write", input: { path: "/p/b.ts" } }, { cwd: "/fallback" });
  assert.equal(out.cwd, "/fallback");
});
test("ast_edit → Edit (cobertura extra)", () => {
  assert.equal(translateToolEvent({ toolName: "ast_edit", input: { path: "/p/c.ts" } }, { cwd: "/p" }).tool_name, "Edit");
});
test("ferramenta não-edição → null", () => {
  assert.equal(translateToolEvent({ toolName: "bash", input: {} }, { cwd: "/p" }), null);
});
test("file_path com caractere de controle → null (M1)", () => {
  assert.equal(translateToolEvent({ toolName: "edit", input: { path: "/p/a\nb.ts" } }, { cwd: "/p" }), null);
  assert.equal(translateToolEvent({ toolName: "edit", input: { path: "/p/ .ts" } }, { cwd: "/p" }), null);
});
test("path não-absoluto → null (M1)", () => {
  assert.equal(translateToolEvent({ toolName: "edit", input: { path: "../etc/passwd" } }, { cwd: "/p" }), null);
});
test("aliases de path (file_path/filePath/workspaceRoot)", () => {
  assert.equal(translateToolEvent({ toolName: "edit", input: { file_path: "/p/d.ts" }, workspaceRoot: "/w" }, { cwd: "/f" }).cwd, "/w");
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-translate-tool-event.mjs` → FAIL (módulo inexistente)

- [ ] **Step 3: Implementar**

```javascript
// omp/lib/translate-tool-event.mjs
// Evento de ferramenta do omp → shape de evento Claude Code (stdin dos hooks).
// Retorna null quando NÃO é edição de arquivo OU o file_path é inválido (M1).
// cwd: prioriza o do evento (event.cwd/workspaceRoot) sobre ctx.cwd, porque
// process.cwd() pode apontar p/ worktree pi-iso errada (A2).

const EDIT_TOOLS = new Map([["edit", "Edit"], ["write", "Write"], ["ast_edit", "Edit"]]);
const CONTROL_RE = /[ -]/; // newline, NUL, etc.

/**
 * @param {{toolName:string, input?:Record<string,unknown>, cwd?:string, workspaceRoot?:string}} e
 * @param {{cwd:string}} ctx
 * @returns {{tool_name:string, tool_input:{file_path:string}, cwd:string} | null}
 */
export function translateToolEvent(e, ctx) {
  const tool = EDIT_TOOLS.get(e?.toolName);
  if (!tool) return null;
  const input = e.input ?? {};
  const raw = input.path ?? input.file_path ?? input.filePath ?? null;
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (CONTROL_RE.test(raw)) return null;          // M1: rejeita controle/newline/NUL
  if (!raw.startsWith("/")) return null;          // M1: exige caminho absoluto
  const cwd = e.cwd ?? e.workspaceRoot ?? ctx.cwd; // A2: prefere o do evento
  return { tool_name: tool, tool_input: { file_path: raw }, cwd };
}
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `node --test tests/omp/test-translate-tool-event.mjs` → PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add omp/lib/translate-tool-event.mjs tests/omp/test-translate-tool-event.mjs
git commit -m "feat(omp): translate-tool-event (cwd do evento + validação de path)"
```

### Task 5: `parse-hook-output.mjs` — envelope JSON dos hooks → {context, block, reason}

> Corrige o achado CRÍTICO C1: os hooks NÃO emitem `BLOCK:`; emitem JSON.

**Files:** Create `omp/lib/parse-hook-output.mjs`; Test `tests/omp/test-parse-hook-output.mjs`

- [ ] **Step 1: Teste que falha (cobre os shapes reais dos hooks)**

```javascript
// tests/omp/test-parse-hook-output.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHookOutput } from "../../omp/lib/parse-hook-output.mjs";

test("additionalContext (session-start/post-compact)", () => {
  const r = parseHookOutput(JSON.stringify({ hookSpecificOutput: { additionalContext: "CTX" } }));
  assert.deepEqual(r, { contextToInject: "CTX", block: false, reason: null });
});
test("permissionDecision deny → block (git-guard C1)", () => {
  const r = parseHookOutput(JSON.stringify({ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "branch protegida" } }));
  assert.equal(r.block, true);
  assert.equal(r.reason, "branch protegida");
  assert.equal(r.contextToInject, null); // NÃO injeta o JSON do deny como contexto
});
test("permissionDecision ask → block conservador", () => {
  assert.equal(parseHookOutput(JSON.stringify({ hookSpecificOutput: { permissionDecision: "ask", permissionDecisionReason: "?" } })).block, true);
});
test("allow/vazio → prossegue sem contexto", () => {
  assert.deepEqual(parseHookOutput(JSON.stringify({ hookSpecificOutput: { permissionDecision: "allow" } })), { contextToInject: null, block: false, reason: null });
  assert.deepEqual(parseHookOutput(""), { contextToInject: null, block: false, reason: null });
});
test("additional_context (snake_case) também aceito", () => {
  assert.equal(parseHookOutput(JSON.stringify({ additional_context: "C2" })).contextToInject, "C2");
});
test("texto puro não-JSON → injeta como contexto (fallback)", () => {
  assert.equal(parseHookOutput("texto cru de hook legado").contextToInject, "texto cru de hook legado");
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-parse-hook-output.mjs` → FAIL

- [ ] **Step 3: Implementar**

```javascript
// omp/lib/parse-hook-output.mjs
// Parseia o stdout de um hook DevFlow (protocolo Claude Code) para a decisão
// que a extensão omp precisa. Os hooks emitem JSON com exit 0:
//   contexto: { hookSpecificOutput: { additionalContext } }  (ou additional_context)
//   bloqueio: { hookSpecificOutput: { permissionDecision: "deny"|"ask", permissionDecisionReason } }
// Fallback: texto não-JSON é tratado como contexto a injetar.
/** @param {string} stdout @returns {{contextToInject:string|null, block:boolean, reason:string|null}} */
export function parseHookOutput(stdout) {
  const none = { contextToInject: null, block: false, reason: null };
  const text = (stdout ?? "").trim();
  if (!text) return none;
  let obj;
  try { obj = JSON.parse(text); } catch { return { ...none, contextToInject: text }; }
  const hso = obj.hookSpecificOutput ?? obj;
  const decision = hso.permissionDecision;
  if (decision === "deny" || decision === "ask") {
    return { contextToInject: null, block: true, reason: hso.permissionDecisionReason ?? "bloqueado pelo hook" };
  }
  const ctx = hso.additionalContext ?? hso.additional_context ?? obj.additionalContext ?? obj.additional_context ?? null;
  return { contextToInject: ctx, block: false, reason: null };
}
```

- [ ] **Step 4: Rodar e confirmar PASS**

Run: `node --test tests/omp/test-parse-hook-output.mjs` → PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add omp/lib/parse-hook-output.mjs tests/omp/test-parse-hook-output.mjs
git commit -m "feat(omp): parse-hook-output (envelope JSON → context/block) — corrige C1"
```

### Task 6: Detection-hardening — config MCP do omp

**Files:** Modify `hooks/session-start` (bloco de detecção MCP); Test `tests/hooks/test-session-start-omp-mcp-detection.sh`

- [ ] **Step 1: Teste de hook que falha**

```bash
# tests/hooks/test-session-start-omp-mcp-detection.sh
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
export HOME="$TMP/home"; mkdir -p "$HOME/.omp/agent"
cat > "$HOME/.omp/agent/mcp.json" <<'JSON'
{ "mcpServers": { "dotcontext": { "command": "npx" }, "mempalace": { "command": "mempalace-mcp" } } }
JSON
mkdir -p "$TMP/proj"
OUT=$(cd "$TMP/proj" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$REPO_ROOT/hooks/session-start" startup 2>/dev/null || true)
echo "$OUT" | grep -qi "mempalace" || { echo "FALHA: mempalace não detectado via config omp"; exit 1; }
echo "$OUT" | grep -qi "full" || { echo "FALHA: modo Full não detectado via dotcontext omp-global"; exit 1; }
echo "OK"
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `bash tests/hooks/test-session-start-omp-mcp-detection.sh` → FAIL (detecção só CC)

- [ ] **Step 3: Estender a detecção em `hooks/session-start`**

No bloco de `mempalace_available` (~L49-54) e no de `dotcontext`/modo, acrescentar (mantendo os checks CC):

```bash
elif [ -f "${project_root}/.omp/mcp.json" ] && grep -q '"mempalace"' "${project_root}/.omp/mcp.json" 2>/dev/null; then
  mempalace_available="true"
elif [ -f "${HOME}/.omp/agent/mcp.json" ] && grep -q '"mempalace"' "${HOME}/.omp/agent/mcp.json" 2>/dev/null; then
  mempalace_available="true"
```

(grep ancorado na chave entre aspas — reduz falso positivo, M2.) Replicar o encadeamento para `dotcontext` (que define `mode="full"`).

- [ ] **Step 4: Rodar → OK**

Run: `bash tests/hooks/test-session-start-omp-mcp-detection.sh` → `OK`

- [ ] **Step 5: Regressão**

Run: `bash tests/hooks/test-napkin-hooks.sh && bash tests/hooks/test-adr-context.sh`
Expected: PASS (detecção CC inalterada)

- [ ] **Step 6: Commit**

```bash
git add hooks/session-start tests/hooks/test-session-start-omp-mcp-detection.sh
git commit -m "fix(hooks): detectar mempalace/dotcontext no config MCP do omp"
```

### Task 7: `run-bash-hook.mjs` (probe de deps visível) + extensão `session_start`

**Files:** Create `omp/lib/run-bash-hook.mjs`; Create `omp/extension.mjs`; Test `tests/omp/test-run-bash-hook.mjs` + E2E `tests/omp/e2e-session-start.sh`

- [ ] **Step 1: Teste unit que falha — probe de deps**

```javascript
// tests/omp/test-run-bash-hook.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingDeps } from "../../omp/lib/run-bash-hook.mjs";

test("detecta deps ausentes (probe injetável)", () => {
  const present = new Set(["bash", "node"]); // python3 ausente
  assert.deepEqual(missingDeps((b) => present.has(b)), ["python3"]);
});
test("tudo presente → vazio", () => {
  assert.deepEqual(missingDeps(() => true), []);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test tests/omp/test-run-bash-hook.mjs` → FAIL

- [ ] **Step 3: Implementar `run-bash-hook.mjs` (com probe de python3/node/bash)**

```javascript
// omp/lib/run-bash-hook.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REQUIRED = ["bash", "node", "python3"]; // hooks chamam python3 (14 no post, 9 no pre)

/** @param {(bin:string)=>boolean} [probe] @returns {string[]} deps ausentes */
export function missingDeps(probe) {
  const has = probe ?? ((b) => spawnSync("command", ["-v", b], { shell: true }).status === 0);
  return REQUIRED.filter((b) => !has(b));
}

/**
 * Executa um hook bash do DevFlow e devolve o stdout cru. Falha graciosa.
 * @param {string} hookName @param {{args?:string[], stdin?:string, cwd?:string}} [opts]
 * @returns {string}
 */
export function runBashHook(hookName, opts = {}) {
  try {
    const r = spawnSync("bash", [join(PLUGIN_ROOT, "hooks", hookName), ...(opts.args ?? [])], {
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

- [ ] **Step 4: Rodar → PASS**

Run: `node --test tests/omp/test-run-bash-hook.mjs` → PASS (2/2)

- [ ] **Step 5: Escrever `omp/extension.mjs` (session_start; usa parse-hook-output; deps warning; canal de contexto)**

> Ajustar `INJECT` e o nome do evento conforme `omp/SPIKE-omp-api.md` (Task 3). `appendEntry` com `role:"user"`/contexto — **nunca `role:"system"`** (B1).

```javascript
// omp/extension.mjs
// Extensão omp do DevFlow — bridge fino (wrap & reuse dos hooks).
// API de injeção confirmada no SPIKE-omp-api.md (Task 3). Ajustar aqui se divergir.
import { runBashHook, missingDeps } from "./lib/run-bash-hook.mjs";
import { parseHookOutput } from "./lib/parse-hook-output.mjs";

// Canal de injeção de contexto (NÃO usar role:system — B1). Conforme spike.
function inject(pi, text) {
  if (text && text.trim()) pi.appendEntry({ role: "user", content: text });
}

/** @param {any} pi */
export default function ext(pi) {
  // Aviso visível (não silêncio) se faltarem deps dos hooks — Architect #2.
  const missing = missingDeps();
  if (missing.length) {
    pi.on("session_start", () =>
      inject(pi, `⚠️ DevFlow: dependências ausentes (${missing.join(", ")}). Hooks de standards/knowledge/git-guard podem não funcionar. Veja docs/omp-integration.md.`)
    );
  }

  pi.on("session_start", () => {
    const { contextToInject } = parseHookOutput(runBashHook("session-start", { args: ["startup"], cwd: process.cwd() }));
    inject(pi, contextToInject);
  });
}
```

- [ ] **Step 6: E2E session_start (skip se omp ausente)**

```bash
# tests/omp/e2e-session-start.sh
#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context/engineering/standards"
echo "git: { strategy: trunk-based }" > "$TMP/.context/.devflow.yaml"
cat > "$TMP/.context/engineering/standards/std-naming.md" <<'EOF'
---
type: standard
name: std-naming
---
# Naming
EOF
# Canário: o contexto injetado deve influenciar a resposta (não só ecoar).
OUT=$(cd "$TMP" && omp -e "$REPO_ROOT/omp/extension.mjs" -p "Liste em uma linha quais blocos DevFlow você recebeu no contexto." 2>/dev/null || true)
echo "$OUT" | grep -qi "DevFlow\|standard" || { echo "FALHA: contexto/índice de standards não chegou ao modelo no omp"; exit 1; }
echo "OK"
```

- [ ] **Step 7: Rodar o E2E**

Run: `bash tests/omp/e2e-session-start.sh` → `OK` (ou `SKIP: omp ausente`)

- [ ] **Step 8: Commit**

```bash
git add omp/lib/run-bash-hook.mjs omp/extension.mjs tests/omp/test-run-bash-hook.mjs tests/omp/e2e-session-start.sh
git commit -m "feat(omp): extensão session_start (parse-hook-output + probe deps + canal de contexto)"
```

### Task 8: Extensão — eventos de compactação

**Files:** Modify `omp/extension.mjs`; E2E `tests/omp/e2e-compact.sh`

- [ ] **Step 1: E2E que verifica o snapshot (skip se omp ausente)**

```bash
# tests/omp/e2e-compact.sh
#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context/workflow/.checkpoint"
( cd "$TMP" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$REPO_ROOT/hooks/pre-compact" >/dev/null 2>&1 || true )
test -f "$TMP/.context/workflow/.checkpoint/last.json" || { echo "FALHA: snapshot ausente"; exit 1; }
echo "OK"
```

- [ ] **Step 2: Rodar**

Run: `bash tests/omp/e2e-compact.sh` → `SKIP`/`OK`

- [ ] **Step 3: Adicionar handlers (nomes de evento conforme spike)**

Em `omp/extension.mjs`, dentro de `ext(pi)`:

```javascript
  pi.on("session_before_compact", () => { runBashHook("pre-compact", { cwd: process.cwd() }); });
  pi.on("session_compact", () => {
    const { contextToInject } = parseHookOutput(runBashHook("post-compact", { cwd: process.cwd() }));
    inject(pi, contextToInject);
  });
```

- [ ] **Step 4: Rodar o E2E**

Run: `bash tests/omp/e2e-compact.sh` → `OK`/`SKIP`

- [ ] **Step 5: Commit**

```bash
git add omp/extension.mjs tests/omp/e2e-compact.sh
git commit -m "feat(omp): handlers de compactação (MemPalace snapshot/rehidratação)"
```

### Task 9: Extensão — `tool_call` (pre) e `tool_result` (post) com bloqueio real

> Corrige C1/A1/A2: bloqueio via `parse-hook-output`; cwd derivado do `file_path`.

**Files:** Modify `omp/extension.mjs`; Create `omp/lib/resolve-cwd.mjs`; Test `tests/omp/test-resolve-cwd.mjs` + hook `tests/hooks/test-omp-tool-bridge.sh`

- [ ] **Step 1: Teste do resolvedor de cwd que falha**

```javascript
// tests/omp/test-resolve-cwd.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProjectCwd } from "../../omp/lib/resolve-cwd.mjs";

test("sobe até a raiz com .context a partir do file_path (A2)", () => {
  const root = mkdtempSync(join(tmpdir(), "rcwd-"));
  mkdirSync(join(root, ".context"), { recursive: true });
  mkdirSync(join(root, "src/deep"), { recursive: true });
  const f = join(root, "src/deep/a.ts"); writeFileSync(f, "x");
  assert.equal(resolveProjectCwd(f, "/processo/errado"), root);
});
test("sem marcador → fallback", () => {
  assert.equal(resolveProjectCwd("/no/marker/a.ts", "/fb"), "/fb");
});
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-resolve-cwd.mjs` → FAIL

- [ ] **Step 3: Implementar `resolve-cwd.mjs`**

```javascript
// omp/lib/resolve-cwd.mjs
// Deriva a raiz do projeto a partir do file_path editado (sobe procurando
// .context/ ou .git), em vez de confiar em process.cwd() — A2 (worktrees pi-iso).
import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

/** @param {string} filePath @param {string} fallbackCwd @returns {string} */
export function resolveProjectCwd(filePath, fallbackCwd) {
  let dir = dirname(filePath);
  const rootOf = parse(dir).root;
  while (dir && dir !== rootOf) {
    if (existsSync(join(dir, ".context")) || existsSync(join(dir, ".git"))) return dir;
    dir = dirname(dir);
  }
  return fallbackCwd;
}
```

- [ ] **Step 4: Rodar → PASS**

Run: `node --test tests/omp/test-resolve-cwd.mjs` → PASS

- [ ] **Step 5: Teste de hook do bridge (pre injeta knowledge; deny bloqueia)**

```bash
# tests/hooks/test-omp-tool-bridge.sh
#!/usr/bin/env bash
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
Conteúdo de produto/engenharia on-demand.
EOF
EVENT=$(node -e '
  import("'"$REPO_ROOT"'/omp/lib/translate-tool-event.mjs").then(m=>{
    process.stdout.write(JSON.stringify(m.translateToolEvent({toolName:"edit",input:{path:"'"$TMP"'/src/app.ts"},cwd:"'"$TMP"'"},{cwd:"'"$TMP"'"})));
  })')
echo "$EVENT" | grep -q '"tool_name":"Edit"' || { echo "FALHA: tradução"; exit 1; }
RAW=$(cd "$TMP" && echo "$EVENT" | CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$REPO_ROOT/hooks/pre-tool-use" 2>/dev/null || true)
# parse-hook-output deve extrair o additionalContext com o knowledge:
CTX=$(node -e 'import("'"$REPO_ROOT"'/omp/lib/parse-hook-output.mjs").then(m=>{let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(m.parseHookOutput(s).contextToInject||"")))})' <<<"$RAW")
echo "$CTX" | grep -qi "KNOWLEDGE_ONDEMAND\|Arquitetura" || { echo "FALHA: knowledge on-demand não extraído"; exit 1; }
echo "OK"
```

- [ ] **Step 6: Rodar — entender a cobertura**

Run: `bash tests/hooks/test-omp-tool-bridge.sh`
Expected: valida o **contrato tradução→hook→parse** (Tasks 4/5 + hook existente). Os handlers da extensão em si são validados pelo E2E sob omp. Se `KNOWLEDGE_ONDEMAND` não for extraído, o contrato está quebrado.

- [ ] **Step 7: Adicionar os handlers à extensão (bloqueio real via parse-hook-output)**

Topo de `omp/extension.mjs`:
```javascript
import { translateToolEvent } from "./lib/translate-tool-event.mjs";
import { resolveProjectCwd } from "./lib/resolve-cwd.mjs";
```
Dentro de `ext(pi)`:
```javascript
  pi.on("tool_call", (event) => {
    const cc = translateToolEvent(event, { cwd: process.cwd() });
    if (!cc) return;
    const cwd = resolveProjectCwd(cc.tool_input.file_path, cc.cwd); // A2
    const { contextToInject, block, reason } = parseHookOutput(
      runBashHook("pre-tool-use", { stdin: JSON.stringify({ ...cc, cwd }), cwd })
    );
    if (block) return { block: true, reason }; // C1: git-guard real
    inject(pi, contextToInject);
  });

  pi.on("tool_result", (event) => {
    const cc = translateToolEvent(event, { cwd: process.cwd() });
    if (!cc) return;
    const cwd = resolveProjectCwd(cc.tool_input.file_path, cc.cwd);
    const { contextToInject } = parseHookOutput(
      runBashHook("post-tool-use", { stdin: JSON.stringify({ ...cc, cwd }), cwd })
    );
    inject(pi, contextToInject);
  });
```

- [ ] **Step 8: Rodar testes**

Run: `bash tests/hooks/test-omp-tool-bridge.sh` → `OK`

- [ ] **Step 9: Regressão dos hooks de tool**

Run: `bash tests/hooks/test-post-tool-use.sh && bash tests/hooks/test-pre-tool-use-knowledge.sh`
Expected: PASS (caminho Claude Code inalterado)

- [ ] **Step 10: E2E de bloqueio sob omp (git-guard em branch protegida; skip se omp ausente)**

```bash
# tests/omp/e2e-git-guard.sh
#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
( cd "$TMP" && git init -q && git checkout -q -b main )
mkdir -p "$TMP/.context"
cat > "$TMP/.context/.devflow.yaml" <<'YAML'
git: { strategy: feature-branch, protected_branches: [main] }
YAML
# Tentar editar na main protegida → bridge deve bloquear (não apenas avisar).
OUT=$(cd "$TMP" && omp -e "$REPO_ROOT/omp/extension.mjs" -p "edite o arquivo $TMP/app.txt escrevendo 'x'" 2>&1 || true)
echo "$OUT" | grep -qi "block\|protegida\|protected" || { echo "FALHA: git-guard não bloqueou na main"; exit 1; }
test ! -f "$TMP/app.txt" || { echo "FALHA: edição prosseguiu em branch protegida"; exit 1; }
echo "OK"
```

- [ ] **Step 11: Rodar**

Run: `bash tests/omp/e2e-git-guard.sh` → `OK`/`SKIP`

- [ ] **Step 12: Commit**

```bash
git add omp/extension.mjs omp/lib/resolve-cwd.mjs tests/omp/test-resolve-cwd.mjs tests/hooks/test-omp-tool-bridge.sh tests/omp/e2e-git-guard.sh
git commit -m "feat(omp): bridge tool_call/tool_result com bloqueio real (C1/A1/A2)"
```

---

## Fase 3 — Enriquecimento de agentes + seleção de runtime no init

**Agent:** backend-specialist + refactoring-specialist | **Tests:** unit + integração

### Task 10: `omp-roles.yaml` (YAML padrão) + helper de parse reusável + schemas

**Files:** Modify `scripts/lib/frontmatter.mjs` (exportar `parseYaml`); Create `omp/omp-roles.yaml`; Create `omp/schemas/{review-verdict,validation-verdict}.json`; Test `tests/omp/test-omp-roles.mjs`

- [ ] **Step 1: Teste que falha**

```javascript
// tests/omp/test-omp-roles.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseYaml } from "../../scripts/lib/frontmatter.mjs";

test("parseia roles e defaults por agente (parser reusado, não regex frágil)", () => {
  const data = parseYaml(readFileSync("omp/omp-roles.yaml", "utf-8"));
  assert.equal(data.activities.brainstorming, "pi/plan");
  assert.equal(data.activities.fanout, "pi/smol");
  assert.equal(data.agent_role_defaults["security-auditor"].model, "pi/slow");
});
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-omp-roles.mjs` → FAIL (`parseYaml` não exportado / arquivo inexistente)

- [ ] **Step 3: Exportar `parseYaml` em `scripts/lib/frontmatter.mjs`**

Logo após `parseYamlSubset` (linha ~191), adicionar:
```javascript
export function parseYaml(text) { return parseYamlSubset(text); }
```

- [ ] **Step 4: Criar `omp/omp-roles.yaml` (YAML padrão aninhado — sem `{}` inline)**

```yaml
# Mapa atividade → model role do omp. Lido pelo enriquecedor e pelos skills de
# fase quando em omp. Inerte no Claude Code.
activities:
  brainstorming: pi/plan
  writing-plans: pi/plan
  deep-review: pi/slow
  execution: default
  fanout: pi/smol
  confirmation: commit
agent_role_defaults:
  architect:
    model: pi/plan
    thinking-level: high
  security-auditor:
    model: pi/slow
    thinking-level: high
    output: review-verdict
  code-reviewer:
    model: pi/slow
    output: review-verdict
  test-writer:
    model: default
    output: validation-verdict
  performance-optimizer:
    model: pi/slow
  feature-developer:
    model: default
  product-manager:
    model: pi/plan
  documentation-writer:
    model: commit
```

> Validar no Step 5 que `parseYamlSubset` suporta este aninhamento; se não, ajustar o subset ou o schema para o que ele suporta (manter formato padrão, nunca regex ad-hoc).

- [ ] **Step 5: Criar os schemas**

```json
// omp/schemas/review-verdict.json
{ "properties": { "overall_correctness": { "enum": ["correct", "incorrect"] }, "explanation": { "type": "string" }, "confidence": { "type": "number" } },
  "optionalProperties": { "findings": { "elements": { "properties": { "title": { "type": "string" }, "severity": { "type": "string" } } } } } }
```
```json
// omp/schemas/validation-verdict.json
{ "properties": { "passed": { "type": "boolean" }, "summary": { "type": "string" } },
  "optionalProperties": { "failures": { "elements": { "type": "string" } } } }
```

- [ ] **Step 6: Rodar → PASS**

Run: `node --test tests/omp/test-omp-roles.mjs` → PASS

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/frontmatter.mjs omp/omp-roles.yaml omp/schemas/ tests/omp/test-omp-roles.mjs
git commit -m "feat(omp): omp-roles.yaml (YAML padrão) + parseYaml reusado + schemas"
```

### Task 11: `omp-enrich-agents.mjs` — patch aditivo seguro (reusa parser; escapa valores)

**Files:** Create `scripts/lib/omp-enrich-agents.mjs`; Test `tests/omp/test-omp-enrich-agents.mjs`

- [ ] **Step 1: Teste que falha (inclui invariante de campos canônicos e valor adversário)**

```javascript
// tests/omp/test-omp-enrich-agents.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";
import { enrichAgentFrontmatter } from "../../scripts/lib/omp-enrich-agents.mjs";

const FILLED = `---\ntype: agent\nname: security-auditor\nrole: specialist\nphases: [R, V]\nstatus: filled\n---\n# Sec\ncorpo filled.\n`;

test("adiciona campos omp; canônicos e corpo intactos (invariante M3)", () => {
  const out = enrichAgentFrontmatter(FILLED, { model: "pi/slow", "thinking-level": "high" });
  const before = parseFrontmatter(FILLED).data, after = parseFrontmatter(out).data;
  assert.equal(after.model, "pi/slow");
  for (const k of ["type", "name", "role", "status"]) assert.equal(after[k] ?? JSON.stringify(after[k]), before[k] ?? JSON.stringify(before[k]));
  assert.match(parseFrontmatter(out).body, /corpo filled\./);
});
test("idempotente", () => {
  const a = enrichAgentFrontmatter(FILLED, { model: "pi/slow" });
  assert.equal((enrichAgentFrontmatter(a, { model: "pi/slow" }).match(/model: pi\/slow/g) || []).length, 1);
});
test("atualiza valor sem duplicar", () => {
  const a = enrichAgentFrontmatter(FILLED, { model: "default" });
  const b = enrichAgentFrontmatter(a, { model: "pi/slow" });
  assert.ok(b.includes("model: pi/slow") && !b.includes("model: default"));
});
test("valor com newline é rejeitado (M3 — não forja status)", () => {
  assert.throws(() => enrichAgentFrontmatter(FILLED, { model: "x\nstatus: unfilled" }), /valor inválido/);
});
test("CRLF não corrompe", () => {
  const crlf = FILLED.replace(/\n/g, "\r\n");
  assert.match(parseFrontmatter(enrichAgentFrontmatter(crlf, { model: "pi/slow" })).body, /corpo filled\./);
});
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-omp-enrich-agents.mjs` → FAIL

- [ ] **Step 3: Implementar (CRLF-aware; escapa valores; reusa parseFrontmatter no invariante)**

```javascript
// scripts/lib/omp-enrich-agents.mjs
// Patch ADITIVO de campos omp no frontmatter, preservando campos canônicos e
// corpo. Idempotente. Rejeita valores com controle/newline (M3). CRLF-aware.
import { parseFrontmatter } from "./frontmatter.mjs";

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const BAD_VALUE = /[\r\n ]/;

/** @param {string} content @param {Record<string,string>} ompFields @returns {string} */
export function enrichAgentFrontmatter(content, ompFields) {
  const m = content.match(FM_RE);
  if (!m) throw new Error("frontmatter ausente ou malformado");
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = m[1].split(/\r?\n/);
  for (const [key, value] of Object.entries(ompFields)) {
    if (BAD_VALUE.test(String(value))) throw new Error(`valor inválido para ${key}`);
    const keyRe = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*.*$`);
    const idx = lines.findIndex((l) => keyRe.test(l));
    const line = `${key}: ${value}`;
    if (idx >= 0) lines[idx] = line; else lines.push(line);
  }
  const out = `---${eol}${lines.join(eol)}${eol}---${eol}${m[2]}`;
  // Invariante M3: campos canônicos preservados (defense-in-depth).
  const a = parseFrontmatter(content).data, b = parseFrontmatter(out).data;
  for (const k of ["type", "name", "status"]) {
    if (k in a && JSON.stringify(a[k]) !== JSON.stringify(b[k])) throw new Error(`invariante violado: ${k}`);
  }
  return out;
}
```

- [ ] **Step 4: Rodar → PASS**

Run: `node --test tests/omp/test-omp-enrich-agents.mjs` → PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/omp-enrich-agents.mjs tests/omp/test-omp-enrich-agents.mjs
git commit -m "feat(omp): omp-enrich-agents — patch aditivo seguro (invariante + escape)"
```

### Task 12: `detect-installed-runtimes.mjs` + Step 0.5 no `project-init`

**Files:** Create `scripts/lib/detect-installed-runtimes.mjs`; Modify `skills/project-init/SKILL.md`; Test `tests/omp/test-detect-installed-runtimes.mjs`

- [ ] **Step 1: Teste que falha**

```javascript
// tests/omp/test-detect-installed-runtimes.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInstalledRuntimes } from "../../scripts/lib/detect-installed-runtimes.mjs";
test("só os presentes", () => assert.deepEqual(detectInstalledRuntimes((b) => new Set(["claude","omp"]).has(b)).sort(), ["claude","omp"]));
test("nenhum → vazio", () => assert.deepEqual(detectInstalledRuntimes(() => false), []));
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-detect-installed-runtimes.mjs` → FAIL

- [ ] **Step 3: Implementar**

```javascript
// scripts/lib/detect-installed-runtimes.mjs
import { spawnSync } from "node:child_process";
const RUNTIMES = ["claude", "opencode", "omp"];
/** @param {(bin:string)=>boolean} [probe] @returns {string[]} */
export function detectInstalledRuntimes(probe) {
  const has = probe ?? ((b) => spawnSync("command", ["-v", b], { shell: true }).status === 0);
  return RUNTIMES.filter((r) => has(r));
}
```

- [ ] **Step 4: Rodar → PASS**

Run: `node --test tests/omp/test-detect-installed-runtimes.mjs` → PASS

- [ ] **Step 5: Inserir Step 0.5 em `skills/project-init/SKILL.md`** (após Step 0, antes de "Initialization Strategy")

````markdown
## Step 0.5: Seleção de Runtime(s) (após o idioma)

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/detect-installed-runtimes.mjs"
```
Apresentar via AskUserQuestion **apenas os instalados** (multi-seleção), com o
corrente pré-marcado. Gravar em `.context/.devflow.yaml`: `runtimes: [claude, omp]`.
Ativar por runtime escolhido:
- `omp` → garantir o manifesto `omp.extensions` (Task 17) e rodar o enriquecimento
  de agentes omp no Step 4.6.
- `claude`/`opencode` → comportamento atual (nada extra).
````

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/detect-installed-runtimes.mjs tests/omp/test-detect-installed-runtimes.mjs skills/project-init/SKILL.md
git commit -m "feat(omp): seleção de runtime(s) no project-init (Step 0.5)"
```

### Task 13: `omp-enrich-project-agents.mjs` + Step 4.6 + reuso em config/sync

> Renumerado para **4.6** — Step 4.5 já existe (`project-init/SKILL.md:509`).

**Files:** Create `scripts/lib/omp-enrich-project-agents.mjs`; Modify `skills/project-init/SKILL.md`, `skills/config/SKILL.md`, `skills/context-sync/SKILL.md`; Test `tests/omp/test-omp-enrich-project-agents.mjs`

- [ ] **Step 1: Teste que falha**

```javascript
// tests/omp/test-omp-enrich-project-agents.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrichProjectAgents } from "../../scripts/lib/omp-enrich-project-agents.mjs";

test("aplica defaults omp preservando corpo filled", () => {
  const dir = mkdtempSync(join(tmpdir(), "omp-enrich-"));
  mkdirSync(join(dir, ".context/agents"), { recursive: true });
  const f = join(dir, ".context/agents/security-auditor.md");
  writeFileSync(f, `---\ntype: agent\nname: security-auditor\nrole: specialist\nphases: [R, V]\nstatus: filled\n---\n# Sec\ncorpo filled.\n`);
  const changed = enrichProjectAgents(dir);
  assert.ok(changed.includes("security-auditor"));
  const out = readFileSync(f, "utf-8");
  assert.ok(out.includes("model: pi/slow") && out.includes("corpo filled."));
});
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-omp-enrich-project-agents.mjs` → FAIL

- [ ] **Step 3: Implementar (usa parseYaml + enrichAgentFrontmatter — sem parser ad-hoc)**

```javascript
// scripts/lib/omp-enrich-project-agents.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./frontmatter.mjs";
import { enrichAgentFrontmatter } from "./omp-enrich-agents.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @param {string} projectRoot @returns {string[]} agentes alterados */
export function enrichProjectAgents(projectRoot) {
  const dir = join(projectRoot, ".context/agents");
  if (!existsSync(dir)) return [];
  const roles = parseYaml(readFileSync(join(PLUGIN_ROOT, "omp/omp-roles.yaml"), "utf-8"));
  const defaults = roles.agent_role_defaults ?? {};
  const changed = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const name = file.replace(/\.md$/, "");
    const fields = defaults[name];
    if (!fields) continue;
    const path = join(dir, file);
    writeFileSync(path, enrichAgentFrontmatter(readFileSync(path, "utf-8"), fields));
    changed.push(name);
  }
  return changed;
}
```

- [ ] **Step 4: Rodar → PASS**

Run: `node --test tests/omp/test-omp-enrich-project-agents.mjs` → PASS

- [ ] **Step 5: Inserir Step 4.6 em `skills/project-init/SKILL.md`** (após o Step 4.5 existente)

````markdown
## Step 4.6: Enriquecimento omp dos agentes (só se `omp` ∈ runtimes)

Se `.context/.devflow.yaml` lista `omp`, enriquecer os agentes gerados —
**patch aditivo no frontmatter, nunca toca o corpo filled** (HARD-GATE):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/omp-enrich-project-agents.mjs" "$PWD"
```
Apresentar os defaults propostos por agente (de `omp/omp-roles.yaml`) e permitir
ajuste antes de confirmar.
````

- [ ] **Step 6: Referenciar em config/context-sync**

- `skills/config/SKILL.md`: adicionar ação "Re-tunar campos omp dos agentes — roda `omp-enrich-project-agents.mjs` (só campos omp; preserva corpo)."
- `skills/context-sync/SKILL.md`: na atualização de agentes, "Com `omp` ∈ runtimes, aplicar só o patch omp via `omp-enrich-project-agents.mjs` (não regenerar corpo)."

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/omp-enrich-project-agents.mjs tests/omp/test-omp-enrich-project-agents.mjs skills/project-init/SKILL.md skills/config/SKILL.md skills/context-sync/SKILL.md
git commit -m "feat(omp): Step 4.6 enrich agentes pós-fill + reuso em config/sync"
```

---

## Fase 4 — Dispatch de subagents via `task` tool

**Agent:** refactoring-specialist | **Tests:** content smoke + E2E real sob omp

> Estas tasks editam skills (instruções markdown). O content-check é **smoke**; a prova real é o E2E sob omp (skip se ausente) — atende `feedback_tdd_always`.

### Task 14: Branch omp no `parallel-dispatch`

**Files:** Modify `skills/parallel-dispatch/SKILL.md`; Test `tests/omp/test-parallel-dispatch-omp-branch.mjs` + E2E `tests/omp/e2e-task-dispatch.sh`

- [ ] **Step 1: Smoke que falha**

```javascript
// tests/omp/test-parallel-dispatch-omp-branch.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("branch omp: task tool + worktree + output + detect-runtime", () => {
  const s = readFileSync("skills/parallel-dispatch/SKILL.md", "utf-8");
  for (const re of [/omp/i, /\btask\b/, /worktree|isolated|isolation/i, /output schema|output:/i, /detect-runtime/]) assert.match(s, re);
});
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-parallel-dispatch-omp-branch.mjs` → FAIL

- [ ] **Step 3: Adicionar a seção ao skill**

````markdown
## Branch omp (quando `detect-runtime` reporta `omp`)

Despache via o **`task` tool** nativo em vez do `Task` do Claude Code:
- `isolated: true` → worktree isolada (`pi-iso`) por subagent.
- `agent` (nome exato) + `tasks: [{ id, description, assignment }]`.
- Review/validação: passe `schema` (output schema de `omp/schemas/*.json`) p/ JSON validado.
- Respeite o `spawns` allowlist do frontmatter; fan-out independente com `model: pi/smol`.
Ao final, verifique integração e merge das worktrees (igual ao caminho CC).
````

- [ ] **Step 4: Rodar → PASS**

Run: `node --test tests/omp/test-parallel-dispatch-omp-branch.mjs` → PASS

- [ ] **Step 5: E2E real (skip se omp ausente) — task dispatch retorna output validado**

```bash
# tests/omp/e2e-task-dispatch.sh
#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
( cd "$TMP" && git init -q )
echo "ok" > "$TMP/a.txt"
# Pede ao omp para despachar um subagent via task com output schema e reportar o JSON.
OUT=$(cd "$TMP" && omp -p "use o task tool com o agent 'explore' e um output schema {\"properties\":{\"done\":{\"type\":\"boolean\"}}} para confirmar que a.txt existe; reporte o JSON retornado" 2>/dev/null || true)
echo "$OUT" | grep -qi "done\|true\|{" || { echo "FALHA: task tool não retornou output estruturado"; exit 1; }
echo "OK"
```

- [ ] **Step 6: Rodar**

Run: `bash tests/omp/e2e-task-dispatch.sh` → `OK`/`SKIP`

- [ ] **Step 7: Commit**

```bash
git add skills/parallel-dispatch/SKILL.md tests/omp/test-parallel-dispatch-omp-branch.mjs tests/omp/e2e-task-dispatch.sh
git commit -m "feat(omp): branch de dispatch via task tool no parallel-dispatch (+E2E real)"
```

### Task 15: Branch omp no `autonomous-loop` (gates leem JSON)

**Files:** Modify `skills/autonomous-loop/SKILL.md`; Test `tests/omp/test-autonomous-loop-omp-branch.mjs`

- [ ] **Step 1: Smoke que falha**

```javascript
// tests/omp/test-autonomous-loop-omp-branch.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("autonomous-loop omp: task + gate por output JSON + smol", () => {
  const s = readFileSync("skills/autonomous-loop/SKILL.md", "utf-8");
  for (const re of [/omp/i, /\btask\b/, /output schema|JSON validado|validated/i, /pi\/smol|smol/, /detect-runtime/]) assert.match(s, re);
});
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-autonomous-loop-omp-branch.mjs` → FAIL

- [ ] **Step 3: Adicionar a seção ao skill (no Step 3 — Execute Story)**

````markdown
### Branch omp (quando `detect-runtime` reporta `omp`)

No Step 3c, em vez do `Task` do Claude Code:
- `task` com `agent: <story.agent>`, `isolated: true`, e `schema` do output do agente
  (`omp/schemas/review-verdict.json` p/ review; `validation-verdict.json` p/ validação).
- Stories independentes (sem `blocked_by` mútuo) num único `task` com várias entries,
  concorrentes, `model: pi/smol`.
No Step 4, os **gates leem o JSON validado** (`overall_correctness === "correct"`,
`passed === true`) em vez de prosa. Mesmas regras de retry/escalonamento/circuit-breaker.
````

- [ ] **Step 4: Rodar → PASS**

Run: `node --test tests/omp/test-autonomous-loop-omp-branch.mjs` → PASS

- [ ] **Step 5: Commit**

```bash
git add skills/autonomous-loop/SKILL.md tests/omp/test-autonomous-loop-omp-branch.mjs
git commit -m "feat(omp): branch de execução via task + gates por output JSON"
```

---

## Fase 5 — Model roles nas fases + distribuição/docs

**Agent:** documentation-writer + devops-specialist

### Task 16: Skills de fase consultam `omp-roles.yaml`

**Files:** Modify `skills/prevc-planning/SKILL.md`, `skills/prevc-review/SKILL.md`, `skills/prevc-execution/SKILL.md`; Test `tests/omp/test-phase-skills-roles.mjs`

- [ ] **Step 1: Smoke que falha**

```javascript
// tests/omp/test-phase-skills-roles.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
for (const [skill, role] of [["skills/prevc-planning/SKILL.md","pi/plan"],["skills/prevc-review/SKILL.md","pi/slow"],["skills/prevc-execution/SKILL.md","pi/smol"]]) {
  test(`${skill} cita omp-roles e ${role}`, () => {
    const s = readFileSync(skill, "utf-8");
    assert.match(s, /omp-roles\.yaml/);
    assert.match(s, new RegExp(role.replace("/", "\\/")));
  });
}
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-phase-skills-roles.mjs` → FAIL

- [ ] **Step 3: Adicionar nota de role a cada skill**

Em cada skill, uma seção curta (citando o role da fase: planning→`pi/plan`, review→`pi/slow`, execution→`default`/`pi/smol`):
````markdown
## Model role (omp)
Quando `detect-runtime` = `omp`, selecione o role conforme `omp/omp-roles.yaml`.
No Claude Code esta seção é inerte.
````

- [ ] **Step 4: Rodar → PASS**

Run: `node --test tests/omp/test-phase-skills-roles.mjs` → PASS

- [ ] **Step 5: Commit**

```bash
git add skills/prevc-planning/SKILL.md skills/prevc-review/SKILL.md skills/prevc-execution/SKILL.md tests/omp/test-phase-skills-roles.mjs
git commit -m "feat(omp): skills de fase consultam model roles do omp"
```

### Task 17: Manifesto `omp.extensions` (package.json mínimo, sem version)

> `package.json` mínimo — **sem `version`/`name`** para não duplicar a fonte de verdade do `.claude-plugin/plugin.json` (Architect #5).

**Files:** Create `package.json`; Test `tests/omp/test-omp-manifest.mjs`

- [ ] **Step 1: Teste que falha (manifesto + regressão de não-interferência)**

```javascript
// tests/omp/test-omp-manifest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
test("package.json declara omp.extensions e NÃO duplica version", () => {
  assert.ok(existsSync("package.json"));
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  assert.ok(Array.isArray(pkg.omp?.extensions) && pkg.omp.extensions.includes("./omp/extension.mjs"));
  assert.ok(!("version" in pkg), "version não deve viver no package.json (fonte de verdade é plugin.json)");
  assert.equal(pkg.private, true);
});
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-omp-manifest.mjs` → FAIL

- [ ] **Step 3: Criar `package.json` mínimo**

```json
{
  "private": true,
  "description": "DevFlow — manifesto de descoberta de extensão para o omp (não publicado no npm)",
  "omp": { "extensions": ["./omp/extension.mjs"] }
}
```

- [ ] **Step 4: Rodar + regressão (CC ignora o package.json)**

Run: `node --test tests/omp/test-omp-manifest.mjs && bash tests/hooks/test-napkin-hooks.sh`
Expected: PASS + `PASS` (hooks/CC inalterados)

- [ ] **Step 5: E2E — omp enxerga a extensão (skip se ausente)**

Run: `command -v omp >/dev/null && (cd /tmp && omp plugin list 2>/dev/null | grep -qi devflow && echo "visível" || echo "validar manualmente") || echo "SKIP"`

- [ ] **Step 6: Commit**

```bash
git add package.json tests/omp/test-omp-manifest.mjs
git commit -m "feat(omp): manifesto omp.extensions (package.json mínimo, sem version)"
```

### Task 18: Documentação de instalação/uso no omp

**Files:** Create `docs/omp-integration.md`; Modify `README.md`; Test `tests/omp/test-omp-docs.mjs`

- [ ] **Step 1: Teste que falha (cobre seções E o pré-requisito python3)**

```javascript
// tests/omp/test-omp-docs.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
test("doc cobre install, subsistemas e pré-requisitos", () => {
  assert.ok(existsSync("docs/omp-integration.md"));
  const d = readFileSync("docs/omp-integration.md", "utf-8");
  for (const k of ["marketplace add", "standards", "ADR", "knowledge", "MemPalace", "runtime", "python3", "task tool"]) assert.ok(d.includes(k), `seção ausente: ${k}`);
});
```

- [ ] **Step 2: Rodar → FAIL**

Run: `node --test tests/omp/test-omp-docs.mjs` → FAIL

- [ ] **Step 3: Escrever `docs/omp-integration.md`** (pt-BR), cobrindo:
- Instalação: `/marketplace add NEXUZ-SYS/devflow` no omp; ativação via `runtimes` no init.
- **Pré-requisitos:** `bash`, `node`, **`python3`** (os hooks dependem dele; a extensão avisa se faltar).
- Tabela de cobertura por subsistema (modo, standards, ADR, knowledge/produto, napkin, routines, MemPalace) e como cada um se comporta no omp.
- Model roles; dispatch de subagents via **`task` tool** (worktree + output schema).
- Nota de segurança: a extensão roda no TCB do plugin (não-sandboxed, mesmo processo).
- Limitações conhecidas (itens fora de escopo / fase C futura).
Incluir literalmente os termos verificados pelo teste.

- [ ] **Step 4: Nota no `README.md`**

Subseção curta "## Rodando no omp (oh-my-pi)" com link para `docs/omp-integration.md`.

- [ ] **Step 5: Rodar → PASS**

Run: `node --test tests/omp/test-omp-docs.mjs` → PASS

- [ ] **Step 6: Commit**

```bash
git add docs/omp-integration.md README.md tests/omp/test-omp-docs.mjs
git commit -m "docs(omp): guia de integração no omp (install, subsistemas, python3, task)"
```

---

## Suíte completa (rodar ao fim de cada fase)

```bash
node --test tests/omp/*.mjs
for t in tests/hooks/test-session-start-omp-mcp-detection.sh tests/hooks/test-omp-tool-bridge.sh; do bash "$t"; done
for t in tests/omp/e2e-*.sh; do bash "$t"; done   # SKIP se omp ausente
```

## Mapa de rastreabilidade da review

| Achado (severidade) | Resolvido em |
|---|---|
| C1 — git-guard no-op (`BLOCK:` inexistente) | Task 5 (parse-hook-output) + Task 9 (block real + E2E git-guard) |
| A1 — paridade de injeção não provada | Task 3 (spike) + Task 7 (E2E com canário) |
| A2 — `cwd` de `process.cwd()` | Task 4 + Task 9 (resolve-cwd) |
| python3 silencioso | Task 7 (probe visível) + Task 18 (pré-requisito) |
| Colisão Step 4.5 | Task 13 (renumerado p/ 4.6) |
| Reuso de libs / YAML frágil | Task 10 (parseYaml) + Task 11 (parseFrontmatter) + Task 13 |
| M1 — file_path adversário | Task 4 |
| M3 — valor de frontmatter | Task 11 (escape + invariante) |
| B1 — `role:system` | Task 7 (`inject` via `role:user`) |
| Content-checks fracos | Tasks 14/15 (E2E real) + Task 18 (cobre python3/task) |
| package.json/version | Task 17 (mínimo, sem version, + regressão) |
| standards no session_start | Task 7 (E2E com std fixture) |

## Fora de escopo (YAGNI — fase C futura via ADR/PRD)

Loop PREVC determinístico em TS, telemetria por fase/story, renderers de TUI, roteamento dinâmico de modelo, fusão MemPalace↔Hindsight.
