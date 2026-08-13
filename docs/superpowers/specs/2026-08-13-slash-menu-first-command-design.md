# Primeiro item do menu `/devflow` — Notas de Design

> **Status:** Planning (P) — brainstorming concluído em 2026-08-13.
> **Workflow PREVC:** slash-menu-first-command | **Escala:** MEDIUM | **Autonomia:** supervised | **Modo:** Full
> **Relação com ADRs:** estende o ADR-008 v1.1.0 (precisão da premissa "sem opt-out"), sem contrariar sua decisão.

---

## 1. Problema

Ao digitar `/devflow` no menu de slash commands do Claude Code, o primeiro item sugerido é
**`devflow:config`**. O esperado é **`devflow:devflow`** — o dispatcher, que é a porta de entrada
do plugin e de longe o item mais usado.

O sintoma é de UX, mas a causa é estrutural: a superfície de comando do plugin cresceu sem
nenhuma regra que governasse **como ela é ordenada** pelo harness.

## 2. Causa raiz (verificada no binário, não inferida)

Engenharia reversa do bundle do Claude Code **2.1.231**
(`~/.local/share/claude/versions/2.1.231`), função `H8l` — a que alimenta o menu de `/`.

O menu monta um índice Fuse (`threshold: 0.3`, `location: 0`, keys `commandName` peso 3,
`displayName` 2, `partKey` 2, `aliasKey` 2, `displayPartKey` 1, `descriptionKey` 0.5) e depois
**reordena com um comparador explícito**, nesta precedência:

| # | Critério | Alcançável por um plugin? |
|---|---|---|
| 1 | `name` ou `displayName` **igual** à query | ❌ — `dp(e) = e.userFacingName?.() ?? e.name`, e o `name` de artefato de plugin é sempre `plugin:nome`. Nunca é igual a `devflow`. |
| 2 | `alias` **igual** à query | ❌ — o frontmatter de plugin não aceita `aliases` (chaves válidas: `name`, `description`, `model`, `allowed-tools`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `effort`, `shell`, `version`, `when_to_use`, `paths`, `hooks`, `context`, `agent`, …). |
| 3 | **prefix match, menor comprimento primeiro** (`k - C`) | ✅ **é aqui que se decide** |
| 4 | alias por prefixo, menor primeiro | ❌ (mesmo motivo do 2) |
| 5 | score do Fuse, arredondado (`Math.floor(score*10)`) | empata em 0 para todos |
| 6 | `usage` (frequência), maior primeiro | empata |

Empate total → `Array.prototype.sort` é estável e preserva a ordem do índice, que é a ordem de
carregamento (alfabética, `localeCompare` por `skill.name` em cada loader).

**Conclusão:** vale o critério 3. A chave de ordenação efetiva é o par **`(comprimento, nome)`**.

### Medição do estado atual

Nomes com prefixo `devflow`, ordenados pela chave real:

```
14  cmd    devflow:design
14  skill  devflow:config
14  skill  devflow:doctor
14  skill  devflow:napkin
15  cmd    devflow:devflow      ← o alvo, em 5º
16  skill  devflow:language
16  skill  devflow:routines
...
```

Quatro entradas de 14 caracteres batem `devflow:devflow` (15). Entre elas o desempate é
alfabético → **`config`**. Bate exatamente com o sintoma relatado.

### Por que há 44 skills no menu

O loader de plugin resolve `let z = a["user-invocable"], V = (z === void 0 ? !0 : $Er(z))` — ou
seja, **`user-invocable` ausente ⇒ `true`**. Toda `skills/<nome>/SKILL.md` do plugin vira item de
menu, sem que ninguém tenha decidido isso. Das 58 entradas de menu do DevFlow, 44 são skills
internas que o usuário nunca digita.

## 3. Decisão

### D1 — O invariante

> **`devflow:devflow` é o mínimo da chave `(comprimento, nome)` entre todas as entradas de menu
> visíveis do plugin.**

