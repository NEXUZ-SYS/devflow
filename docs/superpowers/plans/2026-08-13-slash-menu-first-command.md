# Primeiro item do menu `/devflow` — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

> **Workflow DevFlow:** slash-menu-first-command | **Escala:** MEDIUM | **Fase:** P→R
> **Spec:** `docs/superpowers/specs/2026-08-13-slash-menu-first-command-design.md` (commit `c982508`)
> **Branch:** `feat/slash-menu-first-command` (de `main`)
> **ADR:** 008 v1.2.0 já evoluída e commitada (`39cf8c1`) — **fora do escopo deste plano**

**Goal:** Fazer `devflow:devflow` ser o primeiro item ao digitar `/devflow`, e travar o invariante contra regressão.

**Architecture:** O menu do Claude Code ordena por `(comprimento do nome, nome)`. Três mudanças em arquivos estáticos — esconder skills do menu, renomear o único comando mais curto, e um guard que replica a chave de ordenação — bastam. Nenhum código executável muda.

**Tech Stack:** Markdown frontmatter (YAML), `node:test` + `node:assert/strict`, bash.

**Agents:** `test-writer` (Tarefa 1), `refactoring-specialist` (Tarefas 2–3), `documentation-writer` (Tarefas 4–5).

## Global Constraints

- **Idioma:** todo conteúdo novo (testes, comentários, CHANGELOG, help) em **pt-BR**. Termos técnicos mantidos.
- **TDD obrigatório:** RED→GREEN→REFACTOR. A Tarefa 1 tem de falhar por 3 motivos distintos antes de qualquer correção.
- **Allowlist de skill visível:** exatamente `["scrape-stack-batch"]` — justificada por `docs/odoo-profile-standards.md:50`.
- **Nome-alvo:** `devflow-design` (arquivo `commands/devflow-design.md`, `name: devflow-design`).
- **Não tocar:** `agents/`, `CHANGELOG.md` histórico, specs antigas, `.context/runtime/`, `disable-model-invocation`.
- **NUNCA rodar `gen-known-hashes.mjs` à mão nesta branch.** `distributableFiles()` varre `skills/` e filtra `.md`, então os 43 `SKILL.md` editados são artefatos de proveniência e seus hashes mudam. O registry é **append-only** e é atualizado pelo `bump-version.sh` (`--append`) durante o release — sob `versioning: pipeline`, isso acontece no `release.yml`, não no merge. Rodar à mão suja o diff e, pelo histórico do projeto, um `known-hashes.json` sujo bloqueia `pull --ff-only` pós-release. **Nenhum teste falha por isso** (`test-gen-known-hashes.mjs` compara o working tree consigo mesmo; `test-bump-appends-registry.mjs` só verifica que o bump chama `--append`).
- **Sinais exigidos na fase V:** `requiredSignals: [unit, integration, lint]`.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `tests/integration/test-slash-menu-ordering.mjs` | **criar** | Guard do invariante de ordenação (AC1–AC3) |
| `skills/*/SKILL.md` (43 de 44) | modificar | `user-invocable: false` — sai do menu do usuário |
| `commands/design.md` → `commands/devflow-design.md` | **renomear** | Comando volta à convenção `devflow-*` |
| `commands/devflow.md` | modificar | 2 refs no Step 4e + registro no help |
| `references/post-update-guide.md` | modificar | 4 refs |
| `skills/frontend-design/SKILL.md` | modificar | `description`, `trigger_phrases`, corpo (3 refs) |
| `skills/frontend-design/references/{browser-extension,init}.md` | modificar | 3 refs |
| `skills/project-init/SKILL.md` | modificar | 1 ref |
| `tests/skills/test-command-design.sh` | modificar | aponta para `commands/design.md` por caminho |
| `tests/skills/test-{frontend-design,design-brownfield-notice,project-init-design-step}.sh` | modificar | asserções sobre a string do comando |
| `tests/integration/test-profile-skills-not-registered.mjs` | modificar | comentário de cabeçalho (premissa ADR-008 v1.2.0) |
| `CHANGELOG.md` | modificar | entrada BREAKING |

