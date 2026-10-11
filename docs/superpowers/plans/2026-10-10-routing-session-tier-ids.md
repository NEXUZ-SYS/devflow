# ID verificado do tier antes da primeira troca da sessão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** routing-session-tier-ids | **Scale:** LARGE | **Phase:** P→R

**Goal:** a sessão troca para o tier da fase sem depender de um subagente, usando no `turn.step` só IDs verificados na sessão.

**Architecture:** o core puro (`router-core.mjs`) ganha a cadeia de candidatos, a classificação da sonda e a máquina de estado das sondas. O adaptador (`hooks/router.mjs`) dispara a sonda em segundo plano com `$.model.complete`, mantém o cache persistente e grava as linhas novas do ledger. O formato do ledger, a config, o relatório e o laboratório acompanham.

**Tech Stack:** Node ≥ 22, ESM `.mjs`, `node:test`; módulo de function hooks do Claude Code (mod); libs puras sem `node:*`.

**Agents:** backend-specialist (T1–T5), documentation-writer (T6), test-writer/backend-specialist (T7), code-reviewer (revisões).

**Spec:** `docs/superpowers/specs/2026-10-10-routing-session-tier-ids-design.md`

requiredSignals: [unit, integration, e2e, lint, standards]

## Global Constraints

- pt-BR em comentários, mensagens, docs e commits; termos técnicos mantidos.
- TDD obrigatório: teste vermelho observado antes do código.
- Libs em `scripts/lib/` continuam puras: nenhum `import` de `node:*` (há teste de propriedade).
- Nenhum ID chega ao `turn.step` sem estar em `state.ids` (aprendido do engine ou sonda `ok` nesta sessão).
- Filtro de ID em todo lugar: `^claude-[a-z0-9-]+$`, até 64 caracteres e `tierOf(id) === tier`.
- Ledger: só chaves da allowlist e valores por enum ou regex SAFE; nunca o texto da resposta da sonda.
- Commits só por caminho explícito (`git add -- <arquivos>`). Nunca incluir: `.context/.devflow.yaml`, `.context/plans/model-routing.md`, `.context/workflow/.checkpoint/*`, `.gitignore`, `docs/jev-*.md`, `docs/jev_in_loop_engineering.md`, `docs/screenshots/`, `docs/test-writer.md`, `tsconfig.json`, `docs/superpowers/specs/2026-10-08-session-start-context-budget-design.md`.
- Subagentes: proibido `git push`, `gh`, abrir PR, mergear ou mudar de branch. Só commit local na branch `fix/routing-session-tier-ids` (e, na T7, no repo do laboratório).
- Repo público: sem caminhos locais nem nomes de projeto privado em código, docs ou commits.
- Mensagens de commit em Conventional Commits, terminando com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XMoVmRxyyDzLtpbWLSmKTg
  ```
- Testes: `bash tests/run-unit.sh`, `bash tests/run-integration.sh`, `bash tests/run-e2e.sh`, `bash tests/run-lint.sh`.

## Review Focus

1. **Sonda resolvida depois que o ID já foi aprendido do engine:** o aprendido vence; a sonda `ok` não sobrescreve `state.ids[T]`. Teste na T3.
2. **Várias necessidades do mesmo tier antes da sonda resolver:** uma sonda só em voo. Teste na T3 e na T4.
3. **Testes antigos do adaptador que contam `model.complete`:** passam a ver as sondas. O ajuste filtra por `prompt !== "ok"`, sem afrouxar asserção. T4.
4. **Cache com JSON inválido, link simbólico ou maior que 4 KiB:** ignorado, sem lançar. Testes na T1 (parse) e na T4 (contenção).
5. **Linhas `probe` sem `usage` no relatório e no laboratório:** não quebram a agregação nem o `INV-LEDGER`. Testes na T5 e na T7.

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `scripts/lib/routing-ledger.mjs` | allowlist/enums novos; caminho, parse e serialização do cache | T1 |
| `scripts/lib/models-config.mjs` | `models.ids` | T2 |
| `assets/model-routing/routes.json` | `ids` padrão | T2 |
| `scripts/lib/router-core.mjs` | candidatos, classificação, sondas, `idPending`/`idSource` | T3 |
| `hooks/router.mjs` | sonda em segundo plano, cache, ledger | T4 |
| `scripts/lib/routing-report.mjs` | seção de sondas e ID pendente | T5 |
| ADR-017, README das ADRs, CHANGELOG, achados | documentação | T6 |
| `devflow-routing-lab`: `lib/ledger.mjs`, `lib/invariants.mjs` | allowlist e evidência do `INV-SESS` | T7 |

---

### Task 1: ledger — chaves novas e cache de IDs

**Agent:** backend-specialist · **Tier:** cheap · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit

**Files:**
- Modify: `scripts/lib/routing-ledger.mjs`
- Test: `tests/lib/routing-ledger.test.mjs`

**Interfaces:**
- Produces: `LEDGER_KEYS` com `idPending`, `idSource`, `probe`; `buildEntry` aceita `scope: "probe"`, `idPending ∈ TIERS`, `idSource ∈ ["learned","probe"]`, `probe ∈ ["ok","rejected","error"]`; `idsCachePathFrom({ xdgDataHome, home }) → string`; `parseIdsCache(text) → { [tier]: id }`; `serializeIdsCache(ids) → string`; `isTierId(id, tier) → boolean`.

- [ ] **Step 1: testes vermelhos** — acrescentar ao fim de `tests/lib/routing-ledger.test.mjs` (e trocar o import da linha 5 por `import { buildEntry, LEDGER_KEYS, projectKey, ledgerDirFrom, idsCachePathFrom, parseIdsCache, serializeIdsCache, isTierId } from "../../scripts/lib/routing-ledger.mjs";`):

```js
test("buildEntry: linha de sonda e campos de ID por enum", () => {
  const p = buildEntry({ scope: "probe", tier: "standard", model: "claude-sonnet-5-5", probe: "ok" });
  assert.deepEqual(p, { scope: "probe", tier: "standard", model: "claude-sonnet-5-5", probe: "ok" });
  const s = buildEntry({ scope: "session", idPending: "standard", idSource: "probe", switched: true });
  assert.equal(s.idPending, "standard");
  assert.equal(s.idSource, "probe");
  const bad = buildEntry({ scope: "probe", probe: "talvez", idPending: "ultra", idSource: "chute" });
  assert.equal(bad.probe, undefined);
  assert.equal(bad.idPending, undefined);
  assert.equal(bad.idSource, undefined);
  for (const k of ["idPending", "idSource", "probe"]) assert.ok(LEDGER_KEYS.includes(k), k);
});

