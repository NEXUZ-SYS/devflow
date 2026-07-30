# `readBlockField` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o falso-positivo do check `grounding-mcp` removendo o parser ad-hoc do doctor — e, com ele, a lacuna de API que o obrigava a existir.

**Architecture:** `gitBlock(text)` vira `namedBlock(text, name)` (uma linha parametrizada); `readBlockField` exporta a combinação com o `findScalar` existente, que **já** remove comentário inline. O doctor troca ~20 linhas de parse próprio por duas chamadas.

**Tech Stack:** Node ESM puro, `node --test`, fixtures em tmpdir.

**Spec:** [`../specs/2026-07-23-grounding-mcp-nested-field-design.md`](../specs/2026-07-23-grounding-mcp-nested-field-design.md)

## Global Constraints

- **Retrocompatibilidade obrigatória:** `readField`, `readAutoFinish` e `readVersioning` não mudam de comportamento. `gitBlock` continua existindo como atalho de `namedBlock(text, "git")`.
- **Nada de parser novo:** `stripInlineComment` (`/\s+#.*$/`) e a ancoragem por `:` do `findScalar` já existem — reusar, nunca reimplementar.
- **Sem dependência YAML** — a lib é subset-parser por decisão do ADR-011.
- **Escopo travado:** só o `grounding-mcp` migra. `instinct-config`, `orchestrator-config` e `standard-audit` **não são tocados**.
- **`requiredSignals: [unit, lint]`.**
- **Idioma:** comentários, commits e prosa em pt-BR.

---

### Task 1: `namedBlock` + `readBlockField` na lib

**Files:**
- Modify: `scripts/lib/devflow-config.mjs` (`gitBlock` na linha ~32; novo export; bloco `main` do CLI)
- Test: `tests/lib/test-devflow-config-block-field.mjs`

**Interfaces:**
- Consumes: `findScalar(block, field) → { indent, raw, idx } | null` (interna, já existente — `raw` **já vem** sem comentário inline).
- Produces: `readBlockField(src: string, block: string, field: string) → string | null`, exportada. CLI: `read-block-field <bloco> <campo> <path>` → imprime o valor ou linha vazia.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/lib/test-devflow-config-block-field.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBlockField, readField } from "../../scripts/lib/devflow-config.mjs";

const YAML = `git:
  strategy: branch-flow
  prCli: gh
  versioning: pipeline

grounding:
  mode: docs-only        # docs-first | docs-only
  docsMcpServer: docs-mcp-server  # server canônico de documentação
  blockWeb: true

instincts:
  enabled: true
`;

test("o bug: comentário inline não vaza para o valor", () => {
  assert.equal(readBlockField(YAML, "grounding", "docsMcpServer"), "docs-mcp-server");
  assert.equal(readBlockField(YAML, "grounding", "mode"), "docs-only");
});

test("lê campo de bloco aninhado (readField só sabe ler git:)", () => {
  assert.equal(readField(YAML, "docsMcpServer"), null, "readField não deve encontrar fora de git:");
  assert.equal(readBlockField(YAML, "grounding", "docsMcpServer"), "docs-mcp-server");
  assert.equal(readBlockField(YAML, "instincts", "enabled"), "true");
});

test("bloco inexistente → null", () => {
  assert.equal(readBlockField(YAML, "naoexiste", "mode"), null);
});

test("campo inexistente no bloco → null", () => {
  assert.equal(readBlockField(YAML, "grounding", "naoexiste"), null);
});

test("não vaza entre blocos", () => {
  assert.equal(readBlockField(YAML, "grounding", "strategy"), null, "strategy é de git:, não de grounding:");
  assert.equal(readBlockField(YAML, "git", "docsMcpServer"), null, "docsMcpServer é de grounding:, não de git:");
});

test("ancoragem por ':' — prefixo não casa", () => {
  const y = "grounding:\n  modeExtra: x\n";
  assert.equal(readBlockField(y, "grounding", "mode"), null, "'mode' não pode casar com 'modeExtra'");
});

test("não-regressão: readField segue lendo git:", () => {
  assert.equal(readField(YAML, "prCli"), "gh");
  assert.equal(readField(YAML, "strategy"), "branch-flow");
});