---

### Task 1: Guard do invariante de ordenação (RED)

**Agent:** test-writer

**Files:**
- Create: `tests/integration/test-slash-menu-ordering.mjs`

**Interfaces:**
- Consumes: nada (lê o filesystem do repo).
- Produces: `SKILLS_VISIVEIS` (allowlist `["scrape-stack-batch"]`), `chave(nome) → [nome.length, nome]` e `menorQue(a, b)` — todos internos a este arquivo, nada exportado.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
/**
 * Guard de regressão — o menu de slash lista devflow:devflow primeiro.
 * Run: node --test tests/integration/test-slash-menu-ordering.mjs
 *
 * O Claude Code (bundle 2.1.231, função H8l) ordena o menu de `/` por:
 * (1) nome exato, (2) alias exato, (3) prefix match MENOR PRIMEIRO,
 * (4) alias prefixo, (5) score Fuse, (6) usage. Os critérios 1 e 2 são
 * inalcançáveis por plugin — o `name` é sempre `plugin:nome`, e o frontmatter
 * de plugin não aceita `aliases`. Logo a chave efetiva é (comprimento, nome).
 *
 * AC1 devflow:devflow é o MÍNIMO dessa chave entre as entradas visíveis
 * AC2 skills não aparecem no menu do usuário (exceto a allowlist documentada)
 * AC3 todo comando respeita a convenção devflow-* restaurada na v1.6.0
 *
 * AC1 é o requisito. AC2 e AC3 são o que o sustenta no tempo: sem AC2 uma skill
 * nova de nome curto reintroduz o defeito; sem AC3, um comando novo faz o mesmo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const REPO = resolve(import.meta.dirname, "../..");
const PLUGIN = "devflow";

// Única skill que a documentação manda o usuário digitar
// (docs/odoo-profile-standards.md:50 — follow-up manual de indexação).
const SKILLS_VISIVEIS = ["scrape-stack-batch"];

// O loader lê `name:` do frontmatter e cai no basename quando ausente.
function nomeDeclarado(arquivo, fallback) {
  const m = readFileSync(arquivo, "utf-8").match(/^name:\s*"?([^"\n]+)"?\s*$/m);
  return m ? m[1].trim() : fallback;
}

function temUserInvocableFalse(arquivo) {
  return /^user-invocable:\s*false\s*$/m.test(readFileSync(arquivo, "utf-8"));
}

function comandos() {
  return readdirSync(join(REPO, "commands"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(REPO, "commands", f));
}

// Nenhum comando usa user-invocable hoje, mas o campo vale para command e skill
// igualmente — filtrar os dois pelo mesmo critério evita que um comando oculto
// no futuro seja contado como visível.
function visivel(arquivo) {
  return !temUserInvocableFalse(arquivo);
}

function skills() {
  return readdirSync(join(REPO, "skills"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .filter((slug) => existsSync(join(REPO, "skills", slug, "SKILL.md")));
}

// Critério 3 do comparador: menor comprimento primeiro, desempate alfabético.
const chave = (nome) => [nome.length, nome];
const menorQue = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);

describe("ordenação do menu de slash do plugin", () => {
  it("AC1 devflow:devflow é o primeiro item ao digitar /devflow", () => {
    const visiveis = [
      ...comandos()
        .filter(visivel)
        .map((f) => nomeDeclarado(f, basename(f, ".md"))),
      ...skills()
        .filter((s) => visivel(join(REPO, "skills", s, "SKILL.md")))
        .map((s) => nomeDeclarado(join(REPO, "skills", s, "SKILL.md"), s)),
    ].map((n) => `${PLUGIN}:${n}`);

    const alvo = `${PLUGIN}:${PLUGIN}`;
    assert.ok(visiveis.includes(alvo), `${alvo} não está entre as entradas visíveis`);

    const vencedores = visiveis
      .filter((n) => n !== alvo && menorQue(chave(n), chave(alvo)))
      .sort();
    assert.deepEqual(
      vencedores, [],
      `entradas que precedem ${alvo} no menu (chave = comprimento, nome): ${vencedores.join(", ")}`,
    );
  });

  it("AC2 skills não aparecem no menu do usuário, exceto a allowlist", () => {
    const expostas = skills()
      .filter((s) => !SKILLS_VISIVEIS.includes(s))
      .filter((s) => !temUserInvocableFalse(join(REPO, "skills", s, "SKILL.md")))
      .sort();
    assert.deepEqual(
      expostas, [],
      `skills sem 'user-invocable: false' poluindo o menu: ${expostas.join(", ")}`,
    );
  });

  it("AC3 todo comando segue a convenção devflow-* (restaurada na v1.6.0)", () => {
    const foraDoPadrao = comandos()
      .map((f) => nomeDeclarado(f, basename(f, ".md")))
      .filter((n) => n !== PLUGIN && !/^devflow-/.test(n))
      .sort();
    assert.deepEqual(
      foraDoPadrao, [],
      `comando fora da convenção devflow-* — nomes curtos colidem com outros plugins: ${foraDoPadrao.join(", ")}`,
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar os 3 RED**

Run: `node --test tests/integration/test-slash-menu-ordering.mjs`
Expected: **3 falhas**, com estas mensagens:
- AC1: `entradas que precedem devflow:devflow no menu (...): devflow:config, devflow:design, devflow:doctor, devflow:napkin`
- AC2: 43 slugs listados (todas as skills menos `scrape-stack-batch`)
- AC3: `comando fora da convenção devflow-*: design`

Se AC1 não listar exatamente essas 4, **pare** — o inventário mudou e o plano precisa ser revisto.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/test-slash-menu-ordering.mjs
git commit -m "test(menu): guard do invariante de ordenação do menu de slash (RED)"
```

---

### Task 2: Skills saem do menu do usuário (GREEN AC2)

**Agent:** refactoring-specialist
**Handoff from:** test-writer (Tarefa 1 em RED)

**Files:**
- Modify: 43 × `skills/<slug>/SKILL.md` (todas menos `scrape-stack-batch`)

**Interfaces:**
- Consumes: `SKILLS_VISIVEIS` da Tarefa 1 (mesma allowlist, mesma justificativa).
- Produces: nada consumido por tarefas seguintes.

- [ ] **Step 1: Inserir `user-invocable: false` após a linha `description:`**

Todas as 44 skills têm `description:` em **linha única** (verificado). Os blocos multilinha existentes (`deps:`, `trigger_phrases:` em `frontend-design`, `knowledge`, `scrape-stack-batch`, `standards-builder`) vêm **depois** de `description:`, então inserir logo após ela é seguro.

```bash
cd "$(git rev-parse --show-toplevel)"
for d in skills/*/; do
  slug=$(basename "$d")
  [ "$slug" = "scrape-stack-batch" ] && continue
  f="$d/SKILL.md"
  [ -f "$f" ] || continue
  grep -q '^user-invocable:' "$f" && continue
  # insere após a PRIMEIRA linha que começa com description:
  awk 'BEGIN{done=0} {print} /^description:/ && !done {print "user-invocable: false"; done=1}' \
    "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
