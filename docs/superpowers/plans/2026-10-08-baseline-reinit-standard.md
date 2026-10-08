# `baseline reinit` — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** `baseline-reinit-standard` | **Escala:** MEDIUM | **Fase:** R→E
> **Revisão R (2026-10-08):** arquiteto aprovou com ressalvas; segurança concluiu que o desenho se sustenta com correções. Este plano já incorpora os achados e as decisões 4 e 5 da spec. Execução inline, pelo agente da sessão.

**Goal:** Dar ao operador um subcomando que refaz as entradas de um standard no baseline com os achados atuais, sem tocar nas que não mudaram nem nas dos outros standards.

**Architecture:** Uma função pura em `standards-baseline.mjs` classifica cada impressão digital do standard (mantida, nova, alterada, removida) e calcula os caminhos novos e os que cresceram. Um ramo `reinit` em `cmdBaseline` valida, roda só o linter do alvo pelo `stdFilter` do engine, recusa caminho novo sem a flag, relê o baseline e grava com o `saveBaseline` existente. O engine ganha um campo aditivo, `linterRuns`. Gate do CI e guards não mudam.

**Tech Stack:** Node (ESM, `node:test`, `node:assert/strict`), sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-08-baseline-reinit-standard-design.md`

**Agents:** test-writer e backend-specialist (Tasks 1 a 3), documentation-writer (Task 4); security-auditor na fase V, reexecutando as provas de conceito da fase R.

```yaml
requiredSignals: [unit, integration, e2e, lint]
```

O sinal `standards` entra na fase V pela regra da ADR-013 (o repositório tem standard que pode chegar a `block`).

## Global Constraints

- Interface: `devflow-standards baseline reinit <std-id> --reason "<justificativa>" [--allow-new-paths]`.
- Exit 0 quando grava ou quando não há diferença; 2 para uso incorreto ou ação recusada; 3 para erro de execução.
- `<std-id>` casa `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`; `--reason` não vazio, até 500 caracteres. Nenhum valor recebido é ecoado: nem id fora do formato, nem justificativa, nem opção desconhecida.
- Opção desconhecida é uso incorreto (exit 2), nunca ignorada.
- Ordem das pré-condições: argumentos válidos → terminal interativo e fora de CI → baseline existe → standard efetivo (comparação estrita de string).
- Roda só o linter do standard alvo. Erro de linter: exit 3. Nenhuma execução de linter: exit 2. Nos dois casos, nada gravado.
- Entrada com mesma impressão digital e mesma contagem fica intacta (mesmo objeto). Entradas de outros standards não são tocadas.
- Caminho novo sem `--allow-new-paths`: lista, exit 2, nada gravado. Listas de caminhos sem teto de linhas.
- Baseline alterado entre a leitura e a gravação: exit 3, nada gravado.
- Sem diferença: não grava.
- Mensagens do CLI em pt-BR, no estilo das existentes.
- TDD: cada teste é visto falhar antes do código, exceto a asserção do guard de Bash, que fixa comportamento existente. Nenhum teste existente é removido ou afrouxado.
- Git: commit por pathspec (`git commit -- <arquivos>`), nunca `git add -A` nem `git add .`. `.gitignore` e `.context/workflow/.checkpoint/last.json` têm mudanças locais do operador e não entram em commit. Sem `push`, `gh`, PR ou merge durante a execução das tasks.
- Repositório público: nenhum nome de projeto privado em código, teste, doc ou mensagem de commit.

## Review Focus

Entradas e condições que a spec implica e que um operador vai encontrar. Cada uma tem teste na task dona do código.

1. **Dois ids na mesma chamada** (`reinit std-a std-b`): recusa com uso, exit 2 (Task 3, "argumentos").
2. **Opção que o comando não conhece** (`--dry-run`): recusa com uso e não grava (Task 3, "argumentos").
3. **Justificativa com quebra de linha ou sequência ANSI:** gravada como veio, fora da saída (Task 3, "justificativa").
4. **Baseline removido da árvore mas versionado no HEAD:** o comando parte do HEAD e recria o arquivo (Task 3, "HEAD").
5. **Standard cujo `applyTo` não casa nenhum arquivo:** recusa em vez de zerar as entradas (Task 3, "nenhum linter rodou").

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/lib/standards-baseline.mjs` | Nova função exportada `reinitStandard` |
| `scripts/lib/standards-engine.mjs` | Campo `linterRuns` no resultado de `checkFiles` |
| `scripts/lib/standards-check-cli.mjs` | Ramo `reinit` em `cmdBaseline`; texto de uso; comentário de cabeçalho |
| `scripts/devflow-standards.mjs` | Linha de ajuda do subcomando `baseline` |
| `tests/lib/test-standards-baseline.mjs` | Testes unit da função pura |
| `tests/lib/test-standards-engine.mjs` | Teste unit do `linterRuns` |
| `tests/integration/test-standards-check-cli.mjs` | Testes pelo CLI real |
| `tests/lib/test-standards-ratchet-bash.mjs` | Uma asserção do guard de Bash |
| `docs/guia-enforcement-standards.md`, `CHANGELOG.md`, `docs/superpowers/2026-10-06-standards-enforcement-pendencias.md`, ADR-015 v1.1.0 | Documentação |

---

### Task 1: função pura `reinitStandard`

**Agent:** test-writer → backend-specialist
**Tests:** unit

**Files:**
- Modify: `scripts/lib/standards-baseline.mjs` (depois de `acceptFinding`)
- Test: `tests/lib/test-standards-baseline.mjs` (no fim do arquivo)

**Interfaces:**
- Consumes: `toEntry(finding, extra)`, `countBy(findings) → Map<fp, number>` e `BASELINE_VERSION`, já no módulo.
- Produces:
  ```js
  reinitStandard(baseline, findings, stdId, { reason, by })
  // → { baseline, changed: boolean,
  //     kept, added, altered, removed: { entries: number, count: number },
  //     byRule: Array<[ruleId, number]>,            // ocorrências das novas e alteradas, por regra, ordenado
  //     newPaths: string[],                          // caminhos sem entrada anterior do standard, ordenado
  //     grownPaths: Array<[path, before, after]> }   // caminhos que já tinham entrada e cresceram, ordenado
  ```
  Lança `Error` sem justificativa. Com `changed === false`, devolve o MESMO objeto `baseline` recebido.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/lib/test-standards-baseline.mjs`, acrescente `reinitStandard` à lista de imports de `../../scripts/lib/standards-baseline.mjs` e, no fim do arquivo:

```js
const T0 = { entries: 0, count: 0 };

