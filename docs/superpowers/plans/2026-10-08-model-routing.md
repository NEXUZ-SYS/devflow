# Roteamento de modelos do DevFlow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** model-routing | **Scale:** LARGE | **Phase:** R (revisado) → E

**Goal:** Escolher modelo e esforço da sessão principal (por fase/skill) e dos subagentes (por agente/fase/task), com teto na escolha do usuário, escalada por rubrica e medição, em três adaptadores (mod, hook clássico, omp).

**Architecture:** Libs puras (`model-routing`, `models-config`, `yaml-block`, `escalation`, `routing-ledger`, `routing-report`, `router-core`) sem `node:*`, importáveis pelo mod. Três adaptadores finos consomem as libs: o mod (`hooks/router.mjs`, function hooks), o fallback clássico (`hooks/pre-tool-use-agent`) e o enrich do omp. Um CLI (`scripts/model-route.mjs`) serve às skills (resolve/escalate/report).

**Tech Stack:** Node ≥ 20 (ESM `.mjs`, `node:test`), bash, function hooks do Claude Code 2.1.294 (`claude plugin test`/`validate`), subset YAML de `scripts/lib/frontmatter.mjs`, `scripts/lib/safe-read.mjs`.

**Agents:** backend-specialist (libs, CLI, mod, omp), security-auditor (revisão pesada das Tasks 8 e 9), test-writer (propriedades, kit de mods, e2e), architect (ADR), documentation-writer (onboarding, guias).

**Spec:** `docs/superpowers/specs/2026-10-08-model-routing-design.md` (D1–D21; §11 = resultados das sondas da fase R)

```yaml
requiredSignals: [unit, integration, e2e, lint]
```

## Global Constraints

- Libs em `scripts/lib/model-routing.mjs`, `models-config.mjs`, `yaml-block.mjs`, `escalation.mjs`, `routing-ledger.mjs`, `routing-report.mjs`, `router-core.mjs` **não importam `node:*`** nem usam `require(` — o mod roda sem Node. Cada uma tem teste de pureza.
- Tiers: `cheap < standard < capable < top`. Claude Code (alias): `haiku/sonnet/opus/fable`. omp: `pi/smol/default/pi/slow/pi/plan`. Esforço: `low < medium < high < xhigh < max`.
- **D5 teto:** nada roda acima do modelo e do esforço do usuário. Teto ilegível → não roteia (comportamento de hoje).
- **D18 opt-in duplo:** só roteia com `models.enabled: true` no `.context/.devflow.yaml` **e** `DEVFLOW_MODEL_ROUTING=1` no ambiente. Todo adaptador passa a config por `effectiveConfig(config, envValue)`. `agents/*.md` **não** ganham `model:`.
- **D19:** `models.midRun.enabled` é `false` por padrão.
- **D21:** no `turn.step`, `model` só como **ID completo** aprendido de um `agent.spawn`; na ferramenta Agent / `agent.spawn`, só **alias**. Tier igual ao teto → não toca no despacho.
- Parser único (ADR-011): `models:` só é lido por `readModels` (`scripts/lib/models-config.mjs`), reexportado por `scripts/lib/devflow-config.mjs`.
- **Leitura segura** de todo arquivo vindo do repositório (`.devflow.yaml`, `prevc.json`, relatório, ledger, transcript): `readRegularFileSafe`/`readRegularFileDetailed` no Node; `$.fs.stat({resolve:true})` + checagens no mod.
- Falha → comportamento de hoje. Nenhum adaptador nega (`deny`/`block`) um despacho; o clássico nunca emite `permissionDecision`.
- Ledger: chaves por allowlist e valores por regex/enum; nunca prompt, resposta ou texto de erro; fora do repositório (`$XDG_DATA_HOME` ou `~/.local/share` + `/devflow-model-routing/`).
- Testes escritores rodam em `mkdtemp` (nunca mutam diretório versionado).
- No mod, toda função que recebe `$` é declarada **no topo do módulo** (exigência do `claude plugin validate`); hooks que decidem têm `.catch` que devolve `next(e)`.
- A tabela do plugin é `assets/model-routing/routes.json` (chaves com `:` não cabem no subset YAML). Overrides no `.devflow.yaml` em estilo bloco.
- As Tasks 8 e 9 editam o mesmo `hooks/hooks.json`: executar em sequência.
- Os runners (`tests/run-*.sh`) só enxergam arquivos rastreados pelo git; durante a task, rode cada teste pelo caminho (`node --test <arquivo>`). Commits na branch `feature/model-routing`.

## Review Focus

1. **Repositório clonado com `.devflow.yaml` ou `prevc.json` apontando para `/dev/zero`, FIFO ou `/dev/tty`** → nenhum adaptador trava nem incha; roteamento cai para "sem rota". Testes nas Tasks 6 e 9 (PoC da revisão de segurança).
2. **Repositório liga `models.enabled` sem o usuário confirmar** (`DEVFLOW_MODEL_ROUTING` ausente) → nada muda. Testes nas Tasks 1, 6, 9 e 10.
3. **Sessão em `sonnet` + architect (default `capable`)** → o subagente não é tocado (herda `sonnet`); nunca `opus`. Testes nas Tasks 3 e 7.
4. **`/model` ou `/effort` do usuário no meio da sessão** → novo teto no passo seguinte. Teste na Task 7 (`observeSession`).
5. **Tier sem ID completo conhecido na sessão** → o mod ajusta só o esforço, nunca manda alias ao `turn.step` (sonda R-3: alias derruba o turno). Teste na Task 7.

---

## Fase R — resultado (aplicado neste plano)

Revisões: architect e security-auditor **APROVADO-COM-RESSALVAS**; correções incorporadas aqui, sem voltar à P (decisão do operador). Sondas R-1..R-10 respondidas — tabela na spec §11. Decisões do operador na R: D18 (opt-in duplo), D19 (escalada no meio desligada por padrão, perguntada no onboarding), D20 (omp completo via `--runtime omp`). D21 derivada da sonda R-3.

| Achado | Onde foi corrigido |
|---|---|
| Arquitetura 1 — heurística de `/model` | Task 7: `observeSession` lê `e.model`/`e.effort` a cada passo (sondas: são sempre os do usuário) |
| Arquitetura 2 / Segurança 5 — alias × ID | Tasks 3, 7, 8, 9: D21 |
| Arquitetura 3 / Segurança 9 — `prevc.json` no mod | Task 8: `safeRead` com `$.fs.stat({resolve:true})` |
| Arquitetura 4 — override de fase rebaixa revisão final | Task 3: skill antes da fase do projeto |
| Arquitetura 5 — custo de cache do esforço | Sonda R-10: não há custo |
| Arquitetura 6 — skill passa teto já roteado | Task 11: skills não passam `--ceiling` |
| Arquitetura 7 — `skill.prompt` de subagente | Task 7: `onSkill` ignora `agentId`; skill limpa na troca de fase |
| Arquitetura 8 / Segurança 4 — decisor em loop | Task 7: dispara só em `streak === N`, uma vez por subagente, só com `midRun.enabled` |
| Arquitetura 9 — teto com sessão desligada | Task 7/8: `observeSession` sempre; reescrita só com a camada ligada |
| Arquitetura 10 — testes do mod | Task 8: kit cobre `agent.spawn`/opt-in/teto; sessão e escalada pelos testes puros da Task 7 + verificação real na V |
| Arquitetura 11 / Segurança 2 — omp | Tasks 6 e 10: `--runtime omp`; enrich com teto e `maxTier` |
| Arquitetura 12 / Segurança 6 — ledger | Task 5: valores por regex/enum; Task 8: uma escrita por turno, teto de linhas |
| Arquitetura 13 — consequências das sondas | Resolvidas pelas sondas (§11 da spec) |
| Arquitetura 14 — YAGNI | D19: escalada no meio atrás de flag |
| Arquitetura 15 — ADR-011 | Task 13: guardrail na ADR |
| Segurança 1 — `/dev/zero`/FIFO | Tasks 6, 9, 10: leitura segura; Task 9: `exec node` |
| Segurança 3 — repo liga sozinho | D18: `effectiveConfig` (Task 1) em todos os adaptadores |
| Segurança 7 — redação quadrática | Task 4: corta 16 KB antes de redigir |
| Segurança 8 — protótipo | Task 5: `Object.create(null)` |
| Segurança 10 — teto ilegível | Task 13: declarado na ADR |

---

## Task 1: Núcleo de tiers, esforço e opt-in (lib pura)

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** unit

**Files:**
- Create: `scripts/lib/model-routing.mjs`
- Test: `tests/lib/model-routing.test.mjs`

**Interfaces:**
- Produces: `TIERS`, `EFFORTS`, `PHASES`, `tierOf(value) → tier|null`, `toAlias(tier)`, `toRole(tier)`, `nextTier(tier)`, `minTier(a,b)`, `capAtCeiling(tier, ceilingTier, maxTier?) → tier|null`, `capEffort(effort, ceilingEffort) → effort|null`, `stepEffort(base, failureStreak, ceilingEffort) → effort|null`, `phaseFromPrevcJson(text) → phase|null`, `effectiveConfig(config, envValue) → config` (D18: `enabled` só fica `true` com `envValue === "1"`).

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
  assert.equal(R.stepEffort(null, 1, "max"), null);
});

test("phaseFromPrevcJson só aceita P/R/E/V/C", () => {
  const ok = JSON.stringify({ status: { project: { current_phase: "E" } } });
  assert.equal(R.phaseFromPrevcJson(ok), "E");
  assert.equal(R.phaseFromPrevcJson(JSON.stringify({ status: { project: { current_phase: "rm -rf" } } })), null);
  assert.equal(R.phaseFromPrevcJson("root:x:0:0:root:/root:/bin/bash"), null);
  assert.equal(R.phaseFromPrevcJson(""), null);
  assert.equal(R.phaseFromPrevcJson(undefined), null);
});