```

- [ ] **Step 2: Verificar que nenhum frontmatter foi corrompido**

```bash
for d in skills/*/; do
  f="$d/SKILL.md"; [ -f "$f" ] || continue
  head -1 "$f" | grep -qx -- '---' || { echo "SEM ABERTURA: $f"; continue; }
  awk 'NR>1 && /^---[[:space:]]*$/{print NR; exit}' "$f" | grep -q . || echo "SEM FECHAMENTO: $f"
done
echo "--- com user-invocable: $(grep -l '^user-invocable: false' skills/*/SKILL.md | wc -l) (esperado 43)"
```
Expected: nenhuma linha `SEM ABERTURA`/`SEM FECHAMENTO`, contagem **43**.

- [ ] **Step 3: Rodar o guard — AC2 deve passar, AC1 e AC3 continuam RED**

Run: `node --test tests/integration/test-slash-menu-ordering.mjs`
Expected: AC2 PASS. AC1 ainda falha (agora só por `devflow:design`); AC3 ainda falha por `design`.

- [ ] **Step 4: Commit**

```bash
git add skills/
git commit -m "feat(menu)!: skills do plugin saem do menu de slash do usuário

user-invocable: false em 43 skills. O modelo continua invocando todas via Skill
tool — só disable-model-invocation bloquearia o modelo, e não é usado. Exceção:
scrape-stack-batch, que docs/odoo-profile-standards.md manda o usuário digitar."
```

---

### Task 3: `design` volta à convenção `devflow-*` (GREEN AC1+AC3)

**Agent:** refactoring-specialist

**Files:**
- Rename: `commands/design.md` → `commands/devflow-design.md`
- Modify: `commands/devflow-design.md` (frontmatter + 16 refs internas)
- Modify: `commands/devflow.md` (2 refs no Step 4e + registro no help)
- Modify: `references/post-update-guide.md` (4 refs)
- Modify: `skills/frontend-design/SKILL.md` (description, trigger_phrases, corpo)
- Modify: `skills/frontend-design/references/browser-extension.md`, `.../init.md`
- Modify: `skills/project-init/SKILL.md`
- Test: `tests/skills/test-command-design.sh` e as outras 3 suítes de design

- [ ] **Step 1: Renomear preservando histórico e trocar o `name:`**

```bash
git mv commands/design.md commands/devflow-design.md
sed -i 's/^name: design$/name: devflow-design/' commands/devflow-design.md
head -3 commands/devflow-design.md   # confere o frontmatter
```

- [ ] **Step 2: Atualizar todas as referências de produto**

```bash
# 8 arquivos de produto; NÃO toca CHANGELOG, specs antigas nem .context/runtime/
for f in commands/devflow-design.md commands/devflow.md references/post-update-guide.md \
         skills/frontend-design/SKILL.md skills/frontend-design/references/browser-extension.md \
         skills/frontend-design/references/init.md skills/project-init/SKILL.md; do
  sed -i 's|/devflow:design|/devflow:devflow-design|g' "$f"