test("idsCachePathFrom: por usuário, não por projeto", () => {
  assert.equal(idsCachePathFrom({ xdgDataHome: "/x", home: "/h" }), "/x/devflow-model-routing/ids.json");
  assert.equal(idsCachePathFrom({ xdgDataHome: "rel", home: "/h" }), "/h/.local/share/devflow-model-routing/ids.json");
  assert.equal(idsCachePathFrom({ home: "/h" }), "/h/.local/share/devflow-model-routing/ids.json");
});

test("isTierId: regex, tamanho e tier do próprio ID", () => {
  assert.equal(isTierId("claude-sonnet-5-5", "standard"), true);
  assert.equal(isTierId("claude-opus-5-5", "cheap"), false);
  assert.equal(isTierId("sonnet", "standard"), false);
  assert.equal(isTierId("claude-sonnet-5-5 ; rm", "standard"), false);
  assert.equal(isTierId(`claude-sonnet-${"9".repeat(60)}`, "standard"), false);
  assert.equal(isTierId(null, "standard"), false);
});

test("parseIdsCache: tolerante; só entradas válidas", () => {
  assert.deepEqual(parseIdsCache("{"), {});
  assert.deepEqual(parseIdsCache(JSON.stringify({ version: 2, ids: { standard: "claude-sonnet-5-5" } })), {});
  assert.deepEqual(parseIdsCache(JSON.stringify({ version: 1, ids: [] })), {});
  assert.deepEqual(
    parseIdsCache(JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-5-5", cheap: "claude-opus-5-5", ultra: "claude-x", top: 7 } })),
    { standard: "claude-sonnet-5-5" },
  );
});

test("serializeIdsCache: ida e volta, filtrando inválidos", () => {
  const txt = serializeIdsCache({ standard: "claude-sonnet-5-5", cheap: "lixo", __proto__: { capable: "claude-opus-5-5" } });
  assert.deepEqual(JSON.parse(txt), { version: 1, ids: { standard: "claude-sonnet-5-5" } });
  assert.deepEqual(parseIdsCache(txt), { standard: "claude-sonnet-5-5" });
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/lib/routing-ledger.test.mjs` → FAIL (exports inexistentes).

- [ ] **Step 3: implementar** em `scripts/lib/routing-ledger.mjs`:

```js
import { TIERS, EFFORTS, PHASES, tierOf } from "./model-routing.mjs";

export const LEDGER_KEYS = Object.freeze([
  "ts", "sessionId", "scope", "agentId", "agentType", "phase", "skill", "tier", "model", "effort",
  "source", "ceiling", "adapter", "usage", "cacheReadRatio", "switched", "escalation",
  "idPending", "idSource", "probe",
]);
```

No `ENUM`: `scope: ["session", "subagent", "probe"]`, e acrescentar `idPending: TIERS`, `idSource: ["learned", "probe"]`, `probe: ["ok", "rejected", "error"]`.

Depois de `ledgerDirFrom`, extraindo a base para um helper reaproveitado pelos dois:

```js
const dataBase = ({ xdgDataHome, home }) => (typeof xdgDataHome === "string" && xdgDataHome.startsWith("/") ? xdgDataHome : `${home}/.local/share`);

export function ledgerDirFrom({ xdgDataHome, home, cwd }) {
  return `${dataBase({ xdgDataHome, home })}/devflow-model-routing/${projectKey(cwd)}`;
}

// Cache de IDs verificados (spec 2026-10-10-routing-session-tier-ids §3.3): por usuário, não por projeto.
// É só fonte de candidato: o mod re-sonda antes de usar.
export function idsCachePathFrom({ xdgDataHome, home }) {
  return `${dataBase({ xdgDataHome, home })}/devflow-model-routing/ids.json`;
}

const ID_RE = /^claude-[a-z0-9-]+$/;
export function isTierId(id, tier) {
  return typeof id === "string" && id.length <= 64 && ID_RE.test(id) && tierOf(id) === tier;
}

function pickIds(src) {
  const out = {};
  if (!src || typeof src !== "object" || Array.isArray(src)) return out;
  for (const t of TIERS) if (Object.hasOwn(src, t) && isTierId(src[t], t)) out[t] = src[t];
  return out;
}

export function parseIdsCache(text) {
  let d;
  try { d = JSON.parse(text); } catch { return {}; }
  return d && d.version === 1 ? pickIds(d.ids) : {};
}

export function serializeIdsCache(ids) {
  return JSON.stringify({ version: 1, ids: pickIds(ids) }) + "\n";
}
```

- [ ] **Step 4: rodar e ver passar** — `node --test tests/lib/routing-ledger.test.mjs` → PASS; `bash tests/run-unit.sh` → verde.

- [ ] **Step 5: commit**

```bash
git add -- scripts/lib/routing-ledger.mjs tests/lib/routing-ledger.test.mjs
git commit -m "feat(routing): ledger com sonda de ID e cache de IDs verificados"
```

---

### Task 2: config — `models.ids` e tabela padrão

**Agent:** backend-specialist · **Tier:** cheap · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit

**Files:**
- Modify: `scripts/lib/models-config.mjs`, `assets/model-routing/routes.json`
- Test: `tests/lib/models-config.test.mjs`

**Interfaces:**
- Consumes: `isTierId` (T1).
- Produces: `readModels(src).ids → { [tier]: id }` (padrão `{}`); `routes.json` → `ids: { cheap, standard, capable, top }`.

- [ ] **Step 1: testes vermelhos** — acrescentar a `tests/lib/models-config.test.mjs`:

```js
test("models.ids: só tier conhecido com ID do próprio tier", () => {
  const m = readModels(`models:
  enabled: true
  ids:
    standard: claude-sonnet-5-5   # verificado
    cheap: claude-opus-5-5
    ultra: claude-x
    capable: opus
`);
  assert.deepEqual(m.ids, { standard: "claude-sonnet-5-5" });
  assert.deepEqual(readModels("models:\n  enabled: true\n").ids, {});
  assert.deepEqual(readModels("").ids, {});
});

test("routes.json traz IDs padrão válidos para os quatro tiers", async () => {
  const { isTierId } = await import("../../scripts/lib/routing-ledger.mjs");
  const t = JSON.parse(readFileSync(new URL("../../assets/model-routing/routes.json", import.meta.url), "utf8"));
  for (const tier of ["cheap", "standard", "capable", "top"]) assert.ok(isTierId(t.ids?.[tier], tier), tier);
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/lib/models-config.test.mjs` → FAIL.

- [ ] **Step 3: implementar.** Em `models-config.mjs`: `import { isTierId } from "./routing-ledger.mjs";`, `ids: {}` em `defaults()`, e antes do `return out` de `readModels`:

```js
  if (isMap(data.ids)) for (const t of TIERS) if (Object.hasOwn(data.ids, t) && isTierId(clean(data.ids[t]), t)) out.ids[t] = clean(data.ids[t]);
```

Em `assets/model-routing/routes.json`, logo depois de `"effortByTier"`:

```json
  "ids": { "cheap": "claude-haiku-5-5", "standard": "claude-sonnet-5-5", "capable": "claude-opus-5-5", "top": "claude-fable-5-1" },
```

Conferir que nenhum teste existente valida `routes.json` por lista fechada de chaves; se houver, acrescentar `ids` a essa lista.

- [ ] **Step 4: rodar e ver passar** — `node --test tests/lib/models-config.test.mjs` e `bash tests/run-unit.sh` → verde.

- [ ] **Step 5: commit**

```bash
git add -- scripts/lib/models-config.mjs assets/model-routing/routes.json tests/lib/models-config.test.mjs
git commit -m "feat(routing): models.ids no .devflow.yaml e IDs padrão na tabela"
```

---

### Task 3: core — candidatos, sonda e ID pendente

**Agent:** backend-specialist · **Tier:** standard · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit

**Files:**
- Modify: `scripts/lib/router-core.mjs`
- Test: `tests/lib/router-core.test.mjs`

**Interfaces:**
- Consumes: `isTierId` (T1); `config.ids` e `table.ids` (T2).
- Produces:
  - `createRouterState()` ganha `probes: {}` e `idSource: {}`;
  - `learnId` marca `state.idSource[t] = "learned"`;
  - `PROBE_MAX_ATTEMPTS = 3`;
  - `idCandidates(tier, { cache, config, table }) → string[]`;
  - `classifyProbe(result) → "ok" | "rejected" | "error"`;
  - `nextProbe(state, tier, { cache, config, table }) → { tier, id } | null` (marca em voo);
  - `onProbeResult(state, tier, id, outcome)`;
  - `onSessionStep` devolve também `idPending: <tier>` (sem ID verificado do tier pedido) e `idSource` (na troca efetiva para um tier abaixo do teto).

- [ ] **Step 1: testes vermelhos** — acrescentar a `tests/lib/router-core.test.mjs`:

```js
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";

test("idCandidates: cache → models.ids → tabela, sem repetir e só do próprio tier", () => {
  const got = C.idCandidates("standard", {
    cache: { standard: "claude-sonnet-9" },
    config: { ids: { standard: SONNET } },
    table: { ids: { standard: SONNET, cheap: "claude-haiku-5-5" } },
  });
  assert.deepEqual(got, ["claude-sonnet-9", SONNET]);
  assert.deepEqual(C.idCandidates("standard", { cache: { standard: OPUS }, config: {}, table: {} }), []);
  assert.deepEqual(C.idCandidates("standard", {}), []);
});

test("classifyProbe: ok, rejected e error", () => {
  assert.equal(C.classifyProbe({ isAnswered: true, text: "ok" }), "ok");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "empty-reply" }), "ok");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 }), "rejected");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "invalid_request", status: 400 }), "rejected");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "unknown", status: 404 }), "rejected");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "rate_limit", status: 429 }), "error");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "overloaded", status: null }), "error");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "aborted" }), "error");
  assert.equal(C.classifyProbe(undefined), "error");
});

