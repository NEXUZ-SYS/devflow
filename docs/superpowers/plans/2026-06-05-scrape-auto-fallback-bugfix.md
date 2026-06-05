# Bugfix scrape auto-fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** scrape-auto-fallback-ok-message | **Scale:** SMALL | **Phase:** P→E
> **Spec:** `docs/superpowers/specs/2026-06-05-scrape-auto-fallback-bugfix-design.md`
> **Branch:** `fix/scrape-auto-fallback-ok-message`

**Goal:** Corrigir a mensagem `OK: undefined` do `cmdScrape` (contrato de `runPipeline` mudou) e tornar os 2 testes auto-fallback determinísticos por padrão, com a cobertura de rede real virando opt-in.

**Architecture:** Alinhar o consumidor (`cmdScrape`) ao contrato atual de `runPipeline` (`{library, version, url, indexed}`) extraindo uma função pura `formatScrapeOk` (testável via main-guard). Testes de falha passam a usar host `.invalid` (DNS fail local, determinístico); o teste de sucesso via fallback fica opt-in (`RUN_NETWORK_TESTS=1`).

**Tech Stack:** Node.js (`node --test`, `node:assert/strict`, `spawnSync`), bug está em `scripts/devflow-stacks.mjs`.

**Agents:** bug-fixer (fix de produção), test-writer (testes determinísticos).

---

## File Structure

| Caminho | Responsabilidade | Ação |
|---|---|---|
| `scripts/devflow-stacks.mjs` | main-guard + `formatScrapeOk` export + uso em `cmdScrape` + chamada `runPipeline` limpa | Modify |
| `tests/validation/test-scrape-auto-fallback.mjs` | unit test de `formatScrapeOk` + testes de falha determinísticos + teste #1 opt-in | Modify |

---

## Task 1: `formatScrapeOk` + main-guard (TDD do bug de produção)

**Files:**
- Modify: `scripts/devflow-stacks.mjs` (main-guard no fim; `formatScrapeOk` export; uso em `cmdScrape:~143`; chamada `runPipeline:~134`)
- Test: `tests/validation/test-scrape-auto-fallback.mjs` (novo unit test no topo)

- [ ] **Step 1: Escrever o unit test que FALHA**

Adicionar no topo da seção de testes (após os imports) em `tests/validation/test-scrape-auto-fallback.mjs`:

```javascript
import { formatScrapeOk } from "../../scripts/devflow-stacks.mjs";

test("formatScrapeOk reflete o contrato atual de runPipeline (sem undefined)", () => {
  const result = { library: "zod", version: "4.1.0", url: "https://zod.dev/", indexed: true };
  assert.equal(formatScrapeOk(result), "OK: indexed zod@4.1.0 from https://zod.dev/");
});
```

- [ ] **Step 2: Rodar e ver FALHAR**

Run: `node --test tests/validation/test-scrape-auto-fallback.mjs`
Expected: FALHA — ou `formatScrapeOk is not a function` (não exportada), ou (se o import disparar `main()`) erro de "Usage"/exit. Confirmar que falha por isso, não por sintaxe.

- [ ] **Step 3: Adicionar o main-guard** em `scripts/devflow-stacks.mjs` (fim do arquivo)

Trocar:

```javascript
main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
```

por:

```javascript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Adicionar a função pura exportada** `formatScrapeOk` em `scripts/devflow-stacks.mjs` (logo antes de `async function cmdScrape`)

```javascript
// Formata a linha de sucesso do scrape a partir do contrato atual de
// runPipeline ({ library, version, url, indexed }). Pura e exportada p/ teste.
export function formatScrapeOk(result) {
  return `OK: indexed ${result.library}@${result.version} from ${result.url}`;
}
```

- [ ] **Step 5: Usar a função em `cmdScrape`** — trocar a linha (~143):

```javascript
      console.log(`OK: ${result.refPath} (hash ${result.hash}, ${result.snippetCount} snippets, ${result.sanitizationHits} sanitizations)`);
```

por:

```javascript
      console.log(formatScrapeOk(result));
```

- [ ] **Step 6: Limpar a chamada de `runPipeline`** — trocar (~134):

```javascript
      const result = await runPipeline({
        library, version,
        url,
        type: opts.source,
      }, projectRoot);
```

por (remover o `projectRoot` extra que `runPipeline(input)` ignora):

```javascript
      const result = await runPipeline({
        library, version,
        url,
        type: opts.source,
      });
