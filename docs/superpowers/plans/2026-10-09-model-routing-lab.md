# Laboratório de Roteamento de Modelos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** model-routing-e2e-validation | **Scale:** LARGE | **Phase:** P→R | **Autonomy:** autonomous

**Goal:** Construir o repo `devflow-routing-lab`, que roda o PREVC inteiro de forma autônoma sobre um software-alvo pequeno, em braços com e sem roteamento, e gera um scorecard que valida o roteamento de modelos da v3.7.0.

**Architecture:** Libs puras (braço, oráculo, stream-json, transcripts, ledger, invariantes, scorecard) mais scripts finos (`run-arm`, `collect`, `accept`, `score`, `campaign`). O plugin sob teste vem de um clone da tag `v3.7.0` carregado por `--plugin-dir`. A camada L1 testa a CLI da v3.7 de forma determinística; a L3 roda sessões reais.

**Tech Stack:** Node ≥ 22 (só biblioteca padrão), `node --test`, git, Claude Code CLI 2.1.295.

**Spec:** `docs/superpowers/specs/2026-10-09-model-routing-lab-design.md`

**Agents:** backend-specialist (libs/scripts), test-writer (oráculo, L1, suíte oculta, e2e), security-auditor (revisão de `run-arm`/leitura segura), documentation-writer (README, GABARITO, runbooks), architect (revisão R).

```yaml
requiredSignals: [unit, integration, e2e, lint]
```

## Global Constraints

- O laboratório é um repo irmão do `devflow`: `../devflow-routing-lab` (git local, **sem remoto**). Todos os caminhos de arquivo abaixo são relativos à raiz dele, salvo indicação.
- Node ≥ 22, só biblioteca padrão; nenhuma dependência npm.
- Testes com `node --test`; nada de framework externo.
- Plugin sob teste: tag `v3.7.0` do repo `devflow`, clonada com `git clone --depth 1 --branch v3.7.0` para `.cache/devflow@v3.7.0` (no `.gitignore`). Nunca `git worktree` no repo `devflow`, nunca `claude plugin install`.
- O repo do laboratório só recebe escrita em `results/`; rodadas brutas vão para `runs/` (no `.gitignore`).
- `metrics.json` e tudo em `results/` contêm só números, enums e IDs de modelo/agente. Nunca prompt, resposta, código gerado ou trecho de transcript.
- Leitura de transcript, ledger e `prevc.json`: só arquivo regular, sem seguir symlink, sem bloquear, até 64 MiB.
- Veredito: `HELD` | `MISS` | `N/A`.
- Tiers: `cheap` < `standard` < `capable` < `top`; modelos: `haiku`→cheap, `sonnet`→standard, `opus`→capable, `fable`→top. Esforço: `low` < `medium` < `high` < `xhigh` < `max`.
- Subagentes deste workflow: **proibido** `gh`, PR, merge, push, `git worktree` no repo `devflow` e qualquer escrita no `devflow-e2e-sandbox`.
- Idioma: pt-BR em docs, mensagens e nomes de teste.

## Review Focus

1. **Retomada (`--resume`) com a mesma sessão** — o driver deve acumular `session_id`s e uso de todas as invocações; perder a 1ª invocação apaga as fases P/R da medição. Teste em `tests/e2e/run-arm.test.mjs` (Task 11).
2. **Transcript ausente, truncado ou com linha inválida** — a coleta deve seguir com o que leu e marcar a verificação como `N/A`, não quebrar. Testes em `tests/unit/transcripts.test.mjs` (Task 5) e `invariants.test.mjs` (Task 7).
3. **Symlink/FIFO no lugar de transcript ou ledger** (o workspace roda com `bypassPermissions`) — leitura segura recusa. Teste em `tests/unit/safe-read.test.mjs` (Task 5).
4. **Subagente de tipo não roteável** (`Explore`, `Plan`, …) — fora do `INV-SUB`; contá-lo como `MISS` invalidaria o scorecard. Teste em `invariants.test.mjs` (Task 7).
5. **Workspace sem `src/server.mjs`** (rodada incompleta) — `accept.mjs` devolve `{passed: 0, total: N, error}` em vez de travar. Teste em `tests/unit/accept.test.mjs` (Task 10).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `package.json`, `.gitignore`, `tests/run-{unit,integration,e2e,lint}.sh` | bootstrap e contrato `verify:` |
| `lib/arm.mjs`, `arms/*.json` | braço como dados → argv/env/bloco `models:` |
| `lib/tiers.mjs`, `oracle/oracle.json`, `GABARITO.md` | oráculo independente |
| `lib/plugin.mjs`, `scripts/plugin.mjs`, `l1/*.test.mjs` | cache da tag + camada L1 |
| `lib/stream.mjs` | leitura do `stream-json` |
| `lib/safe-read.mjs`, `lib/transcripts.mjs` | leitura segura + transcripts |
| `lib/ledger.mjs` | leitura e checagem do ledger |
| `lib/prevc.mjs` | leitura do `prevc.json` |
| `lib/invariants.mjs` | vereditos + matriz de cobertura |
| `lib/scorecard.mjs`, `scripts/score.mjs` | scorecard |
| `brief/PRODUCT.md`, `seed/`, `lib/seed.mjs` | software-alvo e workspace |
| `acceptance/*.test.mjs`, `fixtures/shortlink-ref/`, `fixtures/shortlink-broken/`, `scripts/accept.mjs`, `lib/accept.mjs` | suíte oculta |
| `scripts/run-arm.mjs`, `scripts/collect.mjs`, `lib/collect.mjs`, `tests/e2e/fake-claude.mjs` | driver e coleta |
| `scripts/campaign.mjs`, `runbooks/*.md`, `README.md` | campanha e operação |

---

### Task 1: Bootstrap do repo e braços como dados

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `package.json`, `.gitignore`, `tests/run-unit.sh`, `tests/run-integration.sh`, `tests/run-e2e.sh`, `tests/run-lint.sh`
- Create: `lib/arm.mjs`, `arms/A-baseline.json`, `arms/B-routed.json`, `arms/C-ceiling.json`, `arms/D-stress.json`
- Test: `tests/unit/arm.test.mjs`

**Interfaces:**
- Produces: `loadArm(obj) → Arm` (lança `Error` com mensagem em pt-BR se inválido); `armEnv(arm, baseEnv, xdgDir) → env`; `armArgs(arm, { pluginDir, prompt, resume }) → string[]`; `modelsYaml(models) → string` (`""` se `models` é `null`). `Arm = { id, description, routing, ceiling: { model, effort }, models }`.

- [ ] **Step 1: Criar o repo e o bootstrap**

```bash
mkdir ../devflow-routing-lab && cd ../devflow-routing-lab && git init -b main
```

`package.json`:
```json
{
  "name": "devflow-routing-lab",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": { "test": "bash tests/run-unit.sh" }
}
```

`.gitignore`:
```
runs/
.cache/
node_modules/
```

`tests/run-unit.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --test tests/unit/
```

`tests/run-integration.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/plugin.mjs ensure
node --test l1/
```

`tests/run-e2e.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node --test tests/e2e/
```

`tests/run-lint.sh`:
```bash
#!/usr/bin/env bash
# Sintaxe de todo .mjs versionado + guarda: script nenhum grava fora de runs/ e results/.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for f in $(git ls-files '*.mjs'); do node --check "$f" || fail=1; done
if git grep -nE "writeFileSync\((\"|')(\.\./|/)" -- 'scripts/*.mjs' 'lib/*.mjs'; then
  echo "lint: escrita com caminho literal fora do laboratório"; fail=1
fi
exit $fail
```

Run: `chmod +x tests/*.sh`

- [ ] **Step 2: Escrever o teste que falha**

`tests/unit/arm.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadArm, armEnv, armArgs, modelsYaml } from "../../lib/arm.mjs";

const arm = (id) => loadArm(JSON.parse(readFileSync(new URL(`../../arms/${id}.json`, import.meta.url), "utf8")));

test("os quatro braços versionados são válidos", () => {
  for (const id of ["A-baseline", "B-routed", "C-ceiling", "D-stress"]) assert.equal(arm(id).id, id);
});

test("braço inválido é recusado com mensagem", () => {
  assert.throws(() => loadArm({ id: "x", routing: true, ceiling: { model: "gpt", effort: "high" }, models: null }), /modelo do teto/);
  assert.throws(() => loadArm({ id: "x", routing: true, ceiling: { model: "opus", effort: "turbo" }, models: null }), /esforço do teto/);
  assert.throws(() => loadArm({ id: "../x", routing: false, ceiling: { model: "opus", effort: "high" }, models: null }), /id/);
  assert.throws(() => loadArm({ id: "x", routing: true, ceiling: { model: "opus", effort: "high" }, models: null }), /models/);
});

test("armEnv: A remove o opt-in do usuário; B liga; ambos isolam o XDG", () => {
  const base = { HOME: "/h", DEVFLOW_MODEL_ROUTING: "1", PATH: "/bin" };
  const a = armEnv(arm("A-baseline"), base, "/r/xdg");
  assert.equal(a.DEVFLOW_MODEL_ROUTING, undefined);
  assert.equal(a.XDG_DATA_HOME, "/r/xdg");
  assert.equal(a.HOME, "/h");
  assert.equal(armEnv(arm("B-routed"), base, "/r/xdg").DEVFLOW_MODEL_ROUTING, "1");
});

test("armArgs: teto, plugin e retomada", () => {
  const args = armArgs(arm("C-ceiling"), { pluginDir: "/p", prompt: "oi", resume: "sid-1" });
  assert.deepEqual(args.slice(0, 2), ["-p", "oi"]);
  for (const [flag, v] of [["--plugin-dir", "/p"], ["--model", "sonnet"], ["--effort", "medium"], ["--permission-mode", "bypassPermissions"], ["--output-format", "stream-json"], ["--resume", "sid-1"]]) {
    assert.equal(args[args.indexOf(flag) + 1], v, flag);
  }
  assert.ok(args.includes("--verbose"));
  assert.ok(!armArgs(arm("B-routed"), { pluginDir: "/p", prompt: "oi" }).includes("--resume"));
});

test("modelsYaml: bloco em estilo bloco, sem mapa inline; null → vazio", () => {
  assert.equal(modelsYaml(null), "");
  const y = modelsYaml(arm("D-stress").models);
  assert.match(y, /^models:\n  enabled: true\n/);
  assert.match(y, /\n  overrides:\n    agents:\n      feature-developer:\n        tier: cheap\n/);
  assert.ok(!y.includes("{"));
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test tests/unit/arm.test.mjs`
Expected: FAIL com `Cannot find module '.../lib/arm.mjs'`

- [ ] **Step 4: Implementar**

`lib/arm.mjs`:
```js
// lib/arm.mjs — um braço da campanha descrito por dados (spec L5). Puro.
const MODELS = ["haiku", "sonnet", "opus", "fable"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const ID = /^[A-Za-z0-9-]{1,32}$/;

export function loadArm(o) {
  if (!o || typeof o !== "object") throw new Error("braço: objeto esperado");
  if (typeof o.id !== "string" || !ID.test(o.id)) throw new Error("braço: id inválido");
  if (!MODELS.includes(o.ceiling?.model)) throw new Error(`braço ${o.id}: modelo do teto inválido`);
  if (!EFFORTS.includes(o.ceiling?.effort)) throw new Error(`braço ${o.id}: esforço do teto inválido`);
  if (typeof o.routing !== "boolean") throw new Error(`braço ${o.id}: routing deve ser booleano`);
  if (o.routing && (!o.models || typeof o.models !== "object")) throw new Error(`braço ${o.id}: routing exige models`);
  return { id: o.id, description: String(o.description ?? ""), routing: o.routing, ceiling: { ...o.ceiling }, models: o.models ?? null };
}

export function armEnv(arm, baseEnv, xdgDir) {
  const env = { ...baseEnv, XDG_DATA_HOME: xdgDir };
  delete env.DEVFLOW_MODEL_ROUTING;
  if (arm.routing) env.DEVFLOW_MODEL_ROUTING = "1";
  return env;
}

export function armArgs(arm, { pluginDir, prompt, resume }) {
  const a = ["-p", prompt, "--plugin-dir", pluginDir, "--permission-mode", "bypassPermissions",
    "--output-format", "stream-json", "--verbose", "--model", arm.ceiling.model, "--effort", arm.ceiling.effort];
  if (resume) a.push("--resume", resume);
  return a;
}

function render(obj, indent) {
  const pad = " ".repeat(indent);
  let out = "";
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") out += `${pad}${k}:\n${render(v, indent + 2)}`;
    else out += `${pad}${k}: ${v}\n`;
  }
  return out;
}

export function modelsYaml(models) {
  return models ? `models:\n${render(models, 2)}` : "";
}
```

`arms/A-baseline.json`:
```json
{ "id": "A-baseline", "description": "Controle: roteamento desligado, teto do operador.", "routing": false,
  "ceiling": { "model": "opus", "effort": "xhigh" }, "models": null }
```

`arms/B-routed.json`:
```json
{ "id": "B-routed", "description": "Medição principal: tabela default da v3.7, escalada no meio ligada.", "routing": true,
  "ceiling": { "model": "opus", "effort": "xhigh" },
  "models": { "enabled": true, "session": true, "subagents": true, "ledger": true,
              "midRun": { "enabled": true, "failureStreak": 3 } } }
```

`arms/C-ceiling.json`:
```json
{ "id": "C-ceiling", "description": "Prova do teto: usuário em sonnet/medium; nada pode passar disso.", "routing": true,
  "ceiling": { "model": "sonnet", "effort": "medium" },
  "models": { "enabled": true, "session": true, "subagents": true, "ledger": true,
              "midRun": { "enabled": true, "failureStreak": 3 } } }
```

`arms/D-stress.json`:
```json
{ "id": "D-stress", "description": "Força falhas na fase E para exercitar as escaladas.", "routing": true,
  "ceiling": { "model": "opus", "effort": "xhigh" },
  "models": { "enabled": true, "session": true, "subagents": true, "ledger": true,
              "midRun": { "enabled": true, "failureStreak": 3 },
              "overrides": { "agents": { "feature-developer": { "tier": "cheap" }, "backend-specialist": { "tier": "cheap" }, "test-writer": { "tier": "cheap" } },
                             "phases": { "E": { "general-purpose": { "tier": "cheap" } } } } } }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/unit/arm.test.mjs && bash tests/run-lint.sh`