test("entrada suja não lança", () => {
  assert.doesNotThrow(() => readBlockField("", "grounding", "mode"));
  assert.equal(readBlockField("", "grounding", "mode"), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/lib/test-devflow-config-block-field.mjs`

Expected: FAIL — `SyntaxError: The requested module … does not provide an export named 'readBlockField'`.

- [ ] **Step 3: Generalizar o bloco**

Em `scripts/lib/devflow-config.mjs`, substituir a função `gitBlock`:

```js
function gitBlock(text) {
  const lines = normalizeNewlines(text).split("\n");
  const block = [];
  let inGit = false;
  for (const line of lines) {
    if (!inGit) {
      if (/^git:\s*$/.test(line)) inGit = true;
      continue;
    }
    if (line.trim() !== "" && !/^\s/.test(line)) break; // dedent → fim do bloco
    block.push(line);
  }
  return block;
}
```

por:

```js
// Coleta as linhas de um bloco de topo (`<name>:` sem valor) até o dedent.
// Genérica desde 2026-07-23: `readField` cobria só `git:`, o que empurrava os
// consumidores de campos aninhados (grounding:, instincts:, …) a escrever
// parser ad-hoc — a violação do ADR-011 era lacuna de API, não indisciplina.
function namedBlock(text, name) {
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = new RegExp("^" + esc + ":\\s*$");
  const lines = normalizeNewlines(text).split("\n");
  const block = [];
  let inBlock = false;
  for (const line of lines) {
    if (!inBlock) {
      if (head.test(line)) inBlock = true;
      continue;
    }
    if (line.trim() !== "" && !/^\s/.test(line)) break; // dedent → fim do bloco
    block.push(line);
  }
  return block;
}

// Atalho retrocompatível: os call-sites internos seguem inalterados.
function gitBlock(text) {
  return namedBlock(text, "git");
}
```

- [ ] **Step 4: Exportar `readBlockField`**

Logo após o `export function readField(...)` existente, acrescentar:

```js
// Lê um escalar de QUALQUER bloco de topo. Herda de `findScalar` a remoção de
// comentário inline e a ancoragem por `:` (prefixo não casa: `modeExtra` != `mode`).
export function readBlockField(src, block, field) {
  try {
    const f = findScalar(namedBlock(src, block), field);
    return f ? f.raw : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Acrescentar o comando ao CLI**

Em `main(argv)`, logo após o ramo `read-field`, inserir:

```js
  } else if (cmd === "read-block-field") {
    const block = argv[1];
    const name = argv[2];
    const text = readTextOrNull(argv[3]);
    if (!block || !name) { console.error("uso: devflow-config read-block-field <bloco> <campo> <path>"); process.exit(2); }
    process.stdout.write((text == null ? "" : (readBlockField(text, block, name) ?? "")) + "\n");
```

E atualizar a linha de uso no `else` final:

```js
    console.error("uso: devflow-config <read-autofinish|read-versioning|read-field <campo>|read-block-field <bloco> <campo>|read-verify> <path>");
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `node --test tests/lib/test-devflow-config-block-field.mjs`

Expected: PASS — 8 testes, 0 falhas.

- [ ] **Step 7: Confirmar a não-regressão da lib inteira**

Run: `node --test tests/lib/test-devflow-yaml-verify-block.mjs tests/lib/test-config-guard-verify.mjs tests/lib/test-verify-contract.mjs`

Expected: PASS. Se algo falhar aqui, `namedBlock` quebrou um call-site interno — corrigir antes de seguir.

- [ ] **Step 8: Verificar o CLI na config real**

```bash
node scripts/lib/devflow-config.mjs read-block-field grounding docsMcpServer .context/.devflow.yaml
```

Expected: `docs-mcp-server` — **sem** o comentário. (Antes desta task, `read-field docsMcpServer` devolvia linha vazia.)

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/devflow-config.mjs tests/lib/test-devflow-config-block-field.mjs
git commit -m "feat(config): readBlockField lê campo de qualquer bloco de topo

readField era hard-coded ao bloco git:, então quem precisava de campo sob
grounding:/instincts:/orchestrator: não tinha caminho e escrevia parser
ad-hoc — a violação do ADR-011 era lacuna de API, não indisciplina.

gitBlock vira namedBlock(text, name) com o nome parametrizado; os 3
call-sites internos seguem intactos. readBlockField herda de findScalar a
remoção de comentário inline e a ancoragem por ':'."
```

---

### Task 2: Migrar o check `grounding-mcp`

**Files:**
- Modify: `scripts/lib/doctor.mjs` (função `parseGrounding` ~linha 200-221; `run` do check `groundingMcp`)
- Test: `tests/lib/test-doctor-grounding-mcp.mjs`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: da Task 1 — `readBlockField(src, "grounding", campo) → string | null`.
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/lib/test-doctor-grounding-mcp.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCheck } from "../../scripts/lib/doctor.mjs";

// Reproduz o .devflow.yaml real: comentário inline em AMBOS os campos.
const COM_COMENTARIO = `git:
  strategy: branch-flow

grounding:
  mode: docs-only        # docs-first | docs-only
  docsMcpServer: docs-mcp-server  # server canônico de documentação
  blockWeb: true
`;

function repo(yaml, mcpServers) {
  const d = mkdtempSync(join(tmpdir(), "dgm-"));
  mkdirSync(join(d, ".context"), { recursive: true });
  writeFileSync(join(d, ".context", ".devflow.yaml"), yaml);
  writeFileSync(join(d, ".mcp.json"), JSON.stringify({ mcpServers }, null, 2));
  return d;
}

const check = getCheck("grounding-mcp");
const ctx = (cwd) => ({ cwd, which: () => true, exec: () => ({ code: 0, stdout: "", stderr: "" }) });

test("o falso-positivo: comentário inline + server presente → OK", () => {
  const d = repo(COM_COMENTARIO, { "docs-mcp-server": { command: "x" }, dotcontext: { command: "y" } });
  const r = check.run(ctx(d));
  assert.equal(r.status, "OK", `esperava OK, veio ${r.status}: ${r.diagnosis}`);
});

test("o alerta legítimo sobrevive: server ausente → WARN", () => {
  const d = repo(COM_COMENTARIO, { dotcontext: { command: "y" } });
  const r = check.run(ctx(d));
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /docs-mcp-server/);
  assert.doesNotMatch(r.diagnosis, /#/, "o diagnóstico não pode exibir o comentário inline");
});

test("grounding desativado → OK (sem exigir MCP)", () => {
  const d = repo("grounding:\n  mode: off\n", {});
  const r = check.run(ctx(d));
  assert.equal(r.status, "OK");
});

test("sem seção grounding → OK", () => {
  const d = repo("git:\n  strategy: branch-flow\n", {});
  const r = check.run(ctx(d));
  assert.equal(r.status, "OK");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/lib/test-doctor-grounding-mcp.mjs`

Expected: FAIL no primeiro teste — `esperava OK, veio WARN: … 'docs-mcp-server  # server canônico de documentação' não está no .mcp.json`. Esse é o bug reproduzido em fixture.

- [ ] **Step 3: Remover o parser ad-hoc**

Em `scripts/lib/doctor.mjs`, apagar a função `parseGrounding` inteira (o bloco que começa com o comentário `// Parse the grounding section of .context/.devflow.yaml (no YAML dep).` e termina no `return { mode, server };` + `}`).

- [ ] **Step 4: Migrar o check para a lib**

No objeto `groundingMcp`, substituir a chamada ao parser removido pela leitura via lib. O `run` passa a começar assim:

```js
  run(ctx) {
    const cfgPath = join(ctx.cwd, ".context", ".devflow.yaml");
    const raw = existsSync(cfgPath) ? readFileSync(cfgPath, "utf-8") : "";
    // ADR-011: parser único. O ad-hoc daqui engolia o comentário inline e
    // comparava "docs-mcp-server  # …" contra as chaves do .mcp.json.
    const mode = readBlockField(raw, "grounding", "mode");
    const server = readBlockField(raw, "grounding", "docsMcpServer");
```

Manter o restante da lógica do check exatamente como está (a condição de `mode` desativado, a comparação com as chaves do `.mcp.json`, as mensagens).

Acrescentar `readBlockField` ao import já existente no topo do arquivo:

```js
import { readVerifyFromPath, readBlockField } from "./devflow-config.mjs";
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node --test tests/lib/test-doctor-grounding-mcp.mjs`

Expected: PASS — 4 testes, 0 falhas.

- [ ] **Step 6: Confirmar no repo real**

```bash
node scripts/doctor.mjs 2>/dev/null | grep -A2 "Doc-grounding"
```

Expected: `✓ [OK]` — o WARN falso desapareceu. O total passa de `2 WARN` para `1 WARN` (o restante é o `claude mcp list`, alheio a esta correção).

- [ ] **Step 7: Rodar o loop rápido inteiro**

Run: `bash tests/run-unit.sh`

Expected: exit 0, sem regressão nos demais checks do doctor nem nos consumidores da lib.

- [ ] **Step 8: Registrar no CHANGELOG**

Em `CHANGELOG.md`, sob `## [Unreleased]`, inserir:

```markdown
### Fixed — `/devflow:devflow-doctor`: falso-positivo no check `grounding-mcp`

O check acusava que o `docsMcpServer` não estava no `.mcp.json` **quando estava** — a
mensagem de erro exibia o próprio sintoma: `'docs-mcp-server  # server canônico de
documentação'`, com o comentário inline colado ao valor. Um WARN permanente e enganoso
no comando que existe para dizer a verdade sobre a saúde do contexto.

- **`scripts/lib/devflow-config.mjs`** — `readBlockField(src, bloco, campo)` (nova, exportada)
  lê um escalar de **qualquer** bloco de topo, herdando de `findScalar` a remoção de comentário
  inline e a ancoragem por `:`. Internamente, `gitBlock` virou `namedBlock(text, name)` com o
  nome parametrizado; os call-sites existentes seguem intactos. CLI: `read-block-field`.
- **`grounding-mcp`** — o parser ad-hoc do doctor (~20 linhas, comentado no código como
  *"no YAML dep"*) saiu; o check passa a usar a lib.

**Causa raiz, não só sintoma:** `readField` era hard-coded ao bloco `git:`, então quem
precisava de campo sob `grounding:`/`instincts:`/`orchestrator:` não tinha caminho e escrevia
o próprio parser. A violação do ADR-011 era **lacuna de API**, não indisciplina — e a mesma
classe de bug já havia custado um deny repo-wide no `permissions.yaml`. Os outros três
consumidores com parse próprio funcionam hoje e não foram tocados; a API está disponível
para quando forem migrados.
```

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/doctor.mjs tests/lib/test-doctor-grounding-mcp.mjs CHANGELOG.md
git commit -m "fix(doctor): grounding-mcp para de acusar MCP presente como ausente

O parser ad-hoc engolia o comentário inline e comparava
'docs-mcp-server  # server canônico de documentação' contra as chaves do
.mcp.json. Migrado para readBlockField (ADR-011).

O teste do alerta legítimo (server realmente ausente → WARN) acompanha:
corrigir falso-positivo não pode virar falso-negativo."
```

---

## Self-Review

**Cobertura do spec:**

| Requisito do spec | Task/Step |
|---|---|
| D1 — `namedBlock` parametrizada | 1 · Step 3 |
| D1 — `gitBlock` retrocompatível | 1 · Step 3 (atalho) · Step 7 (não-regressão) |
| D2 — `readBlockField` exportada | 1 · Step 4 |
| D2 — CLI `read-block-field` | 1 · Step 5 · verificado no Step 8 |
| D2 — `readField` intacta | 1 · teste 7 |
| D3 — migrar só o `grounding-mcp` | 2 · Steps 3-4 |
| Testes 1-6 do spec (lib) | 1 · Step 1 (8 testes) |
| Testes 7-8 do spec (check) | 2 · Step 1 (4 testes) |
| CHANGELOG | 2 · Step 8 |

**Placeholders:** nenhum — todo step traz o código final.

**Consistência de tipos:** `readBlockField(src, block, field) → string | null` usado com a mesma assinatura na lib, no CLI e no doctor. `findScalar` devolve `{ raw }` já sem comentário — nenhum consumidor precisa limpar de novo.

**Risco assumido:** o Step 4 da Task 2 descreve a substituição das duas primeiras linhas do `run` e manda preservar o resto. Se a lógica seguinte referenciar variáveis do parser removido com outro nome, ajustar na hora — o teste do Step 5 pega.
