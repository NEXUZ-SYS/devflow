# Laboratório de Roteamento de Modelos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** model-routing-e2e-validation | **Scale:** LARGE | **Phase:** R→E | **Autonomy:** autonomous
> **Revisão R (2026-10-09):** incorpora os achados do architect (14) e do security-auditor (10) e as sondas da spec §13.

**Goal:** Construir o repo `devflow-routing-lab`, que roda o PREVC inteiro de forma autônoma sobre um software-alvo pequeno, em braços com e sem roteamento, e gera um scorecard que valida o roteamento de modelos da v3.7.0 contra a fase real.

**Architecture:** Libs pequenas (braço, oráculo, stream-json, leitura segura, transcripts, ledger, prevc, invariantes, scorecard, coleta, aceitação) e scripts finos (`plugin`, `run-arm`, `collect`, `accept`, `score`, `campaign`). O plugin sob teste vem de um clone da tag `v3.7.0` por `--plugin-dir`; cada rodada roda isolada em `tmpdir` (spec L12/L13). A camada L1 testa a CLI, o hook clássico e o `router-core` da tag de forma determinística; a L3 roda sessões reais.

**Tech Stack:** Node ≥ 22 (só biblioteca padrão), `node --test`, git, Claude Code CLI ≥ 2.1.293.

**Spec:** `docs/superpowers/specs/2026-10-09-model-routing-lab-design.md`

**Agents:** backend-specialist (libs/scripts), test-writer (oráculo, L1, suíte oculta), security-auditor (revisão pesada das Tasks 10 e 11), documentation-writer (README, GABARITO, runbooks), architect (revisão R).

```yaml
requiredSignals: [unit, integration, e2e, lint]
```

## Global Constraints

- O laboratório é um repo irmão do `devflow`: `../devflow-routing-lab` (git local, **sem remoto**). Caminhos de arquivo abaixo são relativos à raiz dele, salvo indicação.
- Node ≥ 22, só biblioteca padrão; nenhuma dependência npm. Testes com `node --test`.
- Plugin sob teste: tag `v3.7.0`, clonada com `git clone --depth 1 --branch v3.7.0` para `.cache/devflow@v3.7.0` (no `.gitignore`). Superpowers: `--plugin-dir` para a maior versão em `~/.claude/plugins/cache/claude-plugins-official/superpowers/` (ou `SUPERPOWERS_PLUGIN_DIR`).
- Rodadas em `${TMPDIR:-/tmp}/devflow-routing-lab/runs/` — nunca dentro do laboratório nem de `$HOME`.
- O repo do laboratório só recebe escrita em `results/`. `metrics.json` e `results/` contêm só números, enums e IDs validados por regex.
- Leitura de arquivo vindo do agente: só arquivo regular, sem seguir link (nem em diretório intermediário), até 64 MiB.
- Veredito: `HELD` | `MISS` | `N/A`. Tiers: `cheap` < `standard` < `capable` < `top`; `haiku`→cheap, `sonnet`→standard, `opus`→capable, `fable`→top. Esforço: `low` < `medium` < `high` < `xhigh` < `max`.
- Variáveis `ROUTING_LAB_FAKE_*` existem só para o `claude` falso dos testes; o driver as repassa e nada mais as lê.
- Idioma: pt-BR em docs, mensagens e nomes de teste.

**Bloco de proibições — copiar LITERALMENTE em todo prompt de despacho de subagente deste plano:**

```text
PROIBIDO neste trabalho:
- gh, criar PR, git merge para main, git push, git remote, git worktree (em qualquer repo).
- Rodar `claude -p`, scripts/run-arm.mjs ou scripts/campaign.mjs com o claude REAL (só com tests/e2e/fake-claude.mjs).
- Editar qualquer coisa em ~/.claude/**, no repo devflow (exceto o `git clone --depth 1` da Task 3, que só LÊ o repo) e em devflow-e2e-sandbox.
- Commits só no repo ../devflow-routing-lab.
```

## Review Focus

1. **Tokens duplicados entre retomadas** — `modelUsage` pode vir acumulado; a fonte é o transcript deduplicado. Teste em `tests/e2e/run-arm.test.mjs` (Task 11) fixa os totais por modelo.
2. **Mensagem fora de qualquer intervalo de fase** — fase desconhecida não entra na verificação nem vira MISS. Testes em `prevc.test.mjs` (Task 6) e `invariants.test.mjs` (Task 7).
3. **Link simbólico em diretório intermediário** plantado pelo agente (`bypassPermissions`) — ignorado. Testes em `safe-read.test.mjs` e `transcripts.test.mjs` (Task 5), `ledger.test.mjs` (Task 6).
4. **Linha de ledger não-objeto ou com chave arbitrária** — vira código de violação, nunca texto em `results/`. Testes em `ledger.test.mjs` (Task 6) e `scorecard.test.mjs` (Task 8).
5. **Workspace sem `src/server.mjs` ou servidor que morre cedo** — `accept` devolve resultado sem travar. Testes em `accept.test.mjs` (Task 10).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `package.json`, `.gitignore`, `tests/run-{unit,integration,e2e,lint}.sh` | bootstrap e contrato `verify:` |
| `lib/arm.mjs`, `arms/*.json` | braço → env por allowlist, argv com isolamento, bloco `models:` |
| `lib/tiers.mjs`, `oracle/oracle.json`, `GABARITO.md` | oráculo independente (tier e esforço) |
| `lib/plugin.mjs`, `scripts/plugin.mjs` | clone da tag, superpowers, versões, integridade |
| `l1/*.test.mjs` | camada L1 (CLI, hook clássico, `router-core`) |
| `lib/stream.mjs` | `stream-json`: sessões, `init`, resultado, preflight |
| `lib/safe-read.mjs`, `lib/transcripts.mjs` | leitura segura + mensagens com timestamp |
| `lib/ledger.mjs`, `lib/prevc.mjs` | ledger normalizado; fases com timestamps |
| `lib/invariants.mjs` | vereditos + cobertura |
| `lib/scorecard.mjs`, `scripts/score.mjs` | scorecard |
| `brief/PRODUCT.md`, `seed/`, `lib/seed.mjs` | software-alvo e workspace |
| `acceptance/`, `fixtures/shortlink-{ref,broken}/`, `lib/accept.mjs`, `scripts/accept.mjs` | suíte oculta |
| `lib/collect.mjs`, `scripts/run-arm.mjs`, `scripts/collect.mjs`, `tests/e2e/fake-claude.mjs` | driver e coleta |
| `scripts/campaign.mjs`, `runbooks/*.md`, `README.md` | campanha e operação |

---

### Task 1: Bootstrap do repo e braços como dados

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `package.json`, `.gitignore`, `tests/run-unit.sh`, `tests/run-integration.sh`, `tests/run-e2e.sh`, `tests/run-lint.sh`
- Create: `lib/arm.mjs`, `arms/A-baseline.json`, `arms/B-routed.json`, `arms/C-ceiling.json`, `arms/D-stress.json`
- Test: `tests/unit/arm.test.mjs`

**Interfaces:**
- Produces: `loadArm(obj) → Arm`; `armEnv(arm, baseEnv, { xdgDir, runDir }) → env`; `armArgs(arm, { pluginDir, superpowersDir, mcpConfig, prompt, resume?, model?, effort? }) → string[]`; `modelsYaml(models) → string`; `DISALLOWED: string[]`. `Arm = { id, description, routing, ceiling: { model, effort }, models }`.

- [ ] **Step 1: Criar o repo e o bootstrap**

```bash
mkdir ../devflow-routing-lab && cd ../devflow-routing-lab && git init -b main
git config user.name "routing-lab" && git config user.email "routing-lab@localhost"
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
# Sintaxe de todo .mjs versionado + guarda: script nenhum grava com caminho literal fora do laboratório.
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
const dirs = { xdgDir: "/r/xdg", runDir: "/r" };

test("os quatro braços versionados são válidos", () => {
  for (const id of ["A-baseline", "B-routed", "C-ceiling", "D-stress"]) assert.equal(arm(id).id, id);
});

test("braço inválido é recusado com mensagem", () => {
  assert.throws(() => loadArm({ id: "x", routing: true, ceiling: { model: "gpt", effort: "high" }, models: null }), /modelo do teto/);
  assert.throws(() => loadArm({ id: "x", routing: true, ceiling: { model: "opus", effort: "turbo" }, models: null }), /esforço do teto/);
  assert.throws(() => loadArm({ id: "../x", routing: false, ceiling: { model: "opus", effort: "high" }, models: null }), /id/);
  assert.throws(() => loadArm({ id: "x", routing: true, ceiling: { model: "opus", effort: "high" }, models: null }), /models/);
});

test("armEnv: allowlist; credenciais, modelo e hooks do usuário não passam; git/gh neutros", () => {
  const base = { HOME: "/h", PATH: "/bin", LANG: "pt_BR.UTF-8", DEVFLOW_MODEL_ROUTING: "1", GH_TOKEN: "x", GITHUB_TOKEN: "x",
    SSH_AUTH_SOCK: "/s", ANTHROPIC_MODEL: "opus", CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1", ROUTING_LAB_FAKE_REF: "/f" };
  const a = armEnv(arm("A-baseline"), base, dirs);
  for (const k of ["DEVFLOW_MODEL_ROUTING", "GH_TOKEN", "GITHUB_TOKEN", "SSH_AUTH_SOCK", "ANTHROPIC_MODEL", "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS"]) assert.equal(a[k], undefined, k);
  assert.deepEqual(
    [a.HOME, a.PATH, a.LANG, a.XDG_DATA_HOME, a.GIT_CONFIG_GLOBAL, a.GIT_CONFIG_NOSYSTEM, a.GIT_TERMINAL_PROMPT, a.GH_CONFIG_DIR, a.DISABLE_AUTOUPDATER, a.ROUTING_LAB_FAKE_REF],
    ["/h", "/bin", "pt_BR.UTF-8", "/r/xdg", "/r/gitconfig", "1", "0", "/r/gh", "1", "/f"]);
  assert.equal(armEnv(arm("B-routed"), base, dirs).DEVFLOW_MODEL_ROUTING, "1");
});

test("armArgs: isolamento, dois plugins, teto, retomada e override do preflight", () => {
  const o = { pluginDir: "/p", superpowersDir: "/s", mcpConfig: "/w/.mcp.json", prompt: "oi" };
  const args = armArgs(arm("C-ceiling"), { ...o, resume: "sid-1" });
  const val = (f) => args[args.indexOf(f) + 1];
  assert.deepEqual(args.slice(0, 2), ["-p", "oi"]);
  assert.deepEqual(args.filter((_, i) => args[i - 1] === "--plugin-dir"), ["/p", "/s"]);
  for (const [f, v] of [["--setting-sources", "project,local"], ["--mcp-config", "/w/.mcp.json"], ["--model", "sonnet"], ["--effort", "medium"],
    ["--permission-mode", "bypassPermissions"], ["--output-format", "stream-json"], ["--resume", "sid-1"]]) assert.equal(val(f), v, f);
  assert.ok(args.includes("--strict-mcp-config") && args.includes("--verbose"));
  const d = args.indexOf("--disallowedTools");
  assert.deepEqual(args.slice(d + 1, d + 4), ["Bash(gh *)", "Bash(git push*)", "Bash(git remote*)"]);
  const pre = armArgs(arm("B-routed"), { ...o, model: "haiku", effort: "low" });
  assert.equal(pre[pre.indexOf("--model") + 1], "haiku");
  assert.equal(pre[pre.indexOf("--effort") + 1], "low");
  assert.ok(!pre.includes("--resume"));
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
// lib/arm.mjs — um braço da campanha descrito por dados (spec L5) e o isolamento da rodada (spec L12). Puro.
const MODELS = ["haiku", "sonnet", "opus", "fable"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const ID = /^[A-Za-z0-9-]{1,32}$/;
const PASS = ["PATH", "LANG", "LC_ALL", "TERM", "TMPDIR", "HOME"];
const FAKE = /^ROUTING_LAB_FAKE_[A-Z_]{1,40}$/; // só o claude falso dos testes lê
export const DISALLOWED = ["Bash(gh *)", "Bash(git push*)", "Bash(git remote*)"];

export function loadArm(o) {
  if (!o || typeof o !== "object") throw new Error("braço: objeto esperado");
  if (typeof o.id !== "string" || !ID.test(o.id)) throw new Error("braço: id inválido");
  if (!MODELS.includes(o.ceiling?.model)) throw new Error(`braço ${o.id}: modelo do teto inválido`);
  if (!EFFORTS.includes(o.ceiling?.effort)) throw new Error(`braço ${o.id}: esforço do teto inválido`);
  if (typeof o.routing !== "boolean") throw new Error(`braço ${o.id}: routing deve ser booleano`);
  if (o.routing && (!o.models || typeof o.models !== "object")) throw new Error(`braço ${o.id}: routing exige models`);
  return { id: o.id, description: String(o.description ?? ""), routing: o.routing, ceiling: { ...o.ceiling }, models: o.models ?? null };
}

export function armEnv(arm, baseEnv, { xdgDir, runDir }) {
  const env = {};
  for (const k of PASS) if (typeof baseEnv[k] === "string") env[k] = baseEnv[k];
  for (const k of Object.keys(baseEnv)) if (FAKE.test(k)) env[k] = baseEnv[k];
  Object.assign(env, {
    XDG_DATA_HOME: xdgDir, DISABLE_AUTOUPDATER: "1",
    GIT_CONFIG_GLOBAL: `${runDir}/gitconfig`, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GH_CONFIG_DIR: `${runDir}/gh`,
  });
  if (arm.routing) env.DEVFLOW_MODEL_ROUTING = "1";
  return env;
}

export function armArgs(arm, { pluginDir, superpowersDir, mcpConfig, prompt, resume, model, effort }) {
  const a = ["-p", prompt, "--plugin-dir", pluginDir, "--plugin-dir", superpowersDir,
    "--setting-sources", "project,local", "--strict-mcp-config", "--mcp-config", mcpConfig,
    "--disallowedTools", ...DISALLOWED,
    "--permission-mode", "bypassPermissions", "--output-format", "stream-json", "--verbose",
    "--model", model ?? arm.ceiling.model, "--effort", effort ?? arm.ceiling.effort];
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
Expected: PASS (5 testes); lint sem erro

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(lab): bootstrap, braços como dados e isolamento da rodada"
```

---

### Task 2: Oráculo independente e gabarito

**Agent:** test-writer · **Tier:** capable · **Tests:** unit

**Files:**
- Create: `oracle/oracle.json`, `lib/tiers.mjs`, `GABARITO.md`
- Test: `tests/unit/tiers.test.mjs`

**Interfaces:**
- Produces: `TIERS`, `EFFORTS`, `PHASES`; `loadOracle()`; `modelTier(id)`; `tierRank(t)`; `effortRank(e)`; `capTier(t, ceilingTier)`; `capEffort(e, ceilingEffort)`; `agentKey(type)`; `isRoutable(o, type)`; `expectedSubagentTier(o, type, phase|null, ceilingTier) → tier|null`; `expectedSessionTiers(o, ceilingTier) → {P..C}`; `expectedSessionSwitches(o, ceilingTier) → number`; `expectedSkillEffort(o, skill|null, ceilingEffort) → effort|null`; `expectedAgentEffort(o, type, ceilingEffort) → effort|null`.

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
  "agentEffort": {
    "architect": "high", "security-auditor": "high",
    "bug-fixer": "high", "performance-optimizer": "high", "product-manager": "high",
    "code-reviewer": "medium", "feature-developer": "medium", "test-writer": "medium",
    "refactoring-specialist": "medium", "backend-specialist": "medium", "frontend-specialist": "medium",
    "database-specialist": "medium", "devops-specialist": "medium", "mobile-specialist": "medium",
    "business-context": "medium", "product-context": "medium", "operations-context": "medium",
    "engineering-context": "medium",
    "documentation-writer": "low", "memory-specialist": "low"
  },
  "phaseOverrides": {
    "R": { "code-reviewer": "capable" },
    "C": { "general-purpose": "cheap", "documentation-writer": "cheap" }
  },
  "sessionPhases": { "P": "ceiling", "R": "ceiling", "E": "standard", "V": "standard", "C": "standard" },
  "sessionSkillEffort": {
    "superpowers:brainstorming": "ceiling", "superpowers:writing-plans": "ceiling",
    "devflow:prevc-review": "ceiling", "superpowers:systematic-debugging": "ceiling",
    "devflow:prevc-execution": "medium", "superpowers:subagent-driven-development": "medium",
    "devflow:prevc-validation": "medium",
    "devflow:commit-message": "low", "devflow:documentation": "low", "devflow:prevc-confirmation": "low"
  }
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

test("ranks e tetos", () => {
  assert.ok(t.tierRank("cheap") < t.tierRank("top"));
  assert.equal(t.tierRank("x"), -1);
  assert.ok(t.effortRank("medium") < t.effortRank("xhigh"));
  assert.equal(t.capTier("capable", "standard"), "standard");
  assert.equal(t.capTier("cheap", "standard"), "cheap");
  assert.equal(t.capEffort("high", "medium"), "medium");
  assert.equal(t.capEffort("low", "xhigh"), "low");
});