Expected: PASS (5 testes), lint sem saída de erro

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(lab): bootstrap e braços da campanha como dados"
```

---

### Task 2: Oráculo independente e gabarito

**Agent:** test-writer · **Tier:** capable · **Tests:** unit

**Files:**
- Create: `oracle/oracle.json`, `lib/tiers.mjs`, `GABARITO.md`
- Test: `tests/unit/tiers.test.mjs`

**Interfaces:**
- Produces: `modelTier(id) → "cheap"|"standard"|"capable"|"top"|null`; `tierRank(t) → 0..3 | -1`; `effortRank(e) → 0..4 | -1`; `capTier(tier, ceilingTier) → tier`; `agentKey(agentType) → string` (tira o prefixo `devflow:`); `isRoutable(oracle, agentType) → boolean`; `expectedSubagentTier(oracle, agentType, phase|null, ceilingTier) → tier|null`; `expectedSessionTiers(oracle, ceilingTier) → { P, R, E, V, C }`; `expectedSessionSwitches(oracle, ceilingTier) → number`; `loadOracle() → Oracle`.

- [ ] **Step 1: Escrever o oráculo à mão**

Transcrito da spec do roteamento (`docs/superpowers/specs/2026-10-08-model-routing-design.md` §5 no repo `devflow`), **não** do `routes.json`:

`oracle/oracle.json`:
```json
{
  "source": "spec 2026-10-08-model-routing-design.md §5 (transcrito à mão; não derivar do routes.json)",
  "routablePrefix": "devflow:",
  "routable": ["general-purpose"],
  "agents": {
    "architect": "capable", "security-auditor": "capable",
    "bug-fixer": "standard", "performance-optimizer": "standard", "product-manager": "standard",
    "code-reviewer": "standard", "feature-developer": "standard", "test-writer": "standard",
    "refactoring-specialist": "standard", "backend-specialist": "standard", "frontend-specialist": "standard",
    "database-specialist": "standard", "devops-specialist": "standard", "mobile-specialist": "standard",
    "business-context": "standard", "product-context": "standard", "operations-context": "standard",
    "engineering-context": "standard",
    "documentation-writer": "cheap", "memory-specialist": "cheap",
    "general-purpose": "standard"
  },
  "phaseOverrides": {
    "R": { "code-reviewer": "capable" },
    "C": { "general-purpose": "cheap", "documentation-writer": "cheap" }
  },
  "sessionPhases": { "P": "ceiling", "R": "ceiling", "E": "standard", "V": "standard", "C": "standard" }
}
```

- [ ] **Step 2: Escrever o teste que falha**

`tests/unit/tiers.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as t from "../../lib/tiers.mjs";

const o = t.loadOracle();

test("modelTier reconhece alias e ID completo; desconhecido → null", () => {
  assert.equal(t.modelTier("haiku"), "cheap");
  assert.equal(t.modelTier("claude-sonnet-5-5"), "standard");
  assert.equal(t.modelTier("claude-opus-5-5[1m]"), "capable");
  assert.equal(t.modelTier("fable"), "top");
  assert.equal(t.modelTier("gpt-4"), null);
  assert.equal(t.modelTier(undefined), null);
});

test("ranks e teto", () => {
  assert.ok(t.tierRank("cheap") < t.tierRank("top"));
  assert.equal(t.tierRank("x"), -1);
  assert.ok(t.effortRank("medium") < t.effortRank("xhigh"));
  assert.equal(t.capTier("capable", "standard"), "standard");
  assert.equal(t.capTier("cheap", "standard"), "cheap");
});

test("roteável: devflow:* e general-purpose; Explore não", () => {
  assert.ok(t.isRoutable(o, "devflow:architect"));
  assert.ok(t.isRoutable(o, "general-purpose"));
  assert.ok(!t.isRoutable(o, "Explore"));
  assert.ok(!t.isRoutable(o, "devflow:nao-existe"));
});

test("tier esperado do subagente: override de fase > agente; teto aplica; fase nula usa o agente", () => {
  assert.equal(t.expectedSubagentTier(o, "devflow:code-reviewer", "R", "capable"), "capable");
  assert.equal(t.expectedSubagentTier(o, "devflow:code-reviewer", "E", "capable"), "standard");
  assert.equal(t.expectedSubagentTier(o, "general-purpose", "C", "capable"), "cheap");
  assert.equal(t.expectedSubagentTier(o, "devflow:architect", "P", "standard"), "standard");
  assert.equal(t.expectedSubagentTier(o, "devflow:architect", null, "capable"), "capable");
  assert.equal(t.expectedSubagentTier(o, "Explore", "E", "capable"), null);
});

