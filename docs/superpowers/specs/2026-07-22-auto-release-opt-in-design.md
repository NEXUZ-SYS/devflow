# Design — `git.autoRelease` opt-in + `--end-of-options` no `suggest-bump`

**Data:** 2026-07-22 · **Workflow PREVC:** `auto-release-opt-in` · **Escala:** SMALL (P→E→V)
**Racional da decisão (por quê):** [`../plans/2026-07-22-auto-release-opt-in.md`](../plans/2026-07-22-auto-release-opt-in.md) — este spec cobre o *o quê*, sem repetir a análise.

Duas pendências no mesmo caminho (finalização/release), entregues juntas.

---

## A — `--end-of-options` no `git log` do `suggest-bump`

### Dimensionamento honesto

Isto é **hardening marginal**, não correção de bug nem de segurança. O vetor foi revisado três vezes durante o design, cada uma para baixo:

1. Levantado como achado de segurança (injeção de opção via `argv[0]`).
2. Probe do vetor concreto: `git log "--output=/tmp/pwned..HEAD"` **não criou arquivo**. Sem exploit.
3. Probe dos três casos de base malformada:

| base | exit | comportamento atual |
|---|---|---|
| `v9.9.9` (typo de tag) | 128 | já falha alto — o `catch` vira "range indisponível" |
| `--not-a-real-flag` | 128 | já falha alto |
| `--output=/tmp/x` | **0** | **silencioso** — 0 commits → `patch` |

Só escapa o caso em que a base é uma opção que o git **aceita e engole**. O acidente realista (typo de tag) já falha alto hoje.

### Mudança

```js
const out = git(cwd, ["log", "--format=%B%x00", "--end-of-options", `${base}..HEAD`]);
```

`--end-of-options` existe desde git 2.24; o repo já assume ≥ 2.28 (as fixtures usam `git init -b`). Ambiente atual: 2.43.0.

### Efeito

Uma base que hoje é engolida como opção passa a produzir `fatal` → `catch` → `rangeOk = false` → stderr `range indisponível → patch`, em vez de `0 commits` silencioso. O veredito (`patch`) é o mesmo; o que muda é a **auditabilidade**, na mesma família do defeito corrigido na v1.31.1.

### CHANGELOG

Descrever como *hardening / falha explícita*. **Não** vender como correção de segurança — a evidência não sustenta.

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
