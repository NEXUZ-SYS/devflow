# Check `harness-sensors` + catálogo derivado do `verify:` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encerrar o `workflow-advance --force` fazendo o gate do harness observar a mesma fonte do gate do ADR-013 — um catálogo de sensores derivado do contrato `verify:`, mais um check no doctor que detecta ausência e drift.

**Architecture:** Um gerador puro converte o `verify:` (já validado pelo `readVerify`) num catálogo, recusando comandos que não sobrevivem ao round-trip `argv ↔ string`. Um check novo no array `CHECKS` do doctor diagnostica; o reparo é texto e a skill o executa sob consentimento.

**Tech Stack:** Node ESM puro, `node --test`, fixtures git/fs em tmpdir.

**Spec:** [`../specs/2026-07-22-doctor-harness-sensors-design.md`](../specs/2026-07-22-doctor-harness-sensors-design.md)

## Global Constraints

- **ADR-011:** o `verify:` é lido **só** via `scripts/lib/devflow-config.mjs` (`readVerify` / `readVerifyFromPath`). Nenhum parse ad-hoc.
- **DRY:** `VERIFY_ALLOWLIST` **já é exportada** por `devflow-config.mjs` — importar, nunca redefinir.
- **`readVerify` já valida** allowlist de `argv[0]` e ausência de código inline, **lançando** em contrato inválido. O `assertShellSafe` acrescenta apenas os guards de shell (metacaractere, espaço em argumento) — não reimplementa o que já existe.
- **O doctor nunca repara.** `scripts/doctor.mjs`: *"NEVER applies repairs (the skill drives repairs with consent)"*. `repair` é string.
- **O gerador não escreve por padrão** — sem flag imprime; só `write` grava.
- **Fail-closed:** comando inseguro → lançar/sair não-zero. Nunca degradar em silêncio.
- **`requiredSignals: [unit, lint]`.**
- **Idioma:** comentários, commits e prosa em pt-BR.

---

### Task 1: Gerador `sensors-from-verify.mjs`

**Files:**
- Create: `scripts/lib/sensors-from-verify.mjs`
- Test: `tests/lib/sensors-from-verify.test.mjs`

**Interfaces:**
- Consumes: `readVerifyFromPath(path) → { signals: {[name]: string[]}, onTaskComplete: string[] }` e `VERIFY_ALLOWLIST: Set<string>`, ambos de `scripts/lib/devflow-config.mjs`.
- Produces: `assertShellSafe(argv: string[], name: string) → void | throw` e `buildCatalog(verify) → { version: 1, source: "manual", sensors: Array<{id,name,description,severity,blocking,enabled,command}> }`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/lib/sensors-from-verify.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertShellSafe, buildCatalog } from "../../scripts/lib/sensors-from-verify.mjs";

const OK = ["bash", "tests/run-unit.sh"];

test("assertShellSafe: argv[0] fora da allowlist lança", () => {
  assert.throws(() => assertShellSafe(["curl", "http://x"], "unit"), /allowlist/i);
});

test("assertShellSafe: metacaractere de shell lança", () => {
  for (const bad of [";", "|", "&", "$", "`", ">", "<", "(", ")", "{", "}"]) {
    assert.throws(() => assertShellSafe(["bash", `x${bad}y`], "unit"), /metacaractere/i, `faltou barrar ${bad}`);
  }
});

test("assertShellSafe: espaço dentro de um argumento lança (quebraria o round-trip)", () => {
  assert.throws(() => assertShellSafe(["bash", "tests/run unit.sh"], "unit"), /espaço/i);
});

test("assertShellSafe: comando legítimo não lança", () => {
  assert.doesNotThrow(() => assertShellSafe(OK, "unit"));
});

test("buildCatalog: um sensor por sinal, mais o 'tests'", () => {
  const cat = buildCatalog({ signals: { unit: OK, lint: ["bash", "tests/run-lint.sh"] }, onTaskComplete: ["unit"] });
  const ids = cat.sensors.map(s => s.id).sort();
  assert.deepEqual(ids, ["lint", "tests", "unit"]);
  assert.equal(cat.version, 1);
  assert.equal(cat.source, "manual");
});

