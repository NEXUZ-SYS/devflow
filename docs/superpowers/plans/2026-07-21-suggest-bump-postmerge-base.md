# `suggest-bump` resolve a base pelo último release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `suggest-bump.mjs` derivar a base do último release em vez de `origin/main`, para que o signpost do Step 8.1 pare de sugerir `patch` sempre que roda depois do merge.

**Architecture:** O helper ganha uma função exportada `resolveBase(cwd)` que tenta `git describe --tags --abbrev=0` em três tiers de `--match` (do mais específico ao mais frouxo) e cai em `origin/main` quando não há tag alguma. `suggestBump(messages)` permanece intocada. O `stdout` continua sendo só `patch|minor|major`; a procedência vai para `stderr`.

**Tech Stack:** Node ESM puro (`node:child_process`), `node --test`, git ≥ 2.28 (fixtures usam `git init -b`).

**Spec:** [`docs/superpowers/specs/2026-07-21-suggest-bump-postmerge-base-design.md`](../specs/2026-07-21-suggest-bump-postmerge-base-design.md)

## Global Constraints

- **Zero dependências** além de `node:child_process` — o helper roda em projeto-cliente via `${CLAUDE_PLUGIN_ROOT}`.
- **Git só por `execFileSync` com argv.** O guard `tests/lib/finalize/finalize-pure.test.mjs` roda sobre todo `.mjs` em `scripts/lib/finalize/` e reprova `eval(`, `new Function(`, `shell: true`, `execSync(`, `fetch(` e `import(` dinâmico. O glob `v[0-9]*` é interpretado pelo git, nunca pelo shell.
- **`stdout` é contrato:** exatamente `patch`, `minor` ou `major`, sem newline extra. O Step 8.1 consome por `$(…)`.
- **`resolveBase` nunca lança** — cada tier em `try/catch`, último degrau literal.
- **`argv[0]` continua sendo override explícito** de base (retrocompatibilidade). Só o *default* muda.
- **Testes nunca mutam diretório versionado** — fixtures git em `mkdtempSync(tmpdir())` com env isolado.
- **`requiredSignals: [unit, lint]`** — a fase V exige esses dois sinais observados no ledger.
- **Idioma:** comentários de código, mensagens de commit e prosa em pt-BR.

---

### Task 1: `resolveBase()` no helper + regressão do bug

**Files:**
- Modify: `scripts/lib/finalize/suggest-bump.mjs`
- Test: `tests/lib/finalize/suggest-bump.test.mjs`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `resolveBase(cwd = ".") → { base: string, source: "tag" | "tag-loose" | "fallback" }`, exportada. `suggestBump(messages: string[]) → "patch"|"minor"|"major"` permanece exportada e inalterada. CLI: `node suggest-bump.mjs [base]` → `stdout` = bump, `stderr` = `suggest-bump: base=<base> (source=<source>, <n> commits)`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao **final** de `tests/lib/finalize/suggest-bump.test.mjs`, e trocar a linha 3 (o import) por:

```js
import { suggestBump, resolveBase } from "../../../scripts/lib/finalize/suggest-bump.mjs";
```

Acrescentar também, logo após a linha do import, os imports que as fixtures usam:

```js
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
```

E ao final do arquivo:

