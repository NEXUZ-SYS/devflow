# Checkup de início de dia do DevFlow — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** `daily-devflow-checkup` | **Escala:** MEDIUM | **Fase:** P→R

**Goal:** Na primeira sessão do dia em cada máquina, verificar automaticamente se o ambiente de plugins corresponde ao que o projeto declara — incluindo se estão atualizados — reportando apenas quando houver divergência.

**Architecture:** Um leitor puro (`plugin-env.mjs`) consolida cinco arquivos de configuração do Claude Code; quatro checks do `doctor.mjs` interpretam esse estado; o estado de execução das routines migra do arquivo versionado para `.context/runtime/` (por máquina), de modo que a ausência do arquivo passa a significar "clone novo"; o hook `session-start` executa os passos do tipo `check` sem LLM.

**Tech Stack:** Node ≥18 (stdlib apenas, zero dependências), `node:test`, bash (hooks).

**Spec:** `docs/superpowers/specs/2026-09-01-daily-devflow-checkup-design.md`

**Agents:** `devops-specialist` (hook, CLI), `test-writer` (suítes), `code-reviewer` (fase R).

## Global Constraints

- **Zero dependências novas.** Node stdlib apenas. Todos os scripts do repo seguem isso.
- **Zero rede e zero `exec`** em `plugin-env.mjs` e nos quatro checks. Só leitura de arquivo.
- **Fail-open.** Qualquer erro (JSON inválido, permissão, `HOME` irresolvível) → o checkup se cala e o hook sai `0`. Jamais travar uma sessão.
- **O checkup nunca age.** Não instala, não atualiza, não escreve fora de `.context/runtime/`.
- **Versões podem não ser semver.** `cli-anything` está instalado como `2ec6eb594e2c` (SHA). Use `parseVersion` de `scripts/lib/version-guard.mjs`, que devolve `null` em vez de lançar; versão não-parseável significa "não comparável", nunca "desatualizado".
- **Idioma:** diagnósticos e mensagens ao usuário em pt-BR, como o resto do `doctor.mjs`.
- **`SKIP` não altera exit code.** Só `FAIL` faz o doctor sair com `1`.
- **Testes E2E destrutivos sempre em tmpdir**, nunca no diretório versionado.
- **`requiredSignals: [unit, e2e, lint]`**

---

### Task 1: `plugin-env.mjs` — leitor do ambiente de plugins

**Files:**
- Create: `scripts/lib/plugin-env.mjs`
- Test: `tests/validation/test-plugin-env.mjs`

**Interfaces:**
- Consumes: `parseVersion` de `scripts/lib/version-guard.mjs`
- Produces:
  - `readPluginEnv({ cwd, home }) -> { harness, declared, installed, userEnabled, marketplaces }`
    - `harness`: `"claude-code"` | `"other"`
    - `declared`: `{ [key]: { key, name, marketplace } }` — key é `"<name>@<marketplace>"`
    - `installed`: `{ [key]: Array<{scope, projectPath, installPath, version, lastUpdated}> }`
    - `userEnabled`: `{ [key]: true }`
    - `marketplaces`: `{ [mkt]: { lastUpdated: string|null, published: { [pluginName]: version } } }`
  - `installedFor(env, key, cwd) -> { ...entry, via: "project"|"user" } | null`

- [ ] **Step 1: Escrever o teste que falha**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readPluginEnv, installedFor } from "../../scripts/lib/plugin-env.mjs";

function w(path, obj) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

// Monta um HOME sintético + um projeto. Devolve { home, cwd, cleanup }.
function env({ declared = {}, userEnabled = {}, installed = {}, known = {}, published = {}, noPluginsDir = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "plugenv-"));
  const home = join(root, "home");
  const cwd = join(root, "proj");
  mkdirSync(cwd, { recursive: true });
  w(join(cwd, ".claude", "settings.json"), { enabledPlugins: declared });
  w(join(home, ".claude", "settings.json"), { enabledPlugins: userEnabled });
  if (!noPluginsDir) {
    const pd = join(home, ".claude", "plugins");
    mkdirSync(pd, { recursive: true });
    w(join(pd, "installed_plugins.json"), { version: 2, plugins: installed });
    w(join(pd, "known_marketplaces.json"), known);
    for (const [mkt, plugins] of Object.entries(published)) {
      w(join(pd, "marketplaces", mkt, ".claude-plugin", "marketplace.json"), { plugins });
    }
  }
  return { home, cwd, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("sem ~/.claude/plugins o harness é 'other' e nada é declarado como instalado", () => {
  const e = env({ noPluginsDir: true, declared: { "devflow@NEXUZ-SYS": true } });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(r.harness, "other");
  assert.deepEqual(r.installed, {});
  e.cleanup();
});

test("lê os plugins declarados pelo projeto, ignorando os desligados", () => {
  const e = env({ declared: { "devflow@NEXUZ-SYS": true, "outro@mkt": false } });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(r.harness, "claude-code");
  assert.deepEqual(Object.keys(r.declared), ["devflow@NEXUZ-SYS"]);
  assert.equal(r.declared["devflow@NEXUZ-SYS"].name, "devflow");
  assert.equal(r.declared["devflow@NEXUZ-SYS"].marketplace, "NEXUZ-SYS");
  e.cleanup();
});

test("installedFor prefere a entrada de escopo project deste projeto", () => {
  const e = env({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: {
      "devflow@NEXUZ-SYS": [
        { scope: "project", projectPath: "/outro/lugar", version: "1.0.0" },
        { scope: "user", version: "2.0.0" },
      ],
    },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  // nenhuma entrada project casa com este cwd → cai na de escopo user
  const found = installedFor(r, "devflow@NEXUZ-SYS", e.cwd);
  assert.equal(found.via, "user");
  assert.equal(found.version, "2.0.0");
  e.cleanup();
});

test("installedFor devolve null quando o plugin não está instalado", () => {
  const e = env({ declared: { "devflow@NEXUZ-SYS": true } });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(installedFor(r, "devflow@NEXUZ-SYS", e.cwd), null);
  e.cleanup();
});

test("lê a versão publicada e o lastUpdated do catálogo", () => {
  const e = env({
    known: { "NEXUZ-SYS": { lastUpdated: "2026-09-01T13:34:56.748Z" } },
    published: { "NEXUZ-SYS": [{ name: "devflow", version: "3.1.0" }] },
  });
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(r.marketplaces["NEXUZ-SYS"].published.devflow, "3.1.0");
  assert.equal(r.marketplaces["NEXUZ-SYS"].lastUpdated, "2026-09-01T13:34:56.748Z");
  e.cleanup();
});

test("JSON corrompido não lança — trata como ausente", () => {
  const e = env({ declared: { "devflow@NEXUZ-SYS": true } });
  writeFileSync(join(e.home, ".claude", "plugins", "installed_plugins.json"), "{ não é json");
  const r = readPluginEnv({ cwd: e.cwd, home: e.home });
  assert.equal(r.harness, "claude-code");
  assert.deepEqual(r.installed, {});
  e.cleanup();
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/validation/test-plugin-env.mjs`
Expected: FAIL com `Cannot find module '.../scripts/lib/plugin-env.mjs'`

- [ ] **Step 3: Implementar o mínimo**

```js
// plugin-env — leitor puro do ambiente de plugins do Claude Code.
// Só leitura de arquivo: sem rede, sem exec, sem processo filho.
// Quando ~/.claude/plugins não existe (omp, OpenCode, CI, container) devolve
// harness "other" — os checks derivados viram SKIP em vez de mentir OK.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function readPublished(pluginsDir, mkt) {
  const manifest = readJson(join(pluginsDir, "marketplaces", mkt, ".claude-plugin", "marketplace.json"));
  const out = {};
  for (const p of manifest?.plugins || []) {
    if (p?.name && p?.version) out[p.name] = p.version;
  }
  return out;
}

export function readPluginEnv({ cwd, home = homedir() }) {
  const empty = { harness: "other", declared: {}, installed: {}, userEnabled: {}, marketplaces: {} };
  const pluginsDir = join(home, ".claude", "plugins");
  if (!existsSync(pluginsDir)) return empty;

  const projectSettings = readJson(join(cwd, ".claude", "settings.json")) || {};
  const userSettings = readJson(join(home, ".claude", "settings.json")) || {};
  const installedRaw = readJson(join(pluginsDir, "installed_plugins.json")) || {};
  const known = readJson(join(pluginsDir, "known_marketplaces.json")) || {};

  const declared = {};
  for (const [key, on] of Object.entries(projectSettings.enabledPlugins || {})) {
    if (on !== true) continue;
    const at = key.lastIndexOf("@");
    if (at <= 0) continue;
    declared[key] = { key, name: key.slice(0, at), marketplace: key.slice(at + 1) };
  }

  const installed = {};
  for (const [key, entries] of Object.entries(installedRaw.plugins || {})) {
    if (Array.isArray(entries)) installed[key] = entries;
  }

  const userEnabled = {};
  for (const [key, on] of Object.entries(userSettings.enabledPlugins || {})) {
    if (on === true) userEnabled[key] = true;
  }

  const marketplaces = {};
  for (const [mkt, meta] of Object.entries(known)) {
    marketplaces[mkt] = { lastUpdated: meta?.lastUpdated || null, published: readPublished(pluginsDir, mkt) };
  }

  return { harness: "claude-code", declared, installed, userEnabled, marketplaces };
}

// Entrada de instalação relevante para este projeto. Prefere a de escopo
// project cujo projectPath é este repo; cai na de escopo user quando não há.
export function installedFor(env, key, cwd) {
  const entries = env.installed[key] || [];
  const project = entries.find(e => e.scope === "project" && e.projectPath === cwd);
  if (project) return { ...project, via: "project" };
  const user = entries.find(e => e.scope === "user");
  if (user) return { ...user, via: "user" };
  return null;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/validation/test-plugin-env.mjs`
Expected: PASS, 6 testes

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/plugin-env.mjs tests/validation/test-plugin-env.mjs
git commit -m "feat(doctor): leitor puro do ambiente de plugins

Consolida as cinco fontes de verdade do gerenciador de plugins do Claude
Code. Sem rede e sem exec. Quando ~/.claude/plugins nao existe devolve
harness 'other', para que os checks derivados possam dar SKIP em vez de
afirmar OK sobre um ambiente que nao conseguem inspecionar."
```

---

### Task 2: `ctx.home` e os checks `plugin-declared-installed` e `plugin-scope`

**Files:**
- Modify: `scripts/lib/doctor.mjs` (dois checks novos + registro no array `CHECKS`)
- Modify: `scripts/doctor.mjs` (acrescentar `home` ao `ctx`)
- Test: `tests/validation/test-doctor-plugin-checks.mjs`

**Interfaces:**
- Consumes: `readPluginEnv`, `installedFor` (Task 1)
- Produces: checks `plugin-declared-installed` e `plugin-scope` no array `CHECKS`; `ctx.home` disponível para qualquer check futuro.

- [ ] **Step 1: Escrever o teste que falha**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getCheck } from "../../scripts/lib/doctor.mjs";

function w(path, obj) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2));
}

function scenario({ declared = {}, userEnabled = {}, installed = {}, known = {}, published = {}, noPluginsDir = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "plugchk-"));
  const home = join(root, "home");
  const cwd = join(root, "proj");
  mkdirSync(cwd, { recursive: true });
  w(join(cwd, ".claude", "settings.json"), { enabledPlugins: declared });
  w(join(home, ".claude", "settings.json"), { enabledPlugins: userEnabled });
  if (!noPluginsDir) {
    const pd = join(home, ".claude", "plugins");
    mkdirSync(pd, { recursive: true });
    w(join(pd, "installed_plugins.json"), { version: 2, plugins: installed });
    w(join(pd, "known_marketplaces.json"), known);
    for (const [mkt, plugins] of Object.entries(published)) {
      w(join(pd, "marketplaces", mkt, ".claude-plugin", "marketplace.json"), { plugins });
    }
  }
  return { cwd, ctx: { cwd, home, which: () => false, exec: () => ({ status: 1 }), today: "2026-09-01" }, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("plugin-declared-installed: SKIP quando o harness não é o Claude Code", () => {
  const s = scenario({ noPluginsDir: true, declared: { "devflow@NEXUZ-SYS": true } });
  const r = getCheck("plugin-declared-installed").run(s.ctx);
  assert.equal(r.status, "SKIP");
  s.cleanup();
});

test("plugin-declared-installed: FAIL quando um plugin declarado não está instalado", () => {
  const s = scenario({ declared: { "devflow@NEXUZ-SYS": true } });
  const r = getCheck("plugin-declared-installed").run(s.ctx);
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis, /devflow@NEXUZ-SYS/);
  assert.ok(r.repair.length > 0);
  s.cleanup();
});

test("plugin-declared-installed: OK quando todos os declarados estão instalados", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
  });
  const r = getCheck("plugin-declared-installed").run(s.ctx);
  assert.equal(r.status, "OK");
  s.cleanup();
});

