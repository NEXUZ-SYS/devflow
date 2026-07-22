# Design — `git.autoRelease` opt-in + `--end-of-options` no `suggest-bump`

**Data:** 2026-07-22 · **Workflow PREVC:** `auto-release-opt-in` · **Escala:** SMALL (P→E→V)
**Racional da decisão (por quê):** [`../plans/2026-07-22-auto-release-opt-in.md`](../plans/2026-07-22-auto-release-opt-in.md) — este spec cobre o *o quê*, sem repetir a análise.

Duas pendências no mesmo caminho (finalização/release), entregues juntas.

---

## A — `--end-of-options` no `git log` do `suggest-bump`

### Dimensionamento — corrigido durante a Execution

Isto **é** hardening de segurança. O dimensionamento foi revisado duas vezes para baixo durante o design e depois **corrigido para cima na fase E**, quando o teste expôs o erro do método de verificação:

1. Levantado como achado de segurança (injeção de opção via `argv[0]`).
2. Probe: `git log "--output=/tmp/pwned..HEAD"` — procurei por `/tmp/pwned`, não encontrei, e conclui "sem exploit". **Errado.**
3. O teste RED revelou: o arquivo criado chama-se **`/tmp/pwned..HEAD`** — o `..HEAD` é concatenado *dentro* do valor da opção. `ls` confirmou `/tmp/pwned..HEAD` (19B) e `/tmp/x..HEAD` (19B). O `git log` **honra** `--output=`.

**A primitiva real:** uma `base` iniciada por `--output=` faz o git escrever num caminho arbitrário gravável, sempre com sufixo `..HEAD`, conteúdo = saída do log. O sufixo fixo impede sobrescrever um alvo existente pelo nome exato (não dá para clobber `~/.bashrc`), então é **criação** de arquivo arbitrária, não sobrescrita — severidade baixa, mas real.

**Superfície:** `argv[0]` vem do operador ou da skill; a skill chama sem argumento. Não é fronteira remota. Ainda assim, defesa em profundidade é exatamente o caso de uso do `--end-of-options`.

| base | exit | comportamento antes da guarda |
|---|---|---|
| `v9.9.9` (typo de tag) | 128 | já falha alto — o `catch` vira "range indisponível" |
| `--not-a-real-flag` | 128 | já falha alto |
| `--output=<gravável>` | **0** | **escreve o arquivo** + 0 commits → `patch` silencioso |
| `--output=<não-gravável>` | ≠0 | falha alto (por permissão, não por guarda) |

A última linha é a armadilha do método: um teste apontando para caminho não-gravável **passa pelo motivo errado**, sem exercitar o caminho vulnerável. O teste usa tmpdir gravável de propósito.

### Mudança

```js
const out = git(cwd, ["log", "--format=%B%x00", "--end-of-options", `${base}..HEAD`]);
```

`--end-of-options` existe desde git 2.24; o repo já assume ≥ 2.28 (as fixtures usam `git init -b`). Ambiente atual: 2.43.0.

### Efeito

Uma base engolida como opção passa a produzir `fatal` → `catch` → `rangeOk = false` → stderr `range indisponível → patch`, **e nenhum arquivo é escrito**. O veredito (`patch`) é o mesmo; o que muda é que a escrita indevida some e o range vazio deixa de ser silencioso.

### CHANGELOG

Descrever como **hardening de segurança** (escrita de arquivo indevida via injeção de opção) **e** falha explícita. Registrar a severidade honestamente: baixa — criação de arquivo com sufixo fixo, a partir de entrada que não vem de fronteira não-confiável.

---

## B — `git.autoRelease` opt-in

### Config

```yaml
git:
  versioning: pipeline
  prCli: gh
  autoFinish: true
  autoRelease: true      # novo — ausência = false (retrocompatível)
```

Lido via `node scripts/lib/devflow-config.mjs read-field autoRelease .context/.devflow.yaml`. **Nenhum leitor novo**: `prCli` já vive sob `git:` e é lido exatamente assim pelo Step 4 da `prevc-confirmation`. ADR-011 satisfeito por precedente, não por exceção.

Valor ausente → string vazia → tratado como desativado. Só a string `true` ativa.