```js
// --- fixtures git reais em tmpdir, env isolado (padrão de base-sync.test.mjs) ---
const HOME = mkdtempSync(join(tmpdir(), "sb-home-"));
Object.assign(process.env, {
  HOME,
  GIT_CONFIG_GLOBAL: join(HOME, ".gitconfig"),
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
});

const CLI = fileURLToPath(new URL("../../../scripts/lib/finalize/suggest-bump.mjs", import.meta.url));

function g(cwd, ...args) { return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }); }

function initRepo() {
  const d = mkdtempSync(join(tmpdir(), "sb-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", d]);
  return d;
}

function commit(d, msg) {
  writeFileSync(join(d, "f.txt"), msg + "\n");
  g(d, "add", "-A");
  g(d, "commit", "-m", msg);
}

function cli(cwd, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { stdout: r.stdout, stderr: r.stderr };
}

test("pós-merge (HEAD == origin/main) ainda deriva do último release", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "v1.0.0");
  commit(d, "feat: capacidade nova");

  // Reproduz o estado pós-Step-4: merge + git pull deixam a main sincronizada.
  const bare = mkdtempSync(join(tmpdir(), "sb-bare-"));
  execFileSync("git", ["init", "-q", "--bare", bare]);
  g(d, "remote", "add", "origin", bare);
  g(d, "push", "-q", "origin", "main");

  assert.equal(
    g(d, "rev-parse", "HEAD").trim(),
    g(d, "rev-parse", "origin/main").trim(),
    "fixture inválida: HEAD precisa ser == origin/main"
  );
  assert.equal(
    g(d, "log", "--oneline", "origin/main..HEAD").trim(),
    "",
    "fixture inválida: o range antigo precisa estar vazio"
  );

  assert.equal(cli(d).stdout, "minor"); // com o default antigo daria "patch"
});

test("tag não-release no caminho não trunca o range", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "v1.0.0");
  commit(d, "feat: capacidade nova");
  g(d, "tag", "cli-v3.2.0");
  commit(d, "fix: ajuste");

  assert.deepEqual(resolveBase(d), { base: "v1.0.0", source: "tag" });
  assert.equal(cli(d).stdout, "minor"); // com describe nu daria "patch"
});

test("repo sem tag alguma → fallback origin/main, sem lançar", () => {
  const d = initRepo();
  commit(d, "feat: inicial");

  assert.doesNotThrow(() => resolveBase(d));
  assert.deepEqual(resolveBase(d), { base: "origin/main", source: "fallback" });
  assert.equal(cli(d).stdout, "patch");
});

test("tag sem prefixo v resolve pelo tier 2", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "1.0.0");
  commit(d, "feat: capacidade nova");

  assert.deepEqual(resolveBase(d), { base: "1.0.0", source: "tag" });
  assert.equal(cli(d).stdout, "minor");
});

test("base explícita em argv[0] vence a resolução automática", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "v1.0.0");
  commit(d, "feat: capacidade nova");
  g(d, "tag", "v2.0.0");
  commit(d, "fix: ajuste");

  assert.equal(cli(d).stdout, "patch");             // auto → v2.0.0..HEAD = só o fix
  assert.equal(cli(d, "v1.0.0").stdout, "minor");   // explícito → inclui o feat
});

test("emite procedência no stderr sem poluir o stdout", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "v1.0.0");
  commit(d, "feat: capacidade nova");

  const r = cli(d);
  assert.equal(r.stdout, "minor", "stdout precisa ser só o bump");
  assert.match(r.stderr, /^suggest-bump: base=v1\.0\.0 \(source=tag, 1 commits\)\n$/);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test tests/lib/finalize/suggest-bump.test.mjs`

Expected: FAIL. Os 8 testes originais passam; os 6 novos falham — o primeiro com
`SyntaxError` ou `resolveBase is not a function` (a export ainda não existe), e o
teste "pós-merge" com `AssertionError: 'patch' !== 'minor'` assim que `resolveBase`
existir. É exatamente o bug do backlog reproduzido em fixture.

- [ ] **Step 3: Implementar**

Substituir o conteúdo de `scripts/lib/finalize/suggest-bump.mjs` por:

```js
import { execFileSync } from "node:child_process";

const BREAKING_BANG = /^[a-z]+(\([^)]*\))?!:/i;      // feat!:  fix(scope)!:
const BREAKING_BODY = /\bBREAKING[ -]CHANGE\b/;       // "BREAKING CHANGE:" / "BREAKING-CHANGE:"
const FEAT = /^feat(\([^)]*\))?:/i;                    // feat:  feat(scope):

// Tiers de resolução da tag-base, do mais específico ao mais frouxo.
// `git describe` é ancestralidade-first: a última tag ALCANÇÁVEL a partir do HEAD —
// que é a semântica certa para "o último release nesta linha de história". Sem
// `--match`, porém, ele aceita qualquer tag no caminho (ex.: `cli-v3.2.0` num
// monorepo), truncando o range. Os tiers filtram para a linha de release.
const TAG_TIERS = [
  { match: "v[0-9]*", source: "tag" },        // convenção do DevFlow (vX.Y.Z)
  { match: "[0-9]*", source: "tag" },         // cliente sem prefixo (X.Y.Z)
  { match: null, source: "tag-loose" },       // convenção exótica: qualquer tag
];

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

export function suggestBump(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let sawFeat = false;
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const msg = raw;
    const subject = msg.split("\n", 1)[0].trim();
    if (BREAKING_BANG.test(subject) || BREAKING_BODY.test(msg)) return "major";
    if (FEAT.test(subject)) sawFeat = true;
  }
  return sawFeat ? "minor" : "patch";
}

// Base do range de commits. NUNCA lança: cada tier é try/catch e o último degrau
// é literal. `origin/main` é só o último recurso (repo sem tag) — usá-lo como
// default fazia o helper responder sempre "patch" quando chamado depois do merge,
// porque aí `origin/main..HEAD` já está vazio.
export function resolveBase(cwd = ".") {
  for (const tier of TAG_TIERS) {
    try {
      const args = ["describe", "--tags", "--abbrev=0"];
      if (tier.match) args.push("--match", tier.match);
      const tag = git(cwd, args).trim();
      if (tag) return { base: tag, source: tier.source };
    } catch {
      // Nenhuma tag casa neste tier — tenta o próximo.
    }
  }
  return { base: "origin/main", source: "fallback" };
}

function main(argv) {
  const cwd = ".";
  const explicit = argv[0];
  const { base, source } = explicit
    ? { base: explicit, source: "explicit" }
    : resolveBase(cwd);

  let messages = [];
  let rangeOk = true;
  try {
    const out = git(cwd, ["log", "--format=%B%x00", `${base}..HEAD`]);
    messages = out.split("\0").map(s => s.trim()).filter(Boolean);
  } catch {
    rangeOk = false;
  }

  const bump = suggestBump(messages);
  // Procedência no stderr: o stdout é contrato ($(…) no Step 8.1 da
  // prevc-confirmation). Um range de 0 commits fica visível em vez de silencioso.
  process.stderr.write(
    rangeOk
      ? `suggest-bump: base=${base} (source=${source}, ${messages.length} commits)\n`
      : `suggest-bump: base=${base} (source=${source}, range indisponível → ${bump})\n`
  );
  process.stdout.write(bump);
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/lib/finalize/suggest-bump.test.mjs`

