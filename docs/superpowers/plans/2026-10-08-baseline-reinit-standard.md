# `baseline reinit` — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** `baseline-reinit-standard` | **Escala:** MEDIUM | **Fase:** P→R

**Goal:** Dar ao operador um subcomando que troca as entradas de um standard no baseline pelos achados atuais, sem tocar nas dos outros.

**Architecture:** Uma função pura em `standards-baseline.mjs` calcula o baseline novo e o resumo. Um ramo `reinit` em `cmdBaseline` valida, roda só o linter do standard alvo pelo `stdFilter` do engine, chama a função pura e grava com o `saveBaseline` existente. Nenhum módulo novo; gate do CI e guards não mudam.

**Tech Stack:** Node (ESM, `node:test`, `node:assert/strict`), sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-08-baseline-reinit-standard-design.md`

**Agents:** test-writer e backend-specialist (Tasks 1 e 2), documentation-writer (Task 3); security-auditor na fase R (prova de conceito) e na V.

```yaml
requiredSignals: [unit, integration, e2e, lint]
```

O sinal `standards` entra na fase V pela regra da ADR-013 (o repositório tem standard que pode chegar a `block`).

## Global Constraints

- Interface: `devflow-standards baseline reinit <std-id> --reason "<justificativa>"`.
- Exit 0 quando grava ou quando não há diferença; 2 para uso incorreto ou ação recusada; 3 para erro de execução.
- `<std-id>` casa `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`. Valor fora do formato nunca é ecoado. A justificativa nunca é ecoada.
- Ordem das pré-condições: argumentos válidos → terminal interativo e fora de CI → baseline existe → standard efetivo.
- Roda só o linter do standard alvo. Erro de linter: exit 3 e nada gravado.
- Entradas dos outros standards: mesmos campos, mesma ordem.
- Sem diferença em impressões digitais e contagens do standard: não grava.
- Mensagens do CLI em pt-BR, no estilo das existentes.
- TDD: cada teste é visto falhar antes do código. Nenhum teste existente é removido ou afrouxado.
- Git: commit por pathspec (`git commit -- <arquivos>`), nunca `git add -A` nem `git add .`. `.gitignore` e `.context/workflow/.checkpoint/last.json` têm mudanças locais do operador e não entram em commit. Sem `push`, `gh`, PR ou merge durante a execução das tasks.
- Repositório público: nenhum nome de projeto privado em código, teste, doc ou mensagem de commit.

## Review Focus

Entradas e condições que a spec implica e que um operador vai encontrar. Cada uma tem teste na task dona do código.

1. **Dois ids na mesma chamada** (`reinit std-a std-b`): quem digita espera erro, não que só o primeiro seja refeito. Recusa com uso, exit 2 (Task 2, teste "argumentos").
2. **Justificativa com quebra de linha ou sequência ANSI:** fica gravada como veio e não aparece na saída (Task 2, teste "justificativa").
3. **Baseline removido da árvore mas versionado no HEAD:** o comando parte do baseline do HEAD e recria o arquivo (Task 2, teste "HEAD").
4. **Standard alvo sem nenhum achado atual:** as entradas dele saem todas; não é erro (Task 1, teste "sem achados").
5. **Linter do alvo ainda no protocolo antigo:** o comando funciona e emite o aviso de protocolo legado (Task 2, teste "legado").

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/lib/standards-baseline.mjs` | Nova função exportada `reinitStandard` |
| `scripts/lib/standards-check-cli.mjs` | Ramo `reinit` em `cmdBaseline`; texto de uso; comentário de cabeçalho |
| `scripts/devflow-standards.mjs` | Linha de ajuda do subcomando `baseline` |
| `tests/lib/test-standards-baseline.mjs` | Testes unit da função pura |
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
- Consumes: `initBaseline(findings, { by })`, `countBy(findings) → Map<fp, number>` e `BASELINE_VERSION`, já no módulo.
- Produces:
  ```js
  reinitStandard(baseline, findings, stdId, { reason, by })
  // → { baseline, changed: boolean,
  //     removed: { entries: number, count: number },
  //     added:   { entries: number, count: number, byRule: Record<string, number> } }
  ```
  Lança `Error` sem justificativa. Com `changed === false`, devolve o MESMO objeto `baseline` recebido.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/lib/test-standards-baseline.mjs`, acrescente `reinitStandard` à lista de imports de `../../scripts/lib/standards-baseline.mjs` e, no fim do arquivo:

```js
test("reinit: troca só as entradas do standard alvo, com contagem, justificativa e autor", () => {
  const keepA = f({ stdId: "std-a", message: "a1" });
  const oldB = f({ stdId: "std-b", message: "antiga" });
  const bl = initBaseline([keepA, oldB, oldB], { by: "ana" });
  const n1 = f({ stdId: "std-b", message: "nova", line: 3 });
  const n2 = f({ stdId: "std-b", message: "nova", line: 9 });
  const n3 = f({ stdId: "std-b", ruleId: "s", message: "outra" });
  const out = reinitStandard(bl, [keepA, n1, n2, n3], "std-b", { reason: "linter migrado", by: "bia" });
  assert.equal(out.changed, true);
  assert.deepEqual(out.baseline.entries[0], bl.entries[0]);
  const b = out.baseline.entries.filter(e => e.stdId === "std-b");
  assert.deepEqual(b.map(e => [e.fp, e.count]), [[n1.fp, 2], [n3.fp, 1]]);
  assert.ok(b.every(e => e.reason === "linter migrado" && e.acceptedBy === "bia" && e.acceptedAt));
  assert.ok(!out.baseline.entries.some(e => e.fp === oldB.fp));
  assert.deepEqual(out.removed, { entries: 1, count: 2 });
  assert.deepEqual(out.added, { entries: 2, count: 3, byRule: { r: 2, s: 1 } });
  assert.doesNotThrow(() => parseBaseline(JSON.stringify(out.baseline)));
});