Formular pela chave inteira — e não por "esconder o `config`" — é o que dá durabilidade. Uma skill
futura chamada `cleanup` produziria `devflow:cleanup`, empatado em 15 caracteres, e venceria no
desempate alfabético. O invariante cobre esse caso; uma regra sobre comprimento apenas, não.

### D2 — Skills saem do menu do usuário

`user-invocable: false` em `skills/*/SKILL.md`. O campo esconde o slash command do usuário e
**mantém** a invocação pelo modelo via `Skill` tool — só `disable-model-invocation: true`
bloquearia o modelo, e não é usado aqui.

A regra que fica: **o menu expõe comandos; skills são vocabulário do modelo.** Isso já era verdade
na prática — o `/devflow help` nunca documentou skill alguma como slash command.

**Exceção declarada:** `scrape-stack-batch`. `docs/odoo-profile-standards.md:50` instrui o usuário
a rodar `/devflow:scrape-stack-batch` como follow-up manual de indexação. A exceção é registrada
na allowlist do guard (AC2), não deixada implícita.

### D3 — `design` volta à convenção `devflow-*`

`commands/design.md` → `commands/devflow-design.md`, com `name: devflow-design`.

Não é convenção nova: a **v1.6.0 (2026-05-28)** já reverteu os nomes curtos `/devflow:status`,
`/devflow:sync` e `/devflow:doctor` para `devflow-*`, precisamente porque nomes curtos colidiam
com comandos nativos e de outros plugins (README.md:265). Os outros 12 comandos seguem o padrão.
`design`, introduzido depois na absorção do impeccable (ADR-010), escapou dele.

**Breaking:** `/devflow:design` deixa de existir. Vai ao CHANGELOG como breaking e ao help.

### D4 — O ADR-008 ganha precisão, não muda de decisão

O guardrail vivo do ADR-008 v1.1.0 diz:

> SEMPRE manter artefato condicional a framework sob `assets/<classe>/profiles/<fw>/` — NUNCA em
> `skills/` ou `agents/` do plugin, que são **namespace global registrado sem opt-out**.

E o comentário de `tests/integration/test-profile-skills-not-registered.mjs` repete: *"sem opt-out
por frontmatter"*.

A premissa é imprecisa. Existem **duas superfícies distintas**:

| Superfície | Opt-out? | Mecanismo |
|---|---|---|
| Registro / vocabulário exposto ao modelo | **Não** | — (a skill é carregada em todo projeto) |
| Menu de slash / digitação pelo usuário | **Sim** | `user-invocable: false` |
| Invocação pelo modelo | Sim | `disable-model-invocation: true` |

**A decisão do ADR-008 permanece integralmente válida.** Uma skill de framework em `skills/`
continua sendo carregada em todo projeto e poluindo o vocabulário do modelo — `user-invocable:
false` não resolveria o defeito que o ADR-008 endereça. O que muda é só a justificativa: o
argumento correto é *"registrada sem opt-out"*, não *"vira comando sem opt-out"*.

Relação: **extends**. Tratada via `adr:evolve` no Step 3.5 do Planning.

## 4. Escopo

### Dentro

| # | Mudança | Alcance |
|---|---|---|
| 1 | `user-invocable: false` em 43 `skills/*/SKILL.md` | todas menos `scrape-stack-batch` |
| 2 | rename `commands/design.md` → `commands/devflow-design.md` + `name:` | 1 arquivo |
| 3 | referências vivas a `/devflow:design` | `commands/devflow.md` linhas 349 e 357 (prosa do Step 4e) — as duas únicas no repo |
| 3b | registrar `devflow-design` no help | o comando existe hoje **sem constar** de `Related Commands` nem do bloco `COMMANDS`; entra junto, já que a seção está sendo tocada |
| 4 | guard de regressão | `tests/integration/test-slash-menu-ordering.mjs` (novo) |
| 5 | precisão da premissa | comentário de `test-profile-skills-not-registered.mjs` + `adr:evolve` do ADR-008 |
| 6 | CHANGELOG | entrada breaking |

### Fora