Expected: PASS — 14 testes (8 originais + 6 novos), 0 falhas.

- [ ] **Step 5: Confirmar que o guard de pureza continua verde**

Run: `node --test tests/lib/finalize/finalize-pure.test.mjs`

Expected: PASS. Se falhar, algum padrão proibido entrou no helper — o
erro nomeia o regex (`shell: true`, `execSync(`, `import(`, …). Corrigir
mantendo `execFileSync` com argv; nunca relaxar o guard.

- [ ] **Step 6: Rodar o loop rápido inteiro**

Run: `bash tests/run-unit.sh`

Expected: exit 0, sem regressão em nenhum outro `.test.mjs`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/finalize/suggest-bump.mjs tests/lib/finalize/suggest-bump.test.mjs
git commit -m "fix(finalize): suggest-bump deriva a base do último release, não de origin/main

Chamado depois do merge (Step 8.1 roda após o Step 4), origin/main..HEAD
já está vazio e o helper caía sempre no fallback patch. Agora resolve a
base por git describe em tiers de --match, o que também evita que uma tag
não-release (ex.: cli-v3.2.0 em monorepo) trunque o range.

Procedência vai para stderr; stdout segue sendo só patch|minor|major."
```

---

### Task 2: Superfície no Step 8.1 e CHANGELOG

**Files:**
- Modify: `skills/prevc-confirmation/SKILL.md:394-397` (item 1 do Step 8.1), `:398-407` (bloco emitido), `:460` (tabela de anti-patterns)
- Modify: `CHANGELOG.md:8` (seção `## [Unreleased]`)

**Interfaces:**
- Consumes: da Task 1 — o CLI `node suggest-bump.mjs` sem argumento, `stdout` = `patch|minor|major`, `stderr` = `suggest-bump: base=<base> (source=<source>, <n> commits)`.
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Atualizar o item 1 do Step 8.1**

Em `skills/prevc-confirmation/SKILL.md`, substituir:

````markdown
1. Derivar a **sugestão** de bump a partir dos conventional commits do range mergeado:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/finalize/suggest-bump.mjs"   # → patch|minor|major (fallback: patch)
   ```
````

por:

````markdown
1. Derivar a **sugestão** de bump a partir dos conventional commits desde o último release:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/finalize/suggest-bump.mjs"   # → patch|minor|major (fallback: patch)
   ```
   **Chamar sem argumento.** O helper resolve a base sozinho (última tag de release
   alcançável do HEAD, com degradação até `origin/main`) — por isso funciona mesmo
   aqui, *depois* do merge do Step 4. Passar a base pela linha de comando sobrescreve
   essa resolução por uma pior. A procedência sai no `stderr`
   (`suggest-bump: base=v1.31.0 (source=tag, 2 commits)`); o `stdout` é só o bump.
````

- [ ] **Step 2: Acrescentar a procedência ao bloco emitido**

Substituir a última linha do bloco de RELEASE PENDENTE:

