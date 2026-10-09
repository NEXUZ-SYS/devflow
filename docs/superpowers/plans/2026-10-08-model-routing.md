# Roteamento de modelos do DevFlow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** model-routing (a abrir) | **Scale:** LARGE | **Phase:** P→R

**Goal:** Escolher modelo e esforço da sessão principal (por fase/skill) e dos subagentes (por agente/fase/task), com teto na escolha do usuário, escalada por rubrica e medição, em três adaptadores (mod, hook clássico, omp).

**Architecture:** Libs puras (`model-routing`, `models-config`, `escalation`, `routing-ledger`, `routing-report`, `router-core`) sem `node:*`, importáveis pelo mod. Três adaptadores finos consomem as libs: o mod (`hooks/router.mjs`, function hooks), o fallback clássico (`hooks/pre-tool-use-agent`) e o enrich do omp. Um CLI (`scripts/model-route.mjs`) serve às skills (resolve/escalate/report).

**Tech Stack:** Node ≥ 20 (ESM `.mjs`, `node:test`), bash, function hooks do Claude Code 2.1.294 (`claude plugin test`/`validate`), subset YAML de `scripts/lib/frontmatter.mjs`.

**Agents:** backend-specialist (libs, CLI, mod, omp), security-auditor (mod, hook clássico, containment, redação), test-writer (propriedades, kit de mods, e2e), architect (ADR, gate R), documentation-writer (onboarding, guias).

**Spec:** `docs/superpowers/specs/2026-10-08-model-routing-design.md`

```yaml
requiredSignals: [unit, integration, e2e, lint]
```

## Global Constraints

- Libs em `scripts/lib/model-routing.mjs`, `models-config.mjs`, `yaml-block.mjs`, `escalation.mjs`, `routing-ledger.mjs`, `routing-report.mjs`, `router-core.mjs` **não importam `node:*`** nem usam `require(` — o mod roda sem Node. Cada uma tem teste de pureza.
- Tiers: `cheap < standard < capable < top`. Tradução Claude Code: `haiku/sonnet/opus/fable`. omp: `pi/smol/default/pi/slow/pi/plan`. Esforço: `low < medium < high < xhigh < max`.
- Teto (D5): nada roda acima do modelo e do esforço escolhidos pelo usuário. Teto ilegível → não roteia (comportamento de hoje).
- Opt-in (D6): sem `models.enabled: true` no `.context/.devflow.yaml`, nenhum adaptador altera nada. `agents/*.md` **não** ganham `model:`.
- Parser único (ADR-011): `models:` só é lido por `readModels` (`scripts/lib/models-config.mjs`), reexportado por `scripts/lib/devflow-config.mjs`.
- Falha → comportamento de hoje. Nenhum adaptador nega (`deny`/`block`) um despacho.
- Ledger: chaves por allowlist; nunca prompt, resposta ou texto de erro; fora do repositório (`$XDG_DATA_HOME` ou `~/.local/share` + `/devflow-model-routing/`).
- Testes destrutivos/escritores rodam em `mkdtemp` (nunca mutam diretório versionado).
- **Ajuste à spec:** a tabela do plugin é `assets/model-routing/routes.json` (não `.yaml`): as chaves de skill têm `:` (`superpowers:brainstorming`), que o subset YAML não aceita como chave, e o mod a lê com `JSON.parse` sem parser extra. Overrides de projeto no `.devflow.yaml` usam **estilo bloco** (o subset não lê mapas inline `{ ... }`).
- Execução: este plano roda depois da abertura do PREVC formal, numa branch `feature/model-routing`. Os passos "Commit" valem para essa branch; nesta fase P nada é commitado.
- Os runners (`tests/run-*.sh`) só enxergam arquivos rastreados pelo git (`git ls-files`); durante a task, rode cada teste pelo caminho (`node --test <arquivo>`).

## Review Focus

1. **Sessão já em `sonnet` + architect (default `capable`)** → o subagente roda em `sonnet` (teto), nunca em `opus`. Teste na Task 3 (`resolveSubagentRoute` com teto `standard`) e na Task 7 (`onSpawn` usa o modelo original do usuário).
2. **Sessão roteada para baixo na fase E** → subagentes despachados nessa fase ainda usam como teto o modelo **original** do usuário, não o roteado. Teste na Task 7.
3. **`/model` trocado pelo usuário no meio da sessão** → vira o novo teto na hora; nada fica preso no modelo antigo. Teste na Task 7 (`onSessionStep` com `model` diferente do registrado).
4. **`.devflow.yaml` com `models:` malformado, inline `{}` ou tier inexistente** → roteamento desligado ou entrada ignorada, nunca exceção. Teste na Task 2.
5. **`prevc.json` hostil (fase fora da allowlist, JSON inválido, conteúdo de outro arquivo)** → sem fase, sessão sem troca. Teste na Task 1 (`phaseFromPrevcJson`) e Task 9 (symlink no hook clássico).

---

## Gate da fase R — sondas obrigatórias (spec §11)

Antes de qualquer task, o revisor da fase R roda as sondas abaixo com um mod descartável em
`~/.claude/dev-mods/<sessão>/probe-routing/` (fora do repo) e registra o resultado na seção
"Revisão R" do plano. Cada resultado tem consequência definida:

| # | Sonda | Se SIM | Se NÃO |
|---|---|---|---|
| R-1 | Um `hooks/hooks.json` com `"hooks": {...}` **e** `"modules": ["./router.mjs"]` carrega os dois (`claude plugin validate .` + sessão com `--plugin-dir`) | Task 8 como escrita | Task 8 cria o plugin irmão `mods/devflow-router/` (manifest próprio) e um passo de build copia as libs puras para `mods/devflow-router/lib/` com teste de byte-match |
| R-2 | Plugin instalado por marketplace precisa de `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` | Onboarding (Task 12) exige a variável; fallback clássico detecta por ela | Fallback detecta o mod por marcador em `$.store` escrito no `session.start` e lido pelo hook clássico via arquivo em `$XDG_STATE_HOME` — replanejar Task 9 Step 3 |
| R-3 | `next({...e, model: "sonnet"})` no `turn.step` da sessão principal é o modelo que responde (`turn.complete.usage.model`) e o engine não reverte | Task 7/8 como escritas | Camada de sessão fica só com esforço (D12) — remover `model` de `onSessionStep` |
| R-4 | `skill.prompt` dispara para `devflow:*` e `superpowers:*` invocadas pela ferramenta Skill, com nome qualificado | Como escrito | Esforço da sessão por skill cai para o base da fase |
| R-5 | `updatedInput` do `PreToolUse` vale sem `permissionDecision: allow`; matcher `Agent` ou `Task` | Task 9 como escrita | Task 9 só emite quando `permission_mode` ∈ {`bypassPermissions`, `acceptEdits`} com `permissionDecision: "allow"` |
| R-6 | `$.fs.write` fora de `$.plugin.root` (em `~/.local/share/...`) funciona; `$.model.complete({model:"haiku"})` responde | Como escrito | Ledger do mod desligado (relatório usa transcripts); escalada no meio cai para "manter tier" |
| R-7 | Outro roteador de sessão é detectável (`$.plugin.list()` ou equivalente nos tipos) | Task 8 desliga a camada de sessão ao detectar | Onboarding avisa; detecção vira follow-up |
| R-8 | Versão mínima com `agent.spawn.parentModel`, `skill.prompt`, `claude plugin test` | Registrar a versão na ADR e no doctor (Task 12) | — |

---

## Task 1: Núcleo de tiers e esforço (lib pura)

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** unit

**Files:**
- Create: `scripts/lib/model-routing.mjs`
- Test: `tests/lib/model-routing.test.mjs`

**Interfaces:**
- Produces: `TIERS`, `EFFORTS`, `PHASES`, `tierOf(value) → tier|null`, `toAlias(tier)`, `toRole(tier)`, `nextTier(tier)`, `minTier(a,b)`, `capAtCeiling(tier, ceilingTier, maxTier?) → tier|null`, `capEffort(effort, ceilingEffort) → effort|null`, `stepEffort(base, failureStreak, ceilingEffort) → effort|null`, `phaseFromPrevcJson(text) → phase|null`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/model-routing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../../scripts/lib/model-routing.mjs";

test("tierOf reconhece alias, id completo, role do omp e o próprio tier", () => {
  assert.equal(R.tierOf("haiku"), "cheap");
  assert.equal(R.tierOf("claude-haiku-4-5-20251001"), "cheap");
  assert.equal(R.tierOf("sonnet"), "standard");
  assert.equal(R.tierOf("claude-sonnet-5-5"), "standard");
  assert.equal(R.tierOf("claude-opus-5-5"), "capable");
  assert.equal(R.tierOf("opusplan"), "capable");
  assert.equal(R.tierOf("fable"), "top");
  assert.equal(R.tierOf("claude-fable-5-1"), "top");
  assert.equal(R.tierOf("pi/slow"), "capable");
  assert.equal(R.tierOf("default"), "standard");
  assert.equal(R.tierOf("standard"), "standard");
});

test("tierOf devolve null para o que não conhece", () => {
  for (const v of ["best", "", "   ", undefined, null, 42, "claude-mythos-5", "gpt-5"]) {
    assert.equal(R.tierOf(v), null, String(v));
  }
});

test("toAlias e toRole traduzem cada tier e recusam o resto", () => {
  assert.deepEqual(R.TIERS.map(R.toAlias), ["haiku", "sonnet", "opus", "fable"]);
  assert.deepEqual(R.TIERS.map(R.toRole), ["pi/smol", "default", "pi/slow", "pi/plan"]);
  assert.equal(R.toAlias("x"), null);
});

test("nextTier sobe um degrau e para no topo", () => {
  assert.equal(R.nextTier("cheap"), "standard");
  assert.equal(R.nextTier("capable"), "top");
  assert.equal(R.nextTier("top"), "top");
  assert.equal(R.nextTier("x"), null);
});

test("capAtCeiling nunca passa do teto nem do maxTier", () => {
  assert.equal(R.capAtCeiling("capable", "standard"), "standard");
  assert.equal(R.capAtCeiling("cheap", "capable"), "cheap");
  assert.equal(R.capAtCeiling("top", "top", "capable"), "capable");
  assert.equal(R.capAtCeiling("standard", "capable", "cheap"), "cheap");
  assert.equal(R.capAtCeiling("standard", "capable", "lixo"), "standard");
});

test("capAtCeiling com teto ou tier ilegível devolve null (não roteia)", () => {
  assert.equal(R.capAtCeiling("standard", null), null);
  assert.equal(R.capAtCeiling("standard", "lixo"), null);
  assert.equal(R.capAtCeiling("lixo", "capable"), null);
});

test("capEffort limita ao teto e não mexe quando o teto é desconhecido", () => {
  assert.equal(R.capEffort("xhigh", "high"), "high");
  assert.equal(R.capEffort("low", "xhigh"), "low");
  assert.equal(R.capEffort("high", undefined), null);
  assert.equal(R.capEffort("high", 3), null);
  assert.equal(R.capEffort("turbo", "high"), null);
});

test("stepEffort sobe um degrau após falha, volta ao base no sucesso, respeita o teto", () => {
  assert.equal(R.stepEffort("medium", 0, "xhigh"), "medium");
  assert.equal(R.stepEffort("medium", 1, "xhigh"), "high");
  assert.equal(R.stepEffort("medium", 5, "xhigh"), "high");
  assert.equal(R.stepEffort("high", 1, "high"), "high");
  assert.equal(R.stepEffort("max", 1, "max"), "max");
});

test("phaseFromPrevcJson só aceita P/R/E/V/C", () => {
  const ok = JSON.stringify({ status: { project: { current_phase: "E" } } });
  assert.equal(R.phaseFromPrevcJson(ok), "E");
  assert.equal(R.phaseFromPrevcJson(JSON.stringify({ status: { project: { current_phase: "rm -rf" } } })), null);
  assert.equal(R.phaseFromPrevcJson("root:x:0:0:root:/root:/bin/bash"), null);
  assert.equal(R.phaseFromPrevcJson(""), null);
  assert.equal(R.phaseFromPrevcJson(undefined), null);
});