test("buildCatalog: só 'tests' e 'lint' nascem bloqueantes", () => {
  const cat = buildCatalog({
    signals: { unit: OK, lint: ["bash", "tests/run-lint.sh"], e2e: ["bash", "tests/run-e2e.sh"] },
    onTaskComplete: ["unit"],
  });
  const by = Object.fromEntries(cat.sensors.map(s => [s.id, s]));
  assert.equal(by.tests.blocking, true);
  assert.equal(by.lint.blocking, true);
  assert.equal(by.unit.blocking, false);
  assert.equal(by.e2e.blocking, false, "e2e bloqueante custaria minutos por avanço de fase");
});

test("buildCatalog: 'tests' recebe o comando do sinal unit", () => {
  const cat = buildCatalog({ signals: { unit: OK, lint: ["bash", "tests/run-lint.sh"] }, onTaskComplete: ["unit"] });
  const tests = cat.sensors.find(s => s.id === "tests");
  assert.equal(tests.command, "bash tests/run-unit.sh");
});

test("buildCatalog: sem sinal unit, não emite 'tests' (não inventa comando)", () => {
  const cat = buildCatalog({ signals: { lint: ["bash", "tests/run-lint.sh"] }, onTaskComplete: [] });
  assert.equal(cat.sensors.find(s => s.id === "tests"), undefined);
});