test("reinit: entrada nova recebe justificativa e autor; a de outro standard fica como estava", () => {
  const keepA = f({ stdId: "std-a", message: "a1" });
  const oldB = f({ stdId: "std-b", message: "antiga" });
  const bl = initBaseline([keepA, oldB, oldB], { by: "ana" });
  const n1 = f({ stdId: "std-b", message: "nova", line: 3 });
  const n2 = f({ stdId: "std-b", message: "nova", line: 9 });
  const n3 = f({ stdId: "std-b", ruleId: "s", message: "outra" });
  const out = reinitStandard(bl, [keepA, n1, n2, n3], "std-b", { reason: "linter migrado", by: "bia" });
  assert.equal(out.changed, true);
  assert.equal(out.baseline.entries[0], bl.entries[0]);
  const b = out.baseline.entries.filter(e => e.stdId === "std-b");
  assert.deepEqual(b.map(e => [e.fp, e.count]), [[n1.fp, 2], [n3.fp, 1]]);
  assert.ok(b.every(e => e.reason === "linter migrado" && e.acceptedBy === "bia" && e.acceptedAt));
  assert.ok(!out.baseline.entries.some(e => e.fp === oldB.fp));
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [T0, { entries: 2, count: 3 }, T0, { entries: 1, count: 2 }]);
  assert.deepEqual(out.byRule, [["r", 2], ["s", 1]]);
  assert.doesNotThrow(() => parseBaseline(JSON.stringify(out.baseline)));
});

test("reinit: entrada com mesma impressão digital e contagem fica intacta, com a justificativa antiga", () => {
  const a = f({ stdId: "std-b", path: "src/a.ts" });
  const b = f({ stdId: "std-b", path: "src/b.ts" });
  const bl = acceptFinding(initBaseline([a], { by: "ana" }), b, { reason: "legado do fornecedor, chamado 123", by: "ana" });
  const novo = f({ stdId: "std-b", path: "src/c.ts" });
  const out = reinitStandard(bl, [a, b, novo], "std-b", { reason: "aceite em lote", by: "bia" });
  assert.equal(out.changed, true);
  for (const e of bl.entries) assert.ok(out.baseline.entries.includes(e), `a entrada de ${e.path} foi regravada`);
  assert.equal(out.baseline.entries.find(e => e.fp === b.fp).reason, "legado do fornecedor, chamado 123");
  assert.equal(out.baseline.entries.find(e => e.fp === novo.fp).reason, "aceite em lote");
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [{ entries: 2, count: 2 }, { entries: 1, count: 1 }, T0, T0]);
  assert.deepEqual([out.newPaths, out.grownPaths], [["src/c.ts"], []]);
});

test("reinit: contagem que mudou regrava a entrada e aparece como caminho que cresceu", () => {
  const a = f({ stdId: "std-b", path: "src/a.ts" });
  const out = reinitStandard(initBaseline([a], { by: "ana" }), [a, a, a], "std-b", { reason: "mais duas", by: "bia" });
  const e = out.baseline.entries.find(x => x.fp === a.fp);
  assert.deepEqual([e.count, e.reason, e.acceptedBy], [3, "mais duas", "bia"]);
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [T0, T0, { entries: 1, count: 3 }, T0]);
  assert.deepEqual([out.newPaths, out.grownPaths], [[], [["src/a.ts", 1, 3]]]);
  assert.deepEqual(out.byRule, [["r", 3]]);
});

test("reinit: caminho novo e caminho que cresceu saem do caminho, não da mensagem", () => {
  // Migração: todas as mensagens mudam (impressões digitais novas) e os arquivos são os mesmos.
  const b = (path, message) => f({ stdId: "std-b", path, message });
  const bl = initBaseline([b("src/a.ts", "antiga"), b("src/b.ts", "antiga")]);
  const migrado = [b("src/a.ts", "nova"), b("src/b.ts", "nova")];
  const legit = reinitStandard(bl, migrado, "std-b", { reason: "x", by: "bia" });
  assert.deepEqual([legit.newPaths, legit.grownPaths], [[], []]);
  const comPlanta = [...migrado, b("src/b.ts", "nova"), b("src/plantado.ts", "nova")];
  const out = reinitStandard(bl, comPlanta, "std-b", { reason: "x", by: "bia" });
  assert.deepEqual(out.newPaths, ["src/plantado.ts"]);
  assert.deepEqual(out.grownPaths, [["src/b.ts", 1, 2]]);
});

test("reinit: as entradas dos outros standards saem idênticas (propriedade)", () => {
  let seed = 42;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const mk = () => f({ stdId: `std-${"abc"[rnd(3)]}`, ruleId: `r${rnd(3)}`, path: `src/f${rnd(4)}.ts`, message: `m${rnd(5)}` });
  for (let round = 0; round < 200; round++) {
    const bl = initBaseline(Array.from({ length: rnd(12) }, mk), { by: "ana" });
    const now = Array.from({ length: rnd(12) }, mk);
    const target = `std-${"abc"[rnd(3)]}`;
    const out = reinitStandard(bl, now, target, { reason: "x", by: "bia" });
    const others = (x) => x.entries.filter(e => e.stdId !== target);
    assert.deepEqual(others(out.baseline), others(bl), `rodada ${round}`);
    assert.ok(others(bl).every(e => out.baseline.entries.includes(e)), `rodada ${round}: entrada de outro standard foi copiada`);
    const want = new Map();
    for (const x of now) if (x.stdId === target) want.set(x.fp, (want.get(x.fp) || 0) + 1);
    const got = new Map(out.baseline.entries.filter(e => e.stdId === target).map(e => [e.fp, e.count]));
    assert.deepEqual(got, want, `rodada ${round}`);
  }
});

test("reinit: standard sem achados atuais fica sem entradas", () => {
  const a = f({ stdId: "std-a" }), b = f({ stdId: "std-b" });
  const out = reinitStandard(initBaseline([a, b]), [a], "std-b", { reason: "regra retirada", by: "bia" });
  assert.equal(out.changed, true);
  assert.deepEqual(out.baseline.entries.map(e => e.stdId), ["std-a"]);
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [T0, T0, T0, { entries: 1, count: 1 }]);
});

test("reinit: sem diferença devolve o mesmo baseline e changed false", () => {
  const a = f({ stdId: "std-a" }), b = f({ stdId: "std-b" });
  const bl = initBaseline([a, b, b], { by: "ana" });
  const out = reinitStandard(bl, [b, a, b], "std-b", { reason: "x", by: "bia" });
  assert.equal(out.changed, false);
  assert.equal(out.baseline, bl);
  assert.deepEqual([out.kept, out.added, out.altered, out.removed], [{ entries: 1, count: 2 }, T0, T0, T0]);
});

test("reinit: regra chamada constructor ou __proto__ é contada como qualquer outra", () => {
  const b = (ruleId, path = "src/x.ts") => f({ stdId: "std-b", ruleId, path });
  const out = reinitStandard(initBaseline([f({ stdId: "std-a" })]), [b("constructor"), b("__proto__"), b("__proto__", "src/y.ts")], "std-b", { reason: "x", by: "bia" });
  assert.deepEqual(out.byRule, [["__proto__", 2], ["constructor", 1]]);
});

