# ID verificado do tier antes da primeira troca da sessão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** routing-session-tier-ids | **Scale:** LARGE | **Phase:** R→E | **Revisão R:** architect REVISE + security-auditor REPROVADO, achados incorporados (rev. 2)

**Goal:** a sessão troca para o tier da fase sem depender de um subagente, usando no `turn.step` só IDs verificados na sessão.

**Architecture:** o core puro (`router-core.mjs`) ganha a cadeia de candidatos, a classificação da sonda e a máquina de estado das sondas; `isTierId` mora em `model-routing.mjs`. O adaptador (`hooks/router.mjs`) agenda a sonda com `$.clock.after(0, …)`, mantém o cache persistente com contenção por `realPath` e proveniência restrita, e grava as linhas novas do ledger. ADR, ledger, config, relatório, docs e laboratório acompanham.

**Tech Stack:** Node ≥ 22, ESM `.mjs`, `node:test`; módulo de function hooks do Claude Code (mod); libs puras sem `node:*`.

**Agents:** architect (T1), backend-specialist (T2–T7, T9), documentation-writer (T8), code-reviewer (revisões).

**Spec:** `docs/superpowers/specs/2026-10-10-routing-session-tier-ids-design.md`

requiredSignals: [unit, integration, e2e, lint, standards]

## Global Constraints