test("plugin-declared-installed: OK sem afirmar nada quando o projeto não declara plugins", () => {
  const s = scenario({ declared: {} });
  const r = getCheck("plugin-declared-installed").run(s.ctx);
  assert.equal(r.status, "OK");
  assert.match(r.diagnosis, /não declara/i);
  s.cleanup();
});

test("plugin-scope: WARN quando um plugin do projeto está habilitado em escopo user", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    userEnabled: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
  });
  const r = getCheck("plugin-scope").run(s.ctx);
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /escopo user/i);
  s.cleanup();
});

test("plugin-scope: OK quando o plugin só está habilitado pelo projeto", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    userEnabled: {},
    installed: { "devflow@NEXUZ-SYS": [{ scope: "project", projectPath: "x", version: "3.1.0" }] },
  });
  const r = getCheck("plugin-scope").run(s.ctx);
  assert.equal(r.status, "OK");
  s.cleanup();
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/validation/test-doctor-plugin-checks.mjs`
Expected: FAIL com `TypeError: Cannot read properties of undefined (reading 'run')` — `getCheck` devolve `undefined` porque os checks ainda não existem.

- [ ] **Step 3: Implementar o mínimo**

Em `scripts/lib/doctor.mjs`, no topo, junto dos demais imports:

```js
import { readPluginEnv, installedFor } from "./plugin-env.mjs";
```

E os dois checks, antes da linha do `export const CHECKS`:

```js
// Os checks de plugin leem ~/.claude/plugins/*, estrutura do gerenciador de
// plugins do Claude Code. Fora dele (omp, OpenCode, CI, container) a pergunta
// nao tem resposta certa nem errada: SKIP, nunca OK nem FAIL.
const SKIP_NO_HARNESS = {
  status: "SKIP",
  diagnosis: "Ambiente sem ~/.claude/plugins — o estado de plugins não é verificável aqui.",
  repair: "",
};

const pluginDeclaredInstalled = {
  id: "plugin-declared-installed",
  title: "Plugins declarados pelo projeto estão instalados nesta máquina",
  severity: "critical",
  destructive: false,
  run(ctx) {
    const env = readPluginEnv({ cwd: ctx.cwd, home: ctx.home });
    if (env.harness !== "claude-code") return SKIP_NO_HARNESS;
    const keys = Object.keys(env.declared);
    if (!keys.length) {
      return { status: "OK", diagnosis: "O projeto não declara plugins em .claude/settings.json.", repair: "" };
    }
    const missing = keys.filter(k => installedFor(env, k, ctx.cwd) == null);
    if (missing.length) {
      return {
        status: "FAIL",
        diagnosis: `Plugin(s) declarado(s) pelo projeto e ausente(s) nesta máquina: ${missing.join(", ")}.`,
        repair: `Instale com: ${missing.map(k => `/plugin install ${k}`).join(" && ")}`,
      };
    }
    return { status: "OK", diagnosis: `Os ${keys.length} plugins declarados estão instalados.`, repair: "" };
  },
};

const pluginScope = {
  id: "plugin-scope",
  title: "Plugins do projeto não estão habilitados em escopo user",
  severity: "warn",
  destructive: false,
  run(ctx) {
    const env = readPluginEnv({ cwd: ctx.cwd, home: ctx.home });
    if (env.harness !== "claude-code") return SKIP_NO_HARNESS;
    const leaked = Object.keys(env.declared).filter(k => env.userEnabled[k]);
    if (leaked.length) {
      return {
        status: "WARN",
        diagnosis: `Habilitado(s) em escopo user, carregando em todo projeto da máquina: ${leaked.join(", ")}.`,
        repair: "Remova a(s) entrada(s) de enabledPlugins em ~/.claude/settings.json — o projeto já as declara.",
      };
    }
    return { status: "OK", diagnosis: "Nenhum plugin do projeto vazando para o escopo user.", repair: "" };
  },
};
```

Ainda em `scripts/lib/doctor.mjs`, ensinar a ordenação a conhecer `SKIP` — sem isso
`runChecks` compara `undefined` e produz `NaN` no `sort`. É uma linha, e precisa vir junto
dos primeiros checks que podem devolver esse status:

```js
const SEV_RANK = { FAIL: 0, WARN: 1, OK: 2, SKIP: 3 };
```

Registrar no array (mantendo os nove existentes na ordem):

```js
export const CHECKS = [mcpConfigValid, mcpConnectivity, mempalaceHealth, devflowConfig, gitHooks, groundingMcp, permissionsHealth, adrInjection, harnessSensors, pluginDeclaredInstalled, pluginScope];
```

Em `scripts/doctor.mjs`, acrescentar `home` ao contexto (o `homedir` já precisa ser importado de `node:os`):

```js
import { homedir } from "node:os";
```

```js
  const ctx = { cwd: process.cwd(), home: homedir(), which, exec, today: today() };
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/validation/test-doctor-plugin-checks.mjs tests/validation/test-doctor.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/doctor.mjs scripts/doctor.mjs tests/validation/test-doctor-plugin-checks.mjs
git commit -m "feat(doctor): checks de plugin declarado-instalado e de escopo