test("reinit exige justificativa", () => {
  const bl = initBaseline([f()]);
  assert.throws(() => reinitStandard(bl, [f()], "std-a", { by: "bia" }), /justificativa/);
  assert.throws(() => reinitStandard(bl, [f()], "std-a", { reason: "   ", by: "bia" }), /justificativa/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-standards-baseline.mjs`
Expected: FAIL ao carregar o módulo, com `SyntaxError` dizendo que `standards-baseline.mjs` não exporta `reinitStandard`.

- [ ] **Step 3: Implementação mínima**

Em `scripts/lib/standards-baseline.mjs`, logo depois de `acceptFinding`:

```js
const byFirst = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

// Refaz as entradas de UM standard com os achados atuais (operador, D6). Entrada cuja impressão
// digital e contagem não mudaram fica como está — mesmo objeto, mesma justificativa; as dos
// outros standards nem são olhadas. Os caminhos novos e os que cresceram saem do CAMINHO, que
// uma migração de mensagem ou de regra não muda, e não da impressão digital, que ela muda toda.
// Sem diferença, devolve o próprio baseline recebido: o chamador não grava.
export function reinitStandard(baseline, findings, stdId, { reason, by } = {}) {
  if (!reason || !String(reason).trim()) throw new Error("baseline reinit exige justificativa (--reason)");
  const mine = findings.filter(x => x.stdId === stdId);
  const old = baseline.entries.filter(e => e.stdId === stdId);
  const before = new Map(old.map(e => [e.fp, e]));
  const now = countBy(mine);
  const first = new Map();
  for (const x of mine) if (!first.has(x.fp)) first.set(x.fp, x);

  const tally = () => ({ entries: 0, count: 0 });
  const kept = tally(), added = tally(), altered = tally(), removed = tally();
  const byRule = new Map(); // Map, não objeto: "constructor" e "__proto__" são nomes de regra válidos
  const keepFp = new Set();
  const fresh = [];
  for (const [fp, count] of now) {
    const prev = before.get(fp);
    if (prev && prev.count === count) { keepFp.add(fp); kept.entries++; kept.count += count; continue; }
    const x = first.get(fp);
    const t = prev ? altered : added;
    t.entries++; t.count += count;
    byRule.set(x.ruleId, (byRule.get(x.ruleId) || 0) + count);
    fresh.push(toEntry(x, { count, reason, ...(by ? { acceptedBy: by } : {}) }));
  }
  for (const e of old) if (!now.has(e.fp)) { removed.entries++; removed.count += e.count; }

  const perPath = (pairs) => { const m = new Map(); for (const [p, c] of pairs) m.set(p, (m.get(p) || 0) + c); return m; };
  const pathBefore = perPath(old.map(e => [e.path, e.count]));
  const pathNow = perPath(mine.map(x => [x.path, 1]));
  const newPaths = [...pathNow.keys()].filter(p => !pathBefore.has(p)).sort();
  const grownPaths = [...pathNow].filter(([p, c]) => pathBefore.has(p) && c > pathBefore.get(p))
    .map(([p, c]) => [p, pathBefore.get(p), c]).sort(byFirst);

  const changed = added.entries + altered.entries + removed.entries > 0;
  const summary = { changed, kept, added, altered, removed, byRule: [...byRule].sort(byFirst), newPaths, grownPaths };
  if (!changed) return { baseline, ...summary };
  return {
    baseline: {
      version: BASELINE_VERSION,
      entries: [...baseline.entries.filter(e => e.stdId !== stdId || keepFp.has(e.fp)), ...fresh],
    },
    ...summary,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/lib/test-standards-baseline.mjs`
Expected: PASS em todos, inclusive os nove novos; nenhum teste antigo quebrado.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(standards): reinitStandard refaz as entradas de um standard no baseline" \
  -- scripts/lib/standards-baseline.mjs tests/lib/test-standards-baseline.mjs
```

---

### Task 2: `linterRuns` no resultado do engine

**Agent:** test-writer → backend-specialist
**Tests:** unit

**Files:**
- Modify: `scripts/lib/standards-engine.mjs` (objeto `result` de `checkFiles` e a linha depois da montagem de `jobs`)
- Test: `tests/lib/test-standards-engine.mjs` (no fim do arquivo)

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `(await checkFiles(...)).linterRuns: number` — quantas execuções de linter (pares standard × arquivo) foram despachadas.

- [ ] **Step 1: Escrever o teste que falha**

No fim de `tests/lib/test-standards-engine.mjs`:

```js
test("linterRuns conta as execuções de linter despachadas", async () => {
  const root = demoProject();
  writeFileSync(join(root, "src/a.js"), "ok\n");
  writeFileSync(join(root, "src/b.js"), "BAD\n");
  assert.equal((await checkFiles({ projectRoot: root, files: ["src/a.js", "src/b.js"], baseline: null })).linterRuns, 2);
  // Fora do applyTo, ou barrado pelo filtro: nada roda — e isso não é o mesmo que "sem achados".
  assert.equal((await checkFiles({ projectRoot: root, files: ["README.md"], baseline: null })).linterRuns, 0);
  assert.equal((await checkFiles({ projectRoot: root, files: ["src/b.js"], baseline: null, stdFilter: () => false })).linterRuns, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --test-name-pattern="linterRuns" tests/lib/test-standards-engine.mjs`
Expected: FAIL com `undefined !== 2`.

- [ ] **Step 3: Implementação mínima**

Em `scripts/lib/standards-engine.mjs`, no objeto `result` de `checkFiles`, troque

```js
    hasBaseline: false, baselineSource: "nenhum", baselineError: null,
```

por

```js
    hasBaseline: false, baselineSource: "nenhum", baselineError: null, linterRuns: 0,
```

e, logo depois do laço que monta `jobs` (antes de `const trustedPlugin = trustedPluginRoot();`):

```js
  // Quantas execuções foram despachadas: "rodou e não achou nada" não é "não rodou".
  result.linterRuns = jobs.length;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/lib/test-standards-engine.mjs`
Expected: PASS em todos.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(standards): checkFiles informa quantas execuções de linter despachou" \
  -- scripts/lib/standards-engine.mjs tests/lib/test-standards-engine.mjs
```

---

### Task 3: subcomando `baseline reinit` no CLI

**Agent:** test-writer → backend-specialist
**Tests:** integration (CLI real por `spawnSync`) + unit do guard de Bash

**Files:**
- Modify: `scripts/lib/standards-check-cli.mjs` (import, ramo em `cmdBaseline`, texto de uso, comentário de cabeçalho)
- Modify: `scripts/devflow-standards.mjs` (linha de ajuda de `baseline`)
- Test: `tests/integration/test-standards-check-cli.mjs` (no fim do arquivo)
- Test: `tests/lib/test-standards-ratchet-bash.mjs`

**Interfaces:**
- Consumes: `reinitStandard` (Task 1); `linterRuns` (Task 2); `checkFiles({ projectRoot, files, baseline, stdFilter })`, `allFiles(root)`, `resolveBaseline(root)`, `loadEffectiveStandards(root)`, `saveBaseline`, `positional`, `opt`, `oneLine`, `logPath`, `who`, `pluginCmd`, `refuseNonInteractive`, `reportErrors`, `warnLegacyLinters`, já no módulo.
- Produces: `runStandardsCommand("baseline", ["reinit", <std-id>, "--reason", <texto>, ("--allow-new-paths")], root, { isInteractive })` → `0 | 2 | 3`.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/integration/test-standards-check-cli.mjs`:

```js
// ── baseline reinit ──────────────────────────────────────────────────────────────────────
const LINT_WORSE = LINT_BAD.replaceAll("BAD", "WORSE").replace("no-bad", "no-worse");
const LINT_MIGRADO = LINT_BAD.replace("remova BAD", "tire o BAD"); // o linter muda a mensagem
const REINIT_USO = /uso: .*baseline reinit <std-id> --reason/;
const STD_DIR = (root) => join(root, ".context/engineering/standards");

// Dois standards do projeto: std-demo (no-bad) e std-other (no-worse), os dois em block.
function twoStdRepo() {
  const root = repo();
  writeFileSync(join(STD_DIR(root), "std-other.md"),
    `---\nid: std-other\nsource: local\ndescription: outro\napplyTo: ["src/**"]\nenforcement:\n  linter: engineering/standards/machine/std-other.js\n  level: block\n---\n## Princípios\n- sem WORSE\n`);
  writeFileSync(join(STD_DIR(root), "machine/std-other.js"), LINT_WORSE);
  writeFileSync(join(root, "src/old.js"), "BAD\nWORSE\nWORSE\n");
  git(root, "add", "-A");
  return root;
}

// Captura console.log e console.error durante uma chamada in-process.
async function captureAll(fn) {
  const out = [], err = [];
  const o = console.log, e = console.error;
  console.log = (...m) => out.push(m.map(String).join(" "));
  console.error = (...m) => err.push(m.map(String).join(" "));
  try { return { code: await fn(), out: out.join("\n"), err: err.join("\n") }; } finally { console.log = o; console.error = e; }
}

const entriesOf = (root, id) => JSON.parse(readFileSync(BL(root), "utf8")).entries.filter(e => e.stdId === id);
const reinit = (root, ...a) => human(root, "baseline", "reinit", ...a);

test("reinit: caso feliz — refaz só o standard alvo e o check volta a ficar verde", async () => {
  const root = twoStdRepo();
  assert.equal(await human(root, "baseline", "init"), 0);
  const otherBefore = entriesOf(root, "std-other");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  assert.equal(run(root, "check", "--all").status, 1, "o aceito volta como violação nova");

  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "linter migrado"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /std-demo: baseline refeito — mantidas 0 entrada\(s\) \(0 ocorrência\(s\)\); novas 1 entrada\(s\) \(1 ocorrência\(s\)\); alteradas 0 entrada\(s\) \(0 ocorrência\(s\)\); removidas 1 entrada\(s\) \(1 ocorrência\(s\)\)/);
  assert.match(r.out, /1 execução\(ões\) de linter/);
  assert.match(r.out, /regra no-bad: 1/);
  assert.doesNotMatch(r.out, /caminho novo|cresceu/);
  assert.equal(run(root, "check", "--all").status, 0);
  assert.deepEqual(entriesOf(root, "std-other"), otherBefore);
  const demo = entriesOf(root, "std-demo");
  assert.equal(demo.length, 1);
  assert.equal(demo[0].reason, "linter migrado");
  assert.match(demo[0].message, /tire o BAD/);
  assert.ok(demo[0].acceptedBy && demo[0].acceptedAt);
});

test("reinit: migração com arquivo plantado — recusa sem a flag, lista o caminho e aceita com ela", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  writeFileSync(join(root, "src/auth.js"), "BAD\n"); // plantado junto com a migração
  const before = readFileSync(BL(root), "utf8");

  const no = await captureAll(() => reinit(root, "std-demo", "--reason", "linter migrado"));
  assert.equal(no.code, 2);
  assert.match(no.err, /1 caminho\(s\) com achado de std-demo não tinham nenhuma entrada/);
  assert.match(no.err, /^  src\/auth\.js$/m);
  assert.match(no.err, /--allow-new-paths/);
  assert.equal(readFileSync(BL(root), "utf8"), before);

  const yes = await captureAll(() => reinit(root, "std-demo", "--reason", "linter migrado", "--allow-new-paths"));
  assert.equal(yes.code, 0, yes.err);
  assert.match(yes.out, /caminho novo: src\/auth\.js/);
  assert.equal(entriesOf(root, "std-demo").length, 2);
});

test("reinit: linter intacto e uma violação nova — as entradas mantidas conservam a justificativa antiga", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  const fp = JSON.parse(run(root, "check", "--all", "--json").stdout.split("\n")[0]).blocking.find(x => x.path === "src/new.js").fp;
  assert.equal(await human(root, "baseline", "accept", fp, "--reason", "legado do fornecedor, chamado 123"), 0);
  const before = entriesOf(root, "std-demo");
  writeFileSync(join(root, "src/third.js"), "BAD\n");

  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "aceite em lote", "--allow-new-paths"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /mantidas 2 entrada\(s\) \(2 ocorrência\(s\)\); novas 1 entrada\(s\)/);
  const after = entriesOf(root, "std-demo");
  for (const e of before) assert.deepEqual(after.find(x => x.fp === e.fp), e);
  assert.equal(after.find(x => x.path === "src/third.js").reason, "aceite em lote");
  assert.equal(after.find(x => x.fp === fp).reason, "legado do fornecedor, chamado 123");
});