test("nextProbe: uma sonda em voo por tier; rejected passa ao próximo; 3 erros desistem", () => {
  const s = C.createRouterState();
  const ctx = { cache: {}, config: { ids: { standard: "claude-sonnet-9" } }, table: { ids: { standard: SONNET } } };
  const p1 = C.nextProbe(s, "standard", ctx);
  assert.deepEqual(p1, { tier: "standard", id: "claude-sonnet-9" });
  assert.equal(C.nextProbe(s, "standard", ctx), null, "em voo: nenhuma outra");
  C.onProbeResult(s, "standard", p1.id, "rejected");
  const p2 = C.nextProbe(s, "standard", ctx);
  assert.equal(p2.id, SONNET);
  for (let i = 0; i < C.PROBE_MAX_ATTEMPTS; i++) {
    C.onProbeResult(s, "standard", SONNET, "error");
    const again = C.nextProbe(s, "standard", ctx);
    if (i < C.PROBE_MAX_ATTEMPTS - 1) assert.equal(again?.id, SONNET, `tentativa ${i + 2}`);
    else assert.equal(again, null, "desistiu do tier");
  }
  assert.equal(s.ids.standard, undefined);
});

test("nextProbe: candidatos esgotados → null; tier com ID já conhecido → null", () => {
  const s = C.createRouterState();
  assert.equal(C.nextProbe(s, "standard", {}), null);
  const t = C.createRouterState();
  C.learnId(t, SONNET);
  assert.equal(C.nextProbe(t, "standard", { table: { ids: { standard: SONNET } } }), null);
});