test("roteável: devflow:* conhecido e general-purpose; Explore não", () => {
  assert.ok(t.isRoutable(o, "devflow:architect"));
  assert.ok(t.isRoutable(o, "general-purpose"));
  assert.ok(!t.isRoutable(o, "Explore"));
  assert.ok(!t.isRoutable(o, "devflow:nao-existe"));
  assert.ok(!t.isRoutable(o, "devflow:__proto__"));
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

test("esforço: skill mapeada ('ceiling' = teto); agente; teto limita; sem mapa → null", () => {
  assert.equal(t.expectedSkillEffort(o, "superpowers:brainstorming", "xhigh"), "xhigh");
  assert.equal(t.expectedSkillEffort(o, "devflow:prevc-execution", "xhigh"), "medium");
  assert.equal(t.expectedSkillEffort(o, "devflow:prevc-execution", "low"), "low");
  assert.equal(t.expectedSkillEffort(o, "outra", "xhigh"), null);
  assert.equal(t.expectedSkillEffort(o, null, "xhigh"), null);
  assert.equal(t.expectedAgentEffort(o, "devflow:architect", "medium"), "medium");
  assert.equal(t.expectedAgentEffort(o, "devflow:documentation-writer", "xhigh"), "low");
  assert.equal(t.expectedAgentEffort(o, "general-purpose", "xhigh"), null);
  assert.equal(t.expectedAgentEffort(o, "Explore", "xhigh"), null);
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
const own = (obj, k) => obj != null && Object.hasOwn(obj, k);

export const loadOracle = () => JSON.parse(readFileSync(new URL("../oracle/oracle.json", import.meta.url), "utf8"));
export function modelTier(id) {
  if (typeof id !== "string") return null;
  for (const [fam, tier] of FAMILY) if (id.toLowerCase().includes(fam)) return tier;
  return null;
}
export const tierRank = (t) => TIERS.indexOf(t);
export const effortRank = (e) => EFFORTS.indexOf(e);
export const capTier = (tier, ceiling) => (tierRank(tier) > tierRank(ceiling) ? ceiling : tier);
export const capEffort = (e, ceiling) => (effortRank(e) > effortRank(ceiling) ? ceiling : e);
export const agentKey = (type) => (typeof type === "string" && type.startsWith("devflow:") ? type.slice(8) : String(type));
export function isRoutable(o, type) {
  if (o.routable.includes(type)) return true;
  return typeof type === "string" && type.startsWith(o.routablePrefix) && own(o.agents, agentKey(type));
}
export function expectedSubagentTier(o, type, phase, ceiling) {
  if (!isRoutable(o, type)) return null;
  const key = agentKey(type);
  const byPhase = phase && own(o.phaseOverrides, phase) && own(o.phaseOverrides[phase], key) ? o.phaseOverrides[phase][key] : null;
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
export function expectedSkillEffort(o, skill, ceilingEffort) {
  if (typeof skill !== "string" || !own(o.sessionSkillEffort, skill)) return null;
  const v = o.sessionSkillEffort[skill];
  return v === "ceiling" ? ceilingEffort : capEffort(v, ceilingEffort);
}
export function expectedAgentEffort(o, type, ceilingEffort) {
  if (!isRoutable(o, type)) return null;
  const key = agentKey(type);
  return own(o.agentEffort, key) ? capEffort(o.agentEffort[key], ceilingEffort) : null;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/unit/tiers.test.mjs`
Expected: PASS (6 testes)

- [ ] **Step 6: Escrever `GABARITO.md`**

Conteúdo obrigatório (pt-BR):
1. As hipóteses H1 e H2 da spec §1.1, copiadas, com o veredito esperado para o braço B.
2. Tabela de verificações `INV-CEIL`, `INV-SESS`, `INV-PHASE-SYNC`, `INV-SUB`, `INV-EFF`, `INV-LEDGER`, `INV-OFF`, `INV-PREVC` copiada da spec §7, com a regra de cada uma (a que a Task 7 implementa).
3. Definição de **fase real** (intervalos `[started_at, completed_at)` dos instantâneos do `prevc.json`; fora de intervalo → não entra).
4. Matriz de cobertura com as 13 funcionalidades da spec §7 e o sinal observável de cada uma.
5. Nota de método: o oráculo vem da spec do roteamento; divergência com o `routes.json` é **achado**, não correção do oráculo. Ledger, `prevc.json` e transcripts são autorreportados.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(lab): oráculo independente de tier e esforço, e gabarito"
```

---

### Task 3: Plugin sob teste e camada L1 (determinística)

**Agent:** test-writer · **Tier:** standard · **Tests:** unit + integration

**Files:**
- Create: `lib/plugin.mjs`, `scripts/plugin.mjs`
- Test: `tests/unit/plugin.test.mjs`, `l1/helpers.mjs`, `l1/resolve.test.mjs`, `l1/escalate-report.test.mjs`, `l1/classic-hook.test.mjs`, `l1/router-core.test.mjs`

**Interfaces:**
- Consumes: `loadOracle`, `expectedSubagentTier`, `PHASES` (Task 2).
- Produces: `pluginDirFor(ref) → string`; `ensurePlugin({ ref, source }) → string`; `superpowersDir(home?) → string`; `pluginVersion(dir) → string|null`; `isPristine(dir) → boolean`. CLI `node scripts/plugin.mjs ensure [--ref v3.7.0] [--source ../devflow]`. `DEVFLOW_PLUGIN_DIR` sobrepõe o caminho do clone; `SUPERPOWERS_PLUGIN_DIR`, o do superpowers.

- [ ] **Step 1: Escrever o teste unitário**

`tests/unit/plugin.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { superpowersDir, pluginVersion, isPristine } from "../../lib/plugin.mjs";

const semEnv = (fn) => { const prev = process.env.SUPERPOWERS_PLUGIN_DIR; delete process.env.SUPERPOWERS_PLUGIN_DIR; try { return fn(); } finally { if (prev !== undefined) process.env.SUPERPOWERS_PLUGIN_DIR = prev; } };

test("superpowersDir escolhe a maior versão semver do cache", () => {
  const home = mkdtempSync(join(tmpdir(), "lab-home-"));
  const base = join(home, ".claude/plugins/cache/claude-plugins-official/superpowers");
  for (const v of ["5.0.6", "6.4.1", "6.10.0", "lixo"]) mkdirSync(join(base, v), { recursive: true });
  semEnv(() => assert.equal(superpowersDir(home), join(base, "6.10.0")));
});

test("superpowersDir sem cache lança com instrução", () => {
  semEnv(() => assert.throws(() => superpowersDir(mkdtempSync(join(tmpdir(), "lab-home-"))), /SUPERPOWERS_PLUGIN_DIR/));
});

test("pluginVersion lê .claude-plugin/plugin.json; ausente ou inválido → null", () => {
  const d = mkdtempSync(join(tmpdir(), "lab-pv-"));
  assert.equal(pluginVersion(d), null);
  mkdirSync(join(d, ".claude-plugin"));
  writeFileSync(join(d, ".claude-plugin/plugin.json"), JSON.stringify({ version: "3.7.0" }));
  assert.equal(pluginVersion(d), "3.7.0");
  writeFileSync(join(d, ".claude-plugin/plugin.json"), JSON.stringify({ version: "<b>x" }));
  assert.equal(pluginVersion(d), null);
});

test("isPristine: repo limpo → true; alterado ou inexistente → false", () => {
  const d = mkdtempSync(join(tmpdir(), "lab-git-"));
  execFileSync("git", ["-C", d, "init", "-q"]);
  assert.equal(isPristine(d), true);
  writeFileSync(join(d, "x"), "1");
  assert.equal(isPristine(d), false);
  assert.equal(isPristine(join(d, "nada")), false);
});
```

- [ ] **Step 2: Escrever os testes L1**

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
const resolve = (cwd, ...args) => JSON.parse(cli(["resolve", ...args], { cwd }).out);

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
  const r = resolve(fixture(), "--agent", "devflow:architect", "--phase", "E", "--task-tier", "cheap");
  assert.equal(r.route.tier, "cheap");
  assert.equal(r.route.source, "plan");
});

test("skill final-review → capable", () => {
  assert.equal(resolve(fixture(), "--agent", "general-purpose", "--phase", "E", "--skill", "final-review").route.tier, "capable");
});

test("opt-in duplo: sem env do usuário ou sem models.enabled → nenhuma rota roteada", () => {
  const off1 = JSON.parse(cli(["resolve", "--agent", "devflow:architect", "--phase", "P"], { cwd: fixture(), env: { DEVFLOW_MODEL_ROUTING: "" } }).out);
  const off2 = resolve(fixture({ models: "" }), "--agent", "devflow:architect", "--phase", "P");
  for (const r of [off1, off2]) assert.ok(r.route === null || r.route.source === "inherit", JSON.stringify(r));
});

test("maxTier limita", () => {
  assert.equal(resolve(fixture({ models: "models:\n  enabled: true\n  maxTier: standard\n" }), "--agent", "devflow:architect", "--phase", "P").route.tier, "standard");
});

test("--runtime omp: architect na fase P → capable com role pi/slow", () => {
  const r = resolve(fixture(), "--agent", "devflow:architect", "--phase", "P", "--runtime", "omp");
  assert.ok(r.route, "rota nula: teto do omp ilegível para o architect");
  assert.equal(r.route.tier, "capable");
  assert.equal(r.route.role, "pi/slow");
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
const esc = (cwd, ...a) => JSON.parse(cli(["escalate", "--agent", "general-purpose", "--tier", "standard", ...a], { cwd }).out);

test("escalate: --report imprime a rubrica", () => {
  const cwd = fixture();
  writeFileSync(join(cwd, "r.txt"), "teste falhou: expected 429 got 200");
  const r = cli(["escalate", "--agent", "general-purpose", "--tier", "standard", "--report", join(cwd, "r.txt")], { cwd });
  assert.match(r.out, /failure_is_capability/);
  assert.match(r.out, /needed_tier/);
});

test("escalate: falha de capacidade sobe para capable/opus", () => {
  const d = esc(fixture(), "--answers", answers());
  assert.deepEqual([d.action, d.tier, d.model], ["escalate", "capable", "opus"]);
});

test("escalate: falha de ambiente → human; resposta inválida → keep", () => {
  assert.equal(esc(fixture(), "--answers", answers({ failure_is_capability: 0.2 })).action, "human");
  assert.equal(esc(fixture(), "--answers", "{}").action, "keep");
});

test("report: ledger sintético (com usage) vira tabela por agente; chave adulterada é descartada", async () => {
  const cwd = fixture();
  const { ledgerDirFrom } = await import(join(PLUGIN, "scripts/lib/routing-ledger.mjs"));
  const dir = ledgerDirFrom({ xdgDataHome: join(cwd, "xdg"), home: "/nao-usado", cwd });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "s.jsonl"), [
    JSON.stringify({ ts: "2026-10-09T10:00:00Z", scope: "subagent", agentType: "devflow:architect", tier: "capable", model: "opus", source: "agent", usage: { input_tokens: 1, output_tokens: 1 } }),
    JSON.stringify({ ts: "2026-10-09T10:01:00Z", scope: "subagent", agentType: "devflow:architect", prompt: "vazado", usage: { input_tokens: 1, output_tokens: 1 } }),
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

`l1/router-core.test.mjs` (caracterização das hipóteses H1/H2 — descreve o comportamento da v3.7, não o julga):
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN } from "./helpers.mjs";

const core = await import(join(PLUGIN, "scripts/lib/router-core.mjs"));
const { readModels } = await import(join(PLUGIN, "scripts/lib/models-config.mjs"));
const { effectiveConfig } = await import(join(PLUGIN, "scripts/lib/model-routing.mjs"));
const table = JSON.parse(readFileSync(join(PLUGIN, "assets/model-routing/routes.json"), "utf8"));
const config = effectiveConfig(readModels("models:\n  enabled: true\n"), "1");
const user = { model: "claude-opus-5-5", effort: "xhigh" };

test("H1: a fase do roteador só muda no turn.start (o PREVC avançar no meio do turno não troca a sessão)", () => {
  const s = core.createRouterState();
  core.observeSession(s, user);
  core.learnId(s, "claude-sonnet-5-5");
  core.onTurnStart(s, { phase: "R" });
  assert.equal(core.onSessionStep(s, user, { table, config })?.model, undefined);
  // o PREVC entra em E dentro do mesmo turno: sem turn.start, o roteador segue em R
  assert.equal(core.onSessionStep(s, user, { table, config })?.model, undefined);
  core.onTurnStart(s, { phase: "E" });
  assert.equal(core.onSessionStep(s, user, { table, config }).model, "claude-sonnet-5-5");
});

test("H2: processo novo sem ID aprendido não troca o modelo da sessão (só o esforço)", () => {
  const s = core.createRouterState();
  core.observeSession(s, user);
  core.onTurnStart(s, { phase: "E" });
  assert.equal(core.onSessionStep(s, user, { table, config })?.model, undefined);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test tests/unit/plugin.test.mjs l1/`
Expected: FAIL com `Cannot find module '.../lib/plugin.mjs'`

- [ ] **Step 4: Implementar**

`lib/plugin.mjs`:
```js
// lib/plugin.mjs — plugin sob teste = clone imutável de uma tag (spec L2); superpowers do cache do operador.
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const LAB = resolve(new URL("..", import.meta.url).pathname);
const REF = /^[A-Za-z0-9._\/-]{1,64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

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

export function superpowersDir(home = homedir()) {
  if (process.env.SUPERPOWERS_PLUGIN_DIR) return resolve(process.env.SUPERPOWERS_PLUGIN_DIR);
  const base = join(home, ".claude/plugins/cache/claude-plugins-official/superpowers");
  let vs = [];
  try { vs = readdirSync(base).filter((v) => SEMVER.test(v)).sort(cmp); } catch {}
  if (!vs.length) throw new Error(`superpowers não encontrado em ${base}; defina SUPERPOWERS_PLUGIN_DIR`);
  return join(base, vs.at(-1));
}

// Diretórios confiáveis (clone da tag e cache do operador): leitura simples.
export function pluginVersion(dir) {
  try {
    const v = JSON.parse(readFileSync(join(dir, ".claude-plugin/plugin.json"), "utf8")).version;
    return typeof v === "string" && SEMVER.test(v) ? v : null;
  } catch { return null; }
}

export function isPristine(dir) {
  try { return execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) === ""; } catch { return false; }
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

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/unit/plugin.test.mjs && bash tests/run-integration.sh`
Expected: PASS. Confirmar `git -C .cache/devflow@v3.7.0 describe --tags` → `v3.7.0`. **Se algum caso L1 falhar, primeiro confira se o erro não é do próprio teste** (formato de entrada da CLI, nome do agente). Sendo divergência da v3.7: não corrija o oráculo nem a CLI — marque o teste com `{ todo: "achado L1-<n>: <diferença>" }`, registre em `results/l1-findings.md` (agente, fase, CLI, oráculo) e siga ("capturar, não resolver").

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "test(lab): plugin sob teste e camada L1 (CLI, hook clássico, router-core)"
```

---

### Task 4: Leitura do stream-json e preflight

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** unit

**Files:**
- Create: `lib/stream.mjs`
- Test: `tests/unit/stream.test.mjs`

**Interfaces:**
- Produces: `parseStream(text) → { sessionIds, init: null | { model, plugins: [{ name, path }], mcp: [{ name, status }] }, result: null | { subtype, isError, numTurns, terminalReason, modelUsage, subagents } }`; `mergeUsage(a, b)`; `preflightProblems(init, pluginDir) → string[]` (códigos).

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/stream.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStream, mergeUsage, preflightProblems } from "../../lib/stream.mjs";

const init = { type: "system", subtype: "init", session_id: "s1", model: "claude-opus-5-5",
  plugins: [{ name: "devflow", path: "/p" }, { name: "superpowers", path: "/s" }], mcp_servers: [{ name: "dotcontext", status: "connected" }] };
const result = {
  type: "result", subtype: "success", is_error: false, num_turns: 3, terminal_reason: "completed", session_id: "s1", result: "TEXTO QUE NÃO PODE VAZAR",
  modelUsage: { "claude-opus-5-5": { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 100, cacheCreationInputTokens: 50, costUSD: 0.5, contextWindow: 1 } },
  subagent_stats: { spawned: 2, completed: 2, failed: 0 },
};
// "__proto__" como chave própria só existe vindo de texto JSON (literal de objeto não a cria)
const resultLine = JSON.stringify(result).replace('"modelUsage":{', '"modelUsage":{"__proto__":{"inputTokens":1},');
const text = [JSON.stringify(init), "lixo{", resultLine].join("\n");

test("extrai sessão, init, uso por modelo e subagentes; descarta texto e chave estranha", () => {
  const s = parseStream(text);
  assert.deepEqual(s.sessionIds, ["s1"]);
  assert.deepEqual(s.init.plugins, [{ name: "devflow", path: "/p" }, { name: "superpowers", path: "/s" }]);
  assert.deepEqual(Object.keys(s.result.modelUsage), ["claude-opus-5-5"]);
  assert.deepEqual(s.result.modelUsage["claude-opus-5-5"], { input: 10, output: 5, cacheRead: 100, cacheCreate: 50, costUSD: 0.5 });
  assert.deepEqual(s.result.subagents, { spawned: 2, completed: 2, failed: 0 });
  assert.ok(!JSON.stringify(s).includes("VAZAR"));
});

test("sem evento result → result null; subtype de erro preservado como enum", () => {
  assert.equal(parseStream(JSON.stringify(init)).result, null);
  const e = parseStream(JSON.stringify({ ...result, subtype: "error_max_turns", is_error: true }));
  assert.deepEqual([e.result.subtype, e.result.isError], ["error_max_turns", true]);
});

test("mergeUsage soma por modelo", () => {
  const a = { "claude-a": { input: 1, output: 1, cacheRead: 1, cacheCreate: 1, costUSD: 1 } };
  const b = { "claude-a": { input: 2, output: 0, cacheRead: 0, cacheCreate: 0, costUSD: 0.5 }, "claude-b": { input: 1, output: 1, cacheRead: 0, cacheCreate: 0, costUSD: 0 } };
  assert.deepEqual(mergeUsage(a, b), { "claude-a": { input: 3, output: 1, cacheRead: 1, cacheCreate: 1, costUSD: 1.5 }, "claude-b": { input: 1, output: 1, cacheRead: 0, cacheCreate: 0, costUSD: 0 } });
});

test("preflightProblems: exige um devflow do pluginDir, superpowers e dotcontext conectado", () => {
  const ok = parseStream(JSON.stringify(init)).init;
  assert.deepEqual(preflightProblems(ok, "/p"), []);
  assert.deepEqual(preflightProblems(ok, "/outro"), ["devflow-fora-do-plugin-dir"]);
  assert.deepEqual(preflightProblems({ ...ok, plugins: [...ok.plugins, { name: "devflow", path: "/x" }] }, "/p"), ["devflow-duplicado"]);
  assert.deepEqual(preflightProblems({ ...ok, plugins: [] }, "/p"), ["devflow-ausente", "superpowers-ausente"]);
  assert.deepEqual(preflightProblems({ ...ok, mcp: [{ name: "dotcontext", status: "failed" }] }, "/p"), ["dotcontext-desconectado"]);
  assert.deepEqual(preflightProblems(null, "/p"), ["sem-init"]);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/unit/stream.test.mjs` → FAIL (`Cannot find module`)

- [ ] **Step 3: Implementar**

`lib/stream.mjs`:
```js
// lib/stream.mjs — lê o stream-json do `claude -p`. Só números, enums e IDs (spec §2.5). Puro.
const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const SID = /^[A-Za-z0-9-]{1,64}$/;
const ENUM = /^[a-z_]{1,40}$/;
const MODEL = /^claude-[A-Za-z0-9.\[\]_-]{1,60}$/;
const NAME = /^[A-Za-z0-9:_.@-]{1,64}$/;

function usageOf(mu) {
  const out = {};
  for (const [model, u] of Object.entries(mu ?? {})) {
    if (!MODEL.test(model)) continue;
    out[model] = { input: n(u?.inputTokens), output: n(u?.outputTokens), cacheRead: n(u?.cacheReadInputTokens), cacheCreate: n(u?.cacheCreationInputTokens), costUSD: n(u?.costUSD) };
  }
  return out;
}

export function parseStream(text) {
  const sessionIds = [];
  let init = null, result = null;
  for (const line of String(text).split("\n")) {
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (!j || typeof j !== "object") continue;
    if (typeof j.session_id === "string" && SID.test(j.session_id) && !sessionIds.includes(j.session_id)) sessionIds.push(j.session_id);
    if (j.type === "system" && j.subtype === "init") {
      init = {
        model: typeof j.model === "string" && MODEL.test(j.model) ? j.model : null,
        plugins: (Array.isArray(j.plugins) ? j.plugins : []).filter((p) => NAME.test(p?.name ?? "")).map((p) => ({ name: p.name, path: typeof p.path === "string" ? p.path : null })),
        mcp: (Array.isArray(j.mcp_servers) ? j.mcp_servers : []).filter((m) => typeof m?.name === "string").map((m) => ({ name: m.name, status: String(m.status) })),
      };
    }
    if (j.type !== "result") continue;
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
  return { sessionIds, init, result };
}

export function mergeUsage(a, b) {
  const out = structuredClone(a ?? {});
  for (const [m, u] of Object.entries(b ?? {})) {
    if (!MODEL.test(m)) continue;
    out[m] ??= { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, costUSD: 0 };
    for (const k of Object.keys(out[m])) out[m][k] += n(u[k]);
  }
  return out;
}

export function preflightProblems(init, pluginDir) {
  if (!init) return ["sem-init"];
  const p = [];
  const dev = init.plugins.filter((x) => x.name === "devflow");
  if (dev.length === 0) p.push("devflow-ausente");
  else if (dev.length > 1) p.push("devflow-duplicado");
  else if (dev[0].path !== pluginDir) p.push("devflow-fora-do-plugin-dir");
  if (!init.plugins.some((x) => x.name === "superpowers")) p.push("superpowers-ausente");
  if (!init.mcp.some((m) => m.name === "dotcontext" && m.status === "connected")) p.push("dotcontext-desconectado");
  return p;
}
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/unit/stream.test.mjs` → PASS (4)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): leitura do stream-json e verificação de preflight"`

---

### Task 5: Leitura segura e transcripts

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `lib/safe-read.mjs`, `lib/transcripts.mjs`
- Test: `tests/unit/safe-read.test.mjs`, `tests/unit/transcripts.test.mjs`

**Interfaces:**
- Produces: `readSafe(path, max = 64 * 2**20) → string|null`; `listSafe(dir, kind = "file"|"dir") → string[]` (sem seguir link, ordenado); `safeDir(root, ...parts) → string|null` (cada componente abaixo de `root` é diretório real); `projectSlug(cwd)`; `readSession(projectsRoot, slug, sessionId) → { main: Msg[], subagents: [{ agentId, agentType, requestedModel, messages: Msg[] }] }` com `Msg = { ts, model, effort, skill, usage: { input, output, cacheRead, cacheCreate } }`, mensagens ordenadas por `ts`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/safe-read.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSafe, listSafe, safeDir } from "../../lib/safe-read.mjs";

const d = mkdtempSync(join(tmpdir(), "lab-safe-"));

test("lê arquivo regular", () => {
  writeFileSync(join(d, "a"), "ok");
  assert.equal(readSafe(join(d, "a")), "ok");
});

test("recusa symlink, FIFO, diretório, inexistente e acima do limite", () => {
  symlinkSync("/etc/hostname", join(d, "l"));
  execFileSync("mkfifo", [join(d, "f")]);
  writeFileSync(join(d, "big"), "x".repeat(100));
  for (const p of [join(d, "l"), join(d, "f"), d, join(d, "nada")]) assert.equal(readSafe(p), null, p);
  assert.equal(readSafe(join(d, "big"), 10), null);
});

test("listSafe não segue link de diretório nem lista link de arquivo", () => {
  const r = mkdtempSync(join(tmpdir(), "lab-ls-"));
  mkdirSync(join(r, "real"));
  symlinkSync(join(r, "real"), join(r, "link"));
  writeFileSync(join(r, "a.jsonl"), "");
  symlinkSync("/etc/hostname", join(r, "b.jsonl"));
  assert.deepEqual(listSafe(r, "dir"), ["real"]);
  assert.deepEqual(listSafe(r, "file"), ["a.jsonl"]);
  assert.deepEqual(listSafe(join(r, "nada")), []);
});

test("safeDir recusa link em componente intermediário e componente com barra ou ..", () => {
  const r = mkdtempSync(join(tmpdir(), "lab-sd-"));
  mkdirSync(join(r, "a/b"), { recursive: true });
  symlinkSync(join(r, "a"), join(r, "x"));
  assert.equal(safeDir(r, "a", "b"), join(r, "a/b"));
  assert.equal(safeDir(r, "x", "b"), null);
  assert.equal(safeDir(r, ".."), null);
  assert.equal(safeDir(r, "a/b"), null);
  assert.equal(safeDir(r, "nada"), null);
});
```

`tests/unit/transcripts.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectSlug, readSession } from "../../lib/transcripts.mjs";

const msg = (id, hm, model, effort, skill, u = 10) => JSON.stringify({ type: "assistant", timestamp: `2026-10-09T${hm}:00.000Z`, effort, attributionSkill: skill,
  message: { id, model, content: [{ type: "text", text: "SEGREDO" }], usage: { input_tokens: u, output_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } } });

function root() {
  const r = mkdtempSync(join(tmpdir(), "lab-tr-"));
  const p = join(r, "-ws");
  mkdirSync(join(p, "s1/subagents"), { recursive: true });
  writeFileSync(join(p, "s1.jsonl"), [msg("m2", "10:05", "claude-opus-5-5", "high"), msg("m1", "10:01", "claude-opus-5-5", "xhigh", "superpowers:brainstorming"),
    msg("m1", "10:01", "claude-opus-5-5", "xhigh"), "quebrado{", msg("m3", "10:21", "claude-sonnet-5-5", "medium", "tem espaço livre"),
    JSON.stringify({ type: "assistant", message: { id: "m4", model: "claude-opus-5-5", usage: {} } })].join("\n"));
  writeFileSync(join(p, "s1/subagents/agent-abc.meta.json"), JSON.stringify({ agentType: "devflow:architect", model: "opus", description: "SEGREDO" }));
  writeFileSync(join(p, "s1/subagents/agent-abc.jsonl"), [msg("x1", "10:12", "claude-opus-5-5", "high", null, 5), msg("x2", "10:13", "claude-opus-5-5", "medium", null, 5)].join("\n"));
  return { r, p };
}

test("projectSlug segue a convenção do Claude Code", () => {
  assert.equal(projectSlug("/home/u/code/devflow"), "-home-u-code-devflow");
  assert.equal(projectSlug("/tmp/a.b_c"), "-tmp-a-b-c");
});

test("sessão: ordenada por ts, dedup por message.id, skill só se ID válido, sem linha sem timestamp", () => {
  const s = readSession(root().r, "-ws", "s1");
  assert.deepEqual(s.main.map((x) => [x.model, x.effort, x.skill]), [
    ["claude-opus-5-5", "xhigh", "superpowers:brainstorming"], ["claude-opus-5-5", "high", null], ["claude-sonnet-5-5", "medium", null]]);
  assert.equal(s.main[0].ts, Date.parse("2026-10-09T10:01:00.000Z"));
  assert.deepEqual(s.main[0].usage, { input: 10, output: 1, cacheRead: 2, cacheCreate: 3 });
});

test("subagente: tipo e modelo pedidos do meta, mensagens numéricas, sem texto", () => {
  const s = readSession(root().r, "-ws", "s1");
  assert.equal(s.subagents.length, 1);
  const a = s.subagents[0];
  assert.deepEqual([a.agentId, a.agentType, a.requestedModel, a.messages.map((x) => x.effort)], ["abc", "devflow:architect", "opus", ["high", "medium"]]);
  assert.ok(!JSON.stringify(s).includes("SEGREDO"));
});

test("link no diretório de subagentes é ignorado; sessão ou slug inválidos → vazio", () => {
  const { r, p } = root();
  mkdirSync(join(p, "s2"));
  symlinkSync(join(p, "s1/subagents"), join(p, "s2/subagents"));
  writeFileSync(join(p, "s2.jsonl"), "");
  assert.deepEqual(readSession(r, "-ws", "s2").subagents, []);
  assert.deepEqual(readSession(r, "-ws", "../x"), { main: [], subagents: [] });
  assert.deepEqual(readSession(r, "../x", "s1"), { main: [], subagents: [] });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/unit/safe-read.test.mjs tests/unit/transcripts.test.mjs` → FAIL

- [ ] **Step 3: Implementar**

`lib/safe-read.mjs`:
```js
// lib/safe-read.mjs — só arquivo regular, sem seguir link (nem em diretório intermediário), tamanho limitado (spec §10).
import { openSync, fstatSync, readSync, closeSync, readdirSync, lstatSync, statSync, constants as C } from "node:fs";
import { join } from "node:path";

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

export function listSafe(dir, kind = "file") {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => (kind === "dir" ? e.isDirectory() : e.isFile()))
      .map((e) => e.name).sort();
  } catch { return []; }
}

// root é confiável (pode ser link); cada componente abaixo dele precisa ser diretório real.
export function safeDir(root, ...parts) {
  try { if (!statSync(root).isDirectory()) return null; } catch { return null; }
  let p = root;
  for (const part of parts) {
    if (typeof part !== "string" || !part || part === "." || part === ".." || part.includes("/")) return null;
    p = join(p, part);
    try { if (!lstatSync(p).isDirectory()) return null; } catch { return null; }
  }
  return p;
}
```

`lib/transcripts.mjs`:
```js
// lib/transcripts.mjs — só ts, modelo, esforço, skill (ID validado) e números de usage (spec L8).
import { join } from "node:path";
import { readSafe, listSafe, safeDir } from "./safe-read.mjs";

const MODEL = /^claude-[A-Za-z0-9.\[\]_-]{1,60}$/;
const EFFORT = ["low", "medium", "high", "xhigh", "max"];
const ID = /^[A-Za-z0-9:_.-]{1,64}$/;
const SID = /^[A-Za-z0-9-]{1,64}$/;
const SLUG = /^-[A-Za-z0-9-]{1,254}$/;
const META = /^agent-([A-Za-z0-9]{1,64})\.meta\.json$/;
const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export const projectSlug = (cwd) => String(cwd).replace(/[^A-Za-z0-9]/g, "-");

function scan(text) {
  const out = [], seen = new Set();
  for (const line of (text ?? "").split("\n")) {
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    const m = j?.message;
    const ts = typeof j?.timestamp === "string" ? Date.parse(j.timestamp) : NaN;
    if (!m?.usage || !MODEL.test(m.model ?? "") || !Number.isFinite(ts)) continue;
    if (typeof m.id === "string") { if (seen.has(m.id)) continue; seen.add(m.id); }
    out.push({
      ts, model: m.model,
      effort: EFFORT.includes(j.effort) ? j.effort : null,
      skill: typeof j.attributionSkill === "string" && ID.test(j.attributionSkill) ? j.attributionSkill : null,
      usage: { input: n(m.usage.input_tokens), output: n(m.usage.output_tokens), cacheRead: n(m.usage.cache_read_input_tokens), cacheCreate: n(m.usage.cache_creation_input_tokens) },
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function readSession(projectsRoot, slug, sessionId) {
  const empty = { main: [], subagents: [] };
  if (!SLUG.test(slug) || !SID.test(sessionId)) return empty;
  const proj = safeDir(projectsRoot, slug);
  if (!proj) return empty;
  const main = scan(readSafe(join(proj, `${sessionId}.jsonl`)));
  const sub = safeDir(projectsRoot, slug, sessionId, "subagents");
  const subagents = [];
  for (const f of sub ? listSafe(sub, "file") : []) {
    const id = f.match(META)?.[1];
    if (!id) continue;
    let meta;
    try { meta = JSON.parse(readSafe(join(sub, f), 2 ** 20) ?? ""); } catch { continue; }
    subagents.push({
      agentId: id,
      agentType: ID.test(meta?.agentType ?? "") ? meta.agentType : "?",
      requestedModel: ID.test(meta?.model ?? "") ? meta.model : null,
      messages: scan(readSafe(join(sub, `agent-${id}.jsonl`))),
    });
  }
  return { main, subagents };
}
```

- [ ] **Step 4: Rodar e ver passar** — os dois arquivos → PASS (8)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): leitura segura e mensagens com timestamp dos transcripts"`

---

### Task 6: Ledger normalizado e fases do `prevc.json`

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `lib/ledger.mjs`, `lib/prevc.mjs`
- Test: `tests/unit/ledger.test.mjs`, `tests/unit/prevc.test.mjs`

**Interfaces:**
- Consumes: `readSafe`, `listSafe`, `safeDir` (Task 5).
- Produces: `normalize(e) → { entry, violations }`; `readLedger(xdgDir) → { entries, violations, files }` (violações são códigos `[a-z-]+(:[a-zA-Z]+)?`); `readPrevcText(text) → { current, phases: { [P..C]: { status, start, end } } } | null` (`start`/`end` em ms ou `null`); `mergePrevc(snaps) → mesmo formato | null`; `phaseAt(phases, ts) → fase|null`; `isFinished(prevc, branch) → boolean`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/ledger.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLedger, normalize } from "../../lib/ledger.mjs";

test("normalize: entrada válida passa inteira", () => {
  const e = { ts: "2026-10-09T10:00:00.000Z", sessionId: "k1", scope: "subagent", agentId: "a1", agentType: "devflow:architect", model: "claude-opus-5-5",
    phase: "R", tier: "capable", ceiling: "capable", effort: "high", source: "agent", adapter: "mod", switched: false,
    usage: { input_tokens: 1, output_tokens: 2 }, cacheReadRatio: 0.5, escalation: { at: "retry", from: "standard", to: "capable", action: "escalate", scores: { is_stuck: 0.7 } } };
  assert.deepEqual(normalize(e), { entry: e, violations: [] });
});

test("normalize: chave arbitrária some sem vazar o nome; valor fora do enum vira '?'", () => {
  const r = normalize({ "[clique](https://evil) <img>": 1, scope: "batata", agentType: "tem espaço", usage: { input_tokens: "x" }, ts: "ontem" });
  assert.deepEqual(r.entry, { scope: "?", agentType: "?", ts: "?" });
  assert.deepEqual(r.violations.sort(), ["chave-fora-da-allowlist", "valor-invalido:agentType", "valor-invalido:scope", "valor-invalido:ts", "valor-invalido:usage"]);
  assert.ok(!JSON.stringify(r).includes("evil"));
});

test("readLedger: vários arquivos; linha ilegível e não-objeto viram código; diretório-link é ignorado", () => {
  const xdg = mkdtempSync(join(tmpdir(), "lab-led-"));
  const d = join(xdg, "devflow-model-routing", "abc");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "k1.jsonl"), JSON.stringify({ scope: "session", phase: "P" }) + "\nquebrada{\nnull\n42\n");
  writeFileSync(join(d, "cli.jsonl"), JSON.stringify({ scope: "subagent", escalation: { at: "retry", action: "escalate" } }) + "\n");
  const fora = mkdtempSync(join(tmpdir(), "lab-fora-"));
  writeFileSync(join(fora, "x.jsonl"), JSON.stringify({ scope: "session" }) + "\n");
  symlinkSync(fora, join(xdg, "devflow-model-routing", "link"));
  const r = readLedger(xdg);
  assert.equal(r.entries.length, 2);
  assert.equal(r.files, 2);
  assert.deepEqual(r.violations.sort(), ["linha-ilegivel", "linha-nao-objeto", "linha-nao-objeto"]);
});

test("readLedger: XDG sem ledger → vazio", () => {
  assert.deepEqual(readLedger(mkdtempSync(join(tmpdir(), "lab-led-"))), { entries: [], violations: [], files: 0 });
});
```

`tests/unit/prevc.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readPrevcText, mergePrevc, phaseAt, isFinished } from "../../lib/prevc.mjs";

const T = (hm) => `2026-10-09T${hm}:00.000Z`;
const ms = (hm) => Date.parse(T(hm));
const doc = (phases, current) => JSON.stringify({ status: { project: { current_phase: current }, phases } });
const s1 = readPrevcText(doc({ P: { status: "completed", started_at: T("10:00"), completed_at: T("10:10") }, R: { status: "in_progress", started_at: T("10:10") }, X: { status: "lixo" } }, "R"));
const s2 = readPrevcText(doc({ P: { status: "completed", started_at: T("10:00"), completed_at: T("10:10") }, R: { status: "completed", started_at: T("10:10"), completed_at: T("10:20") },
  E: { status: "completed", started_at: T("10:20"), completed_at: T("10:40") }, V: { status: "completed", started_at: T("10:40"), completed_at: T("10:50") }, C: { status: "in_progress", started_at: T("10:50") } }, "C"));

test("readPrevcText: fases com status e timestamps; fase desconhecida ignorada; inválido → null", () => {
  assert.deepEqual(s1, { current: "R", phases: { P: { status: "completed", start: ms("10:00"), end: ms("10:10") }, R: { status: "in_progress", start: ms("10:10"), end: null } } });
  assert.equal(readPrevcText("lixo"), null);
  assert.equal(readPrevcText(null), null);
});

test("mergePrevc: status do último instantâneo, início mais cedo, fim mais tarde", () => {
  const m = mergePrevc([s1, s2]);
  assert.equal(m.current, "C");
  assert.deepEqual(m.phases.R, { status: "completed", start: ms("10:10"), end: ms("10:20") });
  assert.equal(mergePrevc([]), null);
});

test("phaseAt: intervalo [início, fim); fase aberta vai até o infinito; fora de tudo → null", () => {
  const m = mergePrevc([s1, s2]);
  assert.equal(phaseAt(m.phases, ms("10:05")), "P");
  assert.equal(phaseAt(m.phases, ms("10:10")), "R");
  assert.equal(phaseAt(m.phases, ms("11:30")), "C");
  assert.equal(phaseAt(m.phases, ms("09:00")), null);
});

test("isFinished: C concluída; ou fase atual C com P–V concluídas na main; ou tudo concluído/pulado", () => {
  const m = mergePrevc([s2]);
  assert.equal(isFinished(m, "main"), true);
  assert.equal(isFinished(m, "feature/x"), false);
  assert.equal(isFinished({ current: "V", phases: { P: { status: "completed" }, R: { status: "skipped" }, E: { status: "completed" }, V: { status: "completed" } } }, "x"), true);
  assert.equal(isFinished(mergePrevc([s1]), "main"), false);
  assert.equal(isFinished(null, "main"), false);
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL

- [ ] **Step 3: Implementar**

`lib/ledger.mjs`:
```js
// lib/ledger.mjs — allowlist copiada da ADR-017/spec §8 (independente da lib sob teste). Normaliza; nunca repassa texto livre.
import { join } from "node:path";
import { readSafe, listSafe, safeDir } from "./safe-read.mjs";

const KEYS = ["ts", "sessionId", "scope", "agentId", "agentType", "phase", "skill", "tier", "model", "effort", "source", "ceiling", "adapter", "usage", "cacheReadRatio", "switched", "escalation"];
const SAFE = /^[A-Za-z0-9:_./@[\]-]{1,64}$/;
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const TIERS = ["cheap", "standard", "capable", "top"];
const ENUM = {
  scope: ["session", "subagent"], phase: ["P", "R", "E", "V", "C"], tier: TIERS, ceiling: TIERS,
  effort: ["low", "medium", "high", "xhigh", "max"], source: ["plan", "skill", "project", "phase", "agent", "explicit", "inherit"],
  adapter: ["mod", "classic", "omp", "cli"],
};
const SAFE_KEYS = ["sessionId", "agentId", "agentType", "skill", "model"];
const USAGE = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
const ESC = { at: ["retry", "midRun"], from: TIERS, to: TIERS, action: ["keep", "human", "escalate"] };
const SCORES = ["failure_is_capability", "claims_done_with_evidence", "is_stuck"];
const num = (v) => typeof v === "number" && Number.isFinite(v);
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function normalize(e) {
  const entry = {}, violations = [];
  const bad = (k) => { entry[k] = "?"; violations.push(`valor-invalido:${k}`); };
  for (const k of Object.keys(e)) {
    if (!KEYS.includes(k)) { violations.push("chave-fora-da-allowlist"); continue; }
    const v = e[k];
    if (k === "ts") { if (typeof v === "string" && TS.test(v)) entry.ts = v; else bad(k); }
    else if (SAFE_KEYS.includes(k)) { if (typeof v === "string" && SAFE.test(v)) entry[k] = v; else bad(k); }
    else if (k in ENUM) { if (ENUM[k].includes(v)) entry[k] = v; else bad(k); }
    else if (k === "switched") { if (typeof v === "boolean") entry.switched = v; else bad(k); }
    else if (k === "cacheReadRatio") { if (num(v) && v >= 0 && v <= 1) entry.cacheReadRatio = v; else bad(k); }
    else if (k === "usage") {
      if (!plain(v) || Object.entries(v).some(([uk, uv]) => !USAGE.includes(uk) || !num(uv))) { violations.push("valor-invalido:usage"); continue; }
      entry.usage = { ...v };
    } else if (k === "escalation") {
      if (!plain(v)) { violations.push("valor-invalido:escalation"); continue; }
      const out = {};
      let ok = true;
      for (const [ek, ev] of Object.entries(v)) {
        if (Object.hasOwn(ESC, ek) && ESC[ek].includes(ev)) out[ek] = ev;
        else if (ek === "scores" && plain(ev) && Object.entries(ev).every(([sk, sv]) => SCORES.includes(sk) && num(sv))) out.scores = { ...ev };
        else ok = false;
      }
      if (!ok) violations.push("valor-invalido:escalation");
      entry.escalation = out;
    }
  }
  return { entry, violations };
}

export function readLedger(xdgDir) {
  const root = safeDir(xdgDir, "devflow-model-routing");
  const entries = [], violations = [];
  let files = 0;
  for (const proj of root ? listSafe(root, "dir") : []) {
    const dir = safeDir(xdgDir, "devflow-model-routing", proj);
    if (!dir) continue;
    for (const f of listSafe(dir, "file").filter((x) => x.endsWith(".jsonl"))) {
      files++;
      for (const line of (readSafe(join(dir, f)) ?? "").split("\n")) {
        if (!line.trim()) continue;
        let e;
        try { e = JSON.parse(line); } catch { violations.push("linha-ilegivel"); continue; }
        if (!plain(e)) { violations.push("linha-nao-objeto"); continue; }
        const r = normalize(e);
        violations.push(...r.violations);
        entries.push(r.entry);
      }
    }
  }
  return { entries, violations, files };
}
```

`lib/prevc.mjs`:
```js
// lib/prevc.mjs — fases do PREVC com timestamps (spec §7: fase real). Puro.
const PH = ["P", "R", "E", "V", "C"];
const ST = ["pending", "in_progress", "completed", "skipped"];
const time = (v) => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
const min = (a, b) => (a == null ? b : b == null ? a : Math.min(a, b));
const max = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));

export function readPrevcText(text) {
  let j;
  try { j = JSON.parse(text ?? ""); } catch { return null; }
  if (!j || typeof j !== "object") return null;
  const phases = {};
  for (const k of PH) {
    const p = j?.status?.phases?.[k];
    if (p && ST.includes(p.status)) phases[k] = { status: p.status, start: time(p.started_at), end: time(p.completed_at) };
  }
  const cur = j?.status?.project?.current_phase;
  return { current: PH.includes(cur) ? cur : null, phases };
}

export function mergePrevc(snaps) {
  const list = (snaps ?? []).filter(Boolean);
  if (!list.length) return null;
  const phases = {};
  for (const s of list) for (const [k, p] of Object.entries(s.phases)) {
    const cur = phases[k];
    phases[k] = { status: p.status, start: min(cur?.start ?? null, p.start), end: max(cur?.end ?? null, p.end) };
  }
  return { current: list.at(-1).current, phases };
}

export function phaseAt(phases, ts) {
  let best = null;
  for (const k of PH) {
    const p = phases?.[k];
    if (!p || p.start == null || ts < p.start) continue;
    if (p.end != null && ts >= p.end) continue;
    if (!best || p.start >= phases[best].start) best = k;
  }
  return best;
}

export function isFinished(prevc, branch) {
  if (!prevc) return false;
  const ps = Object.values(prevc.phases);
  const done = (k) => !prevc.phases[k] || ["completed", "skipped"].includes(prevc.phases[k].status);
  if (prevc.phases.C?.status === "completed") return true;
  if (ps.length && ps.every((p) => ["completed", "skipped"].includes(p.status))) return true;
  return prevc.current === "C" && ["P", "R", "E", "V"].every(done) && branch === "main";
}
```

- [ ] **Step 4: Rodar e ver passar** → PASS (8)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): ledger normalizado e fases reais do prevc.json"`

---

### Task 7: Invariantes e matriz de cobertura

**Agent:** backend-specialist · **Tier:** capable · **Tests:** unit

**Files:**
- Create: `lib/invariants.mjs`
- Test: `tests/unit/invariants.test.mjs`

**Interfaces:**
- Consumes: Task 2. Consome `Metrics` (produzido pela Task 11):
  ```
  Msg = { ts, phase: "P".."C"|null, model, effort|null, skill|null, usage: { input, output, cacheRead, cacheCreate } }
  Metrics = { armId, routing, ceiling: { model, effort }, invocations, complete, incompleteReason|null, killed,
    prevc: { current, phases } | null,
    session: Msg[],
    subagents: Array<{ agentId, agentType, requestedModel, phase|null, messages: Msg[] }>,
    ledger: { entries, violations, files },
    tokens: { byModel, streamByModel, streamDeltaPct|null },
    planTiers: string[], reportOk: boolean, acceptance: { passed, total, error? } | null,
    env: { claudeVersion, pluginVersion, superpowersVersion } }
  ```
  `phase` de cada `Msg` e de cada subagente é a **fase real** (calculada pela coleta).
- Produces: `evaluate(oracle, metrics) → Array<{ id, verdict, evidence }>` (ordem: INV-CEIL, INV-SESS, INV-PHASE-SYNC, INV-SUB, INV-EFF, INV-LEDGER, INV-OFF, INV-PREVC); `coverage(oracle, metrics) → Array<{ feature, exercised, evidence }>`. Evidências só com enums, IDs validados e números.

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/invariants.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, coverage } from "../../lib/invariants.mjs";
import { loadOracle } from "../../lib/tiers.mjs";

const o = loadOracle();
const msg = (phase, model, effort, skill = null) => ({ ts: 0, phase, model, effort, skill, usage: { input: 1, output: 1, cacheRead: 0, cacheCreate: 0 } });
const done = { current: "C", phases: Object.fromEntries(["P", "R", "E", "V", "C"].map((k) => [k, { status: "completed", start: 0, end: 1 }])) };
const base = (over = {}) => ({
  armId: "B-routed", routing: true, ceiling: { model: "opus", effort: "xhigh" }, invocations: 2, complete: true, incompleteReason: null, killed: false, prevc: done,
  session: [msg("P", "claude-opus-5-5", "xhigh", "superpowers:brainstorming"), msg("R", "claude-opus-5-5", "xhigh"),
    msg("E", "claude-sonnet-5-5", "medium", "devflow:prevc-execution"), msg("C", "claude-sonnet-5-5", "low", "devflow:prevc-confirmation")],
  subagents: [
    { agentId: "a1", agentType: "devflow:code-reviewer", requestedModel: "opus", phase: "R", messages: [msg("R", "claude-opus-5-5", "medium"), msg("R", "claude-opus-5-5", "high")] },
    { agentId: "a2", agentType: "devflow:documentation-writer", requestedModel: "haiku", phase: "C", messages: [msg("C", "claude-haiku-5-5", "low")] },
    { agentId: "a3", agentType: "Explore", requestedModel: null, phase: "E", messages: [msg("E", "claude-opus-5-5", "xhigh")] },
    { agentId: "a4", agentType: "general-purpose", requestedModel: "sonnet", phase: "E", messages: [] },
  ],
  ledger: { files: 2, violations: [], entries: [
    { scope: "subagent", agentId: "a1", agentType: "devflow:code-reviewer", phase: "R", tier: "capable", source: "phase", model: "claude-opus-5-5" },
    { scope: "subagent", agentId: "a1", agentType: "devflow:code-reviewer", phase: "R", usage: { input_tokens: 1 } },
    { scope: "subagent", agentId: "a2", agentType: "devflow:documentation-writer", phase: "C", tier: "cheap", source: "agent", model: "claude-haiku-5-5" },
    { scope: "session", phase: "E", switched: true },
  ] },
  tokens: { byModel: {}, streamByModel: {}, streamDeltaPct: 0 }, planTiers: [], reportOk: true, acceptance: { passed: 13, total: 13 },
  env: { claudeVersion: "2.1.295", pluginVersion: "3.7.0", superpowersVersion: "6.4.1" }, ...over,
});
const v = (m, id) => evaluate(o, m).find((x) => x.id === id);
const clone = (m) => structuredClone(m);

test("rodada conforme → tudo HELD; Explore e subagente sem mensagem ficam fora", () => {
  for (const id of ["INV-CEIL", "INV-SESS", "INV-PHASE-SYNC", "INV-SUB", "INV-EFF", "INV-LEDGER", "INV-PREVC"]) assert.equal(v(base(), id).verdict, "HELD", id);
  assert.equal(v(base(), "INV-OFF").verdict, "N/A");
});

test("H1 sintético: roteador em P com o subagente na fase real R → PHASE-SYNC e SUB = MISS", () => {
  const m = clone(base());
  m.ledger.entries[0] = { ...m.ledger.entries[0], phase: "P", tier: "standard", source: "agent" };
  m.subagents[0].messages = [msg("R", "claude-sonnet-5-5", "medium")];
  assert.equal(v(m, "INV-PHASE-SYNC").verdict, "MISS");
  assert.match(v(m, "INV-PHASE-SYNC").evidence, /P→R×1/);
  assert.equal(v(m, "INV-SUB").verdict, "MISS");
  assert.match(v(m, "INV-SUB").evidence, /devflow:code-reviewer@R: standard \(oráculo capable, fonte agent\)/);
});

test("H1 na sessão: mensagem da fase real E no teto → INV-SESS MISS com contagem por fase", () => {
  const m = clone(base());
  m.session[2] = msg("E", "claude-opus-5-5", "medium", "devflow:prevc-execution");
  assert.equal(v(m, "INV-SESS").verdict, "MISS");
  assert.match(v(m, "INV-SESS").evidence, /1 de 4 .*E:capable×1/);
});

test("mensagem sem fase real não entra no INV-SESS", () => {
  const m = clone(base());
  m.session.push(msg(null, "claude-opus-5-5", "xhigh"));
  assert.equal(v(m, "INV-SESS").verdict, "HELD");
});

test("INV-CEIL: braço C com subagente e esforço acima do teto → MISS", () => {
  const m = base({ ceiling: { model: "sonnet", effort: "medium" } });
  assert.equal(v(m, "INV-CEIL").verdict, "MISS");
  assert.match(v(m, "INV-CEIL").evidence, /devflow:code-reviewer claude-opus-5-5/);
  assert.match(v(m, "INV-CEIL").evidence, /esforço xhigh/);
});

test("INV-SUB: fonte explicit/plan/skill justifica desvio dentro do teto; fonte agent não", () => {
  const m = clone(base());
  m.subagents[1].messages = [msg("C", "claude-sonnet-5-5", "low")];
  assert.equal(v(m, "INV-SUB").verdict, "MISS");
  m.ledger.entries[2].source = "explicit";
  assert.equal(v(m, "INV-SUB").verdict, "HELD");
});

test("INV-EFF: esforço de skill ou do primeiro passo do agente diferente do oráculo → MISS", () => {
  const m = clone(base());
  m.session[2] = msg("E", "claude-sonnet-5-5", "high", "devflow:prevc-execution");
  assert.equal(v(m, "INV-EFF").verdict, "MISS");
  const n = clone(base());
  n.subagents[1].messages = [msg("C", "claude-haiku-5-5", "medium")];
  assert.equal(v(n, "INV-EFF").verdict, "MISS");
});

test("INV-LEDGER: violação → MISS; roteado sem ledger → MISS; braço A → N/A", () => {
  assert.equal(v(base({ ledger: { entries: [{}], violations: ["chave-fora-da-allowlist"], files: 1 } }), "INV-LEDGER").verdict, "MISS");
  assert.equal(v(base({ ledger: { entries: [], violations: [], files: 0 } }), "INV-LEDGER").verdict, "MISS");
  assert.equal(v(base({ routing: false }), "INV-LEDGER").verdict, "N/A");
});

test("INV-OFF (braço A): ledger vazio → HELD; com ledger → MISS", () => {
  const a = base({ armId: "A-baseline", routing: false, ledger: { entries: [], violations: [], files: 0 } });
  assert.equal(v(a, "INV-OFF").verdict, "HELD");
  assert.equal(v({ ...a, ledger: { entries: [{ scope: "session" }], violations: [], files: 1 } }, "INV-OFF").verdict, "MISS");
});

test("INV-PREVC: rodada incompleta → MISS com o motivo; sem prevc → MISS", () => {
  const m = base({ complete: false, incompleteReason: "result:error_max_turns" });
  assert.equal(v(m, "INV-PREVC").verdict, "MISS");
  assert.match(v(m, "INV-PREVC").evidence, /parada: result:error_max_turns/);
  assert.equal(v(base({ prevc: null }), "INV-PREVC").verdict, "MISS");
});

test("coverage", () => {
  const c = (m) => Object.fromEntries(coverage(o, m).map((x) => [x.feature, x.exercised]));
  const b = c(base());
  assert.deepEqual([b["sessão por fase"], b["esforço por skill"], b["subagente por agente"], b["override de fase"], b["esforço por passo"], b["ledger"], b["model-route report"]],
    [true, true, true, true, true, true, true]);
  assert.deepEqual([b["tier da task do plano"], b["escalada no meio"], b["escalada entre tentativas"], b["teto do usuário"], b["opt-in duplo (braço A)"]], [false, false, false, false, false]);
  const m = clone(base({ planTiers: ["cheap"] }));
  m.subagents[3].messages = [msg("E", "claude-haiku-5-5", "low")];
  m.ledger.entries.push({ scope: "subagent", agentId: "a4", agentType: "general-purpose", phase: "E", tier: "cheap", source: "explicit" });
  assert.equal(c(m)["tier da task do plano"], true);
  const cc = clone(base({ ceiling: { model: "sonnet", effort: "medium" } }));
  cc.subagents.push({ agentId: "a5", agentType: "devflow:architect", requestedModel: "sonnet", phase: "P", messages: [msg("P", "claude-sonnet-5-5", "medium")] });
  assert.equal(c(cc)["teto do usuário"], true);
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL

- [ ] **Step 3: Implementar**

`lib/invariants.mjs`:
```js
// lib/invariants.mjs — vereditos (spec §7) contra o oráculo e a fase REAL; matriz de cobertura. Puro.
import { modelTier, tierRank, effortRank, isRoutable, expectedSubagentTier, expectedSessionTiers, expectedSkillEffort, expectedAgentEffort, PHASES } from "./tiers.mjs";

const JUSTIFIED = ["plan", "skill", "explicit"];
const r = (id, verdict, evidence) => ({ id, verdict, evidence });
const first = (s) => s.messages[0] ?? null;
const ctOf = (m) => modelTier(m.ceiling.model);
const spawnOf = (m, id) => m.ledger.entries.find((e) => e.scope === "subagent" && e.agentId === id && e.source) ?? null;
const tally = (keys) => { const c = new Map(); for (const k of keys) c.set(k, (c.get(k) ?? 0) + 1); return [...c].map(([k, n]) => `${k}×${n}`).join(", "); };
const list = (bad, max = 10) => [...new Set(bad)].slice(0, max).join("; ");

function ceil(o, m) {
  if (!m.session.length && !m.subagents.some(first)) return r("INV-CEIL", "N/A", "sem transcript");
  const ct = ctOf(m), ce = effortRank(m.ceiling.effort), bad = [];
  const check = (who, x) => {
    if (tierRank(modelTier(x.model)) > tierRank(ct)) bad.push(`${who} ${x.model}`);
    if (x.effort && effortRank(x.effort) > ce) bad.push(`${who} esforço ${x.effort}`);
  };
  m.session.forEach((x) => check("sessão", x));
  for (const s of m.subagents) s.messages.forEach((x) => check(s.agentType, x));
  return r("INV-CEIL", bad.length ? "MISS" : "HELD", bad.length ? list(bad) : `teto ${m.ceiling.model}/${m.ceiling.effort}`);
}

function sess(o, m) {
  if (!m.routing) return r("INV-SESS", "N/A", "roteamento desligado");
  const known = m.session.filter((x) => x.phase);
  if (!known.length) return r("INV-SESS", "N/A", "sem mensagem da sessão com fase real");
  const want = expectedSessionTiers(o, ctOf(m));
  const bad = known.filter((x) => modelTier(x.model) !== want[x.phase]);
  let changes = 0;
  for (let i = 1; i < m.session.length; i++) if (m.session[i].model !== m.session[i - 1].model) changes++;
  const ev = `${bad.length} de ${known.length} mensagens fora do tier da fase real${bad.length ? ` (${tally(bad.map((x) => `${x.phase}:${modelTier(x.model)}`))})` : ""}; trocas de modelo ${changes}; invocações ${m.invocations}`;
  return r("INV-SESS", bad.length ? "MISS" : "HELD", ev);
}

function phaseSync(o, m) {
  if (!m.routing) return r("INV-PHASE-SYNC", "N/A", "roteamento desligado");
  const pairs = [];
  for (const s of m.subagents) {
    const sp = spawnOf(m, s.agentId);
    if (sp?.phase && s.phase) pairs.push([sp.phase, s.phase]);
  }
  if (!pairs.length) return r("INV-PHASE-SYNC", "N/A", "nenhum despacho com fase no ledger e fase real");
  const bad = pairs.filter(([a, b]) => a !== b);
  return r("INV-PHASE-SYNC", bad.length ? "MISS" : "HELD",
    `${bad.length} de ${pairs.length} despachos com fase do roteador ≠ fase real${bad.length ? ` (${tally(bad.map(([a, b]) => `${a}→${b}`))})` : ""}`);
}

function sub(o, m) {
  if (!m.routing) return r("INV-SUB", "N/A", "roteamento desligado");
  const ct = ctOf(m);
  const routable = m.subagents.filter((s) => isRoutable(o, s.agentType) && first(s));
  if (!routable.length) return r("INV-SUB", "N/A", "nenhum subagente roteável com mensagens");
  const bad = [];
  for (const s of routable) {
    const want = expectedSubagentTier(o, s.agentType, s.phase, ct);
    const got = modelTier(first(s).model);
    if (got === want) continue;
    const src = spawnOf(m, s.agentId)?.source ?? "sem-ledger";
    if (JUSTIFIED.includes(src) && tierRank(got) <= tierRank(ct)) continue;
    bad.push(`${s.agentType}@${s.phase ?? "?"}: ${got} (oráculo ${want}, fonte ${src})`);
  }
  return r("INV-SUB", bad.length ? "MISS" : "HELD", bad.length ? list(bad) : `${routable.length} subagentes conforme`);
}

function eff(o, m) {
  if (!m.routing) return r("INV-EFF", "N/A", "roteamento desligado");
  const ce = m.ceiling.effort, bad = [];
  let n = 0;
  for (const x of m.session) {
    const want = expectedSkillEffort(o, x.skill, ce);
    if (!want) continue;
    n++;
    if (x.effort !== want) bad.push(`sessão ${x.skill}: ${x.effort ?? "?"} (oráculo ${want})`);
  }
  for (const s of m.subagents) {
    const want = expectedAgentEffort(o, s.agentType, ce), f = first(s);
    if (!want || !f) continue;
    n++;
    if (f.effort !== want) bad.push(`${s.agentType}: ${f.effort ?? "?"} (oráculo ${want})`);
  }
  if (!n) return r("INV-EFF", "N/A", "nenhuma mensagem com esforço previsto pelo oráculo");
  return r("INV-EFF", bad.length ? "MISS" : "HELD", bad.length ? list(bad) : `${n} pontos conforme`);
}

function ledger(o, m) {
  if (!m.routing) return r("INV-LEDGER", "N/A", "roteamento desligado");
  if (!m.ledger.entries.length) return r("INV-LEDGER", "MISS", "roteado com ledger ligado e nenhuma linha gravada");
  return r("INV-LEDGER", m.ledger.violations.length ? "MISS" : "HELD",
    m.ledger.violations.length ? tally(m.ledger.violations) : `${m.ledger.entries.length} linhas válidas em ${m.ledger.files} arquivos`);
}

function off(o, m) {
  if (m.routing) return r("INV-OFF", "N/A", "braço roteado");
  return r("INV-OFF", m.ledger.entries.length ? "MISS" : "HELD", `${m.ledger.entries.length} linhas de ledger com o roteamento desligado`);
}

function prevc(o, m) {
  if (!m.prevc) return r("INV-PREVC", "MISS", "sem prevc.json no workspace");
  const st = PHASES.filter((p) => m.prevc.phases[p]).map((p) => `${p}=${m.prevc.phases[p].status}`).join(", ");
  return r("INV-PREVC", m.complete ? "HELD" : "MISS", `${st}${m.incompleteReason ? `; parada: ${m.incompleteReason}` : ""}`);
}

export const evaluate = (o, m) => [ceil, sess, phaseSync, sub, eff, ledger, off, prevc].map((f) => f(o, m));

export function coverage(o, m) {
  const L = m.ledger.entries;
  const has = (pred) => L.some(pred);
  const ct = ctOf(m);
  const tierR = (s, ph) => expectedSubagentTier(o, s.agentType, ph, ct);
  const items = [
    ["sessão por fase", m.routing && new Set(m.session.map((x) => x.model)).size > 1],
    ["esforço por skill", m.routing && m.session.some((x) => { const w = expectedSkillEffort(o, x.skill, m.ceiling.effort); return w && w !== m.ceiling.effort && x.effort === w; })],
    ["subagente por agente", has((e) => e.source === "agent")],
    ["override de fase", m.routing && m.subagents.some((s) => s.agentType === "devflow:code-reviewer" && s.phase === "R" && first(s)
      && tierR(s, "R") !== tierR(s, null) && modelTier(first(s).model) === tierR(s, "R"))],
    ["tier da task do plano", m.planTiers.length > 0 && m.subagents.some((s) => s.agentType === "general-purpose" && s.phase === "E" && spawnOf(m, s.agentId)?.source === "explicit")],
    ["skill final-review", has((e) => e.source === "skill")],
    ["teto do usuário", m.routing && m.subagents.some((s) => isRoutable(o, s.agentType) && first(s)
      && tierRank(expectedSubagentTier(o, s.agentType, s.phase, "top")) > tierRank(ct) && modelTier(first(s).model) === ct)],
    ["esforço por passo", m.subagents.some((s) => new Set(s.messages.map((x) => x.effort).filter(Boolean)).size > 1)],
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

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): vereditos contra a fase real e matriz de cobertura"`

---

### Task 8: Scorecard

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `lib/scorecard.mjs`, `scripts/score.mjs`
- Test: `tests/unit/scorecard.test.mjs`

**Interfaces:**
- Consumes: `evaluate`, `coverage` (Task 7), `loadOracle` (Task 2), `Metrics`.
- Produces: `esc(s) → string`; `economy(runs) → Array<{ armId, byModel, total: { input, output, cacheRead, cacheCreate, costUSD } }>`; `render({ title, runs: Array<{ metrics, verdicts, coverage }> }) → string`. CLI `node scripts/score.mjs --out results/<nome> <runDir>...` → `scorecard.md` e `summary.json` (só vereditos, cobertura, tokens e aceitação).

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/scorecard.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { render, economy, esc } from "../../lib/scorecard.mjs";

const msg = (phase, model, out = 1, cacheRead = 0) => ({ ts: 0, phase, model, effort: "medium", skill: null, usage: { input: 1, output: out, cacheRead, cacheCreate: 0 } });
const run = (armId, cost, out, passed) => ({
  metrics: { armId, routing: armId !== "A-baseline", invocations: 1, complete: true, incompleteReason: null,
    tokens: { byModel: { "claude-opus-5-5": { input: 1, output: out, cacheRead: 10, cacheCreate: 5 } }, streamByModel: { "claude-opus-5-5": { input: 1, output: out, cacheRead: 10, cacheCreate: 5, costUSD: cost } }, streamDeltaPct: 0 },
    acceptance: { passed, total: 13 },
    session: [msg("P", "claude-opus-5-5", 3), msg("E", "claude-sonnet-5-5", 2, 9)],
    subagents: [{ agentType: "devflow:architect", phase: "P", messages: [msg("P", "claude-opus-5-5", 4)] }],
    ledger: { entries: [{ scope: "subagent", agentType: "devflow:architect", escalation: { at: "retry", action: "escalate" } }], violations: [], files: 1 },
    env: { claudeVersion: "2.1.295", pluginVersion: "3.7.0", superpowersVersion: "6.4.1" } },
  verdicts: [{ id: "INV-CEIL", verdict: "HELD", evidence: "ok" }, { id: "INV-SUB", verdict: "MISS", evidence: "[clique](https://evil) <img src=x> a|b" }],
  coverage: [{ feature: "ledger", exercised: armId !== "A-baseline", evidence: "" }],
});

test("esc neutraliza Markdown e HTML", () => {
  assert.equal(esc("[a](b) <c> `d` *e* _f_ !g |h\ni"), "\\[a\\]\\(b\\) \\<c\\> \\`d\\` \\*e\\* \\_f\\_ \\!g \\|h i");
});

test("economy soma por braço, com custo do stream", () => {
  assert.deepEqual(economy([run("A-baseline", 2, 100, 13)])[0].total, { input: 1, output: 100, cacheRead: 10, cacheCreate: 5, costUSD: 2 });
});

test("render: seções, vereditos, razão B÷A, n=1, tabelas por agente/fase/cache e escape", () => {
  const md = render({ title: "Campanha X", runs: [run("A-baseline", 2, 100, 13), run("B-routed", 1, 50, 12)] });
  for (const s of ["# Campanha X", "## Vereditos", "## Cobertura da v3.7", "## Economia", "## Por agente", "## Sessão por fase real", "## Cache frio nas trocas", "## Qualidade", "## Ambiente"]) assert.ok(md.includes(s), s);
  assert.match(md, /\| INV-CEIL \| HELD \| HELD \|/);
  assert.match(md, /\| INV-SUB \| MISS \| MISS \|/);
  assert.match(md, /B-routed ÷ A-baseline[^\n]*0\.50/);
  assert.match(md, /n = 1/);
  assert.match(md, /\| B-routed \| devflow:architect \| 1 \| claude-opus-5-5 \| 4 \| 1 \|/);
  assert.match(md, /\| B-routed \| E \| claude-sonnet-5-5 \| 2 \|/);
  assert.match(md, /claude-opus-5-5 → claude-sonnet-5-5[^\n]*0\.90/);
  assert.ok(!/(^|[^\\])<img/.test(md));
  assert.ok(!/(^|[^\\])\]\(/.test(md));
  assert.match(md, /autorreportados/);
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL

- [ ] **Step 3: Implementar**

`lib/scorecard.mjs`:
```js
// lib/scorecard.mjs — scorecard Markdown (spec §7–§9). Só enums, IDs validados e números; tudo escapado. Puro.
const KEYS = ["input", "output", "cacheRead", "cacheCreate"];
export const esc = (s) => String(s ?? "").replace(/[\\`*_\[\]()<>!|]/g, (c) => `\\${c}`).replace(/[\r\n]+/g, " ");
const fmt = (x) => (typeof x === "number" && Number.isFinite(x) ? (Number.isInteger(x) ? String(x) : x.toFixed(2)) : "—");
const add = (acc, u) => { for (const k of KEYS) acc[k] = (acc[k] ?? 0) + (u?.[k] ?? 0); return acc; };

export function economy(runs) {
  return runs.map(({ metrics: m }) => {
    const total = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, costUSD: 0 };
    for (const u of Object.values(m.tokens?.byModel ?? {})) add(total, u);
    for (const u of Object.values(m.tokens?.streamByModel ?? {})) total.costUSD += u.costUSD ?? 0;
    return { armId: m.armId, byModel: m.tokens?.byModel ?? {}, total };
  });
}

export function render({ title, runs }) {
  const ids = runs.map((r) => r.metrics.armId);
  const head = (cols) => [`| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`];
  const L = [`# ${esc(title)}`, "", `Braços: ${ids.map(esc).join(", ")}. Cada braço é uma rodada (n = 1); números não são extrapolados. Ledger, prevc.json e transcripts são autorreportados pelo próprio sistema em teste.`, ""];

  L.push("## Vereditos", "", ...head(["Verificação", ...ids.map(esc)]));
  const vids = [...new Set(runs.flatMap((r) => r.verdicts.map((v) => v.id)))];
  for (const id of vids) L.push(`| ${esc(id)} | ${runs.map((r) => esc(r.verdicts.find((v) => v.id === id)?.verdict ?? "—")).join(" | ")} |`);
  L.push("", "**Evidências**", "");
  for (const r of runs) for (const v of r.verdicts) if (v.verdict !== "N/A") L.push(`- ${esc(r.metrics.armId)} · ${esc(v.id)} · ${esc(v.verdict)}: ${esc(v.evidence)}`);

  L.push("", "## Cobertura da v3.7", "", ...head(["Funcionalidade", ...ids.map(esc)]));
  const feats = [...new Set(runs.flatMap((r) => r.coverage.map((c) => c.feature)))];
  for (const f of feats) L.push(`| ${esc(f)} | ${runs.map((r) => (r.coverage.find((c) => c.feature === f)?.exercised ? "sim" : "não")).join(" | ")} |`);

  const eco = economy(runs);
  L.push("", "## Economia", "", ...head(["Braço", "Modelo", "Entrada", "Saída", "Cache lido", "Cache criado"]));
  for (const e of eco) for (const [m, u] of Object.entries(e.byModel)) L.push(`| ${esc(e.armId)} | ${esc(m)} | ${KEYS.map((k) => fmt(u[k])).join(" | ")} |`);
  const base = eco.find((e) => e.armId.startsWith("A"));
  if (base) for (const e of eco.filter((x) => x !== base)) {
    L.push("", `- ${esc(e.armId)} ÷ ${esc(base.armId)}: saída ${fmt(e.total.output / (base.total.output || 1))}, custo de lista ${fmt(e.total.costUSD / (base.total.costUSD || 1))}`);
  }
  L.push("", "Fonte: transcripts deduplicados. O custo de lista vem do modelUsage do stream e é um peso por modelo, não o consumo da cota da assinatura.");
  for (const { metrics: m } of runs) if (typeof m.tokens?.streamDeltaPct === "number" && m.tokens.streamDeltaPct > 5) L.push(`- Alerta ${esc(m.armId)}: stream e transcripts divergem ${fmt(m.tokens.streamDeltaPct)}% na saída.`);

  L.push("", "## Por agente", "", ...head(["Braço", "Agente", "Despachos", "Modelos", "Saída", "Escaladas"]));
  for (const { metrics: m } of runs) {
    const by = new Map();
    for (const s of m.subagents ?? []) {
      const x = by.get(s.agentType) ?? { n: 0, models: new Set(), out: 0 };
      x.n++;
      for (const g of s.messages) { x.models.add(g.model); x.out += g.usage.output; }
      by.set(s.agentType, x);
    }
    const escal = (t) => (m.ledger?.entries ?? []).filter((e) => e.agentType === t && e.escalation?.action === "escalate").length;
    for (const [t, x] of by) L.push(`| ${esc(m.armId)} | ${esc(t)} | ${x.n} | ${[...x.models].map(esc).join(", ")} | ${x.out} | ${escal(t)} |`);
  }

  L.push("", "## Sessão por fase real", "", ...head(["Braço", "Fase", "Modelo", "Saída"]));
  for (const { metrics: m } of runs) {
    const by = new Map();
    for (const x of m.session ?? []) { const k = `${x.phase ?? "?"}|${x.model}`; by.set(k, (by.get(k) ?? 0) + x.usage.output); }
    for (const [k, out] of by) { const [ph, model] = k.split("|"); L.push(`| ${esc(m.armId)} | ${esc(ph)} | ${esc(model)} | ${out} |`); }
  }

  L.push("", "## Cache frio nas trocas", "", "Razão de cache lido na primeira mensagem da sessão após cada troca de modelo.", "");
  for (const { metrics: m } of runs) {
    const s = m.session ?? [];
    for (let i = 1; i < s.length; i++) if (s[i].model !== s[i - 1].model) {
      const u = s[i].usage, tot = u.input + u.cacheRead + u.cacheCreate;
      L.push(`- ${esc(m.armId)} · fase ${esc(s[i].phase ?? "?")}: ${esc(s[i - 1].model)} → ${esc(s[i].model)}, cache lido ${fmt(tot ? u.cacheRead / tot : 0)}`);
    }
  }

  L.push("", "## Qualidade", "", ...head(["Braço", "Aceitação", "PREVC terminou", "Invocações", "Parada"]));
  for (const { metrics: m } of runs) L.push(`| ${esc(m.armId)} | ${m.acceptance ? `${m.acceptance.passed}/${m.acceptance.total}` : "—"} | ${m.complete ? "sim" : "não"} | ${fmt(m.invocations)} | ${esc(m.incompleteReason ?? "—")} |`);

  L.push("", "## Ambiente", "", ...head(["Braço", "Claude Code", "DevFlow", "superpowers"]));
  for (const { metrics: m } of runs) L.push(`| ${esc(m.armId)} | ${esc(m.env?.claudeVersion ?? "—")} | ${esc(m.env?.pluginVersion ?? "—")} | ${esc(m.env?.superpowersVersion ?? "—")} |`);
  return L.join("\n") + "\n";
}
```

`scripts/score.mjs`:
```js
#!/usr/bin/env node
// Junta as rodadas de uma campanha e grava results/<nome>/{scorecard.md,summary.json}.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, basename, sep } from "node:path";
import { loadOracle } from "../lib/tiers.mjs";
import { evaluate, coverage } from "../lib/invariants.mjs";
import { render } from "../lib/scorecard.mjs";

const a = process.argv.slice(2);
const oi = a.indexOf("--out");
if (oi < 0 || !a[oi + 1]) { console.error("uso: score.mjs --out results/<nome> <runDir>..."); process.exit(2); }
const out = resolve(a[oi + 1]);
const LAB = resolve(new URL("..", import.meta.url).pathname);
if (!out.startsWith(join(LAB, "results") + sep)) { console.error("score: --out deve ficar em results/"); process.exit(2); }
const dirs = a.filter((_, i) => i !== oi && i !== oi + 1);
const o = loadOracle();
const runs = dirs.map((d) => { const metrics = JSON.parse(readFileSync(join(d, "metrics.json"), "utf8")); return { metrics, verdicts: evaluate(o, metrics), coverage: coverage(o, metrics) }; });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "scorecard.md"), render({ title: `Campanha ${basename(out)}`, runs }));
writeFileSync(join(out, "summary.json"), JSON.stringify(runs.map((r) => ({
  armId: r.metrics.armId, verdicts: r.verdicts.map(({ id, verdict }) => ({ id, verdict })),
  coverage: r.coverage.map(({ feature, exercised }) => ({ feature, exercised })), tokens: r.metrics.tokens.byModel, acceptance: r.metrics.acceptance,
})), null, 2) + "\n");
process.stdout.write(join(out, "scorecard.md") + "\n");
```

- [ ] **Step 4: Rodar e ver passar** → PASS (3)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(lab): scorecard com economia por agente e fase, cache frio e escape"`

---

### Task 9: Software-alvo, seed e materialização do workspace

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `brief/PRODUCT.md`, `seed/package.json`, `seed/.gitignore`, `seed/.devflow-language`, `seed/.mcp.json`, `seed/.context/.devflow.yaml.tmpl`, `lib/seed.mjs`
- Test: `tests/unit/seed.test.mjs`

**Interfaces:**
- Consumes: `modelsYaml` (Task 1).
- Produces: `materialize({ seedDir, briefPath, arm, wsDir })`; `FIRST_PROMPT`, `RESUME_PROMPT`, `PREFLIGHT_PROMPT`.

- [ ] **Step 1: Escrever o brief** — `brief/PRODUCT.md`, com **exatamente** este contrato (a suíte oculta depende dele):

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

`seed/.mcp.json` — versão **exata** do dotcontext (spec L16). Rode `npm view @dotcontext/cli version` e use o número retornado (na revisão R era `1.1.1`):
```json
{ "mcpServers": { "dotcontext": { "command": "npx", "args": ["-y", "@dotcontext/cli@1.1.1", "--lang", "pt-BR", "mcp"] } } }
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
import { materialize, FIRST_PROMPT, RESUME_PROMPT, PREFLIGHT_PROMPT } from "../../lib/seed.mjs";
import { loadArm } from "../../lib/arm.mjs";

const LAB = new URL("../..", import.meta.url).pathname;
const arm = (id) => loadArm(JSON.parse(readFileSync(join(LAB, "arms", `${id}.json`), "utf8")));
const ws = (id) => { const d = join(mkdtempSync(join(tmpdir(), "lab-seed-")), "ws"); materialize({ seedDir: join(LAB, "seed"), briefPath: join(LAB, "brief/PRODUCT.md"), arm: arm(id), wsDir: d }); return d; };
const git = (d, ...a) => execFileSync("git", ["-C", d, ...a], { encoding: "utf8" }).trim();

test("workspace B: brief, .devflow.yaml com models, um commit em main, sem remoto e sem acceptance", () => {
  const d = ws("B-routed");
  assert.ok(existsSync(join(d, "PRODUCT.md")));
  const y = readFileSync(join(d, ".context/.devflow.yaml"), "utf8");
  assert.match(y, /\nmodels:\n  enabled: true\n/);
  assert.ok(!y.includes("{{MODELS}}"));
  assert.ok(!existsSync(join(d, ".context/.devflow.yaml.tmpl")));
  assert.deepEqual([git(d, "rev-list", "--count", "HEAD"), git(d, "branch", "--show-current"), git(d, "remote")], ["1", "main", ""]);
  assert.ok(!readdirSync(d, { recursive: true }).some((p) => String(p).includes("acceptance")));
});

test("workspace A: sem bloco models; .mcp.json com versão fixa do dotcontext", () => {
  const d = ws("A-baseline");
  assert.doesNotMatch(readFileSync(join(d, ".context/.devflow.yaml"), "utf8"), /models:/);
  const mcp = readFileSync(join(d, ".mcp.json"), "utf8");
  assert.match(mcp, /@dotcontext\/cli@\d+\.\d+\.\d+"/);
  assert.doesNotMatch(mcp, /@latest/);
});

test("workspace já existente é recusado", () => {
  const d = ws("A-baseline");
  assert.throws(() => materialize({ seedDir: join(LAB, "seed"), briefPath: join(LAB, "brief/PRODUCT.md"), arm: arm("A-baseline"), wsDir: d }), /já existe/);
});

test("prompts", () => {
  assert.match(FIRST_PROMPT, /^\/devflow:devflow auto /);
  assert.match(RESUME_PROMPT, /merge local/);
  assert.equal(PREFLIGHT_PROMPT, "Responda apenas: ok");
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
export const PREFLIGHT_PROMPT = "Responda apenas: ok";

export function materialize({ seedDir, briefPath, arm, wsDir }) {
  if (existsSync(wsDir)) throw new Error(`workspace já existe: ${wsDir}`);
  mkdirSync(wsDir, { recursive: true });
  cpSync(seedDir, wsDir, { recursive: true });
  const tmpl = join(wsDir, ".context/.devflow.yaml.tmpl");
  writeFileSync(join(wsDir, ".context/.devflow.yaml"), readFileSync(tmpl, "utf8").replace("{{MODELS}}", modelsYaml(arm.models)));
  rmSync(tmpl);
  cpSync(briefPath, join(wsDir, "PRODUCT.md"));
  const git = (...a) => execFileSync("git", ["-C", wsDir, ...a], { stdio: "ignore", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "routing-lab");
  git("config", "user.email", "routing-lab@localhost");
  git("add", "-A");
  git("commit", "-q", "-m", "chore: seed do laboratório");
}
```

- [ ] **Step 6: Rodar e ver passar** → PASS (4)

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(lab): brief do shortlink, seed com dotcontext fixo e workspace"`

---

### Task 10: Suíte de aceitação oculta e implementação de referência

**Agent:** test-writer · **Tier:** standard · **Tests:** unit + e2e · **Revisão:** pesada (security-auditor)

**Files:**
- Create: `fixtures/shortlink-ref/src/server.mjs`, `fixtures/shortlink-ref/src/cli.mjs`, `fixtures/shortlink-broken/src/server.mjs`
- Create: `acceptance/helpers.mjs`, `acceptance/api.test.mjs`, `acceptance/rate-limit.test.mjs`, `acceptance/cli.test.mjs`
- Create: `lib/accept.mjs`, `scripts/accept.mjs`
- Test: `tests/unit/accept.test.mjs`

**Interfaces:**
- Produces: `runAcceptance(wsDir, { timeoutMs? }) → Promise<{ passed, total, error? }>`; CLI `node scripts/accept.mjs --ws <dir> [--out <arquivo>]`. A suíte lê `SHORTLINK_WS`.

- [ ] **Step 1: Escrever a suíte**

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
const base = () => ({ PATH: process.env.PATH, HOME: process.env.HOME });
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });

export async function start({ data = mkdtempSync(join(tmpdir(), "sl-data-")), rate = "1000/1" } = {}) {
  const port = await freePort();
  const proc = spawn(process.execPath, [join(WS, "src/server.mjs"), "--port", String(port), "--data", data],
    { cwd: data, env: { ...base(), SHORTLINK_TOKEN: TOKEN, SHORTLINK_RATE_LIMIT: rate }, stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50 && proc.exitCode === null; i++) { try { await fetch(`${url}/__ping`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const stop = () => new Promise((r) => { if (proc.exitCode !== null || proc.signalCode !== null) return r(); proc.once("exit", r); proc.kill(); });
  return { base: url, data, stop };
}

export const req = (url, path, { method = "GET", token = TOKEN, body, raw } = {}) =>
  fetch(url + path, { method, redirect: "manual", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: raw ?? (body ? JSON.stringify(body) : undefined) });

export const cli = (url, args) => promisify(execFile)(process.execPath, [join(WS, "src/cli.mjs"), ...args, "--server", url], { cwd: tmpdir(), env: { ...base(), SHORTLINK_TOKEN: TOKEN }, timeout: 15000 })
  .then((r) => ({ code: 0, out: r.stdout.trim() }), (e) => ({ code: typeof e.code === "number" ? e.code : 1, out: (e.stdout ?? "").trim() }));
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
  assert.deepEqual(await (await req(s.base, "/links/hitme/stats")).json(), { slug: "hitme", url: "https://d.com", hits: 2 });
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
  assert.equal((await (await req(s.base, "/links/fica/stats")).json()).hits, 1);
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
  assert.deepEqual(await cli(s.base, ["add", "https://cli.com", "--slug", "pelacli"]), { code: 0, out: "pelacli" });
  assert.deepEqual(await cli(s.base, ["get", "pelacli"]), { code: 0, out: "https://cli.com" });
  assert.deepEqual(await cli(s.base, ["stats", "pelacli"]), { code: 0, out: "0" });
  assert.equal((await cli(s.base, ["rm", "pelacli"])).code, 0);
});
test("erro HTTP → código 1 e nada no stdout (com a CLI comprovadamente viva)", async () => {
  assert.equal((await cli(s.base, ["add", "https://x.com", "--slug", "existe"])).code, 0);
  assert.deepEqual(await cli(s.base, ["get", "naoexiste"]), { code: 1, out: "" });
});
```

- [ ] **Step 2: Escrever a implementação de referência e o controle quebrado**

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
      if (s === undefined) do { s = Array.from({ length: 7 }, () => ALNUM[randomInt(ALNUM.length)]).join(""); } while (Object.hasOwn(db, s));
      if (Object.hasOwn(db, s)) return send(res, 409, { error: "exists" });
      db[s] = { url: b.url, hits: 0 }; save();
      return send(res, 201, { slug: s, url: b.url });
    }
    if (slug && stats && req.method === "GET") return Object.hasOwn(db, slug) ? send(res, 200, { slug, url: db[slug].url, hits: db[slug].hits }) : send(res, 404, { error: "not found" });
    if (slug && !stats && req.method === "DELETE") { if (!Object.hasOwn(db, slug)) return send(res, 404, { error: "not found" }); delete db[slug]; save(); return send(res, 204); }
    return send(res, 404, { error: "not found" });
  }
  const slug = pathname.slice(1);
  if (req.method === "GET" && Object.hasOwn(db, slug)) { db[slug].hits++; save(); return send(res, 302, null, { location: db[slug].url }); }
  return send(res, 404, { error: "not found" });
}).listen(port, "127.0.0.1");
```

`fixtures/shortlink-ref/src/cli.mjs`:
```js
// CLI de referência do brief.
const all = process.argv.slice(2);
const [cmd, a1] = all;
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

`fixtures/shortlink-broken/src/server.mjs` (responde 500 a tudo, para provar que a suíte reprova):
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
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAcceptance } from "../../lib/accept.mjs";

const LAB = new URL("../..", import.meta.url).pathname;

test("referência passa em tudo", async () => {
  const r = await runAcceptance(join(LAB, "fixtures/shortlink-ref"));
  assert.equal(r.total, 13);
  assert.equal(r.passed, 13);
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
test("servidor que morre ao subir não trava a suíte", async () => {
  const ws = mkdtempSync(join(tmpdir(), "lab-acc-"));
  mkdirSync(join(ws, "src"));
  writeFileSync(join(ws, "src/server.mjs"), "process.exit(1);\n");
  const r = await runAcceptance(ws, { timeoutMs: 60000 });
  assert.equal(r.passed, 0);
  assert.ok(r.total > 0 || r.error);
});
```

- [ ] **Step 4: Rodar e ver falhar** — `node --test tests/unit/accept.test.mjs` → FAIL (`Cannot find module .../lib/accept.mjs`)

- [ ] **Step 5: Implementar o runner**

`lib/accept.mjs`:
```js
// lib/accept.mjs — roda a suíte oculta de fora do workspace, com env mínimo e grupo de processos (spec §10).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUITE = new URL("../acceptance/", import.meta.url).pathname;

export function runAcceptance(wsDir, { timeoutMs = 180000 } = {}) {
  if (!existsSync(join(wsDir, "src/server.mjs"))) return Promise.resolve({ passed: 0, total: 0, error: "workspace sem src/server.mjs" });
  const box = mkdtempSync(join(tmpdir(), "lab-accept-"));
  mkdirSync(join(box, "home"));
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["--test", "--test-reporter=tap", "--test-concurrency=1", SUITE],
      { cwd: box, env: { PATH: process.env.PATH, HOME: join(box, "home"), SHORTLINK_WS: wsDir }, detached: true, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (c) => { out += c; });
    const killGroup = () => { try { process.kill(-p.pid, "SIGKILL"); } catch {} };
    const t = setTimeout(killGroup, timeoutMs);
    p.on("close", () => {
      clearTimeout(t);
      killGroup(); // servidores órfãos do código do agente
      const num = (k) => Number(out.match(new RegExp(`^# ${k} (\\d+)$`, "m"))?.[1] ?? 0);
      const total = num("tests");
      resolve({ passed: num("pass"), total, ...(total ? {} : { error: "suíte sem resumo TAP" }) });
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
const json = JSON.stringify(await runAcceptance(resolve(opt("--ws")))) + "\n";
if (opt("--out")) writeFileSync(opt("--out"), json); else process.stdout.write(json);
```

- [ ] **Step 6: Rodar e ver passar** — `node --test tests/unit/accept.test.mjs` → PASS (4). Falha da suíte contra a referência = erro na suíte ou na referência (código do laboratório): corrija aqui.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "test(lab): suíte de aceitação oculta isolada, referência e controle quebrado"`

---

### Task 11: Driver da rodada e coleta

**Agent:** backend-specialist · **Tier:** capable · **Tests:** e2e · **Revisão:** pesada (security-auditor)

**Files:**
- Create: `lib/collect.mjs`, `scripts/run-arm.mjs`, `scripts/collect.mjs`, `tests/e2e/fake-claude.mjs`
- Test: `tests/e2e/run-arm.test.mjs`

**Interfaces:**
- Consumes: Tasks 1, 3, 4, 5, 6, 9, 10.
- Produces:
  - `node scripts/run-arm.mjs --arm arms/<id>.json [--runs DIR] [--plugin-dir D] [--superpowers-dir D] [--claude-bin claude] [--max-resumes 0..20] [--timeout-min N] [--run-id ID] [--allow-home]` → `<runs>/<id>/{run.json, stream-preflight.jsonl, stream-<n>.jsonl, prevc-<n>.json, ws/, xdg/, gh/, gitconfig}`; imprime o caminho da rodada. Saída 0 (terminou ou parou honestamente), 2 (uso inválido), 3 (preflight reprovado).
  - `run.json = { armId, routing, ceiling, claudeVersion, pluginVersion, superpowersVersion, sessionIds, invocations, exitCodes, killed, done, incompleteReason, preflightProblems?, startedAt, endedAt }`.
  - `collectRun(runDir, { projectsRoot }) → Metrics` (formato da Task 7; subagentes ordenados pelo primeiro timestamp); `node scripts/collect.mjs --run <runDir> [--projects-root D] [--plugin-dir D] [--no-report]` → `metrics.json` (inclui `acceptance`) e `report.md` (só na rodada).

- [ ] **Step 1: Escrever o `claude` falso** (formato real, sondas da fase R)

`tests/e2e/fake-claude.mjs`:
```js
#!/usr/bin/env node
// `claude` falso para o e2e, no formato real (spec §13): stream-json com init; transcripts com timestamp, effort e
// attributionSkill; ledger um arquivo por processo (spawn com ID completo + usage; sessão sem effort); prevc.json com timestamps.
import { mkdirSync, writeFileSync, appendFileSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
if (argv[0] === "--version") { process.stdout.write("2.1.295 (Claude Code)\n"); process.exit(0); }
const E = process.env;
if (E.ROUTING_LAB_FAKE_ENV_DUMP) writeFileSync(E.ROUTING_LAB_FAKE_ENV_DUMP, Object.keys(E).sort().join("\n"));
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const dirs = argv.filter((_, i) => argv[i - 1] === "--plugin-dir");
const prompt = val("-p");
const resume = val("--resume");
const routed = E.DEVFLOW_MODEL_ROUTING === "1";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const init = (sid) => out({ type: "system", subtype: "init", session_id: sid, model: "claude-opus-5-5",
  plugins: [{ name: "devflow", path: dirs[0] }, { name: "superpowers", path: dirs[1] }],
  mcp_servers: E.ROUTING_LAB_FAKE_PREFLIGHT_FAIL ? [] : [{ name: "dotcontext", status: "connected" }] });
const result = (sid, model, cost, subtype = "success") => out({ type: "result", subtype, is_error: subtype !== "success", num_turns: 3, terminal_reason: "completed", session_id: sid,
  modelUsage: { [model]: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 100, cacheCreationInputTokens: 20, costUSD: cost } }, subagent_stats: { spawned: 1, completed: 1, failed: 0 } });

if (prompt?.startsWith("Responda apenas")) { init("pre-0"); result("pre-0", "claude-haiku-5-5", 0.001); process.exit(0); }

const sid = resume ?? "11111111-2222-3333-4444-555555555555";
const ws = process.cwd();
const proj = join(E.ROUTING_LAB_FAKE_PROJECTS, ws.replace(/[^A-Za-z0-9]/g, "-"));
mkdirSync(join(proj, sid, "subagents"), { recursive: true });
const ts = (hm) => `2026-10-09T${hm}:00.000Z`;
let k = 0;
const msg = (hm, model, effort, skill) => JSON.stringify({ type: "assistant", timestamp: ts(hm), effort, ...(skill ? { attributionSkill: skill } : {}),
  message: { id: `m${resume ? 2 : 1}-${k++}`, model, content: [{ type: "text", text: "SEGREDO" }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 } } });
const sub = (id, type, req, lines) => {
  writeFileSync(join(proj, sid, `subagents/agent-${id}.meta.json`), JSON.stringify({ agentType: type, ...(req ? { model: req } : {}), description: "SEGREDO" }));
  writeFileSync(join(proj, sid, `subagents/agent-${id}.jsonl`), lines.join("\n") + "\n");
};
const ph = (s, e) => ({ status: e ? "completed" : "in_progress", started_at: ts(s), ...(e ? { completed_at: ts(e) } : {}) });
const prevc = (phases, current) => {
  mkdirSync(join(ws, ".context/runtime/workflows"), { recursive: true });
  writeFileSync(join(ws, ".context/runtime/workflows/prevc.json"), JSON.stringify({ version: 2, status: { project: { name: "shortlink", scale: 3, current_phase: current }, phases } }));
};
const led = routed ? join(E.XDG_DATA_HOME, "devflow-model-routing", "abcdef0123456789") : null;
const L = (file, e) => { if (!led) return; mkdirSync(led, { recursive: true }); appendFileSync(join(led, file), JSON.stringify({ ts: "2026-10-09T10:00:00.000Z", sessionId: file.slice(0, -6), adapter: "mod", ...e }) + "\n"); };
const U = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const big = routed ? "claude-sonnet-5-5" : "claude-opus-5-5";

init(sid);
if (!resume) {
  if (E.ROUTING_LAB_FAKE_RESULT_ERROR) { result(sid, "claude-opus-5-5", 0.1, "error_during_execution"); process.exit(1); }
  appendFileSync(join(proj, `${sid}.jsonl`), [msg("10:01", "claude-opus-5-5", "xhigh", "superpowers:brainstorming"), msg("10:11", "claude-opus-5-5", "xhigh")].join("\n") + "\n");
  sub("r1", "devflow:code-reviewer", routed ? "opus" : null, [msg("10:12", "claude-opus-5-5", "medium"), msg("10:13", "claude-opus-5-5", "high")]);
  L("proc1.jsonl", { scope: "subagent", agentId: "r1", agentType: "devflow:code-reviewer", model: "claude-opus-5-5", phase: "R", tier: "capable", ceiling: "capable", effort: "medium", source: "phase" });
  L("proc1.jsonl", { scope: "subagent", agentId: "r1", agentType: "devflow:code-reviewer", model: "claude-opus-5-5", phase: "R", usage: U });
  L("proc1.jsonl", { scope: "session", model: "claude-opus-5-5", phase: "P", usage: U });
  prevc({ P: ph("10:00", "10:10"), R: ph("10:10", "10:20"), E: ph("10:20") }, "E");
  result(sid, "claude-opus-5-5", routed ? 0.4 : 0.5);
} else {
  appendFileSync(join(proj, `${sid}.jsonl`), [msg("10:21", big, routed ? "medium" : "xhigh", "devflow:prevc-execution"), msg("10:41", big, routed ? "medium" : "xhigh"),
    msg("10:51", big, routed ? "low" : "xhigh", "devflow:prevc-confirmation")].join("\n") + "\n");
  sub("d1", "devflow:documentation-writer", routed ? "haiku" : null, [msg("10:52", routed ? "claude-haiku-5-5" : "claude-opus-5-5", "low")]);
  L("proc2.jsonl", { scope: "subagent", agentId: "d1", agentType: "devflow:documentation-writer", model: "claude-haiku-5-5", phase: "C", tier: "cheap", ceiling: "capable", effort: "low", source: "agent" });
  L("proc2.jsonl", { scope: "subagent", agentId: "d1", agentType: "devflow:documentation-writer", model: "claude-haiku-5-5", phase: "C", usage: U });
  L("proc2.jsonl", { scope: "session", model: big, phase: "E", switched: true, usage: U });
  prevc({ P: ph("10:00", "10:10"), R: ph("10:10", "10:20"), E: ph("10:20", "10:40"), V: ph("10:40", "10:50"), C: ph("10:50", "11:00") }, "C");
  if (E.ROUTING_LAB_FAKE_REF && !existsSync(join(ws, "src"))) cpSync(join(E.ROUTING_LAB_FAKE_REF, "src"), join(ws, "src"), { recursive: true });
  result(sid, big, routed ? 0.2 : 0.5);
}
```

Run: `chmod +x tests/e2e/fake-claude.mjs`

- [ ] **Step 2: Escrever o e2e que falha**

`tests/e2e/run-arm.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LAB = new URL("../..", import.meta.url).pathname;
const FAKE = join(LAB, "tests/e2e/fake-claude.mjs");

function runArm(armId, { env: extra = {}, args = [], runs = mkdtempSync(join(tmpdir(), "lab-runs-")) } = {}) {
  const projects = mkdtempSync(join(tmpdir(), "lab-proj-"));
  const env = { ...process.env, ROUTING_LAB_FAKE_PROJECTS: projects, ROUTING_LAB_FAKE_REF: join(LAB, "fixtures/shortlink-ref"), ...extra };
  const r = spawnSync("node", [join(LAB, "scripts/run-arm.mjs"), "--arm", join(LAB, `arms/${armId}.json`), "--runs", runs, "--plugin-dir", "/nao-usado",
    "--superpowers-dir", "/nao-usado-sp", "--claude-bin", FAKE, "--run-id", `t-${armId}`, ...args], { env, encoding: "utf8" });
  const runDir = join(runs, `t-${armId}`);
  const run = existsSync(join(runDir, "run.json")) ? JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")) : null;
  return { r, runDir, projects, run };
}
const collect = ({ runDir, projects }) => {
  execFileSync("node", [join(LAB, "scripts/collect.mjs"), "--run", runDir, "--projects-root", projects, "--no-report"]);
  return JSON.parse(readFileSync(join(runDir, "metrics.json"), "utf8"));
};

test("braço B: preflight, retomada até concluir C, instantâneos, tokens pelos transcripts sem duplicar", () => {
  const x = runArm("B-routed");
  assert.equal(x.r.status, 0, x.r.stderr);
  assert.deepEqual([x.run.invocations, x.run.done, x.run.incompleteReason, x.run.claudeVersion], [2, true, null, "2.1.295"]);
  assert.deepEqual(x.run.sessionIds, ["11111111-2222-3333-4444-555555555555"]);
  assert.deepEqual(readdirSync(x.runDir).filter((f) => /^(stream|prevc)-/.test(f)).sort(), ["prevc-1.json", "prevc-2.json", "stream-1.jsonl", "stream-2.jsonl", "stream-preflight.jsonl"]);
  const m = collect(x);
  assert.deepEqual(Object.keys(m.tokens.byModel).sort(), ["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
  assert.equal(m.tokens.byModel["claude-opus-5-5"].input, 40);
  assert.deepEqual(m.session.map((x) => x.phase), ["P", "R", "E", "V", "C"]);
  assert.deepEqual(m.subagents.map((s) => [s.agentType, s.phase]), [["devflow:code-reviewer", "R"], ["devflow:documentation-writer", "C"]]);
  assert.deepEqual([m.ledger.entries.length, m.ledger.violations, m.ledger.files], [6, [], 2]);
  assert.equal(m.acceptance.passed, m.acceptance.total);
  assert.equal(m.complete, true);
});

test("braço A: ambiente por allowlist chega ao claude; sem ledger", () => {
  const dump = join(mkdtempSync(join(tmpdir(), "lab-env-")), "env.txt");
  const x = runArm("A-baseline", { env: { DEVFLOW_MODEL_ROUTING: "1", GH_TOKEN: "x", ANTHROPIC_MODEL: "opus", SSH_AUTH_SOCK: "/s", ROUTING_LAB_FAKE_ENV_DUMP: dump } });
  const keys = readFileSync(dump, "utf8").split("\n");
  for (const k of ["DEVFLOW_MODEL_ROUTING", "GH_TOKEN", "ANTHROPIC_MODEL", "SSH_AUTH_SOCK"]) assert.ok(!keys.includes(k), k);
  for (const k of ["GIT_CONFIG_GLOBAL", "GH_CONFIG_DIR", "XDG_DATA_HOME", "DISABLE_AUTOUPDATER"]) assert.ok(keys.includes(k), k);
  const m = collect(x);
  assert.deepEqual([m.routing, m.ledger.entries.length], [false, 0]);
});

test("preflight reprovado: sai com 3, sem invocar o PREVC", () => {
  const x = runArm("B-routed", { env: { ROUTING_LAB_FAKE_PREFLIGHT_FAIL: "1" } });
  assert.equal(x.r.status, 3);
  assert.deepEqual([x.run.incompleteReason, x.run.invocations, x.run.preflightProblems], ["preflight", 0, ["dotcontext-desconectado"]]);
});

test("result de erro: para sem retomar", () => {
  const x = runArm("B-routed", { env: { ROUTING_LAB_FAKE_RESULT_ERROR: "1" } });
  assert.equal(x.r.status, 0);
  assert.deepEqual([x.run.invocations, x.run.done, x.run.incompleteReason], [1, false, "result:error_during_execution"]);
});

test("--runs dentro do laboratório e --max-resumes inválido são recusados", () => {
  assert.equal(runArm("B-routed", { runs: join(LAB, "runs") }).r.status, 2);
  assert.equal(runArm("B-routed", { args: ["--max-resumes", "abc"] }).r.status, 2);
  assert.equal(runArm("B-routed", { args: ["--max-resumes", "99"] }).r.status, 2);
});

test("metrics.json não carrega texto de transcript nem caminho do workspace", () => {
  const x = runArm("B-routed");
  const s = JSON.stringify(collect(x));
  assert.ok(!s.includes(x.runDir));
  assert.ok(!s.includes("SEGREDO"));
});
```

- [ ] **Step 3: Rodar e ver falhar** — `node --test tests/e2e/run-arm.test.mjs` → FAIL (`Cannot find module .../scripts/run-arm.mjs`)

- [ ] **Step 4: Implementar o driver**

`scripts/run-arm.mjs`:
```js
#!/usr/bin/env node
// Driver de uma rodada (spec L6, L12–L15): isolamento, preflight, retomada, parada honesta.
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { join, resolve, sep } from "node:path";
import { tmpdir, homedir } from "node:os";
import { loadArm, armArgs, armEnv } from "../lib/arm.mjs";
import { materialize, FIRST_PROMPT, RESUME_PROMPT, PREFLIGHT_PROMPT } from "../lib/seed.mjs";
import { parseStream, preflightProblems } from "../lib/stream.mjs";
import { readPrevcText, mergePrevc, isFinished } from "../lib/prevc.mjs";
import { readSafe, safeDir } from "../lib/safe-read.mjs";
import { pluginDirFor, superpowersDir, pluginVersion } from "../lib/plugin.mjs";

const LAB = resolve(new URL("..", import.meta.url).pathname);
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const die = (msg) => { console.error(`run-arm: ${msg}`); process.exit(2); };
const inside = (p, root) => p === root || p.startsWith(root + sep);

if (!opt("--arm")) die("uso: run-arm.mjs --arm arms/<id>.json [--runs DIR] [--plugin-dir D] [--superpowers-dir D] [--claude-bin claude] [--max-resumes 0..20] [--timeout-min N] [--run-id ID] [--allow-home]");
const arm = loadArm(JSON.parse(readFileSync(opt("--arm"), "utf8")));
const mr = opt("--max-resumes", "6");
if (!/^\d{1,2}$/.test(mr) || Number(mr) > 20) die("--max-resumes deve ser inteiro de 0 a 20");
const tm = opt("--timeout-min", "240");
if (!/^\d{1,4}$/.test(tm) || Number(tm) < 1) die("--timeout-min deve ser inteiro positivo");
const runId = opt("--run-id", `${new Date().toISOString().replace(/[:.]/g, "-")}-${arm.id}`);
if (!/^[A-Za-z0-9-]{1,80}$/.test(runId)) die("run-id inválido");
const runsRoot = resolve(opt("--runs", join(tmpdir(), "devflow-routing-lab", "runs")));
if (inside(runsRoot, LAB)) die("--runs não pode ficar dentro do laboratório (spec L13)");
if (inside(runsRoot, resolve(homedir())) && !a.includes("--allow-home")) die("--runs não pode ficar dentro de $HOME (CLAUDE.md ancestral; spec L13)");
const runDir = join(runsRoot, runId);
if (existsSync(runDir)) die(`rodada já existe: ${runDir}`);

const pluginDir = resolve(opt("--plugin-dir", pluginDirFor("v3.7.0")));
const spDir = resolve(opt("--superpowers-dir", superpowersDir()));
const ws = join(runDir, "ws"), xdg = join(runDir, "xdg");
mkdirSync(xdg, { recursive: true });
mkdirSync(join(runDir, "gh"));
writeFileSync(join(runDir, "gitconfig"), "");
materialize({ seedDir: join(LAB, "seed"), briefPath: join(LAB, "brief/PRODUCT.md"), arm, wsDir: ws });

const env = armEnv(arm, process.env, { xdgDir: xdg, runDir });
const claude = opt("--claude-bin", "claude");
const base = { pluginDir, superpowersDir: spDir, mcpConfig: join(ws, ".mcp.json") };
const ver = (s) => (typeof s === "string" && /^\d+\.\d+\.\d+$/.test(s) ? s : null);
let claudeVersion = null;
try { claudeVersion = ver(execFileSync(claude, ["--version"], { encoding: "utf8", env, timeout: 30000 }).trim().split(/\s+/)[0]); } catch {}
const run = { armId: arm.id, routing: arm.routing, ceiling: arm.ceiling, claudeVersion, pluginVersion: pluginVersion(pluginDir), superpowersVersion: pluginVersion(spDir),
  sessionIds: [], invocations: 0, exitCodes: [], killed: false, done: false, incompleteReason: null, startedAt: new Date().toISOString(), endedAt: null };
const save = () => { run.endedAt = new Date().toISOString(); writeFileSync(join(runDir, "run.json"), JSON.stringify(run, null, 2) + "\n"); };

// stdout direto para arquivo (nada de buffer em memória); timeout mata o grupo de processos.
function invoke(name, args) {
  const file = join(runDir, `stream-${name}.jsonl`);
  const fd = openSync(file, "w");
  return new Promise((res) => {
    let done = false, killed = false, t = null;
    const finish = (code) => { if (done) return; done = true; clearTimeout(t); closeSync(fd); res({ code, killed, stream: parseStream(readFileSync(file, "utf8")) }); };
    const p = spawn(claude, args, { cwd: ws, env, stdio: ["ignore", fd, "ignore"], detached: true });
    t = setTimeout(() => { killed = true; try { process.kill(-p.pid, "SIGKILL"); } catch {} }, Number(tm) * 60000);
    p.on("error", () => finish(-1));
    p.on("close", (code) => finish(code ?? -1));
  });
}

function snapshot(n) {
  const dir = safeDir(ws, ".context", "runtime", "workflows");
  const txt = dir ? readSafe(join(dir, "prevc.json"), 2 ** 20) : null;
  if (txt) writeFileSync(join(runDir, `prevc-${n}.json`), txt);
  return txt ? readPrevcText(txt) : null;
}
const branch = () => { try { return execFileSync("git", ["-C", ws, "branch", "--show-current"], { encoding: "utf8", env }).trim(); } catch { return null; } };

const pre = await invoke("preflight", armArgs(arm, { ...base, prompt: PREFLIGHT_PROMPT, model: "haiku", effort: "low" }));
const problems = preflightProblems(pre.stream.init, pluginDir);
if (problems.length) {
  run.incompleteReason = "preflight";
  run.preflightProblems = problems;
  save();
  console.error(`run-arm: preflight reprovado: ${problems.join(", ")}`);
  process.stdout.write(runDir + "\n");
  process.exit(3);
}

const snaps = [];
for (let i = 1; i <= Number(mr) + 1; i++) {
  const resume = run.sessionIds.at(-1) ?? null;
  if (i > 1 && !resume) { run.incompleteReason = "sem-sessao"; break; }
  const r = await invoke(String(i), armArgs(arm, { ...base, prompt: i === 1 ? FIRST_PROMPT : RESUME_PROMPT, resume: i === 1 ? null : resume }));
  run.invocations++;
  run.exitCodes.push(r.code);
  for (const s of r.stream.sessionIds) if (!run.sessionIds.includes(s)) run.sessionIds.push(s);
  const snap = snapshot(i);
  if (snap) snaps.push(snap);
  if (r.killed) { run.killed = true; run.incompleteReason = "killed"; break; }
  const res = r.stream.result;
  if (!res || res.isError || res.subtype !== "success") { run.incompleteReason = `result:${res?.subtype ?? "ausente"}`; break; }
  run.done = isFinished(mergePrevc(snaps), branch());
  if (run.done) break;
}
if (!run.done && !run.incompleteReason) run.incompleteReason = "max-resumes";
save();
process.stdout.write(runDir + "\n");
```

- [ ] **Step 5: Implementar a coleta**

`lib/collect.mjs`:
```js
// lib/collect.mjs — monta o Metrics de uma rodada (spec L8). Só números, enums e IDs validados.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseStream, mergeUsage } from "./stream.mjs";
import { projectSlug, readSession } from "./transcripts.mjs";
import { readLedger } from "./ledger.mjs";
import { readPrevcText, mergePrevc, phaseAt } from "./prevc.mjs";
import { readSafe, listSafe, safeDir } from "./safe-read.mjs";

const KEYS = ["input", "output", "cacheRead", "cacheCreate"];
const TIER = /\*\*Tier:\*\*\s*`?(cheap|standard|capable|top)\b/g;
const firstTs = (s) => s.messages[0]?.ts ?? Infinity;

function planTiers(ws) {
  const out = new Set();
  for (const parts of [["docs", "superpowers", "plans"], [".context", "plans"]]) {
    const d = safeDir(ws, ...parts);
    if (!d) continue;
    for (const f of listSafe(d, "file").filter((x) => x.endsWith(".md"))) for (const m of (readSafe(join(d, f), 4 * 2 ** 20) ?? "").matchAll(TIER)) out.add(m[1]);
  }
  return [...out].sort();
}

export function collectRun(runDir, { projectsRoot }) {
  const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
  const ws = join(runDir, "ws");
  const files = readdirSync(runDir);
  const snaps = files.filter((f) => /^prevc-\d+\.json$/.test(f)).sort((x, y) => parseInt(x.slice(6), 10) - parseInt(y.slice(6), 10))
    .map((f) => readPrevcText(readFileSync(join(runDir, f), "utf8"))).filter(Boolean);
  const prevc = mergePrevc(snaps);
  const at = (ts) => (prevc ? phaseAt(prevc.phases, ts) : null);
  const slug = projectSlug(ws);
  const session = [], subagents = [];
  for (const sid of run.sessionIds ?? []) {
    const t = readSession(projectsRoot, slug, sid);
    for (const x of t.main) session.push({ ...x, phase: at(x.ts) });
    for (const s of t.subagents) {
      if (subagents.some((y) => y.agentId === s.agentId)) continue;
      subagents.push({ ...s, phase: s.messages.length ? at(s.messages[0].ts) : null, messages: s.messages.map((x) => ({ ...x, phase: at(x.ts) })) });
    }
  }
  session.sort((x, y) => x.ts - y.ts);
  subagents.sort((x, y) => firstTs(x) - firstTs(y));
  const byModel = {};
  for (const x of [...session, ...subagents.flatMap((s) => s.messages)]) {
    const u = (byModel[x.model] ??= { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
    for (const k of KEYS) u[k] += x.usage[k];
  }
  let streamByModel = {};
  for (const f of files.filter((x) => /^stream-\d+\.jsonl$/.test(x))) {
    const s = parseStream(readFileSync(join(runDir, f), "utf8"));
    if (s.result) streamByModel = mergeUsage(streamByModel, s.result.modelUsage);
  }
  const outT = Object.values(byModel).reduce((n, u) => n + u.output, 0);
  const outS = Object.values(streamByModel).reduce((n, u) => n + u.output, 0);
  return {
    armId: run.armId, routing: run.routing, ceiling: run.ceiling, invocations: run.invocations, complete: run.done,
    incompleteReason: run.incompleteReason ?? null, killed: run.killed === true, prevc, session, subagents,
    ledger: readLedger(join(runDir, "xdg")),
    tokens: { byModel, streamByModel, streamDeltaPct: outT ? (Math.abs(outS - outT) / outT) * 100 : null },
    planTiers: planTiers(ws), reportOk: false, acceptance: null,
    env: { claudeVersion: run.claudeVersion ?? null, pluginVersion: run.pluginVersion ?? null, superpowersVersion: run.superpowersVersion ?? null },
  };
}
```

`scripts/collect.mjs`:
```js
#!/usr/bin/env node
// Gera <runDir>/metrics.json (+ report.md do model-route, que fica só na rodada).
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
if (!opt("--run")) { console.error("uso: collect.mjs --run <runDir> [--projects-root D] [--plugin-dir D] [--no-report]"); process.exit(2); }
const runDir = resolve(opt("--run"));
const projectsRoot = resolve(opt("--projects-root", join(homedir(), ".claude/projects")));
const m = collectRun(runDir, { projectsRoot });
if (!a.includes("--no-report")) {
  const plugin = resolve(opt("--plugin-dir", pluginDirFor("v3.7.0")));
  const ws = join(runDir, "ws");
  const r = spawnSync("node", [join(plugin, "scripts/model-route.mjs"), "report", "--cwd", ws, "--transcripts", join(projectsRoot, projectSlug(ws))],
    { encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, XDG_DATA_HOME: join(runDir, "xdg") }, timeout: 120000 });
  writeFileSync(join(runDir, "report.md"), r.stdout ?? "");
  m.reportOk = r.status === 0 && /\|\s*(devflow:[A-Za-z-]+|general-purpose)\s*\|/.test(r.stdout ?? "");
}
m.acceptance = await runAcceptance(join(runDir, "ws"));
writeFileSync(join(runDir, "metrics.json"), JSON.stringify(m, null, 2) + "\n");
process.stdout.write(join(runDir, "metrics.json") + "\n");
```

- [ ] **Step 6: Rodar e ver passar** — `node --test tests/e2e/run-arm.test.mjs` → PASS (6)

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(lab): driver isolado com preflight, retomada e parada honesta; coleta pela fase real"`

---

### Task 12: Campanha, runbooks e README

**Agent:** documentation-writer (docs) + backend-specialist (`campaign.mjs`) · **Tier:** standard · **Tests:** e2e

**Files:**
- Create: `scripts/campaign.mjs`, `runbooks/campaign.md`, `runbooks/refine.md`, `README.md`
- Test: `tests/e2e/campaign.test.mjs`

**Interfaces:**
- Consumes: todos os scripts anteriores; `isPristine` (Task 3).
- Produces: `node scripts/campaign.mjs --arms A-baseline,B-routed [--name N] [--ref v3.7.0] [--runs DIR] [--claude-bin claude] [--superpowers-dir D] [--projects-root D] [--max-resumes N] [--timeout-min N] [--no-report] [--no-ensure]` → `results/<name>/scorecard.md`. `--no-ensure` não clona nem confere o plugin (só para testes).

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
  const projects = mkdtempSync(join(tmpdir(), "lab-proj-"));
  const env = { ...process.env, ROUTING_LAB_FAKE_PROJECTS: projects, ROUTING_LAB_FAKE_REF: join(LAB, "fixtures/shortlink-ref"), DEVFLOW_PLUGIN_DIR: "/nao-usado" };
  try {
    const out = execFileSync("node", [join(LAB, "scripts/campaign.mjs"), "--arms", "A-baseline,B-routed", "--name", name, "--claude-bin", join(LAB, "tests/e2e/fake-claude.mjs"),
      "--superpowers-dir", "/nao-usado-sp", "--projects-root", projects, "--runs", mkdtempSync(join(tmpdir(), "lab-runs-")), "--no-report", "--no-ensure"], { env, encoding: "utf8" });
    const md = readFileSync(out.trim().split("\n").at(-1), "utf8");
    assert.match(md, /\| INV-OFF \| HELD \| N\/A \|/);
    assert.match(md, /\| INV-CEIL \| HELD \| HELD \|/);
    assert.match(md, /\| INV-SESS \| N\/A \| HELD \|/);
    assert.match(md, /\| INV-PHASE-SYNC \| N\/A \| HELD \|/);
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
// Roda braços em sequência (nunca em paralelo — spec §10), confere o plugin antes/depois e gera o scorecard.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensurePlugin, pluginDirFor, isPristine } from "../lib/plugin.mjs";

const LAB = resolve(new URL("..", import.meta.url).pathname);
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const die = (msg, code = 2) => { console.error(`campaign: ${msg}`); process.exit(code); };
const arms = (opt("--arms") ?? "").split(",").filter(Boolean);
if (!arms.length || arms.some((x) => !/^[A-Za-z0-9-]{1,32}$/.test(x))) die("uso: campaign.mjs --arms A-baseline,B-routed [--name N] [--ref R] ...");
const name = opt("--name", `${new Date().toISOString().slice(0, 10)}-${arms.join("+")}`);
if (!/^[A-Za-z0-9+._-]{1,80}$/.test(name)) die("--name inválido");
const testMode = a.includes("--no-ensure");
const pluginDir = testMode ? pluginDirFor(opt("--ref", "v3.7.0")) : ensurePlugin({ ref: opt("--ref", "v3.7.0") });
const pristine = () => testMode || isPristine(pluginDir);
if (!pristine()) die("plugin sob teste com alterações locais; recrie o clone", 4);
const pass = (k) => (opt(k) !== undefined ? [k, opt(k)] : []);
const node = (script, args) => spawnSync("node", [join(LAB, "scripts", script), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const runDirs = [];
for (const id of arms) {
  const r = node("run-arm.mjs", ["--arm", join(LAB, "arms", `${id}.json`), "--plugin-dir", pluginDir, ...pass("--runs"), ...pass("--claude-bin"),
    ...pass("--superpowers-dir"), ...pass("--max-resumes"), ...pass("--timeout-min")]);
  const runDir = (r.stdout ?? "").trim().split("\n").at(-1);
  if (!runDir || !existsSync(join(runDir, "run.json"))) die(`braço ${id}: rodada não criada (saída ${r.status})`, 5);
  if (r.status === 3) console.error(`campaign: braço ${id} reprovado no preflight; segue para o scorecard como incompleto`);
  const c = node("collect.mjs", ["--run", runDir, "--plugin-dir", pluginDir, ...pass("--projects-root"), ...(a.includes("--no-report") ? ["--no-report"] : [])]);
  if (c.status !== 0) die(`braço ${id}: coleta falhou`, 5);
  runDirs.push(runDir);
  if (!pristine()) die(`plugin sob teste alterado durante o braço ${id}; campanha abortada`, 4);
}
const s = node("score.mjs", ["--out", join(LAB, "results", name), ...runDirs]);
if (s.status !== 0) die("score falhou", 5);
process.stdout.write(s.stdout);
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/e2e/campaign.test.mjs` → PASS

- [ ] **Step 5: Escrever a documentação**

`README.md`: objetivo (Q1–Q4 da spec §1) e hipóteses H1/H2; pré-requisitos (Claude Code ≥ 2.1.293 logado, Node ≥ 22, repo `devflow` irmão com a tag `v3.7.0`, superpowers no cache do Claude Code); comandos (`bash tests/run-unit.sh`, `run-integration.sh`, `run-e2e.sh`, `run-lint.sh`, `node scripts/campaign.mjs --arms A-baseline,B-routed`); mapa de diretórios; regras: "capturar, não resolver", "só números em `results/`", "nunca em paralelo", "rodadas em tmpdir"; isolamento L12 e o **risco residual** (não é sandbox; caminhos absolutos seguem legíveis).

`runbooks/campaign.md`: (1) contrato verde (`run-unit`, `run-integration`, `run-e2e`, `run-lint`); (2) custo declarado: dois PREVC completos na cota da assinatura, horas cada; (3) disparo em background: `node scripts/campaign.mjs --arms A-baseline,B-routed`; (4) acompanhamento: `<runs>/<id>/stream-<n>.jsonl` cresce, `prevc-<n>.json` aparece a cada invocação; (5) rodada `incomplete` (cota, preflight, `killed`, `max-resumes`): não retomar à mão; registrar como achado; (6) ler o scorecard e registrar os `MISS` em `results/<nome>/findings.md` com a evidência e a hipótese (H1/H2/nova); (7) braços C e D opcionais; (8) isolamento forte opcional: wrapper `--claude-bin` com `bwrap --ro-bind / / --bind <runDir> <runDir> --tmpfs $HOME/.ssh …` (testar antes; não é o padrão).

`runbooks/refine.md`: hipótese → braço novo `arms/B2-<hipótese>.json` copiado de `B-routed` com `models.overrides` → `--arms B2-<hipótese>` → comparar com o B anterior (mesmo brief, mesma versão do Claude Code) → se confirma, abrir workflow no repo `devflow` propondo a mudança no `assets/model-routing/routes.json` (ou no adaptador, se o achado for H1/H2) e reavaliar com `--ref <branch>`.

- [ ] **Step 6: Rodar o contrato inteiro**

Run: `bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-e2e.sh && bash tests/run-lint.sh`
Expected: tudo PASS (achados L1 marcados como `todo` não reprovam)

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(lab): campanha com integridade do plugin, runbooks e README"`

---

## Emendas da fase E

Desvios do código transcrito acima, decididos durante a execução (o código no repo do laboratório prevalece):

- **Task 7 (`lib/invariants.mjs`, commit `15b5f51`)** — a revisão crítica do implementador (tier capable) achou 5 falsos HELD e 3 falsos MISS, corrigidos com 13 testes novos (59/59 na suíte):
  - INV-CEIL: modelo sem família conhecida ou esforço fora da escala viram violação.
  - INV-PHASE-SYNC: spawn sem `phase` no ledger com fase real conhecida conta como divergência (`nulo→<fase>`).
  - INV-SUB: tier desconhecido é sempre MISS; `project` (override do braço) entra em `JUSTIFIED`; subagente sem fase real fica fora.
  - INV-EFF: mensagem sem fase real e passo com esforço nulo ficam fora.
  - INV-SESS: evidência traz as trocas esperadas por invocação (`expectedSessionSwitches`).
  - INV-OFF e "opt-in duplo": qualquer rastro de ledger (linhas, violações ou arquivos) reprova.
  - Cobertura pelo sinal do GABARITO §5: "sessão por fase" exige o tier esperado numa fase cujo tier ≠ teto; "subagente por agente" exige subagente com mensagens; "tier da task do plano" exige mensagens e tier ∈ `planTiers`; "esforço por passo" exige braço roteado e tipo roteável; "ledger" exige zero violações.

- **Tasks 10 e 11 — endurecimento após revisão pesada** (security-auditor na S10 e revisão do implementador na S11):
  - `9436f81` (aceitação): `stop()` com SIGKILL após 2 s; `--test-timeout=30000`; `AbortSignal.timeout` no ping (500 ms) e em `req` (10 s); `killSignal: "SIGKILL"` na CLI; `parseTap` exportado com `EXPECTED_TOTAL = 13` (último resumo; `total-inesperado`; contagem parcial sem resumo); dados e cwd dentro do `box`, apagado no `close`.
  - `8fe00d9` (driver/isolamento): cache do plugin em `${XDG_CACHE_HOME:-~/.cache}/devflow-routing-lab/` (fora do laboratório — de `LAB/.cache`, `$CLAUDE_PLUGIN_ROOT/../..` alcançava a referência e a suíte oculta); `run-arm` recusa `--plugin-dir`/`--superpowers-dir` dentro do laboratório; **INV-ISOL** (nova, após INV-PREVC, todos os braços): `countRefs` conta no texto bruto dos transcripts referências ao caminho do laboratório e a `shortlink-ref` (só o número) e `settingsHashes` detecta `.claude/settings*.json` alterados entre invocações; SIGINT/SIGTERM/SIGHUP matam o grupo e gravam `interrupted` (saída 130); grupo morto também no `close`; `--mcp-config` aponta para cópia em `runDir/mcp.json`; `git` do workspace com timeout e `core.fsmonitor=false`.
- **Task 12 (`938dfa9`)**: `lib/integrity.mjs` (`suiteDigest` de `acceptance/**`, `fixtures/**`, `lib/accept.mjs`); a campanha confere o digest antes e depois de cada braço (e depois da coleta) e aborta com 4 se mudar; agulha "GABARITO" removida do INV-ISOL (aparece em docs do próprio plugin); `--runs` comparado também por realpath do ancestral existente; `GABARITO.md` com a linha do INV-ISOL.
- **Contrato final do laboratório:** unit 91, e2e 19, L1 18 (0 achados L1), lint limpo.

## Fase V deste workflow (não é task de E)

1. Contrato completo do laboratório verde (Step 6 da Task 12).
2. Revisão de segurança pesada de `run-arm.mjs`, `collect.mjs`, `lib/accept.mjs` e `lib/safe-read.mjs` (`security-auditor`).
3. **Campanha real:** `node scripts/campaign.mjs --arms A-baseline,B-routed` em background, pelo operador ou pela sessão orquestradora; ao fim, `results/<data>-A-baseline+B-routed/scorecard.md` revisado e os `MISS` registrados em `findings.md` com a hipótese correspondente. Achados do DevFlow viram backlog no repo `devflow`; não se corrigem nesta rodada.