```
     Nota: os checks do release PR nascem em `action_required` (PR do bot) — aprovar os
     runs (NÃO usar `--admin`) para os required checks ficarem verdes.
```

por:

```
     Nota: os checks do release PR nascem em `action_required` (PR do bot) — aprovar os
     runs (NÃO usar `--admin`) para os required checks ficarem verdes.
     (sugestão derivada de <base>..HEAD, <n> commits — do stderr do helper; confira antes de confirmar)
```

E, na frase que introduz o bloco, trocar `substituindo `<sugestão>` pela saída acima` por
`substituindo `<sugestão>`, `<base>` e `<n>` pela saída acima`.

- [ ] **Step 3: Acrescentar a linha de anti-pattern**

Ao final da tabela em `## Anti-Patterns` (depois da linha do `autoFinish:true`), acrescentar:

```markdown
| "Vou passar a base pro `suggest-bump` pra garantir" | NÃO. O helper já resolve a base pela última tag de release, com `--match` e degradação. Um `$(git describe …)` no call site é *menos* robusto e, como `argv[0]`, **vence** a resolução do helper — anula a proteção contra tag não-release. Chamar sem argumento. |
```

- [ ] **Step 4: Verificar que o teste da skill continua verde**

Run: `bash tests/run-unit.sh`

Expected: exit 0. O teste que faz grep no Step 8.1 (asserts do signpost) precisa
continuar passando — se ele checar a linha do comando literal, ela não mudou.

- [ ] **Step 5: Registrar no CHANGELOG**

Em `CHANGELOG.md`, sob `## [Unreleased]`, inserir:

```markdown
### Fixed — `suggest-bump` sugeria `patch` sempre no signpost do Step 8.1

O Step 8.1 da `prevc-confirmation` roda **depois** do Step 4 (merge + `git pull`), quando
`origin/main..HEAD` já está vazio — o helper não tinha commit algum para classificar e caía
no fallback `patch` em toda entrega, inclusive nas `feat`. O helper existe justamente para
acertar essa sugestão; sempre responder `patch` o tornava inútil e induzia bump subestimado
(pior sob `autonomy: autonomous`, onde a confirmação humana é mais fraca).

- **`scripts/lib/finalize/suggest-bump.mjs`** — `resolveBase()` (nova, exportada) deriva a base
  da última tag de release alcançável do HEAD via `git describe --tags --abbrev=0`, em tiers de
  `--match` (`v[0-9]*` → `[0-9]*` → qualquer tag → `origin/main`). Os tiers também impedem que uma
  tag não-release no caminho (ex.: `cli-v3.2.0` num monorepo) trunque o range. `argv[0]` continua
  sendo override explícito; só o *default* mudou. `stdout` segue sendo só `patch|minor|major` — a
  procedência (`base=…, N commits`) vai para o `stderr`, o que também torna visível o range vazio.
- **`prevc-confirmation` Step 8.1** — documenta que o helper é chamado **sem argumento** (passar a
  base pelo call site sobrescreve a resolução por uma pior) e exibe a procedência da sugestão.
```

- [ ] **Step 6: Commit**

```bash
git add skills/prevc-confirmation/SKILL.md CHANGELOG.md
git commit -m "docs(confirmation): Step 8.1 exibe a procedência do bump sugerido

Chamar o helper sem argumento é o contrato: ele resolve a base sozinho.
Anti-pattern novo barra a reintrodução do \$(git describe) no call site."
```

---

## Self-Review

**Cobertura do spec:**

| Requisito do spec | Task |
|---|---|
| D1 — cascata de tiers com `--match` | 1 (Step 3, `TAG_TIERS`) |
| D2 — call site não duplica a resolução | 2 (Steps 1 e 3) |
| D3 — procedência no stderr, stdout intacto | 1 (Step 3, `main`) + 2 (Step 2) |
| `resolveBase` nunca lança | 1 (teste 3 usa `assert.doesNotThrow`) |
| Retrocompat de `argv[0]` | 1 (teste 5) |
| Guard `finalize-pure` verde | 1 (Step 5) |
| 5 testes do spec + o de stderr (D3) | 1 (Step 1 — 6 testes) |
| CHANGELOG | 2 (Step 5) |

**Placeholders:** nenhum — todo step de código traz o código completo.

**Consistência de tipos:** `resolveBase` retorna `{ base, source }` em todos os pontos; `source` ∈ `{"tag","tag-loose","fallback"}` na função e `"explicit"` só no caminho de override do `main`, que não passa por `resolveBase`. Os testes assertam `deepEqual` só sobre os valores produzidos por `resolveBase`.
