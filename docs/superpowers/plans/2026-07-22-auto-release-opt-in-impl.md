# `git.autoRelease` opt-in + hardening do `suggest-bump` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o Step 8.1 da `prevc-confirmation` dispare o release quando o projeto optar por isso (`git.autoRelease`), e fazer o `suggest-bump` falhar alto quando a base é engolida como opção do git.

**Architecture:** (A) uma palavra no argv do `git log`. (B) uma chave nova lida pelo parser único já existente (`read-field`, mesmo caminho do `prCli`), que faz o Step 8.1 ramificar entre sinalizar e disparar; o dispatch abre um *release PR* e nunca publica — o merge continua humano.

**Tech Stack:** Node ESM puro (`node:child_process`), `node --test`, testes de contrato em bash sobre a SKILL.md, git ≥ 2.24 (ambiente: 2.43.0).

**Spec:** [`../specs/2026-07-22-auto-release-opt-in-design.md`](../specs/2026-07-22-auto-release-opt-in-design.md)

## Global Constraints

- **ADR-011:** `autoRelease` lido **só** via `scripts/lib/devflow-config.mjs read-field`. Nenhum parser ad-hoc, nenhum leitor novo — `prCli` já é lido assim pelo Step 4.
- **Guard de pureza:** `tests/lib/finalize/finalize-pure.test.mjs` reprova `eval(`, `new Function(`, `shell: true`, `execSync(`, `fetch(` e `import(` dinâmico em `scripts/lib/finalize/*.mjs`.
- **`stdout` do `suggest-bump` é contrato:** exatamente `patch|minor|major`. Só o `stderr` muda.
- **Retrocompatibilidade:** ausência de `autoRelease` = desativado. Nenhum projeto existente muda de comportamento.
- **O dispatch nunca publica.** `gh workflow run release.yml` abre um release PR; quem publica é o `tag-release.yml` no merge desse PR. Nenhuma etapa deste plano automatiza o merge.
- **`requiredSignals: [unit, lint]`** — a fase V exige esses dois observados no ledger.
- **Idioma:** comentários, mensagens de commit e prosa em pt-BR.

---

### Task 1: `--end-of-options` no `suggest-bump`

**Files:**
- Modify: `scripts/lib/finalize/suggest-bump.mjs` (a chamada `git log` dentro de `main`)
- Test: `tests/lib/finalize/suggest-bump.test.mjs`

**Interfaces:**
- Consumes: `resolveBase(cwd) → {base, source}` e `suggestBump(messages)`, já existentes e inalteradas.
- Produces: nada novo. O comportamento observável que muda é só o `stderr` no caso de base malformada.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `tests/lib/finalize/suggest-bump.test.mjs` (os helpers `initRepo`, `commit`, `g` e `cli` já existem no arquivo):

```js
test("base engolida como opção do git falha alto em vez de virar range vazio", () => {
  const d = initRepo();
  commit(d, "chore: inicial");
  g(d, "tag", "v1.0.0");
  commit(d, "feat: capacidade nova");

  // `--output=…` é aceito pelo git log e engole o range: sai exit 0 com zero
  // commits. Sem guarda isso vira "0 commits → patch" silencioso — a mesma
  // classe de defeito corrigida na v1.31.1.
  const r = cli(d, "--output=/dev/null");

  assert.match(r.stderr, /range indisponível/, "base inválida precisa falhar alto");
  assert.doesNotMatch(r.stderr, /0 commits/, "não pode reportar 0 commits silenciosamente");
  assert.equal(r.stdout, "patch", "stdout segue sendo o contrato patch|minor|major");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/lib/finalize/suggest-bump.test.mjs`

Expected: FAIL no teste novo com `AssertionError`, porque o `stderr` traz
`suggest-bump: base=--output=/dev/null (source=explicit, 0 commits)` — exatamente o
relatório silencioso que o teste proíbe. Os outros 14 testes passam.

- [ ] **Step 3: Implementar**

Em `scripts/lib/finalize/suggest-bump.mjs`, dentro de `main`, trocar:

```js
    const out = git(cwd, ["log", "--format=%B%x00", `${base}..HEAD`]);
```

por:

```js
    // --end-of-options: sem isso, uma base que o git aceita como opção (ex.:
    // "--output=…") é engolida e o comando sai 0 com zero commits — virando
    // "patch" silencioso. Com a guarda, vira fatal e cai no catch abaixo.
    const out = git(cwd, ["log", "--format=%B%x00", "--end-of-options", `${base}..HEAD`]);
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/lib/finalize/suggest-bump.test.mjs`