test("onProbeResult ok: vira ID da sessão com origem probe; o aprendido do engine vence", () => {
  const s = C.createRouterState();
  const p = C.nextProbe(s, "standard", { table: { ids: { standard: SONNET } } });
  C.onProbeResult(s, "standard", p.id, "ok");
  assert.equal(s.ids.standard, SONNET);
  assert.equal(s.idSource.standard, "probe");

  const t = C.createRouterState();
  const q = C.nextProbe(t, "standard", { table: { ids: { standard: SONNET } } });
  C.learnId(t, "claude-sonnet-9");
  C.onProbeResult(t, "standard", q.id, "ok");
  assert.equal(t.ids.standard, "claude-sonnet-9");
  assert.equal(t.idSource.standard, "learned");
});

test("onSessionStep: sem ID do tier pedido → idPending e só esforço; com ID de sonda → troca com idSource probe", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "E" });
  const a = step(s, OPUS, "xhigh");
  assert.equal(a.idPending, "standard");
  assert.equal(a.model, undefined);
  const p = C.nextProbe(s, "standard", { table });
  C.onProbeResult(s, "standard", p.id, "ok");
  const b = step(s, OPUS, "xhigh");
  assert.equal(b.model, SONNET);
  assert.equal(b.switched, true);
  assert.equal(b.idSource, "probe");
  assert.equal(b.idPending, undefined);
  const c = step(s, OPUS, "xhigh");
  assert.equal(c?.idSource, undefined, "idSource só na troca efetiva");
});

test("onSessionStep: no teto (P) nunca pede ID; troca com ID aprendido marca idSource learned", () => {
  const s = C.createRouterState();
  C.onTurnStart(s, { phase: "P" });
  assert.equal(step(s, OPUS, "xhigh")?.idPending, undefined);
  C.learnId(s, SONNET);
  C.onTurnStart(s, { phase: "E" });
  assert.equal(step(s, OPUS, "xhigh").idSource, "learned");
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/lib/router-core.test.mjs` → FAIL.

- [ ] **Step 3: implementar** em `scripts/lib/router-core.mjs`:

```js
import { isTierId } from "./routing-ledger.mjs";

export const PROBE_MAX_ATTEMPTS = 3;

export function createRouterState() {
  return { userModel: null, userEffort: null, phase: null, skill: null, sessionTier: null, lastSessionModel: null, ids: {}, idSource: {}, probes: {}, agents: {}, agentTypes: {} };
}

export function learnId(state, modelId) {
  if (typeof modelId !== "string" || !/^claude-[a-z0-9-]+$/.test(modelId)) return;
  const t = tierOf(modelId);
  if (t) { state.ids[t] = modelId; state.idSource[t] = "learned"; }
}

// D21 v1.2 (spec 2026-10-10-routing-session-tier-ids §3.1): candidatos a ID do tier, na ordem cache →
// models.ids → tabela padrão. Nenhum vai ao turn.step sem sonda ok nesta sessão.
export function idCandidates(tier, { cache, config, table } = {}) {
  const out = [];
  for (const id of [cache?.[tier], config?.ids?.[tier], table?.ids?.[tier]]) if (isTierId(id, tier) && !out.includes(id)) out.push(id);
  return out;
}

const REJECT_ERRORS = ["invalid_request", "model_not_found"];
export function classifyProbe(r) {
  if (!r || typeof r !== "object") return "error";
  if (r.isAnswered === true || r.reason === "empty-reply") return "ok";
  if (r.reason === "api-error" && (REJECT_ERRORS.includes(r.error) || r.status === 400 || r.status === 404)) return "rejected";
  return "error";
}

export function nextProbe(state, tier, ctx) {
  if (state.ids[tier]) return null;
  const p = (state.probes[tier] ??= { tried: [], attempts: 0, inFlight: false, gaveUp: false });
  if (p.inFlight || p.gaveUp) return null;
  const id = idCandidates(tier, ctx).find((c) => !p.tried.includes(c));
  if (!id) { p.gaveUp = true; return null; }
  p.inFlight = true;
  return { tier, id };
}

export function onProbeResult(state, tier, id, outcome) {
  const p = state.probes[tier];
  if (!p) return;
  p.inFlight = false;
  if (outcome === "ok") {
    if (!state.ids[tier]) { state.ids[tier] = id; state.idSource[tier] = "probe"; } // aprendido do engine vence
    return;
  }
  if (outcome === "rejected") { p.tried.push(id); p.attempts = 0; return; }
  p.attempts += 1;
  if (p.attempts >= PROBE_MAX_ATTEMPTS) p.gaveUp = true;
}
```

E em `onSessionStep`, trocando o bloco do tier e o retorno:

```js
  if (route.tier !== route.ceiling) {
    const id = state.ids[route.tier];
    if (id && id !== model) rw.model = id;
    if (!id) rw.idPending = route.tier; // D21: sem ID verificado, só esforço; o adaptador sonda
  }
  if (route.effort && route.effort !== effort) rw.effort = route.effort;
  markSwitch(state, rw, model);
  if (rw.switched && rw.model) rw.idSource = state.idSource[route.tier] ?? "learned";
  return rw.model || rw.effort || rw.switched || rw.idPending ? rw : null;
```

O import de `isTierId` de `routing-ledger.mjs` é puro (essa lib não importa `node:*`); conferir que não cria ciclo (`routing-ledger.mjs` importa só `model-routing.mjs`).

- [ ] **Step 4: rodar e ver passar** — `node --test tests/lib/router-core.test.mjs`; `bash tests/run-unit.sh`; `bash tests/run-integration.sh` (os testes do adaptador ainda não sondam: `idPending` só é lido na T4) → verde.

- [ ] **Step 5: commit**

```bash
git add -- scripts/lib/router-core.mjs tests/lib/router-core.test.mjs
git commit -m "feat(routing): cadeia de candidatos e sonda de ID no core do roteador"
```

---

### Task 4: adaptador — sonda em segundo plano, cache e ledger

**Agent:** backend-specialist · **Tier:** capable · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** integration + e2e (validate)

**Files:**
- Modify: `hooks/router.mjs`
- Test: `tests/integration/test-router-mod.mjs`

**Interfaces:**
- Consumes: T1 (`idsCachePathFrom`, `parseIdsCache`, `serializeIdsCache`), T3 (`nextProbe`, `onProbeResult`, `classifyProbe`, `idPending`, `idSource`).
- Produces: comportamento do mod descrito na spec §3.2–§3.4.

- [ ] **Step 1: testes vermelhos** — acrescentar a `tests/integration/test-router-mod.mjs`. O helper `load` já aceita `complete` e registra `log.completes` e `log.writes`. Acrescentar um helper local `settle` para esperar a sonda em segundo plano:

```js
const settle = () => new Promise((r) => setImmediate(r));
const ledgerLines = (H) => H.log.writes.filter((w) => w.path.endsWith(".jsonl")).at(-1)?.text.trim().split("\n").map((l) => JSON.parse(l)) ?? [];
const YAML_LEDGER = "models:\n  enabled: true\n  ledger: true\n";

test("D21 v1.2: fase E sem ID → 1a etapa só esforço e dispara 1 sonda; a seguinte troca para o ID sondado", async () => {
  const H = await load({ root: mkRepo(YAML_LEDGER) });
  const first = await H.turn();
  assert.equal(first.model, OPUS);
  const probes = H.log.completes.filter((r) => r.prompt === "ok");
  assert.equal(probes.length, 1);
  assert.equal(probes[0].model, SONNET);
  assert.equal(probes[0].maxTokens, 1);
  await settle();
  const second = await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 });
  assert.equal(second.model, SONNET);
  assert.equal(H.log.completes.filter((r) => r.prompt === "ok").length, 1, "nenhuma sonda nova depois do ok");
});