test("módulo é puro: sem node:* e sem require", () => {
  const src = readFileSync(new URL("../../scripts/lib/model-routing.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\s+["']node:/);
  assert.doesNotMatch(src, /\brequire\s*\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/model-routing.test.mjs`
Expected: FAIL com `Cannot find module '.../scripts/lib/model-routing.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/model-routing.mjs — núcleo do roteamento de modelos do DevFlow
// (spec docs/superpowers/specs/2026-10-08-model-routing-design.md).
// PURO: sem import de node:* — o mod (function hooks, sem Node) importa este arquivo.

export const TIERS = Object.freeze(["cheap", "standard", "capable", "top"]);
export const EFFORTS = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
export const PHASES = Object.freeze(["P", "R", "E", "V", "C"]);

const ALIAS = Object.freeze({ cheap: "haiku", standard: "sonnet", capable: "opus", top: "fable" });
const ROLE = Object.freeze({ cheap: "pi/smol", standard: "default", capable: "pi/slow", top: "pi/plan" });
const FAMILY = [
  [/(^|[^a-z])haiku/, "cheap"],
  [/(^|[^a-z])sonnet/, "standard"],
  [/(^|[^a-z])opus/, "capable"],
  [/(^|[^a-z])fable/, "top"],
];

const rank = (t) => TIERS.indexOf(t);
const erank = (e) => EFFORTS.indexOf(e);

export function tierOf(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  if (!s) return null;
  if (TIERS.includes(s)) return s;
  for (const [tier, role] of Object.entries(ROLE)) if (role === s) return tier;
  for (const [re, tier] of FAMILY) if (re.test(s)) return tier;
  return null;
}

export const toAlias = (tier) => ALIAS[tier] ?? null;
export const toRole = (tier) => ROLE[tier] ?? null;

export function nextTier(tier) {
  const i = rank(tier);
  return i < 0 ? null : TIERS[Math.min(i + 1, TIERS.length - 1)];
}

export function minTier(a, b) {
  if (rank(a) < 0) return rank(b) < 0 ? null : b;
  if (rank(b) < 0) return a;
  return rank(a) <= rank(b) ? a : b;
}

// Teto (D5): o resultado nunca passa do teto nem do maxTier. Teto ilegível → null (não roteia).
export function capAtCeiling(tier, ceilingTier, maxTierCfg = null) {
  if (rank(tier) < 0 || rank(ceilingTier) < 0) return null;
  let t = minTier(tier, ceilingTier);
  if (rank(maxTierCfg) >= 0) t = minTier(t, maxTierCfg);
  return t;
}

// Teto de esforço desconhecido (ausente ou numérico) → null: o adaptador não mexe no esforço.
export function capEffort(effort, ceilingEffort) {
  if (erank(effort) < 0 || erank(ceilingEffort) < 0) return null;
  return erank(effort) <= erank(ceilingEffort) ? effort : ceilingEffort;
}

// D13: falha de ferramenta sobe um degrau no passo seguinte; sucesso volta ao base.
export function stepEffort(base, failureStreak, ceilingEffort) {
  if (erank(base) < 0) return null;
  const up = failureStreak > 0 ? EFFORTS[Math.min(erank(base) + 1, EFFORTS.length - 1)] : base;
  return capEffort(up, ceilingEffort);
}

// prevc.json não é confiável (ADR-014): só a fase, por allowlist.
export function phaseFromPrevcJson(text) {
  if (typeof text !== "string" || !text) return null;
  try {
    const p = JSON.parse(text)?.status?.project?.current_phase;
    return PHASES.includes(p) ? p : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/model-routing.test.mjs`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/model-routing.mjs tests/lib/model-routing.test.mjs
git commit -m "feat(model-routing): núcleo puro de tiers, teto e esforço"
```

---

## Task 2: Bloco `models:` do `.devflow.yaml` (parser único, puro)

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `scripts/lib/yaml-block.mjs`, `scripts/lib/models-config.mjs`
- Modify: `scripts/lib/devflow-config.mjs` (trocar a `namedBlock`/`normalizeNewlines` locais pelo import; reexportar `readModels`; ramo CLI `read-models`)
- Test: `tests/lib/models-config.test.mjs`

**Interfaces:**
- Consumes: `TIERS`, `PHASES` (Task 1); `parseYaml` de `scripts/lib/frontmatter.mjs`.
- Produces: `namedBlock(text, name) → string[]`, `dedentBlock(lines) → string`; `readModels(src) → ModelsConfig` com a forma:
  `{ enabled, session, subagents, maxTier, ledger, overrides: { agents: {[agente]: tier}, phases: {[fase]: {[agente]: tier}}, session: { phases: {[fase]: tier|"ceiling"} } }, midRun: { failureStreak }, thresholds: { capability, claimsDone } }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/models-config.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readModels } from "../../scripts/lib/models-config.mjs";
import * as cfg from "../../scripts/lib/devflow-config.mjs";

const FULL = `git:
  strategy: branch-flow
models:
  enabled: true   # liga
  session: false
  maxTier: capable
  ledger: true
  overrides:
    agents:
      documentation-writer:
        tier: standard
      code-reviewer:
        tier: ultra
    phases:
      E:
        general-purpose:
          tier: cheap
      Z:
        general-purpose:
          tier: cheap
    session:
      phases:
        E: capable
        C: ceiling
  midRun:
    failureStreak: 4
  thresholds:
    capability: 0.7
    claimsDone: 2
other: 1
`;

test("ausência do bloco = tudo desligado com defaults", () => {
  const m = readModels("git:\n  strategy: x\n");
  assert.equal(m.enabled, false);
  assert.equal(m.session, true);
  assert.equal(m.subagents, true);
  assert.equal(m.ledger, false);
  assert.equal(m.maxTier, null);
  assert.deepEqual(m.midRun, { failureStreak: 3 });
  assert.deepEqual(m.thresholds, { capability: 0.6, claimsDone: 0.8 });
});

test("lê o bloco completo, com comentário inline e validação por entrada", () => {
  const m = readModels(FULL);
  assert.equal(m.enabled, true);
  assert.equal(m.session, false);
  assert.equal(m.maxTier, "capable");
  assert.equal(m.ledger, true);
  assert.deepEqual(m.overrides.agents, { "documentation-writer": "standard" });
  assert.deepEqual(m.overrides.phases, { E: { "general-purpose": "cheap" } });
  assert.deepEqual(m.overrides.session.phases, { E: "capable", C: "ceiling" });
  assert.equal(m.midRun.failureStreak, 4);
  assert.equal(m.thresholds.capability, 0.7);
  assert.equal(m.thresholds.claimsDone, 0.8, "fora de [0,1] mantém o default");
});

test("valores inválidos nunca ligam o roteamento nem lançam", () => {
  for (const src of [
    "models:\n  enabled: yes\n",
    "models:\n  enabled: true\n  maxTier: ultra\n  overrides: { agents: { x: { tier: cheap } } }\n",
    "models:\n  enabled: *ref\n",
    "models:\n",
    null,
    42,
    "models:\n  enabled: true\n" + "x".repeat(300 * 1024),
  ]) {
    const m = readModels(src);
    assert.equal(typeof m.enabled, "boolean");
    if (src === "models:\n  enabled: yes\n") assert.equal(m.enabled, false);
    if (typeof src === "string" && src.includes("ultra")) assert.equal(m.maxTier, null);
  }
});

test("devflow-config reexporta readModels e expõe read-models no CLI", () => {
  assert.equal(cfg.readModels, readModels);
  const dir = mkdtempSync(join(tmpdir(), "models-cfg-"));
  const p = join(dir, ".devflow.yaml");
  writeFileSync(p, FULL);
  const out = execFileSync("node", ["scripts/lib/devflow-config.mjs", "read-models", p], { encoding: "utf8" });
  assert.equal(JSON.parse(out).maxTier, "capable");
});

test("yaml-block e models-config são puros", () => {
  for (const f of ["yaml-block.mjs", "models-config.mjs"]) {
    const src = readFileSync(new URL(`../../scripts/lib/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /from\s+["']node:/, f);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/models-config.test.mjs`
Expected: FAIL com `Cannot find module '.../scripts/lib/models-config.mjs'`

- [ ] **Step 3: Write `scripts/lib/yaml-block.mjs`**

```js
// scripts/lib/yaml-block.mjs — extração de bloco de topo do .devflow.yaml. PURO.
// Única implementação (ADR-011): devflow-config.mjs e models-config.mjs importam daqui.

export function normalizeNewlines(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// Linhas DENTRO do bloco `<name>:` (sem valor) até a 1ª linha não-indentada não-vazia.
export function namedBlock(text, name) {
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = new RegExp("^" + esc + ":\\s*$");
  const block = [];
  let inBlock = false;
  for (const line of normalizeNewlines(text).split("\n")) {
    if (!inBlock) {
      if (head.test(line)) inBlock = true;
      continue;
    }
    if (line.trim() !== "" && !/^\s/.test(line)) break;
    block.push(line);
  }
  return block;
}

export function dedentBlock(lines) {
  const widths = lines.filter((l) => l.trim() !== "").map((l) => l.match(/^(\s*)/)[1].length);
  const ind = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => l.slice(Math.min(ind, l.length - l.trimStart().length))).join("\n");
}
```

- [ ] **Step 4: Trocar a cópia local em `devflow-config.mjs`**

Em `scripts/lib/devflow-config.mjs`, apague as funções locais `normalizeNewlines` e `namedBlock` e acrescente aos imports do topo:

```js
import { namedBlock, normalizeNewlines } from "./yaml-block.mjs";
export { readModels } from "./models-config.mjs";
import { readModels } from "./models-config.mjs";
```

No `main(argv)`, antes do `else` final que imprime o `uso:`, acrescente:

```js
  } else if (argv[0] === "read-models") {
    const text = readTextOrNull(argv[1]);
    process.stdout.write(JSON.stringify(readModels(text ?? "")) + "\n");
```

e inclua `|read-models` na string de `uso:`.

- [ ] **Step 5: Write `scripts/lib/models-config.mjs`**

```js
// scripts/lib/models-config.mjs — leitor ÚNICO do bloco `models:` do .devflow.yaml (ADR-011).
// PURO (o mod importa). Nunca lança: qualquer problema → roteamento desligado ou entrada ignorada.
import { namedBlock, dedentBlock } from "./yaml-block.mjs";
import { parseYaml } from "./frontmatter.mjs";
import { TIERS, PHASES } from "./model-routing.mjs";

const MAX_BYTES = 256 * 1024;
const AGENT_RE = /^[A-Za-z0-9_-]+$/;

function defaults() {
  return {
    enabled: false,
    session: true,
    subagents: true,
    maxTier: null,
    ledger: false,
    overrides: { agents: {}, phases: {}, session: { phases: {} } },
    midRun: { failureStreak: 3 },
    thresholds: { capability: 0.6, claimsDone: 0.8 },
  };
}

const clean = (v) => (typeof v === "string" ? v.replace(/\s+#.*$/, "").trim() : v);
const isTrue = (v) => clean(v) === true || clean(v) === "true";
const isFalse = (v) => clean(v) === false || clean(v) === "false";
const asTier = (v) => (TIERS.includes(clean(v)) ? clean(v) : null);
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function readModels(src) {
  const out = defaults();
  if (typeof src !== "string" || src.length > MAX_BYTES) return out;
  let data;
  try {
    const block = namedBlock(src, "models");
    if (!block.some((l) => l.trim() !== "")) return out;
    data = parseYaml(dedentBlock(block));
  } catch {
    return out;
  }
  if (!isMap(data)) return out;

  out.enabled = isTrue(data.enabled);
  if (data.session !== undefined) out.session = !isFalse(data.session);
  if (data.subagents !== undefined) out.subagents = !isFalse(data.subagents);
  out.ledger = isTrue(data.ledger);
  out.maxTier = asTier(data.maxTier);

  const fs = Number(clean(data.midRun?.failureStreak));
  if (Number.isInteger(fs) && fs >= 1 && fs <= 10) out.midRun.failureStreak = fs;
  for (const k of ["capability", "claimsDone"]) {
    const n = Number(clean(data.thresholds?.[k]));
    if (Number.isFinite(n) && n >= 0 && n <= 1) out.thresholds[k] = n;
  }

  const ov = isMap(data.overrides) ? data.overrides : {};
  for (const [agent, v] of Object.entries(isMap(ov.agents) ? ov.agents : {})) {
    const t = asTier(v?.tier);
    if (AGENT_RE.test(agent) && t) out.overrides.agents[agent] = t;
  }
  for (const [ph, m] of Object.entries(isMap(ov.phases) ? ov.phases : {})) {
    if (!PHASES.includes(ph) || !isMap(m)) continue;
    for (const [agent, v] of Object.entries(m)) {
      const t = asTier(v?.tier);
      if (AGENT_RE.test(agent) && t) (out.overrides.phases[ph] ??= {})[agent] = t;
    }
  }
  const sp = isMap(ov.session) && isMap(ov.session.phases) ? ov.session.phases : {};
  for (const [ph, v] of Object.entries(sp)) {
    const t = clean(v);
    if (PHASES.includes(ph) && (TIERS.includes(t) || t === "ceiling")) out.overrides.session.phases[ph] = t;
  }
  return out;
}
```

- [ ] **Step 5b: Atualizar a allowlist do teste de pureza do parser**

`tests/lib/devflow-config-pure.test.mjs` trava os imports do `devflow-config.mjs` (sem isso, o Step 6 falha com `import inesperado: ./yaml-block.mjs`). Troque a linha do `ALLOWED` por:

```js
  // yaml-block.mjs e models-config.mjs (roteamento de modelos): puros, sem node:* — travados por
  // tests/lib/models-config.test.mjs ("yaml-block e models-config são puros").
  const ALLOWED = new Set(["node:fs", "./frontmatter.mjs", "./safe-read.mjs", "./yaml-block.mjs", "./models-config.mjs"]);
```

- [ ] **Step 6: Run tests to verify they pass (incluindo os do parser existente)**

Run: `node --test tests/lib/models-config.test.mjs && node --test $(git ls-files 'tests/**/*devflow-config*' | grep -E '\.mjs$')`
Expected: PASS em todos (o refactor do `namedBlock` não muda comportamento).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/yaml-block.mjs scripts/lib/models-config.mjs scripts/lib/devflow-config.mjs tests/lib/models-config.test.mjs tests/lib/devflow-config-pure.test.mjs
git commit -m "feat(model-routing): bloco models: no parser único do .devflow.yaml"
```

---

## Task 3: Tabela do plugin e resolvedores (sessão e subagente)

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `assets/model-routing/routes.json`
- Modify: `scripts/lib/model-routing.mjs` (acrescentar `resolveSubagentRoute`, `resolveSessionRoute`, `agentName`)
- Test: `tests/lib/model-routing-resolve.test.mjs`

**Interfaces:**
- Consumes: Task 1; `ModelsConfig` (Task 2).
- Produces:
  - `agentName(agentType) → string` (tira o prefixo `devflow:`).
  - `resolveSubagentRoute({ table, config, agentType, phase, skill, taskTier, explicitModel, ceilingModel, ceilingEffort }) → null | { tier, model, effort, source, ceiling }` — `source ∈ plan|project|skill|phase|agent|explicit|inherit`.
  - `resolveSessionRoute({ table, config, phase, skill, userModel, userEffort }) → null | { tier, model, effort, source }`.
  - Precedência de subagente (D3, com override de projeto vencendo o default do plugin na mesma camada): `explicit` → `plan` (taskTier) → projeto por fase → skill do plugin → fase do plugin → projeto por agente → agente do plugin → `inherit` (teto).
  - Quando o tier final é igual ao teto, `model` é o **id exato** do usuário (não o alias), para não trocar de versão.

- [ ] **Step 1: Write `assets/model-routing/routes.json`**

```json
{
  "version": 1,
  "routable": ["general-purpose"],
  "routablePrefix": "devflow:",
  "effortByTier": { "cheap": "low", "standard": "medium", "capable": "high", "top": "high" },
  "agents": {
    "architect": { "tier": "capable", "effort": "high" },
    "security-auditor": { "tier": "capable", "effort": "high" },
    "bug-fixer": { "tier": "standard", "effort": "high" },
    "performance-optimizer": { "tier": "standard", "effort": "high" },
    "product-manager": { "tier": "standard", "effort": "high" },
    "code-reviewer": { "tier": "standard", "effort": "medium" },
    "feature-developer": { "tier": "standard", "effort": "medium" },
    "test-writer": { "tier": "standard", "effort": "medium" },
    "refactoring-specialist": { "tier": "standard", "effort": "medium" },
    "backend-specialist": { "tier": "standard", "effort": "medium" },
    "frontend-specialist": { "tier": "standard", "effort": "medium" },
    "database-specialist": { "tier": "standard", "effort": "medium" },
    "devops-specialist": { "tier": "standard", "effort": "medium" },
    "mobile-specialist": { "tier": "standard", "effort": "medium" },
    "business-context": { "tier": "standard", "effort": "medium" },
    "product-context": { "tier": "standard", "effort": "medium" },
    "operations-context": { "tier": "standard", "effort": "medium" },
    "engineering-context": { "tier": "standard", "effort": "medium" },
    "documentation-writer": { "tier": "cheap", "effort": "low" },
    "memory-specialist": { "tier": "cheap", "effort": "low" },
    "general-purpose": { "tier": "standard" }
  },
  "phases": {
    "P": { "general-purpose": "standard" },
    "R": { "general-purpose": "standard", "code-reviewer": "capable" },
    "E": { "general-purpose": "standard" },
    "V": { "general-purpose": "standard" },
    "C": { "general-purpose": "cheap", "documentation-writer": "cheap" }
  },
  "skills": {
    "final-review": { "*": "capable" }
  },
  "session": {
    "phases": { "P": "ceiling", "R": "ceiling", "E": "standard", "V": "standard", "C": "standard" },
    "skills": {
      "superpowers:brainstorming": "ceiling",
      "superpowers:writing-plans": "ceiling",
      "superpowers:systematic-debugging": "ceiling",
      "devflow:prevc-review": "ceiling",
      "devflow:prevc-execution": "medium",
      "superpowers:subagent-driven-development": "medium",
      "devflow:prevc-validation": "medium",
      "devflow:commit-message": "low",
      "devflow:documentation": "low",
      "devflow:prevc-confirmation": "low"
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

```js
// tests/lib/model-routing-resolve.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveSubagentRoute, resolveSessionRoute, agentName } from "../../scripts/lib/model-routing.mjs";
import { readModels } from "../../scripts/lib/models-config.mjs";

const table = JSON.parse(readFileSync(new URL("../../assets/model-routing/routes.json", import.meta.url), "utf8"));
const on = readModels("models:\n  enabled: true\n");
const base = { table, config: on, ceilingModel: "claude-opus-5-5", ceilingEffort: "xhigh" };

test("desligado → null (comportamento de hoje)", () => {
  assert.equal(resolveSubagentRoute({ ...base, config: readModels(""), agentType: "devflow:architect" }), null);
  const noSub = readModels("models:\n  enabled: true\n  subagents: false\n");
  assert.equal(resolveSubagentRoute({ ...base, config: noSub, agentType: "devflow:architect" }), null);
});

test("tipo não roteável fica intocado", () => {
  for (const t of ["Explore", "Plan", "claude-code-guide", "outro-plugin:agente", "fork"]) {
    assert.equal(resolveSubagentRoute({ ...base, agentType: t, phase: "E" }), null, t);
  }
});

test("default por agente, com id exato do usuário quando o tier é o teto", () => {
  const a = resolveSubagentRoute({ ...base, agentType: "devflow:architect", phase: "E" });
  assert.deepEqual(a, { tier: "capable", model: "claude-opus-5-5", effort: "high", source: "agent", ceiling: "capable" });
  const d = resolveSubagentRoute({ ...base, agentType: "devflow:documentation-writer", phase: "E" });
  assert.equal(d.model, "haiku");
  assert.equal(d.effort, "low");
});

test("teto: sessão em sonnet nunca põe o architect em opus (Review Focus 1)", () => {
  const r = resolveSubagentRoute({ ...base, ceilingModel: "claude-sonnet-5-5", agentType: "devflow:architect" });
  assert.equal(r.tier, "standard");
  assert.equal(r.model, "claude-sonnet-5-5");
});

test("teto ilegível → null", () => {
  assert.equal(resolveSubagentRoute({ ...base, ceilingModel: "best", agentType: "devflow:architect" }), null);
});

test("precedência: plan > projeto-fase > skill > fase > projeto-agente > agente", () => {
  const cfg = readModels(
    "models:\n  enabled: true\n  overrides:\n    agents:\n      code-reviewer:\n        tier: cheap\n    phases:\n      R:\n        code-reviewer:\n          tier: standard\n",
  );
  const r = (extra) => resolveSubagentRoute({ ...base, config: cfg, agentType: "devflow:code-reviewer", ...extra });
  assert.equal(r({ phase: "R", taskTier: "cheap" }).source, "plan");
  assert.equal(r({ phase: "R" }).tier, "standard");
  assert.equal(r({ phase: "R" }).source, "project");
  assert.equal(r({ phase: "E", skill: "final-review" }).tier, "capable");
  assert.equal(r({ phase: "E", skill: "final-review" }).source, "skill");
  assert.equal(r({ phase: "E" }).tier, "cheap");
  assert.equal(r({ phase: "E" }).source, "project");
  const plain = resolveSubagentRoute({ ...base, agentType: "devflow:code-reviewer", phase: "R" });
  assert.equal(plain.tier, "capable");
  assert.equal(plain.source, "phase");
});

test("model explícito é respeitado, mas limitado ao teto", () => {
  const r = resolveSubagentRoute({ ...base, ceilingModel: "sonnet", agentType: "general-purpose", explicitModel: "opus" });
  assert.equal(r.tier, "standard");
  assert.equal(r.source, "explicit");
  assert.equal(resolveSubagentRoute({ ...base, agentType: "general-purpose", explicitModel: "gpt-5" }), null);
});

test("maxTier do projeto limita mesmo abaixo do teto", () => {
  const cfg = readModels("models:\n  enabled: true\n  maxTier: standard\n");
  assert.equal(resolveSubagentRoute({ ...base, config: cfg, agentType: "devflow:architect" }).tier, "standard");
});

test("esforço do subagente nunca passa do esforço do usuário", () => {
  const r = resolveSubagentRoute({ ...base, ceilingEffort: "medium", agentType: "devflow:architect" });
  assert.equal(r.effort, "medium");
});

test("agentName tira só o prefixo devflow:", () => {
  assert.equal(agentName("devflow:architect"), "architect");
  assert.equal(agentName("general-purpose"), "general-purpose");
});

test("sessão: fase E vai para standard; P fica no modelo do usuário; fora de workflow não muda", () => {
  const s = (extra) => resolveSessionRoute({ table, config: on, userModel: "claude-opus-5-5", userEffort: "xhigh", ...extra });
  assert.deepEqual(s({ phase: "E", skill: null }), { tier: "standard", model: "sonnet", effort: "medium", source: "phase" });
  assert.equal(s({ phase: "P" }).model, "claude-opus-5-5");
  assert.equal(s({ phase: null }).source, "inherit");
  assert.equal(s({ phase: null }).model, "claude-opus-5-5");
});

test("sessão: esforço por skill, com 'ceiling' = esforço do usuário e nunca acima dele", () => {
  const s = (skill, userEffort = "xhigh") =>
    resolveSessionRoute({ table, config: on, phase: "P", skill, userModel: "claude-opus-5-5", userEffort });
  assert.equal(s("superpowers:brainstorming").effort, "xhigh");
  assert.equal(s("devflow:commit-message").effort, "low");
  assert.equal(s("superpowers:brainstorming", "high").effort, "high");
});

test("sessão: override do projeto e camada desligada", () => {
  const cfg = readModels("models:\n  enabled: true\n  overrides:\n    session:\n      phases:\n        E: capable\n");
  assert.equal(resolveSessionRoute({ table, config: cfg, phase: "E", userModel: "claude-opus-5-5", userEffort: "high" }).tier, "capable");
  const off = readModels("models:\n  enabled: true\n  session: false\n");
  assert.equal(resolveSessionRoute({ table, config: off, phase: "E", userModel: "opus", userEffort: "high" }), null);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/lib/model-routing-resolve.test.mjs`
Expected: FAIL com `resolveSubagentRoute is not a function` (ou `does not provide an export named`)

- [ ] **Step 4: Append the resolvers to `scripts/lib/model-routing.mjs`**

```js
// ---- resolvedores (spec §5) ----

export function agentName(agentType) {
  return String(agentType ?? "").replace(/^devflow:/, "");
}

function isRoutable(table, agentType) {
  const t = String(agentType ?? "");
  return (table?.routable ?? []).includes(t) || (table?.routablePrefix ? t.startsWith(table.routablePrefix) : false);
}

function pick(...cands) {
  for (const [tier, source] of cands) if (TIERS.includes(tier)) return { tier, source };
  return null;
}

export function resolveSubagentRoute({ table, config, agentType, phase, skill, taskTier, explicitModel, ceilingModel, ceilingEffort }) {
  if (!config?.enabled || !config.subagents || !table) return null;
  if (!isRoutable(table, agentType)) return null;
  const ceiling = tierOf(ceilingModel);
  if (!ceiling) return null;
  const name = agentName(agentType);

  let chosen;
  if (explicitModel !== undefined && explicitModel !== null && explicitModel !== "") {
    const t = tierOf(explicitModel);
    if (!t) return null;
    chosen = { tier: t, source: "explicit" };
  } else {
    chosen = pick(
      [taskTier, "plan"],
      [config.overrides?.phases?.[phase]?.[name], "project"],
      [table.skills?.[skill]?.[name] ?? table.skills?.[skill]?.["*"], "skill"],
      [table.phases?.[phase]?.[name], "phase"],
      [config.overrides?.agents?.[name], "project"],
      [table.agents?.[name]?.tier, "agent"],
    ) ?? { tier: ceiling, source: "inherit" };
  }

  const tier = capAtCeiling(chosen.tier, ceiling, config.maxTier);
  if (!tier) return null;
  const wantEffort = table.agents?.[name]?.effort ?? table.effortByTier?.[tier];
  const effort = capEffort(wantEffort, ceilingEffort);
  const model = tier === ceiling ? ceilingModel : toAlias(tier);
  return { tier, model, effort, source: chosen.source, ceiling };
}

export function resolveSessionRoute({ table, config, phase, skill, userModel, userEffort }) {
  if (!config?.enabled || !config.session || !table) return null;
  const ceiling = tierOf(userModel);
  if (!ceiling) return null;

  let want = ceiling;
  let source = "inherit";
  if (PHASES.includes(phase)) {
    const raw = config.overrides?.session?.phases?.[phase] ?? table.session?.phases?.[phase];
    want = raw === "ceiling" ? ceiling : TIERS.includes(raw) ? raw : ceiling;
    source = "phase";
  }
  const tier = capAtCeiling(want, ceiling, config.maxTier);
  if (!tier) return null;

  const rawEffort = table.session?.skills?.[skill];
  const wantEffort = rawEffort === "ceiling" ? userEffort : rawEffort ?? table.effortByTier?.[tier];
  const effort = capEffort(wantEffort, userEffort);
  const model = tier === ceiling ? userModel : toAlias(tier);
  return { tier, model, effort, source };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/lib/model-routing.test.mjs tests/lib/model-routing-resolve.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add assets/model-routing/routes.json scripts/lib/model-routing.mjs tests/lib/model-routing-resolve.test.mjs
git commit -m "feat(model-routing): tabela do plugin e resolvedores de sessão e subagente"
```

---

## Task 4: Rubrica e combinação da escalada (lib pura)

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `scripts/lib/escalation.mjs`
- Test: `tests/lib/escalation.test.mjs`

**Interfaces:**
- Consumes: `TIERS`, `nextTier`, `capAtCeiling` (Task 1); `redact` de `scripts/lib/instinct-redact.mjs`.
- Produces:
  - `rubricPrompt({ agentType, tier, report, midRun }) → string` (relatório redigido e truncado em 8000 caracteres; pede um JSON).
  - `parseAnswers(text) → Answers | null` com `Answers = { failure_is_capability, claims_done_with_evidence, is_stuck, needed_tier }`.
  - `combine(answers, { current, ceiling, maxTier, signalRed, midRun, thresholds }) → { action: "keep"|"human"|"escalate", tier, reason }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/escalation.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rubricPrompt, parseAnswers, combine } from "../../scripts/lib/escalation.mjs";

const TH = { capability: 0.6, claimsDone: 0.8 };
const A = (o) => ({ failure_is_capability: 0.9, claims_done_with_evidence: 0.1, is_stuck: 0.5, needed_tier: "standard", ...o });
const ctx = (o) => ({ current: "cheap", ceiling: "capable", maxTier: null, signalRed: true, midRun: false, thresholds: TH, ...o });

test("rubricPrompt redige segredo, trunca em 8000 e pede JSON com as 4 chaves", () => {
  const report = "token AKIA1234567890ABCDEF e email a@b.com " + "x".repeat(20000);
  const p = rubricPrompt({ agentType: "general-purpose", tier: "cheap", report, midRun: false });
  assert.doesNotMatch(p, /a@b\.com/);
  assert.ok(p.length < 9500, `prompt grande demais: ${p.length}`);
  for (const k of ["failure_is_capability", "claims_done_with_evidence", "is_stuck", "needed_tier"]) assert.match(p, new RegExp(k));
});

test("parseAnswers aceita JSON cercado por texto e cerca de código", () => {
  const fence = "`".repeat(3); // cerca de código montada: três crases literais quebrariam o markdown do plano
  const a = parseAnswers(`ok:\n${fence}json\n{"failure_is_capability":0.7,"claims_done_with_evidence":0,"is_stuck":1,"needed_tier":"capable"}\n${fence}`);
  assert.deepEqual(a, { failure_is_capability: 0.7, claims_done_with_evidence: 0, is_stuck: 1, needed_tier: "capable" });
});

test("parseAnswers recusa números fora de [0,1], tier inválido e lixo", () => {
  for (const t of [
    '{"failure_is_capability":1.5,"claims_done_with_evidence":0,"is_stuck":0,"needed_tier":"cheap"}',
    '{"failure_is_capability":0.5,"claims_done_with_evidence":0,"is_stuck":0,"needed_tier":"ultra"}',
    '{"failure_is_capability":"0.5"}',
    "nada aqui",
    "",
    undefined,
  ]) assert.equal(parseAnswers(t), null, String(t));
});

test("combine — tabela da spec §6.2 (entre tentativas)", () => {
  assert.equal(combine(null, ctx()).action, "keep");
  assert.equal(combine(A({ claims_done_with_evidence: 0.9 }), ctx()).action, "human");
  assert.equal(combine(A({ failure_is_capability: 0.3 }), ctx()).action, "human");
  assert.equal(combine(A(), ctx({ current: "capable" })).action, "human");
  const e = combine(A({ needed_tier: "top" }), ctx());
  assert.deepEqual([e.action, e.tier], ["escalate", "capable"]);
  assert.equal(combine(A({ needed_tier: "cheap" }), ctx()).tier, "standard", "sobe ao menos um degrau");
  assert.equal(combine(A({ needed_tier: "top" }), ctx({ maxTier: "standard" })).tier, "standard");
});

test("combine — no meio da execução, 'human' e teto viram 'keep'", () => {
  assert.equal(combine(A({ failure_is_capability: 0.1 }), ctx({ midRun: true })).action, "keep");
  assert.equal(combine(A(), ctx({ midRun: true, current: "capable" })).action, "keep");
  assert.equal(combine(A({ claims_done_with_evidence: 0.95 }), ctx({ midRun: true })).action, "escalate", "claimsDone não vale no meio");
});

test("escalation.mjs é puro", () => {
  const src = readFileSync(new URL("../../scripts/lib/escalation.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\s+["']node:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/escalation.test.mjs`
Expected: FAIL com `Cannot find module '.../scripts/lib/escalation.mjs'`

- [ ] **Step 3: Confirmar que `redact` cobre o caso do teste**

Run: `node -e 'import("./scripts/lib/instinct-redact.mjs").then(m=>console.log(m.redact("e a@b.com AKIA1234567890ABCDEF")))'`
Expected: o e-mail não aparece na saída. Se a chave AWS aparecer, mantenha no teste só a asserção do e-mail (a redação é best-effort por ADR-005, e o teste não deve exigir mais do que ela promete).

- [ ] **Step 4: Write minimal implementation**

```js
// scripts/lib/escalation.mjs — rubrica e combinação da escalada (spec §6). PURO.
// O julgamento vem do controlador (entre tentativas) ou de $.model.complete (no meio);
// a DECISÃO é deste código, por limiares (D7/D14).
import { TIERS, nextTier, capAtCeiling } from "./model-routing.mjs";
import { redact } from "./instinct-redact.mjs";

const MAX_REPORT = 8000;
const KEYS = ["failure_is_capability", "claims_done_with_evidence", "is_stuck"];

export function rubricPrompt({ agentType, tier, report, midRun }) {
  const body = redact(String(report ?? "")).slice(0, MAX_REPORT);
  return [
    `Avalie o resultado de um subagente (${agentType}, tier atual: ${tier}${midRun ? ", ainda em execução" : ""}).`,
    "Responda SOMENTE um objeto JSON com exatamente estas chaves:",
    '- "failure_is_capability": número 0..1 — a falha vem de dificuldade de raciocínio/desenho, e não de ambiente, ferramenta, acesso ou informação faltando?',
    '- "claims_done_with_evidence": número 0..1 — o relato afirma conclusão citando evidência concreta (comando de teste e saída)?',
    '- "is_stuck": número 0..1 — o agente diz estar bloqueado, inseguro ou sem convergir?',
    `- "needed_tier": um de ${TIERS.join(" | ")} — que tier o trabalho restante exige?`,
    "",
    "Relato (redigido e truncado):",
    "<<<",
    body,
    ">>>",
  ].join("\n");
}

export function parseAnswers(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o;
  try { o = JSON.parse(m[0]); } catch { return null; }
  const out = {};
  for (const k of KEYS) {
    if (typeof o?.[k] !== "number" || !(o[k] >= 0 && o[k] <= 1)) return null;
    out[k] = o[k];
  }
  if (!TIERS.includes(o.needed_tier)) return null;
  out.needed_tier = o.needed_tier;
  return out;
}

const rank = (t) => TIERS.indexOf(t);

export function combine(answers, { current, ceiling, maxTier = null, signalRed = false, midRun = false, thresholds }) {
  const th = thresholds ?? { capability: 0.6, claimsDone: 0.8 };
  const soft = (reason) => ({ action: midRun ? "keep" : "human", tier: current, reason });
  if (!answers) return { action: "keep", tier: current, reason: "respostas inválidas ou ausentes" };
  if (!midRun && signalRed && answers.claims_done_with_evidence >= th.claimsDone)
    return { action: "human", tier: current, reason: "relato diz concluído, sinal vermelho contradiz" };
  if (answers.failure_is_capability < th.capability) return soft("falha não é de capacidade");
  const top = capAtCeiling("top", ceiling, maxTier);
  if (!top || rank(current) >= rank(top)) return soft("tier atual já é o teto");
  const want = rank(answers.needed_tier) > rank(nextTier(current)) ? answers.needed_tier : nextTier(current);
  return { action: "escalate", tier: capAtCeiling(want, ceiling, maxTier), reason: "falha de capacidade" };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/lib/escalation.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/escalation.mjs tests/lib/escalation.test.mjs
git commit -m "feat(model-routing): rubrica e combinação determinística da escalada"
```

---

## Task 5: Ledger e agregação do relatório (libs puras)

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `scripts/lib/routing-ledger.mjs`, `scripts/lib/routing-report.mjs`
- Test: `tests/lib/routing-ledger.test.mjs`

**Interfaces:**
- Produces:
  - `LEDGER_KEYS` (allowlist), `buildEntry(fields) → object` (descarta chave fora da allowlist; `usage` só com números; strings truncadas em 120), `projectKey(path) → string` (FNV-1a 64 bits, hex, puro), `ledgerDirFrom({ xdgDataHome, home, cwd }) → string`.
  - `aggregate(entries) → { subagents: {[agentType]: {[model]: Usage & {n}}}, session: {[phase]: {[model]: Usage & {n}}}, escalations: {[agentType]: {dispatches, escalated}}, midRunSwitches, phaseSwitches: [{phase, cacheReadRatio}] }`, `renderMarkdown(agg) → string`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/routing-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEntry, LEDGER_KEYS, projectKey, ledgerDirFrom } from "../../scripts/lib/routing-ledger.mjs";
import { aggregate, renderMarkdown } from "../../scripts/lib/routing-report.mjs";

test("buildEntry: propriedade — só chaves da allowlist, nunca conteúdo", () => {
  const e = buildEntry({
    ts: "2026-10-08T00:00:00Z", scope: "subagent", agentType: "devflow:architect", tier: "capable",
    prompt: "segredo", answer: "resposta", errorText: "stack", usage: { input_tokens: 10, output_tokens: "x", note: "y" },
  });
  for (const k of Object.keys(e)) assert.ok(LEDGER_KEYS.includes(k), k);
  assert.equal(e.prompt, undefined);
  assert.deepEqual(e.usage, { input_tokens: 10 });
  assert.equal(JSON.stringify(e).includes("segredo"), false);
});

test("buildEntry trunca strings longas e descarta objeto em campo escalar", () => {
  const e = buildEntry({ agentType: "a".repeat(500), phase: { x: 1 } });
  assert.equal(e.agentType.length, 120);
  assert.equal(e.phase, undefined);
});

test("projectKey é determinístico, hex de 16 e distingue caminhos", () => {
  assert.equal(projectKey("/a/b"), projectKey("/a/b"));
  assert.notEqual(projectKey("/a/b"), projectKey("/a/c"));
  assert.match(projectKey("/a/b"), /^[0-9a-f]{16}$/);
});

test("ledgerDirFrom prefere XDG_DATA_HOME absoluto e cai para ~/.local/share", () => {
  assert.equal(ledgerDirFrom({ xdgDataHome: "/x", home: "/h", cwd: "/p" }), `/x/devflow-model-routing/${projectKey("/p")}`);
  assert.equal(ledgerDirFrom({ xdgDataHome: "rel", home: "/h", cwd: "/p" }), `/h/.local/share/devflow-model-routing/${projectKey("/p")}`);
});

test("aggregate soma por modelo × agente e conta escaladas e trocas", () => {
  const u = (i, o) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
  const agg = aggregate([
    { scope: "subagent", agentType: "general-purpose", model: "sonnet", usage: u(10, 5) },
    { scope: "subagent", agentType: "general-purpose", model: "sonnet", usage: u(1, 1) },
    { scope: "subagent", agentType: "general-purpose", escalation: { at: "midRun", action: "escalate" } },
    { scope: "session", phase: "E", model: "sonnet", usage: u(100, 10), cacheReadRatio: 0.04, switched: true },
  ]);
  assert.equal(agg.subagents["general-purpose"].sonnet.output_tokens, 6);
  assert.equal(agg.subagents["general-purpose"].sonnet.n, 2);
  assert.equal(agg.midRunSwitches, 1);
  assert.deepEqual(agg.phaseSwitches, [{ phase: "E", cacheReadRatio: 0.04 }]);
  assert.match(renderMarkdown(agg), /general-purpose/);
});

test("libs são puras", () => {
  for (const f of ["routing-ledger.mjs", "routing-report.mjs"]) {
    const src = readFileSync(new URL(`../../scripts/lib/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /from\s+["']node:/, f);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/routing-ledger.test.mjs`
Expected: FAIL com `Cannot find module`

- [ ] **Step 3: Write `scripts/lib/routing-ledger.mjs`**

```js
// scripts/lib/routing-ledger.mjs — formato do ledger de roteamento (spec §8). PURO.
// Allowlist: nunca prompt, resposta ou texto de erro (ADR-005).

export const LEDGER_KEYS = Object.freeze([
  "ts", "sessionId", "scope", "agentId", "agentType", "phase", "skill", "tier", "model", "effort",
  "source", "ceiling", "adapter", "usage", "cacheReadRatio", "switched", "escalation",
]);
const USAGE_KEYS = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
const ESC_KEYS = ["at", "from", "to", "action"];
const MAX_STR = 120;

const str = (v) => (typeof v === "string" ? v.slice(0, MAX_STR) : undefined);

export function buildEntry(fields) {
  const out = {};
  for (const k of LEDGER_KEYS) {
    const v = fields?.[k];
    if (v === undefined || v === null) continue;
    if (k === "usage") {
      const u = {};
      for (const uk of USAGE_KEYS) if (typeof v[uk] === "number" && Number.isFinite(v[uk])) u[uk] = v[uk];
      if (Object.keys(u).length) out.usage = u;
    } else if (k === "escalation") {
      const e = {};
      for (const ek of ESC_KEYS) if (typeof v[ek] === "string") e[ek] = v[ek].slice(0, MAX_STR);
      if (v.scores && typeof v.scores === "object") {
        const s = {};
        for (const [sk, sv] of Object.entries(v.scores)) if (typeof sv === "number" && /^[a-z_]+$/.test(sk)) s[sk] = sv;
        e.scores = s;
      }
      out.escalation = e;
    } else if (k === "cacheReadRatio") {
      if (typeof v === "number" && v >= 0 && v <= 1) out.cacheReadRatio = v;
    } else if (k === "switched") {
      if (typeof v === "boolean") out.switched = v;
    } else {
      const s = str(v);
      if (s !== undefined) out[k] = s;
    }
  }
  return out;
}

// FNV-1a 64 bits — puro (o mod não tem node:crypto).
export function projectKey(path) {
  let h = 0xcbf29ce484222325n;
  const s = String(path);
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function ledgerDirFrom({ xdgDataHome, home, cwd }) {
  const base = typeof xdgDataHome === "string" && xdgDataHome.startsWith("/")
    ? xdgDataHome
    : `${home}/.local/share`;
  return `${base}/devflow-model-routing/${projectKey(cwd)}`;
}
```

- [ ] **Step 4: Write `scripts/lib/routing-report.mjs`**

```js
// scripts/lib/routing-report.mjs — agregação do relatório (spec §8). PURO.
const ZERO = () => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, n: 0 });

function add(bucket, usage) {
  for (const k of Object.keys(bucket)) if (k !== "n" && typeof usage?.[k] === "number") bucket[k] += usage[k];
  bucket.n += 1;
}

export function aggregate(entries) {
  const agg = { subagents: {}, session: {}, escalations: {}, midRunSwitches: 0, phaseSwitches: [] };
  for (const e of entries ?? []) {
    if (e?.escalation) {
      const s = (agg.escalations[e.agentType ?? "?"] ??= { dispatches: 0, escalated: 0 });
      if (e.escalation.action === "escalate") {
        s.escalated += 1;
        if (e.escalation.at === "midRun") agg.midRunSwitches += 1;
      }
      continue;
    }
    if (!e?.usage || !e.model) continue;
    if (e.scope === "subagent") {
      add(((agg.subagents[e.agentType ?? "?"] ??= {})[e.model] ??= ZERO()), e.usage);
      (agg.escalations[e.agentType ?? "?"] ??= { dispatches: 0, escalated: 0 }).dispatches += 1;
    } else if (e.scope === "session") {
      add(((agg.session[e.phase ?? "-"] ??= {})[e.model] ??= ZERO()), e.usage);
      if (e.switched) agg.phaseSwitches.push({ phase: e.phase ?? "-", cacheReadRatio: e.cacheReadRatio ?? null });
    }
  }
  return agg;
}

const k = (n) => (n / 1000).toFixed(1) + "k";

export function renderMarkdown(agg) {
  const lines = ["## Subagentes", "", "| Agente | Modelo | Despachos | Entrada | Saída | Cache lido |", "|---|---|---|---|---|---|"];
  for (const [a, models] of Object.entries(agg.subagents))
    for (const [m, u] of Object.entries(models))
      lines.push(`| ${a} | ${m} | ${u.n} | ${k(u.input_tokens)} | ${k(u.output_tokens)} | ${k(u.cache_read_input_tokens)} |`);
  lines.push("", "## Sessão por fase", "", "| Fase | Modelo | Turnos | Entrada | Saída |", "|---|---|---|---|---|");
  for (const [p, models] of Object.entries(agg.session))
    for (const [m, u] of Object.entries(models)) lines.push(`| ${p} | ${m} | ${u.n} | ${k(u.input_tokens)} | ${k(u.output_tokens)} |`);
  lines.push("", "## Escaladas", "", "| Agente | Despachos | Escaladas |", "|---|---|---|");
  for (const [a, s] of Object.entries(agg.escalations)) lines.push(`| ${a} | ${s.dispatches} | ${s.escalated} |`);
  lines.push("", `Trocas no meio da execução: ${agg.midRunSwitches}`);
  lines.push(`Trocas de fase da sessão: ${agg.phaseSwitches.length} (cache lido no passo seguinte: ${agg.phaseSwitches.map((s) => s.cacheReadRatio ?? "?").join(", ") || "—"})`);
  lines.push("", "_Tokens por modelo. O peso de cada modelo na cota do plano não é público._");
  return lines.join("\n");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/lib/routing-ledger.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/routing-ledger.mjs scripts/lib/routing-report.mjs tests/lib/routing-ledger.test.mjs
git commit -m "feat(model-routing): ledger por allowlist e agregação do relatório"
```

---

## Task 6: CLI `model-route.mjs` (resolve, escalate, report)

**Agent:** backend-specialist · **Tier:** standard · **Tests:** e2e

**Files:**
- Create: `scripts/model-route.mjs`
- Test: `tests/e2e/test-model-route-cli.mjs`

**Interfaces:**
- Consumes: Tasks 1–5; `readWorkflowState` de `scripts/lib/workflow-resume.mjs`.
- Produces (contrato usado pelas skills na Task 11):
  - `node scripts/model-route.mjs resolve --agent <tipo> [--phase P] [--skill S] [--task-tier T] [--ceiling <modelo>] [--cwd D]` → stdout JSON `{"route": {...}|null}`. Sem `--ceiling`, o teto é `top` (o adaptador aplica o teto real depois). Sem `--phase`, lê do `prevc.json` com containment.
  - `node scripts/model-route.mjs escalate --agent <tipo> --tier <tier> --report <arquivo> [--mid-run]` → stdout: o texto da rubrica.
  - `node scripts/model-route.mjs escalate --agent <tipo> --tier <tier> --answers '<json>' [--signal-red] [--ceiling <modelo>] [--cwd D]` → stdout JSON `{"action","tier","model","reason"}` e, com ledger ligado, grava a linha.
  - `node scripts/model-route.mjs report [--since ISO] [--transcripts <dir de ~/.claude/projects/<projeto>>] [--cwd D]` → markdown; `--transcripts` soma o `usage` dos subagentes a partir dos `subagents/*.meta.json` + `.jsonl` (caminho do clássico/omp).
  - Saída sempre JSON válido nos ramos `resolve`/`escalate --answers`; exit 0 mesmo com roteamento desligado; exit 2 só para uso inválido.

- [ ] **Step 1: Write the failing test**

```js
// tests/e2e/test-model-route-cli.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../../scripts/model-route.mjs", import.meta.url).pathname;

function fixture({ models = "models:\n  enabled: true\n  ledger: true\n", phase = "E" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "model-route-"));
  mkdirSync(join(dir, ".context/runtime/workflows"), { recursive: true });
  writeFileSync(join(dir, ".context/.devflow.yaml"), models);
  if (phase) writeFileSync(join(dir, ".context/runtime/workflows/prevc.json"),
    JSON.stringify({ status: { project: { name: "x", current_phase: phase }, phases: {} } }));
  const xdg = mkdtempSync(join(tmpdir(), "model-route-xdg-"));
  return { dir, env: { ...process.env, XDG_DATA_HOME: xdg, HOME: xdg }, xdg };
}
const run = (args, f) => execFileSync("node", [CLI, ...args, "--cwd", f.dir], { encoding: "utf8", env: f.env });

test("resolve lê a fase do prevc.json e devolve a rota", () => {
  const f = fixture({ phase: "C" });
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose"], f)).route;
  assert.equal(r.tier, "cheap");
  assert.equal(r.model, "haiku");
});

test("resolve com task-tier e teto", () => {
  const f = fixture();
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose", "--task-tier", "capable", "--ceiling", "claude-sonnet-5-5"], f)).route;
  assert.equal(r.tier, "standard");
  assert.equal(r.source, "plan");
});

test("roteamento desligado → route null, exit 0", () => {
  const f = fixture({ models: "git:\n  strategy: x\n" });
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:architect"], f)).route, null);
});

test("prevc.json symlink para fora → sem fase (Review Focus 5)", async () => {
  const { symlinkSync, rmSync } = await import("node:fs");
  const f = fixture({ phase: null });
  const outside = join(mkdtempSync(join(tmpdir(), "outside-")), "p.json");
  writeFileSync(outside, JSON.stringify({ status: { project: { name: "x", current_phase: "C" } } }));
  symlinkSync(outside, join(f.dir, ".context/runtime/workflows/prevc.json"));
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose"], f)).route;
  assert.equal(r.source, "agent", "sem fase confiável cai no default do agente");
});

test("escalate: rubrica → respostas → decisão, gravando no ledger sem conteúdo", () => {
  const f = fixture();
  const rep = join(f.dir, "report.txt");
  writeFileSync(rep, "FALHOU: teste X vermelho; email dev@corp.com");
  const rubric = run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--report", rep], f);
  assert.match(rubric, /needed_tier/);
  assert.doesNotMatch(rubric, /dev@corp\.com/);
  const answers = JSON.stringify({ failure_is_capability: 0.9, claims_done_with_evidence: 0, is_stuck: 0.2, needed_tier: "standard" });
  const d = JSON.parse(run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--answers", answers, "--signal-red", "--ceiling", "opus"], f));
  assert.deepEqual([d.action, d.tier, d.model], ["escalate", "standard", "sonnet"]);
  const dirs = readdirSync(join(f.xdg, "devflow-model-routing"));
  const files = readdirSync(join(f.xdg, "devflow-model-routing", dirs[0]));
  const content = readFileSync(join(f.xdg, "devflow-model-routing", dirs[0], files[0]), "utf8");
  assert.match(content, /"action":"escalate"/);
  assert.doesNotMatch(content, /FALHOU|dev@corp/);
});

test("escalate com respostas inválidas → keep", () => {
  const f = fixture();
  const d = JSON.parse(run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--answers", "lixo"], f));
  assert.equal(d.action, "keep");
});

test("report sobre ledger vazio não quebra", () => {
  const f = fixture();
  assert.match(run(["report"], f), /Subagentes/);
});

test("report --transcripts soma o usage dos subagentes (caminho do clássico/omp), sem ler conteúdo", () => {
  const f = fixture();
  const proj = mkdtempSync(join(tmpdir(), "transcripts-"));
  const sub = join(proj, "sess-1", "subagents");
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, "agent-a.meta.json"), JSON.stringify({ agentType: "devflow:code-reviewer", model: "sonnet" }));
  writeFileSync(join(sub, "agent-a.jsonl"), [
    JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-5-5", content: "SEGREDO", usage: { input_tokens: 5, output_tokens: 7000 } } }),
    "linha quebrada",
  ].join("\n"));
  const out = run(["report", "--transcripts", proj], f);
  assert.match(out, /devflow:code-reviewer \| claude-sonnet-5-5 \| 1 \|/);
  assert.match(out, /7\.0k/);
  assert.doesNotMatch(out, /SEGREDO/);
});

test("uso inválido → exit 2", () => {
  const r = spawnSync("node", [CLI, "voar"], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/e2e/test-model-route-cli.mjs`
Expected: FAIL (`Cannot find module .../scripts/model-route.mjs` em todos)

- [ ] **Step 3: Write `scripts/model-route.mjs`**

```js
#!/usr/bin/env node
// scripts/model-route.mjs — CLI do roteamento de modelos (spec §4.1). Usado pelas skills.
import { readFileSync, mkdirSync, appendFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { readModels } from "./lib/models-config.mjs";
import { resolveSubagentRoute, tierOf, toAlias, TIERS } from "./lib/model-routing.mjs";
import { rubricPrompt, parseAnswers, combine } from "./lib/escalation.mjs";
import { buildEntry, ledgerDirFrom } from "./lib/routing-ledger.mjs";
import { aggregate, renderMarkdown } from "./lib/routing-report.mjs";
import { readWorkflowState } from "./lib/workflow-resume.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) o[k] = true;
    else { o[k] = next; i++; }
  }
  return o;
}

const readText = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const table = () => JSON.parse(readFileSync(join(PLUGIN_ROOT, "assets/model-routing/routes.json"), "utf8"));
const config = (cwd) => readModels(readText(join(cwd, ".context/.devflow.yaml")));
const phaseOf = (cwd) => {
  const p = readWorkflowState(cwd)?.phase;
  return ["P", "R", "E", "V", "C"].includes(p) ? p : null;
};
const ledgerDir = (cwd) => ledgerDirFrom({ xdgDataHome: process.env.XDG_DATA_HOME, home: process.env.HOME || homedir(), cwd });

function writeLedger(cwd, cfg, entry) {
  if (!cfg.ledger) return;
  try {
    const dir = ledgerDir(cwd);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(join(dir, "cli.jsonl"), JSON.stringify(buildEntry(entry)) + "\n", { mode: 0o600 });
  } catch { /* ledger nunca quebra o fluxo */ }
}

function cmdResolve(o, cwd) {
  const cfg = config(cwd);
  const route = resolveSubagentRoute({
    table: table(), config: cfg, agentType: o.agent,
    phase: typeof o.phase === "string" ? o.phase : phaseOf(cwd),
    skill: typeof o.skill === "string" ? o.skill : null,
    taskTier: typeof o["task-tier"] === "string" ? o["task-tier"] : null,
    explicitModel: null,
    ceilingModel: typeof o.ceiling === "string" ? o.ceiling : "top",
    ceilingEffort: "max",
  });
  process.stdout.write(JSON.stringify({ route }) + "\n");
}

function cmdEscalate(o, cwd) {
  if (typeof o.report === "string") {
    process.stdout.write(rubricPrompt({ agentType: o.agent, tier: o.tier, report: readText(o.report), midRun: !!o["mid-run"] }) + "\n");
    return;
  }
  const cfg = config(cwd);
  const ceiling = tierOf(typeof o.ceiling === "string" ? o.ceiling : "top") ?? "top";
  const current = TIERS.includes(o.tier) ? o.tier : null;
  const d = current
    ? combine(parseAnswers(typeof o.answers === "string" ? o.answers : ""), {
        current, ceiling, maxTier: cfg.maxTier, signalRed: !!o["signal-red"], midRun: false, thresholds: cfg.thresholds,
      })
    : { action: "keep", tier: o.tier, reason: "tier atual inválido" };
  const out = { ...d, model: d.action === "escalate" ? toAlias(d.tier) : null };
  writeLedger(cwd, cfg, {
    ts: new Date().toISOString(), scope: "subagent", agentType: o.agent, tier: d.tier, adapter: "cli",
    escalation: { at: "retry", from: o.tier, to: d.tier, action: d.action },
  });
  process.stdout.write(JSON.stringify(out) + "\n");
}

// Caminho do clássico/omp (spec §8): só agentType/model do meta.json e campos NUMÉRICOS de usage.
function transcriptEntries(projectsDir) {
  const out = [];
  if (!existsSync(projectsDir)) return out;
  for (const sess of readdirSync(projectsDir)) {
    const sub = join(projectsDir, sess, "subagents");
    if (!existsSync(sub)) continue;
    for (const meta of readdirSync(sub).filter((n) => n.endsWith(".meta.json"))) {
      let agentType = "?";
      try { agentType = String(JSON.parse(readText(join(sub, meta))).agentType ?? "?"); } catch { continue; }
      const byModel = {};
      for (const line of readText(join(sub, meta.replace(/\.meta\.json$/, ".jsonl"))).split("\n")) {
        let m;
        try { m = JSON.parse(line)?.message; } catch { continue; }
        if (!m?.usage || typeof m.model !== "string" || !m.model.startsWith("claude")) continue;
        const u = (byModel[m.model] ??= { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
        for (const k of Object.keys(u)) if (typeof m.usage[k] === "number") u[k] += m.usage[k];
      }
      for (const [model, usage] of Object.entries(byModel)) out.push({ scope: "subagent", agentType, model, usage });
    }
  }
  return out;
}

function cmdReport(o, cwd) {
  const dir = ledgerDir(cwd);
  const since = typeof o.since === "string" ? Date.parse(o.since) : 0;
  const entries = typeof o.transcripts === "string" ? transcriptEntries(o.transcripts) : [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
      const p = join(dir, f);
      if (!statSync(p).isFile()) continue;
      for (const line of readText(p).split("\n")) {
        try {
          const e = JSON.parse(line);
          if (!since || Date.parse(e.ts) >= since) entries.push(e);
        } catch { /* linha inválida ignorada */ }
      }
    }
  }
  process.stdout.write(renderMarkdown(aggregate(entries)) + "\n");
}

function main(argv) {
  const o = args(argv);
  const cwd = typeof o.cwd === "string" ? o.cwd : process.cwd();
  const cmd = o._[0];
  if (cmd === "resolve" && typeof o.agent === "string") return cmdResolve(o, cwd);
  if (cmd === "escalate" && typeof o.agent === "string") return cmdEscalate(o, cwd);
  if (cmd === "report") return cmdReport(o, cwd);
  console.error("uso: model-route <resolve --agent T [--phase P] [--skill S] [--task-tier T] [--ceiling M] | escalate --agent T --tier T (--report F | --answers J [--signal-red] [--ceiling M]) | report [--since ISO]> [--cwd D]");
  process.exit(2);
}

main(process.argv.slice(2));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/e2e/test-model-route-cli.mjs`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/model-route.mjs tests/e2e/test-model-route-cli.mjs
git commit -m "feat(model-routing): CLI model-route (resolve, escalate, report)"
```

---

## Task 7: `router-core` — máquina de estado do mod (pura)

**Agent:** backend-specialist · **Tier:** capable · **Tests:** unit

**Files:**
- Create: `scripts/lib/router-core.mjs`
- Test: `tests/lib/router-core.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces (o adaptador da Task 8 só traduz eventos para estas funções):
  - `createRouterState() → State`
  - `onTurnStart(state, { phase })`, `onSkill(state, skill)`
  - `onSessionStep(state, { model, effort }, { table, config }) → { model?, effort?, switched } | null` — registra `userModel`/`userEffort` a partir do que chega (antes da reescrita); um `model` recebido diferente do último reescrito pelo mod e do `userModel` registrado é tratado como `/model` do usuário e vira o novo teto.
  - `onSpawn(state, { subagentType, model, parentModel, fork, workflow }, { table, config, phase, skill }) → { model, route } | null` — teto = `state.userModel ?? parentModel`.
  - `onSpawned(state, agentId, route)`
  - `onSubagentTool(state, agentId, { isError, summary }, config) → { trigger: boolean }` — guarda os últimos 6 resumos de erro (≤ 300 caracteres cada).
  - `onSubagentStep(state, { agentId, model, effort }) → { model?, effort? } | null` — esforço por passo (D13) e modelo escalado (D14).
  - `midRunReport(state, agentId) → string` — texto para a rubrica.
  - `applyMidRun(state, agentId, decision) → boolean` — aplica no máximo uma troca, nunca para baixo.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/router-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../scripts/lib/router-core.mjs";
import { readModels } from "../../scripts/lib/models-config.mjs";

const table = JSON.parse(readFileSync(new URL("../../assets/model-routing/routes.json", import.meta.url), "utf8"));
const config = readModels("models:\n  enabled: true\n");
const ctx = { table, config };

test("sessão: troca de modelo só na mudança de fase (1 troca num P→C)", () => {
  const s = C.createRouterState();
  let switches = 0;
  for (const phase of ["P", "P", "R", "E", "E", "V", "C"]) {
    C.onTurnStart(s, { phase });
    const rw = C.onSessionStep(s, { model: "claude-opus-5-5", effort: "xhigh" }, ctx);
    if (rw?.switched) switches++;
  }
  assert.equal(switches, 1);
});

test("sessão: rota de E põe sonnet e effort medium", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "E" });
  const rw = C.onSessionStep(s, { model: "claude-opus-5-5", effort: "xhigh" }, ctx);
  assert.equal(rw.model, "sonnet");
  assert.equal(rw.effort, "medium");
});

test("sessão: /model do usuário vira novo teto (Review Focus 3)", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "P" });
  C.onSessionStep(s, { model: "claude-opus-5-5", effort: "high" }, ctx);
  C.onSessionStep(s, { model: "claude-haiku-4-5", effort: "low" }, ctx);
  assert.equal(s.userModel, "claude-haiku-4-5");
  C.onTurnStart(s, { phase: "E" });
  const rw = C.onSessionStep(s, { model: "claude-haiku-4-5", effort: "low" }, ctx);
  assert.equal(rw?.model ?? "claude-haiku-4-5", "claude-haiku-4-5", "nunca sobe acima do novo teto");
});

test("subagente: teto é o modelo ORIGINAL do usuário mesmo com a sessão roteada (Review Focus 2)", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "E" });
  C.onSessionStep(s, { model: "claude-opus-5-5", effort: "xhigh" }, ctx);
  const r = C.onSpawn(s, { subagentType: "devflow:architect", parentModel: "sonnet", fork: false }, { ...ctx, phase: "E" });
  assert.equal(r.route.tier, "capable");
  assert.equal(r.model, "claude-opus-5-5");
});

test("subagente: fork, workflow e tipo não roteável ficam intocados", () => {
  const s = C.createRouterState();
  assert.equal(C.onSpawn(s, { subagentType: "general-purpose", parentModel: "opus", fork: true }, ctx), null);
  assert.equal(C.onSpawn(s, { subagentType: "general-purpose", parentModel: "opus", workflow: { runId: "wf_1" } }, ctx), null);
  assert.equal(C.onSpawn(s, { subagentType: "Explore", parentModel: "opus" }, ctx), null);
});

test("subagente: esforço sobe após falha e volta no sucesso", () => {
  const s = C.createRouterState();
  C.onSessionStep(s, { model: "claude-opus-5-5", effort: "xhigh" }, ctx);
  const r = C.onSpawn(s, { subagentType: "general-purpose", parentModel: "opus" }, { ...ctx, phase: "E" });
  C.onSpawned(s, "a1", r.route);
  assert.equal(C.onSubagentStep(s, { agentId: "a1", model: "sonnet", effort: "medium" })?.effort ?? "medium", "medium");
  C.onSubagentTool(s, "a1", { isError: true, summary: "Bash: exit 1" }, config);
  assert.equal(C.onSubagentStep(s, { agentId: "a1", model: "sonnet", effort: "medium" }).effort, "high");
  C.onSubagentTool(s, "a1", { isError: false }, config);
  assert.equal(C.onSubagentStep(s, { agentId: "a1", model: "sonnet", effort: "medium" })?.effort ?? "medium", "medium");
});

test("escalada no meio: gatilho no limiar, uma troca, nunca para baixo, nunca acima do teto", () => {
  const s = C.createRouterState();
  C.onSessionStep(s, { model: "claude-opus-5-5", effort: "xhigh" }, ctx);
  const r = C.onSpawn(s, { subagentType: "devflow:documentation-writer", parentModel: "opus" }, { ...ctx, phase: "E" });
  C.onSpawned(s, "a2", r.route);
  let trig;
  for (let i = 0; i < 3; i++) trig = C.onSubagentTool(s, "a2", { isError: true, summary: `erro ${i}` }, config);
  assert.equal(trig.trigger, true);
  assert.match(C.midRunReport(s, "a2"), /erro 2/);
  assert.equal(C.applyMidRun(s, "a2", { action: "escalate", tier: "standard" }), true);
  assert.equal(C.onSubagentStep(s, { agentId: "a2", model: "haiku", effort: "low" }).model, "sonnet");
  assert.equal(C.applyMidRun(s, "a2", { action: "escalate", tier: "capable" }), false, "só uma troca");
  const s2 = C.createRouterState();
  C.onSessionStep(s2, { model: "claude-sonnet-5-5", effort: "high" }, ctx);
  const r2 = C.onSpawn(s2, { subagentType: "general-purpose", parentModel: "sonnet" }, { ...ctx, phase: "E" });
  C.onSpawned(s2, "b", r2.route);
  assert.equal(C.applyMidRun(s2, "b", { action: "escalate", tier: "capable" }), false, "acima do teto");
  assert.equal(C.applyMidRun(s2, "b", { action: "escalate", tier: "cheap" }), false, "para baixo");
});

test("router-core é puro", () => {
  const src = readFileSync(new URL("../../scripts/lib/router-core.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\s+["']node:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/router-core.test.mjs`
Expected: FAIL com `Cannot find module`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/router-core.mjs — máquina de estado do mod de roteamento (spec §4.2/§4.3). PURO.
// O adaptador (hooks/router.mjs) só traduz eventos do engine para estas funções.
import { resolveSessionRoute, resolveSubagentRoute, stepEffort, tierOf, toAlias, TIERS, capAtCeiling } from "./model-routing.mjs";

const MAX_ERRORS = 6;
const MAX_SUMMARY = 300;
const rank = (t) => TIERS.indexOf(t);

export function createRouterState() {
  return { userModel: null, userEffort: null, lastRewrittenModel: null, phase: null, sessionTier: null, skill: null, agents: {} };
}

export function onTurnStart(state, { phase }) { state.phase = phase ?? null; }
export function onSkill(state, skill) { state.skill = typeof skill === "string" ? skill : null; }

export function onSessionStep(state, { model, effort }, { table, config }) {
  // O que chega é o modelo do engine (antes da nossa reescrita). Diferente do que o mod pôs
  // e do registrado → é escolha do usuário (/model): vira o novo teto (D17).
  if (model && model !== state.lastRewrittenModel && model !== state.userModel) {
    state.userModel = model;
    state.userEffort = effort ?? state.userEffort;
  }
  if (!state.userModel) return null;
  const route = resolveSessionRoute({ table, config, phase: state.phase, skill: state.skill, userModel: state.userModel, userEffort: state.userEffort });
  if (!route) return null;
  const switched = state.sessionTier !== null && state.sessionTier !== route.tier;
  state.sessionTier = route.tier;
  state.lastRewrittenModel = route.model;
  const rw = { switched };
  if (route.model !== model) rw.model = route.model;
  if (route.effort && route.effort !== effort) rw.effort = route.effort;
  return rw.model || rw.effort || switched ? rw : null;
}

export function onSpawn(state, e, { table, config, phase, skill }) {
  if (e?.fork || e?.workflow) return null;
  const route = resolveSubagentRoute({
    table, config, agentType: e?.subagentType, phase: phase ?? state.phase, skill: skill ?? null, taskTier: null,
    explicitModel: e?.model ?? null, ceilingModel: state.userModel ?? e?.parentModel ?? null, ceilingEffort: state.userEffort,
  });
  if (!route) return null;
  return { model: route.model, route };
}

export function onSpawned(state, agentId, route) {
  if (!agentId || !route) return;
  state.agents[agentId] = { tier: route.tier, ceiling: route.ceiling, effortBase: route.effort, streak: 0, errors: [], escalatedTo: null };
}

export function onSubagentTool(state, agentId, { isError, summary }, config) {
  const a = state.agents[agentId];
  if (!a) return { trigger: false };
  if (!isError) { a.streak = 0; return { trigger: false }; }
  a.streak += 1;
  a.errors.push(String(summary ?? "erro").slice(0, MAX_SUMMARY));
  if (a.errors.length > MAX_ERRORS) a.errors.shift();
  const limit = config?.midRun?.failureStreak ?? 3;
  return { trigger: a.streak >= limit && !a.escalatedTo };
}

export function onSubagentStep(state, { agentId, model, effort }) {
  const a = state.agents[agentId];
  if (!a) return null;
  const rw = {};
  if (a.escalatedTo && toAlias(a.escalatedTo) !== model) rw.model = toAlias(a.escalatedTo);
  const eff = stepEffort(a.effortBase, a.streak, state.userEffort);
  if (eff && eff !== effort) rw.effort = eff;
  return rw.model || rw.effort ? rw : null;
}

export function midRunReport(state, agentId) {
  const a = state.agents[agentId];
  return a ? `Falhas recentes de ferramenta (${a.streak} seguidas):\n- ${a.errors.join("\n- ")}` : "";
}

export function applyMidRun(state, agentId, decision) {
  const a = state.agents[agentId];
  if (!a || a.escalatedTo || decision?.action !== "escalate") return false;
  const to = capAtCeiling(decision.tier, a.ceiling);
  if (!to || rank(to) <= rank(a.tier) || to !== decision.tier) return false;
  a.escalatedTo = to;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/router-core.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/router-core.mjs tests/lib/router-core.test.mjs
git commit -m "feat(model-routing): máquina de estado pura do mod (sessão e subagentes)"
```

---

## Task 8: Adaptador mod (`hooks/router.mjs`)

**Agent:** backend-specialist + security-auditor (revisão) · **Tier:** capable · **Tests:** integration (`claude plugin test`)

> Depende do resultado de R-1, R-3, R-4, R-6 e R-7 (gate da fase R). Os passos abaixo assumem todos SIM.

**Files:**
- Create: `hooks/router.mjs`, `hooks/router.test.mjs`
- Modify: `hooks/hooks.json` (acrescentar `"modules": ["./router.mjs"]` no objeto de topo, ao lado de `"hooks"`)
- Modify: `tests/run-integration.sh` (rodar `claude plugin test .` quando o `claude` existir)

**Interfaces:**
- Consumes: `router-core` (Task 7), `readModels` (Task 2), `phaseFromPrevcJson` (Task 1), `rubricPrompt`/`parseAnswers`/`combine` (Task 4), `buildEntry`/`ledgerDirFrom` (Task 5); `$.fs.read`, `$.fs.write`, `$.env.get`, `$.model.complete`, `$.ui.status`, `$.command.register`, `$.plugin.root`.
- Produces: comando `/devflow-route` (`status` | `on` | `off` | `session off`); arquivo de ledger `<dir>/<sessionKey>.jsonl`.

- [ ] **Step 1: Write the failing test**

```js
// hooks/router.test.mjs — roda com `claude plugin test .` (kit 'claude-code/testing').
import { test, expect } from "claude-code/testing";

// Tabela mínima embutida: o ambiente do kit não tem fs e módulos não aceitam import() dinâmico.
const ROUTES = JSON.stringify({
  routable: ["general-purpose"], routablePrefix: "devflow:",
  effortByTier: { cheap: "low", standard: "medium", capable: "high", top: "high" },
  agents: { "documentation-writer": { tier: "cheap", effort: "low" }, "general-purpose": { tier: "standard" } },
  phases: { E: { "general-purpose": "standard" } }, skills: {},
  session: { phases: { E: "standard" }, skills: {} },
});
const YAML_ON = "models:\n  enabled: true\n";

function stubDisk(on, { yaml = YAML_ON, phase = "E" } = {}) {
  on("fs.read", async ($, e) => {
    const p = String(e.path ?? e);
    if (p.endsWith("routes.json")) return ROUTES;
    if (p.endsWith(".devflow.yaml")) return yaml;
    if (p.endsWith("prevc.json")) return JSON.stringify({ status: { project: { name: "x", current_phase: phase } } });
    throw new Error("ENOENT");
  });
  on("fs.write", async () => undefined);
  on("env.get", async ($, e) => (e.name === "HOME" ? "/home/t" : e.name === "PWD" ? "/proj" : undefined));
}

test("agent.spawn sem model recebe a rota (documentation-writer → haiku)", async ($, on) => {
  stubDisk(on);
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: e.model, agentId: "a1" }; });
  await $.agent.spawn({ prompt: "doc", subagentType: "devflow:documentation-writer" });
  expect(seen.model).toBe("haiku");
});

test("roteamento desligado não toca no despacho", async ($, on) => {
  stubDisk(on, { yaml: "git:\n  strategy: x\n" });
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "opus", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "devflow:documentation-writer" });
  expect(seen.model).toBeUndefined();
});

test("tipo não roteável (Explore) intocado", async ($, on) => {
  stubDisk(on);
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "haiku", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "Explore" });
  expect(seen.model).toBeUndefined();
});

```

> O teste usa só eventos de core que os tipos declaram (`fs.read`, `fs.write`, `env.get`, `agent.spawn`). Antes de rodar, confira em `.claude-plugin/types/claude-code/index.d.ts` (gerado no primeiro load) os nomes exatos dos campos de input de `fs.read` (caminho) e `env.get` (nome da variável) e ajuste os stubs `e.path`/`e.name`. O teto, o `fork` e a escalada no meio já estão cobertos pelos testes puros da Task 7; aqui o alvo é a fiação do adaptador.

- [ ] **Step 2: Run test to verify it fails**

Run: `claude plugin test .`
Expected: FAIL — `hooks/hooks.json` ainda não declara `modules` (nenhum hook do plugin roda, `seen.model` fica `undefined` no primeiro teste).

- [ ] **Step 3: Declarar o módulo em `hooks/hooks.json`**

Acrescente no objeto de topo, irmão de `"hooks"`:

```json
  "modules": ["./router.mjs"],
```

- [ ] **Step 4: Write `hooks/router.mjs`**

```js
// hooks/router.mjs — adaptador MOD do roteamento de modelos (spec §4.2/§4.3).
// Só traduz eventos do engine para scripts/lib/router-core.mjs. Qualquer falha → next(e) intocado.
import * as core from "../scripts/lib/router-core.mjs";
import { readModels } from "../scripts/lib/models-config.mjs";
import { phaseFromPrevcJson } from "../scripts/lib/model-routing.mjs";
import { rubricPrompt, parseAnswers, combine } from "../scripts/lib/escalation.mjs";
import { buildEntry, ledgerDirFrom } from "../scripts/lib/routing-ledger.mjs";

/** @type {import('claude-code').Register} */
export const register = (on) => {
  const state = core.createRouterState();
  let table = null;
  let config = readModels("");
  let disabled = false;
  let sessionOff = false;
  let ledgerPath = null;
  const ledgerLines = [];
  const sessionKey = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const active = () => !disabled && config.enabled && table;
  let loaded = false;
  // Carga preguiçosa: não depende de session.start ter disparado (reload, kit de testes).
  async function ensure($) {
    if (loaded) return;
    loaded = true;
    await load($);
  }

  async function load($) {
    try { table = JSON.parse(await $.fs.read(`${$.plugin.root}/assets/model-routing/routes.json`)); } catch { table = null; }
    try { config = readModels(await $.fs.read(".context/.devflow.yaml")); } catch { config = readModels(""); }
    if (config.ledger) {
      const home = await $.env.get("HOME");
      const xdg = await $.env.get("XDG_DATA_HOME");
      const cwd = await $.env.get("PWD");
      if (home && cwd) ledgerPath = `${ledgerDirFrom({ xdgDataHome: xdg, home, cwd })}/${sessionKey}.jsonl`;
    }
  }

  async function ledger($, fields) {
    if (!ledgerPath) return;
    ledgerLines.push(JSON.stringify(buildEntry({ ts: new Date().toISOString(), sessionId: sessionKey, adapter: "mod", ...fields })));
    try { await $.fs.write(ledgerPath, ledgerLines.join("\n") + "\n"); } catch { ledgerPath = null; }
  }

  async function readPhase($) {
    try { return phaseFromPrevcJson(await $.fs.read(".context/runtime/workflows/prevc.json")); } catch { return null; }
  }

  on("session.start", async ($, e, next) => {
    const r = await next(e);
    await ensure($);
    try { await $.command.register({ name: "devflow-route", description: "Roteamento de modelos do DevFlow: status | on | off | session off" }); } catch {}
    return r;
  });

  on("command.run", async ($, e, next) => {
    if (e.command !== "devflow-route") return next(e);
    const a = String(e.args ?? "").trim();
    if (a === "off") disabled = true;
    else if (a === "on") disabled = false;
    else if (a === "session off") sessionOff = true;
    const lines = [
      `roteamento: ${active() ? "ligado" : "desligado"}${sessionOff ? " (sessão off)" : ""}`,
      `fase: ${state.phase ?? "—"} · skill: ${state.skill ?? "—"}`,
      `teto: ${state.userModel ?? "?"} · ${state.userEffort ?? "?"}`,
      `sessão no tier: ${state.sessionTier ?? "—"} · subagentes rastreados: ${Object.keys(state.agents).length}`,
    ];
    return { text: lines.join("\n") };
  });

  on("turn.start", async ($, e, next) => {
    await ensure($);
    if (active()) core.onTurnStart(state, { phase: await readPhase($) });
    return next(e);
  });

  on("skill.prompt", async ($, e, next) => {
    core.onSkill(state, e.skill);
    return next(e);
  });

  on("agent.spawn", async ($, e, next) => {
    await ensure($);
    if (!active()) return next(e);
    let r = null;
    try { r = core.onSpawn(state, e, { table, config, phase: state.phase, skill: state.skill }); } catch { r = null; }
    if (!r) return next(e);
    const res = await next({ ...e, model: r.model });
    if (res && "agentId" in res) {
      core.onSpawned(state, res.agentId, r.route);
      await ledger($, { scope: "subagent", agentId: res.agentId, agentType: e.subagentType, phase: state.phase, tier: r.route.tier, model: r.model, effort: r.route.effort, source: r.route.source, ceiling: r.route.ceiling });
    }
    return res;
  });

  on("tool.call", async ($, e, next) => {
    const res = await next(e);
    if (!active() || !e.agentId || !state.agents[e.agentId]) return res;
    const isError = !!res?.isError;
    const summary = isError ? `${e.tool}: ${String(res?.text ?? "").slice(0, 200)}` : "";
    const { trigger } = core.onSubagentTool(state, e.agentId, { isError, summary }, config);
    if (trigger) {
      const a = state.agents[e.agentId];
      let decision = { action: "keep", tier: a.tier };
      try {
        const out = await $.model.complete({ model: "haiku", prompt: rubricPrompt({ agentType: "subagente", tier: a.tier, report: core.midRunReport(state, e.agentId), midRun: true }), effort: "low", timeoutMs: 8000 });
        if (out?.isAnswered) decision = combine(parseAnswers(out.text), { current: a.tier, ceiling: a.ceiling, maxTier: config.maxTier, signalRed: true, midRun: true, thresholds: config.thresholds });
      } catch {}
      const applied = core.applyMidRun(state, e.agentId, decision);
      await ledger($, { scope: "subagent", agentId: e.agentId, escalation: { at: "midRun", from: a.tier, to: applied ? decision.tier : a.tier, action: applied ? "escalate" : "keep" } });
    }
    return res;
  });

  on("turn.step", async function* ($, e, next) {
    await ensure($);
    if (!active()) return yield* next(e);
    let rw = null;
    try {
      if (e.agentId) rw = core.onSubagentStep(state, e);
      else if (!sessionOff) rw = core.onSessionStep(state, e, { table, config });
    } catch { rw = null; }
    if (rw && !e.agentId) $.ui.status(`devflow → ${rw.model ?? e.model} · ${rw.effort ?? e.effort ?? "-"} · fase ${state.phase ?? "-"}`);
    const patch = {};
    if (rw?.model) patch.model = rw.model;
    if (rw?.effort) patch.effort = rw.effort;
    return yield* next(Object.keys(patch).length ? { ...e, ...patch } : e);
  });

  on("turn.complete", async ($, e, next) => {
    const res = await next(e);
    if (active() && res?.usage) {
      const u = res.usage;
      const total = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      await ledger($, {
        scope: e.agentId ? "subagent" : "session", agentId: e.agentId, phase: state.phase, skill: state.skill,
        model: u.model, usage: u, cacheReadRatio: total ? (u.cache_read_input_tokens ?? 0) / total : undefined,
      });
    }
    return res;
  });
};
```

- [ ] **Step 5: Validate and run the kit**

Run: `claude plugin validate . && claude plugin test .`
Expected: validate sem erro (lista os eventos `session.start`, `command.run`, `turn.start`, `skill.prompt`, `agent.spawn`, `tool.call`, `turn.step`, `turn.complete` e as variáveis `HOME`, `XDG_DATA_HOME`, `PWD`); 3 testes PASS.

- [ ] **Step 5b: Detecção de outro roteador de sessão (D17, só se R-7 = SIM)**

Com a chamada de listagem de plugins que a sonda R-7 confirmou nos tipos, acrescente ao fim de `load($)`:

```js
    try {
      const names = (await $.plugin.list()).map((p) => String(p.name ?? ""));
      if (names.some((n) => /jev[-_]?router/i.test(n))) {
        sessionOff = true;
        $.ui.toast("DevFlow: outro roteador de sessão ativo — camada de sessão do DevFlow desligada; subagentes seguem roteados.");
      }
    } catch { /* sem listagem: segue (aviso fica no onboarding) */ }
```

Se a chamada confirmada em R-7 tiver outro nome ou forma, use-a no lugar de `$.plugin.list()` mantendo o mesmo efeito. Se R-7 = NÃO, pule este passo (a detecção vira follow-up, como diz o gate).

- [ ] **Step 6: Incluir o kit no sinal `integration`**

Em `tests/run-integration.sh`, troque a linha final `exec node --test "${FILES[@]}"` por:

```bash
node --test "${FILES[@]}"
if command -v claude >/dev/null 2>&1; then
  claude plugin test .
else
  echo "run-integration: claude ausente — testes do mod (hooks/router.test.mjs) NÃO rodaram" >&2
fi
```

- [ ] **Step 7: Commit**

```bash
git add hooks/router.mjs hooks/router.test.mjs hooks/hooks.json tests/run-integration.sh
git commit -m "feat(model-routing): adaptador mod (sessão por fase, subagentes, escalada no meio)"
```

---

## Task 9: Fallback clássico (`PreToolUse` da ferramenta Agent)

**Agent:** backend-specialist + security-auditor (revisão) · **Tier:** standard · **Tests:** integration

> Depende de R-2 e R-5. Os passos assumem: `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` indica o mod ativo; `updatedInput` vale sem `permissionDecision`; matcher `Agent|Task`.

**Files:**
- Create: `scripts/lib/agent-route-hook.mjs`, `hooks/pre-tool-use-agent`
- Modify: `hooks/hooks.json` (novo item em `PreToolUse`)
- Test: `tests/integration/test-pre-tool-use-agent.mjs`

**Interfaces:**
- Consumes: Tasks 1–3; `readWorkflowState` (`scripts/lib/workflow-resume.mjs`).
- Produces: stdout = um único JSON `{"hookSpecificOutput":{"hookEventName":"PreToolUse","updatedInput":{...}}}` ou nada.

- [ ] **Step 1: Write the failing test**

```js
// tests/integration/test-pre-tool-use-agent.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = new URL("../../hooks/pre-tool-use-agent", import.meta.url).pathname;

function fx({ models = "models:\n  enabled: true\n", phase = "C", sessionModel = "claude-opus-5-5" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ptu-agent-"));
  mkdirSync(join(dir, ".context/runtime/workflows"), { recursive: true });
  writeFileSync(join(dir, ".context/.devflow.yaml"), models);
  if (phase) writeFileSync(join(dir, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { name: "x", current_phase: phase } } }));
  const tp = join(dir, "t.jsonl");
  writeFileSync(tp, [JSON.stringify({ type: "user", message: { content: "oi" } }), JSON.stringify({ type: "assistant", message: { model: sessionModel, content: [] } })].join("\n") + "\n");
  return { dir, tp };
}
function run(f, toolInput, env = {}) {
  const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: toolInput, cwd: f.dir, transcript_path: f.tp, session_id: "s" });
  const r = spawnSync("bash", [HOOK], { input, encoding: "utf8", env: { ...process.env, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "", ...env } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

test("sem model → updatedInput com a rota e TODOS os campos originais", () => {
  const f = fx();
  const ti = { subagent_type: "general-purpose", prompt: "p", description: "d", run_in_background: false };
  const out = run(f, ti);
  const up = out.hookSpecificOutput.updatedInput;
  assert.equal(up.model, "haiku");
  for (const [k, v] of Object.entries(ti)) assert.deepEqual(up[k], v, k);
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
});

test("com model abaixo do teto → intocado (sai vazio)", () => {
  assert.equal(run(fx(), { subagent_type: "general-purpose", prompt: "p", model: "sonnet" }), null);
});

test("teto do transcript: sessão sonnet + architect → sonnet", () => {
  const out = run(fx({ sessionModel: "claude-sonnet-5-5", phase: "E" }), { subagent_type: "devflow:architect", prompt: "p" });
  assert.equal(out?.hookSpecificOutput?.updatedInput?.model ?? "claude-sonnet-5-5", "claude-sonnet-5-5");
});

test("desligado, mod ativo, tipo não roteável ou transcript ausente → vazio", () => {
  assert.equal(run(fx({ models: "" }), { subagent_type: "general-purpose", prompt: "p" }), null);
  assert.equal(run(fx(), { subagent_type: "general-purpose", prompt: "p" }, { CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" }), null);
  assert.equal(run(fx(), { subagent_type: "Explore", prompt: "p" }), null);
  const f = fx(); f.tp = join(f.dir, "nao-existe.jsonl");
  assert.equal(run(f, { subagent_type: "general-purpose", prompt: "p" }), null);
});

test("bytes C0 no prompt não quebram o JSON", () => {
  const out = run(fx(), { subagent_type: "general-purpose", prompt: "a\u0001b\u001fc" });
  assert.equal(out.hookSpecificOutput.updatedInput.prompt, "a\u0001b\u001fc");
});

test("stdin inválido → vazio, exit 0", () => {
  const r = spawnSync("bash", [HOOK], { input: "{lixo", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/integration/test-pre-tool-use-agent.mjs`
Expected: FAIL (`bash: .../hooks/pre-tool-use-agent: No such file or directory`, status 127)

- [ ] **Step 3: Write `scripts/lib/agent-route-hook.mjs`**

```js
// scripts/lib/agent-route-hook.mjs — fallback CLÁSSICO do roteamento de subagentes (spec D4/D15).
// Sai com um único JSON ou nada; nunca nega; qualquer erro → nada (comportamento de hoje).
import { readFileSync, openSync, readSync, fstatSync, closeSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readModels } from "./models-config.mjs";
import { resolveSubagentRoute } from "./model-routing.mjs";
import { readWorkflowState } from "./workflow-resume.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAIL = 256 * 1024;

function tail(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, TAIL);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString("utf8");
  } finally { closeSync(fd); }
}

export function sessionModelFromTranscript(path) {
  try {
    let last = null;
    for (const line of tail(path).split("\n")) {
      try {
        const o = JSON.parse(line);
        if (o?.type === "assistant" && typeof o.message?.model === "string" && o.message.model.startsWith("claude")) last = o.message.model;
      } catch { /* linha cortada na borda da cauda */ }
    }
    return last;
  } catch { return null; }
}

export function decide(input, env = process.env) {
  if (env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS === "1") return null; // o mod decide (exclusão mútua)
  const ti = input?.tool_input;
  if (!ti || typeof ti !== "object" || !input.cwd) return null;
  let src = "";
  try { src = readFileSync(join(input.cwd, ".context/.devflow.yaml"), "utf8"); } catch { return null; }
  const config = readModels(src);
  if (!config.enabled) return null;
  const table = JSON.parse(readFileSync(join(PLUGIN_ROOT, "assets/model-routing/routes.json"), "utf8"));
  const ceilingModel = sessionModelFromTranscript(input.transcript_path);
  const phase = readWorkflowState(input.cwd)?.phase ?? null;
  const route = resolveSubagentRoute({
    table, config, agentType: ti.subagent_type, phase: ["P", "R", "E", "V", "C"].includes(phase) ? phase : null,
    skill: null, taskTier: null, explicitModel: ti.model ?? null, ceilingModel, ceilingEffort: null,
  });
  if (!route || route.model === ti.model) return null;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { ...ti, model: route.model } } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const out = decide(JSON.parse(readFileSync(0, "utf8")));
    if (out) process.stdout.write(JSON.stringify(out));
  } catch { /* silêncio: comportamento de hoje */ }
  process.exit(0);
}
```

- [ ] **Step 4: Write `hooks/pre-tool-use-agent`**

```bash
#!/usr/bin/env bash
# hooks/pre-tool-use-agent — fallback clássico do roteamento de subagentes (sem function hooks).
# Toda a lógica em scripts/lib/agent-route-hook.mjs; saída = um JSON (via JSON.stringify) ou nada.
# Falha aberta: qualquer erro vira silêncio e exit 0 (nunca nega o despacho).
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
node "${PLUGIN_ROOT}/scripts/lib/agent-route-hook.mjs" 2>/dev/null || true
exit 0
```

Run: `chmod +x hooks/pre-tool-use-agent`

- [ ] **Step 5: Registrar em `hooks/hooks.json`**

No array `"PreToolUse"`, acrescente:

```json
      {
        "matcher": "Agent|Task",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" pre-tool-use-agent",
            "async": false,
            "timeout": 5
          }
        ]
      }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/integration/test-pre-tool-use-agent.mjs`
Expected: PASS (6 testes)

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/agent-route-hook.mjs hooks/pre-tool-use-agent hooks/hooks.json tests/integration/test-pre-tool-use-agent.mjs
git commit -m "feat(model-routing): fallback clássico PreToolUse para subagentes"
```

---

## Task 10: Adaptador omp (tier → model role)

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** unit

**Files:**
- Modify: `scripts/lib/omp-enrich-project-agents.mjs`
- Test: `tests/omp/omp-enrich-model-routing.test.mjs`

**Interfaces:**
- Consumes: `toRole`, `agentName` (Tasks 1/3), `readModels` (Task 2), `routes.json`.
- Produces: com `models.enabled: true`, o campo `model` de cada agente vem de `toRole(tier)` (override do projeto por agente > default do `routes.json`); os demais campos (`thinking-level`, `output`) continuam do `omp-roles.yaml`. Desligado → comportamento atual byte a byte.

- [ ] **Step 1: Write the failing test**

```js
// tests/omp/omp-enrich-model-routing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrichProjectAgents } from "../../scripts/lib/omp-enrich-project-agents.mjs";

function project(models) {
  const root = mkdtempSync(join(tmpdir(), "omp-routing-"));
  mkdirSync(join(root, ".context/agents"), { recursive: true });
  for (const a of ["architect", "documentation-writer", "code-reviewer"])
    writeFileSync(join(root, ".context/agents", `${a}.md`), `---\nname: ${a}\n---\n# ${a}\n`);
  if (models !== null) writeFileSync(join(root, ".context/.devflow.yaml"), models);
  return root;
}
const fm = (root, a) => readFileSync(join(root, ".context/agents", `${a}.md`), "utf8");

test("roteamento ligado: model vem do tier (architect → pi/slow, documentation-writer → pi/smol)", () => {
  const root = project("models:\n  enabled: true\n");
  enrichProjectAgents(root);
  assert.match(fm(root, "architect"), /model: pi\/slow/);
  assert.match(fm(root, "architect"), /thinking-level: high/);
  assert.match(fm(root, "documentation-writer"), /model: pi\/smol/);
});

test("override do projeto por agente vence o default", () => {
  const root = project("models:\n  enabled: true\n  overrides:\n    agents:\n      code-reviewer:\n        tier: cheap\n");
  enrichProjectAgents(root);
  assert.match(fm(root, "code-reviewer"), /model: pi\/smol/, "default seria pi/slow");
});

test("roteamento desligado: resultado idêntico ao comportamento atual", () => {
  const a = project(null);
  const b = project("git:\n  strategy: x\n");
  enrichProjectAgents(a);
  enrichProjectAgents(b);
  assert.equal(fm(a, "architect"), fm(b, "architect"));
  assert.match(fm(a, "architect"), /model: pi\/plan/, "default do omp-roles.yaml");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/omp/omp-enrich-model-routing.test.mjs`
Expected: FAIL no primeiro teste (`architect` recebe `model: pi/plan` do `omp-roles.yaml`)

- [ ] **Step 3: Implement**

Em `scripts/lib/omp-enrich-project-agents.mjs`, acrescente aos imports:

```js
import { readModels } from "./models-config.mjs";
import { toRole } from "./model-routing.mjs";
```

e, dentro de `enrichProjectAgents`, logo após `const defaults = roles.agent_role_defaults ?? {};`:

```js
  let models = readModels("");
  try { models = readModels(readFileSync(join(projectRoot, ".context/.devflow.yaml"), "utf-8")); } catch { /* sem config → comportamento atual */ }
  const routes = models.enabled
    ? JSON.parse(readFileSync(join(PLUGIN_ROOT, "assets/model-routing/routes.json"), "utf-8"))
    : null;
  const routedRole = (name) => {
    if (!routes) return null;
    const tier = models.overrides.agents[name] ?? routes.agents?.[name]?.tier;
    return toRole(tier);
  };
```

e troque `const fields = defaults[name]; if (!fields) continue;` por:

```js
    const role = routedRole(name);
    const fields = role ? { ...(defaults[name] ?? {}), model: role } : defaults[name];
    if (!fields) continue;
```

- [ ] **Step 4: Run tests (novo + omp existentes)**

Run: `node --test tests/omp/omp-enrich-model-routing.test.mjs $(git ls-files 'tests/omp/*.mjs')`
Expected: PASS em todos

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/omp-enrich-project-agents.mjs tests/omp/omp-enrich-model-routing.test.mjs
git commit -m "feat(model-routing): adaptador omp traduz tier para model role"
```

---

## Task 11: Skills — tier no plano e escalada entre tentativas

**Agent:** backend-specialist + documentation-writer · **Tier:** standard · **Tests:** e2e

**Files:**
- Modify: `skills/prevc-planning/SKILL.md` (seção "Agent Annotations Per Task": acrescentar `**Tier:**`)
- Modify: `skills/prevc-execution/SKILL.md` (despacho com tier da task; revisão final com `--skill final-review`; escalada no retry)
- Modify: `skills/autonomous-loop/SKILL.md` (Step 4, retry: escalada antes de re-despachar)
- Test: `tests/e2e/test-skill-model-route-commands.mjs`

**Interfaces:**
- Consumes: CLI da Task 6 (contrato exato lá descrito).
- Produces: blocos de comando nas skills que o teste extrai e **executa**.

- [ ] **Step 1: Write the failing test**

```js
// tests/e2e/test-skill-model-route-commands.mjs — executa os comandos model-route que as skills mandam rodar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const SKILLS = ["skills/prevc-execution/SKILL.md", "skills/autonomous-loop/SKILL.md"];
const RE = /^\s*node "\$CLAUDE_PLUGIN_ROOT\/scripts\/model-route\.mjs" .+$/gm;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "skill-route-"));
  mkdirSync(join(dir, ".context/runtime/workflows"), { recursive: true });
  writeFileSync(join(dir, ".context/.devflow.yaml"), "models:\n  enabled: true\n");
  writeFileSync(join(dir, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { name: "x", current_phase: "E" } } }));
  writeFileSync(join(dir, "report.md"), "teste vermelho");
  return dir;
}

test("cada skill que roteia traz ao menos um comando model-route", () => {
  for (const s of SKILLS) assert.ok((readFileSync(join(ROOT, s), "utf8").match(RE) ?? []).length > 0, s);
  assert.match(readFileSync(join(ROOT, "skills/prevc-planning/SKILL.md"), "utf8"), /\*\*Tier:\*\* cheap \| standard \| capable/);
});

test("todos os comandos documentados executam e devolvem saída utilizável", () => {
  const dir = fixture();
  const vars = { AGENT: "general-purpose", TIER: "cheap", TASK_TIER: "standard", REPORT: join(dir, "report.md"),
    ANSWERS: JSON.stringify({ failure_is_capability: 0.9, claims_done_with_evidence: 0, is_stuck: 0, needed_tier: "standard" }),
    SESSION_MODEL: "claude-opus-5-5" };
  for (const s of SKILLS) {
    for (const raw of readFileSync(join(ROOT, s), "utf8").match(RE)) {
      // 1) a raiz do plugin dentro do caminho; 2) cada "$VAR" (com as aspas) vira o valor entre aspas simples.
      const cmd = raw.trim()
        .replace(/\$CLAUDE_PLUGIN_ROOT/g, ROOT)
        .replace(/"\$\{?(\w+)\}?"/g, (m, v) => (vars[v] !== undefined ? `'${vars[v]}'` : m));
      const out = execSync(cmd, { cwd: dir, encoding: "utf8", shell: "/bin/bash" });
      assert.ok(out.trim().length > 0, `${s}: ${raw.trim()}`);
      if (/ resolve | --answers /.test(raw)) JSON.parse(out);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/e2e/test-skill-model-route-commands.mjs`
Expected: FAIL em "cada skill que roteia traz ao menos um comando model-route"

- [ ] **Step 3: `skills/prevc-planning/SKILL.md`**

Na seção "Agent Annotations Per Task", troque o bloco de exemplo por:

```markdown
## Task Group: API Layer
**Agent:** backend-specialist
**Tier:** cheap | standard | capable
**Handoff from:** architect (after design review)
```

e acrescente logo abaixo:

```markdown
**Tier** é a complexidade da task para o roteamento de modelos (spec 2026-10-08-model-routing):
`cheap` = mecânica (1–2 arquivos, spec completa); `standard` = integração entre arquivos;
`capable` = julgamento de desenho. Escolha um valor só. Inerte quando `models.enabled` não está ligado.
```

- [ ] **Step 4: `skills/prevc-execution/SKILL.md`**

Acrescente uma seção "Roteamento de modelos (quando `models.enabled`)" com este conteúdo:

````markdown
## Roteamento de modelos (quando `models.enabled`)

Ao despachar o implementer de uma task cujo plano declara `**Tier:**`, obtenha o modelo e passe-o na ferramenta Agent:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" resolve --agent general-purpose --task-tier "$TASK_TIER" --ceiling "$SESSION_MODEL"
```

Use `route.model` como `model` do despacho (se `route` for `null`, despache sem `model`). Para a revisão final da branch:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" resolve --agent general-purpose --skill final-review --ceiling "$SESSION_MODEL"
```

Quando um subagente volta com falha (teste vermelho no ledger do `verify:`, revisor reprovou, `BLOCKED`), antes do re-despacho gere a rubrica a partir do relatório do subagente salvo em arquivo:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" escalate --agent "$AGENT" --tier "$TIER" --report "$REPORT"
```

Responda a rubrica com um JSON e peça a decisão:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" escalate --agent "$AGENT" --tier "$TIER" --answers "$ANSWERS" --signal-red --ceiling "$SESSION_MODEL"
```

`escalate` → re-despache com `model` igual ao `model` devolvido; `human` → escalada humana atual; `keep` → retry no mesmo modelo.
````

- [ ] **Step 5: `skills/autonomous-loop/SKILL.md`**

No Step 4, no ramo "If `story.attempts < escalation.max_retries_per_story`", antes de "Retrying with adjusted approach", acrescente:

````markdown
     - Se `models.enabled`: gere a rubrica e a decisão de modelo para o retry:
       ```bash
       node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" escalate --agent "$AGENT" --tier "$TIER" --report "$REPORT"
       node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" escalate --agent "$AGENT" --tier "$TIER" --answers "$ANSWERS" --signal-red --ceiling "$SESSION_MODEL"
       ```
       `escalate` → retry com o `model` devolvido; `human` → Step 5 (escalada humana); `keep` → retry no mesmo modelo.
````

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/e2e/test-skill-model-route-commands.mjs`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add skills/prevc-planning/SKILL.md skills/prevc-execution/SKILL.md skills/autonomous-loop/SKILL.md tests/e2e/test-skill-model-route-commands.mjs
git commit -m "feat(model-routing): skills declaram tier e escalam entre tentativas"
```

---

## Task 12: Onboarding — doctor, guia pós-update e passo no `devflow:config`

**Agent:** backend-specialist + documentation-writer · **Tier:** standard · **Tests:** unit

**Files:**
- Modify: `scripts/lib/doctor.mjs` (novo check `model-routing`, incluído em `CHECKS`)
- Modify: `references/post-update-guide.md` (nova feature)
- Modify: `skills/config/SKILL.md` (novo passo "Roteamento de modelos")
- Test: `tests/lib/test-doctor-model-routing.mjs`

**Interfaces:**
- Consumes: `readModels` (Task 2), `routes.json` (Task 3).
- Produces: check `{ id: "model-routing", run(ctx) → { status: "OK"|"WARN"|"SKIP", diagnosis, repair } }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/test-doctor-model-routing.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECKS } from "../../scripts/lib/doctor.mjs";

const check = CHECKS.find((c) => c.id === "model-routing");
function cwdWith(yaml) {
  const d = mkdtempSync(join(tmpdir(), "doctor-mr-"));
  mkdirSync(join(d, ".context"));
  if (yaml !== null) writeFileSync(join(d, ".context/.devflow.yaml"), yaml);
  return d;
}

test("check registrado", () => assert.ok(check));

test("desligado → SKIP", () => {
  assert.equal(check.run({ cwd: cwdWith("git:\n  strategy: x\n"), env: {} }).status, "SKIP");
});

test("ligado sem function hooks → WARN explicando o fallback", () => {
  const r = check.run({ cwd: cwdWith("models:\n  enabled: true\n"), env: {} });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /fallback clássico/);
  assert.match(r.repair, /CLAUDE_CODE_ENABLE_FUNCTION_HOOKS/);
});

test("ligado com function hooks → OK", () => {
  assert.equal(check.run({ cwd: cwdWith("models:\n  enabled: true\n"), env: { CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" } }).status, "OK");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/test-doctor-model-routing.mjs`
Expected: FAIL em "check registrado" (`check` é `undefined`)

- [ ] **Step 3: Implement the check**

Em `scripts/lib/doctor.mjs`, acrescente o import `import { readModels } from "./models-config.mjs";`, o objeto abaixo antes de `export const CHECKS`, e `modelRouting` ao fim do array `CHECKS`:

```js
const modelRouting = {
  id: "model-routing",
  title: "Roteamento de modelos (models: no .devflow.yaml)",
  severity: "warn",
  destructive: false,
  run(ctx) {
    let src = "";
    try { src = readFileSync(join(ctx.cwd, ".context", ".devflow.yaml"), "utf-8"); } catch { /* ausente */ }
    const m = readModels(src);
    if (!m.enabled) return { status: "SKIP", diagnosis: "Roteamento de modelos desligado (opt-in).", repair: "" };
    const env = ctx.env ?? process.env;
    if (env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS !== "1") {
      return {
        status: "WARN",
        diagnosis: "Roteamento ligado sem function hooks: só o fallback clássico (subagentes, escalada entre tentativas) está ativo.",
        repair: 'Para sessão por fase, esforço por passo e escalada no meio: adicione "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" ao bloco env do ~/.claude/settings.json e reinicie.',
      };
    }
    return { status: "OK", diagnosis: "Roteamento de modelos ativo pelo mod.", repair: "" };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/test-doctor-model-routing.mjs`
Expected: PASS

- [ ] **Step 5: `references/post-update-guide.md`**

Acrescente a seção:

````markdown
## Roteamento de modelos

**O que é:** escolhe modelo e esforço da sessão (por fase do PREVC e skill) e dos subagentes (por agente, fase e tier da task), sempre abaixo do modelo e do esforço que você escolheu. Mede a economia com `model-route report`.

**Detecção:** bloco `models:` ausente no `.devflow.yaml`.
```bash
! grep -q "^models:" .context/.devflow.yaml 2>/dev/null
```

**Se NÃO configurado:**
1. Rode `/devflow config` e escolha "Roteamento de modelos".
2. (Recomendado) Adicione `"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"` ao bloco `env` do `~/.claude/settings.json` para a camada de sessão e a escalada no meio.
````

- [ ] **Step 6: `skills/config/SKILL.md`**

Acrescente um passo "Roteamento de modelos" com este roteiro (perguntas em pt-BR, uma por vez):

```markdown
### Passo: Roteamento de modelos (opcional)

1. Detecte: `grep -q "^models:" .context/.devflow.yaml`; `printenv CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`; runtimes ativos.
2. Pergunte: ligar o roteamento? Camadas: sessão por fase (só com function hooks) e/ou subagentes. `maxTier` (opcional). Ledger de medição (opt-in; fica em `~/.local/share/devflow-model-routing/`, nunca no repo, sem conteúdo).
3. Explique o custo de cache: cada troca de fase faz a primeira mensagem seguinte reler o contexto sem cache; o default troca uma vez por workflow (R→E).
4. Function hooks: sem `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, só o fallback clássico roda (subagentes, escalada entre tentativas). Mostre o bloco `env` para o usuário colar; **nunca** escreva no `~/.claude/settings.json`.
5. Grave o bloco `models:` no `.devflow.yaml` em estilo bloco (o leitor não aceita mapas inline):
   ```yaml
   models:
     enabled: true
     session: true
     subagents: true
     ledger: true
   ```
6. omp ∈ runtimes: rode `node "$CLAUDE_PLUGIN_ROOT/scripts/lib/omp-enrich-project-agents.mjs" .`.
7. Confirme com `/devflow:devflow-doctor` (check `model-routing`).
```

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/doctor.mjs references/post-update-guide.md skills/config/SKILL.md tests/lib/test-doctor-model-routing.mjs
git commit -m "feat(model-routing): doctor, guia pós-update e passo no devflow:config"
```

---

## Task 13: ADR e documentação

**Agent:** architect + documentation-writer · **Tier:** standard · **Tests:** lint

**Files:**
- Create: ADR via `devflow:adr-builder` (modo CREATE, prefilled com a spec), em `.context/engineering/adrs/`
- Create: `docs/model-routing.md`
- Modify: `README.md` (seção de features: um parágrafo + link para `docs/model-routing.md`)

- [ ] **Step 1: Criar a ADR**

Invoque `devflow:adr-builder` em modo CREATE (`/devflow adr:new --mode=prefilled`) com o briefing: título "Roteamento de modelos do DevFlow — lib única com tier abstrato, sessão por fase e subagentes por agente/fase/task, teto na escolha do usuário, três adaptadores"; status Proposto; kind `gated` (gate: relatório de 2 semanas confirmar economia sem regressão de escaladas); guardrails derivados de D4, D5, D6, D11, D14 e D17 da spec; versão mínima do Claude Code registrada na sonda R-8. Confira o número livre com `ls .context/engineering/adrs/` antes (há renumeração pendente em outra feature).

- [ ] **Step 2: Rodar a auditoria da ADR**

Run: `node "$CLAUDE_PLUGIN_ROOT/scripts/adr-audit.mjs" .context/engineering/adrs/<arquivo-novo>.md`
Expected: os 12 checks sem FAIL.

- [ ] **Step 3: Escrever `docs/model-routing.md`**

Conteúdo: o que é; as três camadas (sessão, subagentes, escalada); os três adaptadores e o que cada um entrega (tabela da spec §4); como ligar (`/devflow config`); `/devflow-route`; `model-route report`; custo de cache; limites declarados (peso na cota não é público; worktrees). Sem nome de projeto privado e sem caminho local.

- [ ] **Step 4: Rodar o sinal lint**

Run: `bash tests/run-lint.sh`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add .context/engineering/adrs/ docs/model-routing.md README.md
git commit -m "docs(model-routing): ADR e guia do roteamento de modelos"
```

---

## Fase V — verificação real (não é task de implementação)

Além dos sinais `unit`, `integration`, `e2e` e `lint` observados no ledger do `verify:` (ADR-013):

1. Sessão real com o mod ativo (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`), atravessando P→E num projeto descartável: conferir no ledger/`turn.complete` a troca da sessão na fronteira R→E (uma só), um subagente `general-purpose` no modelo roteado e o teto respeitado.
2. A mesma coisa com o mod desligado: conferir o fallback clássico pelo `subagents/agent-*.meta.json` (`model`).
3. `node scripts/model-route.mjs report` sobre as duas sessões.
