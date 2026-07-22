# Higiene de contexto (anti context-rot) — Design

> **Workflow PREVC:** `context-hygiene` · **Escala:** MEDIUM · **Fase:** P
> **Data:** 2026-07-22 · **Status:** aprovado pelo operador

## Problema

Artefatos de processo (planos, specs, trackings) acumulam no projeto e nunca são
retirados de circulação. O dano não é ocupar disco — é **context rot**: o agente lê
material obsoleto com aparência de autoridade e age sobre ele.

Levantamento neste repo (2026-07-22), com 38 planos em `docs/superpowers/plans/`:

| Sinal de progresso | Estado real |
|---|---|
| Checkbox `- [x]` no plano | **morto** — 36/38 planos com zero marcados, incluindo `suggest-bump-postmerge-base`, mergeado e released como v1.31.1 no mesmo dia |
| `progress:` / `fases_completed` no tracking dotcontext | **morto** — o mesmo plano released marca `progress=0, fases_completed=0` |
| Menção do plano no `CHANGELOG.md` | **inexistente** — 0 referências a paths de plano, 0 a PRs |
| `git log --grep <slug>` | **fraco** — 0 a 1 commit por slug |

A conclusão que molda todo o design: **todo sinal auto-declarado de progresso apodrece**.
Ninguém volta para marcar o artefato depois que a entrega saiu. Qualquer mecanismo que
dependa de alguém marcar vai apodrecer da mesma forma — inclusive um que criássemos agora.

Sobra o que aconteceu de fato: o código existir, versionado, na branch principal.

## Taxonomia do rot

Cinco categorias, com donos e riscos distintos:

| | Categoria | Exemplo neste repo | Ação |
|---|---|---|---|
| **A** | Plano entregue ainda no diretório ativo | 30+ dos 38 | **arquiva** (sob confirmação) |
| **B** | Tracking órfão em `.context/plans/` | 7 sem plano-par | **só reporta** — ADR-006 proíbe tocar |
| **C** | Spec órfã | 35 specs × 38 planos | só reporta |
| **D** | Doc solto/duplicado | `docs/specs` × `docs/superpowers/specs`; `docs/.ai/` | só reporta |
| **E** | Ruído local gitignored | `.history/`, `tests/validation/tmp/` | só reporta |

A assimetria é deliberada: **diagnosticar é barato e seguro, mexer é caro e perigoso**.
Só a categoria A tem critério de evidência forte o bastante para justificar movimento
automático.

## Decisões

### D1 — "Executado" significa entrega observável no código

Um plano é candidato a arquivamento quando o que ele descreve **existe hoje na branch
principal** — não quando alguém marcou que existe.

Alinha com a ADR-013 (a fase V *observa* um sinal, não *afirma* que passou). Rejeitadas:
heurística de data e inatividade, porque um plano abandonado também para de receber
commits — e a ADR-014 proíbe explicitamente inferir abandono a partir de sinais que a
fonte não controla.

### D2 — Detecta as 5 categorias, age só na A

O CLI inventaria e classifica tudo; a skill só propõe movimento para A. B nunca é tocada
(território dotcontext, ADR-006), apenas denunciada.

### D3 — Vive no plugin, genérica

`skills/context-hygiene/` + `scripts/context-hygiene.mjs` + `commands/devflow-cleanup.md`.
Proibido hardcodar `docs/superpowers/plans/` como "o path deste repo": ele vem da
convenção do **superpowers**, que é dependência do DevFlow. Paths de `.context/` resolvem
por `context-paths.mjs` (ADR-006). Nada de presumir `CHANGELOG.md`, tags `v*` ou layout DDC.

### D4 — Só move o que o git já protege

`movable = tracked && !dirty && category === 'A'`. Sempre `git mv`. Untracked ou com
modificação pendente é **recusado e reportado**, nunca movido.