test("reinit: mais ocorrências num arquivo que já tinha entrada aparecem como crescimento", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/old.js"), "BAD\nBAD\nBAD\nWORSE\nWORSE\n");
  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "mais duas"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /alteradas 1 entrada\(s\) \(3 ocorrência\(s\)\)/);
  assert.match(r.out, /cresceu: src\/old\.js \(1 → 3\)/);
  assert.equal(entriesOf(root, "std-demo")[0].count, 3);
});

test("reinit: sem diferença sai 0 e não toca no arquivo", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "conferência"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /std-demo: nada a refazer/);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: sem terminal interativo recusa", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  const r = run(root, "baseline", "reinit", "std-demo", "--reason", "x");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /terminal interativo/);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: CI=1 recusa mesmo com a entrada padrão num terminal", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  const before = readFileSync(BL(root), "utf8");
  const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const ci = process.env.CI;
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  process.env.CI = "1";
  try {
    const r = await captureErr(() => runStandardsCommand("baseline", ["reinit", "std-demo", "--reason", "x"], root));
    assert.equal(r.code, 2);
    assert.match(r.err, /terminal interativo/);
  } finally {
    if (tty) Object.defineProperty(process.stdin, "isTTY", tty); else delete process.stdin.isTTY;
    if (ci === undefined) delete process.env.CI; else process.env.CI = ci;
  }
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: argumentos — id, justificativa e opções inválidos → uso (exit 2), nada gravado", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO); // haveria o que gravar: opção ignorada gravaria
  const before = readFileSync(BL(root), "utf8");
  const casos = [
    [], ["std-demo"], ["std-demo", "--reason", "   "], ["--reason", "x"],
    ["std-demo", "std-other", "--reason", "x"],
    ["std-demo", "--reason", "x".repeat(501)],
    ["std-demo", "--reason", "x", "--dry-run"],
    ["std-demo", "--rule=no-bad", "--reason", "x"],
    ["std-demo", "--reason", "x", "--allow-new-path"],
  ];
  for (const args of casos) {
    const r = await captureAll(() => reinit(root, ...args));
    assert.equal(r.code, 2, JSON.stringify(args).slice(0, 80));
    assert.match(r.err, REINIT_USO, JSON.stringify(args).slice(0, 80));
    assert.doesNotMatch(r.out + r.err, /dry-run|no-bad|allow-new-path\b(?!s)/);
  }
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: id malformado não é ecoado (nem C0/ANSI)", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  for (const bad of ['std"; curl x|sh; echo "', "\x1b[31mvermelho\x1b[0m", "std\ndemo", "std demo", ".std", "a".repeat(129)]) {
    const r = run(root, "baseline", "reinit", bad, "--reason", "x");
    assert.equal(r.status, 2, JSON.stringify(bad));
    const out = r.stdout + r.stderr;
    assert.match(out, REINIT_USO, JSON.stringify(bad)); // uso, e não a recusa por falta de terminal
    assert.ok(!out.includes(bad), `ecoou ${JSON.stringify(bad)}`);
    assert.doesNotMatch(out, /curl|\x1b|vermelho/);
    const h = await captureErr(() => reinit(root, bad, "--reason", "x"));
    assert.equal(h.code, 2);
    assert.match(h.err, REINIT_USO, JSON.stringify(bad));
    assert.ok(!h.err.includes(bad));
  }
});