test("D21 v1.2: passos com a sonda em voo não disparam outra", async () => {
  let release;
  const H = await load({ root: mkRepo(), complete: () => new Promise((r) => { release = () => r({ isAnswered: true, text: "ok" }); }) });
  await H.turn();
  await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 });
  await H.step({ turnId: "t1", index: 2, model: OPUS, effort: "xhigh", messageCount: 3 });
  assert.equal(H.log.completes.length, 1);
  release();
  await settle();
  assert.equal((await H.step({ turnId: "t1", index: 3, model: OPUS, effort: "xhigh", messageCount: 4 })).model, SONNET);
});

test("D21 v1.2: candidato rejeitado → testa o próximo; models.ids vem antes da tabela", async () => {
  const yaml = "models:\n  enabled: true\n  ids:\n    standard: claude-sonnet-9\n";
  const H = await load({ root: mkRepo(yaml), complete: (req) => (req.model === "claude-sonnet-9" ? { isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 } : { isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 }); // dispara a 2a sonda
  await settle();
  const third = await H.step({ turnId: "t1", index: 2, model: OPUS, effort: "xhigh", messageCount: 3 });
  assert.deepEqual(H.log.completes.map((r) => r.model), ["claude-sonnet-9", SONNET]);
  assert.equal(third.model, SONNET);
});

test("D21 v1.2: a sonda que lança conta como rejected e nunca quebra o passo", async () => {
  const H = await load({ root: mkRepo(), complete: () => { throw new Error("modelo bloqueado"); } });
  const first = await H.turn();
  assert.equal(first.model, OPUS);
  await settle();
  const second = await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 });
  assert.equal(second.model, OPUS, "sem candidato verificado: segue no teto");
});

test("D21 v1.2: ledger registra probe, idPending e idSource; texto da resposta nunca entra", async () => {
  const H = await load({ root: mkRepo(YAML_LEDGER), complete: () => ({ isAnswered: true, text: "SEGREDO" }) });
  await H.turn();
  await settle();
  await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 });
  await H.call("turn.complete", { turnId: "t1" }, async () => ({ usage: { model: SONNET, input_tokens: 1, output_tokens: 1 } }));
  const lines = ledgerLines(H);
  const probe = lines.find((l) => l.scope === "probe");
  assert.equal(probe.tier, "standard");
  assert.equal(probe.model, SONNET);
  assert.equal(probe.probe, "ok");
  const sess = lines.find((l) => l.scope === "session");
  assert.equal(sess.idPending, "standard");
  assert.equal(sess.switched, true);
  assert.equal(sess.idSource, "probe");
  assert.equal(JSON.stringify(lines).includes("SEGREDO"), false);
});