### Ramificação do Step 8.1

As duas condições de guarda **existentes** não mudam: o bloco só existe sob `versioning: pipeline` **e** `## [Unreleased]` não-vazio. Dentro dele:

| `autoRelease` | `prCli` | bump derivado | Ação |
|---|---|---|---|
| ausente / `false` | — | — | Signpost (comportamento de hoje) |
| `true` | ≠ `gh` | — | Signpost + nota de alcance de forge |
| `true` | `gh` | `major` | Signpost + "auto-disparo suspenso: breaking change" |
| `true` | `gh` | `patch` / `minor` | `gh workflow run release.yml -f bump=<X>` |

### Semântica do `major` (decidida)

**Sinaliza e segue — o workflow completa normalmente.** Não usa o mecanismo de `escalated` do autonomous-loop.

Razão: no Step 8.1 a entrega **já está mergeada na main** (o merge aconteceu no Step 4). Pausar o workflow ali o deixaria pendurado por uma decisão de *release*, não de código. O major simplesmente não é promovido a dispatch — fica pendente esperando o operador, que é exatamente o comportamento de hoje para todos os bumps.

Vale igualmente sob `autonomy: autonomous`.

### Falha do dispatch

Se `gh workflow run` sair não-zero (sem permissão, workflow ausente, rede), **cair para o signpost** com o comando pronto e a mensagem de erro. Nunca deixar o operador sem o caminho manual.

### Sucesso do dispatch

Informar que o release PR abre em instantes, que o **merge dele — humano — é o que publica**, e a fricção `action_required` dos checks do PR do bot. Auto-disparo não elimina intervenção humana; desloca-a.

### `/devflow config`

- Pergunta nova, oferecida **apenas** quando `versioning: pipeline` (nos outros modos o bloco nem existe).
- **Cross-check obrigatório**, seguindo o padrão do par contraditório já existente (`autoFinish.bump` × `versioning`): `autoRelease: true` com `versioning ∈ {local, none}` é contraditório — não gerar em silêncio; avisar e oferecer resolução.

---

## Testes

`requiredSignals: [unit, lint]` — helper puro (A) e prosa de skill + entrevista (B). Nada toca auth, pagamentos, fluxo de usuário ou CLI executado pelo usuário final.

| # | Alvo | Asserção |
|---|---|---|
| 1 | A | base `--output=/tmp/x` → stderr `range indisponível`, **não** `0 commits`; `/tmp/x` não criado |
| 2 | A | base válida segue funcionando (não-regressão dos 14 testes atuais) |
| 3 | B | Step 8.1 contém as 4 linhas da tabela de ramificação (grep na SKILL.md) |
| 4 | B | Step 8.1 mantém o guard `prCli: gh` no ramo de dispatch |
| 5 | B | Step 8.1 documenta o fallback para signpost em falha de dispatch |
| 6 | B | `/devflow config` documenta o cross-check `autoRelease` × `versioning` |

Os testes 3-6 são verificações de contrato sobre texto de skill — o mesmo mecanismo já usado para o signpost original (`grep` de asserções). Não substituem teste de comportamento; a skill é interpretada por LLM, não executada.

## Escopo

**Dentro:** `--end-of-options`; chave `autoRelease` + ramificação do Step 8.1 + guard de forge + fallback; pergunta e cross-check no `/devflow config`; CHANGELOG.

**Fora:** merge automático do release PR (é *o* ato outward-facing — permanece humano); aprovação automática dos runs `action_required`; ramo `glab` do release (lacuna própria, já rastreada); mudar o default de `autoFinish`; o check `harness-sensors` do doctor (workflow separado — [`../plans/2026-07-22-harness-sensors-catalog-gap.md`](../plans/2026-07-22-harness-sensors-catalog-gap.md)).

## Guardrails de ADR

| ADR | Aplicação |
|---|---|
| 011 | `autoRelease` lido só via `devflow-config.mjs read-field` — nenhum parse ad-hoc, nenhum leitor novo. |
| 013 | `requiredSignals` declarados; a fase V observa o ledger do `verify-gate`. |
| 009 | Semântica de `--end-of-options` e os exit codes das bases malformadas verificados empiricamente em repo descartável. |