test("sessão: 'ceiling' vira o teto; trocas esperadas = mudanças entre fases", () => {
  assert.deepEqual(t.expectedSessionTiers(o, "capable"), { P: "capable", R: "capable", E: "standard", V: "standard", C: "standard" });
  assert.equal(t.expectedSessionSwitches(o, "capable"), 1);
  assert.equal(t.expectedSessionSwitches(o, "standard"), 0);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test tests/unit/tiers.test.mjs`
Expected: FAIL com `Cannot find module`

- [ ] **Step 4: Implementar**

`lib/tiers.mjs`:
```js
// lib/tiers.mjs — oráculo do laboratório (spec §2.2). Puro, exceto loadOracle.
import { readFileSync } from "node:fs";

export const TIERS = ["cheap", "standard", "capable", "top"];
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
export const PHASES = ["P", "R", "E", "V", "C"];
const FAMILY = [["haiku", "cheap"], ["sonnet", "standard"], ["opus", "capable"], ["fable", "top"]];

export const loadOracle = () => JSON.parse(readFileSync(new URL("../oracle/oracle.json", import.meta.url), "utf8"));
export function modelTier(id) {
  if (typeof id !== "string") return null;
  for (const [fam, tier] of FAMILY) if (id.toLowerCase().includes(fam)) return tier;
  return null;
}
export const tierRank = (t) => TIERS.indexOf(t);
export const effortRank = (e) => EFFORTS.indexOf(e);
export const capTier = (tier, ceiling) => (tierRank(tier) > tierRank(ceiling) ? ceiling : tier);
export const agentKey = (type) => (typeof type === "string" && type.startsWith("devflow:") ? type.slice(8) : String(type));
export function isRoutable(o, type) {
  if (o.routable.includes(type)) return true;
  return typeof type === "string" && type.startsWith(o.routablePrefix) && Object.hasOwn(o.agents, agentKey(type));
}
export function expectedSubagentTier(o, type, phase, ceiling) {
  if (!isRoutable(o, type)) return null;
  const key = agentKey(type);
  const byPhase = phase && Object.hasOwn(o.phaseOverrides, phase) && Object.hasOwn(o.phaseOverrides[phase], key) ? o.phaseOverrides[phase][key] : null;
  return capTier(byPhase ?? o.agents[key], ceiling);
}
export function expectedSessionTiers(o, ceiling) {
  const out = {};
  for (const p of PHASES) out[p] = o.sessionPhases[p] === "ceiling" ? ceiling : capTier(o.sessionPhases[p], ceiling);
  return out;
}
export function expectedSessionSwitches(o, ceiling) {
  const s = expectedSessionTiers(o, ceiling);
  let n = 0;
  for (let i = 1; i < PHASES.length; i++) if (s[PHASES[i]] !== s[PHASES[i - 1]]) n++;
  return n;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/unit/tiers.test.mjs`
Expected: PASS (5 testes)

- [ ] **Step 6: Escrever `GABARITO.md`**

Conteúdo obrigatório (texto em pt-BR):
1. Tabela de verificações `INV-CEIL`, `INV-SESS`, `INV-SUB`, `INV-EFF`, `INV-LEDGER`, `INV-OFF`, `INV-PREVC` copiada da spec §7, com a regra de veredito de cada uma (a mesma que a Task 7 implementa).
2. Matriz de cobertura com as 13 funcionalidades da spec §7 e, para cada uma, o sinal observável (campo do ledger ou do transcript) que conta como "exercitada".
3. Nota de método: o oráculo vem da spec, não do `routes.json`; divergência entre os dois é **achado**, não correção do oráculo.
4. Nota sobre `INV-SESS` com retomadas: cada invocação do driver é um processo novo do mod; o limite de trocas é `trocas esperadas × invocações`, e o scorecard mostra a sequência de modelos para leitura humana.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(lab): oráculo independente e gabarito das verificações"
```

---

### Task 3: Cache da tag e camada L1 (determinística)

**Agent:** test-writer · **Tier:** standard · **Tests:** integration

**Files:**
- Create: `lib/plugin.mjs`, `scripts/plugin.mjs`
- Test: `l1/resolve.test.mjs`, `l1/escalate-report.test.mjs`, `l1/classic-hook.test.mjs`, `l1/helpers.mjs`

**Interfaces:**
- Consumes: `loadOracle`, `expectedSubagentTier`, `TIERS`, `PHASES` (Task 2).
- Produces: `pluginDirFor(ref) → string` (`<lab>/.cache/devflow@<ref>`); `ensurePlugin({ ref, source }) → string` (clona se faltar; devolve o caminho). CLI: `node scripts/plugin.mjs ensure [--ref v3.7.0] [--source ../devflow]`. Env `DEVFLOW_PLUGIN_DIR` sobrepõe o caminho.

- [ ] **Step 1: Escrever os testes L1**

`l1/helpers.mjs`:
```js
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ensurePlugin } from "../lib/plugin.mjs";

export const PLUGIN = ensurePlugin();
export const CLI = join(PLUGIN, "scripts/model-route.mjs");

// Projeto-fixture em tmpdir (nunca muta diretório versionado).
export function fixture({ models = "models:\n  enabled: true\n  ledger: true\n", phase = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "lab-l1-"));
  mkdirSync(join(dir, ".context/runtime/workflows"), { recursive: true });
  if (models !== null) writeFileSync(join(dir, ".context/.devflow.yaml"), models);
  if (phase) writeFileSync(join(dir, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { name: "x", current_phase: phase } } }));
  return dir;
}

export function cli(args, { cwd, env = {} }) {
  const r = spawnSync("node", [CLI, ...args, "--cwd", cwd], { encoding: "utf8", env: { ...process.env, DEVFLOW_MODEL_ROUTING: "1", XDG_DATA_HOME: join(cwd, "xdg"), ...env } });
  return { status: r.status, out: r.stdout.trim(), err: r.stderr };
}
```

`l1/resolve.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, cli } from "./helpers.mjs";
import { loadOracle, expectedSubagentTier, PHASES } from "../lib/tiers.mjs";

const o = loadOracle();
const types = [...Object.keys(o.agents).filter((k) => k !== "general-purpose").map((k) => `devflow:${k}`), "general-purpose"];

for (const phase of PHASES) {
  test(`resolve × oráculo na fase ${phase} (teto top)`, () => {
    const cwd = fixture({ phase });
    const miss = [];
    for (const agent of types) {
      const r = cli(["resolve", "--agent", agent, "--phase", phase], { cwd });
      assert.equal(r.status, 0, r.err);
      const got = JSON.parse(r.out).route?.tier ?? null;
      const want = expectedSubagentTier(o, agent, phase, "top");
      if (got !== want) miss.push(`${agent}: cli=${got} oráculo=${want}`);
    }
    assert.deepEqual(miss, []);
  });
}

test("tier da task do plano prevalece (fonte plan)", () => {
  const r = JSON.parse(cli(["resolve", "--agent", "devflow:architect", "--phase", "E", "--task-tier", "cheap"], { cwd: fixture() }).out);
  assert.equal(r.route.tier, "cheap");
  assert.equal(r.route.source, "plan");
});

test("skill final-review → capable", () => {
  const r = JSON.parse(cli(["resolve", "--agent", "general-purpose", "--phase", "E", "--skill", "final-review"], { cwd: fixture() }).out);
  assert.equal(r.route.tier, "capable");
});

test("opt-in duplo: sem env do usuário ou sem models.enabled → nenhuma rota roteada", () => {
  const off1 = JSON.parse(cli(["resolve", "--agent", "devflow:architect", "--phase", "P"], { cwd: fixture(), env: { DEVFLOW_MODEL_ROUTING: "" } }).out);
  const off2 = JSON.parse(cli(["resolve", "--agent", "devflow:architect", "--phase", "P"], { cwd: fixture({ models: "" }) }).out);
  for (const r of [off1, off2]) assert.ok(r.route === null || r.route.source === "inherit", JSON.stringify(r));
});

test("maxTier limita", () => {
  const r = JSON.parse(cli(["resolve", "--agent", "devflow:architect", "--phase", "P"], { cwd: fixture({ models: "models:\n  enabled: true\n  maxTier: standard\n" }) }).out);
  assert.equal(r.route.tier, "standard");
});

test("--runtime omp devolve role e nunca passa do tier do oráculo", () => {
  const roles = { cheap: "pi/smol", standard: "default", capable: "pi/slow", top: "pi/plan" };
  const r = JSON.parse(cli(["resolve", "--agent", "devflow:documentation-writer", "--phase", "C", "--runtime", "omp"], { cwd: fixture() }).out);
  if (r.route) assert.equal(r.route.role, roles[r.route.tier]);
});
```

`l1/escalate-report.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fixture, cli, PLUGIN } from "./helpers.mjs";

const answers = (o) => JSON.stringify({ failure_is_capability: 0.9, claims_done_with_evidence: 0.1, is_stuck: 0.8, needed_tier: "capable", ...o });

test("escalate: --report imprime a rubrica", () => {
  const cwd = fixture();
  writeFileSync(join(cwd, "r.txt"), "teste falhou: expected 429 got 200");
  const r = cli(["escalate", "--agent", "general-purpose", "--tier", "standard", "--report", join(cwd, "r.txt")], { cwd });
  assert.match(r.out, /failure_is_capability/);
  assert.match(r.out, /needed_tier/);
});

test("escalate: falha de capacidade sobe para capable/opus", () => {
  const d = JSON.parse(cli(["escalate", "--agent", "general-purpose", "--tier", "standard", "--answers", answers()], { cwd: fixture() }).out);
  assert.equal(d.action, "escalate");
  assert.equal(d.tier, "capable");
  assert.equal(d.model, "opus");
});

test("escalate: falha de ambiente → human; resposta inválida → keep", () => {
  assert.equal(JSON.parse(cli(["escalate", "--agent", "general-purpose", "--tier", "standard", "--answers", answers({ failure_is_capability: 0.2 })], { cwd: fixture() }).out).action, "human");
  assert.equal(JSON.parse(cli(["escalate", "--agent", "general-purpose", "--tier", "standard", "--answers", "{}"], { cwd: fixture() }).out).action, "keep");
});

test("report: ledger sintético vira tabela por agente; linha adulterada é ignorada", async () => {
  const cwd = fixture();
  const { ledgerDirFrom } = await import(join(PLUGIN, "scripts/lib/routing-ledger.mjs"));
  const dir = ledgerDirFrom({ xdgDataHome: join(cwd, "xdg"), home: "/nao-usado", cwd });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "s.jsonl"), [
    JSON.stringify({ ts: "2026-10-09T10:00:00Z", scope: "subagent", agentType: "devflow:architect", tier: "capable", model: "opus", source: "agent" }),
    JSON.stringify({ ts: "2026-10-09T10:01:00Z", scope: "subagent", agentType: "__proto__", prompt: "vazado" }),
  ].join("\n") + "\n");
  const r = cli(["report"], { cwd });
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /devflow:architect/);
  assert.doesNotMatch(r.out, /vazado/);
});
```

`l1/classic-hook.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixture, PLUGIN } from "./helpers.mjs";

const HOOK = join(PLUGIN, "hooks/pre-tool-use-agent");

function run(cwd, toolInput, sessionModel = "claude-opus-5-5") {
  const tp = join(cwd, "t.jsonl");
  writeFileSync(tp, JSON.stringify({ type: "assistant", message: { model: sessionModel, content: [] } }) + "\n");
  const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: toolInput, cwd, transcript_path: tp, session_id: "s" });
  const r = spawnSync("bash", [HOOK], { input, encoding: "utf8", env: { ...process.env, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "", DEVFLOW_MODEL_ROUTING: "1" } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

test("clássico: documentation-writer na fase C → haiku, sem permissionDecision", () => {
  const out = run(fixture({ phase: "C" }), { subagent_type: "devflow:documentation-writer", prompt: "p" });
  assert.equal(out.hookSpecificOutput.updatedInput.model, "haiku");
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
});

test("clássico: teto sonnet nunca vira opus", () => {
  const out = run(fixture({ phase: "R" }), { subagent_type: "devflow:architect", prompt: "p" }, "claude-sonnet-5-5");
  assert.ok(out === null || out.hookSpecificOutput.updatedInput.model !== "opus");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test l1/`
Expected: FAIL com `Cannot find module '.../lib/plugin.mjs'`

- [ ] **Step 3: Implementar o cache da tag**

`lib/plugin.mjs`:
```js
// lib/plugin.mjs — plugin sob teste = clone imutável de uma tag (spec L2).
import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const LAB = resolve(new URL("..", import.meta.url).pathname);
const REF = /^[A-Za-z0-9._\/-]{1,64}$/;

export function pluginDirFor(ref) {
  if (process.env.DEVFLOW_PLUGIN_DIR) return resolve(process.env.DEVFLOW_PLUGIN_DIR);
  if (!REF.test(ref) || ref.includes("..")) throw new Error(`ref inválido: ${ref}`);
  return join(LAB, ".cache", `devflow@${ref.replaceAll("/", "_")}`);
}

export function ensurePlugin({ ref = "v3.7.0", source = resolve(LAB, "../devflow") } = {}) {
  const dir = pluginDirFor(ref);
  if (existsSync(join(dir, "scripts/model-route.mjs"))) return dir;
  if (process.env.DEVFLOW_PLUGIN_DIR) throw new Error(`DEVFLOW_PLUGIN_DIR sem scripts/model-route.mjs: ${dir}`);
  mkdirSync(join(LAB, ".cache"), { recursive: true });
  execFileSync("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, `file://${resolve(source)}`, dir], { stdio: "inherit" });
  return dir;
}
```

`scripts/plugin.mjs`:
```js
#!/usr/bin/env node
import { ensurePlugin } from "../lib/plugin.mjs";
const a = process.argv.slice(2);
const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
if (a[0] !== "ensure") { console.error("uso: plugin.mjs ensure [--ref R] [--source DIR]"); process.exit(2); }
process.stdout.write(ensurePlugin({ ref: opt("--ref") ?? "v3.7.0", source: opt("--source") }) + "\n");
```

Run: `node scripts/plugin.mjs ensure`
Expected: imprime `<lab>/.cache/devflow@v3.7.0`; `git -C .cache/devflow@v3.7.0 describe --tags` → `v3.7.0`

- [ ] **Step 4: Rodar e ver passar**

Run: `bash tests/run-integration.sh`
Expected: PASS. **Se algum caso da matriz der `MISS`, não corrija o oráculo nem a CLI**: marque o teste com `{ todo: "achado L1-<n>: <diferença>" }`, registre o achado em `results/l1-findings.md` (agente, fase, cli, oráculo) e siga (princípio "capturar, não resolver").

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test(lab): camada L1 da CLI e do hook clássico contra o oráculo"
```

---

### Task 4: Leitura do stream-json

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** unit

**Files:**
- Create: `lib/stream.mjs`
- Test: `tests/unit/stream.test.mjs`

**Interfaces:**
- Produces: `parseStream(text) → { sessionIds: string[], result: null | { subtype, isError, numTurns, terminalReason, modelUsage: { [model]: { input, output, cacheRead, cacheCreate, costUSD } }, subagents: { spawned, completed, failed } } }`; `mergeUsage(a, b) → modelUsage` (soma por modelo).

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/stream.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStream, mergeUsage } from "../../lib/stream.mjs";

const result = {
  type: "result", subtype: "success", is_error: false, num_turns: 3, terminal_reason: "completed", session_id: "s1", result: "TEXTO QUE NÃO PODE VAZAR",
  modelUsage: { "claude-opus-5-5": { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 100, cacheCreationInputTokens: 50, costUSD: 0.5, contextWindow: 1 } },
  subagent_stats: { spawned: 2, completed: 2, failed: 0 },
};
const lines = [JSON.stringify({ type: "system", subtype: "init", session_id: "s1" }), "lixo{", JSON.stringify(result)].join("\n");

test("extrai sessão, uso por modelo e subagentes; descarta texto", () => {
  const s = parseStream(lines);
  assert.deepEqual(s.sessionIds, ["s1"]);
  assert.deepEqual(s.result.modelUsage["claude-opus-5-5"], { input: 10, output: 5, cacheRead: 100, cacheCreate: 50, costUSD: 0.5 });
  assert.deepEqual(s.result.subagents, { spawned: 2, completed: 2, failed: 0 });
  assert.equal(s.result.subtype, "success");
  assert.ok(!JSON.stringify(s).includes("VAZAR"));
});

test("sem evento result → result null", () => {
  assert.equal(parseStream(JSON.stringify({ type: "system", subtype: "init", session_id: "s2" })).result, null);
});

test("mergeUsage soma por modelo", () => {
  const a = { m: { input: 1, output: 1, cacheRead: 1, cacheCreate: 1, costUSD: 1 } };
  const b = { m: { input: 2, output: 0, cacheRead: 0, cacheCreate: 0, costUSD: 0.5 }, n: { input: 1, output: 1, cacheRead: 0, cacheCreate: 0, costUSD: 0 } };
  assert.deepEqual(mergeUsage(a, b), { m: { input: 3, output: 1, cacheRead: 1, cacheCreate: 1, costUSD: 1.5 }, n: { input: 1, output: 1, cacheRead: 0, cacheCreate: 0, costUSD: 0 } });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/unit/stream.test.mjs` → FAIL (`Cannot find module`)

- [ ] **Step 3: Implementar**

`lib/stream.mjs`:
```js
// lib/stream.mjs — lê o stream-json do `claude -p`. Só números, enums e IDs (spec §2.4). Puro.
const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const SID = /^[A-Za-z0-9-]{1,64}$/;
const ENUM = /^[a-z_]{1,32}$/;

function usageOf(mu) {
  const out = {};
  for (const [model, u] of Object.entries(mu ?? {})) {
    if (!/^[A-Za-z0-9.\[\]_-]{1,64}$/.test(model)) continue;
    out[model] = { input: n(u.inputTokens), output: n(u.outputTokens), cacheRead: n(u.cacheReadInputTokens), cacheCreate: n(u.cacheCreationInputTokens), costUSD: n(u.costUSD) };
  }
  return out;
}

export function parseStream(text) {
  const sessionIds = [];
  let result = null;
  for (const line of String(text).split("\n")) {
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (typeof j?.session_id === "string" && SID.test(j.session_id) && !sessionIds.includes(j.session_id)) sessionIds.push(j.session_id);
    if (j?.type !== "result") continue;
    const st = j.subagent_stats ?? {};
    result = {
      subtype: ENUM.test(j.subtype ?? "") ? j.subtype : "unknown",
      isError: j.is_error === true,
      numTurns: n(j.num_turns),
      terminalReason: ENUM.test(j.terminal_reason ?? "") ? j.terminal_reason : "unknown",
      modelUsage: usageOf(j.modelUsage),
      subagents: { spawned: n(st.spawned), completed: n(st.completed), failed: n(st.failed) },
    };
  }
  return { sessionIds, result };
}

export function mergeUsage(a, b) {
  const out = structuredClone(a ?? {});
  for (const [m, u] of Object.entries(b ?? {})) {
    out[m] ??= { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, costUSD: 0 };
    for (const k of Object.keys(out[m])) out[m][k] += n(u[k]);
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/unit/stream.test.mjs` → PASS (3)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): leitura do stream-json"`

---

### Task 5: Leitura segura e transcripts

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `lib/safe-read.mjs`, `lib/transcripts.mjs`
- Test: `tests/unit/safe-read.test.mjs`, `tests/unit/transcripts.test.mjs`

**Interfaces:**
- Produces: `readSafe(path, max = 64 * 2**20) → string | null`; `listSafe(dir) → string[]`; `projectSlug(cwd) → string`; `readSession(projectDir, sessionId) → { main: { models: string[], efforts: string[], usage: {[model]: U} }, subagents: Array<{ agentId, agentType, requestedModel, models: string[], efforts: string[], usage: {[model]: U} }> }` com `U = { input, output, cacheRead, cacheCreate }`. `models` da sessão principal = sequência na ordem, sem repetição consecutiva.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/safe-read.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSafe, listSafe } from "../../lib/safe-read.mjs";

const d = mkdtempSync(join(tmpdir(), "lab-safe-"));

test("lê arquivo regular", () => {
  writeFileSync(join(d, "a"), "ok");
  assert.equal(readSafe(join(d, "a")), "ok");
});
test("recusa symlink, FIFO, diretório, inexistente e acima do limite", () => {
  symlinkSync("/etc/hostname", join(d, "l"));
  execFileSync("mkfifo", [join(d, "f")]);
  writeFileSync(join(d, "big"), "x".repeat(100));
  assert.equal(readSafe(join(d, "l")), null);
  assert.equal(readSafe(join(d, "f")), null);
  assert.equal(readSafe(d), null);
  assert.equal(readSafe(join(d, "nada")), null);
  assert.equal(readSafe(join(d, "big"), 10), null);
});
test("listSafe: diretório ausente → []", () => assert.deepEqual(listSafe(join(d, "nada")), []));
```

`tests/unit/transcripts.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectSlug, readSession } from "../../lib/transcripts.mjs";

const msg = (id, model, effort, u = 10) => JSON.stringify({ type: "assistant", effort, timestamp: "2026-10-09T10:00:00Z", message: { id, model, content: [{ type: "text", text: "SEGREDO" }], usage: { input_tokens: u, output_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } } });

function project() {
  const dir = mkdtempSync(join(tmpdir(), "lab-tr-"));
  writeFileSync(join(dir, "s1.jsonl"), [msg("m1", "claude-opus-5-5", "xhigh"), msg("m1", "claude-opus-5-5", "xhigh"), "quebrado{", msg("m2", "claude-opus-5-5", "high"), msg("m3", "claude-sonnet-5-5", "medium")].join("\n"));
  mkdirSync(join(dir, "s1/subagents"), { recursive: true });
  writeFileSync(join(dir, "s1/subagents/agent-abc.meta.json"), JSON.stringify({ agentType: "devflow:architect", model: "opus", description: "SEGREDO" }));
  writeFileSync(join(dir, "s1/subagents/agent-abc.jsonl"), [msg("x1", "claude-opus-5-5", "high", 5), msg("x2", "claude-opus-5-5", "medium", 5)].join("\n"));
  return dir;
}

test("projectSlug segue a convenção do Claude Code", () => {
  assert.equal(projectSlug("/home/u/code/devflow"), "-home-u-code-devflow");
  assert.equal(projectSlug("/tmp/a.b_c"), "-tmp-a-b-c");
});

test("sessão principal: sequência de modelos sem repetição, esforços, uso deduplicado por message.id", () => {
  const s = readSession(project(), "s1");
  assert.deepEqual(s.main.models, ["claude-opus-5-5", "claude-sonnet-5-5"]);
  assert.deepEqual(s.main.efforts, ["xhigh", "high", "medium"]);
  assert.equal(s.main.usage["claude-opus-5-5"].input, 20);
});

test("subagente: tipo e modelo pedidos do meta, uso numérico, sem texto", () => {
  const s = readSession(project(), "s1");
  assert.equal(s.subagents.length, 1);
  assert.deepEqual({ ...s.subagents[0], usage: undefined }, { agentId: "abc", agentType: "devflow:architect", requestedModel: "opus", models: ["claude-opus-5-5"], efforts: ["high", "medium"], usage: undefined });
  assert.equal(s.subagents[0].usage["claude-opus-5-5"].input, 10);
  assert.ok(!JSON.stringify(s).includes("SEGREDO"));
});

test("sessão inexistente → vazia, sem lançar", () => {
  assert.deepEqual(readSession(project(), "nada"), { main: { models: [], efforts: [], usage: {} }, subagents: [] });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/unit/safe-read.test.mjs tests/unit/transcripts.test.mjs` → FAIL

- [ ] **Step 3: Implementar**

`lib/safe-read.mjs`:
```js
// lib/safe-read.mjs — só arquivo regular, sem seguir link, sem bloquear, tamanho limitado (spec §10).
import { openSync, fstatSync, readSync, closeSync, readdirSync, constants as C } from "node:fs";

export function readSafe(path, max = 64 * 2 ** 20) {
  let fd;
  try {
    fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK);
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > max) return null;
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < st.size) { const r = readSync(fd, buf, off, st.size - off, off); if (r <= 0) break; off += r; }
    return buf.subarray(0, off).toString("utf8");
  } catch { return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}

export function listSafe(dir) {
  try { return readdirSync(dir); } catch { return []; }
}
```

`lib/transcripts.mjs`:
```js
// lib/transcripts.mjs — só model, agentType, esforço e números de usage (spec §2.4).
import { join } from "node:path";
import { readSafe, listSafe } from "./safe-read.mjs";

const MODEL = /^claude-[A-Za-z0-9.\[\]_-]{1,60}$/;
const EFFORT = ["low", "medium", "high", "xhigh", "max"];
const TYPE = /^[A-Za-z0-9:_.-]{1,64}$/;
const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export const projectSlug = (cwd) => String(cwd).replace(/[^A-Za-z0-9]/g, "-");

function scan(text) {
  const models = [], efforts = [], usage = {}, seen = new Set();
  for (const line of (text ?? "").split("\n")) {
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    const m = j?.message;
    if (!m?.usage || !MODEL.test(m.model ?? "")) continue;
    if (typeof m.id === "string") { if (seen.has(m.id)) continue; seen.add(m.id); }
    if (models.at(-1) !== m.model) models.push(m.model);
    if (EFFORT.includes(j.effort)) efforts.push(j.effort);
    const u = (usage[m.model] ??= { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
    u.input += n(m.usage.input_tokens); u.output += n(m.usage.output_tokens);
    u.cacheRead += n(m.usage.cache_read_input_tokens); u.cacheCreate += n(m.usage.cache_creation_input_tokens);
  }
  return { models, efforts, usage };
}

export function readSession(projectDir, sessionId) {
  const main = scan(readSafe(join(projectDir, `${sessionId}.jsonl`)));
  const subDir = join(projectDir, sessionId, "subagents");
  const subagents = [];
  for (const f of listSafe(subDir).filter((x) => /^agent-[A-Za-z0-9]{1,64}\.meta\.json$/.test(x)).sort()) {
    let meta;
    try { meta = JSON.parse(readSafe(join(subDir, f)) ?? ""); } catch { continue; }
    const agentId = f.slice(6, -10);
    const s = scan(readSafe(join(subDir, `agent-${agentId}.jsonl`)));
    subagents.push({
      agentId,
      agentType: TYPE.test(meta?.agentType ?? "") ? meta.agentType : "?",
      requestedModel: TYPE.test(meta?.model ?? "") ? meta.model : null,
      models: [...new Set(s.models)], efforts: s.efforts, usage: s.usage,
    });
  }
  return { main, subagents };
}
```

- [ ] **Step 4: Rodar e ver passar** — os dois arquivos → PASS (7)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): leitura segura e extração numérica dos transcripts"`

---

### Task 6: Ledger e `prevc.json`

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** unit

**Files:**
- Create: `lib/ledger.mjs`, `lib/prevc.mjs`
- Test: `tests/unit/ledger.test.mjs`, `tests/unit/prevc.test.mjs`

**Interfaces:**
- Produces: `readLedger(xdgDir) → { entries: object[], violations: string[] }` (lê `<xdg>/devflow-model-routing/*/*.jsonl`); `checkEntry(e) → string[]` (violações). `readPrevc(wsDir) → { name, scale, current, phases: { P..C: status } } | null`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/ledger.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLedger, checkEntry } from "../../lib/ledger.mjs";

test("checkEntry: chave fora da allowlist e valor fora do enum são violações", () => {
  assert.deepEqual(checkEntry({ ts: "2026-10-09T10:00:00Z", scope: "session", phase: "E", model: "claude-sonnet-5-5", switched: true }), []);
  assert.deepEqual(checkEntry({ scope: "session", prompt: "x" }), ["chave fora da allowlist: prompt"]);
  assert.deepEqual(checkEntry({ scope: "batata" }), ["valor inválido em scope"]);
  assert.deepEqual(checkEntry({ agentType: "tem espaço e texto livre" }), ["valor inválido em agentType"]);
});

test("readLedger junta todos os arquivos do XDG da rodada; linha quebrada vira violação", () => {
  const xdg = mkdtempSync(join(tmpdir(), "lab-led-"));
  const d = join(xdg, "devflow-model-routing", "abc");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "s.jsonl"), JSON.stringify({ scope: "session", phase: "P" }) + "\nquebrada{\n");
  writeFileSync(join(d, "cli.jsonl"), JSON.stringify({ scope: "subagent", escalation: { at: "retry", action: "escalate" } }) + "\n");
  const r = readLedger(xdg);
  assert.equal(r.entries.length, 2);
  assert.deepEqual(r.violations, ["linha ilegível em s.jsonl"]);
});

test("readLedger: XDG sem ledger → vazio", () => {
  assert.deepEqual(readLedger(mkdtempSync(join(tmpdir(), "lab-led-"))), { entries: [], violations: [] });
});
```

`tests/unit/prevc.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPrevc } from "../../lib/prevc.mjs";

test("lê fases e status do prevc.json do dotcontext", () => {
  const ws = mkdtempSync(join(tmpdir(), "lab-pv-"));
  mkdirSync(join(ws, ".context/runtime/workflows"), { recursive: true });
  writeFileSync(join(ws, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { name: "shortlink", scale: 2, current_phase: "V" }, phases: { P: { status: "completed" }, R: { status: "completed" }, E: { status: "completed" }, V: { status: "in_progress" }, C: { status: "skipped" }, X: { status: "lixo" } } } }));
  assert.deepEqual(readPrevc(ws), { name: "shortlink", scale: 2, current: "V", phases: { P: "completed", R: "completed", E: "completed", V: "in_progress", C: "skipped" } });
});