done
grep -rn "devflow:design\b" commands/ skills/ references/ | grep -v "devflow-design"
```
Expected do último comando: **nenhuma saída**.

- [ ] **Step 3: Atualizar as 4 suítes de teste do design**

`tests/skills/test-command-design.sh` referencia o caminho antigo:

```bash
sed -i 's|commands/design\.md|commands/devflow-design.md|g' tests/skills/test-command-design.sh
for f in tests/skills/test-command-design.sh tests/skills/test-frontend-design.sh \
         tests/skills/test-design-brownfield-notice.sh tests/skills/test-project-init-design-step.sh; do
  sed -i 's|/devflow:design|/devflow:devflow-design|g' "$f"
done
bash tests/skills/test-command-design.sh && echo "test-command-design OK"
```

- [ ] **Step 4: Registrar o comando no help do `commands/devflow.md`**

O comando nunca constou do help. Em `## Related Commands`, após a linha de `devflow-adr`, inserir:

```
/devflow:devflow-design [modo]                 # Guia de design de front-end (23 modos)
```

E no bloco `COMMANDS` do texto de help, após a linha `/devflow:devflow-cleanup`:

```
  /devflow:devflow-design <modo>      Guia de design de front-end (craft, critique, audit, …)
```

- [ ] **Step 5: Rodar o guard — os 3 ACs devem passar**

Run: `node --test tests/integration/test-slash-menu-ordering.mjs`
Expected: **3 PASS**. AC1 confirma que nenhuma entrada precede `devflow:devflow`.

- [ ] **Step 6: Commit**

```bash
git add commands/ references/ skills/ tests/skills/
git commit -m "feat(cmd)!: /devflow:design vira /devflow:devflow-design

Restaura a convenção devflow-* que a v1.6.0 estabeleceu ao reverter os nomes
curtos (/devflow:status, :sync, :doctor) por colisão com outros plugins. design
era a única exceção, e por ser mais curto que devflow:devflow tomava o primeiro
lugar do menu. Registra o comando no help, onde nunca constara."
```