test("D21 v1.2: cache gravado depois da sonda ok e relido como candidato na sessão seguinte, sempre re-sondado", async () => {
  const root = mkRepo();
  const H = await load({ root, complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  const w = H.log.writes.find((x) => x.path === "/home/t/.local/share/devflow-model-routing/ids.json");
  assert.ok(w, "cache gravado");
  assert.deepEqual(JSON.parse(w.text), { version: 1, ids: { capable: OPUS, standard: SONNET } });
});
```

O último teste também deve cobrir a releitura. Para isso, estender o `$.fs.read`/`stat` falsos do `load` com um mapa opcional `files` (`{ [absPath]: text }`) consultado antes do disco, e escrever o caso:

```js
test("D21 v1.2: cache existente é candidato, mas passa pela sonda antes de usar", async () => {
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  const H = await load({ root: mkRepo(), files: { "/home/t/.local/share/devflow-model-routing/ids.json": cache }, complete: () => ({ isAnswered: true, text: "ok" }) });
  const first = await H.turn();
  assert.equal(first.model, OPUS, "cache não é usado sem sonda");
  assert.equal(H.log.completes[0].model, "claude-sonnet-9");
  await settle();
  assert.equal((await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 })).model, "claude-sonnet-9");
});

test("D21 v1.2: cache link simbólico ou maior que 4 KiB é ignorado", async () => {
  const p = "/home/t/.local/share/devflow-model-routing/ids.json";
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  for (const st of [{ kind: "file", size: 50, mtimeMs: 0, isLink: true, realPath: p }, { kind: "file", size: 5000, mtimeMs: 0, isLink: false, realPath: p }]) {
    const H = await load({ root: mkRepo(), files: { [p]: cache }, statOverride: (a) => (a === p ? st : null) });
    await H.turn();
    assert.equal(H.log.completes[0]?.model, SONNET, "o cache inválido é pulado: a tabela vira o 1o candidato");
  }
});
```

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/integration/test-router-mod.mjs` → FAIL nos testes novos.

- [ ] **Step 3: implementar** em `hooks/router.mjs`:

1. Import: `import { buildEntry, ledgerDirFrom, idsCachePathFrom, parseIdsCache, serializeIdsCache } from "../scripts/lib/routing-ledger.mjs";`.
2. Estado `S`: `idsCache: {}`, `idsCachePath: null`, `idsCacheText: ""`, `turnIdPending: null`, `pendingIdSource: null`.
3. Constante `const MAX_IDS_CACHE = 4096;`.
4. Leitor de arquivo do usuário (fora do repositório), declarado no topo junto de `safeStat`:

```js
// Cache de IDs fica no diretório de dados do usuário, fora da raiz: sem link, arquivo regular, até 4 KiB.
async function readUserFile($, abs) {
  try {
    const st = await $.fs.stat(abs, { resolve: true });
    if (!st || st.isLink || st.kind !== "file" || st.size > MAX_IDS_CACHE) return null;
    return await $.fs.read(abs);
  } catch {
    return null;
  }
}
```

5. Em `ensure`, ler `HOME`/`XDG_DATA_HOME` sempre que `S.config.enabled` (hoje só quando `ledger`), montar `S.ledgerPath` só com `ledger` como hoje, e:

```js
      if (home) {
        S.idsCachePath = idsCachePathFrom({ xdgDataHome: xdg, home });
        const txt = await readUserFile($, S.idsCachePath);
        S.idsCache = txt ? parseIdsCache(txt) : {};
        S.idsCacheText = txt ?? "";
      }
```

6. Sonda e cache, declarados no topo (o engine só segue `$` até funções do arquivo):

```js
// D21 v1.2 (spec 2026-10-10-routing-session-tier-ids §3.2): sem await no passo; a troca vem no passo seguinte.
function startProbe($, tier) {
  const p = core.nextProbe(S.core, tier, { cache: S.idsCache, config: S.config, table: S.table });
  if (p) runProbe($, p).catch(() => {});
}

async function runProbe($, { tier, id }) {
  let outcome;
  try { outcome = core.classifyProbe(await $.model.complete({ model: id, prompt: "ok", maxTokens: 1, timeoutMs: 15000 })); }
  catch { outcome = "rejected"; } // o engine recusou enviar (modelo bloqueado): não melhora sozinho
  core.onProbeResult(S.core, tier, id, outcome);
  ledger({ scope: "probe", tier, model: id, probe: outcome });
  if (outcome === "ok") await saveIdsCache($);
}

async function saveIdsCache($) {
  if (!S.idsCachePath) return;
  const text = serializeIdsCache({ ...S.idsCache, ...S.core.ids });
  if (text === S.idsCacheText) return;
  try { await $.fs.write(S.idsCachePath, text); S.idsCacheText = text; S.idsCache = parseIdsCache(text); } catch { /* cache é otimização */ }
}
```

7. Em `routerTurnStep`, no ramo da sessão, depois de `if (patch?.switched) S.pendingSwitch = true;`:

```js
          if (patch?.idPending) { S.turnIdPending = patch.idPending; startProbe($, patch.idPending); }
          if (patch?.switched && patch.idSource) S.pendingIdSource = patch.idSource;
```

8. Em `onAgentSpawn`, depois de `core.onSpawned(...)`: `await saveIdsCache($);` (o ID resolvido pelo engine também alimenta o cache).
9. Em `onTurnComplete`, na linha da sessão: acrescentar `idPending: e.agentId ? undefined : S.turnIdPending ?? undefined` e `idSource: switched ? S.pendingIdSource ?? undefined : undefined`; depois, `if (!e.agentId) { S.turnIdPending = null; if (switched) S.pendingIdSource = null; }`.
10. `$.ui.status` e `pubLoop` não mudam.

Ajuste de testes antigos: rodar `node --test tests/integration/test-router-mod.mjs` inteiro. Teste existente que conta `log.completes` (ex.: "midRun ligado: 1 consulta a model.complete…") passa a contar só o que não é sonda: `H.log.completes.filter((r) => r.prompt !== "ok")`. Teste que fixa contagem de trocas e agora vê uma troca a mais por causa da sonda: fazer o `complete` desse teste devolver `{ isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 }`, preservando o que ele prova. Nenhuma asserção removida ou afrouxada; registrar cada ajuste no relatório da task.