test("buildCatalog: fail-closed — um comando inseguro derruba a geração inteira", () => {
  assert.throws(
    () => buildCatalog({ signals: { unit: OK, lint: ["bash", "run.sh; rm -rf /"] }, onTaskComplete: [] }),
    /metacaractere/i
  );
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/lib/sensors-from-verify.test.mjs`

Expected: FAIL — `Cannot find module '.../scripts/lib/sensors-from-verify.mjs'`.

- [ ] **Step 3: Implementar o gerador**

Criar `scripts/lib/sensors-from-verify.mjs`:

```js
// sensors-from-verify.mjs — deriva o catálogo de sensores do harness a partir do
// contrato `verify:` do ADR-013, para que o gate do harness e o gate da fase V
// observem A MESMA fonte (hoje divergem e obrigam workflow-advance --force).
//
// O catálogo do harness é executado com promisify(child_process.exec) — /bin/sh -c.
// Esse caminho é do dotcontext e pré-existente; gerar o arquivo não cria a
// capacidade. A validação aqui é guard de CORRETUDE, não fronteira de segurança:
// o harness re-tokeniza a string por espaços, então um argumento com espaço
// quebraria o comando em silêncio.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { readVerifyFromPath, VERIFY_ALLOWLIST } from "./devflow-config.mjs";

const SHELL_META = /[;|&$`><(){}]/;
const CATALOG_REL = join(".context", "config", "sensors.json");

// Os ids que o phase-defaults do harness auto-exige. Só estes nascem bloqueantes:
// espelhar um e2e lento como bloqueante custaria minutos por avanço de fase.
const BLOCKING_IDS = new Set(["tests", "lint"]);

// `readVerify` já garante allowlist de argv[0] e ausência de código inline (ele
// lança). Aqui acrescentamos só o que é específico do round-trip argv <-> string.
export function assertShellSafe(argv, name) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error(`sensor '${name}': argv vazio`);
  }
  if (!VERIFY_ALLOWLIST.has(argv[0])) {
    throw new Error(`sensor '${name}': argv[0] '${argv[0]}' fora da allowlist`);
  }
  for (const tok of argv) {
    if (typeof tok !== "string") throw new Error(`sensor '${name}': token não-string`);
    if (SHELL_META.test(tok)) {
      throw new Error(`sensor '${name}': metacaractere de shell em '${tok}'`);
    }
    if (/\s/.test(tok)) {
      throw new Error(`sensor '${name}': espaço dentro do argumento '${tok}' quebraria o round-trip`);
    }
  }
}

function sensor(id, argv, description) {
  return {
    id,
    name: id,
    description,
    severity: "critical",
    blocking: BLOCKING_IDS.has(id),
    enabled: true,
    command: argv.join(" "),
  };
}

export function buildCatalog(verify) {
  const signals = (verify && verify.signals) || {};
  const sensors = [];

  for (const [name, argv] of Object.entries(signals)) {
    assertShellSafe(argv, name);
    sensors.push(sensor(name, argv, `Sinal '${name}' do contrato verify: (ADR-013).`));
  }

  // O phase-defaults do harness procura o id `tests`. Espelhamos o loop rápido
  // (`unit`); sem ele, NÃO inventamos comando.
  if (Array.isArray(signals.unit)) {
    sensors.push(sensor("tests", signals.unit, "Alias do sinal 'unit' — id que o gate de fase do harness exige."));
  }

  return { version: 1, source: "manual", sensors };
}

function main(argv) {
  const write = argv[0] === "write";
  const root = (write ? argv[1] : argv[0]) || ".";
  const verify = readVerifyFromPath(join(root, ".context", ".devflow.yaml"));
  const catalog = buildCatalog(verify);
  const json = JSON.stringify(catalog, null, 2) + "\n";
  if (!write) {
    process.stdout.write(json);
    return;
  }
  const out = join(root, CATALOG_REL);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  process.stderr.write(`sensors-from-verify: ${catalog.sensors.length} sensores → ${CATALOG_REL}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/lib/sensors-from-verify.test.mjs`

Expected: PASS — 8 testes, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/sensors-from-verify.mjs tests/lib/sensors-from-verify.test.mjs
git commit -m "feat(doctor): gerador de sensors.json derivado do contrato verify:

O gate do harness exige sensores que não existem; o gate do ADR-013 observa
o ledger do verify:. Espelhar um no outro faz os dois olharem a MESMA fonte
e encerra o workflow-advance --force.

Fail-closed em metacaractere de shell e em espaço dentro de argumento (o
harness re-tokeniza por espaços). Reusa VERIFY_ALLOWLIST do parser único."
```

---

### Task 2: Check `harness-sensors` no doctor

**Files:**
- Modify: `scripts/lib/doctor.mjs` (novo objeto de check + entrada no array `CHECKS` da linha 347)
- Test: `tests/lib/doctor-harness-sensors.test.mjs`

**Interfaces:**
- Consumes: da Task 1 — nada em runtime (o check não gera; só aponta o comando). De `devflow-config.mjs` — `readVerifyFromPath`.
- Produces: o check com `id: "harness-sensors"`, acessível por `getCheck("harness-sensors")`, retornando `{ status: "OK"|"WARN", diagnosis, repair }`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/lib/doctor-harness-sensors.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCheck } from "../../scripts/lib/doctor.mjs";

const VERIFY_YAML = `git:
  strategy: branch-flow
verify:
  unit: ["bash", "tests/run-unit.sh"]
  lint: ["bash", "tests/run-lint.sh"]
`;

function repo({ verify = true, catalog = null } = {}) {
  const d = mkdtempSync(join(tmpdir(), "dhs-"));
  mkdirSync(join(d, ".context"), { recursive: true });
  writeFileSync(join(d, ".context", ".devflow.yaml"), verify ? VERIFY_YAML : "git:\n  strategy: branch-flow\n");
  if (catalog) {
    mkdirSync(join(d, ".context", "config"), { recursive: true });
    writeFileSync(join(d, ".context", "config", "sensors.json"), JSON.stringify(catalog, null, 2));
  }
  return d;
}

const check = getCheck("harness-sensors");
const ctx = (cwd) => ({ cwd, which: () => true, exec: () => ({ code: 0, stdout: "", stderr: "" }) });

test("o check existe e está registrado", () => {
  assert.ok(check, "harness-sensors precisa estar no array CHECKS");
  assert.equal(check.destructive, false);
});

test("projeto sem verify: → OK (nada a espelhar)", () => {
  const r = check.run(ctx(repo({ verify: false })));
  assert.equal(r.status, "OK");
});

test("sensors.json ausente → WARN com o reparo exato", () => {
  const r = check.run(ctx(repo()));
  assert.equal(r.status, "WARN");
  assert.match(r.repair, /sensors-from-verify\.mjs write/);
});

test("drift: sinal do verify: sem sensor correspondente → WARN", () => {
  const d = repo({ catalog: { version: 1, source: "manual", sensors: [{ id: "unit", command: "bash tests/run-unit.sh" }] } });
  const r = check.run(ctx(d));
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /lint/, "o diagnóstico precisa nomear o sinal descoberto");
});

test("catálogo cobrindo todos os sinais → OK", () => {
  const d = repo({ catalog: { version: 1, source: "manual", sensors: [
    { id: "unit", command: "bash tests/run-unit.sh" },
    { id: "lint", command: "bash tests/run-lint.sh" },
    { id: "tests", command: "bash tests/run-unit.sh" },
  ] } });
  const r = check.run(ctx(d));
  assert.equal(r.status, "OK");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/lib/doctor-harness-sensors.test.mjs`

Expected: FAIL no primeiro teste — `harness-sensors precisa estar no array CHECKS` (`getCheck` retorna `undefined`).

- [ ] **Step 3: Implementar o check**

Em `scripts/lib/doctor.mjs`, acrescentar o import no topo (junto aos demais) e o objeto de check **antes** da linha `export const CHECKS = [...]`:

```js
import { readVerifyFromPath } from "./devflow-config.mjs";

const harnessSensors = {
  id: "harness-sensors",
  title: "Sensores do harness (.context/config/sensors.json)",
  severity: "warn",
  destructive: false,
  run(ctx) {
    const cfg = join(ctx.cwd, ".context", ".devflow.yaml");
    const { signals } = readVerifyFromPath(cfg);
    const names = Object.keys(signals || {});
    if (names.length === 0) {
      return { status: "OK", diagnosis: "Projeto sem contrato verify: — nada a espelhar.", repair: "" };
    }

    const catalogPath = join(ctx.cwd, ".context", "config", "sensors.json");
    const repair = "Rode: node scripts/lib/sensors-from-verify.mjs write";

    if (!existsSync(catalogPath)) {
      return {
        status: "WARN",
        diagnosis:
          "Catálogo de sensores ausente: o gate de fase do harness exige 'tests'/'lint', " +
          "que não existem, e o avanço só passa com force. Os built-ins do dotcontext assumem npm/TS.",
        repair,
      };
    }

    let ids = [];
    try {
      const raw = JSON.parse(readFileSync(catalogPath, "utf-8"));
      ids = (raw.sensors || []).map((s) => s && s.id).filter(Boolean);
    } catch {
      return { status: "WARN", diagnosis: "sensors.json ilegível ou malformado.", repair };
    }

    const missing = names.filter((n) => !ids.includes(n));
    if (missing.length > 0) {
      return {
        status: "WARN",
        diagnosis: `Catálogo desatualizado: sinal(is) do verify: sem sensor — ${missing.join(", ")}.`,
        repair,
      };
    }

    return { status: "OK", diagnosis: `Catálogo cobre os ${names.length} sinais do verify:.`, repair: "" };
  },
};
```

E acrescentar `harnessSensors` ao final do array:

```js
export const CHECKS = [mcpConfigValid, mcpConnectivity, mempalaceHealth, devflowConfig, gitHooks, groundingMcp, permissionsHealth, adrInjection, harnessSensors];
```

> Se `join`, `existsSync` ou `readFileSync` ainda não estiverem importados no arquivo, acrescentá-los aos imports existentes de `node:path` / `node:fs`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/lib/doctor-harness-sensors.test.mjs`

Expected: PASS — 5 testes, 0 falhas.

- [ ] **Step 5: Rodar o loop rápido inteiro**

Run: `bash tests/run-unit.sh`

Expected: exit 0, sem regressão nos demais checks do doctor.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/doctor.mjs tests/lib/doctor-harness-sensors.test.mjs
git commit -m "feat(doctor): check harness-sensors detecta catálogo ausente ou em drift

Diagnóstico-only, como todo o motor do doctor — o repair é texto e a skill
o executa sob consentimento. OK quando o projeto não tem verify: (nada a
espelhar) ou quando o catálogo cobre todos os sinais."
```

---

### Task 3: Dogfood — gerar o catálogo deste repo

**Files:**
- Create: `.context/config/sensors.json` (gerado, não escrito à mão)
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: da Task 1 o CLI `node scripts/lib/sensors-from-verify.mjs write`; da Task 2 o check para confirmar `OK`.
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Inspecionar antes de escrever**

Run: `node scripts/lib/sensors-from-verify.mjs`

Expected: JSON no stdout com 5 sensores (`unit`, `integration`, `e2e`, `lint`, `tests`), apenas `tests` e `lint` com `"blocking": true`. **Conferir visualmente antes de gravar** — nada é escrito neste step.

- [ ] **Step 2: Gerar**

```bash
node scripts/lib/sensors-from-verify.mjs write
```

Expected no stderr: `sensors-from-verify: 5 sensores → .context/config/sensors.json`

- [ ] **Step 3: Confirmar que o check virou OK**

```bash
node -e 'import("./scripts/lib/doctor.mjs").then(m=>console.log(JSON.stringify(m.getCheck("harness-sensors").run({cwd:"."}),null,2)))'
```

Expected: `"status": "OK"` com `Catálogo cobre os 4 sinais do verify:.`

- [ ] **Step 4: Registrar no CHANGELOG**

Em `CHANGELOG.md`, sob `## [Unreleased]`, inserir:

```markdown
### Added — check `harness-sensors` no doctor + catálogo derivado do `verify:`

O gate de fase do PREVC exigia os sensores `tests`/`lint`, que não existiam: o projeto nunca
definiu `.context/config/sensors.json`, e os built-ins do dotcontext assumem npm/TS. Todo avanço
de fase precisava de `workflow-advance --force` — não por teste faltando (os sinais rodavam
verdes no ledger **e** no CI), mas por contabilidade do harness divergindo da evidência real.
Forçar virou rotina, o que normaliza justamente o bypass que o ADR-013 existe para impedir.

- **`scripts/lib/sensors-from-verify.mjs`** (novo) — deriva o catálogo do contrato `verify:`
  lido pelo parser único (ADR-011), reusando `VERIFY_ALLOWLIST`. **Fail-closed** em metacaractere
  de shell ou espaço dentro de argumento — o harness re-tokeniza a string por espaços, então isso
  quebraria o comando em silêncio. Não escreve por padrão: sem flag imprime, `write` grava.
- **Check `harness-sensors`** — `OK` sem `verify:` (nada a espelhar) ou com o catálogo completo;
  `WARN` quando ausente ou em drift. Diagnóstico-only: o reparo é texto e a skill o executa sob
  consentimento.

**Nota de alcance:** o catálogo do harness é executado com `sh -c`, diferente dos built-ins
(`spawn`, `shell:false`). Esse caminho é do dotcontext e **pré-existente** — gerar o arquivo não
cria a capacidade, e o arquivo é versionado, passando por revisão de PR. A validação estrita é
guard de **corretude** (round-trip `argv ↔ string`), não fronteira de segurança.
```

- [ ] **Step 5: Commit**

```bash
git add .context/config/sensors.json CHANGELOG.md
git commit -m "chore(sensors): gera o catálogo deste repo a partir do verify:

Dogfood: 5 sensores (unit, integration, e2e, lint, tests); só tests e lint
bloqueantes. É o que encerra o workflow-advance --force."
```

---

## Self-Review

**Cobertura do spec:**

| Requisito do spec | Task/Step |
|---|---|
| D1 — gerar do `verify:` com fail-closed | 1 · Step 3 (`assertShellSafe`) |
| D1 — allowlist reusada, não redefinida | 1 · Step 3 (import de `VERIFY_ALLOWLIST`) |
| D2 — só `tests`/`lint` bloqueantes | 1 · Step 3 (`BLOCKING_IDS`) · teste 6 |
| D2 — `tests` recebe o comando do `unit` | 1 · Step 3 · teste 7 |
| D3 — doctor diagnostica, não repara | 2 · Step 3 (`repair` é string) |
| D3 — gerador não escreve por padrão | 1 · Step 3 (`main`) · 3 · Step 1 |
| Check: 4 situações da tabela | 2 · Step 1 (testes 2-5) |
| Dogfood deste repo | 3 |
| CHANGELOG com o enquadramento honesto do risco | 3 · Step 4 |

**Placeholders:** nenhum — todo step traz o código final.

**Consistência de tipos:** `assertShellSafe(argv, name)` e `buildCatalog(verify)` usados com a mesma assinatura no gerador e nos testes. O check consome `readVerifyFromPath` → `{signals}`, a mesma forma que o gerador usa. O id `tests` aparece com a mesma grafia em `BLOCKING_IDS`, no `buildCatalog` e nos testes.

**Risco conhecido, aceito:** o teste 8 da Task 1 assume que `readVerify` não é chamado por `buildCatalog` (o catálogo recebe o objeto já lido), então um comando com metacaractere chega até o `assertShellSafe`. Se `readVerify` passar a rejeitar metacaracteres antes, o teste continua válido — ele exercita `buildCatalog` diretamente com o objeto.