```

- [ ] **Step 7: Rodar e ver PASSAR**

Run: `node --test tests/validation/test-scrape-auto-fallback.mjs`
Expected: o unit test `formatScrapeOk` PASSA. (Os testes "real network" antigos ainda podem falhar — serão corrigidos na Task 2.)

- [ ] **Step 8: Commit**

```bash
git add scripts/devflow-stacks.mjs tests/validation/test-scrape-auto-fallback.mjs
git commit -m "fix(stacks): mensagem OK do scrape reflete contrato runPipeline (formatScrapeOk, TDD)"
```

---

## Task 2: Testes determinísticos + guard opt-in

**Files:**
- Modify: `tests/validation/test-scrape-auto-fallback.mjs`

- [ ] **Step 1: Inverter o guard de rede** — trocar:

```javascript
const SKIP_NETWORK = process.env.SKIP_NETWORK_TESTS === "1";
```

por:

```javascript
// Testes que indexam de verdade (rede + docs-mcp-server) são opt-in.
const RUN_NETWORK = process.env.RUN_NETWORK_TESTS === "1";
```

- [ ] **Step 2: Reescrever o Teste #2 (falha sem fallback, determinístico)** — substituir o bloco `test("scrape sem --auto-fallback: exit 1 em URL ruim (comportamento atual)", { skip: SKIP_NETWORK }, ...)` por:

```javascript
test("scrape sem --auto-fallback: host inválido → exit 1 + SCRAPE FAILED (determinístico)", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {});
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html",
      "--from=https://nonexistent-host.invalid/",
      `--project=${root}`,
    ], { encoding: "utf-8", timeout: 60000 });
    assert.equal(r.status, 1, `esperava exit 1; stderr: ${r.stderr}`);
    assert.match(r.stderr, /SCRAPE FAILED:/);
  } finally { cleanup(); }
});
```

- [ ] **Step 3: Adicionar o teste all-failed com --auto-fallback (determinístico)** — logo após o Teste #2:

```javascript
test("scrape --auto-fallback: todas URLs inválidas → exit 1 + tried N URLs", () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      foo: {
        version: "1.0.0",
        artisanalRef: "refs/foo@1.0.0.md",
        discoveryHints: ["https://also-bad.invalid/"],
      },
    });
    const r = spawnSync("node", [
      CLI, "scrape", "foo", "1.0.0",
      "--source=html",
      "--from=https://nonexistent-host.invalid/",
      "--auto-fallback", `--project=${root}`,
    ], { encoding: "utf-8", timeout: 60000 });
    assert.equal(r.status, 1, `esperava exit 1; stderr: ${r.stderr}`);
    assert.match(r.stderr, /tried 2 URL\(s\)/);
  } finally { cleanup(); }
});
```

- [ ] **Step 4: Tornar o Teste #1 opt-in + corrigir contrato** — substituir o bloco `test("scrape --auto-fallback recupera de URL ruim para hint válido (real network)", { skip: SKIP_NETWORK }, ...)` por:

```javascript
test("scrape --auto-fallback recupera de host inválido para hint válido (real network)", { skip: !RUN_NETWORK }, () => {
  const { root, cleanup } = fixture();
  try {
    writeManifest(root, {
      zod: {
        version: "4.1.0",
        artisanalRef: "refs/zod@4.1.0.md",
        discoveryHints: ["https://zod.dev/"],  // canonical fallback (funciona)
      },
    });
    const r = spawnSync("node", [
      CLI, "scrape", "zod", "4.1.0",
      "--source=html",
      "--from=https://nonexistent-host.invalid/",  // falha garantida → força fallback
      "--auto-fallback", `--project=${root}`,
    ], { encoding: "utf-8", timeout: 60000 });
    assert.equal(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /OK: indexed zod@4\.1\.0/, "mensagem OK reflete o novo contrato");
    assert.match(r.stdout, /Auto-fallback: tried 2 URL\(s\)/, "resumo de tentativas");
  } finally { cleanup(); }
});
```

- [ ] **Step 5: Rodar a suíte SEM rede (default) e ver tudo PASSAR**

Run: `node --test tests/validation/test-scrape-auto-fallback.mjs`
Expected: todos os testes determinísticos PASS; o Teste #1 aparece como `skipped` (RUN_NETWORK não setado). Zero falhas.

- [ ] **Step 6: (opcional) Rodar com rede e ver o opt-in PASSAR**

Run: `RUN_NETWORK_TESTS=1 node --test tests/validation/test-scrape-auto-fallback.mjs`
Expected: o Teste #1 roda e PASSA (`OK: indexed zod@4.1.0`, `tried 2 URL(s)`). Confirma o fix da mensagem end-to-end.

- [ ] **Step 7: Commit**

```bash
git add tests/validation/test-scrape-auto-fallback.mjs
git commit -m "test(stacks): testes auto-fallback determinísticos (.invalid) + rede real opt-in"
```

---

## Self-Review (cobertura do spec)

| Spec AC | Task(s) |
|---|---|
| AC1 (OK: indexed, formatScrapeOk unit test) | Task 1 (Steps 1-8) |
| AC2 (host .invalid sem fallback → exit 1 + SCRAPE FAILED) | Task 2 Step 2 |
| AC3 (all-failed com --auto-fallback → exit 1 + tried 2) | Task 2 Step 3 |
| AC4 (Teste #1 opt-in + novo contrato) | Task 2 Step 4 |
| AC5 (suíte verde sem RUN_NETWORK) | Task 2 Step 5 |

TDD: Task 1 é test-first (unit RED no Step 2 antes do GREEN nos Steps 3-7). Task 2 ajusta testes E2E determinísticos (o comportamento de produção já existe; provado por execução do CLI real). Sem placeholders; paths e comandos exatos.