test("reinit: sem baseline → exit 2 apontando o init, e nada é criado", async () => {
  const root = twoStdRepo();
  const r = await captureErr(() => reinit(root, "std-demo", "--reason", "x"));
  assert.equal(r.code, 2);
  assert.match(r.err, /sem baseline para refazer/);
  assert.match(r.err, /baseline init/);
  assert.ok(!existsSync(BL(root)));
});

test("reinit: standard desconhecido → exit 2 e o arquivo fica igual", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  const r = await captureErr(() => reinit(root, "std-nao-existe", "--reason", "x"));
  assert.equal(r.code, 2);
  assert.match(r.err, /std-nao-existe não encontrado/);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: erro do linter do alvo → exit 3 e o arquivo fica byte a byte igual", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  writeFileSync(LINTER(root), "process.exit(7)");
  const r = await captureErr(() => reinit(root, "std-demo", "--reason", "x"));
  assert.equal(r.code, 3);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: nenhum linter rodou para o standard → exit 2 apontando o prune, sem zerar as entradas", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  const md = join(STD_DIR(root), "std-demo.md");
  writeFileSync(md, readFileSync(md, "utf8").replace('applyTo: ["src/**"]', 'applyTo: ["nada/**"]'));
  const r = await captureErr(() => reinit(root, "std-demo", "--reason", "x"));
  assert.equal(r.code, 2);
  assert.match(r.err, /nenhum linter rodou para std-demo/);
  assert.match(r.err, /baseline prune/);
  assert.equal(readFileSync(BL(root), "utf8"), before);
});

test("reinit: linter quebrado de OUTRO standard não impede a operação", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  writeFileSync(join(STD_DIR(root), "machine/std-other.js"), "process.exit(7)");
  const otherBefore = entriesOf(root, "std-other");
  assert.equal(await reinit(root, "std-demo", "--reason", "linter migrado"), 0);
  assert.deepEqual(entriesOf(root, "std-other"), otherBefore);
  assert.match(entriesOf(root, "std-demo")[0].message, /tire o BAD/);
});

test("reinit: baseline alterado durante a execução → exit 3, e o que o outro comando gravou fica", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  // O linter do alvo, enquanto roda, faz o papel de um `accept` concorrente no outro standard.
  const outro = `const p=".context/engineering/standards/baseline.json";const j=JSON.parse(fs.readFileSync(p,"utf8"));j.entries.find(e=>e.stdId==="std-other").count=99;fs.writeFileSync(p,JSON.stringify(j));`;
  writeFileSync(LINTER(root), LINT_MIGRADO.replace("process.exit(h?1:0);", `${outro}process.exit(h?1:0);`));
  const r = await captureErr(() => reinit(root, "std-demo", "--reason", "linter migrado"));
  assert.equal(r.code, 3);
  assert.match(r.err, /baseline mudou durante a execução/);
  assert.equal(entriesOf(root, "std-other")[0].count, 99);
  assert.match(entriesOf(root, "std-demo")[0].message, /remova BAD/);
});

test("reinit: justificativa fica gravada como veio e não aparece na saída", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_MIGRADO);
  const reason = "linha1\nlinha2 \x1b[31mvermelho";
  const r = await captureAll(() => reinit(root, "std-demo", `--reason=${reason}`));
  assert.equal(r.code, 0, r.err);
  assert.equal(entriesOf(root, "std-demo")[0].reason, reason);
  assert.doesNotMatch(r.out + r.err, /linha2|\x1b|vermelho/);
});

test("reinit: baseline só no HEAD (arquivo removido da árvore) é a base, e o arquivo é recriado", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  git(root, "add", "-A"); git(root, "commit", "-qm", "base");
  const otherBefore = entriesOf(root, "std-other");
  rmSync(BL(root));
  writeFileSync(LINTER(root), LINT_MIGRADO);
  assert.equal(await reinit(root, "std-demo", "--reason", "linter migrado"), 0);
  assert.ok(existsSync(BL(root)));
  assert.deepEqual(entriesOf(root, "std-other"), otherBefore);
  assert.equal(run(root, "check", "--all").status, 0);
});