- pt-BR em comentários, mensagens, docs e commits; termos técnicos mantidos.
- TDD obrigatório: teste vermelho observado (pelo motivo certo) antes do código.
- Libs em `scripts/lib/` continuam puras: nenhum `import` de `node:*` (há teste de propriedade).
- Nenhum ID chega ao `turn.step` sem estar em `state.ids` (aprendido do engine ou sonda `ok` nesta sessão).
- Filtro de ID em todo lugar: `isTierId(id, tier)` de `scripts/lib/model-routing.mjs`.
- Cache só com proveniência confiável: ID da tabela do plugin com sonda ok, ou ID resolvido pelo engine num despacho que o mod roteou. Nunca `models.ids`, despacho não roteado ou `turn.step`.
- Ledger: só chaves da allowlist e valores por enum ou regex SAFE; nunca o texto da resposta da sonda.
- Commits só por caminho explícito (`git add -- <arquivos>`). Nunca incluir: `.context/.devflow.yaml`, `.context/plans/model-routing.md`, `.context/workflow/.checkpoint/*`, `.gitignore`, `docs/jev-*.md`, `docs/jev_in_loop_engineering.md`, `docs/screenshots/`, `docs/test-writer.md`, `tsconfig.json`, `docs/superpowers/specs/2026-10-08-session-start-context-budget-design.md`.
- Subagentes: proibido `git push`, `gh`, abrir PR, mergear ou mudar de branch. Só commit local na branch `fix/routing-session-tier-ids` (e, na T9, no repo do laboratório).
- Repo público: sem caminhos locais nem nomes de projeto privado em código, docs ou commits.
- Mensagens de commit em Conventional Commits, terminando com:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XMoVmRxyyDzLtpbWLSmKTg
  ```
- Testes: `bash tests/run-unit.sh`, `bash tests/run-integration.sh`, `bash tests/run-e2e.sh`, `bash tests/run-lint.sh`.

## Review Focus

1. **Sonda resolvida depois que o ID já foi aprendido do engine:** o aprendido vence. T5.
2. **Várias necessidades do mesmo tier antes da sonda resolver:** uma sonda só em voo. T5 e T6.
3. **Cache como vetor:** `ids.json` link, diretório link, maior que 4 KiB, ou ID de `models.ids`/despacho não roteado → nunca lido nem gravado. T6.
4. **Testes antigos do adaptador que contam `model.complete`:** filtrar por `prompt !== "ok"`, sem afrouxar asserção. T6.
5. **Linhas `probe` sem `usage`:** não quebram relatório, `beforeAfter` nem o `INV-LEDGER` do laboratório. T7 e T9.

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| (scratchpad) mod mínimo | sonda R-11 no engine real | T0 |
| ADR-017 → v1.2.0, README das ADRs, links | decisão e guardrails antes do código | T1 |
| `scripts/lib/model-routing.mjs` | `isTierId` | T2 |
| `scripts/lib/routing-ledger.mjs` | allowlist/enums; caminho, parse e serialização do cache | T3 |
| `scripts/lib/models-config.mjs`, `assets/model-routing/routes.json` | `models.ids`; `ids` candidatos | T4 |
| `scripts/lib/router-core.mjs` | candidatos, classificação, sondas, `idPending`/`idSource`, `learnId` | T5 |
| `hooks/router.mjs` | sonda agendada, cache contido, ledger | T6 |
| `scripts/lib/routing-report.mjs` | seção de sondas e ID pendente | T7 |
| CHANGELOG, `docs/model-routing.md`, `skills/config/SKILL.md`, achados | documentação | T8 |
| `devflow-routing-lab`: `lib/ledger.mjs`, `lib/invariants.mjs` | allowlist e causa do `INV-SESS` | T9 |

---

### Task 0: sonda R-11 no engine real (controlador, sem commit no repo)

**Agent:** controlador da sessão · **Tier:** standard · **Standards:** — · **Tests:** sonda manual

Feita pelo controlador antes da T1, com custo de uma sessão `claude -p` curta. Num diretório do scratchpad, um plugin mínimo com `hooks/hooks.json` → `modules: ["./probe.mjs"]` e `probe.mjs` que:

- no primeiro `turn.step` da sessão principal, agenda `$.clock.after(0, …)` com três chamadas `$.model.complete({ model, prompt: "ok", maxTokens: 1, effort: "low", timeoutMs: 15000 })` para `claude-sonnet-5-5`, `claude-sonnet-0-0` (inexistente) e `claude-haiku-5-5`, e grava os resultados (`isAnswered`, `reason`, `error`, `status`) num JSON do scratchpad;
- a partir do passo seguinte à resposta ok, reescreve `model` do `turn.step` para `claude-haiku-5-5` e registra o `usage.model`/resultado do `turn.complete`.

Rodar `claude -p --plugin-dir <dir> "responda só: ok, depois rode 'echo a' e 'echo b' com a ferramenta Bash"` com `--model opus`. Registrar no ledger do SDD: (a) o `reason/error/status` do ID inexistente; (b) os IDs válidos respondem; (c) a sonda agendada pelo relógio resolve; (d) o `turn.step` aceita o ID verificado. **Ruling esperado:** se (a) vier como `invalid_request`/400 (e não `model_not_found`/404), a T5 acrescenta esse par a `rejected` **só se** a mensagem de erro do engine for exclusiva de modelo inexistente; senão mantém `error` (seguro: no pior caso, 3 sondas desperdiçadas por tier). Se (c) ou (d) falharem, parar e escalar ao operador.

---

### Task 1: ADR-017 v1.2.0 antes do código

**Agent:** architect · **Tier:** standard · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** lint (`adr-audit`)

**Files:**
- Rename: `.context/engineering/adrs/017-model-routing-v1.1.0.md` → `017-model-routing-v1.2.0.md`
- Modify: `.context/engineering/adrs/README.md`, `README.md`, `docs/model-routing.md` (só o link), `docs/superpowers/specs/2026-10-09-router-monitor-toolbar-design.md` (só o link), `.context/plans/routing-session-tier-ids.md` (`sources.adrs`)

- [ ] **Step 1: verificação antes** — `git grep -n "017-model-routing-v1.1.0"` lista os links (esperado: os arquivos acima, mais o plano e a spec antigos do workflow H1/D5, que **não** mudam por serem histórico). `node scripts/adr-audit.mjs .context/engineering/adrs/017-model-routing-v1.1.0.md --enforce-gate` → PASS (linha de base).
- [ ] **Step 2:** `git mv` da ADR; `version: 1.2.0`; `summary` ganha ao fim ` (v1.2.0) Sem ID aprendido, a sessão sonda um candidato (cache, models.ids, tabela) antes da primeira troca.`
- [ ] **Step 3:** em **Decisão**, abaixo da linha da sonda R-3:
  `- D21 (v1.2.0): o ID completo do tier vem do engine (agent.spawn/turn.step) ou de uma sonda de 1 token (`$.model.complete`, agendada no relógio) sobre candidatos — cache por usuário, `models.ids`, `ids` da tabela. Nenhum candidato chega ao `turn.step` sem sonda ok na sessão. O cache só guarda ID da tabela com sonda ok ou ID que o engine resolveu num despacho roteado. Custo: uma chamada de 1 token por candidato e por tier na sessão, só quando falta ID. Origem: campanha 2026-10-10-D, sessão em opus na fase E inteira.`
- [ ] **Step 4: guardrails.** O guardrail "…NUNCA ID fixo de modelo na tabela." passa a dizer "…a tabela pode trazer IDs **só como candidatos de sonda**." O "SEMPRE alias na ferramenta Agent…" termina em "…; sem ID verificado (aprendido do engine ou sonda ok na sessão), só esforço." Novos:
  - `- NUNCA mandar ao turn.step um ID só porque está no cache, em models.ids ou na tabela: sempre sonda ok na sessão antes.`
  - `- NUNCA gravar no cache por usuário ID vindo de models.ids, de despacho não roteado ou do turn.step.`
  - `- SEMPRE contenção por realPath (arquivo e diretório) antes de ler e antes de gravar o cache (ADR-014).`
- [ ] **Step 5:** em **Consequências**, riscos aceitos: `models.ids` escolhe a geração dentro do tier; sonda ok não garante o `turn.step` (medido na R-11 e em campo); `env` do settings do projeto pode definir `DEVFLOW_MODEL_ROUTING`/`XDG_DATA_HOME` (anterior, backlog). Em **Enforcement**, os testes da T6 ("cache não é usado sem sonda", "models.ids não vai ao cache", "link não é gravado"). Em **Histórico**, a linha da v1.2.0.
- [ ] **Step 6:** atualizar os links listados no Step 1 (exceto os históricos) e a linha 017 do `README.md` das ADRs (`v1.2.0`, link novo).
- [ ] **Step 7: verificação depois** — `node scripts/adr-audit.mjs .context/engineering/adrs/017-model-routing-v1.2.0.md --enforce-gate` → PASS; `git grep -n "017-model-routing-v1.1.0"` só nos históricos; `bash tests/run-lint.sh` → verde.
- [ ] **Step 8: commit**

```bash
git add -- .context/engineering/adrs/017-model-routing-v1.1.0.md .context/engineering/adrs/017-model-routing-v1.2.0.md .context/engineering/adrs/README.md README.md docs/model-routing.md docs/superpowers/specs/2026-10-09-router-monitor-toolbar-design.md .context/plans/routing-session-tier-ids.md
git commit -m "docs(adr): ADR-017 v1.2.0 — ID do tier por sonda antes da troca da sessão"
```

---

### Task 2: `isTierId` no domínio

**Agent:** backend-specialist · **Tier:** cheap · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit

**Files:**
- Modify: `scripts/lib/model-routing.mjs`
- Test: `tests/lib/model-routing.test.mjs`

**Interfaces:**
- Produces: `isTierId(id, tier) → boolean` exportado de `model-routing.mjs`.

- [ ] **Step 1: teste vermelho** — acrescentar a `tests/lib/model-routing.test.mjs` (importando `isTierId` junto dos imports existentes de `../../scripts/lib/model-routing.mjs`):

```js
test("isTierId: regex, tamanho, uma família com fronteira e o tier do próprio ID", () => {
  assert.equal(isTierId("claude-sonnet-5-5", "standard"), true);
  assert.equal(isTierId("claude-haiku-4-5-20251001", "cheap"), true);
  assert.equal(isTierId("claude-3-5-sonnet-20241022", "standard"), true);
  assert.equal(isTierId("claude-fable-5-1", "top"), true);
  assert.equal(isTierId("claude-opus-5-5", "cheap"), false);
  assert.equal(isTierId("sonnet", "standard"), false);
  assert.equal(isTierId("claude-opus-4-haiku", "cheap"), false, "duas famílias");
  assert.equal(isTierId("claude-haikuopus", "cheap"), false, "duas famílias coladas");
  assert.equal(isTierId("claude-opusx", "capable"), false, "sem fronteira");
  assert.equal(isTierId("claude-sonnet-5-5 ; rm", "standard"), false);
  assert.equal(isTierId(`claude-sonnet-${"9".repeat(60)}`, "standard"), false);
  assert.equal(isTierId(null, "standard"), false);
});
```

- [ ] **Step 2:** `node --test tests/lib/model-routing.test.mjs` → FAIL (`isTierId` não exportado).
- [ ] **Step 3: implementar** em `model-routing.mjs`, depois de `tierOf`:

```js
// ID completo de modelo do tier (spec 2026-10-10-routing-session-tier-ids §3.1): forma, tamanho, exatamente uma
// família com fronteira de hífen e o tier que o próprio ID declara.
const ID_RE = /^claude-[a-z0-9-]+$/;
export function isTierId(id, tier) {
  if (typeof id !== "string" || id.length > 64 || !ID_RE.test(id)) return false;
  const fams = id.match(/haiku|sonnet|opus|fable/g) ?? [];
  if (fams.length !== 1 || !new RegExp(`-${fams[0]}(-|$)`).test(id)) return false;
  return tierOf(id) === tier;
}
```

- [ ] **Step 4:** `bash tests/run-unit.sh` → verde.
- [ ] **Step 5: commit**

```bash
git add -- scripts/lib/model-routing.mjs tests/lib/model-routing.test.mjs
git commit -m "feat(routing): isTierId valida ID completo de modelo por tier"
```

---

### Task 3: ledger — chaves novas e cache de IDs

**Agent:** backend-specialist · **Tier:** cheap · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit

**Files:**
- Modify: `scripts/lib/routing-ledger.mjs`
- Test: `tests/lib/routing-ledger.test.mjs`

**Interfaces:**
- Consumes: `isTierId` (T2).
- Produces: `LEDGER_KEYS` com `idPending`, `idSource`, `probe`; `buildEntry` aceita `scope: "probe"`, `idPending ∈ TIERS`, `idSource ∈ ["learned","probe"]`, `probe ∈ ["ok","rejected","error"]`; `idsCachePathFrom({ xdgDataHome, home }) → string` (sem `//`); `parseIdsCache(text) → { [tier]: id }`; `serializeIdsCache(ids) → string`.