test("reinit: as entradas dos outros standards saem idênticas e na mesma ordem (propriedade)", () => {
  let seed = 42;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const mk = () => f({ stdId: `std-${"abc"[rnd(3)]}`, ruleId: `r${rnd(3)}`, path: `src/f${rnd(4)}.ts`, message: `m${rnd(5)}` });
  for (let round = 0; round < 200; round++) {
    const bl = initBaseline(Array.from({ length: rnd(12) }, mk), { by: "ana" });
    const now = Array.from({ length: rnd(12) }, mk);
    const target = `std-${"abc"[rnd(3)]}`;
    const out = reinitStandard(bl, now, target, { reason: "x", by: "bia" });
    const others = (b) => b.entries.filter(e => e.stdId !== target);
    assert.deepEqual(others(out.baseline), others(bl), `rodada ${round}`);
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
  assert.deepEqual(out.removed, { entries: 1, count: 1 });
  assert.deepEqual(out.added, { entries: 0, count: 0, byRule: {} });
});

test("reinit: sem diferença devolve o mesmo baseline e changed false", () => {
  const a = f({ stdId: "std-a" }), b = f({ stdId: "std-b" });
  const bl = initBaseline([a, b, b], { by: "ana" });
  const out = reinitStandard(bl, [b, a, b], "std-b", { reason: "x", by: "bia" });
  assert.equal(out.changed, false);
  assert.equal(out.baseline, bl);
  assert.deepEqual(out.added, { entries: 1, count: 2, byRule: { r: 2 } });
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
// Refaz as entradas de UM standard com os achados atuais (operador, D6). As dos outros standards
// saem como entraram — mesmos objetos, mesma ordem. Sem diferença em fp/contagem, devolve o
// próprio baseline recebido: o chamador não grava, e o arquivo não ganha um diff só de datas.
export function reinitStandard(baseline, findings, stdId, { reason, by } = {}) {
  if (!reason || !String(reason).trim()) throw new Error("baseline reinit exige justificativa (--reason)");
  const id = String(stdId);
  const mine = findings.filter(x => String(x.stdId) === id);
  const before = new Map(baseline.entries.filter(e => String(e.stdId) === id).map(e => [e.fp, e.count]));
  const now = countBy(mine);
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  const byRule = {};
  for (const x of mine) byRule[x.ruleId] = (byRule[x.ruleId] || 0) + 1;
  const changed = before.size !== now.size || [...now].some(([fp, c]) => before.get(fp) !== c);
  const summary = {
    changed,
    removed: { entries: before.size, count: sum(before) },
    added: { entries: now.size, count: mine.length, byRule },
  };
  if (!changed) return { baseline, ...summary };
  const fresh = initBaseline(mine, { by }).entries.map(e => ({ ...e, reason }));
  return {
    baseline: { version: BASELINE_VERSION, entries: [...baseline.entries.filter(e => String(e.stdId) !== id), ...fresh] },
    ...summary,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/lib/test-standards-baseline.mjs`
Expected: PASS em todos, inclusive os cinco novos; nenhum teste antigo quebrado.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(standards): reinitStandard refaz as entradas de um standard no baseline" \
  -- scripts/lib/standards-baseline.mjs tests/lib/test-standards-baseline.mjs
```

---

### Task 2: subcomando `baseline reinit` no CLI

**Agent:** test-writer → backend-specialist
**Tests:** integration (CLI real por `spawnSync`) + unit do guard de Bash

**Files:**
- Modify: `scripts/lib/standards-check-cli.mjs` (import, ramo em `cmdBaseline`, texto de uso, comentário de cabeçalho)
- Modify: `scripts/devflow-standards.mjs` (linha de ajuda de `baseline`)
- Test: `tests/integration/test-standards-check-cli.mjs` (no fim do arquivo)
- Test: `tests/lib/test-standards-ratchet-bash.mjs`

**Interfaces:**
- Consumes: `reinitStandard` (Task 1); `checkFiles({ projectRoot, files, baseline, stdFilter })`, `allFiles(root)`, `resolveBaseline(root)`, `loadEffectiveStandards(root)`, `saveBaseline`, `positional`, `opt`, `oneLine`, `who`, `pluginCmd`, `refuseNonInteractive`, `reportErrors`, `warnLegacyLinters`, já no módulo.
- Produces: `runStandardsCommand("baseline", ["reinit", <std-id>, "--reason", <texto>], root, { isInteractive })` → `0 | 2 | 3`.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/integration/test-standards-check-cli.mjs`:

```js
// ── baseline reinit ──────────────────────────────────────────────────────────────────────
const LINT_WORSE = LINT_BAD.replaceAll("BAD", "WORSE").replace("no-bad", "no-worse");
const REINIT_USO = /uso: .*baseline reinit <std-id> --reason/;

// Dois standards do projeto: std-demo (no-bad) e std-other (no-worse), os dois em block.
function twoStdRepo() {
  const root = repo();
  const std = join(root, ".context/engineering/standards");
  writeFileSync(join(std, "std-other.md"),
    `---\nid: std-other\nsource: local\ndescription: outro\napplyTo: ["src/**"]\nenforcement:\n  linter: engineering/standards/machine/std-other.js\n  level: block\n---\n## Princípios\n- sem WORSE\n`);
  writeFileSync(join(std, "machine/std-other.js"), LINT_WORSE);
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
  writeFileSync(LINTER(root), LINT_BAD.replace("remova BAD", "tire o BAD")); // linter muda a mensagem
  assert.equal(run(root, "check", "--all").status, 1, "o aceito volta como violação nova");

  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "linter migrado"));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /std-demo: baseline refeito — saíram 1 entrada\(s\) \(1 ocorrência\(s\)\); entraram 1 entrada\(s\) \(1 ocorrência\(s\)\)/);
  assert.match(r.out, /no-bad: 1/);
  assert.equal(run(root, "check", "--all").status, 0);
  assert.deepEqual(entriesOf(root, "std-other"), otherBefore);
  const demo = entriesOf(root, "std-demo");
  assert.equal(demo.length, 1);
  assert.equal(demo[0].reason, "linter migrado");
  assert.match(demo[0].message, /tire o BAD/);
  assert.ok(demo[0].acceptedBy && demo[0].acceptedAt);
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
  writeFileSync(LINTER(root), LINT_BAD.replace("remova BAD", "tire o BAD"));
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

test("reinit: argumentos — sem id, sem --reason, justificativa em branco ou dois ids → uso (exit 2)", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  const before = readFileSync(BL(root), "utf8");
  for (const args of [[], ["std-demo"], ["std-demo", "--reason", "   "], ["--reason", "x"], ["std-demo", "std-other", "--reason", "x"]]) {
    const r = await captureErr(() => reinit(root, ...args));
    assert.equal(r.code, 2, JSON.stringify(args));
    assert.match(r.err, REINIT_USO, JSON.stringify(args));
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

test("reinit: linter quebrado de OUTRO standard não impede a operação", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_BAD.replace("remova BAD", "tire o BAD"));
  writeFileSync(join(root, ".context/engineering/standards/machine/std-other.js"), "process.exit(7)");
  const otherBefore = entriesOf(root, "std-other");
  assert.equal(await reinit(root, "std-demo", "--reason", "linter migrado"), 0);
  assert.deepEqual(entriesOf(root, "std-other"), otherBefore);
  assert.match(entriesOf(root, "std-demo")[0].message, /tire o BAD/);
});

test("reinit: justificativa fica gravada como veio e não aparece na saída", async () => {
  const root = twoStdRepo();
  await human(root, "baseline", "init");
  writeFileSync(LINTER(root), LINT_BAD.replace("remova BAD", "tire o BAD"));
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
  writeFileSync(LINTER(root), LINT_BAD.replace("remova BAD", "tire o BAD"));
  assert.equal(await reinit(root, "std-demo", "--reason", "linter migrado"), 0);
  assert.ok(existsSync(BL(root)));
  assert.deepEqual(entriesOf(root, "std-other"), otherBefore);
  assert.equal(run(root, "check", "--all").status, 0);
});

test("reinit: linter do alvo em protocolo legado → funciona e avisa", async () => {
  const root = legacyRepo();
  await human(root, "baseline", "init");
  writeFileSync(join(root, "src/third.js"), "console.log(1);\n");
  const r = await captureAll(() => reinit(root, "std-demo", "--reason", "arquivo novo aceito"));
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
Expected: os treze testes `reinit:` FALHAM porque o subcomando não existe: `cmdBaseline` cai no uso genérico de `baseline` e devolve 2. Os que esperam 0 ou 3 falham no código de saída; os que esperam 2 falham na mensagem, porque o uso genérico não traz `baseline reinit <std-id> --reason`, `terminal interativo`, `sem baseline para refazer` nem `não encontrado`. Os testes antigos continuam passando.

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
   const REINIT_USAGE = 'uso: baseline reinit <std-id> --reason "<justificativa>" (um standard por vez; a justificativa é obrigatória)';
   ```

4. Em `cmdBaseline`, depois do ramo `accept` e antes da linha de uso final:

   ```js
     if (action === "reinit") {
       const ids = positional(args.slice(1));
       const id = ids[0];
       const reason = opt(args, "--reason");
       // Validado ANTES de recusar ou imprimir, como o fp do accept: o id vem do agente e iria
       // parar num comando que o humano cola no terminal. Inválido → exit 2 sem ecoar o valor.
       if (ids.length !== 1 || !STD_ID_RE.test(id) || !reason || !reason.trim()) {
         console.error(REINIT_USAGE);
         return 2;
       }
       if (!isInteractive()) return refuseNonInteractive(`baseline reinit ${id} --reason "…"`);
       const { baseline: bl } = resolveBaseline(root); // BaselineError → 3 (runStandardsCommand)
       if (!bl) {
         console.error(`sem baseline para refazer: o operador registra o legado com ${pluginCmd()} baseline init`);
         return 2;
       }
       if (!loadEffectiveStandards(root).some(s => String(s.id) === id)) {
         console.error(`standard ${id} não encontrado`);
         return 2;
       }
       // Só o linter do alvo roda: as entradas dos outros standards não mudam, e um linter
       // quebrado de outro standard não impede a operação. Erro no do alvo fecha antes de gravar.
       const r = await checkFiles({ projectRoot: root, files: allFiles(root), baseline: null, stdFilter: (s) => String(s.id) === id });
       if (r.errors.length) { reportErrors(r.errors); return 3; }
       const all = [...r.blocking, ...r.warnings, ...r.review];
       warnLegacyLinters(root, all);
       const out = reinitStandard(bl, all, id, { reason, by: who() });
       if (!out.changed) {
         console.log(`✓ ${id}: nada a refazer (o baseline já corresponde aos achados atuais)`);
         return 0;
       }
       saveBaseline(root, out.baseline);
       console.log(`✓ ${id}: baseline refeito — saíram ${out.removed.entries} entrada(s) (${out.removed.count} ocorrência(s)); entraram ${out.added.entries} entrada(s) (${out.added.count} ocorrência(s))`);
       for (const rule of Object.keys(out.added.byRule).sort()) console.log(`  ${oneLine(rule)}: ${out.added.byRule[rule]}`);
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

Em `scripts/devflow-standards.mjs`, troque a linha de ajuda

```js
  console.error("  baseline init|prune|accept <fp> --reason \"<texto>\"   Catraca (init/accept: só no terminal do operador)");
```

por

```js
  console.error("  baseline init|prune|accept <fp> --reason \"<texto>\"   Catraca (init/accept: só no terminal do operador)");
  console.error("  baseline reinit <id> --reason \"<texto>\"       Refaz as entradas de UM standard (só no terminal do operador)");
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/integration/test-standards-check-cli.mjs tests/lib/test-standards-ratchet-bash.mjs tests/lib/test-standards-baseline.mjs`
Expected: PASS em todos.

Se o teste "uso incorreto" de algum subcomando antigo comparar o texto exato da linha de uso de `baseline`, ele falha aqui: ajuste a expectativa para o texto novo, sem remover a asserção, e relate.

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

### Task 3: documentação

**Agent:** documentation-writer
**Tests:** os sinais existentes (há testes que leem o guia e o CHANGELOG)

**Files:**
- Modify: `docs/guia-enforcement-standards.md`
- Modify: `CHANGELOG.md` (seção `## [Unreleased]`)
- Modify: `docs/superpowers/2026-10-06-standards-enforcement-pendencias.md` (§2, primeiro item)
- Modify: `.context/engineering/adrs/015-deterministic-standards-enforcement-v1.1.0.md` (item de Enforcement)

**Interfaces:**
- Consumes: o comportamento entregue nas Tasks 1 e 2.
- Produces: nada que outra task use.

- [ ] **Step 1: Guia — tabela de comandos**

Troque a linha do `accept`:

```markdown
| `baseline accept <fp> --reason "…"` | Único caminho para **aumentar** o baseline. Exige justificativa (fica registrada). `<fp>` é a impressão digital que aparece no `check --json` |
```

por

```markdown
| `baseline accept <fp> --reason "…"` | **Aumenta** o baseline em uma ocorrência. Exige justificativa (fica registrada). `<fp>` é a impressão digital que aparece no `check --json` |
| `baseline reinit <std> --reason "…"` | Refaz as entradas de **um** standard com os achados atuais; as dos outros standards não mudam. É o caminho quando o linter do standard mudou de regra ou de mensagem. Exige justificativa (fica registrada em cada entrada). Registra **tudo** o que o standard acha hoje, inclusive violação nova: confira a contagem por regra que o comando imprime |
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
  terminal dele: as entradas daquele standard são trocadas pelos achados atuais e as dos outros
  ficam como estavam.
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

`devflow-standards baseline reinit <std-id> --reason "<justificativa>"` troca as entradas daquele standard pelos achados atuais e deixa as dos outros como estavam. Só roda no terminal interativo do operador, fora de CI, e exige justificativa, registrada em cada entrada nova. Roda só o linter do standard alvo; se ele falhar, o comando sai com 3 e não grava. Sem diferença, não toca no arquivo.

O comando registra tudo o que o standard acha hoje, inclusive violação nova que tenha entrado desde o último baseline: é o mesmo poder do `init`, e por isso imprime a contagem por regra do que entrou. No CI nada muda: o PR com o baseline refeito aumenta entradas e continua precisando do override do dono no GitHub; no GitLab o job segue vermelho.

Decisão: [ADR-015 v1.1.0](.context/engineering/adrs/015-deterministic-standards-enforcement-v1.1.0.md) (voltou a `Proposto` com a evolução; reaprovação do dono do projeto pendente) · desenho: [spec](docs/superpowers/specs/2026-10-08-baseline-reinit-standard-design.md).
```

- [ ] **Step 6: Pendências**

Em `docs/superpowers/2026-10-06-standards-enforcement-pendencias.md`, §2, no item "Migrar os linters que o plugin ainda entrega no protocolo antigo", troque a última frase

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

- [ ] **Step 7: ADR-015 — marcar o item de Enforcement**

Em `.context/engineering/adrs/015-deterministic-standards-enforcement-v1.1.0.md`, troque o início do item

```markdown
- [ ] Teste: `baseline reinit` — propriedade
```

por

```markdown
- [x] Teste: `baseline reinit` — propriedade
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

- Fase V: os cinco sinais pelo `verify-run` e o `verify-gate`, e a auditoria da ADR tocada.
- A reaprovação da ADR-015 v1.1.0 é do dono do projeto; enquanto ela está em `Proposto`, as guardrails dela não são carregadas no início da sessão.
- O subprojeto 2 (migração dos 21 linters) começa depois do merge deste, com spec própria.