test("reinit: linter do alvo em protocolo legado → funciona e avisa", async () => {
  const root = legacyRepo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/third.js"), "console.log(1);\n");
  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "arquivo novo aceito", "--allow-new-paths"));
  assert.equal(r.code, 0, r.err);
  assert.equal(legacyWarnings(r.err).length, 1, r.err);
  assert.equal(entriesOf(root, "std-demo").length, 3);
});
```

Em `tests/lib/test-standards-ratchet-bash.mjs`, no teste "a razão diz o que casou e não carrega texto do comando", logo depois da asserção `assert.match(eject, /Casou: devflow-standards eject\.$/);`:

```js
  const reinit = decideRatchet({ tool_name: "Bash", cwd: "/p", tool_input: { command: 'node x/devflow-standards.mjs baseline reinit std-a --reason "x"' } });
  assert.match(reinit, /Casou: devflow-standards baseline\.$/);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/integration/test-standards-check-cli.mjs`
Expected: os dezoito testes `reinit:` FALHAM porque o subcomando não existe: `cmdBaseline` cai no uso genérico de `baseline` e devolve 2. Os que esperam 0 ou 3 falham no código de saída; os que esperam 2 falham na mensagem, porque o uso genérico não traz `baseline reinit <std-id> --reason`, `terminal interativo`, `sem baseline para refazer`, `não encontrado`, `nenhum linter rodou` nem a lista de caminhos. Os testes antigos continuam passando.

Run: `node --test tests/lib/test-standards-ratchet-bash.mjs`
Expected: PASS. A asserção nova passa de primeira: o guard já casa qualquer subcomando de `baseline`. Ela fixa esse comportamento; se falhar, pare e relate, porque a spec parte dele.

- [ ] **Step 3: Implementação mínima**

Em `scripts/lib/standards-check-cli.mjs`:

1. Acrescente `reinitStandard` ao import de `./standards-baseline.mjs`.

2. No comentário de cabeçalho, troque a frase

   ```js
   // Catraca sob o operador (D6): `baseline init`, `baseline accept` e `enforce` para baixo
   ```

   por

   ```js
   // Catraca sob o operador (D6): `baseline init`, `baseline accept`, `baseline reinit` e `enforce` para baixo
   ```

3. Logo abaixo de `const FP_RE = /^[0-9a-f]{40}$/;`:

   ```js
   const STD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
   const REASON_MAX = 500;
   const REINIT_USAGE = `uso: baseline reinit <std-id> --reason "<justificativa>" [--allow-new-paths] (um standard por vez; <std-id> só com letras, dígitos, ponto, hífen e sublinhado; justificativa obrigatória, até ${REASON_MAX} caracteres)`;
   ```

4. Em `cmdBaseline`, depois do ramo `accept` e antes da linha de uso final:

   ```js
     if (action === "reinit") {
       const rest = args.slice(1);
       const ids = positional(rest);
       const id = ids[0];
       const reason = opt(rest, "--reason");
       const unknown = rest.some(a => a.startsWith("--") && a !== "--reason" && !a.startsWith("--reason=") && a !== "--allow-new-paths");
       // Validado ANTES de recusar ou imprimir, como o fp do accept: id, justificativa e opções
       // vêm do agente e iriam parar num comando que o humano cola no terminal. Qualquer coisa
       // fora do esperado → exit 2 sem ecoar o valor. Opção desconhecida não é ignorada:
       // `--dry-run` gravaria.
       if (unknown || ids.length !== 1 || !STD_ID_RE.test(id) || !reason || !reason.trim() || reason.length > REASON_MAX) {
         console.error(REINIT_USAGE);
         return 2;
       }
       if (!isInteractive()) return refuseNonInteractive(`baseline reinit ${id} --reason "…"`);
       const { baseline: bl } = resolveBaseline(root); // BaselineError → 3 (runStandardsCommand)
       if (!bl) {
         console.error(`sem baseline para refazer: o operador registra o legado com ${pluginCmd()} baseline init`);
         return 2;
       }
       // Igualdade estrita: um std com `id: [std-x]` não pode casar o alvo por coerção.
       const isTarget = (s) => typeof s.id === "string" && s.id === id;
       if (!loadEffectiveStandards(root).some(isTarget)) {
         console.error(`standard ${id} não encontrado`);
         return 2;
       }
       // Só o linter do alvo roda: as entradas dos outros standards não mudam, e um linter
       // quebrado de outro standard não impede a operação. Erro no do alvo fecha antes de gravar.
       const r = await checkFiles({ projectRoot: root, files: allFiles(root), baseline: null, stdFilter: isTarget });
       if (r.errors.length) { reportErrors(r.errors); return 3; }
       // "Não rodou" não é "sem achados": sem linter, ou com applyTo que não casa nada, refazer
       // zeraria as entradas do standard.
       if (r.linterRuns === 0) {
         console.error(`recusado: nenhum linter rodou para ${id} (standard sem linter, ou o applyTo não casa nenhum arquivo). Sem execução não há o que refazer; para tirar entradas que sobraram, use ${pluginCmd()} baseline prune`);
         return 2;
       }
       const all = [...r.blocking, ...r.warnings, ...r.review];
       warnLegacyLinters(root, all);
       const out = reinitStandard(bl, all, id, { reason, by: who() });
       if (!out.changed) {
         console.log(`✓ ${id}: nada a refazer (${out.kept.entries} entrada(s) mantida(s); ${r.linterRuns} execução(ões) de linter)`);
         return 0;
       }
       // Migração de mensagem ou de regra não cria caminho novo; arquivo que não tinha entrada
       // do standard só entra com a flag, depois de o operador ver a lista. Sem teto de linhas.
       if (out.newPaths.length && !rest.includes("--allow-new-paths")) {
         console.error(`recusado: ${out.newPaths.length} caminho(s) com achado de ${id} não tinham nenhuma entrada deste standard no baseline:`);
         for (const p of out.newPaths) console.error(`  ${logPath(p)}`);
         console.error("Migração de mensagem ou de regra não cria caminho novo. Confira os arquivos; para aceitá-los, repita o comando com --allow-new-paths. Nada foi gravado.");
         return 2;
       }
       // Outro comando pode ter gravado enquanto os linters rodavam: gravar por cima apagaria o
       // que ele aceitou.
       if (JSON.stringify(resolveBaseline(root).baseline) !== JSON.stringify(bl)) {
         console.error("erro: o baseline mudou durante a execução (outro comando gravou); nada foi gravado. Rode de novo.");
         return 3;
       }
       saveBaseline(root, out.baseline);
       const n = (t) => `${t.entries} entrada(s) (${t.count} ocorrência(s))`;
       console.log(`✓ ${id}: baseline refeito — mantidas ${n(out.kept)}; novas ${n(out.added)}; alteradas ${n(out.altered)}; removidas ${n(out.removed)}`);
       console.log(`  ${r.linterRuns} execução(ões) de linter`);
       for (const [rule, c] of out.byRule) console.log(`  regra ${oneLine(rule)}: ${c}`);
       for (const p of out.newPaths) console.log(`  caminho novo: ${logPath(p)}`);
       for (const [p, a, b] of out.grownPaths) console.log(`  cresceu: ${logPath(p)} (${a} → ${b})`);
       return 0;
     }
   ```

5. Troque a linha de uso final de `cmdBaseline`

   ```js
     console.error("uso: baseline init | prune | accept <fp> --reason \"<justificativa>\"");
   ```

   por

   ```js
     console.error("uso: baseline init | prune | accept <fp> --reason \"<justificativa>\" | reinit <std-id> --reason \"<justificativa>\"");
   ```

Em `scripts/devflow-standards.mjs`, logo depois da linha de ajuda

```js
  console.error("  baseline init|prune|accept <fp> --reason \"<texto>\"   Catraca (init/accept: só no terminal do operador)");