- `disable-model-invocation` — nenhuma skill recebe. O modelo continua com acesso pleno.
- Referências históricas a `/devflow:status`, `/devflow:sync`, `/devflow:doctor` no changelog do
  README (linha 265) — são registro do passado, não referências vivas. O README não cita
  `/devflow:design` em lugar nenhum.
- Qualquer alteração em `agents/` — agent types não têm o campo e não participam do menu de `/`.
- Reordenar ou renomear os outros 12 comandos.

## 5. Critérios de aceite (guard de regressão)

Arquivo novo `tests/integration/test-slash-menu-ordering.mjs`, separado do guard de namespace de
perfil porque o propósito é outro: ali se governa **onde o artefato mora**; aqui, **como a
superfície é ordenada**.

| AC | Asserção | Estado hoje |
|---|---|---|
| **AC1** | `devflow:devflow` é o mínimo por `(len, nome)` entre comandos + skills visíveis | ❌ falha (`config`, `design`, `doctor`, `napkin`) |
| **AC2** | toda skill em `skills/` tem `user-invocable: false`, exceto a allowlist `["scrape-stack-batch"]` | ❌ falha (44/44 sem o campo) |
| **AC3** | todo comando em `commands/` chama-se `devflow` ou casa `^devflow-` | ❌ falha (`design`) |

AC1 é o requisito do usuário. AC2 e AC3 são as duas regras estruturais que o sustentam ao longo do
tempo: sem AC2, uma skill nova de nome curto reintroduz o defeito; sem AC3, um comando novo faz o
mesmo. AC3 dá guarda mecânica a uma convenção que existe desde a v1.6.0 e nunca foi testada.

**Fonte de verdade do AC1:** o teste lê `name:` do frontmatter (com fallback para o basename,
como o loader faz) e compara a chave `(nome.length, nome)` — replicando o critério 3 do
comparador, não uma aproximação dele.

## 6. Alcance para projetos-cliente

DevFlow é **plugin**: `commands/` e `skills/` viajam no pacote. Um projeto-cliente recebe a
correção ao rodar `/devflow update` + reiniciar a sessão — não há nada a materializar em
`.context/`, nenhuma migração, nenhum passo manual.

Consequência do breaking: até atualizar, o cliente mantém `/devflow:design`; depois, precisa usar
`/devflow:devflow-design`. Por isso a entrada de CHANGELOG é marcada como breaking e o help
atualizado no mesmo commit.

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| `napkin` é vendorizada de `blader/napkin`; editar seu frontmatter poderia ser revertido pelo update | Verificado: o Step 4c usa `EXTERNAL_SKILLS_DIR`, default `~/.claude/skills` — **não** o diretório do plugin. A cópia bundled não é tocada. |
| Usuário que digitava `/devflow:<skill>` perde o atalho | Nenhuma skill era documentada como slash command, exceto `scrape-stack-batch`, que fica de fora da mudança por decisão explícita. |
| `user-invocable` ser ignorado pela camada de compat (Cursor/OpenCode) | Campo desconhecido é ignorado por parsers de frontmatter; a perda seria só a de não esconder — degrada para o comportamento atual, não quebra. |
| AC1 depender de detalhe interno de uma versão do harness | O invariante `(len, nome)` é conservador: mesmo que a precedência mude, ter o nome mais curto e alfabeticamente primeiro nunca piora a posição. |

## 8. Sinais exigidos na fase V

```yaml
requiredSignals: [unit, integration, lint]
```

`integration` porque o guard novo mora em `tests/integration/`, ao lado do guard de namespace com
que ele faz par — e é assim que `tests/run-integration.sh` o enumera (`git ls-files
'tests/integration/*.mjs'`). `unit` porque a mudança toca o frontmatter de 43 skills, entrada de
testes que leem esses arquivos.

Sem `e2e`: não há como automatizar o menu de slash do Claude Code. O invariante é integralmente
verificável de forma estática, que é o motivo de ele ser formulado como propriedade dos arquivos
e não como comportamento observável em runtime.