test("sem prevc.json → null", () => assert.equal(readPrevc(mkdtempSync(join(tmpdir(), "lab-pv-"))), null));
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL

- [ ] **Step 3: Implementar**

`lib/ledger.mjs`:
```js
// lib/ledger.mjs — allowlist copiada da ADR-017/spec §8 (independente da lib sob teste).
import { join } from "node:path";
import { readSafe, listSafe } from "./safe-read.mjs";

const KEYS = ["ts", "sessionId", "scope", "agentId", "agentType", "phase", "skill", "tier", "model", "effort", "source", "ceiling", "adapter", "usage", "cacheReadRatio", "switched", "escalation"];
const SAFE = /^[A-Za-z0-9:_./@[\]-]{1,64}$/;
const TIERS = ["cheap", "standard", "capable", "top"];
const ENUM = {
  scope: ["session", "subagent"], phase: ["P", "R", "E", "V", "C"], tier: TIERS, ceiling: TIERS,
  effort: ["low", "medium", "high", "xhigh", "max"], source: ["plan", "skill", "project", "phase", "agent", "explicit", "inherit"],
  adapter: ["mod", "classic", "omp", "cli"],
};

export function checkEntry(e) {
  const v = [];
  for (const k of Object.keys(e ?? {})) if (!KEYS.includes(k)) v.push(`chave fora da allowlist: ${k}`);
  for (const [k, allowed] of Object.entries(ENUM)) if (k in e && !allowed.includes(e[k])) v.push(`valor inválido em ${k}`);
  for (const k of ["sessionId", "agentId", "agentType", "skill", "model"]) if (k in e && !(typeof e[k] === "string" && SAFE.test(e[k]))) v.push(`valor inválido em ${k}`);
  return v;
}

export function readLedger(xdgDir) {
  const root = join(xdgDir, "devflow-model-routing");
  const entries = [], violations = [];
  for (const proj of listSafe(root)) {
    for (const f of listSafe(join(root, proj)).filter((x) => x.endsWith(".jsonl")).sort()) {
      for (const line of (readSafe(join(root, proj, f)) ?? "").split("\n")) {
        if (!line.trim()) continue;
        let e;
        try { e = JSON.parse(line); } catch { violations.push(`linha ilegível em ${f}`); continue; }
        violations.push(...checkEntry(e));
        entries.push(e);
      }
    }
  }
  return { entries, violations };
}
```

`lib/prevc.mjs`:
```js
// lib/prevc.mjs — estado final do PREVC do workspace (só nomes de fase e status).
import { join } from "node:path";
import { readSafe } from "./safe-read.mjs";

const PH = ["P", "R", "E", "V", "C"];
const ST = ["pending", "in_progress", "completed", "skipped"];

export function readPrevc(ws) {
  let j;
  try { j = JSON.parse(readSafe(join(ws, ".context/runtime/workflows/prevc.json"), 2 ** 20) ?? ""); } catch { return null; }
  const p = j?.status?.project ?? {};
  const phases = {};
  for (const k of PH) { const s = j?.status?.phases?.[k]?.status; if (ST.includes(s)) phases[k] = s; }
  return {
    name: typeof p.name === "string" && /^[A-Za-z0-9 _.-]{1,64}$/.test(p.name) ? p.name : null,
    scale: typeof p.scale === "number" ? p.scale : null,
    current: PH.includes(p.current_phase) ? p.current_phase : null,
    phases,
  };
}
```

- [ ] **Step 4: Rodar e ver passar** → PASS (5)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): leitura do ledger com allowlist própria e do prevc.json"`

---

### Task 7: Invariantes e matriz de cobertura

**Agent:** backend-specialist · **Tier:** capable · **Tests:** unit

**Files:**
- Create: `lib/invariants.mjs`
- Test: `tests/unit/invariants.test.mjs`

**Interfaces:**
- Consumes: Task 2 (`modelTier`, `tierRank`, `effortRank`, `isRoutable`, `expectedSubagentTier`, `expectedSessionSwitches`, `capTier`).
- Consumes `Metrics` (produzido pela Task 11):
  ```
  Metrics = { armId, routing, ceiling: {model, effort}, invocations: number, complete: boolean,
    prevc: ReturnType<readPrevc> | null,
    session: { models: string[], efforts: string[] },
    subagents: Array<{ agentId, agentType, models: string[], efforts: string[] }>,
    ledger: { entries: object[], violations: string[] },
    tokens: { [model]: { input, output, cacheRead, cacheCreate, costUSD } },
    reportOk: boolean, acceptance: { passed, total, error? } | null }
  ```
- Produces: `evaluate(oracle, metrics) → Array<{ id, verdict: "HELD"|"MISS"|"N/A", evidence: string }>`; `coverage(metrics) → Array<{ feature, exercised: boolean, evidence: string }>`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/invariants.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, coverage } from "../../lib/invariants.mjs";
import { loadOracle } from "../../lib/tiers.mjs";

const o = loadOracle();
const done = { name: "x", scale: 2, current: "C", phases: { P: "completed", R: "completed", E: "completed", V: "completed", C: "completed" } };
const base = (over = {}) => ({
  armId: "B-routed", routing: true, ceiling: { model: "opus", effort: "xhigh" }, invocations: 1, complete: true, prevc: done,
  session: { models: ["claude-opus-5-5", "claude-sonnet-5-5"], efforts: ["xhigh", "medium"] },
  subagents: [
    { agentId: "a1", agentType: "devflow:code-reviewer", models: ["claude-opus-5-5"], efforts: ["high"] },
    { agentId: "a2", agentType: "devflow:documentation-writer", models: ["claude-haiku-5-5"], efforts: ["low"] },
    { agentId: "a3", agentType: "Explore", models: ["claude-opus-5-5"], efforts: [] },
  ],
  ledger: { violations: [], entries: [
    { scope: "session", phase: "E", switched: true, effort: "medium", skill: "devflow:prevc-execution" },
    { scope: "subagent", agentId: "a1", agentType: "devflow:code-reviewer", phase: "R", tier: "capable", source: "phase" },
    { scope: "subagent", agentId: "a2", agentType: "devflow:documentation-writer", phase: "C", tier: "cheap", source: "agent" },
  ] },
  tokens: {}, reportOk: true, acceptance: { passed: 20, total: 20 }, ...over,
});
const v = (m, id) => evaluate(o, m).find((x) => x.id === id);

test("rodada conforme → tudo HELD; Explore fica fora do INV-SUB", () => {
  for (const id of ["INV-CEIL", "INV-SESS", "INV-SUB", "INV-EFF", "INV-LEDGER", "INV-PREVC"]) assert.equal(v(base(), id).verdict, "HELD", id);
  assert.equal(v(base(), "INV-OFF").verdict, "N/A");
});

test("INV-CEIL: subagente acima do teto → MISS", () => {
  const m = base({ ceiling: { model: "sonnet", effort: "medium" }, session: { models: ["claude-sonnet-5-5"], efforts: ["medium"] } });
  assert.equal(v(m, "INV-CEIL").verdict, "MISS");
  assert.match(v(m, "INV-CEIL").evidence, /code-reviewer/);
});

test("INV-CEIL: esforço acima do teto → MISS", () => {
  const m = base({ session: { models: ["claude-opus-5-5"], efforts: ["max"] } });
  assert.equal(v(m, "INV-CEIL").verdict, "MISS");
});