Depois que o devflow passou a escopo de projeto (#97), um mantenedor pode
clonar o repo sem os plugins que ele declara. Nenhum dos nove checks
existentes olhava isso. Acrescenta ctx.home para que os checks sejam
testaveis contra um HOME sintetico."
```

---

### Task 3: `SKIP` como quarto status do doctor

**Files:**
- Modify: `scripts/doctor.mjs:43` (`ICON`), `:61` (`counts`), `:72` (resumo)
- Test: `tests/validation/test-doctor-skip-status.mjs`

**Interfaces:**
- Consumes: `runChecks`, `CHECKS`, `getCheck` de `scripts/lib/doctor.mjs`; o check `plugin-declared-installed` (Task 2)
- Produces: o status `"SKIP"` passa a ser válido em qualquer check; ordena depois de OK; não altera exit code.

- [ ] **Step 1: Escrever o teste que falha**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const CLI = resolve("scripts/doctor.mjs");

function runCli(cwd, args) {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd, encoding: "utf-8" });
    return { status: 0, stdout };
  } catch (e) {
    return { status: e.status, stdout: e.stdout?.toString() || "" };
  }
}

// Regressão do SEV_RANK introduzido na Task 2.
test("SEV_RANK ordena SKIP depois de OK", async () => {
  const { CHECKS } = await import("../../scripts/lib/doctor.mjs");
  const { runChecks } = await import("../../scripts/lib/doctor.mjs");
  const fake = [
    { id: "z-skip", title: "skip", severity: "warn", destructive: false, run: () => ({ status: "SKIP", diagnosis: "n/a", repair: "" }) },
    { id: "a-ok", title: "ok", severity: "warn", destructive: false, run: () => ({ status: "OK", diagnosis: "ok", repair: "" }) },
  ];
  // runChecks ordena por SEV_RANK; injetamos via CHECKS temporário
  const saved = CHECKS.splice(0, CHECKS.length, ...fake);
  try {
    const r = await runChecks({ cwd: process.cwd(), which: () => false, exec: () => ({ status: 1 }), today: "2026-09-01" });
    assert.deepEqual(r.map(x => x.status), ["OK", "SKIP"]);
  } finally {
    CHECKS.splice(0, CHECKS.length, ...saved);
  }
});

test("o CLI imprime SKIP com ícone próprio e o conta no resumo", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-skip-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  const out = runCli(dir, ["--check", "plugin-declared-installed"]);
  // ambiente de teste sem ~/.claude/plugins do projeto → SKIP, não FAIL
  assert.match(out.stdout, /\[SKIP\]/);
  assert.doesNotMatch(out.stdout, /undefined \[SKIP\]/);
  assert.match(out.stdout, /SKIP/);
  rmSync(dir, { recursive: true, force: true });
});

test("SKIP não faz o doctor sair com código de erro", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-skip-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  const out = runCli(dir, ["--check", "plugin-declared-installed"]);
  assert.equal(out.status, 0);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/validation/test-doctor-skip-status.mjs`
Expected: FAIL — o segundo teste acusa `undefined [SKIP]` (o `ICON` não tem a chave) e o check `plugin-declared-installed` ainda não existe.

> Este teste usa o check `plugin-declared-installed` da Task 2, que já existe neste ponto: num
> repo temporário sem `~/.claude/plugins` ele devolve SKIP, que é exatamente o caminho a exercitar.

- [ ] **Step 3: Implementar o mínimo**

O `SEV_RANK` já conhece `SKIP` desde a Task 2. Falta o CLI. Em `scripts/doctor.mjs`:

```js
const ICON = { OK: "✓", WARN: "⚠", FAIL: "✗", SKIP: "–" };
```

```js
const counts = { OK: 0, WARN: 0, FAIL: 0, SKIP: 0 };
```

```js
  const skipNote = counts.SKIP > 0 ? ` · ${counts.SKIP} SKIP` : "";
  console.log(`  ${counts.FAIL} FAIL · ${counts.WARN} WARN · ${counts.OK} OK${skipNote}`);
```

O `process.exit(counts.FAIL > 0 ? 1 : 0)` e o `failCount` do ramo `--json` **não mudam**: SKIP não reprova.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/validation/test-doctor-skip-status.mjs tests/validation/test-doctor.mjs tests/validation/test-doctor-cli.mjs`
Expected: PASS — inclusive as duas suítes preexistentes, que assumiam três status.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/doctor.mjs scripts/doctor.mjs tests/validation/test-doctor-skip-status.mjs
git commit -m "feat(doctor): SKIP como quarto status

Um check pode nao conseguir verificar (CI, container, harness que nao e o
Claude Code). Reportar OK ali seria confianca falsa e reportar WARN encheria
esses ambientes de avisos permanentes. SKIP ordena depois de OK e nao altera
o exit code: ambiente onde a verificacao nao se aplica nao e reprovado."
```

---

### Task 4: checks `plugin-marketplace-known` e `plugin-up-to-date`

**Files:**
- Modify: `scripts/lib/doctor.mjs` (dois checks + registro)
- Test: `tests/validation/test-doctor-plugin-checks.mjs` (acrescenta casos)

**Interfaces:**
- Consumes: `readPluginEnv`, `installedFor` (Task 1); `parseVersion` de `scripts/lib/version-guard.mjs`
- Produces: checks `plugin-marketplace-known` e `plugin-up-to-date` no array `CHECKS`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `tests/validation/test-doctor-plugin-checks.mjs` (a função `scenario` já existe no arquivo):

```js
test("plugin-marketplace-known: FAIL quando o marketplace do plugin não está registrado", () => {
  const s = scenario({ declared: { "devflow@NEXUZ-SYS": true }, known: {} });
  const r = getCheck("plugin-marketplace-known").run(s.ctx);
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis, /NEXUZ-SYS/);
  s.cleanup();
});

test("plugin-marketplace-known: OK quando registrado", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    known: { "NEXUZ-SYS": { lastUpdated: "2026-09-01T00:00:00.000Z" } },
  });
  const r = getCheck("plugin-marketplace-known").run(s.ctx);
  assert.equal(r.status, "OK");
  s.cleanup();
});

test("plugin-up-to-date: WARN quando a versão instalada está atrás da publicada", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "1.30.0" }] },
    known: { "NEXUZ-SYS": { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { "NEXUZ-SYS": [{ name: "devflow", version: "3.1.0" }] },
  });
  const r = getCheck("plugin-up-to-date").run(s.ctx);
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /1\.30\.0/);
  assert.match(r.diagnosis, /3\.1\.0/);
  assert.match(r.repair, /devflow update/);
  s.cleanup();
});

test("plugin-up-to-date: OK quando instalada e publicada coincidem", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
    known: { "NEXUZ-SYS": { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { "NEXUZ-SYS": [{ name: "devflow", version: "3.1.0" }] },
  });
  const r = getCheck("plugin-up-to-date").run(s.ctx);
  assert.equal(r.status, "OK");
  s.cleanup();
});

test("plugin-up-to-date: versão não-semver não vira 'desatualizado'", () => {
  const s = scenario({
    declared: { "cli@mkt": true },
    installed: { "cli@mkt": [{ scope: "user", version: "2ec6eb594e2c" }] },
    known: { mkt: { lastUpdated: "2026-09-01T00:00:00.000Z" } },
    published: { mkt: [{ name: "cli", version: "9.9.9" }] },
  });
  const r = getCheck("plugin-up-to-date").run(s.ctx);
  assert.equal(r.status, "OK");
  assert.match(r.diagnosis, /não comparáve/i);
  s.cleanup();
});

test("plugin-up-to-date: WARN quando o catálogo está obsoleto (>7 dias)", () => {
  const s = scenario({
    declared: { "devflow@NEXUZ-SYS": true },
    installed: { "devflow@NEXUZ-SYS": [{ scope: "user", version: "3.1.0" }] },
    known: { "NEXUZ-SYS": { lastUpdated: "2026-08-01T00:00:00.000Z" } },
    published: { "NEXUZ-SYS": [{ name: "devflow", version: "3.1.0" }] },
  });
  const r = getCheck("plugin-up-to-date").run(s.ctx); // ctx.today = 2026-09-01
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /catálogo/i);
  s.cleanup();
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/validation/test-doctor-plugin-checks.mjs`
Expected: FAIL — `getCheck("plugin-marketplace-known")` devolve `undefined`.

- [ ] **Step 3: Implementar o mínimo**

No topo de `scripts/lib/doctor.mjs`, junto dos imports:

```js
import { parseVersion } from "./version-guard.mjs";
```

E os dois checks:

```js
const CATALOG_STALE_DAYS = 7;

const pluginMarketplaceKnown = {
  id: "plugin-marketplace-known",
  title: "Marketplaces dos plugins declarados estão registrados",
  severity: "critical",
  destructive: false,
  run(ctx) {
    const env = readPluginEnv({ cwd: ctx.cwd, home: ctx.home });
    if (env.harness !== "claude-code") return SKIP_NO_HARNESS;
    const needed = [...new Set(Object.values(env.declared).map(d => d.marketplace))];
    if (!needed.length) return { status: "OK", diagnosis: "O projeto não declara plugins.", repair: "" };
    const missing = needed.filter(m => !env.marketplaces[m]);
    if (missing.length) {
      return {
        status: "FAIL",
        diagnosis: `Marketplace(s) referenciado(s) pelo projeto e não registrado(s) nesta máquina: ${missing.join(", ")}.`,
        repair: "Registre com /plugin marketplace add <repo>, ou confirme extraKnownMarketplaces em .claude/settings.json.",
      };
    }
    return { status: "OK", diagnosis: `Os ${needed.length} marketplaces necessários estão registrados.`, repair: "" };
  },
};

// Dias inteiros entre duas datas ISO. Devolve null quando a data é inválida.
function daysBetween(isoA, isoB) {
  const a = Date.parse(isoA), b = Date.parse(isoB);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86400000);
}

const pluginUpToDate = {
  id: "plugin-up-to-date",
  title: "Plugins declarados estão atualizados",
  severity: "warn",
  destructive: false,
  run(ctx) {
    const env = readPluginEnv({ cwd: ctx.cwd, home: ctx.home });
    if (env.harness !== "claude-code") return SKIP_NO_HARNESS;
    const keys = Object.keys(env.declared);
    if (!keys.length) return { status: "OK", diagnosis: "O projeto não declara plugins.", repair: "" };

    const behind = [];
    const uncomparable = [];
    for (const key of keys) {
      const { name, marketplace } = env.declared[key];
      const entry = installedFor(env, key, ctx.cwd);
      const published = env.marketplaces[marketplace]?.published?.[name];
      if (!entry || !published) continue;
      const pi = parseVersion(entry.version), pp = parseVersion(published);
      if (!pi || !pp) { uncomparable.push(`${key} (${entry.version})`); continue; }
      for (let i = 0; i < 3; i++) {
        if (pi[i] !== pp[i]) { if (pi[i] < pp[i]) behind.push(`${key}: ${entry.version} → ${published}`); break; }
      }
    }
    if (behind.length) {
      return {
        status: "WARN",
        diagnosis: `Plugin(s) atrás da versão publicada — ${behind.join("; ")}.`,
        repair: "Rode /devflow update.",
      };
    }

    // Afirmar "atualizado" com base num catálogo velho é afirmação sem lastro.
    const stale = [...new Set(Object.values(env.declared).map(d => d.marketplace))]
      .filter(m => {
        const d = daysBetween(env.marketplaces[m]?.lastUpdated, `${ctx.today}T00:00:00.000Z`);
        return d != null && d > CATALOG_STALE_DAYS;
      });
    if (stale.length) {
      return {
        status: "WARN",
        diagnosis: `Nenhuma versão atrasada, mas o catálogo local de ${stale.join(", ")} tem mais de ${CATALOG_STALE_DAYS} dias — a comparação pode estar desatualizada.`,
        repair: "Rode /devflow update para atualizar o catálogo.",
      };
    }

    const note = uncomparable.length ? ` (não comparáveis, versão não-semver: ${uncomparable.join(", ")})` : "";
    return { status: "OK", diagnosis: `Todos os plugins declarados estão na versão publicada${note}.`, repair: "" };
  },
};
```

Registrar:

```js
export const CHECKS = [mcpConfigValid, mcpConnectivity, mempalaceHealth, devflowConfig, gitHooks, groundingMcp, permissionsHealth, adrInjection, harnessSensors, pluginDeclaredInstalled, pluginScope, pluginMarketplaceKnown, pluginUpToDate];
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/validation/test-doctor-plugin-checks.mjs tests/validation/test-doctor-skip-status.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/doctor.mjs tests/validation/test-doctor-plugin-checks.mjs
git commit -m "feat(doctor): checks de marketplace registrado e de versao atrasada

Cobre todos os plugins declarados pelo projeto, nao so o devflow. Versao
nao-semver (ha plugin instalado como SHA) e reportada como nao comparavel,
nunca como desatualizada. Catalogo local com mais de 7 dias vira WARN: dizer
'atualizado' a partir de um catalogo velho e afirmacao sem lastro."
```

---

### Task 5: separar o estado de execução das routines do arquivo versionado

**Files:**
- Modify: `scripts/lib/routines.mjs`
- Test: `tests/validation/test-routines-state-split.mjs`

**Interfaces:**
- Consumes: nada novo
- Produces:
  - `loadState(cwd) -> { [id]: { lastRun, nextRun, lastSuggested, snoozeUntil } }`
  - `isFirstContact(cwd) -> boolean` — verdadeiro quando `.context/runtime/routines-state.json` não existe
  - `loadRoutines(cwd)` passa a devolver cada routine **mesclada** com seu estado local, preservando a assinatura atual (`{ routines, path }`), de modo que `dueRoutines`, `shouldSuggest`, `markRun`, `snooze` e `setEnabled` continuam funcionando sem alteração de contrato.

- [ ] **Step 1: Escrever o teste que falha**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadRoutines, loadState, isFirstContact, markRun, snooze, markSuggested } from "../../scripts/lib/routines.mjs";