- [ ] **Step 4: rodar e ver passar** — `bash tests/run-integration.sh`, `bash tests/run-unit.sh`, `node --test tests/e2e/router-monitor-validate.e2e.test.mjs` (o `claude plugin validate .` precisa seguir passando) → verde.

- [ ] **Step 5: commit**

```bash
git add -- hooks/router.mjs tests/integration/test-router-mod.mjs
git commit -m "fix(routing): sessão sonda o ID do tier antes da primeira troca"
```

---

### Task 5: relatório — sondas e ID pendente

**Agent:** backend-specialist · **Tier:** standard · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit + e2e

**Files:**
- Modify: `scripts/lib/routing-report.mjs`
- Test: `tests/lib/routing-ledger.test.mjs`, `tests/e2e/test-model-route-cli.mjs`

**Interfaces:**
- Consumes: linhas `probe` e campo `idPending` (T1/T4).
- Produces: `aggregate(entries).probes: Map<tier, { ok, rejected, error }>`, `aggregate(entries).idPending: Map<tier, number>`; `renderMarkdown` com a seção `## Sondas de ID`.

- [ ] **Step 1: testes vermelhos.** Em `tests/lib/routing-ledger.test.mjs`:

```js
test("aggregate/render: sondas por tier e resultado; turnos com ID pendente; linha probe não entra em sessão", () => {
  const agg = aggregate([
    { scope: "probe", tier: "standard", model: "claude-sonnet-9", probe: "rejected" },
    { scope: "probe", tier: "standard", model: "claude-sonnet-5-5", probe: "ok" },
    { scope: "session", phase: "E", model: "claude-opus-5-5", idPending: "standard", usage: { input_tokens: 1, output_tokens: 1 } },
    { scope: "session", phase: "E", model: "claude-sonnet-5-5", switched: true, idSource: "probe", usage: { input_tokens: 1, output_tokens: 1 } },
  ]);
  assert.deepEqual(agg.probes.get("standard"), { ok: 1, rejected: 1, error: 0 });
  assert.equal(agg.idPending.get("standard"), 1);
  assert.equal([...agg.session.get("E").keys()].length, 2);
  const md = renderMarkdown(agg);
  assert.match(md, /## Sondas de ID/);
  assert.match(md, /\| standard \| 1 \| 1 \| 0 \|/);
  assert.match(md, /Turnos com ID pendente: standard×1/);
  assert.match(renderMarkdown(aggregate([])), /Turnos com ID pendente: —/);
});
```

Em `tests/e2e/test-model-route-cli.mjs`, seguindo o padrão `fixture()`/`run()` do arquivo: gravar no diretório de ledger da fixture um `.jsonl` com uma linha `probe` (`ok`), uma `probe` (`rejected`) e uma `session` com `idPending`, rodar `run(["report"], f)` e conferir `## Sondas de ID`, a linha `| standard | 1 | 1 | 0 |` e exit 0.

- [ ] **Step 2: rodar e ver falhar** — `node --test tests/lib/routing-ledger.test.mjs tests/e2e/test-model-route-cli.mjs` → FAIL.

- [ ] **Step 3: implementar** em `routing-report.mjs`. Em `aggregate`, inicializar `probes: new Map(), idPending: new Map()` e, no início do laço (antes do tratamento de `escalation`):

```js
    if (e?.scope === "probe") {
      if (typeof e.tier === "string" && ["ok", "rejected", "error"].includes(e.probe)) {
        if (!agg.probes.has(e.tier)) agg.probes.set(e.tier, { ok: 0, rejected: 0, error: 0 });
        agg.probes.get(e.tier)[e.probe] += 1;
      }
      continue;
    }
    if (e?.scope === "session" && typeof e.idPending === "string") agg.idPending.set(e.idPending, (agg.idPending.get(e.idPending) ?? 0) + 1);
```

Em `renderMarkdown`, depois da linha "Trocas de fase da sessão":

```js
  lines.push("", "## Sondas de ID", "", "| Tier | ok | rejected | error |", "|---|---|---|---|");
  for (const [t, c] of agg.probes ?? new Map()) lines.push(`| ${t} | ${c.ok} | ${c.rejected} | ${c.error} |`);
  lines.push("", `Turnos com ID pendente: ${[...(agg.idPending ?? new Map())].map(([t, n]) => `${t}×${n}`).join(", ") || "—"}`);
```

`beforeAfter` já ignora linha sem `usage`; conferir que a linha `probe` (sem `usage`) não muda o corte de forma indevida. Se mudar, filtrar `scope === "probe"` no cálculo do corte e cobrir com teste.

- [ ] **Step 4: rodar e ver passar** — `bash tests/run-unit.sh` e `bash tests/run-e2e.sh` → verde.

- [ ] **Step 5: commit**

```bash
git add -- scripts/lib/routing-report.mjs tests/lib/routing-ledger.test.mjs tests/e2e/test-model-route-cli.mjs
git commit -m "feat(routing): relatório mostra sondas de ID e turnos com ID pendente"
```

---

### Task 6: ADR-017 v1.2.0, CHANGELOG e achados

**Agent:** documentation-writer · **Tier:** standard · **Standards:** std-commit-hygiene · **Tests:** lint (adr-audit no gate da V)

**Files:**
- Rename: `.context/engineering/adrs/017-model-routing-v1.1.0.md` → `017-model-routing-v1.2.0.md`
- Modify: `.context/engineering/adrs/README.md`, `CHANGELOG.md`, `docs/superpowers/2026-10-09-model-routing-lab-findings.md`

- [ ] **Step 1:** `git mv` da ADR; `version: 1.2.0`; `summary` ganha ao fim ` (v1.2.0) Sem ID aprendido, a sessão sonda um candidato (cache, models.ids, tabela) antes da primeira troca.`
- [ ] **Step 2:** na seção **Decisão**, abaixo da linha da sonda R-3, um item novo:
  `- D21 (v1.2.0): o ID completo do tier vem do engine (agent.spawn/turn.step) ou de uma sonda de 1 token (`$.model.complete`) sobre candidatos — cache por usuário, `models.ids`, tabela padrão em routes.json. Nenhum candidato chega ao `turn.step` sem sonda ok na sessão. Custo: uma chamada por tier por sessão, só quando falta ID. Origem: campanha 2026-10-10-D, sessão em opus na fase E inteira.`