test("INV-SESS: trocas acima de esperadas × invocações → MISS; sem roteamento → N/A", () => {
  const m = base({ session: { models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5-5"], efforts: [] } });
  assert.equal(v(m, "INV-SESS").verdict, "MISS");
  assert.equal(v({ ...m, invocations: 2 }, "INV-SESS").verdict, "HELD");
  assert.equal(v(base({ routing: false }), "INV-SESS").verdict, "N/A");
});

test("INV-SESS: troca registrada fora da fase esperada → MISS", () => {
  const m = base();
  m.ledger.entries[0] = { ...m.ledger.entries[0], phase: "V" };
  assert.equal(v(m, "INV-SESS").verdict, "MISS");
});

test("INV-SUB: tier diferente do oráculo sem fonte justificável → MISS; fonte plan → HELD", () => {
  const m = base();
  m.subagents[1] = { ...m.subagents[1], models: ["claude-sonnet-5-5"] };
  assert.equal(v(m, "INV-SUB").verdict, "MISS");
  m.ledger.entries[2] = { ...m.ledger.entries[2], source: "plan" };
  assert.equal(v(m, "INV-SUB").verdict, "HELD");
});

test("INV-SUB: sem subagente roteável → N/A", () => {
  assert.equal(v(base({ subagents: [] }), "INV-SUB").verdict, "N/A");
});

test("INV-LEDGER: violação → MISS; roteado sem ledger → MISS; braço A → N/A", () => {
  assert.equal(v(base({ ledger: { entries: [{}], violations: ["chave fora da allowlist: prompt"] } }), "INV-LEDGER").verdict, "MISS");
  assert.equal(v(base({ ledger: { entries: [], violations: [] } }), "INV-LEDGER").verdict, "MISS");
  assert.equal(v(base({ routing: false }), "INV-LEDGER").verdict, "N/A");
});

test("INV-OFF (braço A): ledger vazio → HELD; com ledger → MISS", () => {
  const a = base({ armId: "A-baseline", routing: false, ledger: { entries: [], violations: [] } });
  assert.equal(v(a, "INV-OFF").verdict, "HELD");
  assert.equal(v({ ...a, ledger: { entries: [{ scope: "session" }], violations: [] } }, "INV-OFF").verdict, "MISS");
});

test("INV-PREVC: fase não pulada sem completar → MISS; sem prevc → MISS", () => {
  assert.equal(v(base({ prevc: { ...done, phases: { ...done.phases, V: "in_progress" } } }), "INV-PREVC").verdict, "MISS");
  assert.equal(v(base({ prevc: null }), "INV-PREVC").verdict, "MISS");
  assert.equal(v(base({ prevc: { ...done, phases: { ...done.phases, R: "skipped" } } }), "INV-PREVC").verdict, "HELD");
});

test("coverage marca o que o ledger mostra", () => {
  const c = Object.fromEntries(coverage(base()).map((x) => [x.feature, x.exercised]));
  assert.equal(c["sessão por fase"], true);
  assert.equal(c["override de fase"], true);
  assert.equal(c["tier da task do plano"], false);
  assert.equal(c["escalada no meio"], false);
  assert.equal(c["model-route report"], true);
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL

- [ ] **Step 3: Implementar**

`lib/invariants.mjs`:
```js
// lib/invariants.mjs — vereditos (spec §7) e matriz de cobertura. Puro.
import { modelTier, tierRank, effortRank, isRoutable, expectedSubagentTier, expectedSessionTiers, expectedSessionSwitches, PHASES } from "./tiers.mjs";

const JUSTIFIED = ["plan", "skill", "explicit"];
const r = (id, verdict, evidence) => ({ id, verdict, evidence });
const subLedger = (m, agentId) => m.ledger.entries.find((e) => e.scope === "subagent" && e.agentId === agentId) ?? null;

function ceil(o, m) {
  const ct = modelTier(m.ceiling.model), ce = effortRank(m.ceiling.effort);
  const bad = [];
  for (const x of m.session.models) if (tierRank(modelTier(x)) > tierRank(ct)) bad.push(`sessão ${x}`);
  for (const e of m.session.efforts) if (effortRank(e) > ce) bad.push(`sessão esforço ${e}`);
  for (const s of m.subagents) {
    for (const x of s.models) if (tierRank(modelTier(x)) > tierRank(ct)) bad.push(`${s.agentType} ${x}`);
    for (const e of s.efforts) if (effortRank(e) > ce) bad.push(`${s.agentType} esforço ${e}`);
  }
  if (!m.session.models.length && !m.subagents.length) return r("INV-CEIL", "N/A", "sem transcript");
  return r("INV-CEIL", bad.length ? "MISS" : "HELD", bad.length ? bad.join("; ") : `teto ${m.ceiling.model}/${m.ceiling.effort}`);
}

function sess(o, m) {
  if (!m.routing) return r("INV-SESS", "N/A", "roteamento desligado");
  if (!m.session.models.length) return r("INV-SESS", "N/A", "sem transcript da sessão");
  const ct = modelTier(m.ceiling.model);
  const limit = expectedSessionSwitches(o, ct) * Math.max(1, m.invocations);
  const changes = m.session.models.length - 1;
  const tiers = expectedSessionTiers(o, ct);
  const okPhases = PHASES.filter((p, i) => i > 0 && tiers[p] !== tiers[PHASES[i - 1]]);
  const wrong = m.ledger.entries.filter((e) => e.scope === "session" && e.switched === true && !okPhases.includes(e.phase)).map((e) => e.phase ?? "?");
  const ev = `sequência ${m.session.models.join(" → ")}; trocas ${changes} (limite ${limit}); fases de troca no ledger: ${wrong.length ? `fora do esperado ${wrong.join(",")}` : "ok"}`;
  return r("INV-SESS", changes > limit || wrong.length ? "MISS" : "HELD", ev);
}

function sub(o, m) {
  if (!m.routing) return r("INV-SUB", "N/A", "roteamento desligado");
  const ct = modelTier(m.ceiling.model);
  const routable = m.subagents.filter((s) => isRoutable(o, s.agentType));
  if (!routable.length) return r("INV-SUB", "N/A", "nenhum subagente roteável");
  const bad = [];
  for (const s of routable) {
    const led = subLedger(m, s.agentId);
    const want = expectedSubagentTier(o, s.agentType, led?.phase ?? null, ct);
    const got = modelTier(s.models[0]);
    if (got === want) continue;
    if (led && JUSTIFIED.includes(led.source) && tierRank(got) <= tierRank(ct)) continue;
    bad.push(`${s.agentType}@${led?.phase ?? "?"}: ${got} (oráculo ${want}, fonte ${led?.source ?? "sem ledger"})`);
  }
  return r("INV-SUB", bad.length ? "MISS" : "HELD", bad.length ? bad.join("; ") : `${routable.length} subagentes conforme`);
}

function eff(o, m) {
  if (!m.routing) return r("INV-EFF", "N/A", "roteamento desligado");
  const s = m.ledger.entries.filter((e) => e.scope === "session" && e.effort);
  if (!s.length) return r("INV-EFF", "N/A", "sem esforço de sessão no ledger");
  const bad = s.filter((e) => effortRank(e.effort) > effortRank(m.ceiling.effort));
  return r("INV-EFF", bad.length ? "MISS" : "HELD", `${s.length} registros; acima do teto: ${bad.length}`);
}

function ledger(o, m) {
  if (!m.routing) return r("INV-LEDGER", "N/A", "roteamento desligado");
  if (!m.ledger.entries.length) return r("INV-LEDGER", "MISS", "roteado com ledger ligado e nenhuma linha gravada");
  return r("INV-LEDGER", m.ledger.violations.length ? "MISS" : "HELD", m.ledger.violations.length ? m.ledger.violations.slice(0, 5).join("; ") : `${m.ledger.entries.length} linhas válidas`);
}

function off(o, m) {
  if (m.routing) return r("INV-OFF", "N/A", "braço roteado");
  return r("INV-OFF", m.ledger.entries.length ? "MISS" : "HELD", `${m.ledger.entries.length} linhas de ledger com o roteamento desligado`);
}

function prevc(o, m) {
  if (!m.prevc) return r("INV-PREVC", "MISS", "sem prevc.json no workspace");
  const pend = Object.entries(m.prevc.phases).filter(([, s]) => s !== "completed" && s !== "skipped").map(([k, s]) => `${k}=${s}`);
  return r("INV-PREVC", pend.length ? "MISS" : "HELD", pend.length ? pend.join(", ") : `fases ${Object.keys(m.prevc.phases).join("")} concluídas`);
}

export const evaluate = (o, m) => [ceil, sess, sub, eff, ledger, off, prevc].map((f) => f(o, m));

export function coverage(m) {
  const L = m.ledger.entries;
  const has = (pred) => L.some(pred);
  const items = [
    ["sessão por fase", m.session.models.length > 1 || has((e) => e.scope === "session" && e.switched === true)],
    ["esforço por skill", has((e) => e.scope === "session" && e.skill && e.effort)],
    ["subagente por agente", has((e) => e.source === "agent")],
    ["override de fase", has((e) => e.source === "phase")],
    ["skill final-review", has((e) => e.source === "skill")],
    ["tier da task do plano", has((e) => e.source === "plan")],
    ["teto do usuário", m.routing && modelTier(m.ceiling.model) !== "capable"],
    ["esforço por passo", m.subagents.some((s) => new Set(s.efforts).size > 1)],
    ["escalada no meio", has((e) => e.escalation?.at === "midRun")],
    ["escalada entre tentativas", has((e) => e.escalation?.at === "retry")],
    ["ledger", L.length > 0],
    ["model-route report", m.reportOk === true],
    ["opt-in duplo (braço A)", !m.routing && L.length === 0],
  ];
  return items.map(([feature, exercised]) => ({ feature, exercised: !!exercised, evidence: exercised ? "observado" : "não observado nesta rodada" }));
}
```

- [ ] **Step 4: Rodar e ver passar** → PASS (11)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): vereditos das invariantes e matriz de cobertura"`

---

### Task 8: Scorecard

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `lib/scorecard.mjs`, `scripts/score.mjs`
- Test: `tests/unit/scorecard.test.mjs`

**Interfaces:**
- Consumes: `evaluate`, `coverage` (Task 7), `loadOracle` (Task 2), `Metrics`.
- Produces: `render({ title, runs: Array<{ metrics, verdicts, coverage }> }) → string` (Markdown); `economy(runs) → Array<{ armId, byModel, total: { input, output, cacheRead, cacheCreate, costUSD } }>`; CLI `node scripts/score.mjs --out results/<nome> runs/<id> [runs/<id> …]` grava `scorecard.md` e `summary.json`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/scorecard.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { render, economy } from "../../lib/scorecard.mjs";

const run = (armId, cost, out, passed) => ({
  metrics: { armId, tokens: { "claude-opus-5-5": { input: 1, output: out, cacheRead: 10, cacheCreate: 5, costUSD: cost } }, acceptance: { passed, total: 20 }, complete: true, invocations: 1,
             subagents: [{ agentType: "devflow:architect", models: ["claude-opus-5-5"] }] },
  verdicts: [{ id: "INV-CEIL", verdict: "HELD", evidence: "ok" }, { id: "INV-SUB", verdict: "MISS", evidence: "architect|x" }],
  coverage: [{ feature: "ledger", exercised: armId !== "A-baseline", evidence: "" }],
});

test("economy soma por braço", () => {
  const e = economy([run("A-baseline", 2, 100, 20)]);
  assert.deepEqual(e[0].total, { input: 1, output: 100, cacheRead: 10, cacheCreate: 5, costUSD: 2 });
});

test("render: seções, vereditos, razão B÷A, n=1 declarado e escape de |", () => {
  const md = render({ title: "Campanha X", runs: [run("A-baseline", 2, 100, 20), run("B-routed", 1, 50, 19)] });
  for (const s of ["# Campanha X", "## Vereditos", "## Cobertura da v3.7", "## Economia", "## Qualidade", "## Por agente"]) assert.ok(md.includes(s), s);
  assert.match(md, /\| INV-CEIL \| HELD \| HELD \|/);
  assert.match(md, /\| INV-SUB \| MISS \| MISS \|/);
  assert.match(md, /B-routed ÷ A-baseline[^\n]*0[,.]50/);
  assert.match(md, /n = 1/);
  assert.ok(md.includes("architect\\|x"));
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL

- [ ] **Step 3: Implementar**

`lib/scorecard.mjs`:
```js
// lib/scorecard.mjs — scorecard Markdown (spec §7–§9). Puro.
const esc = (s) => String(s ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
const fmt = (x) => (typeof x === "number" ? (Number.isInteger(x) ? String(x) : x.toFixed(2)) : "—");
const KEYS = ["input", "output", "cacheRead", "cacheCreate", "costUSD"];

export function economy(runs) {
  return runs.map(({ metrics }) => {
    const total = Object.fromEntries(KEYS.map((k) => [k, 0]));
    for (const u of Object.values(metrics.tokens ?? {})) for (const k of KEYS) total[k] += u[k] ?? 0;
    return { armId: metrics.armId, byModel: metrics.tokens ?? {}, total };
  });
}

export function render({ title, runs }) {
  const ids = runs.map((r) => r.metrics.armId);
  const L = [`# ${esc(title)}`, "", `Braços: ${ids.join(", ")}. Cada braço é uma rodada (n = 1); números não são extrapolados.`, ""];

  L.push("## Vereditos", "", `| Verificação | ${ids.join(" | ")} |`, `|---|${ids.map(() => "---").join("|")}|`);
  const vids = [...new Set(runs.flatMap((r) => r.verdicts.map((v) => v.id)))];
  for (const id of vids) L.push(`| ${id} | ${runs.map((r) => r.verdicts.find((v) => v.id === id)?.verdict ?? "—").join(" | ")} |`);
  L.push("", "**Evidências**", "");
  for (const r of runs) for (const v of r.verdicts) if (v.verdict !== "N/A") L.push(`- ${r.metrics.armId} · ${v.id} · ${v.verdict}: ${esc(v.evidence)}`);

  L.push("", "## Cobertura da v3.7", "", `| Funcionalidade | ${ids.join(" | ")} |`, `|---|${ids.map(() => "---").join("|")}|`);
  const feats = [...new Set(runs.flatMap((r) => r.coverage.map((c) => c.feature)))];
  for (const f of feats) L.push(`| ${esc(f)} | ${runs.map((r) => (r.coverage.find((c) => c.feature === f)?.exercised ? "sim" : "não")).join(" | ")} |`);

  const eco = economy(runs);
  L.push("", "## Economia", "", "| Braço | Modelo | Entrada | Saída | Cache lido | Cache criado | Custo de lista (US$) |", "|---|---|---|---|---|---|---|");
  for (const e of eco) for (const [m, u] of Object.entries(e.byModel)) L.push(`| ${e.armId} | ${esc(m)} | ${KEYS.map((k) => fmt(u[k])).join(" | ")} |`);
  const base = eco.find((e) => e.armId.startsWith("A"));
  if (base) for (const e of eco.filter((x) => x !== base)) {
    L.push("", `- ${e.armId} ÷ ${base.armId}: saída ${fmt(e.total.output / (base.total.output || 1))}, custo de lista ${fmt(e.total.costUSD / (base.total.costUSD || 1))}`);
  }
  L.push("", "O custo de lista é um peso por modelo, não o consumo da cota da assinatura (que não é público).");

  L.push("", "## Qualidade", "", "| Braço | Aceitação | PREVC completo | Invocações |", "|---|---|---|---|");
  for (const { metrics: m } of runs) L.push(`| ${m.armId} | ${m.acceptance ? `${m.acceptance.passed}/${m.acceptance.total}` : "—"} | ${m.complete ? "sim" : "não"} | ${m.invocations ?? "—"} |`);

  L.push("", "## Por agente", "", "| Braço | Agente | Despachos | Modelos |", "|---|---|---|---|");
  for (const { metrics: m } of runs) {
    const by = new Map();
    for (const s of m.subagents ?? []) { const x = by.get(s.agentType) ?? { n: 0, models: new Set() }; x.n++; s.models.forEach((k) => x.models.add(k)); by.set(s.agentType, x); }
    for (const [t, x] of by) L.push(`| ${m.armId} | ${esc(t)} | ${x.n} | ${[...x.models].join(", ")} |`);
  }
  return L.join("\n") + "\n";
}
```

`scripts/score.mjs`:
```js
#!/usr/bin/env node
// Junta as rodadas de uma campanha e grava results/<nome>/{scorecard.md,summary.json}.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { loadOracle } from "../lib/tiers.mjs";
import { evaluate, coverage } from "../lib/invariants.mjs";
import { render } from "../lib/scorecard.mjs";

const a = process.argv.slice(2);
const oi = a.indexOf("--out");
if (oi < 0 || !a[oi + 1]) { console.error("uso: score.mjs --out results/<nome> runs/<id>..."); process.exit(2); }
const out = resolve(a[oi + 1]);
const LAB = resolve(new URL("..", import.meta.url).pathname);
if (!out.startsWith(join(LAB, "results") + "/")) { console.error("score: --out deve ficar em results/"); process.exit(2); }
const dirs = a.filter((_, i) => i !== oi && i !== oi + 1);
const o = loadOracle();
const runs = dirs.map((d) => { const metrics = JSON.parse(readFileSync(join(d, "metrics.json"), "utf8")); return { metrics, verdicts: evaluate(o, metrics), coverage: coverage(metrics) }; });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "scorecard.md"), render({ title: `Campanha ${basename(out)}`, runs }));
writeFileSync(join(out, "summary.json"), JSON.stringify(runs.map((r) => ({ armId: r.metrics.armId, verdicts: r.verdicts.map(({ id, verdict }) => ({ id, verdict })), coverage: r.coverage.map(({ feature, exercised }) => ({ feature, exercised })), tokens: r.metrics.tokens, acceptance: r.metrics.acceptance })), null, 2) + "\n");
process.stdout.write(join(out, "scorecard.md") + "\n");
```

- [ ] **Step 4: Rodar e ver passar** → PASS (2)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): scorecard da campanha"`

---

### Task 9: Software-alvo, seed e materialização do workspace

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `brief/PRODUCT.md`, `seed/package.json`, `seed/.gitignore`, `seed/.devflow-language`, `seed/.mcp.json`, `seed/.context/.devflow.yaml.tmpl`, `lib/seed.mjs`
- Test: `tests/unit/seed.test.mjs`

**Interfaces:**
- Consumes: `modelsYaml` (Task 1).
- Produces: `materialize({ seedDir, briefPath, arm, wsDir }) → void` (cria o workspace com um commit inicial em `main`); constantes `FIRST_PROMPT`, `RESUME_PROMPT`.

- [ ] **Step 1: Escrever o brief** — `brief/PRODUCT.md`, em pt-BR, com **exatamente** este contrato (a suíte oculta da Task 10 depende dele):

```markdown
# shortlink — encurtador de links

Construa o produto abaixo seguindo o PREVC do DevFlow. Node ≥ 22, **só biblioteca padrão** (sem dependências npm). Testes com `node --test` em `test/`.

## Servidor
- `node src/server.mjs --port <n> --data <dir>`; escuta em `127.0.0.1`.
- Token de acesso em `SHORTLINK_TOKEN`. Rotas autenticadas exigem `Authorization: Bearer <token>`; a comparação do token é em tempo constante. Sem token ou token errado → `401`.
- Limite de taxa em `SHORTLINK_RATE_LIMIT` no formato `N/S` (default `60/60`): no máximo N requisições **autenticadas aceitas** em qualquer janela deslizante de S segundos. Uma requisição no instante t é aceita se houve menos de N aceitas em (t − S, t]. Recusada → `429` com `Retry-After` em segundos inteiros, arredondado para cima, mínimo 1, igual ao tempo até a mais antiga da janela sair dela. Requisições recusadas não contam. `GET /:slug` não tem limite.
- Corpo acima de 64 KiB → `413`. JSON inválido → `400`.

## Rotas
| Método e rota | Auth | Sucesso | Erros |
|---|---|---|---|
| `POST /links` corpo `{"url": "...", "slug"?: "..."}` | sim | `201` `{"slug","url"}` | `400` URL não http/https ou slug fora de `[A-Za-z0-9_-]{4,32}`; `409` slug já existe |
| `GET /:slug` | não | `302` com `Location` | `404` |
| `GET /links/:slug/stats` | sim | `200` `{"slug","url","hits"}` | `404` |
| `DELETE /links/:slug` | sim | `204` | `404` |

Sem `slug` no corpo, gere um de 7 caracteres `[A-Za-z0-9]`. `hits` conta cada `302` servido.

## Persistência
Arquivo `links.json` em `--data`. Toda escrita é atômica (arquivo temporário no mesmo diretório + rename). Reiniciar o servidor com o mesmo `--data` preserva links e hits.

## CLI
`node src/cli.mjs <comando> --server <url-base>`, token em `SHORTLINK_TOKEN`:
- `add <url> [--slug s]` → imprime o slug; `get <slug>` → imprime a URL de destino;
- `stats <slug>` → imprime o número de hits; `rm <slug>` → sai com 0.
Erro HTTP → mensagem em stderr e código de saída 1.

## Documentação
`README.md` com instalação, uso do servidor, da CLI e das variáveis.
```

- [ ] **Step 2: Escrever o seed**

`seed/package.json`:
```json
{ "name": "shortlink", "private": true, "type": "module", "engines": { "node": ">=22" }, "scripts": { "test": "node --test test/" } }
```

`seed/.gitignore`:
```
node_modules/
data/
```

`seed/.devflow-language`:
```
pt-BR
```

`seed/.mcp.json` — mesma entrada `dotcontext` do `.mcp.json` do repo `devflow`:
```json
{ "mcpServers": { "dotcontext": { "command": "npx", "args": ["-y", "@dotcontext/cli@latest", "--lang", "pt-BR", "mcp"] } } }
```

`seed/.context/.devflow.yaml.tmpl`:
```yaml
# .devflow.yaml do workspace do laboratório (spec L7): finalização local, sem forge.
git:
  strategy: branch-flow
  protectedBranches: [main]
  branchProtection: true
  autoFinish: false
  versioning: none

verify:
  unit: ["node", "--test", "test/"]
  lint: ["bash", "-c", "for f in src/*.mjs; do node --check \"$f\" || exit 1; done"]
  onTaskComplete: [unit]

{{MODELS}}
```

- [ ] **Step 3: Escrever o teste que falha**

`tests/unit/seed.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materialize, FIRST_PROMPT, RESUME_PROMPT } from "../../lib/seed.mjs";
import { loadArm } from "../../lib/arm.mjs";

const LAB = new URL("../..", import.meta.url).pathname;
const arm = (id) => loadArm(JSON.parse(readFileSync(join(LAB, "arms", `${id}.json`), "utf8")));
const ws = (id) => { const d = join(mkdtempSync(join(tmpdir(), "lab-seed-")), "ws"); materialize({ seedDir: join(LAB, "seed"), briefPath: join(LAB, "brief/PRODUCT.md"), arm: arm(id), wsDir: d }); return d; };

test("workspace B: brief, .devflow.yaml com models, um commit em main, sem acceptance", () => {
  const d = ws("B-routed");
  assert.ok(existsSync(join(d, "PRODUCT.md")));
  const y = readFileSync(join(d, ".context/.devflow.yaml"), "utf8");
  assert.match(y, /\nmodels:\n  enabled: true\n/);
  assert.ok(!y.includes("{{MODELS}}"));
  assert.ok(!existsSync(join(d, ".context/.devflow.yaml.tmpl")));
  assert.equal(execFileSync("git", ["-C", d, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).trim(), "1");
  assert.equal(execFileSync("git", ["-C", d, "branch", "--show-current"], { encoding: "utf8" }).trim(), "main");
  assert.equal(execFileSync("git", ["-C", d, "remote"], { encoding: "utf8" }).trim(), "");
  assert.ok(!readdirSync(d, { recursive: true }).some((p) => String(p).includes("acceptance")));
});

test("workspace A: sem bloco models", () => {
  assert.doesNotMatch(readFileSync(join(ws("A-baseline"), ".context/.devflow.yaml"), "utf8"), /models:/);
});

test("workspace já existente é recusado", () => {
  const d = ws("A-baseline");
  assert.throws(() => materialize({ seedDir: join(LAB, "seed"), briefPath: join(LAB, "brief/PRODUCT.md"), arm: arm("A-baseline"), wsDir: d }), /já existe/);
});

test("prompts: o primeiro chama o devflow em modo auto; o de retomada pede merge local", () => {
  assert.match(FIRST_PROMPT, /^\/devflow:devflow auto /);
  assert.match(RESUME_PROMPT, /merge local/);
});
```

- [ ] **Step 4: Rodar e ver falhar** → FAIL

- [ ] **Step 5: Implementar**

`lib/seed.mjs`:
```js
// lib/seed.mjs — materializa o workspace de uma rodada (spec L4/L7).
import { cpSync, existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { modelsYaml } from "./arm.mjs";

export const FIRST_PROMPT = "/devflow:devflow auto Construa o produto descrito em PRODUCT.md, percorrendo o PREVC inteiro.";
export const RESUME_PROMPT = "Continue o workflow PREVC em modo autônomo a partir do estado atual, sem pedir confirmação. Na finalização, escolha merge local na main.";

export function materialize({ seedDir, briefPath, arm, wsDir }) {
  if (existsSync(wsDir)) throw new Error(`workspace já existe: ${wsDir}`);
  mkdirSync(wsDir, { recursive: true });
  cpSync(seedDir, wsDir, { recursive: true });
  const tmpl = join(wsDir, ".context/.devflow.yaml.tmpl");
  writeFileSync(join(wsDir, ".context/.devflow.yaml"), readFileSync(tmpl, "utf8").replace("{{MODELS}}", modelsYaml(arm.models)));
  rmSync(tmpl);
  cpSync(briefPath, join(wsDir, "PRODUCT.md"));
  const git = (...a) => execFileSync("git", ["-C", wsDir, ...a], { stdio: "ignore" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "routing-lab");
  git("config", "user.email", "routing-lab@localhost");
  git("add", "-A");
  git("commit", "-q", "-m", "chore: seed do laboratório");
}
```

- [ ] **Step 6: Rodar e ver passar** → PASS (4)

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(lab): brief do shortlink, seed e materialização do workspace"`

---

### Task 10: Suíte de aceitação oculta e implementação de referência

**Agent:** test-writer · **Tier:** standard · **Tests:** unit + e2e

**Files:**
- Create: `fixtures/shortlink-ref/src/server.mjs`, `fixtures/shortlink-ref/src/cli.mjs`, `fixtures/shortlink-broken/src/server.mjs`
- Create: `acceptance/helpers.mjs`, `acceptance/api.test.mjs`, `acceptance/rate-limit.test.mjs`, `acceptance/cli.test.mjs`
- Create: `lib/accept.mjs`, `scripts/accept.mjs`
- Test: `tests/unit/accept.test.mjs`

**Interfaces:**
- Produces: `runAcceptance(wsDir) → Promise<{ passed, total, error? }>`; CLI `node scripts/accept.mjs --ws <dir> [--out <arquivo>]`. Env `SHORTLINK_WS` indica à suíte qual workspace subir.

- [ ] **Step 1: Escrever a suíte (os testes que a referência deve passar)**

`acceptance/helpers.mjs`:
```js
import { spawn, execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { promisify } from "node:util";

export const WS = process.env.SHORTLINK_WS;
export const TOKEN = "tok-123";
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });

export async function start({ data = mkdtempSync(join(tmpdir(), "sl-data-")), rate = "1000/1" } = {}) {
  const port = await freePort();
  const proc = spawn("node", [join(WS, "src/server.mjs"), "--port", String(port), "--data", data], { env: { ...process.env, SHORTLINK_TOKEN: TOKEN, SHORTLINK_RATE_LIMIT: rate }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${base}/__ping`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  return { base, data, stop: () => new Promise((r) => { proc.once("exit", r); proc.kill(); }) };
}

export const req = (base, path, { method = "GET", token = TOKEN, body, raw } = {}) =>
  fetch(base + path, { method, redirect: "manual", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: raw ?? (body ? JSON.stringify(body) : undefined) });

export const cli = (base, args) => promisify(execFile)("node", [join(WS, "src/cli.mjs"), ...args, "--server", base], { env: { ...process.env, SHORTLINK_TOKEN: TOKEN } })
  .then((r) => ({ code: 0, out: r.stdout.trim() }), (e) => ({ code: e.code ?? 1, out: (e.stdout ?? "").trim() }));
```

`acceptance/api.test.mjs`:
```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, req } from "./helpers.mjs";

let s;
before(async () => { s = await start(); });
after(() => s.stop());

test("401 sem token e com token errado", async () => {
  assert.equal((await req(s.base, "/links", { method: "POST", token: null, body: { url: "https://a.com" } })).status, 401);
  assert.equal((await req(s.base, "/links", { method: "POST", token: "x", body: { url: "https://a.com" } })).status, 401);
});
test("cria com slug gerado de 7 caracteres", async () => {
  const r = await req(s.base, "/links", { method: "POST", body: { url: "https://a.com/x" } });
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.match(j.slug, /^[A-Za-z0-9]{7}$/);
  assert.equal(j.url, "https://a.com/x");
});
test("slug próprio; duplicado → 409; inválido → 400", async () => {
  assert.equal((await req(s.base, "/links", { method: "POST", body: { url: "https://b.com", slug: "meu-slug" } })).status, 201);
  assert.equal((await req(s.base, "/links", { method: "POST", body: { url: "https://c.com", slug: "meu-slug" } })).status, 409);
  assert.equal((await req(s.base, "/links", { method: "POST", body: { url: "https://c.com", slug: "abc" } })).status, 400);
  assert.equal((await req(s.base, "/links", { method: "POST", body: { url: "https://c.com", slug: "tem espaço" } })).status, 400);
});
test("URL só http/https; ausente → 400; JSON inválido → 400; corpo > 64 KiB → 413", async () => {
  for (const url of ["javascript:alert(1)", "ftp://x.com", "nada", ""]) assert.equal((await req(s.base, "/links", { method: "POST", body: { url } })).status, 400, url);
  assert.equal((await req(s.base, "/links", { method: "POST", body: {} })).status, 400);
  assert.equal((await req(s.base, "/links", { method: "POST", raw: "{quebrado" })).status, 400);
  assert.equal((await req(s.base, "/links", { method: "POST", raw: JSON.stringify({ url: "https://a.com", pad: "x".repeat(70000) }) })).status, 413);
});
test("redirect 302 com Location e contagem de hits", async () => {
  await req(s.base, "/links", { method: "POST", body: { url: "https://d.com", slug: "hitme" } });
  const r = await req(s.base, "/hitme", { token: null });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://d.com");
  await req(s.base, "/hitme", { token: null });
  const st = await (await req(s.base, "/links/hitme/stats")).json();
  assert.deepEqual(st, { slug: "hitme", url: "https://d.com", hits: 2 });
});
test("404 para slug desconhecido em GET, stats e DELETE; stats exige auth", async () => {
  assert.equal((await req(s.base, "/naoexiste", { token: null })).status, 404);
  assert.equal((await req(s.base, "/links/naoexiste/stats")).status, 404);
  assert.equal((await req(s.base, "/links/naoexiste", { method: "DELETE" })).status, 404);
  assert.equal((await req(s.base, "/links/hitme/stats", { token: null })).status, 401);
});
test("DELETE → 204 e depois 404", async () => {
  await req(s.base, "/links", { method: "POST", body: { url: "https://e.com", slug: "apagar" } });
  assert.equal((await req(s.base, "/links/apagar", { method: "DELETE" })).status, 204);
  assert.equal((await req(s.base, "/apagar", { token: null })).status, 404);
});
test("persistência: reinício com o mesmo --data preserva link e hits", async () => {
  await req(s.base, "/links", { method: "POST", body: { url: "https://f.com", slug: "fica" } });
  await req(s.base, "/fica", { token: null });
  await s.stop();
  s = await start({ data: s.data });
  const st = await (await req(s.base, "/links/fica/stats")).json();
  assert.equal(st.hits, 1);
});
```

`acceptance/rate-limit.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { start, req } from "./helpers.mjs";

test("N aceitas, a N+1 → 429 com Retry-After ≥ 1; recusadas não contam; janela libera", async () => {
  const s = await start({ rate: "3/2" });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await req(s.base, "/links", { method: "POST", body: { url: "https://r.com" } })).status, 201, `req ${i}`);
    const r = await req(s.base, "/links", { method: "POST", body: { url: "https://r.com" } });
    assert.equal(r.status, 429);
    const ra = Number(r.headers.get("retry-after"));
    assert.ok(Number.isInteger(ra) && ra >= 1 && ra <= 2, `Retry-After=${ra}`);
    await new Promise((res) => setTimeout(res, 2100));
    assert.equal((await req(s.base, "/links", { method: "POST", body: { url: "https://r.com" } })).status, 201);
  } finally { await s.stop(); }
});