test("effectiveConfig: o repositório sozinho não liga o roteamento (D18, Review Focus 2)", () => {
  const cfg = { enabled: true, session: true };
  assert.equal(R.effectiveConfig(cfg, "1").enabled, true);
  for (const v of [undefined, "", "0", "true", "yes", 1]) assert.equal(R.effectiveConfig(cfg, v).enabled, false, String(v));
  assert.equal(R.effectiveConfig({ enabled: false }, "1").enabled, false);
  assert.equal(R.effectiveConfig(null, "1").enabled, false);
  assert.equal(cfg.enabled, true, "não muta a config original");
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

// D5: o resultado nunca passa do teto nem do maxTier. Teto ilegível → null (não roteia).
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

// D18: o repositório pede (models.enabled); só o usuário liga (DEVFLOW_MODEL_ROUTING=1).
export function effectiveConfig(config, envValue) {
  const base = config && typeof config === "object" ? config : {};
  return { ...base, enabled: base.enabled === true && envValue === "1" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/model-routing.test.mjs`
Expected: PASS (11 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/model-routing.mjs tests/lib/model-routing.test.mjs
git commit -m "feat(model-routing): núcleo puro de tiers, teto, esforço e opt-in"
```

---

## Task 2: Bloco `models:` do `.devflow.yaml` (parser único, puro)

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `scripts/lib/yaml-block.mjs`, `scripts/lib/models-config.mjs`
- Modify: `scripts/lib/devflow-config.mjs` (trocar `namedBlock`/`normalizeNewlines` locais pelo import; reexportar `readModels`; ramo CLI `read-models`)
- Modify: `tests/lib/devflow-config-pure.test.mjs` (allowlist de imports)
- Test: `tests/lib/models-config.test.mjs`

**Interfaces:**
- Consumes: `TIERS`, `PHASES` (Task 1); `parseYaml` de `scripts/lib/frontmatter.mjs`.
- Produces: `namedBlock(text, name) → string[]`, `dedentBlock(lines) → string`; `readModels(src) → ModelsConfig`:
  `{ enabled, session, subagents, maxTier, ledger, overrides: { agents: {[agente]: tier}, phases: {[fase]: {[agente]: tier}}, session: { phases: {[fase]: tier|"ceiling"} } }, midRun: { enabled, failureStreak }, thresholds: { capability, claimsDone } }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/models-config.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
    enabled: true
    failureStreak: 4
  thresholds:
    capability: 0.7
    claimsDone: 2
other: 1
`;

test("ausência do bloco = tudo desligado com defaults (midRun desligado — D19)", () => {
  const m = readModels("git:\n  strategy: x\n");
  assert.equal(m.enabled, false);
  assert.equal(m.session, true);
  assert.equal(m.subagents, true);
  assert.equal(m.ledger, false);
  assert.equal(m.maxTier, null);
  assert.deepEqual(m.midRun, { enabled: false, failureStreak: 3 });
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
  assert.deepEqual(m.midRun, { enabled: true, failureStreak: 4 });
  assert.equal(m.thresholds.capability, 0.7);
  assert.equal(m.thresholds.claimsDone, 0.8, "fora de [0,1] mantém o default");
});

test("valores inválidos nunca ligam o roteamento nem lançam", () => {
  assert.equal(readModels("models:\n  enabled: yes\n").enabled, false);
  assert.equal(readModels("models:\n  enabled: true\n  maxTier: ultra\n").maxTier, null);
  assert.equal(readModels("models:\n  enabled: true\n  midRun:\n    enabled: sim\n").midRun.enabled, false);
  for (const src of ["models:\n  enabled: *ref\n", "models:\n", null, 42, "models:\n  enabled: true\n" + "x".repeat(300 * 1024)]) {
    assert.equal(typeof readModels(src).enabled, "boolean");
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

- [ ] **Step 5: Atualizar a allowlist do teste de pureza do parser**

Em `tests/lib/devflow-config-pure.test.mjs`, troque a linha do `ALLOWED` por:

```js
  // yaml-block.mjs e models-config.mjs (roteamento de modelos): puros, sem node:* — travados por
  // tests/lib/models-config.test.mjs ("yaml-block e models-config são puros").
  const ALLOWED = new Set(["node:fs", "./frontmatter.mjs", "./safe-read.mjs", "./yaml-block.mjs", "./models-config.mjs"]);
```

- [ ] **Step 6: Write `scripts/lib/models-config.mjs`**

```js
// scripts/lib/models-config.mjs — leitor ÚNICO do bloco `models:` do .devflow.yaml (ADR-011).
// PURO (o mod importa). Nunca lança: qualquer problema → roteamento desligado ou entrada ignorada.
// Lembrete (D18): este bloco é o PEDIDO do repositório; quem liga é effectiveConfig + env do usuário.
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
    midRun: { enabled: false, failureStreak: 3 },
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

  out.midRun.enabled = isTrue(data.midRun?.enabled);
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

- [ ] **Step 7: Run tests to verify they pass (incluindo os do parser existente)**

Run: `node --test tests/lib/models-config.test.mjs $(git ls-files 'tests/**/*devflow-config*' | grep -E '\.mjs$')`
Expected: PASS em todos (o refactor do `namedBlock` não muda comportamento).

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/yaml-block.mjs scripts/lib/models-config.mjs scripts/lib/devflow-config.mjs tests/lib/models-config.test.mjs tests/lib/devflow-config-pure.test.mjs
git commit -m "feat(model-routing): bloco models: no parser único do .devflow.yaml"
```

---

## Task 3: Tabela do plugin e resolvedores (sessão e subagente)

**Agent:** backend-specialist · **Tier:** standard · **Tests:** unit

**Files:**
- Create: `assets/model-routing/routes.json`
- Modify: `scripts/lib/model-routing.mjs` (acrescentar `agentName`, `resolveSubagentRoute`, `resolveSessionRoute`)
- Test: `tests/lib/model-routing-resolve.test.mjs`

**Interfaces:**
- Consumes: Task 1; `ModelsConfig` (Task 2) já passado por `effectiveConfig`.
- Produces:
  - `agentName(agentType) → string` (tira o prefixo `devflow:`).
  - `resolveSubagentRoute({ table, config, agentType, phase, skill, taskTier, explicitModel, ceilingModel, ceilingEffort }) → null | { tier, model, effort, source, ceiling }`. `model` é **alias** a aplicar ou `null` (= não tocar no despacho: tier igual ao teto, ou `model` explícito já dentro do teto). `source ∈ plan|skill|project|phase|agent|explicit|inherit`.
  - Precedência (D3 revisada): `explicit` → `plan` → `skill` → projeto-fase → plugin-fase → projeto-agente → plugin-agente → `inherit`.
  - `resolveSessionRoute({ table, config, phase, skill, userModel, userEffort }) → null | { tier, effort, source, ceiling }` (o ID completo é resolvido pelo `router-core`, D21).

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
import { resolveSubagentRoute, resolveSessionRoute, agentName, effectiveConfig } from "../../scripts/lib/model-routing.mjs";
import { readModels } from "../../scripts/lib/models-config.mjs";

const table = JSON.parse(readFileSync(new URL("../../assets/model-routing/routes.json", import.meta.url), "utf8"));
const cfgOf = (yaml) => effectiveConfig(readModels(yaml), "1");
const on = cfgOf("models:\n  enabled: true\n");
const base = { table, config: on, ceilingModel: "claude-opus-5-5", ceilingEffort: "xhigh" };

test("desligado (repo sem models, sem opt-in do usuário ou subagents:false) → null", () => {
  assert.equal(resolveSubagentRoute({ ...base, config: cfgOf(""), agentType: "devflow:documentation-writer" }), null);
  assert.equal(resolveSubagentRoute({ ...base, config: effectiveConfig(readModels("models:\n  enabled: true\n"), undefined), agentType: "devflow:documentation-writer" }), null);
  assert.equal(resolveSubagentRoute({ ...base, config: cfgOf("models:\n  enabled: true\n  subagents: false\n"), agentType: "devflow:documentation-writer" }), null);
});

test("tipo não roteável fica intocado", () => {
  for (const t of ["Explore", "Plan", "claude-code-guide", "outro-plugin:agente", "fork"]) {
    assert.equal(resolveSubagentRoute({ ...base, agentType: t, phase: "E" }), null, t);
  }
});

test("rota abaixo do teto devolve alias; rota igual ao teto não toca no despacho (D21)", () => {
  const d = resolveSubagentRoute({ ...base, agentType: "devflow:documentation-writer", phase: "E" });
  assert.deepEqual([d.tier, d.model, d.effort, d.source], ["cheap", "haiku", "low", "agent"]);
  const a = resolveSubagentRoute({ ...base, agentType: "devflow:architect", phase: "E" });
  assert.deepEqual([a.tier, a.model, a.source], ["capable", null, "agent"]);
});

test("teto: sessão em sonnet nunca põe o architect em opus (Review Focus 3)", () => {
  const r = resolveSubagentRoute({ ...base, ceilingModel: "claude-sonnet-5-5", agentType: "devflow:architect" });
  assert.equal(r.tier, "standard");
  assert.equal(r.model, null, "igual ao teto: herda o modelo da sessão");
});

test("teto ilegível → null", () => {
  assert.equal(resolveSubagentRoute({ ...base, ceilingModel: "best", agentType: "devflow:architect" }), null);
});

test("precedência: plan > skill > projeto-fase > fase > projeto-agente > agente", () => {
  const cfg = cfgOf(
    "models:\n  enabled: true\n  overrides:\n    agents:\n      code-reviewer:\n        tier: cheap\n    phases:\n      R:\n        code-reviewer:\n          tier: standard\n      E:\n        general-purpose:\n          tier: cheap\n",
  );
  const r = (agentType, extra) => resolveSubagentRoute({ ...base, config: cfg, agentType, ...extra });
  assert.equal(r("devflow:code-reviewer", { phase: "R", taskTier: "cheap" }).source, "plan");
  assert.deepEqual([r("devflow:code-reviewer", { phase: "R" }).tier, r("devflow:code-reviewer", { phase: "R" }).source], ["standard", "project"]);
  assert.deepEqual([r("devflow:code-reviewer", { phase: "E" }).tier, r("devflow:code-reviewer", { phase: "E" }).source], ["cheap", "project"]);
  const finalReview = r("general-purpose", { phase: "E", skill: "final-review" });
  assert.deepEqual([finalReview.tier, finalReview.source], ["capable", "skill"], "o override de fase do projeto não rebaixa a revisão final");
  const plain = resolveSubagentRoute({ ...base, agentType: "devflow:code-reviewer", phase: "R" });
  assert.deepEqual([plain.tier, plain.source], ["capable", "phase"]);
});

test("model explícito: respeitado dentro do teto, rebaixado (alias) acima dele, ignorado se desconhecido", () => {
  const inside = resolveSubagentRoute({ ...base, agentType: "general-purpose", explicitModel: "sonnet" });
  assert.deepEqual([inside.tier, inside.model, inside.source], ["standard", null, "explicit"]);
  const above = resolveSubagentRoute({ ...base, ceilingModel: "claude-sonnet-5-5", agentType: "general-purpose", explicitModel: "opus" });
  assert.deepEqual([above.tier, above.model], ["standard", "sonnet"]);
  assert.equal(resolveSubagentRoute({ ...base, agentType: "general-purpose", explicitModel: "gpt-5" }), null);
});

test("maxTier do projeto limita mesmo abaixo do teto", () => {
  const cfg = cfgOf("models:\n  enabled: true\n  maxTier: standard\n");
  const r = resolveSubagentRoute({ ...base, config: cfg, agentType: "devflow:architect" });
  assert.deepEqual([r.tier, r.model], ["standard", "sonnet"]);
});

test("esforço do subagente nunca passa do esforço do usuário", () => {
  const r = resolveSubagentRoute({ ...base, ceilingEffort: "medium", agentType: "devflow:architect" });
  assert.equal(r.effort, "medium");
});

test("agentName tira só o prefixo devflow:", () => {
  assert.equal(agentName("devflow:architect"), "architect");
  assert.equal(agentName("general-purpose"), "general-purpose");
});

test("sessão: fase E vai para standard; P fica no teto; fora de workflow não muda", () => {
  const s = (extra) => resolveSessionRoute({ table, config: on, userModel: "claude-opus-5-5", userEffort: "xhigh", ...extra });
  assert.deepEqual(s({ phase: "E", skill: null }), { tier: "standard", effort: "medium", source: "phase", ceiling: "capable" });
  assert.equal(s({ phase: "P" }).tier, "capable");
  assert.equal(s({ phase: null }).source, "inherit");
});

test("sessão: esforço por skill, 'ceiling' = esforço do usuário, nunca acima dele", () => {
  const s = (skill, userEffort = "xhigh") =>
    resolveSessionRoute({ table, config: on, phase: "P", skill, userModel: "claude-opus-5-5", userEffort });
  assert.equal(s("superpowers:brainstorming").effort, "xhigh");
  assert.equal(s("devflow:commit-message").effort, "low");
  assert.equal(s("superpowers:brainstorming", "high").effort, "high");
});

test("sessão: override do projeto, camada desligada e opt-in ausente", () => {
  const cfg = cfgOf("models:\n  enabled: true\n  overrides:\n    session:\n      phases:\n        E: capable\n");
  assert.equal(resolveSessionRoute({ table, config: cfg, phase: "E", userModel: "claude-opus-5-5", userEffort: "high" }).tier, "capable");
  assert.equal(resolveSessionRoute({ table, config: cfgOf("models:\n  enabled: true\n  session: false\n"), phase: "E", userModel: "opus", userEffort: "high" }), null);
  assert.equal(resolveSessionRoute({ table, config: effectiveConfig(readModels("models:\n  enabled: true\n"), "0"), phase: "E", userModel: "opus", userEffort: "high" }), null);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/lib/model-routing-resolve.test.mjs`
Expected: FAIL com `does not provide an export named 'resolveSubagentRoute'`

- [ ] **Step 4: Append the resolvers to `scripts/lib/model-routing.mjs`**

```js
// ---- resolvedores (spec §5, D3 revisada na fase R, D21) ----

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
  const hasExplicit = explicitModel !== undefined && explicitModel !== null && explicitModel !== "";
  if (hasExplicit) {
    const t = tierOf(explicitModel);
    if (!t) return null;
    chosen = { tier: t, source: "explicit" };
  } else {
    chosen = pick(
      [taskTier, "plan"],
      [table.skills?.[skill]?.[name] ?? table.skills?.[skill]?.["*"], "skill"],
      [config.overrides?.phases?.[phase]?.[name], "project"],
      [table.phases?.[phase]?.[name], "phase"],
      [config.overrides?.agents?.[name], "project"],
      [table.agents?.[name]?.tier, "agent"],
    ) ?? { tier: ceiling, source: "inherit" };
  }

  const tier = capAtCeiling(chosen.tier, ceiling, config.maxTier);
  if (!tier) return null;
  const effort = capEffort(table.agents?.[name]?.effort ?? table.effortByTier?.[tier], ceilingEffort);
  // D21: alias só quando muda algo. Igual ao teto (herda) ou explícito já dentro do teto → não toca.
  const unchanged = hasExplicit ? tier === chosen.tier : tier === ceiling;
  return { tier, model: unchanged ? null : toAlias(tier), effort, source: chosen.source, ceiling };
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
  return { tier, effort: capEffort(wantEffort, userEffort), source, ceiling };
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
  - `rubricPrompt({ agentType, tier, report, midRun }) → string` (corta em 16 000, redige, corta em 8 000).
  - `parseAnswers(text) → Answers | null`, `Answers = { failure_is_capability, claims_done_with_evidence, is_stuck, needed_tier }`.
  - `combine(answers, { current, ceiling, maxTier, signalRed, midRun, thresholds }) → { action: "keep"|"human"|"escalate", tier, reason }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/escalation.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rubricPrompt, parseAnswers, combine } from "../../scripts/lib/escalation.mjs";
import { TIERS } from "../../scripts/lib/model-routing.mjs";

const TH = { capability: 0.6, claimsDone: 0.8 };
const A = (o) => ({ failure_is_capability: 0.9, claims_done_with_evidence: 0.1, is_stuck: 0.5, needed_tier: "standard", ...o });
const ctx = (o) => ({ current: "cheap", ceiling: "capable", maxTier: null, signalRed: true, midRun: false, thresholds: TH, ...o });

test("rubricPrompt redige e-mail, trunca e pede JSON com as 4 chaves", () => {
  const report = "email a@b.com " + "x".repeat(20000);
  const p = rubricPrompt({ agentType: "general-purpose", tier: "cheap", report, midRun: false });
  assert.doesNotMatch(p, /a@b\.com/);
  assert.ok(p.length < 9500, `prompt grande demais: ${p.length}`);
  for (const k of ["failure_is_capability", "claims_done_with_evidence", "is_stuck", "needed_tier"]) assert.match(p, new RegExp(k));
});

test("rubricPrompt corta antes de redigir: relatório de 1 MB termina rápido (segurança 7)", () => {
  const t0 = Date.now();
  rubricPrompt({ agentType: "x", tier: "cheap", report: "_".repeat(1024 * 1024), midRun: false });
  assert.ok(Date.now() - t0 < 2000, `demorou ${Date.now() - t0} ms`);
});

test("parseAnswers aceita JSON cercado por texto e cerca de código", () => {
  const fence = "`".repeat(3); // cerca montada: três crases literais quebrariam o markdown do plano
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

test("propriedade: nenhuma resposta manipulada escala acima do teto ou do maxTier", () => {
  const nums = [0, 0.59, 0.6, 1];
  for (const current of TIERS) for (const ceiling of TIERS) for (const maxTier of [null, ...TIERS]) for (const needed of TIERS)
    for (const cap of nums) for (const midRun of [false, true]) {
      const d = combine(A({ needed_tier: needed, failure_is_capability: cap }), ctx({ current, ceiling, maxTier, midRun }));
      if (d.action !== "escalate") continue;
      assert.ok(TIERS.indexOf(d.tier) <= TIERS.indexOf(ceiling), `${current}/${ceiling}/${needed} → ${d.tier}`);
      if (maxTier) assert.ok(TIERS.indexOf(d.tier) <= TIERS.indexOf(maxTier));
      assert.ok(TIERS.indexOf(d.tier) > TIERS.indexOf(current), "escalada sempre sobe");
    }
});

test("escalation.mjs é puro", () => {
  const src = readFileSync(new URL("../../scripts/lib/escalation.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /from\s+["']node:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/escalation.test.mjs`
Expected: FAIL com `Cannot find module '.../scripts/lib/escalation.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/escalation.mjs — rubrica e combinação da escalada (spec §6). PURO.
// O julgamento vem do controlador (entre tentativas) ou de $.model.complete (no meio);
// a DECISÃO é deste código, por limiares (D7/D14).
import { TIERS, nextTier, capAtCeiling } from "./model-routing.mjs";
import { redact } from "./instinct-redact.mjs";

const PRE_CUT = 16000; // a redação é quadrática no pior caso (segurança 7): corta antes
const MAX_REPORT = 8000;
const KEYS = ["failure_is_capability", "claims_done_with_evidence", "is_stuck"];

export function rubricPrompt({ agentType, tier, report, midRun }) {
  const body = redact(String(report ?? "").slice(0, PRE_CUT)).slice(0, MAX_REPORT);
  return [
    `Avalie o resultado de um subagente (${String(agentType).slice(0, 64)}, tier atual: ${String(tier).slice(0, 16)}${midRun ? ", ainda em execução" : ""}).`,
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

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/escalation.test.mjs`
Expected: PASS (8 testes). Se o teste de e-mail falhar, rode `node -e 'import("./scripts/lib/instinct-redact.mjs").then(m=>console.log(m.redact("e a@b.com")))'` para confirmar o que a redação best-effort cobre (ADR-005) e ajuste só a asserção de redação, nunca a de truncamento.

- [ ] **Step 5: Commit**

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
  - `LEDGER_KEYS`, `buildEntry(fields) → object` (chave por allowlist; **valor** por regex `^[A-Za-z0-9:_./@\[\]-]{1,64}$` ou enum; `usage` só números), `projectKey(path) → string` (FNV-1a 64 bits, hex), `ledgerDirFrom({ xdgDataHome, home, cwd }) → string`.
  - `aggregate(entries) → { subagents: Map<agentType, Map<model, Usage&{n}>>, session: Map<phase, Map<model, Usage&{n}>>, escalations: Map<agentType, {dispatches, escalated}>, midRunSwitches, phaseSwitches: [{phase, cacheReadRatio}] }`, `renderMarkdown(agg) → string`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/routing-ledger.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEntry, LEDGER_KEYS, projectKey, ledgerDirFrom } from "../../scripts/lib/routing-ledger.mjs";
import { aggregate, renderMarkdown } from "../../scripts/lib/routing-report.mjs";

test("buildEntry: só chaves da allowlist, nunca conteúdo", () => {
  const e = buildEntry({
    ts: "2026-10-08T00:00:00.000Z", scope: "subagent", agentType: "devflow:architect", tier: "capable",
    prompt: "segredo", answer: "resposta", errorText: "stack", usage: { input_tokens: 10, output_tokens: "x", note: "y" },
  });
  for (const k of Object.keys(e)) assert.ok(LEDGER_KEYS.includes(k), k);
  assert.deepEqual(e.usage, { input_tokens: 10 });
  assert.equal(JSON.stringify(e).includes("segredo"), false);
});

test("buildEntry: valor livre em campo permitido é descartado (segurança 6)", () => {
  const e = buildEntry({
    agentType: "SEGREDO=sk-ant-abc texto livre", skill: "a".repeat(200), tier: "ultra", phase: "Z",
    source: "qualquer", adapter: "x", escalation: { at: "agora", from: "cheap", to: "SEGREDO", action: "explode" },
  });
  assert.equal(e.agentType, undefined);
  assert.equal(e.skill, undefined);
  assert.equal(e.tier, undefined);
  assert.equal(e.phase, undefined);
  assert.equal(e.source, undefined);
  assert.equal(e.adapter, undefined);
  assert.deepEqual(e.escalation, { from: "cheap" });
});

test("buildEntry aceita ids e nomes legítimos", () => {
  const e = buildEntry({ agentType: "devflow:code-reviewer", model: "claude-opus-5-5", skill: "superpowers:writing-plans", sessionId: "s1a2", agentId: "a42ecfef7cb453ca1", phase: "E", effort: "high", source: "plan", adapter: "mod", scope: "session" });
  assert.equal(Object.keys(e).length, 10);
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
  assert.equal(agg.subagents.get("general-purpose").get("sonnet").output_tokens, 6);
  assert.equal(agg.subagents.get("general-purpose").get("sonnet").n, 2);
  assert.equal(agg.midRunSwitches, 1);
  assert.deepEqual(agg.phaseSwitches, [{ phase: "E", cacheReadRatio: 0.04 }]);
  assert.match(renderMarkdown(agg), /general-purpose/);
});

test("aggregate não polui o protótipo com agentType hostil (segurança 8)", () => {
  aggregate([{ scope: "subagent", agentType: "__proto__", model: "polluted", usage: { input_tokens: 1 } }]);
  assert.equal(({}).polluted, undefined);
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
// Chaves por allowlist e VALORES por regex/enum: nunca prompt, resposta ou texto livre (ADR-005).
import { TIERS, EFFORTS, PHASES } from "./model-routing.mjs";

export const LEDGER_KEYS = Object.freeze([
  "ts", "sessionId", "scope", "agentId", "agentType", "phase", "skill", "tier", "model", "effort",
  "source", "ceiling", "adapter", "usage", "cacheReadRatio", "switched", "escalation",
]);
const SAFE = /^[A-Za-z0-9:_./@[\]-]{1,64}$/;
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const ENUM = {
  scope: ["session", "subagent"],
  phase: PHASES,
  tier: TIERS,
  ceiling: TIERS,
  effort: EFFORTS,
  source: ["plan", "skill", "project", "phase", "agent", "explicit", "inherit"],
  adapter: ["mod", "classic", "omp", "cli"],
};
const SAFE_KEYS = ["sessionId", "agentId", "agentType", "skill", "model"];
const USAGE_KEYS = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"];
const ESC = { at: ["retry", "midRun"], from: TIERS, to: TIERS, action: ["keep", "human", "escalate"] };

const num = (v) => typeof v === "number" && Number.isFinite(v);

export function buildEntry(fields) {
  const out = {};
  const f = fields ?? {};
  if (typeof f.ts === "string" && TS.test(f.ts)) out.ts = f.ts;
  for (const k of SAFE_KEYS) if (typeof f[k] === "string" && SAFE.test(f[k])) out[k] = f[k];
  for (const [k, allowed] of Object.entries(ENUM)) if (allowed.includes(f[k])) out[k] = f[k];
  if (f.usage && typeof f.usage === "object") {
    const u = {};
    for (const k of USAGE_KEYS) if (num(f.usage[k])) u[k] = f.usage[k];
    if (Object.keys(u).length) out.usage = u;
  }
  if (num(f.cacheReadRatio) && f.cacheReadRatio >= 0 && f.cacheReadRatio <= 1) out.cacheReadRatio = f.cacheReadRatio;
  if (typeof f.switched === "boolean") out.switched = f.switched;
  if (f.escalation && typeof f.escalation === "object") {
    const e = {};
    for (const [k, allowed] of Object.entries(ESC)) if (allowed.includes(f.escalation[k])) e[k] = f.escalation[k];
    if (f.escalation.scores && typeof f.escalation.scores === "object") {
      const s = {};
      for (const k of ["failure_is_capability", "claims_done_with_evidence", "is_stuck"]) if (num(f.escalation.scores[k])) s[k] = f.escalation.scores[k];
      if (Object.keys(s).length) e.scores = s;
    }
    if (Object.keys(e).length) out.escalation = e;
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
  const base = typeof xdgDataHome === "string" && xdgDataHome.startsWith("/") ? xdgDataHome : `${home}/.local/share`;
  return `${base}/devflow-model-routing/${projectKey(cwd)}`;
}
```

- [ ] **Step 4: Write `scripts/lib/routing-report.mjs`**

```js
// scripts/lib/routing-report.mjs — agregação do relatório (spec §8). PURO.
// Map em vez de objeto: agentType/model vêm de fora e não podem tocar o protótipo (segurança 8).
const ZERO = () => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, n: 0 });

function add(bucket, usage) {
  for (const k of Object.keys(bucket)) if (k !== "n" && typeof usage?.[k] === "number") bucket[k] += usage[k];
  bucket.n += 1;
}
const sub = (map, key) => { if (!map.has(key)) map.set(key, new Map()); return map.get(key); };
const zeroIn = (map, key) => { if (!map.has(key)) map.set(key, ZERO()); return map.get(key); };
const esc = (map, key) => { if (!map.has(key)) map.set(key, { dispatches: 0, escalated: 0 }); return map.get(key); };

export function aggregate(entries) {
  const agg = { subagents: new Map(), session: new Map(), escalations: new Map(), midRunSwitches: 0, phaseSwitches: [] };
  for (const e of entries ?? []) {
    const agent = String(e?.agentType ?? "?");
    if (e?.escalation) {
      if (e.escalation.action === "escalate") {
        esc(agg.escalations, agent).escalated += 1;
        if (e.escalation.at === "midRun") agg.midRunSwitches += 1;
      }
      continue;
    }
    if (!e?.usage || typeof e.model !== "string") continue;
    if (e.scope === "subagent") {
      add(zeroIn(sub(agg.subagents, agent), e.model), e.usage);
      esc(agg.escalations, agent).dispatches += 1;
    } else if (e.scope === "session") {
      const phase = String(e.phase ?? "-");
      add(zeroIn(sub(agg.session, phase), e.model), e.usage);
      if (e.switched) agg.phaseSwitches.push({ phase, cacheReadRatio: e.cacheReadRatio ?? null });
    }
  }
  return agg;
}

const k = (n) => (n / 1000).toFixed(1) + "k";

export function renderMarkdown(agg) {
  const lines = ["## Subagentes", "", "| Agente | Modelo | Despachos | Entrada | Saída | Cache lido |", "|---|---|---|---|---|---|"];
  for (const [a, models] of agg.subagents)
    for (const [m, u] of models)
      lines.push(`| ${a} | ${m} | ${u.n} | ${k(u.input_tokens)} | ${k(u.output_tokens)} | ${k(u.cache_read_input_tokens)} |`);
  lines.push("", "## Sessão por fase", "", "| Fase | Modelo | Turnos | Entrada | Saída |", "|---|---|---|---|---|");
  for (const [p, models] of agg.session)
    for (const [m, u] of models) lines.push(`| ${p} | ${m} | ${u.n} | ${k(u.input_tokens)} | ${k(u.output_tokens)} |`);
  lines.push("", "## Escaladas", "", "| Agente | Despachos | Escaladas |", "|---|---|---|");
  for (const [a, s] of agg.escalations) lines.push(`| ${a} | ${s.dispatches} | ${s.escalated} |`);
  lines.push("", `Trocas no meio da execução: ${agg.midRunSwitches}`);
  lines.push(`Trocas de fase da sessão: ${agg.phaseSwitches.length} (cache lido no passo seguinte: ${agg.phaseSwitches.map((s) => s.cacheReadRatio ?? "?").join(", ") || "—"})`);
  lines.push("", "_Tokens por modelo. O peso de cada modelo na cota do plano não é público._");
  return lines.join("\n");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/lib/routing-ledger.test.mjs`
Expected: PASS (8 testes)

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/routing-ledger.mjs scripts/lib/routing-report.mjs tests/lib/routing-ledger.test.mjs
git commit -m "feat(model-routing): ledger com valores validados e relatório sem protótipo"
```

---

## Task 6: CLI `model-route.mjs` (resolve, escalate, report)

**Agent:** backend-specialist · **Tier:** standard · **Tests:** e2e

**Files:**
- Create: `scripts/model-route.mjs`
- Test: `tests/e2e/test-model-route-cli.mjs`

**Interfaces:**
- Consumes: Tasks 1–5; `readWorkflowState` (`scripts/lib/workflow-resume.mjs`); `readRegularFileSafe` (`scripts/lib/safe-read.mjs`).
- Produces (contrato usado pelas skills na Task 11):
  - `node scripts/model-route.mjs resolve --agent <tipo> [--phase P] [--skill S] [--task-tier T] [--runtime claude|omp] [--cwd D]` → JSON `{"route": {...}|null}`. Sem teto conhecido, o CLI usa `top` (o adaptador aplica o teto real); `route.model` é alias (ou `null` = não tocar); com `--runtime omp`, `route.role` é o model role.
  - `escalate --agent <tipo> --tier <tier> --report <arquivo> [--mid-run]` → texto da rubrica.
  - `escalate --agent <tipo> --tier <tier> --answers '<json>' [--signal-red] [--runtime omp] [--cwd D]` → JSON `{"action","tier","model","role","reason"}`; grava o ledger se ligado.
  - `report [--since ISO] [--transcripts <dir>] [--cwd D]` → markdown.
  - Todo arquivo vindo do projeto é lido com `readRegularFileSafe`; config passa por `effectiveConfig(…, process.env.DEVFLOW_MODEL_ROUTING)`. Exit 0 sempre, exceto uso inválido (exit 2).

- [ ] **Step 1: Write the failing test**

```js
// tests/e2e/test-model-route-cli.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../../scripts/model-route.mjs", import.meta.url).pathname;

function fixture({ models = "models:\n  enabled: true\n  ledger: true\n", phase = "E", optIn = "1" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "model-route-"));
  mkdirSync(join(dir, ".context/runtime/workflows"), { recursive: true });
  if (models !== null) writeFileSync(join(dir, ".context/.devflow.yaml"), models);
  if (phase) writeFileSync(join(dir, ".context/runtime/workflows/prevc.json"),
    JSON.stringify({ status: { project: { name: "x", current_phase: phase }, phases: {} } }));
  const xdg = mkdtempSync(join(tmpdir(), "model-route-xdg-"));
  const env = { ...process.env, XDG_DATA_HOME: xdg, HOME: xdg };
  // null = sem opt-in (undefined dispararia o valor padrão "1" da desestruturação)
  if (optIn === null) delete env.DEVFLOW_MODEL_ROUTING; else env.DEVFLOW_MODEL_ROUTING = optIn;
  return { dir, env, xdg };
}
const run = (args, f, timeout = 10000) => execFileSync("node", [CLI, ...args, "--cwd", f.dir], { encoding: "utf8", env: f.env, timeout });

test("resolve lê a fase do prevc.json e devolve alias", () => {
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose"], fixture({ phase: "C" }))).route;
  assert.deepEqual([r.tier, r.model], ["cheap", "haiku"]);
});

test("resolve com task-tier e --runtime omp devolve o role", () => {
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose", "--task-tier", "capable", "--runtime", "omp"], fixture())).route;
  assert.deepEqual([r.tier, r.source, r.role], ["capable", "plan", "pi/slow"]);
});

test("sem opt-in do usuário (D18) ou sem models → route null, exit 0 (Review Focus 2)", () => {
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], fixture({ optIn: null }))).route, null);
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], fixture({ optIn: "0" }))).route, null);
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], fixture({ models: "git:\n  strategy: x\n" }))).route, null);
});

test(".devflow.yaml como link para /dev/zero ou FIFO não trava nem incha (segurança 1, Review Focus 1)", () => {
  const z = fixture({ models: null });
  symlinkSync("/dev/zero", join(z.dir, ".context/.devflow.yaml"));
  const t0 = Date.now();
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], z, 5000)).route, null);
  const f = fixture({ models: null });
  execFileSync("mkfifo", [join(f.dir, ".context/.devflow.yaml")]);
  assert.equal(JSON.parse(run(["resolve", "--agent", "devflow:documentation-writer"], f, 5000)).route, null);
  assert.ok(Date.now() - t0 < 5000);
});

test("prevc.json symlink para fora → sem fase", () => {
  const f = fixture({ phase: null });
  const outside = join(mkdtempSync(join(tmpdir(), "outside-")), "p.json");
  writeFileSync(outside, JSON.stringify({ status: { project: { name: "x", current_phase: "C" } } }));
  symlinkSync(outside, join(f.dir, ".context/runtime/workflows/prevc.json"));
  const r = JSON.parse(run(["resolve", "--agent", "general-purpose"], f)).route;
  assert.equal(r.source, "agent", "sem fase confiável cai no default do agente");
});

test("escalate: rubrica → respostas → decisão, ledger sem conteúdo", () => {
  const f = fixture();
  const rep = join(f.dir, "report.txt");
  writeFileSync(rep, "FALHOU: teste X vermelho; email dev@corp.com");
  const rubric = run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--report", rep], f);
  assert.match(rubric, /needed_tier/);
  assert.doesNotMatch(rubric, /dev@corp\.com/);
  const answers = JSON.stringify({ failure_is_capability: 0.9, claims_done_with_evidence: 0, is_stuck: 0.2, needed_tier: "standard" });
  const d = JSON.parse(run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--answers", answers, "--signal-red", "--runtime", "omp"], f));
  assert.deepEqual([d.action, d.tier, d.model, d.role], ["escalate", "standard", "sonnet", "default"]);
  const dir = join(f.xdg, "devflow-model-routing", readdirSync(join(f.xdg, "devflow-model-routing"))[0]);
  const content = readFileSync(join(dir, readdirSync(dir)[0]), "utf8");
  assert.match(content, /"action":"escalate"/);
  assert.doesNotMatch(content, /FALHOU|dev@corp/);
});

test("escalate com respostas inválidas → keep", () => {
  const d = JSON.parse(run(["escalate", "--agent", "general-purpose", "--tier", "cheap", "--answers", "lixo"], fixture()));
  assert.equal(d.action, "keep");
});

test("report sobre ledger vazio não quebra", () => {
  assert.match(run(["report"], fixture()), /Subagentes/);
});

test("report --transcripts soma o usage dos subagentes sem ler conteúdo", () => {
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
  assert.equal(spawnSync("node", [CLI, "voar"], { encoding: "utf8" }).status, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/e2e/test-model-route-cli.mjs`
Expected: FAIL (`Cannot find module .../scripts/model-route.mjs` em todos)

- [ ] **Step 3: Write `scripts/model-route.mjs`**

```js
#!/usr/bin/env node
// scripts/model-route.mjs — CLI do roteamento de modelos (spec §4.1). Usado pelas skills.
// Todo arquivo vindo do projeto é lido sem seguir symlink e sem bloquear (segurança 1).
import { readFileSync, mkdirSync, appendFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { readModels } from "./lib/models-config.mjs";
import { resolveSubagentRoute, effectiveConfig, tierOf, toAlias, toRole, TIERS } from "./lib/model-routing.mjs";
import { rubricPrompt, parseAnswers, combine } from "./lib/escalation.mjs";
import { buildEntry, ledgerDirFrom } from "./lib/routing-ledger.mjs";
import { aggregate, renderMarkdown } from "./lib/routing-report.mjs";
import { readWorkflowState } from "./lib/workflow-resume.mjs";
import { readRegularFileSafe, SAFE_READ_MAX_BYTES } from "./lib/safe-read.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRANSCRIPT_MAX = 64 * 1024 * 1024;

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

const safe = (p, max = SAFE_READ_MAX_BYTES) => readRegularFileSafe(p, max) ?? "";
const table = () => JSON.parse(readFileSync(join(PLUGIN_ROOT, "assets/model-routing/routes.json"), "utf8"));
const config = (cwd) => effectiveConfig(readModels(safe(join(cwd, ".context/.devflow.yaml"))), process.env.DEVFLOW_MODEL_ROUTING);
const phaseOf = (cwd) => {
  const p = readWorkflowState(cwd)?.phase;
  return ["P", "R", "E", "V", "C"].includes(p) ? p : null;
};
const ledgerDir = (cwd) => ledgerDirFrom({ xdgDataHome: process.env.XDG_DATA_HOME, home: process.env.HOME || homedir(), cwd });
const str = (v) => (typeof v === "string" ? v : null);

function writeLedger(cwd, cfg, entry) {
  if (!cfg.enabled || !cfg.ledger) return;
  try {
    const dir = ledgerDir(cwd);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(join(dir, "cli.jsonl"), JSON.stringify(buildEntry(entry)) + "\n", { mode: 0o600 });
  } catch { /* ledger nunca quebra o fluxo */ }
}

function cmdResolve(o, cwd) {
  const route = resolveSubagentRoute({
    table: table(), config: config(cwd), agentType: o.agent,
    phase: str(o.phase) ?? phaseOf(cwd), skill: str(o.skill), taskTier: str(o["task-tier"]),
    explicitModel: null, ceilingModel: "top", ceilingEffort: "max",
  });
  const out = route ? { ...route, model: route.model ?? toAlias(route.tier), ...(o.runtime === "omp" ? { role: toRole(route.tier) } : {}) } : null;
  process.stdout.write(JSON.stringify({ route: out }) + "\n");
}

function cmdEscalate(o, cwd) {
  if (typeof o.report === "string") {
    process.stdout.write(rubricPrompt({ agentType: o.agent, tier: o.tier, report: safe(o.report), midRun: !!o["mid-run"] }) + "\n");
    return;
  }
  const cfg = config(cwd);
  const current = TIERS.includes(o.tier) ? o.tier : null;
  const d = current
    ? combine(parseAnswers(str(o.answers) ?? ""), {
        current, ceiling: tierOf(str(o.ceiling) ?? "top") ?? "top", maxTier: cfg.maxTier,
        signalRed: !!o["signal-red"], midRun: false, thresholds: cfg.thresholds,
      })
    : { action: "keep", tier: null, reason: "tier atual inválido" };
  const esc = d.action === "escalate";
  const out = { ...d, model: esc ? toAlias(d.tier) : null, role: esc && o.runtime === "omp" ? toRole(d.tier) : null };
  writeLedger(cwd, cfg, {
    ts: new Date().toISOString(), scope: "subagent", agentType: o.agent, tier: d.tier, adapter: o.runtime === "omp" ? "omp" : "cli",
    escalation: { at: "retry", from: current, to: d.tier, action: d.action },
  });
  process.stdout.write(JSON.stringify(out) + "\n");
}

// Caminho do clássico/omp (spec §8): só agentType do meta.json e campos NUMÉRICOS de usage.
function transcriptEntries(projectsDir) {
  const out = [];
  if (!existsSync(projectsDir)) return out;
  for (const sess of readdirSync(projectsDir)) {
    const sub = join(projectsDir, sess, "subagents");
    if (!existsSync(sub)) continue;
    for (const meta of readdirSync(sub).filter((n) => n.endsWith(".meta.json"))) {
      let agentType;
      try { agentType = String(JSON.parse(safe(join(sub, meta))).agentType ?? "?"); } catch { continue; }
      const byModel = new Map();
      for (const line of safe(join(sub, meta.replace(/\.meta\.json$/, ".jsonl")), TRANSCRIPT_MAX).split("\n")) {
        let m;
        try { m = JSON.parse(line)?.message; } catch { continue; }
        if (!m?.usage || typeof m.model !== "string" || !m.model.startsWith("claude")) continue;
        if (!byModel.has(m.model)) byModel.set(m.model, { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
        const u = byModel.get(m.model);
        for (const k of Object.keys(u)) if (typeof m.usage[k] === "number") u[k] += m.usage[k];
      }
      for (const [model, usage] of byModel) out.push({ scope: "subagent", agentType, model, usage });
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
      for (const line of safe(join(dir, f), TRANSCRIPT_MAX).split("\n")) {
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
  console.error("uso: model-route <resolve --agent T [--phase P] [--skill S] [--task-tier T] [--runtime claude|omp] | escalate --agent T --tier T (--report F | --answers J [--signal-red] [--runtime omp]) | report [--since ISO] [--transcripts DIR]> [--cwd D]");
  process.exit(2);
}

main(process.argv.slice(2));
```

> Nota: `resolve` devolve `route.model` sempre preenchido (alias do tier), porque quem chama é a skill, que passa o valor explicitamente na ferramenta Agent; o adaptador (mod ou clássico) ainda aplica o teto real depois (D5) e trata `model` dentro do teto como "não tocar".

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/e2e/test-model-route-cli.mjs`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/model-route.mjs tests/e2e/test-model-route-cli.mjs
git commit -m "feat(model-routing): CLI model-route (resolve, escalate, report) com leitura segura"
```

---

## Task 7: `router-core` — máquina de estado do mod (pura)

**Agent:** backend-specialist · **Tier:** capable · **Tests:** unit

**Files:**
- Create: `scripts/lib/router-core.mjs`
- Test: `tests/lib/router-core.test.mjs`

**Interfaces:**
- Consumes: Tasks 1, 3.
- Produces (o adaptador da Task 8 só traduz eventos para estas funções):
  - `createRouterState() → State` (`userModel`, `userEffort`, `phase`, `skill`, `sessionTier`, `ids: {[tier]: idCompleto}`, `agents: {[agentId]: …}`).
  - `observeSession(state, { model, effort })` — chamado em **todo** `turn.step` da sessão, com a camada ligada ou não (o teto vem sempre de `e.model`/`e.effort`, D5/D17).
  - `onTurnStart(state, { phase })` — troca de fase limpa a skill.
  - `onSkill(state, { skill, agentId })` — ignora eventos de subagente.
  - `learnId(state, modelId)` — guarda o ID completo do tier (só `claude-*`).
  - `onSessionStep(state, { model, effort }, { table, config }) → { model?, effort?, switched } | null` — `model` só se o tier diferir do teto **e** houver ID aprendido (D21).
  - `onSpawn(state, e, { table, config, phase, skill }) → route | null` — teto = `e.parentModel ?? state.userModel`; `fork`/`workflow` → `null`.
  - `onSpawned(state, agentId, route, resolvedModel)`.
  - `onSubagentTool(state, agentId, { isError, summary }, config) → { trigger }` — só com `midRun.enabled`, só quando a sequência atinge **exatamente** N, uma vez por subagente.
  - `onSubagentStep(state, { agentId, model, effort }) → { model?, effort? } | null`.
  - `midRunReport(state, agentId) → string`, `applyMidRun(state, agentId, decision) → boolean`.

- [ ] **Step 1: Write the failing test**

```js
// tests/lib/router-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../../scripts/lib/router-core.mjs";
import { readModels } from "../../scripts/lib/models-config.mjs";
import { effectiveConfig } from "../../scripts/lib/model-routing.mjs";

const table = JSON.parse(readFileSync(new URL("../../assets/model-routing/routes.json", import.meta.url), "utf8"));
const config = effectiveConfig(readModels("models:\n  enabled: true\n  midRun:\n    enabled: true\n"), "1");
const ctx = { table, config };
const step = (s, model, effort) => { C.observeSession(s, { model, effort }); return C.onSessionStep(s, { model, effort }, ctx); };

test("sessão: troca de tier só na mudança de fase (1 troca num P→C)", () => {
  const s = C.createRouterState();
  C.learnId(s, "claude-sonnet-5-5");
  let switches = 0;
  for (const phase of ["P", "P", "R", "E", "E", "V", "C"]) {
    C.onTurnStart(s, { phase });
    if (step(s, "claude-opus-5-5", "xhigh")?.switched) switches++;
  }
  assert.equal(switches, 1);
});

test("sessão: em E usa o ID completo aprendido, nunca alias (D21)", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "E" });
  const sem = step(s, "claude-opus-5-5", "xhigh");
  assert.equal(sem.model, undefined, "sem ID aprendido: só esforço");
  assert.equal(sem.effort, "medium");
  C.learnId(s, "claude-sonnet-5-5");
  const com = step(s, "claude-opus-5-5", "xhigh");
  assert.equal(com.model, "claude-sonnet-5-5");
  C.learnId(s, "sonnet");
  assert.equal(s.ids.standard, "claude-sonnet-5-5", "alias não substitui ID");
});

test("sessão: /model e /effort do usuário viram teto no passo seguinte (Review Focus 4)", () => {
  const s = C.createRouterState();
  C.learnId(s, "claude-sonnet-5-5");
  C.onTurnStart(s, { phase: "E" });
  step(s, "claude-opus-5-5", "xhigh");
  const rw = step(s, "claude-haiku-4-5", "low");
  assert.equal(s.userModel, "claude-haiku-4-5");
  assert.equal(s.userEffort, "low");
  assert.equal(rw?.model, undefined, "nunca sobe acima do novo teto");
});

test("sessão: skill de subagente não muda o esforço da sessão; troca de fase limpa a skill", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "P" });
  C.onSkill(s, { skill: "superpowers:brainstorming" });
  C.onSkill(s, { skill: "devflow:commit-message", agentId: "a1" });
  assert.equal(s.skill, "superpowers:brainstorming");
  C.onTurnStart(s, { phase: "R" });
  assert.equal(s.skill, null);
});

test("subagente: teto é o modelo do usuário (parentModel) e tier igual ao teto não toca", () => {
  const s = C.createRouterState();
  const a = C.onSpawn(s, { subagentType: "devflow:architect", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" });
  assert.deepEqual([a.tier, a.model], ["capable", null]);
  const d = C.onSpawn(s, { subagentType: "devflow:documentation-writer", parentModel: "claude-sonnet-5-5" }, { ...ctx, phase: "E" });
  assert.deepEqual([d.tier, d.model], ["cheap", "haiku"]);
  const b = C.onSpawn(s, { subagentType: "devflow:architect", parentModel: "claude-sonnet-5-5" }, { ...ctx, phase: "E" });
  assert.deepEqual([b.tier, b.model], ["standard", null], "sessão em sonnet: architect herda sonnet");
});

test("subagente: fork, workflow e tipo não roteável ficam intocados", () => {
  const s = C.createRouterState();
  assert.equal(C.onSpawn(s, { subagentType: "general-purpose", parentModel: "opus", fork: true }, ctx), null);
  assert.equal(C.onSpawn(s, { subagentType: "general-purpose", parentModel: "opus", workflow: { runId: "wf_1" } }, ctx), null);
  assert.equal(C.onSpawn(s, { subagentType: "Explore", parentModel: "opus" }, ctx), null);
});

test("subagente: esforço sobe após falha e volta no sucesso", () => {
  const s = C.createRouterState();
  C.observeSession(s, { model: "claude-opus-5-5", effort: "xhigh" });
  const r = C.onSpawn(s, { subagentType: "general-purpose", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" });
  C.onSpawned(s, "a1", r, "claude-sonnet-5-5");
  assert.equal(s.ids.standard, "claude-sonnet-5-5", "aprende o ID pelo spawn");
  assert.equal(C.onSubagentStep(s, { agentId: "a1", model: "claude-sonnet-5-5", effort: "medium" }), null);
  C.onSubagentTool(s, "a1", { isError: true, summary: "Bash: exit 1" }, config);
  assert.equal(C.onSubagentStep(s, { agentId: "a1", model: "claude-sonnet-5-5", effort: "medium" }).effort, "high");
  C.onSubagentTool(s, "a1", { isError: false }, config);
  assert.equal(C.onSubagentStep(s, { agentId: "a1", model: "claude-sonnet-5-5", effort: "medium" }), null);
});

test("escalada no meio: gatilho só em streak === N, uma vez por subagente, nunca com midRun desligado", () => {
  const s = C.createRouterState();
  C.observeSession(s, { model: "claude-opus-5-5", effort: "xhigh" });
  C.learnId(s, "claude-sonnet-5-5");
  const r = C.onSpawn(s, { subagentType: "devflow:documentation-writer", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" });
  C.onSpawned(s, "a2", r, "claude-haiku-5-5");
  const triggers = [];
  for (let i = 0; i < 20; i++) triggers.push(C.onSubagentTool(s, "a2", { isError: true, summary: `erro ${i}` }, config).trigger);
  assert.equal(triggers.filter(Boolean).length, 1, "uma consulta por subagente (segurança 4)");
  assert.equal(triggers.indexOf(true), 2, "dispara na 3ª falha");
  assert.match(C.midRunReport(s, "a2"), /erro 19/);
  const off = effectiveConfig(readModels("models:\n  enabled: true\n"), "1");
  const s2 = C.createRouterState();
  C.observeSession(s2, { model: "claude-opus-5-5", effort: "xhigh" });
  C.onSpawned(s2, "b", C.onSpawn(s2, { subagentType: "general-purpose", parentModel: "claude-opus-5-5" }, { table, config: off, phase: "E" }), "claude-sonnet-5-5");
  for (let i = 0; i < 5; i++) assert.equal(C.onSubagentTool(s2, "b", { isError: true }, off).trigger, false, "midRun desligado (D19)");
});

test("applyMidRun: uma troca, nunca para baixo, nunca acima do teto, só com ID conhecido", () => {
  const s = C.createRouterState();
  C.observeSession(s, { model: "claude-opus-5-5", effort: "xhigh" });
  const r = C.onSpawn(s, { subagentType: "devflow:documentation-writer", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" });
  C.onSpawned(s, "a", r, "claude-haiku-5-5");
  assert.equal(C.applyMidRun(s, "a", { action: "escalate", tier: "standard" }), false, "sem ID de standard");
  const s3 = C.createRouterState();
  C.observeSession(s3, { model: "claude-opus-5-5", effort: "xhigh" });
  C.learnId(s3, "claude-sonnet-5-5");
  C.onSpawned(s3, "a", C.onSpawn(s3, { subagentType: "devflow:documentation-writer", parentModel: "claude-opus-5-5" }, { ...ctx, phase: "E" }), "claude-haiku-5-5");
  assert.equal(C.applyMidRun(s3, "a", { action: "escalate", tier: "standard" }), true);
  assert.equal(C.onSubagentStep(s3, { agentId: "a", model: "claude-haiku-5-5", effort: "low" }).model, "claude-sonnet-5-5");
  assert.equal(C.applyMidRun(s3, "a", { action: "escalate", tier: "capable" }), false, "só uma troca");
  const s2 = C.createRouterState();
  C.observeSession(s2, { model: "claude-sonnet-5-5", effort: "high" });
  C.learnId(s2, "claude-opus-5-5");
  C.onSpawned(s2, "b", C.onSpawn(s2, { subagentType: "devflow:documentation-writer", parentModel: "claude-sonnet-5-5" }, { ...ctx, phase: "E" }), "claude-haiku-5-5");
  assert.equal(C.applyMidRun(s2, "b", { action: "escalate", tier: "capable" }), false, "acima do teto");
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
import { resolveSessionRoute, resolveSubagentRoute, stepEffort, tierOf, TIERS, capAtCeiling } from "./model-routing.mjs";

const MAX_ERRORS = 6;
const MAX_SUMMARY = 300;
const rank = (t) => TIERS.indexOf(t);

export function createRouterState() {
  return { userModel: null, userEffort: null, phase: null, skill: null, sessionTier: null, ids: {}, agents: {} };
}

// Sondas R-3: e.model/e.effort que chegam ao turn.step da sessão são sempre os do usuário.
export function observeSession(state, { model, effort }) {
  if (typeof model === "string" && model) state.userModel = model;
  if (effort !== undefined && effort !== null) state.userEffort = effort;
}

export function onTurnStart(state, { phase }) {
  const p = phase ?? null;
  if (p !== state.phase) { state.phase = p; state.skill = null; }
}

export function onSkill(state, { skill, agentId }) {
  if (agentId) return;
  state.skill = typeof skill === "string" ? skill : null;
}

export function learnId(state, modelId) {
  if (typeof modelId !== "string" || !/^claude-[a-z0-9-]+$/.test(modelId)) return;
  const t = tierOf(modelId);
  if (t) state.ids[t] = modelId;
}

export function onSessionStep(state, { model, effort }, { table, config }) {
  if (!state.userModel) return null;
  const route = resolveSessionRoute({ table, config, phase: state.phase, skill: state.skill, userModel: state.userModel, userEffort: state.userEffort });
  if (!route) return null;
  const switched = state.sessionTier !== null && state.sessionTier !== route.tier;
  state.sessionTier = route.tier;
  const rw = { switched };
  if (route.tier !== route.ceiling) {
    const id = state.ids[route.tier];
    if (id && id !== model) rw.model = id; // D21: sem ID aprendido, só esforço
  }
  if (route.effort && route.effort !== effort) rw.effort = route.effort;
  return rw.model || rw.effort || switched ? rw : null;
}

export function onSpawn(state, e, { table, config, phase, skill }) {
  if (e?.fork || e?.workflow) return null;
  return resolveSubagentRoute({
    table, config, agentType: e?.subagentType, phase: phase ?? state.phase, skill: skill ?? null, taskTier: null,
    explicitModel: e?.model ?? null, ceilingModel: e?.parentModel ?? state.userModel, ceilingEffort: state.userEffort,
  });
}

export function onSpawned(state, agentId, route, resolvedModel) {
  learnId(state, resolvedModel);
  if (!agentId || !route) return;
  state.agents[agentId] = {
    tier: tierOf(resolvedModel) ?? route.tier, ceiling: route.ceiling, effortBase: route.effort,
    streak: 0, errors: [], decided: false, escalatedTo: null,
  };
}

export function onSubagentTool(state, agentId, { isError, summary }, config) {
  const a = state.agents[agentId];
  if (!a) return { trigger: false };
  if (!isError) { a.streak = 0; return { trigger: false }; }
  a.streak += 1;
  a.errors.push(String(summary ?? "erro").slice(0, MAX_SUMMARY));
  if (a.errors.length > MAX_ERRORS) a.errors.shift();
  const limit = config?.midRun?.failureStreak ?? 3;
  const trigger = !!config?.midRun?.enabled && !a.decided && a.streak === limit;
  if (trigger) a.decided = true; // uma consulta por subagente (segurança 4)
  return { trigger };
}

export function onSubagentStep(state, { agentId, model, effort }) {
  const a = state.agents[agentId];
  if (!a) return null;
  const rw = {};
  if (a.escalatedTo) {
    const id = state.ids[a.escalatedTo];
    if (id && id !== model) rw.model = id;
  }
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
  if (!to || to !== decision.tier || rank(to) <= rank(a.tier) || !state.ids[to]) return false;
  a.escalatedTo = to;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/router-core.test.mjs`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/router-core.mjs tests/lib/router-core.test.mjs
git commit -m "feat(model-routing): máquina de estado pura do mod (sessão e subagentes)"
```

---

## Task 8: Adaptador mod (`hooks/router.mjs`)

**Agent:** backend-specialist + security-auditor (revisão pesada) · **Tier:** capable · **Tests:** integration (`claude plugin test`)

**Files:**
- Create: `hooks/router.mjs`, `hooks/router.test.ts` (o `claude plugin test` só procura `*.test.ts`/`*.test.tsx` — verificado na fase R)
- Modify: `hooks/hooks.json` (acrescentar `"modules": ["./router.mjs"]` no objeto de topo, ao lado de `"hooks"` — sonda R-1)
- Modify: `tests/run-integration.sh` (rodar `claude plugin test .` quando o `claude` existir)

**Interfaces:**
- Consumes: `router-core` (Task 7), `readModels` (Task 2), `effectiveConfig`/`phaseFromPrevcJson` (Task 1), `rubricPrompt`/`parseAnswers`/`combine` (Task 4), `buildEntry`/`ledgerDirFrom` (Task 5); `$.fs.stat`, `$.fs.read`, `$.fs.write`, `$.env.get`, `$.settings.read`, `$.model.complete`, `$.ui.status`, `$.ui.toast`, `$.command.register`, `$.plugin.root`.
- Produces: comando `/devflow-route` (`status` | `on` | `off` | `session off`); ledger `<dir>/<sessionKey>.jsonl` (uma escrita por turno da sessão, ≤ 2 000 linhas).
- Restrições do validate (sonda): toda função que recebe `$` no topo do módulo; estado em nível de módulo; `agent.spawn` com `.catch`.

- [ ] **Step 1: Write the failing test**

```js
// hooks/router.test.ts — roda com `claude plugin test .` (o kit só procura *.test.ts / *.test.tsx).
import { test, expect } from "claude-code/testing";

// Tabela mínima embutida: o ambiente do kit não tem fs e módulos não aceitam import() dinâmico.
const ROUTES = JSON.stringify({
  routable: ["general-purpose"], routablePrefix: "devflow:",
  effortByTier: { cheap: "low", standard: "medium", capable: "high", top: "high" },
  agents: { "documentation-writer": { tier: "cheap", effort: "low" }, architect: { tier: "capable", effort: "high" }, "general-purpose": { tier: "standard" } },
  phases: { E: { "general-purpose": "standard" } }, skills: {},
  session: { phases: { E: "standard" }, skills: {} },
});
const YAML_ON = "models:\n  enabled: true\n";

function stubEnv(on, { yaml = YAML_ON, optIn = "1", phase = "E" } = {}) {
  const files = {
    ".context/.devflow.yaml": yaml,
    ".context/runtime/workflows/prevc.json": JSON.stringify({ status: { project: { name: "x", current_phase: phase } } }),
  };
  const fileOf = (p) => Object.keys(files).find((k) => String(p).endsWith(k)) ?? (String(p).endsWith("routes.json") ? "routes" : null);
  // Chamadas a `$` são "op events": o hook do teste responde com { value } ou recusa com { deny }.
  on("fs.stat", async ($, e) => {
    if (e.path === "/proj") return { value: { kind: "dir", size: 0, mtimeMs: 0, isLink: false, realPath: "/proj" } };
    const f = fileOf(e.path);
    if (!f) return { deny: "ENOENT" };
    return { value: { kind: "file", size: 100, mtimeMs: 0, isLink: false, realPath: f === "routes" ? e.path : `/proj/${f}` } };
  });
  on("fs.read", async ($, e) => {
    const f = fileOf(e.path);
    if (f === "routes") return { value: ROUTES };
    if (f) return { value: files[f] };
    return { deny: "ENOENT" };
  });
  on("fs.write", async () => ({ value: undefined }));
  on("settings.read", async () => ({ value: { enabledPlugins: {} } }));
  on("env.get", async ($, e) => ({ value: ({ HOME: "/home/t", PWD: "/proj", DEVFLOW_MODEL_ROUTING: optIn })[e.name] }));
}

// Sem engine real o kit não preenche parentModel: o teto fica ilegível e o mod NÃO roteia (D5).
// O caminho positivo (alias aplicado no agent.spawn) está coberto pela sonda A2 da fase R,
// pelos testes puros da Task 7 e pela verificação real da fase V.
test("teto ilegível (sem parentModel) → despacho intocado (D5)", async ($, on) => {
  stubEnv(on);
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-haiku-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "doc", subagentType: "devflow:documentation-writer" });
  expect(seen.parentModel).toBeUndefined();
  expect(seen.model).toBeUndefined();
});

test("sem confirmação do usuário (D18) o despacho fica intocado", async ($, on) => {
  stubEnv(on, { optIn: undefined });
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-opus-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "devflow:documentation-writer" });
  expect(seen.model).toBeUndefined();
});

test("repo sem models: o despacho fica intocado", async ($, on) => {
  stubEnv(on, { yaml: "git:\n  strategy: x\n" });
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-opus-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "devflow:documentation-writer" });
  expect(seen.model).toBeUndefined();
});

test("tipo não roteável (Explore) intocado", async ($, on) => {
  stubEnv(on);
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-haiku-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "Explore" });
  expect(seen.model).toBeUndefined();
});

test("model explícito intocado quando o teto é ilegível (nunca rebaixa às cegas)", async ($, on) => {
  stubEnv(on);
  let seen;
  on("agent.spawn", async ($, e) => { seen = e; return { model: "claude-opus-5-5", agentId: "a1" }; });
  await $.agent.spawn({ prompt: "x", subagentType: "general-purpose", model: "opus" });
  expect(seen.model).toBe("opus");
});
```

> Os stubs respondem as chamadas a `$` como "op events" (`{ value }` ou `{ deny }`) com os campos que os tipos declaram (`fs.stat {path, resolve}`, `fs.read {path, as}`, `env.get {name}`) — formato verificado rodando este arquivo no `claude plugin test` durante a fase R (5/5). O kit não tem engine real: não preenche `parentModel` nem dispara `turn.step` da sessão. Teto, sessão por fase, esforço por passo e escalada no meio ficam nos testes puros da Task 7 e na verificação real da fase V.

- [ ] **Step 2: Run test to verify it fails**

Run: `claude plugin test .`
Expected: FAIL no último teste — sem `modules` no `hooks/hooks.json` o mod não carrega e nada falha aberto pelo caminho dele; os demais podem passar por acaso, por isso o Step 5 roda o kit com o módulo declarado e o `validate` confirma os hooks registrados.

- [ ] **Step 3: Declarar o módulo em `hooks/hooks.json`**

Acrescente no objeto de topo, irmão de `"hooks"`:

```json
  "modules": ["./router.mjs"],
```

- [ ] **Step 4: Write `hooks/router.mjs`**

```js
// hooks/router.mjs — adaptador MOD do roteamento de modelos (spec §4.2/§4.3, D18–D21).
// Só traduz eventos do engine para scripts/lib/router-core.mjs. Qualquer falha → next(e) intocado.
// Exigência do validate: toda função que recebe `$` é declarada aqui no topo; o estado é do módulo.
import * as core from "../scripts/lib/router-core.mjs";
import { readModels } from "../scripts/lib/models-config.mjs";
import { effectiveConfig, phaseFromPrevcJson } from "../scripts/lib/model-routing.mjs";
import { rubricPrompt, parseAnswers, combine } from "../scripts/lib/escalation.mjs";
import { buildEntry, ledgerDirFrom } from "../scripts/lib/routing-ledger.mjs";

const MAX_FILE = 256 * 1024;
const MAX_LEDGER_LINES = 2000;
const S = {
  core: core.createRouterState(),
  table: null,
  config: readModels(""),
  loaded: false,
  disabled: false,
  sessionOff: false,
  cwd: null,
  ledgerPath: null,
  lines: [],
  dirty: false,
  sessionKey: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
};

const active = () => !S.disabled && S.config.enabled && !!S.table;

// Leitura de arquivo do repositório com a contenção da ADR-014: sem link, só arquivo regular,
// tamanho limitado, caminho real sob a raiz do projeto. Qualquer dúvida → null.
async function safeRead($, rel) {
  try {
    const st = await $.fs.stat(rel, { resolve: true });
    if (st.isLink || st.kind !== "file" || st.size > MAX_FILE) return null;
    if (!S.cwd || !st.realPath || !st.realPath.startsWith(S.cwd + "/")) return null;
    return await $.fs.read(rel);
  } catch {
    return null;
  }
}

async function ensure($) {
  if (S.loaded) return;
  S.loaded = true;
  try {
    const pwd = await $.env.get("PWD");
    const st = pwd ? await $.fs.stat(pwd, { resolve: true }) : null;
    S.cwd = st?.realPath ?? null;
  } catch { S.cwd = null; }
  try { S.table = JSON.parse(await $.fs.read(`${$.plugin.root}/assets/model-routing/routes.json`)); } catch { S.table = null; }
  const optIn = await $.env.get("DEVFLOW_MODEL_ROUTING");
  S.config = effectiveConfig(readModels((await safeRead($, ".context/.devflow.yaml")) ?? ""), optIn);
  if (S.config.enabled && S.config.ledger) {
    const home = await $.env.get("HOME");
    const xdg = await $.env.get("XDG_DATA_HOME");
    if (home && S.cwd) S.ledgerPath = `${ledgerDirFrom({ xdgDataHome: xdg, home, cwd: S.cwd })}/${S.sessionKey}.jsonl`;
  }
  await detectOtherRouter($);
}

// D17: outro roteador de sessão habilitado → a camada de sessão do DevFlow se desliga.
async function detectOtherRouter($) {
  try {
    const s = await $.settings.read();
    const names = Object.keys(s?.enabledPlugins ?? {});
    if (names.some((n) => /jev[-_]?router/i.test(n))) {
      S.sessionOff = true;
      $.ui.toast("DevFlow: outro roteador de sessão está habilitado — a camada de sessão do DevFlow fica desligada; subagentes seguem roteados.");
    }
  } catch { /* sem leitura de settings: segue */ }
}

async function readPhase($) {
  return phaseFromPrevcJson((await safeRead($, ".context/runtime/workflows/prevc.json")) ?? "");
}

function ledger(fields) {
  if (!S.ledgerPath || S.lines.length >= MAX_LEDGER_LINES) return;
  S.lines.push(JSON.stringify(buildEntry({ ts: new Date().toISOString(), sessionId: S.sessionKey, adapter: "mod", ...fields })));
  S.dirty = true;
}

async function flushLedger($) {
  if (!S.ledgerPath || !S.dirty) return;
  S.dirty = false;
  try { await $.fs.write(S.ledgerPath, S.lines.join("\n") + "\n"); } catch { S.ledgerPath = null; }
}

async function decideMidRun($, agentId) {
  const a = S.core.agents[agentId];
  let decision = { action: "keep", tier: a.tier };
  try {
    const out = await $.model.complete({ model: "haiku", prompt: rubricPrompt({ agentType: "subagente", tier: a.tier, report: core.midRunReport(S.core, agentId), midRun: true }), effort: "low", timeoutMs: 8000 });
    if (out?.isAnswered) decision = combine(parseAnswers(out.text), { current: a.tier, ceiling: a.ceiling, maxTier: S.config.maxTier, signalRed: true, midRun: true, thresholds: S.config.thresholds });
  } catch { /* decisor falhou: mantém o tier */ }
  const applied = core.applyMidRun(S.core, agentId, decision);
  ledger({ scope: "subagent", agentId, escalation: { at: "midRun", from: a.tier, to: applied ? decision.tier : a.tier, action: applied ? "escalate" : "keep" } });
}

async function onSessionStart($, e, next) {
  const r = await next(e);
  await ensure($);
  try { await $.command.register({ name: "devflow-route", description: "Roteamento de modelos do DevFlow: status | on | off | session off" }); } catch {}
  return r;
}

async function onCommand($, e, next) {
  if (e.command !== "devflow-route") return next(e);
  await ensure($);
  const a = String(e.args ?? "").trim();
  if (a === "off") S.disabled = true;
  else if (a === "on") S.disabled = false;
  else if (a === "session off") S.sessionOff = true;
  const c = S.core;
  return {
    text: [
      `roteamento: ${active() ? "ligado" : "desligado"}${S.sessionOff ? " (sessão off)" : ""}${S.config.enabled ? "" : " — exige models.enabled no repo e DEVFLOW_MODEL_ROUTING=1"}`,
      `fase: ${c.phase ?? "—"} · skill: ${c.skill ?? "—"}`,
      `teto: ${c.userModel ?? "?"} · ${c.userEffort ?? "?"} · IDs conhecidos: ${Object.values(c.ids).join(", ") || "—"}`,
      `sessão no tier: ${c.sessionTier ?? "—"} · subagentes rastreados: ${Object.keys(c.agents).length}`,
    ].join("\n"),
  };
}

async function onTurnStart($, e, next) {
  await ensure($);
  if (active()) core.onTurnStart(S.core, { phase: await readPhase($) });
  return next(e);
}

async function onSkillPrompt($, e, next) {
  core.onSkill(S.core, { skill: e.skill, agentId: e.agentId });
  return next(e);
}

async function onAgentSpawn($, e, next) {
  await ensure($);
  if (!active()) return next(e);
  const route = core.onSpawn(S.core, e, { table: S.table, config: S.config, phase: S.core.phase, skill: S.core.skill });
  const res = await next(route?.model ? { ...e, model: route.model } : e);
  if (res && "agentId" in res) {
    core.onSpawned(S.core, res.agentId, route, res.model);
    if (route) ledger({ scope: "subagent", agentId: res.agentId, agentType: e.subagentType, phase: S.core.phase, tier: route.tier, model: res.model, effort: route.effort, source: route.source, ceiling: route.ceiling });
  }
  return res;
}

async function onToolCall($, e, next) {
  const res = await next(e);
  try {
    if (active() && e.agentId && S.core.agents[e.agentId]) {
      const isError = !!res?.isError;
      const summary = isError ? `${e.tool}: ${String(res?.text ?? "").slice(0, 200)}` : "";
      if (core.onSubagentTool(S.core, e.agentId, { isError, summary }, S.config).trigger) await decideMidRun($, e.agentId);
    }
  } catch { /* nunca afeta o resultado da ferramenta */ }
  return res;
}

async function onTurnComplete($, e, next) {
  const res = await next(e);
  try {
    if (active() && res?.usage) {
      const u = res.usage;
      const total = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      ledger({ scope: e.agentId ? "subagent" : "session", agentId: e.agentId, phase: S.core.phase, skill: S.core.skill, model: u.model, usage: u, cacheReadRatio: total ? (u.cache_read_input_tokens ?? 0) / total : undefined });
      if (!e.agentId) await flushLedger($);
    }
  } catch { /* ledger nunca quebra o turno */ }
  return res;
}

/** @type {import('claude-code').Register} */
export const register = (on) => {
  on("session.start", onSessionStart);
  on("command.run", onCommand).catch(($, e, next) => next(e));
  on("turn.start", onTurnStart);
  on("skill.prompt", onSkillPrompt);
  on("agent.spawn", onAgentSpawn).catch(($, e, next) => next(e));
  on("tool.call", onToolCall).catch(($, e, next) => next(e));
  on("turn.complete", onTurnComplete);
  on("turn.step", async function* ($, e, next) {
    let patch = null;
    try {
      await ensure($);
      if (active()) {
        if (e.agentId) patch = core.onSubagentStep(S.core, e);
        else {
          core.observeSession(S.core, e); // teto observado sempre (D17), mesmo com a sessão desligada
          if (!S.sessionOff) patch = core.onSessionStep(S.core, e, { table: S.table, config: S.config });
          if (patch?.switched) ledger({ scope: "session", phase: S.core.phase, tier: S.core.sessionTier, switched: true });
          if (patch) $.ui.status(`devflow → ${patch.model ?? e.model} · ${patch.effort ?? e.effort ?? "-"} · fase ${S.core.phase ?? "-"}`);
        }
      }
    } catch { patch = null; }
    const rw = {};
    if (patch?.model) rw.model = patch.model;
    if (patch?.effort) rw.effort = patch.effort;
    return yield* next(Object.keys(rw).length ? { ...e, ...rw } : e);
  });
};
```

> O `claude plugin validate` classifica `command.run`, `agent.spawn` e `tool.call` como "gating hooks" e pede `.catch` neles (verificado na fase R com este código: "Validation passed"); os demais já tratam erro internamente.

- [ ] **Step 5: Validate and run the kit**

Run: `claude plugin validate . && claude plugin test .`
Expected: validate sem erro (lista os eventos `session.start`, `command.run`, `turn.start`, `skill.prompt`, `agent.spawn`, `tool.call`, `turn.complete`, `turn.step`; os três "gating hooks" com `.catch`; as variáveis `PWD`, `DEVFLOW_MODEL_ROUTING`, `HOME`, `XDG_DATA_HOME`); 5 testes PASS.

- [ ] **Step 6: Incluir o kit no sinal `integration`**

Em `tests/run-integration.sh`, troque a linha final `exec node --test "${FILES[@]}"` por:

```bash
node --test "${FILES[@]}"
if command -v claude >/dev/null 2>&1; then
  claude plugin test .
else
  echo "run-integration: claude ausente — testes do mod (hooks/router.test.ts) NÃO rodaram" >&2
fi
```

- [ ] **Step 7: Commit**

```bash
git add hooks/router.mjs hooks/router.test.ts hooks/hooks.json tests/run-integration.sh
git commit -m "feat(model-routing): adaptador mod (sessão por fase, subagentes, escalada no meio)"
```

---

## Task 9: Fallback clássico (`PreToolUse` da ferramenta Agent)

**Agent:** backend-specialist + security-auditor (revisão pesada) · **Tier:** standard · **Tests:** integration

**Files:**
- Create: `scripts/lib/agent-route-hook.mjs`, `hooks/pre-tool-use-agent`
- Modify: `hooks/hooks.json` (novo item em `PreToolUse`, matcher `Agent` — sonda R-5)
- Test: `tests/integration/test-pre-tool-use-agent.mjs`

**Interfaces:**
- Consumes: Tasks 1–3; `readWorkflowState` (`scripts/lib/workflow-resume.mjs`); `readRegularFileSafe` (`scripts/lib/safe-read.mjs`).
- Produces: stdout = um único JSON `{"hookSpecificOutput":{"hookEventName":"PreToolUse","updatedInput":{...}}}` ou nada; nunca `permissionDecision`.

- [ ] **Step 1: Write the failing test**

```js
// tests/integration/test-pre-tool-use-agent.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = new URL("../../hooks/pre-tool-use-agent", import.meta.url).pathname;

function fx({ models = "models:\n  enabled: true\n", phase = "C", sessionModel = "claude-opus-5-5" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ptu-agent-"));
  mkdirSync(join(dir, ".context/runtime/workflows"), { recursive: true });
  if (models !== null) writeFileSync(join(dir, ".context/.devflow.yaml"), models);
  if (phase) writeFileSync(join(dir, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { name: "x", current_phase: phase } } }));
  const tp = join(dir, "t.jsonl");
  writeFileSync(tp, [JSON.stringify({ type: "user", message: { content: "oi" } }), JSON.stringify({ type: "assistant", message: { model: sessionModel, content: [] } })].join("\n") + "\n");
  return { dir, tp };
}
function run(f, toolInput, env = {}, timeout = 8000) {
  const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: toolInput, cwd: f.dir, transcript_path: f.tp, session_id: "s" });
  const r = spawnSync("bash", [HOOK], { input, encoding: "utf8", timeout, env: { ...process.env, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "", DEVFLOW_MODEL_ROUTING: "1", ...env } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

test("sem model → updatedInput com o alias da rota e TODOS os campos originais, sem permissionDecision", () => {
  const ti = { subagent_type: "general-purpose", prompt: "p", description: "d", run_in_background: false };
  const out = run(fx(), ti);
  const up = out.hookSpecificOutput.updatedInput;
  assert.equal(up.model, "haiku");
  for (const [k, v] of Object.entries(ti)) assert.deepEqual(up[k], v, k);
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
});

test("model explícito dentro do teto → intocado", () => {
  assert.equal(run(fx(), { subagent_type: "general-purpose", prompt: "p", model: "sonnet" }), null);
});

test("teto do transcript: sessão sonnet + architect → intocado (herda sonnet; nunca opus)", () => {
  assert.equal(run(fx({ sessionModel: "claude-sonnet-5-5", phase: "E" }), { subagent_type: "devflow:architect", prompt: "p" }), null);
});

test("model explícito acima do teto → rebaixado para o alias do teto", () => {
  const out = run(fx({ sessionModel: "claude-sonnet-5-5" }), { subagent_type: "general-purpose", prompt: "p", model: "opus" });
  assert.equal(out.hookSpecificOutput.updatedInput.model, "sonnet");
});

test("sem opt-in do usuário, repo sem models, mod ativo, tipo não roteável ou transcript ausente → vazio", () => {
  assert.equal(run(fx(), { subagent_type: "general-purpose", prompt: "p" }, { DEVFLOW_MODEL_ROUTING: "" }), null);
  assert.equal(run(fx({ models: "" }), { subagent_type: "general-purpose", prompt: "p" }), null);
  assert.equal(run(fx(), { subagent_type: "general-purpose", prompt: "p" }, { CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" }), null);
  assert.equal(run(fx(), { subagent_type: "Explore", prompt: "p" }), null);
  const f = fx(); f.tp = join(f.dir, "nao-existe.jsonl");
  assert.equal(run(f, { subagent_type: "general-purpose", prompt: "p" }), null);
});

test(".devflow.yaml como /dev/zero, FIFO ou transcript FIFO: sai rápido e vazio (segurança 1, Review Focus 1)", () => {
  const z = fx({ models: null });
  symlinkSync("/dev/zero", join(z.dir, ".context/.devflow.yaml"));
  const t0 = Date.now();
  assert.equal(run(z, { subagent_type: "general-purpose", prompt: "p" }, {}, 4000), null);
  const fifo = fx({ models: null });
  execFileSync("mkfifo", [join(fifo.dir, ".context/.devflow.yaml")]);
  assert.equal(run(fifo, { subagent_type: "general-purpose", prompt: "p" }, {}, 4000), null);
  const tf = fx();
  tf.tp = join(tf.dir, "t.fifo");
  execFileSync("mkfifo", [tf.tp]);
  assert.equal(run(tf, { subagent_type: "general-purpose", prompt: "p" }, {}, 4000), null);
  assert.ok(Date.now() - t0 < 6000);
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
// Sai com um único JSON ou nada; nunca nega; nunca emite permissionDecision; erro → nada.
// Toda leitura de arquivo é sem seguir symlink e sem bloquear (segurança 1).
import { readFileSync, openSync, readSync, fstatSync, closeSync, constants } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readModels } from "./models-config.mjs";
import { resolveSubagentRoute, effectiveConfig } from "./model-routing.mjs";
import { readWorkflowState } from "./workflow-resume.mjs";
import { readRegularFileSafe, SAFE_READ_MAX_BYTES } from "./safe-read.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAIL = 256 * 1024;

// Cauda de um arquivo REGULAR, sem seguir link e sem bloquear em FIFO.
function safeTail(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile()) return "";
    const len = Math.min(st.size, TAIL);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, st.size - len);
    return buf.toString("utf8");
  } catch {
    return "";
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* já fechado */ }
  }
}

export function sessionModelFromTranscript(path) {
  if (typeof path !== "string" || !path) return null;
  let last = null;
  for (const line of safeTail(path).split("\n")) {
    try {
      const o = JSON.parse(line);
      if (o?.type === "assistant" && typeof o.message?.model === "string" && o.message.model.startsWith("claude")) last = o.message.model;
    } catch { /* linha cortada na borda da cauda */ }
  }
  return last;
}

export function decide(input, env = process.env) {
  if (env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS === "1") return null; // o mod decide (exclusão mútua)
  const ti = input?.tool_input;
  if (!ti || typeof ti !== "object" || typeof input.cwd !== "string") return null;
  const src = readRegularFileSafe(join(input.cwd, ".context/.devflow.yaml"), SAFE_READ_MAX_BYTES);
  if (src === null) return null;
  const config = effectiveConfig(readModels(src), env.DEVFLOW_MODEL_ROUTING);
  if (!config.enabled) return null;
  const table = JSON.parse(readFileSync(join(PLUGIN_ROOT, "assets/model-routing/routes.json"), "utf8"));
  const phase = readWorkflowState(input.cwd)?.phase ?? null;
  const route = resolveSubagentRoute({
    table, config, agentType: ti.subagent_type, phase: ["P", "R", "E", "V", "C"].includes(phase) ? phase : null,
    skill: null, taskTier: null, explicitModel: ti.model ?? null,
    ceilingModel: sessionModelFromTranscript(input.transcript_path), ceilingEffort: null,
  });
  if (!route?.model || route.model === ti.model) return null;
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
# Toda a lógica em scripts/lib/agent-route-hook.mjs; saída = um JSON ou nada; nunca nega.
# `exec`: o node herda o PID do wrapper e morre junto com o timeout do Claude Code (segurança 1).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
exec node "${PLUGIN_ROOT}/scripts/lib/agent-route-hook.mjs" 2>/dev/null
```

Run: `chmod +x hooks/pre-tool-use-agent`

- [ ] **Step 5: Registrar em `hooks/hooks.json`**

No array `"PreToolUse"`, acrescente:

```json
      {
        "matcher": "Agent",
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
Expected: PASS (8 testes)

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/agent-route-hook.mjs hooks/pre-tool-use-agent hooks/hooks.json tests/integration/test-pre-tool-use-agent.mjs
git commit -m "feat(model-routing): fallback clássico PreToolUse para subagentes"
```

---

## Task 10: Adaptador omp (tier → model role, com teto)

**Agent:** backend-specialist · **Tier:** cheap · **Tests:** unit

**Files:**
- Modify: `scripts/lib/omp-enrich-project-agents.mjs`
- Test: `tests/omp/omp-enrich-model-routing.test.mjs`

**Interfaces:**
- Consumes: `toRole`, `tierOf`, `capAtCeiling`, `effectiveConfig` (Task 1), `readModels` (Task 2), `routes.json`, `readRegularFileSafe`.
- Produces: com roteamento efetivo (repo + `DEVFLOW_MODEL_ROUTING=1`), o `model` de cada agente vem de `toRole(capAtCeiling(tier, teto, maxTier))`, onde o **teto é o role que o agente teria sem roteamento** (`omp-roles.yaml`; `default` se não houver). Role de hoje fora da escada de tiers (ex.: `commit` do documentation-writer) = teto ilegível → agente não é tocado. Desligado → comportamento atual byte a byte.

- [ ] **Step 1: Write the failing test**

```js
// tests/omp/omp-enrich-model-routing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
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
function withOptIn(value, fn) {
  const old = process.env.DEVFLOW_MODEL_ROUTING;
  if (value === undefined) delete process.env.DEVFLOW_MODEL_ROUTING; else process.env.DEVFLOW_MODEL_ROUTING = value;
  try { fn(); } finally { if (old === undefined) delete process.env.DEVFLOW_MODEL_ROUTING; else process.env.DEVFLOW_MODEL_ROUTING = old; }
}

test("roteamento efetivo: rebaixa abaixo do role de hoje; role fora da escada não é tocado", () => {
  withOptIn("1", () => {
    const root = project("models:\n  enabled: true\n");
    enrichProjectAgents(root);
    assert.match(fm(root, "architect"), /model: pi\/slow/, "pi/plan (top) → pi/slow (capable)");
    assert.match(fm(root, "architect"), /thinking-level: high/);
    assert.match(fm(root, "documentation-writer"), /model: commit/, "'commit' não é tier: teto ilegível → não roteia (D5)");
  });
});

test("override do projeto nunca sobe acima do role de hoje (segurança 2)", () => {
  withOptIn("1", () => {
    const root = project("models:\n  enabled: true\n  overrides:\n    agents:\n      code-reviewer:\n        tier: top\n      documentation-writer:\n        tier: top\n");
    enrichProjectAgents(root);
    assert.match(fm(root, "code-reviewer"), /model: pi\/slow/, "teto = pi/slow (role de hoje)");
    assert.doesNotMatch(fm(root, "documentation-writer"), /pi\/plan/);
  });
});

test("maxTier limita o role", () => {
  withOptIn("1", () => {
    const root = project("models:\n  enabled: true\n  maxTier: cheap\n");
    enrichProjectAgents(root);
    assert.match(fm(root, "architect"), /model: pi\/smol/);
  });
});

test("sem opt-in do usuário, sem models ou .devflow.yaml hostil: igual ao comportamento atual", () => {
  const ref = project(null);
  enrichProjectAgents(ref);
  for (const [models, optIn] of [["models:\n  enabled: true\n", undefined], ["git:\n  strategy: x\n", "1"]]) {
    withOptIn(optIn, () => {
      const p = project(models);
      enrichProjectAgents(p);
      assert.equal(fm(p, "architect"), fm(ref, "architect"));
    });
  }
  withOptIn("1", () => {
    const z = project(null);
    symlinkSync("/dev/zero", join(z, ".context/.devflow.yaml"));
    enrichProjectAgents(z);
    assert.equal(fm(z, "architect"), fm(ref, "architect"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/omp/omp-enrich-model-routing.test.mjs`
Expected: FAIL no primeiro teste (`architect` recebe `model: pi/plan`)

- [ ] **Step 3: Implement**

Em `scripts/lib/omp-enrich-project-agents.mjs`, acrescente aos imports:

```js
import { readModels } from "./models-config.mjs";
import { toRole, tierOf, capAtCeiling, effectiveConfig } from "./model-routing.mjs";
import { readRegularFileSafe, SAFE_READ_MAX_BYTES } from "./safe-read.mjs";
```

dentro de `enrichProjectAgents`, logo após `const defaults = roles.agent_role_defaults ?? {};`:

```js
  const models = effectiveConfig(
    readModels(readRegularFileSafe(join(projectRoot, ".context/.devflow.yaml"), SAFE_READ_MAX_BYTES) ?? ""),
    process.env.DEVFLOW_MODEL_ROUTING,
  );
  const routes = models.enabled
    ? JSON.parse(readFileSync(join(PLUGIN_ROOT, "assets/model-routing/routes.json"), "utf-8"))
    : null;
  // Teto no omp (D5/D20): o role que o agente teria sem roteamento.
  const routedRole = (name) => {
    if (!routes) return null;
    const want = models.overrides.agents[name] ?? routes.agents?.[name]?.tier;
    const ceiling = tierOf(defaults[name]?.model ?? "default");
    return toRole(capAtCeiling(want, ceiling, models.maxTier));
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
git commit -m "feat(model-routing): adaptador omp traduz tier para model role com teto"
```

---

## Task 11: Skills — tier no plano e escalada entre tentativas

**Agent:** backend-specialist + documentation-writer · **Tier:** standard · **Tests:** e2e

**Files:**
- Modify: `skills/prevc-planning/SKILL.md` (seção "Agent Annotations Per Task": `**Tier:**`)
- Modify: `skills/prevc-execution/SKILL.md` (despacho com tier da task; revisão final; escalada no retry)
- Modify: `skills/autonomous-loop/SKILL.md` (Step 4, retry: escalada antes de re-despachar)
- Test: `tests/e2e/test-skill-model-route-commands.mjs`

**Interfaces:**
- Consumes: CLI da Task 6.
- Produces: blocos de comando nas skills que o teste extrai e **executa**. As skills **não** passam `--ceiling` (o adaptador aplica o teto real — achado 6 da arquitetura); sob omp acrescentam `--runtime omp`.

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

test("cada skill que roteia traz comandos model-route, sem --ceiling", () => {
  for (const s of SKILLS) {
    const cmds = readFileSync(join(ROOT, s), "utf8").match(RE) ?? [];
    assert.ok(cmds.length > 0, s);
    for (const c of cmds) assert.doesNotMatch(c, /--ceiling/, `${s}: ${c.trim()}`);
  }
  assert.match(readFileSync(join(ROOT, "skills/prevc-planning/SKILL.md"), "utf8"), /\*\*Tier:\*\* cheap \| standard \| capable/);
});

test("todos os comandos documentados executam e devolvem saída utilizável", () => {
  const dir = fixture();
  const vars = { AGENT: "general-purpose", TIER: "cheap", TASK_TIER: "standard", REPORT: join(dir, "report.md"),
    ANSWERS: JSON.stringify({ failure_is_capability: 0.9, claims_done_with_evidence: 0, is_stuck: 0, needed_tier: "standard" }) };
  for (const s of SKILLS) {
    for (const raw of readFileSync(join(ROOT, s), "utf8").match(RE)) {
      // 1) a raiz do plugin dentro do caminho; 2) cada "$VAR" (com as aspas) vira o valor entre aspas simples.
      const cmd = raw.trim()
        .replace(/\$CLAUDE_PLUGIN_ROOT/g, ROOT)
        .replace(/"\$\{?(\w+)\}?"/g, (m, v) => (vars[v] !== undefined ? `'${vars[v]}'` : m));
      const out = execSync(cmd, { cwd: dir, encoding: "utf8", shell: "/bin/bash", env: { ...process.env, DEVFLOW_MODEL_ROUTING: "1" } });
      assert.ok(out.trim().length > 0, `${s}: ${raw.trim()}`);
      if (/ resolve | --answers /.test(raw)) JSON.parse(out);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/e2e/test-skill-model-route-commands.mjs`
Expected: FAIL em "cada skill que roteia traz comandos model-route, sem --ceiling"

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
`capable` = julgamento de desenho. Escolha um valor só. Inerte quando o roteamento não está ligado.
```

- [ ] **Step 4: `skills/prevc-execution/SKILL.md`**

Acrescente a seção:

````markdown
## Roteamento de modelos (quando ligado)

Ao despachar o implementer de uma task cujo plano declara `**Tier:**`, obtenha o modelo e passe-o na ferramenta Agent (sob omp, acrescente `--runtime omp` e use `route.role`):

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" resolve --agent general-purpose --task-tier "$TASK_TIER"
```

Use `route.model` como `model` do despacho; se `route` for `null`, despache sem `model`. Não passe teto: o adaptador aplica o teto real (o modelo que o usuário escolheu). Para a revisão final da branch:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" resolve --agent general-purpose --skill final-review
```

Quando um subagente volta com falha (teste vermelho no ledger do `verify:`, revisor reprovou, `BLOCKED`), salve o relatório dele em arquivo e gere a rubrica:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" escalate --agent "$AGENT" --tier "$TIER" --report "$REPORT"
```

Responda a rubrica com um JSON e peça a decisão:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" escalate --agent "$AGENT" --tier "$TIER" --answers "$ANSWERS" --signal-red
```

`escalate` → re-despache com o `model` devolvido; `human` → escalada humana atual; `keep` → retry no mesmo modelo.
````

- [ ] **Step 5: `skills/autonomous-loop/SKILL.md`**

No Step 4, no ramo "If `story.attempts < escalation.max_retries_per_story`", antes de "Retrying with adjusted approach", acrescente:

````markdown
     - Se o roteamento de modelos estiver ligado: gere a rubrica e a decisão de modelo para o retry (sob omp, acrescente `--runtime omp`):
       ```bash
       node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" escalate --agent "$AGENT" --tier "$TIER" --report "$REPORT"
       node "$CLAUDE_PLUGIN_ROOT/scripts/model-route.mjs" escalate --agent "$AGENT" --tier "$TIER" --answers "$ANSWERS" --signal-red
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

## Task 12: Onboarding — doctor, guia pós-update, `devflow:config` e `init`

**Agent:** backend-specialist + documentation-writer · **Tier:** standard · **Tests:** unit

**Files:**
- Modify: `scripts/lib/doctor.mjs` (novo check `model-routing`, incluído em `CHECKS`)
- Modify: `references/post-update-guide.md` (nova feature)
- Modify: `skills/config/SKILL.md` (novo passo "Roteamento de modelos")
- Modify: `skills/project-init/SKILL.md` (apontar o passo no fluxo do `init`, D19)
- Test: `tests/lib/test-doctor-model-routing.mjs`

**Interfaces:**
- Consumes: `readModels` (Task 2); `readRegularFileSafe`.
- Produces: check `{ id: "model-routing", run(ctx) → { status: "OK"|"WARN"|"SKIP", diagnosis, repair } }`; `ctx.env` e `ctx.claudeVersion` opcionais (testabilidade).

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
const ON = "models:\n  enabled: true\n";
const ALL = { DEVFLOW_MODEL_ROUTING: "1", CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" };

test("check registrado", () => assert.ok(check));

test("repo sem models → SKIP", () => {
  assert.equal(check.run({ cwd: cwdWith("git:\n  strategy: x\n"), env: {}, claudeVersion: "2.1.294" }).status, "SKIP");
});

test("repo pede roteamento sem a confirmação do usuário → WARN (D18)", () => {
  const r = check.run({ cwd: cwdWith(ON), env: {}, claudeVersion: "2.1.294" });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /pede roteamento/);
  assert.match(r.repair, /DEVFLOW_MODEL_ROUTING/);
});

test("ligado sem function hooks → WARN explicando o fallback", () => {
  const r = check.run({ cwd: cwdWith(ON), env: { DEVFLOW_MODEL_ROUTING: "1" }, claudeVersion: "2.1.294" });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /fallback clássico/);
  assert.match(r.repair, /CLAUDE_CODE_ENABLE_FUNCTION_HOOKS/);
});

test("Claude Code abaixo da versão testada → WARN", () => {
  const r = check.run({ cwd: cwdWith(ON), env: ALL, claudeVersion: "2.1.200" });
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /2\.1\.294/);
});

test("tudo ligado na versão testada → OK", () => {
  assert.equal(check.run({ cwd: cwdWith(ON), env: ALL, claudeVersion: "2.1.294" }).status, "OK");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/test-doctor-model-routing.mjs`
Expected: FAIL em "check registrado" (`check` é `undefined`)

- [ ] **Step 3: Implement the check**

Em `scripts/lib/doctor.mjs`, acrescente os imports `import { readModels } from "./models-config.mjs";` e `import { readRegularFileSafe, SAFE_READ_MAX_BYTES } from "./safe-read.mjs";` (se `execFileSync` ainda não estiver importado, inclua `import { execFileSync } from "node:child_process";`), o objeto abaixo antes de `export const CHECKS`, e `modelRouting` ao fim do array `CHECKS`:

```js
const MODEL_ROUTING_MIN = [2, 1, 294]; // versão testada (sondas da fase R)

function claudeVersionOf(ctx) {
  if (typeof ctx.claudeVersion === "string") return ctx.claudeVersion;
  try { return execFileSync("claude", ["--version"], { encoding: "utf-8", timeout: 5000 }).trim(); } catch { return ""; }
}

function belowMin(version) {
  const m = String(version).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return false;
  const v = m.slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (v[i] !== MODEL_ROUTING_MIN[i]) return v[i] < MODEL_ROUTING_MIN[i];
  return false;
}

const modelRouting = {
  id: "model-routing",
  title: "Roteamento de modelos (models: no .devflow.yaml)",
  severity: "warn",
  destructive: false,
  run(ctx) {
    const m = readModels(readRegularFileSafe(join(ctx.cwd, ".context", ".devflow.yaml"), SAFE_READ_MAX_BYTES) ?? "");
    if (!m.enabled) return { status: "SKIP", diagnosis: "Roteamento de modelos não pedido por este repositório (opt-in).", repair: "" };
    const env = ctx.env ?? process.env;
    if (env.DEVFLOW_MODEL_ROUTING !== "1") {
      return {
        status: "WARN",
        diagnosis: "Este repositório pede roteamento de modelos (models.enabled), mas ele só liga com a sua confirmação.",
        repair: 'Para aceitar, adicione "DEVFLOW_MODEL_ROUTING": "1" ao bloco env do ~/.claude/settings.json e reinicie. Para recusar, não faça nada.',
      };
    }
    const version = claudeVersionOf(ctx);
    if (belowMin(version)) {
      return { status: "WARN", diagnosis: `Claude Code ${version} é anterior à versão testada (2.1.294): o mod pode não carregar.`, repair: "Atualize o Claude Code." };
    }
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
Expected: PASS (6 testes)

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
2. Confirme no seu escopo: adicione `"DEVFLOW_MODEL_ROUTING": "1"` ao bloco `env` do `~/.claude/settings.json` (sem isso nada é roteado).
3. (Recomendado) `"CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"` no mesmo bloco, para a camada de sessão e o esforço por passo.
````

- [ ] **Step 6: `skills/config/SKILL.md`**

Acrescente o passo (perguntas em pt-BR, uma por vez):

```markdown
### Passo: Roteamento de modelos (opcional)

1. Detecte: `grep -q "^models:" .context/.devflow.yaml`; `printenv DEVFLOW_MODEL_ROUTING`; `printenv CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`; runtimes ativos.
2. Pergunte: ligar o roteamento neste projeto? Camadas: sessão por fase (só com function hooks) e/ou subagentes. `maxTier` (opcional). Ledger de medição (opt-in; fica em `~/.local/share/devflow-model-routing/`, nunca no repo, sem conteúdo).
3. Pergunte: ligar a **escalada no meio da execução** (`midRun.enabled`)? Padrão: não. Explique: com N falhas seguidas de ferramenta, um Haiku decide se o subagente sobe um degrau; uma consulta por subagente; só com function hooks.
4. Explique o custo de cache: cada troca de fase faz a primeira mensagem seguinte reler o contexto sem cache; o default troca uma vez por workflow (R→E). Trocar só o esforço não custa cache.
5. Confirmação do usuário (obrigatória): sem `DEVFLOW_MODEL_ROUTING=1` no ambiente, nada é roteado — o `.devflow.yaml` sozinho só pede. Mostre o bloco `env` para o usuário colar no `~/.claude/settings.json` (inclua `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` se ele quiser a camada de sessão); **nunca** escreva no `settings.json`.
6. Grave o bloco `models:` no `.devflow.yaml` em estilo bloco (o leitor não aceita mapas inline):
   ```yaml
   models:
     enabled: true
     session: true
     subagents: true
     ledger: true
     midRun:
       enabled: false
   ```
7. omp ∈ runtimes: rode `DEVFLOW_MODEL_ROUTING=1 node "$CLAUDE_PLUGIN_ROOT/scripts/lib/omp-enrich-project-agents.mjs" .`.
8. Confirme com `/devflow:devflow-doctor` (check `model-routing`).
```

- [ ] **Step 7: `skills/project-init/SKILL.md`**

Na lista de configurações que o `init` delega ao `devflow:config` (onde aparece "Configure MemPalace — … (via devflow:config)"), acrescente o item:

```markdown
9. **Configure model routing** — opcional: roteamento de modelos por fase/agente, incluindo a escalada no meio da execução (desligada por padrão) e a confirmação `DEVFLOW_MODEL_ROUTING=1` do usuário (via devflow:config, passo "Roteamento de modelos")
```

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/doctor.mjs references/post-update-guide.md skills/config/SKILL.md skills/project-init/SKILL.md tests/lib/test-doctor-model-routing.mjs
git commit -m "feat(model-routing): doctor, guia pós-update e passo no config/init"
```

---

## Task 13: ADR e documentação

**Agent:** architect + documentation-writer · **Tier:** standard · **Tests:** lint

**Files:**
- Create: ADR via `devflow:adr-builder` (modo CREATE, prefilled com a spec), em `.context/engineering/adrs/`
- Create: `docs/model-routing.md`
- Modify: `README.md` (seção de features: um parágrafo + link para `docs/model-routing.md`)

- [ ] **Step 1: Criar a ADR**

Invoque `devflow:adr-builder` em modo CREATE (`/devflow adr:new --mode=prefilled`) com o briefing: título "Roteamento de modelos do DevFlow — lib única com tier abstrato, sessão por fase e subagentes por agente/fase/task, teto na escolha do usuário, três adaptadores"; status Proposto; kind `gated` (gate: relatório de 2 semanas confirmar economia sem regressão de escaladas). Guardrails:
- SEMPRE resolver rota numa lib pura (sem `node:*`) e traduzir tier por adaptador; NUNCA ID fixo de modelo na tabela.
- NUNCA rotear acima do modelo/esforço do usuário; teto ilegível → não rotear (a garantia vale quando o adaptador consegue ler o teto).
- SEMPRE exigir opt-in duplo: `models.enabled` do repo **e** `DEVFLOW_MODEL_ROUTING=1` do usuário; repositório sozinho nunca liga.
- SEMPRE alias na ferramenta Agent/`agent.spawn` e ID completo no `turn.step`; sem ID conhecido, só esforço.
- SEMPRE ler arquivos do repositório com leitura segura (sem link, sem bloqueio, arquivo regular, tamanho limitado; no mod, `$.fs.stat` com `realPath` sob a raiz).
- NUNCA negar despacho nem emitir `permissionDecision` no fallback clássico.
- QUANDO o mod precisar do bloco `models:`, ENTÃO importa `models-config.mjs` direto (puro); o parser segue único (ADR-011).
- Escalada no meio desligada por padrão; uma consulta por subagente.
Registre a versão testada do Claude Code (2.1.294) e os resultados das sondas (spec §11). Confira o número livre com `ls .context/engineering/adrs/` antes (há renumeração pendente em outra feature).

- [ ] **Step 2: Rodar a auditoria da ADR**

Run: `node "$CLAUDE_PLUGIN_ROOT/scripts/adr-audit.mjs" .context/engineering/adrs/<arquivo-novo>.md`
Expected: os 12 checks sem FAIL.

- [ ] **Step 3: Escrever `docs/model-routing.md`**

Conteúdo: o que é; as três camadas (sessão, subagentes, escalada); os três adaptadores e o que cada um entrega (tabela da spec §4); como ligar (`/devflow config` + `DEVFLOW_MODEL_ROUTING=1` + `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`); `/devflow-route`; `model-route report`; custo de cache (troca de modelo custa; troca de esforço não); limites declarados (peso na cota não é público; worktrees; garantia de teto depende de lê-lo). Sem nome de projeto privado e sem caminho local.

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

1. Sessão real com o mod ativo (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, `DEVFLOW_MODEL_ROUTING=1`), atravessando P→E num projeto descartável: conferir pelo ledger e pelo `usage` do `turn.complete` uma troca de modelo da sessão (só depois de um subagente ter ensinado o ID do tier), um subagente `general-purpose` no modelo roteado e o teto respeitado.
2. Mesma coisa com o mod desligado: o fallback clássico pelo `subagents/agent-*.meta.json` (`model`).
3. Sem `DEVFLOW_MODEL_ROUTING`: nada roteado.
4. `node scripts/model-route.mjs report` sobre as sessões.
5. Re-revisão de segurança das Tasks 8 e 9 contra o código real, reexecutando as PoCs da fase R (`/dev/zero`, FIFO, decisor em loop).