- [ ] **Step 1: testes vermelhos** — trocar o import da linha 5 de `tests/lib/routing-ledger.test.mjs` por `import { buildEntry, LEDGER_KEYS, projectKey, ledgerDirFrom, idsCachePathFrom, parseIdsCache, serializeIdsCache } from "../../scripts/lib/routing-ledger.mjs";` e acrescentar:

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

test("idsCachePathFrom: por usuário, não por projeto, sem barra dupla", () => {
  assert.equal(idsCachePathFrom({ xdgDataHome: "/x", home: "/h" }), "/x/devflow-model-routing/ids.json");
  assert.equal(idsCachePathFrom({ xdgDataHome: "/x/", home: "/h" }), "/x/devflow-model-routing/ids.json");
  assert.equal(idsCachePathFrom({ xdgDataHome: "rel", home: "/h" }), "/h/.local/share/devflow-model-routing/ids.json");
  assert.equal(idsCachePathFrom({ home: "/h" }), "/h/.local/share/devflow-model-routing/ids.json");
});

test("parseIdsCache: tolerante; só entradas válidas", () => {
  assert.deepEqual(parseIdsCache("{"), {});
  assert.deepEqual(parseIdsCache(JSON.stringify({ version: 2, ids: { standard: "claude-sonnet-5-5" } })), {});
  assert.deepEqual(parseIdsCache(JSON.stringify({ version: 1, ids: [] })), {});
  assert.deepEqual(
    parseIdsCache(JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-5-5", cheap: "claude-opus-5-5", ultra: "claude-x", top: 7, capable: "claude-opus-4-haiku" } })),
    { standard: "claude-sonnet-5-5" },
  );
});

test("serializeIdsCache: ida e volta, filtrando inválidos e o protótipo", () => {
  const txt = serializeIdsCache({ standard: "claude-sonnet-5-5", cheap: "lixo", __proto__: { capable: "claude-opus-5-5" } });
  assert.deepEqual(JSON.parse(txt), { version: 1, ids: { standard: "claude-sonnet-5-5" } });
  assert.deepEqual(parseIdsCache(txt), { standard: "claude-sonnet-5-5" });
});
```

- [ ] **Step 2:** `node --test tests/lib/routing-ledger.test.mjs` → FAIL (exports inexistentes).
- [ ] **Step 3: implementar** em `routing-ledger.mjs`:
  - import: `import { TIERS, EFFORTS, PHASES, isTierId } from "./model-routing.mjs";`
  - `LEDGER_KEYS` ganha `"idPending", "idSource", "probe"` no fim;
  - `ENUM`: `scope: ["session", "subagent", "probe"]`, `idPending: TIERS`, `idSource: ["learned", "probe"]`, `probe: ["ok", "rejected", "error"]`;
  - helpers:

```js
const dataBase = ({ xdgDataHome, home }) =>
  (typeof xdgDataHome === "string" && xdgDataHome.startsWith("/") ? xdgDataHome : `${home}/.local/share`).replace(/\/+$/, "");

export function ledgerDirFrom({ xdgDataHome, home, cwd }) {
  return `${dataBase({ xdgDataHome, home })}/devflow-model-routing/${projectKey(cwd)}`;
}

// Cache de IDs verificados (spec 2026-10-10-routing-session-tier-ids §3.3): por usuário, não por projeto.
// É só fonte de candidato: o mod re-sonda antes de usar.
export function idsCachePathFrom({ xdgDataHome, home }) {
  return `${dataBase({ xdgDataHome, home })}/devflow-model-routing/ids.json`;
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

  O teste existente de `ledgerDirFrom` precisa seguir verde (a remoção da barra final não muda os casos atuais; se mudar, o teste antigo não é afrouxado: registrar no relatório).
- [ ] **Step 4:** `node --test tests/lib/routing-ledger.test.mjs`; `bash tests/run-unit.sh` → verde.
- [ ] **Step 5: commit**

```bash
git add -- scripts/lib/routing-ledger.mjs tests/lib/routing-ledger.test.mjs
git commit -m "feat(routing): ledger com sonda de ID e cache de IDs verificados"
```

---

### Task 4: config — `models.ids` e IDs candidatos da tabela

**Agent:** backend-specialist · **Tier:** cheap · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit

**Files:**
- Modify: `scripts/lib/models-config.mjs`, `assets/model-routing/routes.json`
- Test: `tests/lib/models-config.test.mjs`

**Interfaces:**
- Consumes: `isTierId` (T2).
- Produces: `readModels(src).ids → { [tier]: id }` (padrão `{}`); `routes.json` → `ids: { cheap, standard, capable, top }` (candidatos de sonda, ADR-017 v1.2.0).

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

test("routes.json traz IDs candidatos válidos para os quatro tiers", async () => {
  const { isTierId } = await import("../../scripts/lib/model-routing.mjs");
  const t = JSON.parse(readFileSync(new URL("../../assets/model-routing/routes.json", import.meta.url), "utf8"));
  for (const tier of ["cheap", "standard", "capable", "top"]) assert.ok(isTierId(t.ids?.[tier], tier), tier);
});
```

- [ ] **Step 2:** `node --test tests/lib/models-config.test.mjs` → FAIL.
- [ ] **Step 3: implementar.** `models-config.mjs`: `import { TIERS, PHASES, isTierId } from "./model-routing.mjs";`, `ids: {}` em `defaults()`, e antes do `return out`:

```js
  if (isMap(data.ids)) for (const t of TIERS) if (Object.hasOwn(data.ids, t) && isTierId(clean(data.ids[t]), t)) out.ids[t] = clean(data.ids[t]);
```

`routes.json`, logo depois de `"effortByTier"`:

```json
  "ids": { "cheap": "claude-haiku-5-5", "standard": "claude-sonnet-5-5", "capable": "claude-opus-5-5", "top": "claude-fable-5-1" },
```

Conferir se algum teste valida `routes.json` por lista fechada de chaves; se houver, acrescentar `ids`.
- [ ] **Step 4:** `node --test tests/lib/models-config.test.mjs`; `bash tests/run-unit.sh` → verde.
- [ ] **Step 5: commit**

```bash
git add -- scripts/lib/models-config.mjs assets/model-routing/routes.json tests/lib/models-config.test.mjs
git commit -m "feat(routing): models.ids no .devflow.yaml e IDs candidatos na tabela"
```

---

### Task 5: core — candidatos, sonda e ID pendente

**Agent:** backend-specialist · **Tier:** standard · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit

**Files:**
- Modify: `scripts/lib/router-core.mjs`
- Test: `tests/lib/router-core.test.mjs`

**Interfaces:**
- Consumes: `isTierId` (T2); `config.ids` e `table.ids` (T4); ruling da T0 sobre `classifyProbe`.
- Produces:
  - `createRouterState()` com `probes: {}` e `idSource: {}`;
  - `learnId` usa `isTierId` e marca `state.idSource[t] = "learned"`;
  - `PROBE_MAX_ERRORS = 3`;
  - `idCandidates(tier, { cache, config, table }) → string[]`;
  - `classifyProbe(result) → "ok" | "rejected" | "error"`;
  - `nextProbe(state, tier, ctx) → { tier, id } | null` (marca em voo);
  - `onProbeResult(state, tier, id, outcome)`;
  - `onSessionStep` devolve também `idPending: <tier>` e, na troca efetiva para tier abaixo do teto, `idSource`.

- [ ] **Step 1: testes vermelhos** — acrescentar a `tests/lib/router-core.test.mjs` (o arquivo já define `table`, `config`, `ctx` e `step`):

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

test("classifyProbe: ok, rejected (só modelo inexistente) e error", () => {
  assert.equal(C.classifyProbe({ isAnswered: true, text: "ok" }), "ok");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "empty-reply" }), "ok");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 }), "rejected");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "unknown", status: 404 }), "rejected");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "invalid_request", status: 400 }), "error");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "rate_limit", status: 429 }), "error");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "api-error", error: "overloaded", status: null }), "error");
  assert.equal(C.classifyProbe({ isAnswered: false, reason: "aborted" }), "error");
  assert.equal(C.classifyProbe(undefined), "error");
});

test("nextProbe: uma sonda em voo; rejected passa ao próximo; 3 erros por TIER desistem", () => {
  const s = C.createRouterState();
  const c = { cache: {}, config: { ids: { standard: "claude-sonnet-9" } }, table: { ids: { standard: SONNET } } };
  const p1 = C.nextProbe(s, "standard", c);
  assert.deepEqual(p1, { tier: "standard", id: "claude-sonnet-9" });
  assert.equal(C.nextProbe(s, "standard", c), null, "em voo: nenhuma outra");
  C.onProbeResult(s, "standard", p1.id, "error");
  assert.equal(C.nextProbe(s, "standard", c)?.id, "claude-sonnet-9", "erro transitório: tenta o mesmo");
  C.onProbeResult(s, "standard", "claude-sonnet-9", "rejected");
  assert.equal(C.nextProbe(s, "standard", c)?.id, SONNET);
  C.onProbeResult(s, "standard", SONNET, "error");
  assert.equal(C.nextProbe(s, "standard", c)?.id, SONNET);
  C.onProbeResult(s, "standard", SONNET, "error"); // 3o erro do tier (rejected não zerou)
  assert.equal(C.nextProbe(s, "standard", c), null, "desistiu do tier");
  assert.equal(s.ids.standard, undefined);
});

test("nextProbe: candidatos esgotados → null; tier com ID já conhecido → null", () => {
  assert.equal(C.nextProbe(C.createRouterState(), "standard", {}), null);
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

test("learnId usa isTierId: ID com duas famílias não é aprendido", () => {
  const s = C.createRouterState();
  C.learnId(s, "claude-opus-4-haiku");
  assert.deepEqual(s.ids, {});
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
  assert.equal(step(s, OPUS, "xhigh")?.idSource, undefined, "idSource só na troca efetiva");
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

- [ ] **Step 2:** `node --test tests/lib/router-core.test.mjs` → FAIL.
- [ ] **Step 3: implementar** em `router-core.mjs` (import de `isTierId` junto dos de `./model-routing.mjs`):

```js
export const PROBE_MAX_ERRORS = 3;

export function createRouterState() {
  return { userModel: null, userEffort: null, phase: null, skill: null, sessionTier: null, lastSessionModel: null, ids: {}, idSource: {}, probes: {}, agents: {}, agentTypes: {} };
}

export function learnId(state, modelId) {
  const t = tierOf(modelId);
  if (!t || !isTierId(modelId, t)) return;
  state.ids[t] = modelId;
  state.idSource[t] = "learned";
}

// D21 v1.2 (spec 2026-10-10-routing-session-tier-ids §3.1): candidatos a ID do tier, na ordem cache →
// models.ids → tabela. Nenhum vai ao turn.step sem sonda ok nesta sessão.
export function idCandidates(tier, { cache, config, table } = {}) {
  const out = [];
  for (const id of [cache?.[tier], config?.ids?.[tier], table?.ids?.[tier]]) if (isTierId(id, tier) && !out.includes(id)) out.push(id);
  return out;
}

// Só "modelo inexistente" rejeita o candidato; invalid_request/400 pode ter outra causa e conta como erro.
export function classifyProbe(r) {
  if (!r || typeof r !== "object") return "error";
  if (r.isAnswered === true || r.reason === "empty-reply") return "ok";
  if (r.reason === "api-error" && (r.error === "model_not_found" || r.status === 404)) return "rejected";
  return "error";
}

export function nextProbe(state, tier, ctx) {
  if (state.ids[tier]) return null;
  const p = (state.probes[tier] ??= { tried: [], errors: 0, inFlight: false, gaveUp: false });
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
  if (outcome === "rejected") { p.tried.push(id); return; }
  p.errors += 1; // limite por tier: rejected não zera
  if (p.errors >= PROBE_MAX_ERRORS) p.gaveUp = true;
}
```

Em `onSessionStep`, o bloco do tier e o retorno:

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

Se a T0 registrou um ruling para `classifyProbe`, aplicá-lo aqui com o teste correspondente.
- [ ] **Step 4:** `node --test tests/lib/router-core.test.mjs`; `bash tests/run-unit.sh`; `bash tests/run-integration.sh` → verde.
- [ ] **Step 5: commit**

```bash
git add -- scripts/lib/router-core.mjs tests/lib/router-core.test.mjs
git commit -m "feat(routing): cadeia de candidatos e sonda de ID no core do roteador"
```

---

### Task 6: adaptador — sonda agendada, cache contido e ledger

**Agent:** backend-specialist · **Tier:** capable · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** integration + e2e (validate) · **Revisão:** pesada

**Files:**
- Modify: `hooks/router.mjs`
- Test: `tests/integration/test-router-mod.mjs`

**Interfaces:**
- Consumes: T3 (`idsCachePathFrom`, `parseIdsCache`, `serializeIdsCache`), T5 (`nextProbe`, `onProbeResult`, `classifyProbe`, `idPending`, `idSource`), T2 (`isTierId`, `tierOf`).
- Produces: comportamento da spec §3.2–§3.4.

- [ ] **Step 1: estender o `$` falso e escrever os testes vermelhos.** No helper `load` de `tests/integration/test-router-mod.mjs`:
  - assinatura: `async function load({ root, env = ON, statOverride, complete, stateThrows = false, files = {} } = {})`;
  - em `fs.stat`, depois do `statOverride`: `if (Object.hasOwn(files, a)) return { kind: "file", size: files[a].length, mtimeMs: 0, isLink: false, ...(opt?.resolve ? { realPath: a } : {}) };`
  - em `fs.read`: `return Object.hasOwn(files, abs(p)) ? files[abs(p)] : fs.readFileSync(abs(p), "utf8");`
  - acrescentar ao `$` **só** `clock: { after: (ms, fn) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); } }` (sem `now`/`every`, para não ligar o monitor nos testes existentes).

  Acrescentar, depois da `const YAML_LEDGER` já existente (linha ~174; **não redeclarar**):

```js
const settle = () => new Promise((r) => setTimeout(r, 5));
const ledgerLines = (H) => H.log.writes.filter((w) => w.path.endsWith(".jsonl")).at(-1)?.text.trim().split("\n").map((l) => JSON.parse(l)) ?? [];
const CACHE = "/home/t/.local/share/devflow-model-routing/ids.json";
const cacheWrites = (H) => H.log.writes.filter((w) => w.path === CACHE);
const later = (H, index) => H.step({ turnId: "t1", index, model: OPUS, effort: "xhigh", messageCount: index + 1 });