test("GET /:slug não é limitado", async () => {
  const s = await start({ rate: "1/60" });
  try {
    await req(s.base, "/links", { method: "POST", body: { url: "https://g.com", slug: "livre" } });
    for (let i = 0; i < 5; i++) assert.equal((await req(s.base, "/livre", { token: null })).status, 302);
  } finally { await s.stop(); }
});

test("401 não consome a cota", async () => {
  const s = await start({ rate: "1/60" });
  try {
    await req(s.base, "/links", { method: "POST", token: "x", body: { url: "https://h.com" } });
    assert.equal((await req(s.base, "/links", { method: "POST", body: { url: "https://h.com" } })).status, 201);
  } finally { await s.stop(); }
});
```

`acceptance/cli.test.mjs`:
```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, cli } from "./helpers.mjs";

let s;
before(async () => { s = await start(); });
after(() => s.stop());

test("add → get → stats → rm", async () => {
  const add = await cli(s.base, ["add", "https://cli.com", "--slug", "pelacli"]);
  assert.deepEqual(add, { code: 0, out: "pelacli" });
  assert.deepEqual(await cli(s.base, ["get", "pelacli"]), { code: 0, out: "https://cli.com" });
  assert.deepEqual(await cli(s.base, ["stats", "pelacli"]), { code: 0, out: "0" });
  assert.equal((await cli(s.base, ["rm", "pelacli"])).code, 0);
});
test("erro HTTP → código 1", async () => {
  assert.equal((await cli(s.base, ["get", "naoexiste"])).code, 1);
});
```

- [ ] **Step 2: Escrever a implementação de referência**

`fixtures/shortlink-ref/src/server.mjs`:
```js
// Implementação de referência do brief — existe só para provar a suíte oculta.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual, randomInt } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const port = Number(arg("--port", "8080"));
const data = arg("--data", "data");
const TOKEN = Buffer.from(process.env.SHORTLINK_TOKEN ?? "");
const [N, S] = (process.env.SHORTLINK_RATE_LIMIT ?? "60/60").split("/").map(Number);
const SLUG = /^[A-Za-z0-9_-]{4,32}$/;
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