```

acrescente

```js
  console.error("  baseline reinit <id> --reason \"<texto>\" [--allow-new-paths]  Refaz as entradas de UM standard (só no terminal do operador)");
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/integration/test-standards-check-cli.mjs tests/lib/test-standards-ratchet-bash.mjs tests/lib/test-standards-baseline.mjs tests/lib/test-standards-engine.mjs`
Expected: PASS em todos.

Se algum teste antigo comparar o texto exato da linha de uso de `baseline`, ele falha aqui: ajuste a expectativa para o texto novo, sem remover a asserção, e relate.

- [ ] **Step 5: Rodar os sinais**

Run: `bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-lint.sh`
Expected: exit 0 nos três. Relate pelo nome qualquer falha, mesmo que não seja desta task.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(standards): baseline reinit refaz o baseline de um standard" \
  -- scripts/lib/standards-check-cli.mjs scripts/devflow-standards.mjs \
     tests/integration/test-standards-check-cli.mjs tests/lib/test-standards-ratchet-bash.mjs
```

---

### Task 4: documentação

**Agent:** documentation-writer
**Tests:** os sinais existentes (há testes que leem o guia e o CHANGELOG)

**Files:**
- Modify: `docs/guia-enforcement-standards.md`
- Modify: `CHANGELOG.md` (seção `## [Unreleased]`)
- Modify: `docs/superpowers/2026-10-06-standards-enforcement-pendencias.md`
- Modify: `.context/engineering/adrs/015-deterministic-standards-enforcement-v1.1.0.md`

**Interfaces:**
- Consumes: o comportamento entregue nas Tasks 1 a 3.
- Produces: nada que outra task use.

- [ ] **Step 1: Guia — tabela de comandos**

Troque a linha do `accept`:

```markdown
| `baseline accept <fp> --reason "…"` | Único caminho para **aumentar** o baseline. Exige justificativa (fica registrada). `<fp>` é a impressão digital que aparece no `check --json` |
```

por

```markdown
| `baseline accept <fp> --reason "…"` | **Aumenta** o baseline em uma ocorrência. Exige justificativa (fica registrada). `<fp>` é a impressão digital que aparece no `check --json` |
| `baseline reinit <std> --reason "…" [--allow-new-paths]` | Refaz as entradas de **um** standard com os achados atuais. As que não mudaram ficam intactas, e as dos outros standards não são tocadas. É o caminho quando o linter do standard mudou de regra ou de mensagem. Arquivo que não tinha nenhuma entrada do standard só entra com `--allow-new-paths`; sem a flag o comando lista esses arquivos e não grava. Confira no relato os caminhos novos e os que ganharam ocorrências: é ali que aparece o que você está aceitando |
```

- [ ] **Step 2: Guia — frase do terminal interativo**

Troque

```markdown
**`baseline init`, `baseline accept` e o rebaixamento de nível só rodam num terminal interativo**
```

por

```markdown
**`baseline init`, `baseline accept`, `baseline reinit` e o rebaixamento de nível só rodam num terminal interativo**
```

- [ ] **Step 3: Guia — limite do protocolo legado**

No item "Com linter em protocolo legado, a catraca conta por arquivo", troque o fim

```markdown
  nova, as entradas antigas ficam órfãs e o gate acusa "linter alterado" no PR da troca. Esse PR
  só passa refazendo o aceite e com o override do dono (GitHub); no GitLab o job fica vermelho.
```

por

```markdown
  nova, as entradas antigas ficam órfãs e o gate acusa "linter alterado" no PR da troca. Esse PR
  só passa refazendo o aceite e com o override do dono (GitHub); no GitLab o job fica vermelho.
  Para refazer o aceite de uma vez, o operador roda `baseline reinit <std> --reason "…"` no
  terminal dele. Nessa troca específica, do protocolo antigo para o v2, as ocorrências por
  arquivo crescem (o antigo registrava uma por arquivo): o comando mostra cada caminho com o
  antes e o depois, mas não tem como separar esse crescimento de uma violação nova no mesmo
  arquivo. Quem aprova o override confere pelo diff do PR.
```

- [ ] **Step 4: Guia — nota de migração**

No passo 4 da "Nota de migração", troque o fim

```markdown
   importa:** trocar o linter depois do `baseline init` muda todas as impressões digitais do
   standard, tudo o que estava aceito volta como violação nova e o gate acusa "linter
   alterado".
```

por

```markdown
   importa:** trocar o linter depois do `baseline init` muda todas as impressões digitais do
   standard, tudo o que estava aceito volta como violação nova e o gate acusa "linter
   alterado". Se o baseline já existe, refaça o aceite daquele standard com
   `baseline reinit <std> --reason "…"` no seu terminal e leve o baseline no mesmo PR da troca
   do linter; o PR continua precisando do override do dono.
```

- [ ] **Step 5: CHANGELOG**

Logo abaixo de `## [Unreleased]`:

```markdown
### Added — `baseline reinit`: refazer o baseline de um standard

Quando o linter de um standard muda de regra ou de mensagem, todas as impressões digitais dele mudam: o que estava aceito volta como violação nova e as entradas antigas ficam órfãs. Não havia caminho razoável para isso, porque o `baseline init` recusa quando já existe baseline e o `baseline accept` sobe uma ocorrência por chamada.

`devflow-standards baseline reinit <std-id> --reason "<justificativa>" [--allow-new-paths]` refaz as entradas daquele standard com os achados atuais. As entradas que não mudaram ficam intactas, com a justificativa que tinham, e as dos outros standards não são tocadas. Só roda no terminal interativo do operador, fora de CI, e exige justificativa, registrada nas entradas novas e alteradas.

- **Caminho novo é recusado por padrão.** Violação em arquivo que não tinha nenhuma entrada do standard só entra com `--allow-new-paths`; sem a flag o comando lista os arquivos e não grava. Migração de mensagem ou de regra não cria caminho novo.
- **O relato mostra o que está sendo aceito:** entradas mantidas, novas, alteradas e removidas, a contagem por regra, os caminhos novos e os que ganharam ocorrências (antes → depois).
- **Falha fechado:** linter do standard fora do contrato ou baseline alterado durante a execução saem com 3; standard cujo linter não rodou em nenhum arquivo sai com 2, apontando o `prune`. Opção desconhecida é uso incorreto. Em nenhum desses casos o arquivo é gravado.

No CI nada muda: o PR com o baseline refeito aumenta entradas e continua precisando do override do dono no GitHub; no GitLab o job segue vermelho. O `checkFiles` do engine passa a informar quantas execuções de linter despachou (`linterRuns`), campo novo também no `check --json`.

Limite conhecido: na troca de um linter do protocolo antigo para o v2, as ocorrências por arquivo crescem legitimamente, e uma violação nova num arquivo que já tinha entrada aparece só como crescimento.

Decisão: [ADR-015 v1.1.0](.context/engineering/adrs/015-deterministic-standards-enforcement-v1.1.0.md) (voltou a `Proposto` com a evolução; reaprovação do dono do projeto pendente) · desenho: [spec](docs/superpowers/specs/2026-10-08-baseline-reinit-standard-design.md).
```