function repo(routinesJson) {
  const dir = mkdtempSync(join(tmpdir(), "routst-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  writeFileSync(join(dir, ".context", "routines.json"), JSON.stringify(routinesJson, null, 2));
  return dir;
}
const STATE = d => join(d, ".context", "runtime", "routines-state.json");
const DEF = d => JSON.parse(readFileSync(join(d, ".context", "routines.json"), "utf-8"));

test("sem arquivo de estado, é primeiro contato (clone novo)", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "1d", prompts: [] }] });
  assert.equal(isFirstContact(d), true);
  rmSync(d, { recursive: true, force: true });
});

test("markRun grava no estado local, não no arquivo versionado", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "1d", prompts: [] }] });
  markRun(d, "x", "2026-09-01");
  assert.equal(existsSync(STATE(d)), true);
  assert.equal(loadState(d).x.lastRun, "2026-09-01");
  assert.equal("lastRun" in DEF(d).routines[0], false);
  assert.equal(isFirstContact(d), false);
  rmSync(d, { recursive: true, force: true });
});

test("migra o formato antigo: estado sai do versionado e vai para o runtime", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "7d", lastRun: "2026-07-01", nextRun: "2026-07-08", lastSuggested: "2026-07-22", snoozeUntil: null, prompts: [] }] });
  const { routines } = loadRoutines(d);
  assert.equal(routines[0].lastRun, "2026-07-01");   // segue visível para os consumidores
  assert.equal(loadState(d).x.nextRun, "2026-07-08"); // agora mora no runtime
  const def = DEF(d).routines[0];
  assert.equal("lastRun" in def, false);
  assert.equal("lastSuggested" in def, false);
  assert.equal(def.frequency, "7d");                  // a definição sobrevive
  rmSync(d, { recursive: true, force: true });
});

test("a migração é idempotente e não reescreve um arquivo já limpo", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "7d", prompts: [] }] });
  const before = readFileSync(join(d, ".context", "routines.json"), "utf-8");
  loadRoutines(d);
  loadRoutines(d);
  assert.equal(readFileSync(join(d, ".context", "routines.json"), "utf-8"), before);
  rmSync(d, { recursive: true, force: true });
});

test("snooze e markSuggested também vão para o estado local", () => {
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "1d", prompts: [] }] });
  snooze(d, "x", 3, "2026-09-01");
  markSuggested(d, "x", "2026-09-01");
  const st = loadState(d);
  assert.equal(st.x.snoozeUntil, "2026-09-04");
  assert.equal(st.x.lastSuggested, "2026-09-01");
  assert.equal("snoozeUntil" in DEF(d).routines[0], false);
  rmSync(d, { recursive: true, force: true });
});