---

### Task 4: Alinhar a premissa do guard de namespace

**Agent:** documentation-writer

**Files:**
- Modify: `tests/integration/test-profile-skills-not-registered.mjs` (comentário de cabeçalho)

- [ ] **Step 1: Corrigir o comentário**

Trocar o trecho atual:

```
 * O Claude Code registra todo skills/<nome>/SKILL.md do plugin como comando
 * global (/devflow:<nome>), sem opt-out por frontmatter. Logo skill condicional
 * a framework NÃO pode morar lá — vira comando em todo projeto (ADR-008 v1.1.0).
```

por:

```
 * O Claude Code REGISTRA todo skills/<nome>/SKILL.md do plugin em todo projeto,
 * sem opt-out. Esconder do menu (user-invocable: false) não desregistra: a skill
 * segue carregada e ocupando o vocabulário do modelo. Logo skill condicional a
 * framework NÃO pode morar lá (ADR-008 v1.2.0 — três superfícies, um só sem
 * opt-out; ver tests/integration/test-slash-menu-ordering.mjs para a superfície
 * de menu).
```

- [ ] **Step 2: Confirmar que o teste continua passando**

Run: `node --test tests/integration/test-profile-skills-not-registered.mjs`
Expected: 4 PASS (AC1–AC4). Só um comentário mudou; qualquer falha aqui é sinal de que a Tarefa 2 mexeu em algo que não devia.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/test-profile-skills-not-registered.mjs
git commit -m "docs(test): alinha a premissa do guard de namespace com o ADR-008 v1.2.0"
```

---

### Task 5: CHANGELOG e verificação final

**Agent:** documentation-writer

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Entrada de CHANGELOG marcada BREAKING**

No topo, sob `## [Unreleased]` (criar a seção se não existir):

```markdown
### ⚠️ BREAKING

- **`/devflow:design` → `/devflow:devflow-design`.** O comando volta à convenção
  `devflow-*` restaurada na v1.6.0. Por ser mais curto que `devflow:devflow`, ele
  tomava o primeiro lugar do menu de slash — que ordena por `(comprimento, nome)`.
  Projetos-cliente passam a usar o nome novo após `/devflow update` + reinício da sessão.

### Changed

- **43 skills saem do menu de slash do usuário** (`user-invocable: false`). O menu do
  plugin cai de 58 para 15 itens e passa a expor comandos, não skills. O modelo continua
  invocando todas as skills normalmente — `disable-model-invocation` não é usado.
  Exceção: `scrape-stack-batch`, que a documentação manda o usuário digitar.
- `/devflow:devflow-design` passa a constar do help, onde nunca estivera.
```

- [ ] **Step 2: Rodar a suíte inteira (os 3 sinais)**

```bash
bash tests/run-lint.sh
bash tests/run-unit.sh
bash tests/run-integration.sh
```
Expected: os três com `exit 0`. Atenção ao AC4 de `test-profile-skills-not-registered` (`skills/` × `skills/MANIFEST.txt`): **nenhuma skill foi criada ou removida**, então o MANIFEST não deve precisar de ajuste — se AC4 falhar, algo saiu errado na Tarefa 2.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): registra o rename breaking e a saída das skills do menu"
```

---

## Verificação de aceite (fase V)

```yaml
requiredSignals: [unit, integration, lint]
```

| Sinal | Comando |
|---|---|
| `unit` | `bash tests/run-unit.sh` |
| `integration` | `bash tests/run-integration.sh` |
| `lint` | `bash tests/run-lint.sh` |

Prova do requisito do usuário: `node --test tests/integration/test-slash-menu-ordering.mjs` com AC1 verde — nenhuma entrada visível do plugin precede `devflow:devflow` na chave `(comprimento, nome)`.

**Verificação manual (não automatizável):** após `/devflow update` e reinício da sessão, digitar `/devflow` e confirmar que `devflow:devflow` encabeça a lista. O menu do Claude Code não é acessível a testes.