- [ ] **Step 6: Pendências**

Em `docs/superpowers/2026-10-06-standards-enforcement-pendencias.md`:

a) §2, no item "Migrar os linters que o plugin ainda entrega no protocolo antigo", troque a última frase

```markdown
  arquivo que já tem uma aceita não bloqueia. O `check` e o `baseline init` avisam quando isso
  acontece.
```

por

```markdown
  arquivo que já tem uma aceita não bloqueia. O `check` e o `baseline init` avisam quando isso
  acontece. A migração troca regra e mensagem desses linters; o projeto que já tem baseline
  refaz o aceite de cada standard com `baseline reinit <std> --reason "…"`.
```

b) No fim do arquivo, uma seção nova:

```markdown

## 8. Apontado na revisão do `baseline reinit`

Achados da revisão de segurança do `baseline reinit` (outubro de 2026) em código anterior a ele.
Todos demonstrados por execução numa cópia do repositório.

- **O log do gate esconde entradas além da 200ª linha.** O `gate` lista no máximo 200 linhas de
  baseline, na ordem da impressão digital, que depende do caminho. Num PR que regrava um
  standard com mais de 200 entradas, quem escolhe o nome do arquivo consegue deixar a entrada
  plantada fora do log, e com o override do dono aprovado o gate sai 0 sem citá-la
  (`scripts/lib/standards-check-cli.mjs`, `GATE_MAX_BASELINE_LINES`). Quem aprova ainda vê o
  arquivo no diff do PR. Correção sugerida: listar primeiro, e sem teto, os caminhos que não
  tinham entrada daquele standard na base.
- **O `enforce` ecoa o id sem validar.** Com um standard cujo id traga texto de comando, a
  recusa por falta de terminal imprime esse texto na linha que o humano é convidado a colar; e
  "standard … não encontrado" repete ESC e quebra de linha no stderr. O `reinit` valida o
  formato antes de qualquer eco; o `enforce` pode usar a mesma expressão.
- **`baseline init`, `prune`, `accept` e `enforce` ignoram opção desconhecida.**
  `baseline init --dry-run` cria o baseline. `check`, `gate` e `reinit` recusam.
- **Arquivo não rastreado entra no baseline e trava o PR.** `init` e `reinit` analisam também os
  arquivos não rastreados; um rascunho local com violação ganha entrada, e o gate reprova o PR
  por crédito pré-pago ("aceita 1, a árvore tem 0"), mesmo com o override. Sugestão: avisar os
  caminhos não rastreados que ganharam entrada.
- **Linter que falha depois de imprimir parte dos achados é execução válida.** Se ele sai com 1
  e já imprimiu linhas `VIOLATION`, o contrato de saída o aceita, e `init`, `accept` e `reinit`
  registram só o que foi impresso.
- **Baseline "do HEAD" lido de outro repositório.** Com `GIT_DIR` apontando para outro
  repositório no ambiente do operador e o baseline ausente da árvore, a versão "do HEAD" vem de
  lá. Exige controlar o ambiente de quem roda o comando.
```

- [ ] **Step 7: ADR-015 v1.1.0 — acompanhar as decisões da revisão**

Em `.context/engineering/adrs/015-deterministic-standards-enforcement-v1.1.0.md`:

a) Na decisão "Baseline com catraca", troque

```markdown
  no terminal dele, por `baseline accept --reason` (uma ocorrência) ou `baseline reinit <std>
  --reason` (troca as entradas de um standard pelos achados atuais; as dos outros não mudam).
```

por

```markdown
  no terminal dele, por `baseline accept --reason` (uma ocorrência) ou `baseline reinit <std>
  --reason` (refaz as entradas de um standard com os achados atuais; as que não mudaram e as
  dos outros standards ficam intactas; arquivo sem entrada anterior só entra com
  `--allow-new-paths`).
```

b) Em "Riscos aceitos", troque o item que começa com "O `baseline reinit` registra todos os achados atuais do standard" por

```markdown
- O `baseline reinit` aceita em massa: registra os achados atuais do standard, inclusive violação nova. Arquivo sem entrada anterior do standard exige `--allow-new-paths` e é listado; violação nova em arquivo que já tinha entrada aparece só como crescimento, e na troca de um linter do protocolo antigo para o v2 esse crescimento é indistinguível do legítimo. Os controles são o operador no terminal e, no CI, o override do dono, que o aumento de entradas continua exigindo
```

c) Em "Guardrails", troque o item que começa com "SEMPRE exigir terminal interativo e justificativa no `baseline reinit`" por

```markdown
- SEMPRE exigir no `baseline reinit` terminal interativo, justificativa e, para aceitar achado em arquivo sem entrada anterior do standard, a flag `--allow-new-paths`; NUNCA deixá-lo alterar entrada de outro standard, regravar entrada que não mudou, nem gravar quando o linter do standard alvo saiu do contrato ou não rodou, ou quando o baseline mudou durante a execução.
```

d) Em "Enforcement", troque o item do `baseline reinit` por

```markdown
- [x] Teste: `baseline reinit` — propriedade (entradas dos outros standards idênticas; entrada que não mudou fica intacta) e CLI (recusa sem terminal, em CI, sem baseline, com argumento ou opção inválidos, com standard desconhecido, sem execução de linter e com caminho novo sem a flag; erro de linter e baseline alterado durante a execução não gravam) em `tests/lib/test-standards-baseline.mjs` e `tests/integration/test-standards-check-cli.mjs`.
```

- [ ] **Step 8: Rodar os sinais**

Run: `bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-e2e.sh && bash tests/run-lint.sh`
Expected: exit 0 nos quatro.

- [ ] **Step 9: Commit**

```bash
git commit -m "docs(standards): documenta o baseline reinit" \
  -- docs/guia-enforcement-standards.md CHANGELOG.md \
     docs/superpowers/2026-10-06-standards-enforcement-pendencias.md \
     .context/engineering/adrs/015-deterministic-standards-enforcement-v1.1.0.md
```

---

## Depois das tasks

- Fase V: os cinco sinais pelo `verify-run` e o `verify-gate`; a auditoria da ADR tocada; e a revisão de segurança da implementação, reexecutando contra o código real as provas de conceito da fase R.
- A reaprovação da ADR-015 v1.1.0 é do dono do projeto; enquanto ela está em `Proposto`, as guardrails dela não são carregadas no início da sessão.
- O subprojeto 2 (migração dos 21 linters) começa depois do merge deste, com spec própria.