test("setEnabled continua no arquivo versionado (é definição, não estado)", async () => {
  const { setEnabled } = await import("../../scripts/lib/routines.mjs");
  const d = repo({ routines: [{ id: "x", enabled: true, frequency: "1d", prompts: [] }] });
  setEnabled(d, "x", false);
  assert.equal(DEF(d).routines[0].enabled, false);
  rmSync(d, { recursive: true, force: true });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/validation/test-routines-state-split.mjs`
Expected: FAIL — `loadState` e `isFirstContact` não são exportados.

- [ ] **Step 3: Implementar o mínimo**

Em `scripts/lib/routines.mjs`, acrescentar ao topo (junto do `file(cwd)` existente):

```js
// Campos de execução. Vivem por máquina em .context/runtime/ — nunca no
// arquivo versionado: numa cadência diária, uma máquina marcar "rodei hoje"
// silenciaria as outras, e o working tree acumularia diff a cada sessão.
const STATE_FIELDS = ["lastRun", "nextRun", "lastSuggested", "snoozeUntil"];

function stateFile(cwd) {
  return join(cwd, ".context", "runtime", "routines-state.json");
}

export function loadState(cwd) {
  try {
    return JSON.parse(readFileSync(stateFile(cwd), "utf-8"));
  } catch {
    return {};
  }
}

function saveState(cwd, state) {
  const path = stateFile(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

// Ausência do arquivo de estado é o sinal de clone novo: .context/runtime/ é
// gitignored, logo não vem no clone.
export function isFirstContact(cwd) {
  return !existsSync(stateFile(cwd));
}
```

Substituir `loadRoutines` por uma versão que migra e mescla:

```js
export function loadRoutines(cwd) {
  const path = file(cwd);
  if (!existsSync(path)) return { routines: [], path };
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { routines: [], path };
  }
  const defs = Array.isArray(data.routines) ? data.routines : [];

  // Migração do formato antigo: campos de estado no arquivo versionado.
  const state = loadState(cwd);
  let migrated = false;
  for (const r of defs) {
    for (const f of STATE_FIELDS) {
      if (f in r) {
        state[r.id] = state[r.id] || {};
        if (!(f in state[r.id])) state[r.id][f] = r[f];
        delete r[f];
        migrated = true;
      }
    }
  }
  if (migrated) {
    saveState(cwd, state);
    writeFileSync(path, JSON.stringify({ routines: defs }, null, 2) + "\n");
  }

  const routines = defs.map(r => ({ ...r, ...(state[r.id] || {}) }));
  return { routines, path };
}
```

Trocar o `update` interno para escrever no estado local (`markRun`, `snooze`, `markSuggested` passam a usá-lo; `setEnabled` continua escrevendo na definição):

```js
function updateState(cwd, id, fn) {
  const { routines } = loadRoutines(cwd);
  if (!routines.find(x => x.id === id)) return false;
  const state = loadState(cwd);
  state[id] = state[id] || {};
  fn(state[id]);
  saveState(cwd, state);
  return true;
}

export function markRun(cwd, id, today) {
  const { routines } = loadRoutines(cwd);
  const r = routines.find(x => x.id === id);
  if (!r) return false;
  return updateState(cwd, id, s => {
    s.lastRun = today;
    s.nextRun = nextRunFrom(today, r.frequency);
    s.snoozeUntil = null;
  });
}

export function snooze(cwd, id, days, today) {
  return updateState(cwd, id, s => { s.snoozeUntil = addDays(today, Number(days)); });
}

export function markSuggested(cwd, id, today) {
  return updateState(cwd, id, s => { s.lastSuggested = today; });
}
```

`setEnabled` permanece como está (usa o `update` original, que escreve na definição versionada — `enabled` é definição do time, não estado da máquina). Ajustar os imports do topo do arquivo para incluir `dirname` (já importado) e `mkdirSync` (já importado).

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/validation/test-routines-state-split.mjs && bash tests/hooks/test-session-start-routines.sh`
Expected: PASS nos dois — a suíte de hook preexistente valida que a guarda de 1x/dia continua funcionando com o estado no novo lugar.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/routines.mjs tests/validation/test-routines-state-split.mjs
git commit -m "fix(routines): estado de execucao sai do arquivo versionado

lastRun, nextRun, lastSuggested e snoozeUntil viviam em .context/routines.json,
que e versionado. Numa cadencia de 7 dias isso passava despercebido; numa
cadencia diaria e multi-maquina quebra: a maquina A marcar 'sugerido hoje'
silencia a B, e toda sessao suja o working tree.

Passam para .context/runtime/routines-state.json (gitignored, por maquina). A
ausencia desse arquivo vira o sinal de clone novo, sem flag adicional. A
definicao (id, description, enabled, frequency, prompts) segue versionada."
```

---

### Task 6: passo `type: check` e o grupo `plugin-env`

**Files:**
- Modify: `scripts/lib/routines.mjs` (grupos + seleção)
- Modify: `scripts/routines.mjs` (subcomando `run-checks`)
- Test: `tests/validation/test-routines-check-step.mjs`

**Interfaces:**
- Consumes: `loadRoutines`, `isFirstContact` (Task 5); `runChecks`, `getCheck` de `scripts/lib/doctor.mjs`
- Produces:
  - `CHECK_GROUPS = { "plugin-env": ["plugin-declared-installed", "plugin-scope", "plugin-marketplace-known", "plugin-up-to-date"] }`
  - `resolveCheckIds(value) -> string[]` — resolve um grupo ou um id avulso
  - CLI: `node scripts/routines.mjs run-checks --json` → `{ firstContact: boolean, ran: string[], results: [...] }`

- [ ] **Step 1: Escrever o teste que falha**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { resolveCheckIds, CHECK_GROUPS } from "../../scripts/lib/routines.mjs";

const CLI = resolve("scripts/routines.mjs");

test("o grupo plugin-env resolve para os quatro checks de plugin", () => {
  const ids = resolveCheckIds("plugin-env");
  assert.deepEqual(ids, ["plugin-declared-installed", "plugin-scope", "plugin-marketplace-known", "plugin-up-to-date"]);
});

test("um id avulso de check resolve para ele mesmo", () => {
  assert.deepEqual(resolveCheckIds("plugin-scope"), ["plugin-scope"]);
});

test("um value desconhecido resolve para lista vazia, sem lançar", () => {
  assert.deepEqual(resolveCheckIds("nao-existe"), []);
});

test("run-checks executa os passos check das routines vencidas e reporta firstContact", () => {
  const dir = mkdtempSync(join(tmpdir(), "rchk-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  writeFileSync(join(dir, ".context", "routines.json"), JSON.stringify({
    routines: [{ id: "daily-devflow-checkup", enabled: true, frequency: "1d", prompts: [{ type: "check", value: "plugin-env" }] }],
  }));
  const out = execFileSync("node", [CLI, "run-checks", "--json", "--today", "2026-09-01"], { cwd: dir, encoding: "utf-8" });
  const parsed = JSON.parse(out);
  assert.equal(parsed.firstContact, true);
  assert.deepEqual(parsed.ran, ["daily-devflow-checkup"]);
  assert.equal(parsed.results.length, 4);
  rmSync(dir, { recursive: true, force: true });
});

test("run-checks ignora passos command/skill (só o LLM os executa)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rchk-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  writeFileSync(join(dir, ".context", "routines.json"), JSON.stringify({
    routines: [{ id: "context-maintenance", enabled: true, frequency: "7d", prompts: [{ type: "command", value: "/devflow:devflow-doctor" }] }],
  }));
  const out = execFileSync("node", [CLI, "run-checks", "--json", "--today", "2026-09-01"], { cwd: dir, encoding: "utf-8" });
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed.results, []);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/validation/test-routines-check-step.mjs`
Expected: FAIL — `resolveCheckIds` não é exportado.

- [ ] **Step 3: Implementar o mínimo**

Em `scripts/lib/routines.mjs`:

```js
// Um passo `check` nomeia um GRUPO, não a lista de ids: acrescentar um check
// no futuro não deve exigir editar o routines.json de cada projeto.
export const CHECK_GROUPS = {
  "plugin-env": ["plugin-declared-installed", "plugin-scope", "plugin-marketplace-known", "plugin-up-to-date"],
  "mempalace-env": ["mempalace-env"],
};

export function resolveCheckIds(value) {
  if (CHECK_GROUPS[value]) return [...CHECK_GROUPS[value]];
  return Object.values(CHECK_GROUPS).some(ids => ids.includes(value)) ? [value] : [];
}
```

Em `scripts/routines.mjs`, acrescentar o subcomando antes do bloco de erro final:

```js
  if (cmd === "run-checks") {
    const { routines } = loadRoutines(cwd);
    const due = routines.filter(r => shouldSuggest(r, today));
    const ids = [];
    const ran = [];
    for (const r of due) {
      const stepIds = (r.prompts || [])
        .filter(p => p?.type === "check")
        .flatMap(p => resolveCheckIds(p.value));
      if (stepIds.length) { ran.push(r.id); ids.push(...stepIds); }
    }
    const firstContact = isFirstContact(cwd);
    let results = [];
    if (ids.length) {
      const { runChecks } = await import("./lib/doctor.mjs");
      const ctx = { cwd, home: homedir(), which: () => false, exec: () => ({ status: 1, stdout: "", stderr: "" }), today };
      results = await runChecks(ctx, [...new Set(ids)]);
    }
    for (const id of ran) markRun(cwd, id, today);
    console.log(JSON.stringify({ firstContact, ran, results }));
    return process.exit(0);
  }
```

Isso exige tornar `main` assíncrona (`async function main()` e `main();` no fim já funciona) e acrescentar aos imports do topo:

```js
import { homedir } from "node:os";
import { loadRoutines, dueRoutines, shouldSuggest, snooze, setEnabled, markRun, markSuggested, isFirstContact, resolveCheckIds } from "./lib/routines.mjs";
```

> Os checks de plugin não usam `which` nem `exec` — os stubs acima existem só para satisfazer a forma do `ctx` compartilhada com os nove checks preexistentes.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/validation/test-routines-check-step.mjs`
Expected: PASS, 5 testes

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/routines.mjs scripts/routines.mjs tests/validation/test-routines-check-step.mjs
git commit -m "feat(routines): passo do tipo check, executavel sem LLM

Ate aqui todo passo de routine era um slash-command ou skill, que so o LLM
executa — por isso o hook so podia sugerir, e sugestao nao sobrevive: a
routine context-maintenance acumulou 41 dias e zero execucoes.

Um passo 'check' nomeia um grupo de checks do doctor e roda em node. O grupo,
e nao a lista de ids, para que acrescentar um check nao exija editar o
routines.json de cada projeto."
```

---

### Task 7: bloco `DEVFLOW_ENV_CHECKUP` no `session-start`

**Files:**
- Modify: `hooks/session-start` (novo bloco após o de routines, linha ~320)
- Test: `tests/hooks/test-session-start-checkup.sh`

**Interfaces:**
- Consumes: `node scripts/routines.mjs run-checks --json` (Task 6)
- Produces: bloco `<DEVFLOW_ENV_CHECKUP>` no contexto da sessão.

- [ ] **Step 1: Escrever o teste que falha**

```bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TESTS_PASSED=0; TESTS_FAILED=0; TESTS_TOTAL=0
RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

assert_contains() {
  local desc="$1" hay="$2" needle="$3"; TESTS_TOTAL=$((TESTS_TOTAL+1))
  if printf '%s' "$hay" | grep -qF -- "$needle"; then echo -e "  ${GREEN}✓${NC} $desc"; TESTS_PASSED=$((TESTS_PASSED+1))
  else echo -e "  ${RED}✗${NC} $desc"; echo "    expected: $needle"; TESTS_FAILED=$((TESTS_FAILED+1)); fi
}
assert_not_contains() {
  local desc="$1" hay="$2" needle="$3"; TESTS_TOTAL=$((TESTS_TOTAL+1))
  if printf '%s' "$hay" | grep -qF -- "$needle"; then echo -e "  ${RED}✗${NC} $desc"; echo "    must NOT contain: $needle"; TESTS_FAILED=$((TESTS_FAILED+1))
  else echo -e "  ${GREEN}✓${NC} $desc"; TESTS_PASSED=$((TESTS_PASSED+1)); fi
}

TMPROOT=$(mktemp -d); trap 'rm -rf "$TMPROOT"' EXIT

CHECKUP='{"routines":[{"id":"daily-devflow-checkup","description":"ambiente","enabled":true,"frequency":"1d","prompts":[{"type":"check","value":"plugin-env"}]}]}'

# HOME sintetico: sem ~/.claude/plugins os checks dao SKIP; com ele e um plugin
# declarado e ausente, dao FAIL.
mkrepo() { # $1 = routines.json, $2 = enabledPlugins json ("" = sem .claude/settings.json)
  local d; d=$(mktemp -d "$TMPROOT/proj.XXXXXX"); mkdir -p "$d/.context"
  printf '%s' "$1" > "$d/.context/routines.json"
  if [ -n "${2:-}" ]; then mkdir -p "$d/.claude"; printf '%s' "$2" > "$d/.claude/settings.json"; fi
  printf '%s' "$d"
}
mkhome() { # cria um HOME com ~/.claude/plugins vazio
  local h; h=$(mktemp -d "$TMPROOT/home.XXXXXX")
  mkdir -p "$h/.claude/plugins"
  printf '%s' '{"version":2,"plugins":{}}' > "$h/.claude/plugins/installed_plugins.json"
  printf '%s' '{}' > "$h/.claude/plugins/known_marketplaces.json"
  printf '%s' '{"enabledPlugins":{}}' > "$h/.claude/settings.json"
  printf '%s' "$h"
}
run_hook() { # $1 = workdir, $2 = today, $3 = HOME
  ( cd "$1" && HOME="$3" DEVFLOW_TODAY="$2" CLAUDE_PLUGIN_ROOT="$PROJECT_ROOT" bash "${PROJECT_ROOT}/hooks/session-start" 2>/dev/null || true )
}

echo "=== SessionStart env checkup ==="

# 1. bootstrap com tudo OK → fala
home=$(mkhome)
repo=$(mkrepo "$CHECKUP" '{"enabledPlugins":{}}')
out=$(run_hook "$repo" "2026-09-01" "$home")
assert_contains "bootstrap emite o bloco" "$out" "DEVFLOW_ENV_CHECKUP"
assert_contains "bootstrap confirma o ambiente" "$out" "Ambiente OK"

# 2. segunda sessao no mesmo dia → silencio
out=$(run_hook "$repo" "2026-09-01" "$home")
assert_not_contains "nao repete no mesmo dia" "$out" "DEVFLOW_ENV_CHECKUP"

# 3. dia seguinte com tudo OK → silencio (nao e mais bootstrap)
out=$(run_hook "$repo" "2026-09-02" "$home")
assert_not_contains "dia novo com tudo OK fica em silencio" "$out" "DEVFLOW_ENV_CHECKUP"

# 4. dia seguinte com plugin declarado e ausente → fala
home2=$(mkhome)
repo2=$(mkrepo "$CHECKUP" '{"enabledPlugins":{"devflow@NEXUZ-SYS":true}}')
run_hook "$repo2" "2026-09-01" "$home2" >/dev/null   # consome o bootstrap
out=$(run_hook "$repo2" "2026-09-02" "$home2")
assert_contains "dia novo com plugin ausente emite diagnostico" "$out" "DEVFLOW_ENV_CHECKUP"
assert_contains "nomeia o plugin ausente" "$out" "devflow@NEXUZ-SYS"

# 5. routines.json corrompido → nao trava a sessao
repo3=$(mkrepo '{ nao e json' "")
out=$(run_hook "$repo3" "2026-09-01" "$home")
assert_not_contains "json corrompido nao emite bloco" "$out" "DEVFLOW_ENV_CHECKUP"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SessionStart env checkup: ${TESTS_PASSED}/${TESTS_TOTAL} passed"
[ "$TESTS_FAILED" -gt 0 ] && { echo -e "  ${RED}${TESTS_FAILED} FAILED${NC}"; exit 1; } || echo -e "  ${GREEN}All passed${NC}"
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bash tests/hooks/test-session-start-checkup.sh`
Expected: FAIL — o bloco `DEVFLOW_ENV_CHECKUP` não é emitido.

- [ ] **Step 3: Implementar o mínimo**

Em `hooks/session-start`, logo após o bloco de routines (que termina na linha ~321), acrescentar:

```bash
# --- Env checkup (1x/dia por máquina, executado — não sugerido) ---
# Roda os passos `check` das routines vencidas. Fala no primeiro contato após o
# clone (estado ausente) e, nos demais dias, só quando há divergência. Toda
# falha é silenciosa: um checkup de ambiente jamais trava uma sessão.

env_checkup_ctx=""
if [ -f "${project_root}/.context/routines.json" ] && command -v node >/dev/null 2>&1; then
  checkup_json=$(cd "${project_root}" && node "${PLUGIN_ROOT}/scripts/routines.mjs" run-checks --json 2>/dev/null || true)
  if [ -n "$checkup_json" ]; then
    checkup_text=$(printf '%s' "$checkup_json" | node -e '
      let raw = "";
      process.stdin.on("data", d => raw += d);
      process.stdin.on("end", () => {
        let p;
        try { p = JSON.parse(raw); } catch { process.exit(0); }
        const results = p.results || [];
        if (!results.length) process.exit(0);
        const bad = results.filter(r => r.status === "FAIL" || r.status === "WARN");
        if (bad.length) {
          const lines = bad.map(r => `[${r.status}] ${r.title}: ${r.diagnosis}${r.repair ? ` → ${r.repair}` : ""}`);
          process.stdout.write("Checkup de ambiente do DevFlow encontrou divergências:\n" + lines.join("\n"));
        } else if (p.firstContact) {
          const ok = results.filter(r => r.status === "OK").length;
          const skipped = results.filter(r => r.status === "SKIP").length;
          if (ok > 0) process.stdout.write(`Ambiente OK, plugins verificados e todos atualizados (${ok} verificações).`);
          else if (skipped > 0) process.exit(0);
        }
      });
    ' 2>/dev/null || true)
    if [ -n "$checkup_text" ]; then
      checkup_escaped=$(escape_for_json "$checkup_text")
      env_checkup_ctx="\\n<DEVFLOW_ENV_CHECKUP>\\n${checkup_escaped}\\n</DEVFLOW_ENV_CHECKUP>\\n"
    fi
  fi
fi
```

Acrescentar `${env_checkup_ctx}` à montagem do contexto final, no mesmo ponto em que `${routines_due_ctx}` é concatenado.

> `SKIP` nunca gera bloco: num ambiente que não é o Claude Code o checkup se cala em vez de afirmar qualquer coisa.

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bash tests/hooks/test-session-start-checkup.sh && bash tests/hooks/test-session-start-routines.sh && bash tests/hooks/test-session-start.sh`
Expected: PASS nos três — as duas suítes preexistentes não podem regredir.

- [ ] **Step 5: Commit**

```bash
git add hooks/session-start tests/hooks/test-session-start-checkup.sh
git commit -m "feat(hooks): checkup de ambiente executado no inicio do dia

O hook passa a EXECUTAR os passos check das routines vencidas, em vez de
sugerir. Fala no primeiro contato pos-clone e, nos demais dias, so quando ha
divergencia. SKIP nao gera bloco: fora do Claude Code o checkup se cala em vez
de afirmar. Qualquer falha e silenciosa — nunca travar uma sessao."
```

---

### Task 8: routine versionada, scaffold e documentação

**Files:**
- Modify: `templates/routines.json`
- Modify: `.context/routines.json` (dogfooding deste repo)
- Modify: `skills/routines/SKILL.md`
- Modify: `CHANGELOG.md`
- Test: `tests/validation/test-routines-template.mjs`

**Interfaces:**
- Consumes: `CHECK_GROUPS` (Task 6)
- Produces: a routine `daily-devflow-checkup` disponível para novos projetos via scaffold.

- [ ] **Step 1: Escrever o teste que falha**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECK_GROUPS } from "../../scripts/lib/routines.mjs";

const STATE_FIELDS = ["lastRun", "nextRun", "lastSuggested", "snoozeUntil"];

for (const path of ["templates/routines.json", ".context/routines.json"]) {
  test(`${path}: traz a routine daily-devflow-checkup com passo check válido`, () => {
    const { routines } = JSON.parse(readFileSync(path, "utf-8"));
    const r = routines.find(x => x.id === "daily-devflow-checkup");
    assert.ok(r, "routine daily-devflow-checkup ausente");
    assert.equal(r.frequency, "1d");
    assert.equal(r.enabled, true);
    const steps = r.prompts.filter(p => p.type === "check");
    assert.ok(steps.length >= 2, "esperados os passos plugin-env e mempalace-env");
    for (const step of steps) {
      assert.ok(CHECK_GROUPS[step.value], `grupo desconhecido: ${step.value}`);
    }
  });

  test(`${path}: não carrega campos de estado (eles vivem em .context/runtime/)`, () => {
    const { routines } = JSON.parse(readFileSync(path, "utf-8"));
    for (const r of routines) {
      for (const f of STATE_FIELDS) {
        assert.equal(f in r, false, `${r.id} ainda carrega o campo de estado '${f}'`);
      }
    }
  });

  test(`${path}: preserva a routine context-maintenance`, () => {
    const { routines } = JSON.parse(readFileSync(path, "utf-8"));
    assert.ok(routines.find(x => x.id === "context-maintenance"), "context-maintenance foi perdida");
  });
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/validation/test-routines-template.mjs`
Expected: FAIL — `routine daily-devflow-checkup ausente`, e os campos de estado ainda presentes em `.context/routines.json`.

- [ ] **Step 3: Implementar o mínimo**

Acrescentar a routine em **ambos** os arquivos, preservando a `context-maintenance` já existente e sem campos de estado:

```json
{
  "routines": [
    {
      "id": "context-maintenance",
      "description": "Health-check do contexto DevFlow (MCP, MemPalace, config) a cada 7 dias",
      "enabled": true,
      "frequency": "7d",
      "prompts": [
        { "type": "command", "value": "/devflow:devflow-doctor" }
      ]
    },
    {
      "id": "daily-devflow-checkup",
      "description": "Verifica 1x/dia se os plugins declarados pelo projeto estão instalados, no escopo certo e atualizados nesta máquina",
      "enabled": true,
      "frequency": "1d",
      "prompts": [
        { "type": "check", "value": "plugin-env" },
        { "type": "check", "value": "mempalace-env" }
      ]
    }
  ]
}
```

Em `skills/routines/SKILL.md`, acrescentar à seção de subcomandos, após a descrição de `run <id>`:

```markdown
### Tipos de passo

| `type` | Quem executa | Quando roda |
|---|---|---|
| `check` | o **hook**, em node, sem LLM | automaticamente, na 1ª sessão do dia |
| `command` | o LLM (slash-command) | quando você roda `run <id>` |
| `skill` | o LLM (Skill tool) | quando você roda `run <id>` |
| `agent` | o LLM (Agent tool) | quando você roda `run <id>` |

Passos `check` nomeiam um **grupo** de checks do doctor (ver `CHECK_GROUPS` em
`scripts/lib/routines.mjs`), não uma lista de ids — acrescentar um check ao grupo não
exige editar o `routines.json` de cada projeto.

### Onde mora o estado

A **definição** (`id`, `description`, `enabled`, `frequency`, `prompts`) fica em
`.context/routines.json`, versionado: o time compartilha a agenda e ela replica entre
dispositivos via clone. O **estado de execução** (`lastRun`, `nextRun`, `lastSuggested`,
`snoozeUntil`) fica em `.context/runtime/routines-state.json`, gitignored: cada máquina tem o
seu próprio "hoje", e a ausência do arquivo é o sinal de clone novo.
```

No `CHANGELOG.md`, na seção `[Unreleased]` (o repo usa `versioning: pipeline` — **não** faça bump local):

```markdown
### Added
- **Checkup de ambiente no início do dia** — na 1ª sessão do dia em cada máquina, o hook verifica se os plugins declarados em `.claude/settings.json` estão instalados, no escopo certo e atualizados, e reporta só quando há divergência. Fala no primeiro contato após o clone.
- **`doctor`: quatro checks de plugin** — `plugin-declared-installed`, `plugin-scope`, `plugin-marketplace-known` e `plugin-up-to-date`, disponíveis também via `/devflow:devflow-doctor`.
- **`doctor`: status `SKIP`** — para checks que não se aplicam ao ambiente (CI, container, harness que não é o Claude Code). Não altera o exit code.
- **`routines`: passo do tipo `check`** — executável pelo hook sem LLM.

### Fixed
- **`routines`: estado de execução saiu do arquivo versionado** para `.context/runtime/routines-state.json`. Antes, numa cadência diária, uma máquina marcar "rodei hoje" silenciava as demais, e toda sessão sujava o working tree.
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `bash tests/run-lint.sh && bash tests/run-unit.sh && bash tests/run-e2e.sh`
Expected: PASS nos três. Nenhuma suíte preexistente pode regredir.

- [ ] **Step 5: Commit**

```bash
git add templates/routines.json .context/routines.json skills/routines/SKILL.md CHANGELOG.md tests/validation/test-routines-template.mjs
git commit -m "feat(routines): routine daily-devflow-checkup e documentacao

Scaffold verbatim em templates/routines.json (ADR ci-scaffold-verbatim-
provenance): ao aplicar num projeto que ja tem routines.json, a routine e
acrescentada por merge, nunca sobrescrevendo as do usuario. Documenta os
quatro tipos de passo e a separacao definicao-versionada/estado-local.

versioning: pipeline — sem bump local; as entradas ficam em [Unreleased]."
```

---

### Task 9: seed incremental de routines (para projetos que já têm `routines.json`)

**Files:**
- Create: `scripts/lib/routines-seed.mjs`
- Modify: `skills/config/SKILL.md:645-651` (§4.6)
- Test: `tests/validation/test-routines-seed.mjs`

**Interfaces:**
- Consumes: `loadRoutines` (Task 5)
- Produces: `seedRoutines(cwd, templatePath) -> { added: string[], kept: string[] }`

**Por que esta task existe.** O §4.6 da skill `config` faz
`[ -f .context/routines.json ] || cp .../templates/routines.json .context/routines.json`. É
não-destrutivo, mas o efeito colateral é que **um projeto que já tem `routines.json` nunca
recebe uma routine nova**. Sem esta task a feature funcionaria apenas neste repositório, onde o
arquivo é editado à mão, e não chegaria a nenhum projeto-cliente existente.

- [ ] **Step 1: Escrever o teste que falha**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { seedRoutines } from "../../scripts/lib/routines-seed.mjs";

function setup(existing) {
  const dir = mkdtempSync(join(tmpdir(), "rseed-"));
  mkdirSync(join(dir, ".context"), { recursive: true });
  if (existing) writeFileSync(join(dir, ".context", "routines.json"), JSON.stringify(existing, null, 2));
  const tpl = join(dir, "template.json");
  writeFileSync(tpl, JSON.stringify({
    routines: [
      { id: "context-maintenance", description: "do template", enabled: true, frequency: "7d", prompts: [{ type: "command", value: "/devflow:devflow-doctor" }] },
      { id: "daily-devflow-checkup", description: "novo", enabled: true, frequency: "1d", prompts: [{ type: "check", value: "plugin-env" }] },
    ],
  }, null, 2));
  return { dir, tpl, read: () => JSON.parse(readFileSync(join(dir, ".context", "routines.json"), "utf-8")) };
}

test("acrescenta a routine nova sem tocar na que o usuário já tinha", () => {
  const s = setup({ routines: [{ id: "context-maintenance", description: "EDITADO PELO USUARIO", enabled: false, frequency: "30d", prompts: [] }] });
  const r = seedRoutines(s.dir, s.tpl);
  assert.deepEqual(r.added, ["daily-devflow-checkup"]);
  assert.deepEqual(r.kept, ["context-maintenance"]);
  const out = s.read().routines;
  const kept = out.find(x => x.id === "context-maintenance");
  assert.equal(kept.description, "EDITADO PELO USUARIO");
  assert.equal(kept.enabled, false);
  assert.equal(kept.frequency, "30d");
  assert.ok(out.find(x => x.id === "daily-devflow-checkup"));
  rmSync(s.dir, { recursive: true, force: true });
});

test("cria o arquivo inteiro quando ele não existe", () => {
  const s = setup(null);
  const r = seedRoutines(s.dir, s.tpl);
  assert.deepEqual(r.added.sort(), ["context-maintenance", "daily-devflow-checkup"]);
  assert.equal(s.read().routines.length, 2);
  rmSync(s.dir, { recursive: true, force: true });
});

test("é idempotente: rodar duas vezes não duplica nem reescreve", () => {
  const s = setup(null);
  seedRoutines(s.dir, s.tpl);
  const before = readFileSync(join(s.dir, ".context", "routines.json"), "utf-8");
  const r = seedRoutines(s.dir, s.tpl);
  assert.deepEqual(r.added, []);
  assert.equal(readFileSync(join(s.dir, ".context", "routines.json"), "utf-8"), before);
  rmSync(s.dir, { recursive: true, force: true });
});

test("uma routine que o usuário apagou de propósito não é ressuscitada se ele desabilitou", () => {
  // routine presente porém enabled:false continua presente e desabilitada
  const s = setup({ routines: [{ id: "daily-devflow-checkup", enabled: false, frequency: "1d", prompts: [{ type: "check", value: "plugin-env" }] }] });
  const r = seedRoutines(s.dir, s.tpl);
  assert.equal(r.added.includes("daily-devflow-checkup"), false);
  assert.equal(s.read().routines.find(x => x.id === "daily-devflow-checkup").enabled, false);
  rmSync(s.dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/validation/test-routines-seed.mjs`
Expected: FAIL com `Cannot find module '.../scripts/lib/routines-seed.mjs'`

- [ ] **Step 3: Implementar o mínimo**

```js
// routines-seed — acrescenta ao projeto as routines do template que ele ainda
// não tem, por id. Nunca altera uma routine existente: o usuário pode ter
// editado descrição, cadência ou desabilitado, e essa escolha é dele.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return fallback;
  }
}

export function seedRoutines(cwd, templatePath) {
  const target = join(cwd, ".context", "routines.json");
  const tpl = readJson(templatePath, { routines: [] });
  const current = existsSync(target) ? readJson(target, { routines: [] }) : { routines: [] };
  const routines = Array.isArray(current.routines) ? current.routines : [];
  const have = new Set(routines.map(r => r.id));

  const added = [];
  for (const r of tpl.routines || []) {
    if (!r?.id || have.has(r.id)) continue;
    routines.push(r);
    added.push(r.id);
  }
  if (added.length || !existsSync(target)) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify({ routines }, null, 2) + "\n");
  }
  return { added, kept: [...have] };
}
```

Em `skills/config/SKILL.md`, substituir a linha do `cp` condicional (§4.6) por:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/lib/routines-seed.mjs" "$PWD" "$CLAUDE_PLUGIN_ROOT/templates/routines.json"
```

e acrescentar um `main` guardado ao fim de `routines-seed.mjs`, no padrão já usado por
`scripts/lib/detect-installed-runtimes.mjs`:

```js
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , cwd, tpl] = process.argv;
  process.stdout.write(JSON.stringify(seedRoutines(cwd || process.cwd(), tpl)) + "\n");
}
```

Atualizar também o texto do §4.6 e a tabela de §4 (linha "Rotinas de manutenção"), que hoje diz
"criar `.context/routines.json` (só se ausente)", para "acrescentar as routines ausentes,
preservando as existentes".

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/validation/test-routines-seed.mjs tests/validation/test-routines-template.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/routines-seed.mjs skills/config/SKILL.md tests/validation/test-routines-seed.mjs
git commit -m "fix(config): seed incremental de routines em projetos existentes

O §4.6 copiava o template so quando .context/routines.json estava ausente,
de modo que um projeto ja configurado jamais receberia uma routine nova — o
checkup diario funcionaria apenas neste repo e nao chegaria a nenhum
projeto-cliente. O seed passa a acrescentar por id as routines ausentes,
sem tocar nas existentes: descricao, cadencia e enabled sao escolha do time."
```

---

### Task 10: check `mempalace-env`

**Files:**
- Modify: `scripts/lib/doctor.mjs` (check novo + registro)
- Test: `tests/validation/test-doctor-mempalace-env.mjs`

**Interfaces:**
- Consumes: `readBlockField` de `scripts/lib/devflow-config.mjs` (já importado no arquivo); `ctx.home` (Task 2); `ctx.which`
- Produces: check `mempalace-env` no array `CHECKS` e no grupo `mempalace-env`.

**Por que esta task existe.** Num dispositivo novo, o MemPalace ausente significa nenhuma memória
de longo prazo — e o `mempalace-health` atual devolve **OK** nesse caso ("MemPalace não instalado —
nada a checar"): verde sobre a ausência total. Quando o `.devflow.yaml` do projeto declara
`mempalace.enabled: true`, o MemPalace ausente é divergência de ambiente, não um "não se aplica".

**Orçamento.** `which` + leitura de um JSON + um `existsSync`: ~1 ms. O check **não** conta
drawers nem valida wing — isso exige `mempalace status`, medido em ~600 ms, doze vezes o orçamento
inteiro do checkup diário. Essa parte fica no `mempalace-health`, sob demanda.

- [ ] **Step 1: Escrever o teste que falha**

```js
#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getCheck } from "../../scripts/lib/doctor.mjs";

function scenario({ enabled = true, hasBin = true, palaceExists = true, writeConfig = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mpenv-"));
  const home = join(root, "home");
  const cwd = join(root, "proj");
  mkdirSync(join(cwd, ".context"), { recursive: true });
  writeFileSync(join(cwd, ".context", ".devflow.yaml"), `git:\n  strategy: branch-flow\nmempalace:\n  enabled: ${enabled}\n  budget: 1000\n`);
  const palace = join(home, ".mempalace", "palace");
  mkdirSync(join(home, ".mempalace"), { recursive: true });
  if (palaceExists) mkdirSync(palace, { recursive: true });
  if (writeConfig) writeFileSync(join(home, ".mempalace", "config.json"), JSON.stringify({ palace_path: palace }));
  return {
    ctx: { cwd, home, which: b => (b === "mempalace" ? hasBin : false), exec: () => ({ status: 1, stdout: "", stderr: "" }), today: "2026-09-01" },
    palace,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("OK quando o projeto não exige MemPalace", () => {
  const s = scenario({ enabled: false, hasBin: false });
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "OK");
  assert.match(r.diagnosis, /não exig/i);
  s.cleanup();
});

test("FAIL quando o projeto exige e o binário não está instalado", () => {
  const s = scenario({ hasBin: false });
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "FAIL");
  assert.match(r.diagnosis, /não instalado|ausente/i);
  assert.ok(r.repair.length > 0);
  s.cleanup();
});

test("FAIL quando o palace_path do config não existe", () => {
  const s = scenario({ palaceExists: false });
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "FAIL");
  assert.match(r.repair, /mempalace init/);
  s.cleanup();
});

test("WARN quando o binário existe mas não há config.json", () => {
  const s = scenario({ writeConfig: false });
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "WARN");
  s.cleanup();
});

test("OK informa qual palace está em uso", () => {
  const s = scenario({});
  const r = getCheck("mempalace-env").run(s.ctx);
  assert.equal(r.status, "OK");
  assert.match(r.diagnosis, new RegExp(s.palace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  s.cleanup();
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/validation/test-doctor-mempalace-env.mjs`
Expected: FAIL — `getCheck("mempalace-env")` devolve `undefined`.

- [ ] **Step 3: Implementar o mínimo**

Em `scripts/lib/doctor.mjs` (o `readBlockField` já está importado no topo do arquivo):

```js
// O mempalace-health existente devolve OK quando o MemPalace nao esta instalado.
// Quando o projeto DECLARA mempalace.enabled: true, ausencia e divergencia de
// ambiente — num dispositivo novo, significa nenhuma memoria de longo prazo.
const mempalaceEnv = {
  id: "mempalace-env",
  title: "MemPalace exigido pelo projeto está utilizável nesta máquina",
  severity: "critical",
  destructive: false,
  run(ctx) {
    const cfgPath = join(ctx.cwd, ".context", ".devflow.yaml");
    if (!existsSync(cfgPath)) {
      return { status: "OK", diagnosis: "Sem .devflow.yaml — o projeto não exige MemPalace.", repair: "" };
    }
    let raw = "";
    try { raw = readFileSync(cfgPath, "utf-8"); } catch { /* ignore */ }
    const enabled = String(readBlockField(raw, "mempalace", "enabled") || "").replace(/['"]/g, "").trim();
    if (enabled !== "true") {
      return { status: "OK", diagnosis: "O projeto não exige MemPalace (mempalace.enabled ≠ true).", repair: "" };
    }
    if (!ctx.which("mempalace")) {
      return {
        status: "FAIL",
        diagnosis: "O projeto declara mempalace.enabled: true, mas o binário mempalace não está no PATH — esta máquina não tem memória de longo prazo.",
        repair: "Instale o MemPalace e rode 'mempalace init'.",
      };
    }
    const confPath = join(ctx.home, ".mempalace", "config.json");
    if (!existsSync(confPath)) {
      return {
        status: "WARN",
        diagnosis: "MemPalace instalado, mas sem ~/.mempalace/config.json — o caminho do palace é indeterminado.",
        repair: "Rode 'mempalace init'.",
      };
    }
    let palacePath = "";
    try { palacePath = JSON.parse(readFileSync(confPath, "utf-8")).palace_path || ""; } catch { /* ignore */ }
    if (!palacePath || !existsSync(palacePath)) {
      return {
        status: "FAIL",
        diagnosis: `O palace apontado pelo config não existe: ${palacePath || "(vazio)"}.`,
        repair: "Rode 'mempalace init'.",
      };
    }
    return { status: "OK", diagnosis: `MemPalace utilizável; palace em ${palacePath}.`, repair: "" };
  },
};
```

Registrar no array, após os quatro checks de plugin:

```js
export const CHECKS = [mcpConfigValid, mcpConnectivity, mempalaceHealth, devflowConfig, gitHooks, groundingMcp, permissionsHealth, adrInjection, harnessSensors, pluginDeclaredInstalled, pluginScope, pluginMarketplaceKnown, pluginUpToDate, mempalaceEnv];
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/validation/test-doctor-mempalace-env.mjs tests/validation/test-doctor.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/doctor.mjs tests/validation/test-doctor-mempalace-env.mjs
git commit -m "feat(doctor): check de MemPalace exigido pelo projeto

O mempalace-health devolve OK quando o MemPalace nao esta instalado — verde
sobre a ausencia total de memoria de longo prazo, exatamente o que um
dispositivo recem-clonado encontra. Quando o .devflow.yaml declara
mempalace.enabled: true, ausencia do binario ou palace inexistente passam a
ser FAIL, e o diagnostico informa qual palace esta em uso.

Barato de proposito (~1ms): nao conta drawers nem valida wing, o que exigiria
mempalace status (~600ms, doze vezes o orcamento do checkup diario)."
```

---

## Notas para a fase R (Review)

Pontos que merecem atenção do revisor, por serem onde este plano pode estar errado:

1. **Task 5 reescreve o `.context/routines.json` versionado uma vez.** É a migração e é intencional, mas significa que a primeira sessão após o merge produz um diff no repo do usuário. Confirmar que isso é aceitável e que está no CHANGELOG.
2. **A ordem `installedFor`** prefere `scope: "project"` com `projectPath` igual ao `cwd`. Em worktree, o `cwd` é o caminho da worktree, não o do repo principal — a entrada pode não casar e cair no fallback de escopo user. Verificar se isso produz falso `FAIL` (a memória do projeto registra que worktree × permissions.yaml já falhou fechado uma vez).
3. **`markRun` é chamado em `run-checks` mesmo quando o resultado é SKIP**, o que consome o "dia" num ambiente onde nada foi verificado. É o comportamento correto? A alternativa é só marcar quando houve verificação real.
4. **O `ctx` de `run-checks` passa `which`/`exec` como stubs.** Se um dia um check de plugin precisar deles, o stub silencioso vira bug difícil de achar.
5. **A Task 9 mudou o §4.6 da skill `config` de `cp` para um script.** Confirmar que rodar `/devflow config` num projeto-cliente com `routines.json` editado à mão de fato preserva tudo — este é o caminho que alcança os projetos que não são este repositório.
6. **`test-doctor.mjs` e `test-doctor-cli.mjs` chamam `runChecks` sem passar `home`**, logo os quatro checks novos leem o `HOME` real de quem roda a suíte. Numa máquina de dev dá OK; num runner de CI sem `~/.claude/plugins` dá SKIP. O resultado difere por ambiente — avaliar se essas suítes devem passar um `home` fixo de fixture.
7. **O `mempalace-env` (Task 10) lê `mempalace.enabled` com `readBlockField`.** O parser já mordeu este repo uma vez: comentário inline capturado junto do valor fez o `grounding-mcp` acusar ausência de um server presente. Confirmar que `enabled: true  # comentário` é lido como `true`.
8. **A Task 9 não remove routines** que saíram do template. É deliberado (o usuário pode depender delas), mas significa que uma routine descontinuada persiste para sempre nos projetos que já a têm.