mkdirSync(data, { recursive: true });
const file = join(data, "links.json");
let db = {};
try { db = JSON.parse(readFileSync(file, "utf8")); } catch {}
const save = () => { const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(db)); renameSync(tmp, file); };

const accepted = [];
function rateCheck() {
  const now = Date.now();
  while (accepted.length && accepted[0] <= now - S * 1000) accepted.shift();
  if (accepted.length >= N) return Math.max(1, Math.ceil((accepted[0] + S * 1000 - now) / 1000));
  accepted.push(now);
  return 0;
}
function authed(req) {
  const h = req.headers.authorization ?? "";
  if (!h.startsWith("Bearer ") || !TOKEN.length) return false;
  const got = Buffer.from(h.slice(7));
  return got.length === TOKEN.length && timingSafeEqual(got, TOKEN);
}
const send = (res, code, body, headers = {}) => { res.writeHead(code, { ...(body ? { "content-type": "application/json" } : {}), ...headers }); res.end(body ? JSON.stringify(body) : undefined); };
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size <= 65536) chunks.push(c); });
    req.on("end", () => resolve(size > 65536 ? null : Buffer.concat(chunks).toString("utf8")));
  });
}
const validUrl = (u) => { try { return ["http:", "https:"].includes(new URL(u).protocol); } catch { return false; } };

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://x");
  const m = pathname.match(/^\/links(?:\/([^/]+)(\/stats)?)?$/);
  if (m) {
    if (!authed(req)) return send(res, 401, { error: "unauthorized" });
    const wait = rateCheck();
    if (wait) return send(res, 429, { error: "rate limited" }, { "retry-after": String(wait) });
    const [, slug, stats] = m;
    if (!slug && req.method === "POST") {
      const raw = await readBody(req);
      if (raw === null) return send(res, 413, { error: "too large" });
      let b; try { b = JSON.parse(raw); } catch { return send(res, 400, { error: "invalid json" }); }
      if (!validUrl(b?.url)) return send(res, 400, { error: "invalid url" });
      let s = b.slug;
      if (s !== undefined && !(typeof s === "string" && SLUG.test(s))) return send(res, 400, { error: "invalid slug" });
      if (s === undefined) do { s = Array.from({ length: 7 }, () => ALNUM[randomInt(ALNUM.length)]).join(""); } while (db[s]);
      if (db[s]) return send(res, 409, { error: "exists" });
      db[s] = { url: b.url, hits: 0 }; save();
      return send(res, 201, { slug: s, url: b.url });
    }
    if (slug && stats && req.method === "GET") return db[slug] ? send(res, 200, { slug, url: db[slug].url, hits: db[slug].hits }) : send(res, 404, { error: "not found" });
    if (slug && !stats && req.method === "DELETE") { if (!db[slug]) return send(res, 404, { error: "not found" }); delete db[slug]; save(); return send(res, 204); }
    return send(res, 404, { error: "not found" });
  }
  const slug = pathname.slice(1);
  if (req.method === "GET" && db[slug]) { db[slug].hits++; save(); return send(res, 302, null, { location: db[slug].url }); }
  return send(res, 404, { error: "not found" });
}).listen(port, "127.0.0.1");
```

`fixtures/shortlink-ref/src/cli.mjs`:
```js
// CLI de referência do brief.
const [cmd, a1, ...rest] = process.argv.slice(2);
const all = process.argv.slice(2);
const opt = (k) => { const i = all.indexOf(k); return i >= 0 ? all[i + 1] : undefined; };
const base = opt("--server");
const auth = { authorization: `Bearer ${process.env.SHORTLINK_TOKEN ?? ""}`, "content-type": "application/json" };
const fail = (r) => { process.stderr.write(`erro HTTP ${r.status}\n`); process.exit(1); };
const run = async () => {
  if (cmd === "add") { const r = await fetch(`${base}/links`, { method: "POST", headers: auth, body: JSON.stringify({ url: a1, ...(opt("--slug") ? { slug: opt("--slug") } : {}) }) }); if (r.status !== 201) fail(r); console.log((await r.json()).slug); return; }
  if (cmd === "get") { const r = await fetch(`${base}/links/${a1}/stats`, { headers: auth }); if (r.status !== 200) fail(r); console.log((await r.json()).url); return; }
  if (cmd === "stats") { const r = await fetch(`${base}/links/${a1}/stats`, { headers: auth }); if (r.status !== 200) fail(r); console.log((await r.json()).hits); return; }
  if (cmd === "rm") { const r = await fetch(`${base}/links/${a1}`, { method: "DELETE", headers: auth }); if (r.status !== 204) fail(r); return; }
  process.stderr.write("uso: cli.mjs add|get|stats|rm ... --server URL\n"); process.exit(1);
};
run().catch((e) => { process.stderr.write(String(e.message) + "\n"); process.exit(1); });
```

`fixtures/shortlink-broken/src/server.mjs` (serve tudo com 500, para provar que a suíte reprova):
```js
import { createServer } from "node:http";
const i = process.argv.indexOf("--port");
createServer((req, res) => { res.writeHead(500); res.end(); }).listen(Number(process.argv[i + 1]), "127.0.0.1");
```

- [ ] **Step 3: Escrever o teste do runner que falha**

`tests/unit/accept.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAcceptance } from "../../lib/accept.mjs";

const LAB = new URL("../..", import.meta.url).pathname;

test("referência passa em tudo", async () => {
  const r = await runAcceptance(join(LAB, "fixtures/shortlink-ref"));
  assert.ok(r.total >= 13, `total=${r.total}`);
  assert.equal(r.passed, r.total);
});
test("implementação quebrada reprova", async () => {
  const r = await runAcceptance(join(LAB, "fixtures/shortlink-broken"));
  assert.ok(r.passed < r.total);
});
test("workspace sem src/server.mjs → passed 0 com erro, sem travar", async () => {
  const r = await runAcceptance(mkdtempSync(join(tmpdir(), "lab-acc-")));
  assert.equal(r.passed, 0);
  assert.match(r.error, /server\.mjs/);
});
```

- [ ] **Step 4: Rodar e ver falhar** — `node --test tests/unit/accept.test.mjs` → FAIL (`Cannot find module .../lib/accept.mjs`)

- [ ] **Step 5: Implementar o runner**

`lib/accept.mjs`:
```js
// lib/accept.mjs — roda a suíte oculta de fora do workspace (spec L4).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SUITE = new URL("../acceptance/", import.meta.url).pathname;

export function runAcceptance(wsDir, { timeoutMs = 120000 } = {}) {
  if (!existsSync(join(wsDir, "src/server.mjs"))) return Promise.resolve({ passed: 0, total: 0, error: "workspace sem src/server.mjs" });
  return new Promise((resolve) => {
    const p = spawn("node", ["--test", "--test-reporter=tap", "--test-concurrency=1", SUITE], { env: { ...process.env, SHORTLINK_WS: wsDir } });
    let out = "";
    p.stdout.on("data", (c) => { out += c; });
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("close", () => {
      clearTimeout(t);
      const num = (k) => Number(out.match(new RegExp(`^# ${k} (\\d+)$`, "m"))?.[1] ?? 0);
      resolve({ passed: num("pass"), total: num("tests") });
    });
  });
}
```

`scripts/accept.mjs`:
```js
#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runAcceptance } from "../lib/accept.mjs";
const a = process.argv.slice(2);
const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
if (!opt("--ws")) { console.error("uso: accept.mjs --ws <dir> [--out <arquivo>]"); process.exit(2); }
const r = await runAcceptance(resolve(opt("--ws")));
const json = JSON.stringify(r) + "\n";
if (opt("--out")) writeFileSync(opt("--out"), json); else process.stdout.write(json);
```

- [ ] **Step 6: Rodar e ver passar** — `node --test tests/unit/accept.test.mjs` → PASS (3). Se um caso da suíte falhar contra a referência, o erro está na suíte ou na referência — corrija aqui (é código do laboratório, não estímulo).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "test(lab): suíte de aceitação oculta com referência e controle quebrado"`

---

### Task 11: Driver da rodada e coleta

**Agent:** backend-specialist · **Tier:** capable · **Tests:** e2e

**Files:**
- Create: `lib/collect.mjs`, `scripts/run-arm.mjs`, `scripts/collect.mjs`, `tests/e2e/fake-claude.mjs`
- Test: `tests/e2e/run-arm.test.mjs`

**Interfaces:**
- Consumes: Tasks 1, 4, 5, 6, 9, 10.
- Produces: `node scripts/run-arm.mjs --arm arms/<id>.json --runs runs [--plugin-dir D] [--claude-bin claude] [--max-resumes 6] [--run-id ID]` → `runs/<id>/{run.json, stream-<n>.jsonl, ws/, xdg/}`, imprime o caminho da rodada. `collectRun(runDir, { projectsRoot, pluginDir }) → Metrics` e `node scripts/collect.mjs --run runs/<id> [--projects-root D] [--plugin-dir D]` → `runs/<id>/metrics.json` (inclui `acceptance`). `run.json = { armId, routing, ceiling, sessionIds, invocations, exitCodes, done, startedAt, endedAt }`.

- [ ] **Step 1: Escrever o `claude` falso**

`tests/e2e/fake-claude.mjs` (simula duas invocações: a 1ª conclui P/R/E e para; a retomada conclui V/C):
```js
#!/usr/bin/env node
// `claude` falso para o e2e: escreve stream-json, transcripts, ledger e prevc.json canônicos.
import { mkdirSync, writeFileSync, appendFileSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const resume = argv.includes("--resume") ? argv[argv.indexOf("--resume") + 1] : null;
const sid = resume ?? "11111111-2222-3333-4444-555555555555";
const ws = process.cwd();
const proj = join(process.env.FAKE_PROJECTS_ROOT, ws.replace(/[^A-Za-z0-9]/g, "-"));
mkdirSync(join(proj, sid, "subagents"), { recursive: true });
const msg = (id, model, effort) => JSON.stringify({ type: "assistant", effort, timestamp: "2026-10-09T10:00:00Z", message: { id, model, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 } } });
const pv = (phases) => { mkdirSync(join(ws, ".context/runtime/workflows"), { recursive: true }); writeFileSync(join(ws, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { name: "shortlink", scale: 3, current_phase: Object.keys(phases).at(-1) }, phases } })); };
const routed = process.env.DEVFLOW_MODEL_ROUTING === "1";
const led = routed ? join(process.env.XDG_DATA_HOME, "devflow-model-routing", "fake") : null;
if (led) mkdirSync(led, { recursive: true });
const L = (e) => led && appendFileSync(join(led, `${sid}.jsonl`), JSON.stringify({ ts: "2026-10-09T10:00:00Z", adapter: "mod", ...e }) + "\n");

if (!resume) {
  appendFileSync(join(proj, `${sid}.jsonl`), [msg("m1", "claude-opus-5-5", "xhigh"), msg("m2", "claude-opus-5-5", "xhigh")].join("\n") + "\n");
  writeFileSync(join(proj, sid, "subagents/agent-r1.meta.json"), JSON.stringify({ agentType: "devflow:code-reviewer", model: routed ? "opus" : undefined }));
  writeFileSync(join(proj, sid, "subagents/agent-r1.jsonl"), msg("r1", "claude-opus-5-5", "high") + "\n");
  L({ scope: "subagent", agentId: "r1", agentType: "devflow:code-reviewer", phase: "R", tier: "capable", source: "phase" });
  pv({ P: { status: "completed" }, R: { status: "completed" }, E: { status: "in_progress" } });
} else {
  const m = routed ? "claude-sonnet-5-5" : "claude-opus-5-5";
  appendFileSync(join(proj, `${sid}.jsonl`), [msg("m3", m, routed ? "medium" : "xhigh")].join("\n") + "\n");
  writeFileSync(join(proj, sid, "subagents/agent-d1.meta.json"), JSON.stringify({ agentType: "devflow:documentation-writer" }));
  writeFileSync(join(proj, sid, "subagents/agent-d1.jsonl"), msg("d1", routed ? "claude-haiku-5-5" : "claude-opus-5-5", routed ? "low" : "xhigh") + "\n");
  L({ scope: "session", phase: "E", switched: true, effort: "medium", skill: "devflow:prevc-execution", model: m });
  L({ scope: "subagent", agentId: "d1", agentType: "devflow:documentation-writer", phase: "C", tier: "cheap", source: "agent" });
  pv({ P: { status: "completed" }, R: { status: "completed" }, E: { status: "completed" }, V: { status: "completed" }, C: { status: "completed" } });
  if (process.env.FAKE_REF && !existsSync(join(ws, "src"))) cpSync(join(process.env.FAKE_REF, "src"), join(ws, "src"), { recursive: true });
}
const usage = { [routed && resume ? "claude-sonnet-5-5" : "claude-opus-5-5"]: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 100, cacheCreationInputTokens: 20, costUSD: routed ? 0.2 : 0.5 } };
process.stdout.write([
  JSON.stringify({ type: "system", subtype: "init", session_id: sid }),
  JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 4, terminal_reason: "completed", session_id: sid, modelUsage: usage, subagent_stats: { spawned: 1, completed: 1, failed: 0 } }),
].join("\n") + "\n");
```

Run: `chmod +x tests/e2e/fake-claude.mjs` (o driver o executa direto como `--claude-bin`).

- [ ] **Step 2: Escrever o e2e que falha**