- [ ] **Step 3:** guardrail da linha "SEMPRE alias na ferramenta Agent…" vira `…; sem ID verificado (aprendido do engine ou sonda ok na sessão), só esforço.` e um guardrail novo: `- NUNCA mandar ao turn.step um ID só porque está no cache, em models.ids ou na tabela: sempre sonda antes.`
- [ ] **Step 4:** `README.md` das ADRs: linha 017 com `v1.2.0` e o link novo.
- [ ] **Step 5:** `CHANGELOG.md`, em `## [Unreleased]` → `### Corrigido` (criar a subseção se faltar): entrada sobre a sessão que não trocava de tier sem subagente, a sonda, o cache em `~/.local/share/devflow-model-routing/ids.json`, `models.ids`, o custo e as chaves novas do ledger e do relatório.
- [ ] **Step 6:** em `docs/superpowers/2026-10-09-model-routing-lab-findings.md`, seção nova "Campanha 2026-10-10 (v3.8.1)": D-stress (`INV-PHASE-SYNC` HELD 0/3 → H1 validada; `INV-SESS` MISS 27/130 por falta de ID — causa e correção deste plano), B-routed (ledger com 3 linhas, sem subagentes; investigação em aberto), C-ceiling (incompleto por `max-resumes`, sem `prevc.json`). Sem caminhos locais.
- [ ] **Step 7:** `node scripts/adr-audit.mjs .context/engineering/adrs/017-model-routing-v1.2.0.md --enforce-gate` → PASS; `bash tests/run-lint.sh` → verde.
- [ ] **Step 8: commit**

```bash
git add -- .context/engineering/adrs/017-model-routing-v1.1.0.md .context/engineering/adrs/017-model-routing-v1.2.0.md .context/engineering/adrs/README.md CHANGELOG.md docs/superpowers/2026-10-09-model-routing-lab-findings.md
git commit -m "docs(adr): ADR-017 v1.2.0 — sonda do ID do tier antes da troca da sessão"
```

---

### Task 7: laboratório — allowlist e causa no INV-SESS

**Agent:** backend-specialist · **Tier:** standard · **Standards:** — (repo irmão) · **Tests:** unit do laboratório

**Repo:** `devflow-routing-lab` (irmão do devflow, sem remoto). Não tocar em `results/2026-10-10-*` (não versionados, do operador).

**Files:**
- Modify: `lib/ledger.mjs`, `lib/invariants.mjs`
- Test: `tests/unit/ledger.test.mjs`, `tests/unit/invariants.test.mjs`

- [ ] **Step 1: testes vermelhos.** Em `tests/unit/ledger.test.mjs`: `normalize({ scope: "probe", tier: "standard", model: "claude-sonnet-5-5", probe: "ok" })` sem violações; `normalize({ scope: "session", idPending: "standard", idSource: "probe" })` sem violações; `probe: "talvez"` gera `valor-invalido:probe`. Em `tests/unit/invariants.test.mjs`, usando `base()`/`clone()`:

```js
test("INV-SESS: MISS com ID pendente no ledger diz a causa e as sondas", () => {
  const m = clone(base());
  m.session[2] = msg("E", "claude-opus-5-5", "medium", "devflow:prevc-execution");
  m.ledger.entries.push(
    { scope: "session", phase: "E", idPending: "standard" },
    { scope: "probe", tier: "standard", model: "claude-sonnet-5-5", probe: "error" },
  );
  const r = v(m, "INV-SESS");
  assert.equal(r.verdict, "MISS");
  assert.match(r.evidence, /causa: 1 turnos com ID pendente \(standard×1\); sondas: standard:error×1/);
});

test("INV-SESS: MISS sem nada de ID no ledger não inventa causa", () => {
  const m = clone(base());
  m.session[2] = msg("E", "claude-opus-5-5", "medium", "devflow:prevc-execution");
  assert.doesNotMatch(v(m, "INV-SESS").evidence, /causa:/);
});
```

- [ ] **Step 2: rodar e ver falhar** — `bash tests/run-unit.sh` no laboratório → FAIL.
- [ ] **Step 3: implementar.** `lib/ledger.mjs`: `KEYS` com `idPending`, `idSource`, `probe`; `ENUM.scope` com `"probe"`; `ENUM.idPending = TIERS`, `ENUM.idSource = ["learned", "probe"]`, `ENUM.probe = ["ok", "rejected", "error"]`. `lib/invariants.mjs`, em `sess`, antes do `return`:

```js
  const pend = m.ledger.entries.filter((e) => e.scope === "session" && e.idPending);
  const probes = m.ledger.entries.filter((e) => e.scope === "probe");
  const cause = bad.length && (pend.length || probes.length)
    ? `; causa: ${pend.length} turnos com ID pendente (${tally(pend.map((e) => e.idPending)) || "—"}); sondas: ${tally(probes.map((e) => `${e.tier}:${e.probe}`)) || "nenhuma"}`
    : "";
  return r("INV-SESS", bad.length ? "MISS" : "HELD", ev + cause);
```

- [ ] **Step 4: rodar e ver passar** — `bash tests/run-unit.sh` no laboratório → verde.
- [ ] **Step 5: commit no repo do laboratório**

```bash
git -C ../devflow-routing-lab add -- lib/ledger.mjs lib/invariants.mjs tests/unit/ledger.test.mjs tests/unit/invariants.test.mjs
git -C ../devflow-routing-lab commit -m "feat(lab): ledger com sonda de ID e causa do INV-SESS"
```