Expected: PASS — 15 testes, 0 falhas.

- [ ] **Step 5: Confirmar o guard de pureza**

Run: `node --test tests/lib/finalize/finalize-pure.test.mjs`

Expected: PASS (30 testes). Se falhar, o erro nomeia o regex proibido — corrigir mantendo `execFileSync` com argv.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/finalize/suggest-bump.mjs tests/lib/finalize/suggest-bump.test.mjs
git commit -m "fix(finalize): suggest-bump falha alto quando a base é engolida como opção

Uma base que o git aceita como opção (ex.: --output=) fazia o log sair 0
com zero commits, virando patch silencioso — mesma classe do defeito da
v1.31.1. --end-of-options transforma isso em fatal, que o catch já trata.

Hardening: typo de tag e flag inexistente JÁ falhavam alto (exit 128)."
```

---

### Task 2: `git.autoRelease` — ramificação do Step 8.1 e cross-check no config

**Files:**
- Modify: `skills/prevc-confirmation/SKILL.md` (Step 8.1, parágrafo do "NUNCA rode"; tabela de anti-patterns)
- Modify: `skills/config/SKILL.md` (após o bloco `#### P5b.1`; e após as "Regras de geração (versionamento — P5b)")
- Modify: `CHANGELOG.md` (seção `## [Unreleased]`)
- Test: `tests/skills/test-confirmation-release-signpost.sh`

**Interfaces:**
- Consumes: da Task 1 nada. Do que já existe: `node scripts/lib/devflow-config.mjs read-field <campo> <path>` → imprime o valor ou string vazia; `suggest-bump.mjs` → `stdout` = `patch|minor|major`.
- Produces: a chave de config `git.autoRelease` (string `true` ativa; ausente/qualquer outro valor = desativado).

- [ ] **Step 1: Escrever as asserções de contrato que falham**

Acrescentar ao final de `tests/skills/test-confirmation-release-signpost.sh`, **antes** da linha final de sucesso (se houver `echo OK`, inserir acima dela):

```bash
# --- autoRelease (opt-in) ---
if ! grep -qE "read-field autoRelease" "$SKILL"; then
  echo "FALHA(7): Step 8.1 não lê autoRelease pelo parser único (ADR-011)"; exit 1
fi
if ! grep -qiE "auto-disparo suspenso" "$SKILL"; then
  echo "FALHA(8): não há ramo de major que suspende o auto-disparo"; exit 1
fi
if ! grep -qiE "cair para o signpost" "$SKILL"; then
  echo "FALHA(9): não há fallback para signpost quando o dispatch falha"; exit 1
fi
if ! grep -qE 'prCli' "$SKILL"; then
  echo "FALHA(10): ramo de dispatch não é guardado por prCli"; exit 1
fi
if ! grep -qiE "o merge desse PR|merge dele" "$SKILL"; then
  echo "FALHA(11): não deixa explícito que quem publica é o merge do release PR"; exit 1
fi

CONFIG_SKILL="$ROOT/skills/config/SKILL.md"
if ! grep -qE "autoRelease" "$CONFIG_SKILL"; then
  echo "FALHA(12): /devflow config não oferece autoRelease"; exit 1
fi
if ! grep -qiE "autoRelease.*versioning|versioning.*autoRelease" "$CONFIG_SKILL"; then
  echo "FALHA(13): falta o cross-check autoRelease × versioning"; exit 1
fi
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bash tests/skills/test-confirmation-release-signpost.sh`

Expected: FAIL com `FALHA(7): Step 8.1 não lê autoRelease pelo parser único (ADR-011)` — nada de `autoRelease` existe ainda.

- [ ] **Step 3: Ramificar o Step 8.1**

Em `skills/prevc-confirmation/SKILL.md`, substituir o parágrafo:

```markdown
**NUNCA rode `gh workflow run` automaticamente — apenas sinalize.** Release é decisão humana (o *tipo* de bump é julgamento semver que o operador confirma). A skill dá o comando pronto; não o executa.
```

por:

````markdown
3. **Decidir entre sinalizar e disparar** — ler a config pelo parser único (ADR-011):
   ```bash
   CFG="${CLAUDE_PLUGIN_ROOT}/scripts/lib/devflow-config.mjs"
   AUTO_RELEASE=$(node "$CFG" read-field autoRelease .context/.devflow.yaml 2>/dev/null || echo "")
   PR_CLI=$(node "$CFG" read-field prCli .context/.devflow.yaml 2>/dev/null || echo "")
   ```

   | `autoRelease` | `prCli` | bump | Ação |
   |---|---|---|---|
   | ausente / `false` | — | — | **Só sinalizar** (emitir o bloco acima e seguir) |
   | `true` | ≠ `gh` | — | **Só sinalizar** + nota de alcance de forge |
   | `true` | `gh` | `major` | **Só sinalizar** + `auto-disparo suspenso: breaking change exige confirmação semântica humana` |
   | `true` | `gh` | `patch` / `minor` | **Disparar**: `gh workflow run release.yml -f bump=<sugestão>` |

   **Ao disparar:** informar que o release PR abre em instantes, que **o merge desse PR — humano — é o que publica**, e que os checks dele nascem em `action_required` (PR do bot) exigindo aprovação dos runs. Se o `gh workflow run` sair não-zero (sem permissão, workflow ausente, rede), **cair para o signpost** com o comando pronto e a mensagem de erro — nunca deixar o operador sem o caminho manual.

**Com `autoRelease` ausente ou `false` (o default), NUNCA rode `gh workflow run` automaticamente — apenas sinalize.** Mesmo com `autoRelease: true`, o dispatch **abre um release PR; ele não publica**. O ato outward-facing é o **merge desse PR**, que permanece humano em qualquer configuração.
````

- [ ] **Step 4: Acrescentar a linha de anti-pattern**

Ao final da tabela em `## Anti-Patterns` de `skills/prevc-confirmation/SKILL.md` (depois da linha que começa com `| "Vou passar a base pro \`suggest-bump\``), acrescentar:

```markdown
| "`autoRelease: true`, então o release sai sozinho" | NÃO. O dispatch abre um *release PR* — quem publica é o merge dele, humano e atrás de branch protection. E os checks do PR do bot nascem em `action_required`, exigindo aprovação. `autoRelease` **desloca** a intervenção humana, não a elimina. |
```

- [ ] **Step 5: Acrescentar a pergunta P5c no `/devflow config`**

Em `skills/config/SKILL.md`, logo **após** o bloco `#### P5b.1 — \`pipeline\` escolhido sem CI: AVISAR (nunca recusar)` (o parágrafo que termina em "Nunca recuse a escolha; apenas informe e ofereça o scaffold."), inserir:

````markdown
#### P5c: Auto-disparo do release (condicional — só se P5b = pipeline)

Só pergunte quando o usuário escolheu **Pipeline de release**. Nos outros modos o bloco de RELEASE PENDENTE do Step 8.1 nem existe, e a chave seria inerte.

```
AskUserQuestion:
  question: "Ao concluir uma entrega, o DevFlow deve abrir o release PR sozinho?"
  header: "Auto-release"
  multiSelect: false
  options:
    - label: "Não, só me avisar (padrão)"
      description: "O DevFlow emite o comando pronto e você dispara quando o lote estiver fechado. Escolha isto se você agrupa várias entregas num único release."
    - label: "Sim, abrir o release PR"
      description: "Bump patch/minor disparam o release.yml automaticamente; major sempre espera você. O PR ainda precisa de merge humano para publicar — o auto-disparo só evita o passo manual de abrir."
```
````

- [ ] **Step 6: Acrescentar as regras de geração e o cross-check**

Em `skills/config/SKILL.md`, logo **após** o bloco `**Regras de geração (versionamento — P5b):**` (que termina com a regra do `versioning: none`), inserir:

```markdown
**Regras de geração (auto-release — P5c):**
- Se **P5c não foi perguntada** (P5b ≠ pipeline) → **não incluir** a chave `autoRelease`.
- Se **"Não, só me avisar"** (default) → **não incluir** a chave (ausência = desativado, retrocompatível).
- Se **"Sim, abrir o release PR"** → incluir `autoRelease: true` no bloco `git:`.

**Cross-check obrigatório (P5c × P5b) — par contraditório:**
`autoRelease: true` com `versioning ∈ {local, none}` **conflita**: nesses modos o bloco de RELEASE PENDENTE do Step 8.1 não é emitido, então a chave fica inerte e mente sobre o comportamento. Ao gerar o YAML, se essa combinação surgir, **NÃO gere em silêncio**: avise e ofereça — (a) manter `versioning` e **remover** o `autoRelease` (recomendado), ou (b) trocar para `versioning: pipeline` se o usuário realmente quer a pipeline de release. Recusar a gravação do par contraditório até a escolha.
```

- [ ] **Step 7: Rodar o teste de contrato e confirmar que passa**

Run: `bash tests/skills/test-confirmation-release-signpost.sh`