A cláusula `category === 'A'` faz parte da definição, não é filtro aplicado depois: um
tracking órfão em `.context/plans/` pode estar perfeitamente tracked e limpo, e ainda
assim jamais pode ser movido (ADR-006). Segurança e escopo são o mesmo predicado, em um
lugar só.

O git vira a rede de segurança: tudo que a skill toca é recuperável por `git checkout`.
O gate é por **arquivo-alvo**, não por working tree — exigir tree limpo seria inviável
(este repo tem 28 arquivos sujos agora e a limpeza nunca rodaria).

Esta decisão responde a um incidente real deste repo, em que um wipe destrutivo apagou
WIP não-commitado.

### D5 — Destino `docs/superpowers/plans/archive/`

Segue a convenção `archive/` já usada 3× no ecossistema (`.context/workflow/archive`,
`harness/workflows/archive`, `runtime/workflows/archive`). Em inglês porque o plugin
serve `en-US`/`es-ES`/`pt-BR` — um dir `finalizados/` vazaria pt-BR para o projeto de um
cliente hispanofalante. Fica ao lado dos planos ativos, então quem procura acha.

### D6 — CLI emite fatos, LLM emite veredito

O CLI é determinístico e testável; o julgamento "a entrega existe no código?" exige ler o
plano e comparar com a árvore — trabalho de LLM, não de regex.

Padrão já estabelecido no plugin por `adr-decision.mjs`, `verify-gate.mjs` e
`suggest-bump.mjs`. Rejeitada a alternativa de o CLI decidir sozinho: para decidir sem
LLM ele cairia em heurística de data, vedada pela ADR-014.

## Contrato do CLI

### `scan --json`

Por artefato encontrado:

| Campo | Tipo | Significado |
|---|---|---|
| `path` | string | caminho relativo à raiz do repo |
| `category` | `A`\|`B`\|`C`\|`D`\|`E` | taxonomia acima |
| `tracked` | bool | está sob controle de versão |
| `dirty` | bool | tem modificação não-commitada |
| `hasSpec` | bool | existe spec pareada por slug |
| `hasTracking` | bool | existe tracking pareado em `.context/plans/` |
| `lastCommit` | `{sha, date}`\|null | último commit que tocou o arquivo |
| `releasesAfter` | int | tags criadas depois de `lastCommit` |
| `movable` | bool | `tracked && !dirty && category === 'A'` |
| `reason` | string\|null | por que não é movable, quando aplicável |

`releasesAfter` é **fato observável**, não veredito — quantas releases nasceram após o
último toque no plano. Quem interpreta é o LLM. É exatamente a fronteira entre a
abordagem escolhida e a que a ADR-014 proíbe.

### `archive <path>...`

Executa `git mv <path> <plansDir>/archive/`. **Recusa** qualquer path com
`movable: false`, com exit code não-zero e motivo no stderr.

A recusa vive no CLI, não na prosa da skill. Guardrail mecânico não é racionalizável por
um agente; instrução em Markdown é — a memória deste repo registra um subagente que
burlou um guardrail que existia só em prosa.

## Fluxo da skill

1. `scan --json`
2. Para cada candidato de A: abrir o plano, verificar se a entrega existe no código
3. Apresentar tabela com veredito **e a evidência que o sustenta**
4. Confirmação humana explícita
5. `archive` nos aprovados
6. Relatório: movidos, recusados (com motivo), reportados-sem-ação (B–E)

Sem `--fix`, para no passo 3. Nunca executa sob `autonomy: autonomous` (ADR-012).

## Segurança

| Controle | Mecanismo |
|---|---|
| Não destruir WIP | `movable` exige `tracked && !dirty`; `git mv` |
| Não invadir dotcontext | `.context/{docs,agents,skills,plans}` nunca é `movable` |
| Não agir sem humano | `--fix` + confirmação; bloqueio sob `autonomy: autonomous` |
| Não sobrescrever | destino existente = recusa e reporta (ADR-012) |
| Config | leitura só via `devflow-config.mjs` (ADR-011) |

## Testes

TDD com fixtures git reais em **tmpdir**, jamais mutando o repo (memória: um E2E
destrutivo já apagou WIP in-place).