test("D21 v1.2: fase E sem ID → 1a etapa só esforço e agenda 1 sonda; a seguinte troca para o ID sondado", async () => {
  const H = await load({ root: mkRepo(YAML_LEDGER) });
  const first = await H.turn();
  assert.equal(first.model, OPUS);
  await settle();
  const probes = H.log.completes.filter((r) => r.prompt === "ok");
  assert.equal(probes.length, 1);
  assert.deepEqual({ model: probes[0].model, maxTokens: probes[0].maxTokens, effort: probes[0].effort }, { model: SONNET, maxTokens: 1, effort: "low" });
  assert.equal((await later(H, 1)).model, SONNET);
  assert.equal(H.log.completes.filter((r) => r.prompt === "ok").length, 1, "nenhuma sonda nova depois do ok");
});

test("D21 v1.2: passos com a sonda em voo não disparam outra", async () => {
  let release;
  const H = await load({ root: mkRepo(), complete: () => new Promise((r) => { release = () => r({ isAnswered: true, text: "ok" }); }) });
  await H.turn();
  await settle();
  await later(H, 1);
  await later(H, 2);
  assert.equal(H.log.completes.length, 1);
  release();
  await settle();
  assert.equal((await later(H, 3)).model, SONNET);
});

test("D21 v1.2: candidato rejeitado (404) → testa o próximo; models.ids vem antes da tabela", async () => {
  const yaml = "models:\n  enabled: true\n  ids:\n    standard: claude-sonnet-9\n";
  const H = await load({ root: mkRepo(yaml), complete: (req) => (req.model === "claude-sonnet-9" ? { isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 } : { isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  await later(H, 1); // agenda a 2a sonda
  await settle();
  assert.deepEqual(H.log.completes.map((r) => r.model), ["claude-sonnet-9", SONNET]);
  assert.equal((await later(H, 2)).model, SONNET);
});

test("D21 v1.2: invalid_request/400 é erro transitório: tenta o mesmo candidato de novo", async () => {
  const H = await load({ root: mkRepo(), complete: () => ({ isAnswered: false, reason: "api-error", error: "invalid_request", status: 400 }) });
  await H.turn();
  await settle();
  await later(H, 1);
  await settle();
  assert.deepEqual(H.log.completes.map((r) => r.model), [SONNET, SONNET]);
});

test("D21 v1.2: a sonda que lança conta como rejected e nunca quebra o passo", async () => {
  const H = await load({ root: mkRepo(), complete: () => { throw new Error("modelo bloqueado"); } });
  assert.equal((await H.turn()).model, OPUS);
  await settle();
  assert.equal((await later(H, 1)).model, OPUS, "sem candidato verificado: segue no teto");
  assert.equal(H.log.completes.length, 1, "rejeitado não é re-sondado");
});

test("D21 v1.2: ledger registra probe (gravado na hora), idPending e idSource; texto da resposta nunca entra", async () => {
  const H = await load({ root: mkRepo(YAML_LEDGER), complete: () => ({ isAnswered: true, text: "SEGREDO" }) });
  await H.turn();
  await settle();
  const probe = ledgerLines(H).find((l) => l.scope === "probe");
  assert.ok(probe, "a linha probe vai ao disco sem esperar o turn.complete");
  assert.deepEqual([probe.tier, probe.model, probe.probe], ["standard", SONNET, "ok"]);
  await later(H, 1);
  await H.call("turn.complete", { turnId: "t1" }, async () => ({ usage: { model: SONNET, input_tokens: 1, output_tokens: 1 } }));
  const sess = ledgerLines(H).find((l) => l.scope === "session");
  assert.equal(sess.idPending, "standard");
  assert.equal(sess.switched, true);
  assert.equal(sess.idSource, "probe");
  assert.equal(JSON.stringify(ledgerLines(H)).includes("SEGREDO"), false);
});

test("D21 v1.2: cache recebe só ID da tabela com sonda ok (nunca o teto do turn.step)", async () => {
  const H = await load({ root: mkRepo(), complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.deepEqual(JSON.parse(cacheWrites(H).at(-1).text), { version: 1, ids: { standard: SONNET } });
});

test("D21 v1.2: ID de models.ids com sonda ok é usado na sessão mas nunca vai ao cache", async () => {
  const yaml = "models:\n  enabled: true\n  ids:\n    standard: claude-sonnet-9\n";
  const H = await load({ root: mkRepo(yaml), complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal((await later(H, 1)).model, "claude-sonnet-9");
  assert.equal(cacheWrites(H).some((w) => w.text.includes("claude-sonnet-9")), false);
});

test("D21 v1.2: despacho roteado alimenta o cache; despacho com modelo explícito não", async () => {
  const H = await load({ root: mkRepo() });
  await H.call("session.start", {});
  await H.call("turn.start", { text: "x", turnId: "t1" });
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, "claude-haiku-5-5");
  assert.deepEqual(JSON.parse(cacheWrites(H).at(-1).text).ids, { cheap: "claude-haiku-5-5" });
  const n = cacheWrites(H).length;
  await H.spawn({ subagentType: "general-purpose", parentModel: OPUS, model: "claude-sonnet-9" }, "claude-sonnet-9");
  assert.equal(cacheWrites(H).length, n, "explícito/não roteado não grava");
});

test("D21 v1.2: cache existente é só candidato — passa pela sonda antes de usar; rejeitado sai do cache", async () => {
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  const H = await load({ root: mkRepo(), files: { [CACHE]: cache }, complete: (req) => (req.model === "claude-sonnet-9" ? { isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 } : { isAnswered: true, text: "ok" }) });
  assert.equal((await H.turn()).model, OPUS, "cache não é usado sem sonda");
  await settle();
  assert.equal(H.log.completes[0].model, "claude-sonnet-9");
  assert.equal(JSON.parse(cacheWrites(H).at(-1).text).ids.standard, undefined, "rejeitado saiu do cache");
});

test("D21 v1.2: contenção — arquivo link, maior que 4 KiB ou diretório link → não lê nem grava o cache", async () => {
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  const dir = CACHE.slice(0, CACHE.lastIndexOf("/"));
  const cases = [
    (a) => (a === CACHE ? { kind: "file", size: 50, mtimeMs: 0, isLink: true, realPath: CACHE } : null),
    (a) => (a === CACHE ? { kind: "file", size: 5000, mtimeMs: 0, isLink: false, realPath: CACHE } : null),
    (a) => (a === dir ? { kind: "dir", size: 0, mtimeMs: 0, isLink: false, realPath: "/outro/lugar" } : null),
  ];
  for (const ov of cases) {
    const H = await load({ root: mkRepo(), files: { [CACHE]: cache }, statOverride: ov, complete: () => ({ isAnswered: true, text: "ok" }) });
    await H.turn();
    await settle();
    assert.equal(H.log.completes[0]?.model, SONNET, "o cache recusado é pulado: a tabela é o 1o candidato");
    assert.equal(cacheWrites(H).length, 0, "cache recusado nunca é gravado");
  }
});
```

- [ ] **Step 2:** `node --test tests/integration/test-router-mod.mjs` → FAIL nos testes novos (pelo motivo certo: sem sonda/cache), com o arquivo carregando.
- [ ] **Step 3: implementar** em `hooks/router.mjs`:

1. Imports: `import { buildEntry, ledgerDirFrom, idsCachePathFrom, parseIdsCache, serializeIdsCache } from "../scripts/lib/routing-ledger.mjs";` e `tierOf`, `isTierId` no import de `model-routing.mjs`.
2. Estado `S`: `idsCache: {}`, `cacheable: {}`, `idsCachePath: null`, `idsCacheText: ""`, `turnIdPending: null`, `pendingIdSource: null`. Constante `const MAX_IDS_CACHE = 4096;`.
3. Contenção, no topo junto de `safeStat`:

```js
// Cache de IDs fica no diretório de dados do usuário (ADR-014): diretório e arquivo sem link, realPath igual ao
// caminho, arquivo regular até 4 KiB. Ausente pode ser criado. Qualquer dúvida → false.
async function userFileOk($, abs) {
  try {
    const dir = abs.slice(0, abs.lastIndexOf("/"));
    const d = await $.fs.stat(dir, { resolve: true }).catch(() => null);
    if (d && (d.kind !== "dir" || d.realPath !== dir)) return false;
    const f = await $.fs.stat(abs, { resolve: true }).catch(() => null);
    if (!f) return true;
    return !f.isLink && f.kind === "file" && f.size <= MAX_IDS_CACHE && f.realPath === abs;
  } catch {
    return false;
  }
}
```

4. `ensure`: ler `HOME`/`XDG_DATA_HOME` sempre que `S.config.enabled` (o `S.ledgerPath` continua só com `ledger`), e:

```js
      if (home) {
        const p = idsCachePathFrom({ xdgDataHome: xdg, home });
        if (await userFileOk($, p)) {
          S.idsCachePath = p;
          const txt = await $.fs.read(p).catch(() => null);
          S.idsCache = typeof txt === "string" && txt.length <= MAX_IDS_CACHE ? parseIdsCache(txt) : {};
          S.idsCacheText = typeof txt === "string" ? txt : "";
        } // recusado: cache desligado na sessão (não lê, não grava)
      }
```

5. Sonda e cache, no topo do arquivo (o engine só segue `$` até funções declaradas nele):

```js
// D21 v1.2 (spec 2026-10-10-routing-session-tier-ids §3.2): agendada no relógio (dispatch próprio, fora do passo);
// a troca vem no passo seguinte à resposta.
function startProbe($, tier) {
  const p = core.nextProbe(S.core, tier, { cache: S.idsCache, config: S.config, table: S.table });
  if (!p) return;
  try { $.clock.after(0, () => { void runProbe($, p); }); } catch { core.onProbeResult(S.core, tier, p.id, "error"); }
}

async function runProbe($, { tier, id }) {
  let outcome;
  try { outcome = core.classifyProbe(await $.model.complete({ model: id, prompt: "ok", maxTokens: 1, effort: "low", timeoutMs: 15000 })); }
  catch { outcome = "rejected"; } // o engine recusou enviar (modelo bloqueado): não melhora sozinho
  try {
    core.onProbeResult(S.core, tier, id, outcome);
    if (outcome === "ok" && id === S.table?.ids?.[tier]) S.cacheable[tier] = id;
    if (outcome === "rejected" && S.idsCache[tier] === id) delete S.idsCache[tier];
    ledger({ scope: "probe", tier, model: id, probe: outcome });
    await flushLedger($);
    if (outcome !== "error") await saveIdsCache($);
  } catch { /* sonda nunca afeta a sessão */ }
}

// Proveniência (spec §3.3): só ID da tabela com sonda ok ou resolvido pelo engine num despacho roteado.
async function saveIdsCache($) {
  try {
    if (!S.idsCachePath) return;
    const text = serializeIdsCache({ ...S.idsCache, ...S.cacheable });
    if (text === S.idsCacheText) return;
    if (!(await userFileOk($, S.idsCachePath))) { S.idsCachePath = null; return; } // nunca segue link
    await $.fs.write(S.idsCachePath, text);
    S.idsCacheText = text;
    S.idsCache = parseIdsCache(text);
  } catch { /* cache é otimização */ }
}
```

6. `routerTurnStep`, no ramo da sessão, depois de `if (patch?.switched) S.pendingSwitch = true;`:

```js
          if (patch?.idPending) { S.turnIdPending = patch.idPending; startProbe($, patch.idPending); }
          if (patch?.switched && patch.idSource) S.pendingIdSource = patch.idSource;
```

7. `onAgentSpawn`, depois de `core.onSpawned(...)`: se o mod roteou o despacho (`route?.model`), registrar o ID resolvido como cacheável e gravar:

```js
    const t = tierOf(res.model);
    if (route?.model && route.source !== "explicit" && t && isTierId(res.model, t)) { S.cacheable[t] = res.model; await saveIdsCache($); }
```

(Se `resolveSubagentRoute` devolver rota com `model` num despacho de modelo explícito, a condição `source !== "explicit"` o exclui: só alias escolhido pelo mod conta como "o engine resolveu o tier".)

(`saveIdsCache` nunca lança: não há caminho para o `.catch` do registro despachar de novo.)
8. `onTurnComplete`, na linha da sessão: acrescentar `idPending: e.agentId ? undefined : S.turnIdPending ?? undefined` e `idSource: switched ? S.pendingIdSource ?? undefined : undefined`; depois, `if (!e.agentId) { S.turnIdPending = null; if (switched) S.pendingIdSource = null; }`.

**Ajuste de testes antigos:** rodar `node --test tests/integration/test-router-mod.mjs` inteiro. Teste que conta `log.completes` (ex.: "midRun ligado: 1 consulta a model.complete…") passa a contar só `H.log.completes.filter((r) => r.prompt !== "ok")`. Teste que fixa contagem de trocas e passa a ver uma troca a mais por causa da sonda recebe um `complete` que devolve `{ isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 }`, preservando o que prova. Nenhuma asserção removida ou afrouxada; registrar cada ajuste no relatório.

- [ ] **Step 4:** `bash tests/run-integration.sh`, `bash tests/run-unit.sh`, `node --test tests/e2e/router-monitor-validate.e2e.test.mjs` (o `claude plugin validate .` segue passando) → verde.
- [ ] **Step 5: commit**

```bash
git add -- hooks/router.mjs tests/integration/test-router-mod.mjs
git commit -m "fix(routing): sessão sonda o ID do tier antes da primeira troca"
```

---

### Task 7: relatório — sondas e ID pendente

**Agent:** backend-specialist · **Tier:** standard · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit + e2e

**Files:**
- Modify: `scripts/lib/routing-report.mjs`
- Test: `tests/lib/routing-ledger.test.mjs`, `tests/e2e/test-model-route-cli.mjs`

**Interfaces:**
- Produces: `aggregate(entries).probes: Map<tier, { ok, rejected, error }>`, `aggregate(entries).idPending: Map<tier, number>`; `renderMarkdown` com `## Sondas de ID`.

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
  const empty = renderMarkdown(aggregate([]));
  assert.match(empty, /## Sondas de ID\n\n—/);
  assert.match(empty, /Turnos com ID pendente: —/);
});

test("beforeAfter: linha probe sem usage não desloca o corte", () => {
  const ledger = [
    { ts: "2026-10-10T10:00:00.000Z", scope: "probe", tier: "standard", probe: "ok" },
    { ts: "2026-10-10T11:00:00.000Z", scope: "session", phase: "E", model: "claude-sonnet-5-5", usage: { input_tokens: 1, output_tokens: 1 } },
  ];
  assert.equal(beforeAfter(ledger, []).cut, Date.parse("2026-10-10T11:00:00.000Z"));
});
```

Em `tests/e2e/test-model-route-cli.mjs`, no padrão `fixture()`/`run()` do arquivo: gravar no diretório de ledger da fixture um `.jsonl` com uma `probe` ok, uma `probe` rejected e uma `session` com `idPending`; `run(["report"], f)` contém `## Sondas de ID` e `| standard | 1 | 1 | 0 |`, com exit 0.
- [ ] **Step 2:** `node --test tests/lib/routing-ledger.test.mjs tests/e2e/test-model-route-cli.mjs` → FAIL.
- [ ] **Step 3: implementar.** Em `aggregate`, `probes: new Map(), idPending: new Map()` e, no início do laço:

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

Em `beforeAfter`, o corte ignora `scope === "probe"`: `const stamps = (ledger ?? []).filter((e) => e?.scope !== "probe").map(...)`. Em `renderMarkdown`, depois de "Trocas de fase da sessão":

```js
  const probes = [...(agg.probes ?? new Map())];
  lines.push("", "## Sondas de ID", "");
  if (probes.length) {
    lines.push("| Tier | ok | rejected | error |", "|---|---|---|---|");
    for (const [t, c] of probes) lines.push(`| ${t} | ${c.ok} | ${c.rejected} | ${c.error} |`);
  } else lines.push("—");
  lines.push("", `Turnos com ID pendente: ${[...(agg.idPending ?? new Map())].map(([t, n]) => `${t}×${n}`).join(", ") || "—"}`);
```

- [ ] **Step 4:** `bash tests/run-unit.sh` e `bash tests/run-e2e.sh` → verde.
- [ ] **Step 5: commit**

```bash
git add -- scripts/lib/routing-report.mjs tests/lib/routing-ledger.test.mjs tests/e2e/test-model-route-cli.mjs
git commit -m "feat(routing): relatório mostra sondas de ID e turnos com ID pendente"
```

---

### Task 8: CHANGELOG, guia de usuário, skill de config e achados

**Agent:** documentation-writer · **Tier:** standard · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** lint

**Files:**
- Modify: `CHANGELOG.md`, `docs/model-routing.md`, `skills/config/SKILL.md`, `docs/superpowers/2026-10-09-model-routing-lab-findings.md`

- [ ] **Step 1: verificação antes** — `node scripts/lib/finalize/changelog-gate.mjs check CHANGELOG.md` (registrar o estado) e `grep -n "models:" -A20 skills/config/SKILL.md` para achar o bloco da entrevista.
- [ ] **Step 2:** `CHANGELOG.md`, em `## [Unreleased]` → `### Fixed` (criar a subseção se faltar, no padrão do arquivo): a sessão não trocava de tier sem um subagente do tier antes; agora sonda um candidato (1 token, só quando falta ID); cache por usuário em `~/.local/share/devflow-model-routing/ids.json` (só ID da tabela ou resolvido pelo engine); `models.ids`; chaves novas do ledger (`probe`, `idPending`, `idSource`) e seção "Sondas de ID" no `model-route report` (ADR-017 v1.2.0).
- [ ] **Step 3:** `docs/model-routing.md`, seção curta "ID do tier e sonda": cadeia de candidatos, custo, cache e proveniência, `models.ids` com exemplo, e o que aparece no ledger e no relatório.
- [ ] **Step 4:** `skills/config/SKILL.md`: na entrevista do bloco `models:`, mencionar `models.ids` como opcional (só para gateway/conta com IDs próprios), com o mesmo exemplo.
- [ ] **Step 5:** achados: seção "Campanha 2026-10-10 (v3.8.1)": D-stress (`INV-PHASE-SYNC` HELD 0/3 → H1 validada; `INV-SESS` MISS 27/130 por falta de ID — causa e correção deste plano), B-routed (ledger com 3 linhas, sem subagentes; investigação em aberto), C-ceiling (incompleto por `max-resumes`, sem `prevc.json`). Sem caminhos locais.
- [ ] **Step 6:** `node scripts/lib/finalize/changelog-gate.mjs check CHANGELOG.md` → ok; `bash tests/run-lint.sh` → verde.
- [ ] **Step 7: commit**

```bash
git add -- CHANGELOG.md docs/model-routing.md skills/config/SKILL.md docs/superpowers/2026-10-09-model-routing-lab-findings.md
git commit -m "docs(routing): sonda do ID do tier no guia, na config e nos achados"
```

---

### Task 9: laboratório — allowlist e causa no INV-SESS

**Agent:** backend-specialist · **Tier:** standard · **Standards:** std-commit-hygiene, std-pre-commit-hygiene · **Tests:** unit do laboratório

**Repo:** `devflow-routing-lab` (irmão do devflow, sem remoto). Não tocar em `results/2026-10-10-*` (não versionados, do operador).

**Files:**
- Modify: `lib/ledger.mjs`, `lib/invariants.mjs`
- Test: `tests/unit/ledger.test.mjs`, `tests/unit/invariants.test.mjs`

- [ ] **Step 1: testes vermelhos.** Em `tests/unit/ledger.test.mjs`: `normalize({ scope: "probe", tier: "standard", model: "claude-sonnet-5-5", probe: "ok" })` e `normalize({ scope: "session", idPending: "standard", idSource: "probe" })` sem violações; `normalize({ probe: "talvez" })` com `valor-invalido:probe`. Em `tests/unit/invariants.test.mjs` (usa `base()`, `clone()`, `msg()`, `v()` do arquivo):

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

- [ ] **Step 2:** `bash tests/run-unit.sh` no laboratório → FAIL.
- [ ] **Step 3: implementar.** `lib/ledger.mjs`: `KEYS` com `idPending`, `idSource`, `probe`; `ENUM.scope` com `"probe"`; `ENUM.idPending = TIERS`, `ENUM.idSource = ["learned", "probe"]`, `ENUM.probe = ["ok", "rejected", "error"]`. `lib/invariants.mjs`, em `sess`, antes do `return`:

```js
  const pend = m.ledger.entries.filter((e) => e.scope === "session" && e.idPending);
  const probes = m.ledger.entries.filter((e) => e.scope === "probe");
  const cause = bad.length && (pend.length || probes.length)
    ? `; causa: ${pend.length} turnos com ID pendente (${tally(pend.map((e) => e.idPending)) || "—"}); sondas: ${tally(probes.map((e) => `${e.tier}:${e.probe}`)) || "nenhuma"}`
    : "";
  return r("INV-SESS", bad.length ? "MISS" : "HELD", ev + cause);
```

Conferir que `INV-LEDGER` não acusa linha `probe` (não tem `usage`) como violação.
- [ ] **Step 4:** `bash tests/run-unit.sh` no laboratório → verde.
- [ ] **Step 5: commit no repo do laboratório**

```bash
git -C ../devflow-routing-lab add -- lib/ledger.mjs lib/invariants.mjs tests/unit/ledger.test.mjs tests/unit/invariants.test.mjs
git -C ../devflow-routing-lab commit -m "feat(lab): ledger com sonda de ID e causa do INV-SESS"
```