`tests/e2e/run-arm.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LAB = new URL("../..", import.meta.url).pathname;
const FAKE = join(LAB, "tests/e2e/fake-claude.mjs");

function runArm(armId) {
  const runs = mkdtempSync(join(tmpdir(), "lab-runs-"));
  const projects = mkdtempSync(join(tmpdir(), "lab-proj-"));
  const env = { ...process.env, FAKE_PROJECTS_ROOT: projects, FAKE_REF: join(LAB, "fixtures/shortlink-ref") };
  const runDir = execFileSync("node", [join(LAB, "scripts/run-arm.mjs"), "--arm", join(LAB, `arms/${armId}.json`), "--runs", runs, "--plugin-dir", "/nao-usado", "--claude-bin", FAKE, "--run-id", `t-${armId}`], { env, encoding: "utf8" }).trim();
  execFileSync("node", [join(LAB, "scripts/collect.mjs"), "--run", runDir, "--projects-root", projects, "--no-report"], { env, encoding: "utf8" });
  return { runDir, run: JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")), metrics: JSON.parse(readFileSync(join(runDir, "metrics.json"), "utf8")) };
}

test("driver retoma até concluir C, acumulando sessão e uso das duas invocações", () => {
  const { run, metrics, runDir } = runArm("B-routed");
  assert.equal(run.invocations, 2);
  assert.equal(run.done, true);
  assert.deepEqual(run.sessionIds, ["11111111-2222-3333-4444-555555555555"]);
  assert.deepEqual(readdirSync(runDir).filter((f) => f.startsWith("stream-")).sort(), ["stream-1.jsonl", "stream-2.jsonl"]);
  assert.deepEqual(Object.keys(metrics.tokens).sort(), ["claude-opus-5-5", "claude-sonnet-5-5"]);
  assert.deepEqual(metrics.session.models, ["claude-opus-5-5", "claude-sonnet-5-5"]);
  assert.equal(metrics.subagents.length, 2);
  assert.equal(metrics.ledger.entries.length, 3);
  assert.equal(metrics.acceptance.passed, metrics.acceptance.total);
  assert.equal(metrics.complete, true);
});

test("braço A: sem ledger e sem DEVFLOW_MODEL_ROUTING no ambiente do claude", () => {
  const prev = process.env.DEVFLOW_MODEL_ROUTING;
  process.env.DEVFLOW_MODEL_ROUTING = "1";
  try {
    const { metrics } = runArm("A-baseline");
    assert.equal(metrics.ledger.entries.length, 0);
    assert.equal(metrics.routing, false);
  } finally { if (prev === undefined) delete process.env.DEVFLOW_MODEL_ROUTING; else process.env.DEVFLOW_MODEL_ROUTING = prev; }
});

test("metrics.json não carrega texto de transcript nem caminho do workspace", () => {
  const { metrics, runDir } = runArm("B-routed");
  const s = JSON.stringify(metrics);
  assert.ok(!s.includes(runDir));
  assert.ok(!s.includes("content"));
});
```

- [ ] **Step 3: Rodar e ver falhar** — `node --test tests/e2e/run-arm.test.mjs` → FAIL (`Cannot find module .../scripts/run-arm.mjs`)

- [ ] **Step 4: Implementar o driver**

`scripts/run-arm.mjs`:
```js
#!/usr/bin/env node
// Driver de uma rodada (spec L6): materializa, roda `claude -p`, retoma até a fase C concluir.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { loadArm, armArgs, armEnv } from "../lib/arm.mjs";
import { materialize, FIRST_PROMPT, RESUME_PROMPT } from "../lib/seed.mjs";
import { parseStream } from "../lib/stream.mjs";
import { readPrevc } from "../lib/prevc.mjs";
import { pluginDirFor } from "../lib/plugin.mjs";

const LAB = resolve(new URL("..", import.meta.url).pathname);
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
if (!opt("--arm")) { console.error("uso: run-arm.mjs --arm arms/<id>.json [--runs runs] [--plugin-dir D] [--claude-bin claude] [--max-resumes 6] [--run-id ID]"); process.exit(2); }

const arm = loadArm(JSON.parse(readFileSync(opt("--arm"), "utf8")));
const pluginDir = resolve(opt("--plugin-dir", pluginDirFor("v3.7.0")));
const runId = opt("--run-id", `${new Date().toISOString().replace(/[:.]/g, "-")}-${arm.id}`);
if (!/^[A-Za-z0-9-]{1,80}$/.test(runId)) { console.error("run-id inválido"); process.exit(2); }
const runDir = join(resolve(opt("--runs", join(LAB, "runs"))), runId);
if (existsSync(runDir)) { console.error(`rodada já existe: ${runDir}`); process.exit(2); }
const ws = join(runDir, "ws"), xdg = join(runDir, "xdg");
mkdirSync(xdg, { recursive: true });
materialize({ seedDir: join(LAB, "seed"), briefPath: join(LAB, "brief/PRODUCT.md"), arm, wsDir: ws });

const maxResumes = Number(opt("--max-resumes", "6"));
const claude = opt("--claude-bin", "claude");
const run = { armId: arm.id, routing: arm.routing, ceiling: arm.ceiling, sessionIds: [], invocations: 0, exitCodes: [], done: false, startedAt: new Date().toISOString(), endedAt: null };
const isDone = () => { const p = readPrevc(ws); return !!p && p.phases.C === "completed"; };

for (let i = 0; i <= maxResumes && !run.done; i++) {
  const resume = run.sessionIds.at(-1) ?? null;
  const r = spawnSync(claude, armArgs(arm, { pluginDir, prompt: i === 0 ? FIRST_PROMPT : RESUME_PROMPT, resume: i === 0 ? null : resume }), {
    cwd: ws, env: armEnv(arm, process.env, xdg), encoding: "utf8", maxBuffer: 1024 * 2 ** 20, timeout: 4 * 3600 * 1000,
  });
  run.invocations++;
  run.exitCodes.push(r.status ?? -1);
  writeFileSync(join(runDir, `stream-${run.invocations}.jsonl`), r.stdout ?? "");
  for (const s of parseStream(r.stdout ?? "").sessionIds) if (!run.sessionIds.includes(s)) run.sessionIds.push(s);
  run.done = isDone();
  if (!run.sessionIds.length) break; // nem sessão abriu: não há o que retomar
}
run.endedAt = new Date().toISOString();
writeFileSync(join(runDir, "run.json"), JSON.stringify(run, null, 2) + "\n");
process.stdout.write(runDir + "\n");
```

- [ ] **Step 5: Implementar a coleta**

`lib/collect.mjs`:
```js
// lib/collect.mjs — monta o Metrics de uma rodada (spec L8). Só números, enums e IDs.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseStream, mergeUsage } from "./stream.mjs";
import { projectSlug, readSession } from "./transcripts.mjs";
import { readLedger } from "./ledger.mjs";
import { readPrevc } from "./prevc.mjs";

export function collectRun(runDir, { projectsRoot }) {
  const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
  const ws = join(runDir, "ws");
  let tokens = {};
  for (const f of readdirSync(runDir).filter((x) => /^stream-\d+\.jsonl$/.test(x)).sort()) {
    const s = parseStream(readFileSync(join(runDir, f), "utf8"));
    if (s.result) tokens = mergeUsage(tokens, s.result.modelUsage);
  }
  const proj = join(projectsRoot, projectSlug(ws));
  const session = { models: [], efforts: [] };
  const subagents = [];
  for (const sid of run.sessionIds) {
    const t = readSession(proj, sid);
    for (const m of t.main.models) if (session.models.at(-1) !== m) session.models.push(m);
    session.efforts.push(...t.main.efforts);
    for (const s of t.subagents) if (!subagents.some((x) => x.agentId === s.agentId)) subagents.push({ agentId: s.agentId, agentType: s.agentType, models: s.models, efforts: s.efforts });
  }
  const prevc = readPrevc(ws);
  return {
    armId: run.armId, routing: run.routing, ceiling: run.ceiling, invocations: run.invocations,
    complete: run.done, prevc, session, subagents, ledger: readLedger(join(runDir, "xdg")), tokens,
    reportOk: false, acceptance: null,
  };
}
```

`scripts/collect.mjs`:
```js
#!/usr/bin/env node
// Gera runs/<id>/metrics.json (+ report.md do model-route, que fica só em runs/).
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { collectRun } from "../lib/collect.mjs";
import { runAcceptance } from "../lib/accept.mjs";
import { projectSlug } from "../lib/transcripts.mjs";
import { pluginDirFor } from "../lib/plugin.mjs";

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
if (!opt("--run")) { console.error("uso: collect.mjs --run runs/<id> [--projects-root D] [--plugin-dir D] [--no-report]"); process.exit(2); }
const runDir = resolve(opt("--run"));
const projectsRoot = resolve(opt("--projects-root", join(homedir(), ".claude/projects")));
const m = collectRun(runDir, { projectsRoot });
if (!a.includes("--no-report")) {
  const plugin = resolve(opt("--plugin-dir", pluginDirFor("v3.7.0")));
  const ws = join(runDir, "ws");
  const r = spawnSync("node", [join(plugin, "scripts/model-route.mjs"), "report", "--cwd", ws, "--transcripts", join(projectsRoot, projectSlug(ws))], { encoding: "utf8", env: { ...process.env, XDG_DATA_HOME: join(runDir, "xdg") } });
  writeFileSync(join(runDir, "report.md"), r.stdout ?? "");
  m.reportOk = r.status === 0 && (r.stdout ?? "").trim().length > 0;
}
m.acceptance = await runAcceptance(join(runDir, "ws"));
writeFileSync(join(runDir, "metrics.json"), JSON.stringify(m, null, 2) + "\n");
process.stdout.write(join(runDir, "metrics.json") + "\n");
```

- [ ] **Step 6: Rodar e ver passar** — `node --test tests/e2e/run-arm.test.mjs` → PASS (3)

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(lab): driver da rodada com retomada e coleta de métricas"`

---

### Task 12: Campanha, runbooks e README

**Agent:** documentation-writer (docs) + backend-specialist (`campaign.mjs`) · **Tier:** standard · **Tests:** e2e

**Files:**
- Create: `scripts/campaign.mjs`, `runbooks/campaign.md`, `runbooks/refine.md`, `README.md`
- Test: `tests/e2e/campaign.test.mjs`

**Interfaces:**
- Consumes: todos os scripts anteriores.
- Produces: `node scripts/campaign.mjs --arms A-baseline,B-routed [--name N] [--ref v3.7.0] [--claude-bin claude] [--projects-root D] [--runs runs] [--no-report]` → `results/<name>/scorecard.md` (default `name` = `<AAAA-MM-DD>-<braços>`).

- [ ] **Step 1: Escrever o e2e que falha**

`tests/e2e/campaign.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LAB = new URL("../..", import.meta.url).pathname;

test("campanha A+B com claude falso gera scorecard com vereditos e economia", () => {
  const name = `e2e-${process.pid}`;
  const env = { ...process.env, FAKE_PROJECTS_ROOT: mkdtempSync(join(tmpdir(), "lab-proj-")), FAKE_REF: join(LAB, "fixtures/shortlink-ref"), DEVFLOW_PLUGIN_DIR: "/nao-usado" };
  try {
    const out = execFileSync("node", [join(LAB, "scripts/campaign.mjs"), "--arms", "A-baseline,B-routed", "--name", name, "--claude-bin", join(LAB, "tests/e2e/fake-claude.mjs"), "--projects-root", env.FAKE_PROJECTS_ROOT, "--runs", mkdtempSync(join(tmpdir(), "lab-runs-")), "--no-report", "--no-ensure"], { env, encoding: "utf8" });
    const md = readFileSync(out.trim(), "utf8");
    assert.match(md, /\| INV-OFF \| HELD \| N\/A \|/);
    assert.match(md, /\| INV-CEIL \| HELD \| HELD \|/);
    assert.match(md, /\| INV-SUB \| N\/A \| HELD \|/);
    assert.match(md, /B-routed ÷ A-baseline/);
  } finally { rmSync(join(LAB, "results", name), { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL

- [ ] **Step 3: Implementar**

`scripts/campaign.mjs`:
```js
#!/usr/bin/env node
// Roda braços em sequência (nunca em paralelo — spec §10) e gera o scorecard.
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { ensurePlugin, pluginDirFor } from "../lib/plugin.mjs";

const LAB = resolve(new URL("..", import.meta.url).pathname);
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const arms = (opt("--arms") ?? "").split(",").filter(Boolean);
if (!arms.length || arms.some((x) => !/^[A-Za-z0-9-]{1,32}$/.test(x))) { console.error("uso: campaign.mjs --arms A-baseline,B-routed [--name N] [--ref R] ..."); process.exit(2); }
const ref = opt("--ref", "v3.7.0");
const name = opt("--name", `${new Date().toISOString().slice(0, 10)}-${arms.join("+")}`);
const pluginDir = a.includes("--no-ensure") ? pluginDirFor(ref) : ensurePlugin({ ref });
const pass = (k) => (opt(k) ? [k, opt(k)] : []);
const node = (script, args) => execFileSync("node", [join(LAB, "scripts", script), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

const runDirs = [];
for (const id of arms) {
  const runDir = node("run-arm.mjs", ["--arm", join(LAB, "arms", `${id}.json`), "--plugin-dir", pluginDir, ...pass("--runs"), ...pass("--claude-bin"), ...pass("--max-resumes")]);
  node("collect.mjs", ["--run", runDir, "--plugin-dir", pluginDir, ...pass("--projects-root"), ...(a.includes("--no-report") ? ["--no-report"] : [])]);
  runDirs.push(runDir);
}
process.stdout.write(node("score.mjs", ["--out", join(LAB, "results", name), ...runDirs]) + "\n");
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/e2e/campaign.test.mjs` → PASS

- [ ] **Step 5: Escrever a documentação**

`README.md`: objetivo (as quatro perguntas da spec §1), pré-requisitos (Claude Code ≥ 2.1.293, Node ≥ 22, repo `devflow` como irmão com a tag `v3.7.0`, superpowers em escopo de usuário, login no Claude Code), comandos (`bash tests/run-unit.sh`, `run-integration.sh`, `run-e2e.sh`, `run-lint.sh`, `node scripts/campaign.mjs --arms A-baseline,B-routed`), mapa de diretórios e as regras: "capturar, não resolver", "só números em `results/`", "nunca em paralelo".

`runbooks/campaign.md`: (1) `bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-e2e.sh`; (2) `node scripts/campaign.mjs --arms A-baseline,B-routed` em background, com custo declarado (duas rodadas PREVC completas na cota da assinatura; cada uma pode levar horas); (3) como acompanhar (`runs/<id>/stream-<n>.jsonl` cresce; `prevc.json` do `ws/`); (4) rodada `incomplete`: não retomar à mão, registrar como achado; (5) ler o scorecard e registrar os `MISS` em `results/<nome>/findings.md` com evidência; (6) braços C e D opcionais: `--arms C-ceiling` e `--arms D-stress`.

`runbooks/refine.md`: hipótese → braço novo `arms/B2-<hipótese>.json` copiado de `B-routed` com `models.overrides` → `--arms B2-<hipótese>` → comparar com o B da campanha anterior (mesmo brief) → se a hipótese se confirma, abrir um workflow no repo `devflow` propondo a mudança no `assets/model-routing/routes.json` e reavaliar com `--ref <branch>`.

- [ ] **Step 6: Rodar o contrato inteiro**

Run: `bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-e2e.sh && bash tests/run-lint.sh`
Expected: tudo PASS (achados L1 marcados como `todo` não reprovam)

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(lab): campanha, runbooks e README"`

---

## Fase V deste workflow (não é task de E)

1. Contrato completo do laboratório verde (Step 6 da Task 12).
2. Revisão de segurança de `run-arm.mjs`, `collect.mjs` e `lib/safe-read.mjs` (`security-auditor`).
3. **Campanha real:** `node scripts/campaign.mjs --arms A-baseline,B-routed` em background; ao fim, `results/<data>-A-baseline+B-routed/scorecard.md` revisado e os `MISS` registrados em `findings.md`. Achados do DevFlow viram backlog no repo `devflow`; não se corrigem nesta rodada.