Casos RED antes de qualquer implementação:

1. arquivo untracked → `movable: false`, `archive` recusa
2. arquivo tracked porém sujo → `movable: false`, `archive` recusa
3. arquivo tracked e limpo → `movable: true`, `archive` move
4. path em `.context/plans/` → nunca `movable`, mesmo tracked e limpo
5. classificação correta das categorias A–E
6. `git mv` preserva histórico (`git log --follow` acha o arquivo no destino)
7. destino já existente → recusa, não sobrescreve
8. repo sem `docs/superpowers/plans/` → no-op limpo, sem erro (projeto-cliente novo)

`requiredSignals: [unit, lint]`

## Fora de escopo

- **Tornar o `archive/` invisível à busca.** Mover reduz ruído de listagem, mas `grep` e
  `glob` continuam alcançando a pasta. Excluir o path do context-awareness foi avaliado e
  deixado fora — a limpeza é parcial, e isso está declarado, não escondido.
- **Agir nas categorias B–E.** Só diagnóstico nesta versão.
- **Detectar as categorias D e E.** Cortadas na fase R: esta versão implementa **A, B e
  C**. "Duplicado" sem definição operacional vira heurística — o que a ADR-014 proíbe.
  Prometer 5 categorias e entregar 3 faria o agente listar D/E sempre vazias, sugerindo
  "não há docs duplicados" quando nunca foram procurados. O corte é propagado no contrato
  do CLI, no SKILL.md e no CHANGELOG.
- **Consertar os sinais podres** (checkbox, `progress:`). O design os contorna
  deliberadamente em vez de fingir que serão mantidos.

## Revisão da fase R — o que mudou no design

A review (architect + security-auditor, com probes) achou defeitos que alteram o contrato:

| Achado | Correção incorporada |
|---|---|
| **`tracked` e `dirty` em coordenadas diferentes** — `ls-files` é relativo ao cwd, `status --porcelain` à raiz. Rodando de um subdiretório, `dirty` vira `false` para arquivo **com WIP**. Fail-open provado por probe. | Tudo se ancora em `git rev-parse --show-toplevel`. Teste de subdiretório obrigatório. |
| **`git()` engolia falha como `""`** — `status` falhando produzia "nada está sujo". | `git()` devolve `null` em erro; falha de `ls-files`/`status` **aborta** o scan. |
| **O guard de pureza não cobria o arquivo** — `finalize-pure` varre só `scripts/lib/finalize/`, e `run-lint.sh` nem o roda. A Global Constraint era falsa. | O guard é estendido e passa a rodar no `lint`. |
| **Consentimento em prosa** — contradizia a tese central da spec. | Gate **mecânico** `--confirmed` no CLI (exit 2 sem ele). |
| **Vazio ambíguo** (4 achados independentes) | `scan` emite `scannedDirs` com a procedência da busca. |
| **Hardcode de `.context/plans`** | Vem de `contextPaths()`, que já marca as chaves como "INTOCADOS". |

O **dogfooding saiu do escopo do PR**: rodar a ferramenta sobre ~40 planos reais no seu
momento menos validado, com 28 arquivos sujos na árvore, é o cenário que os fail-opens
acima tornavam perigoso. Vira follow-up pós-merge, em commit próprio.

Dois pontos foram **testados e mantidos**: o hardcode de `docs/superpowers/plans/` (o
architect verificou 8 versões do superpowers — o path é estável desde a 5.0.6) e a
ausência de path traversal (`byPath.get()` é igualdade exata; 5 variantes de escape
testadas, todas recusadas).

## Aplicação a este repo (dogfooding)

A auditoria dos 38 planos é o **primeiro uso real** da skill, não um script descartável.
Os 3 planos untracked (`devflow-e2e-fixes`, `auto-release-opt-in`,
`harness-sensors-catalog-gap`) serão recusados pela própria salvaguarda — comportamento
correto sendo demonstrado, não falha.