Expected: exit 0, sem nenhuma linha `FALHA(...)`.

- [ ] **Step 8: Registrar no CHANGELOG**

Em `CHANGELOG.md`, sob `## [Unreleased]`, inserir:

```markdown
### Added — `git.autoRelease`: o Step 8.1 pode abrir o release PR sozinho (opt-in)

Sob `versioning: pipeline`, o merge da feature não dispara o release e o Step 8.1 apenas
sinalizava. A regra "nunca auto-disparar" apoiava-se em duas premissas que não se sustentaram:
o `gh workflow run release.yml` **abre um release PR — não publica** (quem publica é o merge
desse PR, humano e atrás de branch protection), e o "bump é julgamento semver" foi escrito
quando o `suggest-bump` respondia `patch` para toda entrega (corrigido na v1.31.1). A razão
legítima para não disparar é outra: **cadência** — times que agrupam entregas num só release.
Por isso, config em vez de dogma.

- **`git.autoRelease`** (novo, default ausente = desativado) — lido via `devflow-config.mjs
  read-field`, o mesmo caminho do `prCli` (ADR-011, sem leitor novo). Com `true` e `prCli: gh`,
  bump `patch`/`minor` dispara o `release.yml`; **`major` sempre sinaliza** (breaking change
  exige confirmação semântica). Sob outro forge, sinaliza. Falha de dispatch cai para o
  signpost — o operador nunca fica sem o comando.
- **`/devflow config`** — pergunta P5c (só quando `versioning: pipeline`) + cross-check que
  recusa o par contraditório `autoRelease: true` × `versioning ∈ {local, none}`.

### Fixed — `suggest-bump` falha alto quando a base é engolida como opção

Uma base que o git **aceita como opção** (ex.: `--output=…`) fazia o `git log` sair `0` com zero
commits, virando `patch` silencioso — a mesma classe do defeito corrigido na v1.31.1.
`--end-of-options` transforma isso em `fatal`, que o `catch` já trata como `range indisponível`.
Hardening de alcance estreito: typo de tag e flag inexistente **já** falhavam alto (exit 128).
```

- [ ] **Step 9: Commit**

```bash
git add skills/prevc-confirmation/SKILL.md skills/config/SKILL.md \
        tests/skills/test-confirmation-release-signpost.sh CHANGELOG.md
git commit -m "feat(confirmation): git.autoRelease opt-in abre o release PR sozinho

O dispatch abre um release PR; quem publica é o merge dele, humano. Por
isso o auto-disparo é seguro — o que ele evita é o passo manual de abrir,
não o gate. major sempre sinaliza; forge != gh sinaliza; falha de dispatch
cai para o signpost.

/devflow config ganha a pergunta P5c e o cross-check do par contraditório
autoRelease x versioning."
```

---

## Self-Review

**Cobertura do spec:**

| Requisito do spec | Task/Step |
|---|---|
| A — `--end-of-options` | 1 · Step 3 |
| A — teste do caso silencioso | 1 · Step 1 |
| A — CHANGELOG honesto (hardening, não segurança) | 2 · Step 8 |
| B — leitura via `read-field` (ADR-011) | 2 · Step 3 |
| B — tabela de 4 ramos | 2 · Step 3 |
| B — semântica do `major` (sinaliza e segue) | 2 · Step 3 |
| B — guard `prCli: gh` | 2 · Step 3 |
| B — fallback em falha de dispatch | 2 · Step 3 |
| B — texto de sucesso (merge é quem publica + `action_required`) | 2 · Step 3 |
| B — anti-pattern | 2 · Step 4 |
| B — pergunta no `/devflow config` | 2 · Step 5 |
| B — cross-check do par contraditório | 2 · Step 6 |
| Testes 1-6 do spec | 1 · Step 1 (1,2) · 2 · Step 1 (3,4,5,6) |

**Placeholders:** nenhum — todo step traz o texto/código final.

**Consistência:** `read-field <campo> <path>` usado com a mesma assinatura no Step 3 da Task 2 e no `CFG` do Step 4 já existente na skill. A string que ativa é `true` em todos os pontos (config gera `autoRelease: true`; a skill compara com `true`). `auto-disparo suspenso` aparece com a mesma grafia no Step 3 e na asserção `FALHA(8)`.

**Nota de fragilidade assumida:** os testes 3-6 são `grep` sobre texto de skill. Eles provam que o contrato está **escrito**, não que o LLM o **executa** — a skill é interpretada, não executada. É a mesma limitação (e o mesmo mecanismo) do teste que já cobre o signpost original.
