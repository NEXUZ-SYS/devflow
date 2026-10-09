---
type: spec
name: model-routing-lab
title: Laboratório de validação autônoma do roteamento de modelos (v3.7.0)
status: revisado-fase-R
scale: LARGE
autonomy: autonomous
created: "2026-10-09"
revised: "2026-10-09 — fase R: architect e security-auditor APROVADO-COM-RESSALVAS; sondas §13; decisões L12–L16"
requiredSignals: [unit, integration, e2e, lint]
---

# Laboratório de validação autônoma do roteamento de modelos — Design

> **Workflow:** `model-routing-e2e-validation` | **Escala:** LARGE | **Autonomia:** autonomous.
> Spec gerada sem diálogo socrático, por escolha do operador. Revisada na fase R com as revisões do
> architect e do security-auditor e com sondas reais no Claude Code 2.1.295 (§13).

## 1. Objetivo

A v3.7.0 entregou o roteamento de modelos (ADR-017): a sessão principal troca de modelo por fase do
PREVC, o esforço segue a skill, cada subagente recebe um tier por agente, fase e task, nada passa do
teto do usuário e o resultado vai para um ledger com relatório. As provas até aqui são testes de
unidade e integração e duas sessões reais curtas. Falta ver o roteamento num **PREVC inteiro, sem
humano, com agentes e subagentes reais**.

O laboratório responde, com evidência, a quatro perguntas:

| # | Pergunta | Evidência |
|---|---|---|
| Q1 | O roteamento obedece à tabela e ao teto num PREVC real? | invariantes contra a **fase real** (timestamps do `prevc.json`) sobre transcripts + ledger (§7) |
| Q2 | Quanto economiza? | tokens por modelo, agente e fase, braço roteado × linha de base (§8) |
| Q3 | A qualidade do software se mantém? | suíte de aceitação oculta + fases do PREVC alcançadas (§6) |
| Q4 | Onde a tabela precisa de ajuste? | uso e escaladas por agente/tier → braço de refinamento (§9) |

**Critério de sucesso do laboratório:** uma campanha (braços A e B) roda de ponta a ponta sem
intervenção e gera um scorecard com veredito para cada invariante, a matriz de cobertura das
funcionalidades da v3.7 e o comparativo de tokens.

### 1.1 Hipóteses pré-registradas

Registradas antes da primeira rodada, para que o resultado não seja racionalizado depois:

- **H1 — fase defasada em `-p`.** O mod lê a fase só no `turn.start` (`router-core.onTurnStart`). Em
  `claude -p`, cada invocação é **um** turno; se o `/devflow auto` atravessar várias fases numa
  invocação, a sessão não troca de modelo na fronteira R→E e os overrides de fase dos subagentes usam
  a fase do início do turno. Esperado: `INV-PHASE-SYNC` e `INV-SESS` = MISS no braço B. A camada L1
  caracteriza o mecanismo de forma determinística (Task 3).
- **H2 — reaquecimento após retomada.** Cada `--resume` é um processo novo do mod, sem o ID completo
  dos tiers aprendido (D21); a sessão volta ao teto até o primeiro `agent.spawn` que resolva para o
  tier da fase. Esperado: trocas extras de modelo na sessão, uma por retomada.

## 2. Princípios

1. **Capturar, não resolver.** Durante uma rodada, nada é consertado (nem o software-alvo, nem o
   DevFlow). Desvio vira achado no scorecard; correção é um workflow próprio no repo `devflow`.
2. **Oráculo independente.** O esperado vem de uma tabela escrita à mão (`oracle/oracle.json`,
   transcrita da spec do roteamento §5), nunca da lib que está sob teste.
3. **Fase real, não autorreportada.** A fase de cada mensagem e de cada despacho vem dos timestamps
   das fases no `prevc.json` (instantâneos salvos pelo driver), não do `phase` do ledger, que é
   produzido pelo próprio sistema sob teste.
4. **Isolamento.** Cada rodada roda num workspace novo em `tmpdir`, fora do laboratório e fora de
   `$HOME`, com ambiente por allowlist (L12); o ledger vai para um `XDG_DATA_HOME` da rodada; o plugin
   vem de um checkout imutável da tag, conferido antes e depois de cada braço.
5. **Só números.** O que o laboratório guarda das rodadas são números, enums e IDs validados por regex.
   Prompt, resposta, código gerado, trecho de transcript e chave arbitrária do ledger nunca entram em
   `results/`.
6. **Autorrelato declarado.** Ledger, `prevc.json` e transcripts são escritos pelo próprio agente em
   teste (ou pelo processo dele); o scorecard declara isso.

## 3. Decisões

| # | Decisão |
|---|---|
| L1 | Repo **separado e irmão** do `devflow`: `devflow-routing-lab`, git local sem remoto. Spec e plano ficam no repo `devflow` (é onde roda o workflow). O `devflow-e2e-sandbox` não é tocado. |
| L2 | O plugin sob teste é a **tag `v3.7.0`**, clonada (`git clone --depth 1 --branch v3.7.0` do repo local) para `${XDG_CACHE_HOME:-~/.cache}/devflow-routing-lab/` — **fora** do laboratório (emenda da fase E: dentro dele, `$CLAUDE_PLUGIN_ROOT/../..` alcançava a suíte oculta) — e carregada com `claude --plugin-dir`. O superpowers também vem por `--plugin-dir` (cópia do cache do operador, versão registrada). `git status --porcelain` do clone é conferido vazio antes e depois de cada braço. Outro ref (`--ref`) serve para validar um ajuste. |
| L3 | O software-alvo é **um encurtador de links** (API HTTP + autenticação por token + limite de taxa + CLI), em Node ≥ 22, só biblioteca padrão. |
| L4 | O agente vê só `brief/PRODUCT.md`. A **suíte de aceitação** (`acceptance/`) e a referência ficam no laboratório, fora do alcance relativo do workspace (L13). |
| L5 | Cada execução é um **braço** descrito por dados (`arms/<id>.json`): teto (`--model`/`--effort`) e o bloco `models:` do `.devflow.yaml`. |
| L6 | O PREVC do workspace roda com `claude -p "/devflow:devflow auto …"` em `--permission-mode bypassPermissions`, `--output-format stream-json`. Um **driver** retoma (`--resume`) enquanto a rodada não terminar, até `maxResumes` (inteiro 0–20, default 6). |
| L7 | A finalização (fase C) é **local**: o `.devflow.yaml` do seed não declara `prCli` nem remoto, usa `versioning: none` e `autoFinish: false`; a mensagem de retomada manda escolher **merge local**. Terminou = fase C `completed`, ou fase atual C com P–V concluídas e o workspace na `main`. |
| L8 | Coleta: **transcripts** como fonte de uso (deduplicados por `message.id`; sessão: `timestamp`, `model`, `effort`, `attributionSkill`, `usage` numérico; subagentes: `meta.json` + o mesmo), **ledger** normalizado, **instantâneos do `prevc.json`** por invocação, `model-route.mjs report`. O `modelUsage` do `stream-json` é só conferência (alerta se divergir > 5%). |
| L9 | Veredito por verificação: **HELD**, **MISS**, **N/A** (não exercitado). N/A não é falha; vira lacuna de cobertura. |
| L10 | A **camada L1** testa a CLI da v3.7 (`resolve`/`escalate`/`report`, `--runtime omp`), o hook clássico e o `router-core` puro (caracterização de H1/H2) em fixtures, contra o oráculo, sem modelo. A **camada L3** (rodadas vivas) cobre o que só aparece numa sessão real. |
| L11 | A fase V deste workflow roda **uma campanha real com os braços A e B**. C e D ficam no runbook. |
| L12 | **Isolamento da rodada** (validado por sonda, §13): ambiente por allowlist (`PATH`, `LANG`, `TERM`, `HOME` real, `XDG_DATA_HOME` da rodada, `DEVFLOW_MODEL_ROUTING` só no braço roteado, `DISABLE_AUTOUPDATER=1`), `GIT_CONFIG_GLOBAL` vazio da rodada, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `GH_CONFIG_DIR` vazio; flags `--setting-sources project,local` (sem hooks, plugins e `env` do usuário), `--strict-mcp-config --mcp-config <ws>/.mcp.json` (só dotcontext), `--disallowedTools "Bash(gh *)" "Bash(git push*)" "Bash(git remote*)"`. `CLAUDE_CONFIG_DIR` **não** é usado (com o diretório real grava `~/.claude/.claude.json`; isolado, exigiria copiar credencial e arriscar a rotação do token). |
| L13 | Rodadas em `${TMPDIR:-/tmp}/devflow-routing-lab/runs/<id>/` (fora do laboratório e de `$HOME`, onde há `CLAUDE.md` ancestral). O driver recusa `--runs` dentro do laboratório ou de `$HOME`. |
| L14 | **Preflight** antes de cada braço: uma invocação curta (`haiku`, prompt "ok") com as mesmas flags; aborta o braço se o `system/init` não tiver exatamente um plugin `devflow` vindo do `pluginDir` e o MCP `dotcontext` conectado. |
| L15 | **Parada honesta:** `result` ausente, `is_error` ou `subtype` ≠ `success` → a rodada para como `incomplete` com o motivo (ex.: limite de cota), sem retomar. Timeout mata o grupo de processos e marca `killed`; o ledger daquela invocação pode faltar (o mod grava no `turn.complete`) e as verificações que dependem dele ficam N/A. |
| L16 | Versões fixadas: `@dotcontext/cli` com versão exata no `seed/.mcp.json`; `run.json` registra versão do Claude Code, do plugin e do superpowers. |

## 4. Arquitetura

```
 devflow (tag v3.7.0) ──clone──▶ lab/.cache/devflow@v3.7.0 ─┐   superpowers (cache, versão registrada)
                                                            ▼            ▼
 arms/B-routed.json ─┐                         ┌───────────────────────────────────────────┐
 seed/ ──────────────┼─▶ run-arm.mjs ─▶ tmp/ws ─▶│ preflight → claude -p /devflow auto (+resume)│
 brief/PRODUCT.md ───┘   (env allowlist, L12)    │ P→R→E→V→C, subagentes, mod de roteamento     │
                                                 └───────────────────┬───────────────────────┘
                 stream-<n>.jsonl · prevc-<n>.json · transcripts (~/.claude/projects/<slug>) · tmp/xdg ledger
                                                                     ▼
                       collect.mjs ─▶ runs/<id>/metrics.json (só números, enums, IDs)
 acceptance/ ─▶ accept.mjs (env mínimo, cwd tmp, grupo de processos) ─▶ metrics.acceptance
 oracle/oracle.json ─▶ score.mjs ─▶ lab/results/<data>-<campanha>/scorecard.md
```

### 4.1 Unidades

| Unidade | Responsabilidade | Depende de |
|---|---|---|
| `lib/arm.mjs` | Valida um braço; monta env (allowlist, L12), argv (isolamento) e o bloco `models:`. Puro. | — |
| `lib/plugin.mjs` | Clone da tag, caminho do superpowers, versões, conferência de integridade. | git |
| `lib/seed.mjs` | Materializa o workspace a partir de `seed/` + braço (git init, commit inicial). | git |
| `lib/stream.mjs` | Lê `stream-json`: `session_id`, `system/init` (plugins, MCP), resultado, uso por modelo. Puro. | — |
| `lib/safe-read.mjs` | Leitura de arquivo regular sem link; listagem sem seguir link; contenção por `realpath`. | `node:fs` |
| `lib/transcripts.mjs` | Mensagens da sessão e de subagentes: só `ts`, modelo, esforço, skill (ID validado) e números de `usage`. | leitura segura |
| `lib/ledger.mjs` | Lê e **normaliza** o ledger (allowlist da ADR-017, valor inválido vira `?`), violações como códigos. | — |
| `lib/prevc.mjs` | Fases com `start`/`end` de um ou vários instantâneos do `prevc.json`; `phaseAt(ts)`. | leitura segura |
| `lib/invariants.mjs` | Vereditos (§7) contra o oráculo e a fase real; matriz de cobertura. Puro. | oráculo |
| `lib/scorecard.mjs` | Scorecard Markdown com escape de Markdown/HTML; só enums, IDs e números. Puro. | — |
| `lib/collect.mjs` | Monta `Metrics` de uma rodada. | libs |
| `lib/accept.mjs` | Roda a suíte oculta com env mínimo, cwd temporário e grupo de processos. | `acceptance/` |
| `scripts/*.mjs` | `plugin`, `run-arm`, `collect`, `accept`, `score`, `campaign`: CLIs finas. | libs |
| `l1/` | Testes determinísticos da CLI, do hook clássico e do `router-core` da tag. | cache do plugin |

## 5. Braços

| Braço | Roteamento | Teto (modelo/esforço) | `models:` | Papel |
|---|---|---|---|---|
| **A — baseline** | desligado | `opus`/`xhigh` | ausente | controle; base da economia |
| **B — routed** | ligado | `opus`/`xhigh` | `enabled`, `session`, `subagents`, `ledger`, `midRun.enabled: true` | medição principal |
| **C — ceiling** | ligado | `sonnet`/`medium` | como B | prova estrutural do teto |
| **D — stress** | ligado | `opus`/`xhigh` | como B + overrides `cheap` em E | força falhas para exercitar as escaladas |

O braço A também é o **controle negativo** (sem ledger). Refinamento (§9) acrescenta braços `B2…`.

## 6. Software-alvo e qualidade

**`brief/PRODUCT.md`** (o que o agente recebe): encurtador `shortlink`.

- `node src/server.mjs --port <n> --data <dir>`; token em `SHORTLINK_TOKEN`.
- `POST /links` (auth) cria `{slug, url}`; `GET /:slug` → 302; `GET /links/:slug/stats` (auth) →
  acessos; `DELETE /links/:slug` (auth).
- Auth Bearer com comparação em tempo constante; URL só `http`/`https`; slug `[A-Za-z0-9_-]{4,32}`.
- Limite de taxa por janela deslizante (`SHORTLINK_RATE_LIMIT=N/S`), `429` com `Retry-After`.
- Persistência em JSON com escrita atômica; CLI `add|get|stats|rm`; testes `node --test`; README.

**Suíte oculta (`acceptance/`):** 13 testes caixa-preta (dezenas de asserções) via HTTP e CLI,
provados contra uma implementação de referência (passa tudo) e uma quebrada (reprova). Roda com env
mínimo, `HOME` e `cwd` temporários, e mata o grupo de processos no timeout. **Q3 = HELD** quando B
passa em pelo menos tantos testes quanto A e o PREVC de B termina (L7).

## 7. Verificações (Q1) e matriz de cobertura

Fase real de um instante `t` = a fase cujo intervalo `[started_at, completed_at)` no `prevc.json`
contém `t` (instantâneos de todas as invocações combinados). Instante fora de qualquer intervalo →
fase desconhecida → a mensagem não entra na verificação.

| id | Verificação | Braço | Regra |
|---|---|---|---|
| INV-CEIL | Nada acima do teto | B, C, D | todo modelo (sessão e subagentes) com tier ≤ tier do teto; todo esforço ≤ esforço do teto |
| INV-SESS | Sessão no tier da fase real | B, C | cada mensagem da sessão com fase real conhecida tem o tier esperado para a fase (spec do roteamento §5, teto aplicado); evidência: divergências por fase, nº de trocas, trocas após retomada (H2) |
| INV-PHASE-SYNC | Fase do roteador = fase real | B, C, D | para cada despacho com linha de spawn no ledger, `phase` do ledger = fase real no primeiro instante do subagente (H1) |
| INV-SUB | Subagente no tier do oráculo | B, C | tier observado = oráculo(agente, **fase real**) com teto, ou fonte `explicit`/`plan`/`skill` no ledger e ≤ teto; subagente sem mensagem não entra |
| INV-EFF | Esforço conforme | B, C | sessão: mensagens com skill mapeada no oráculo têm o esforço da skill (≤ teto); subagente: primeiro passo com o esforço do agente (≤ teto) |
| INV-LEDGER | Ledger dentro da allowlist | B, C, D | nenhuma violação na leitura normalizada; roteado com ledger ligado e zero linhas = MISS |
| INV-OFF | Roteamento desligado não deixa rastro | A | zero linhas de ledger |
| INV-PREVC | PREVC terminou | todos | terminou pela regra L7 |
| INV-ISOL | Rodada não tocou o laboratório | todos | zero referências ao caminho do laboratório ou a `shortlink-ref` nos transcripts (só a contagem é guardada) e `.claude/settings*.json` do workspace sem alteração entre invocações (emenda da fase E) |

**Matriz de cobertura da v3.7** (exercitada / não exercitada, com o sinal observável): sessão por fase
(D11) · esforço por skill (D12) · subagente por agente (D3) · override de fase (`code-reviewer` na fase
real R) · tier da task do plano (`**Tier:**` no plano do workspace + `general-purpose` com modelo
explícito na fase E; no mod chega como `explicit`, spec do roteamento §12) · skill `final-review`
(não observável no mod: chega como `explicit`) · teto do usuário (D5: agente cujo tier do oráculo
passa do teto rodou no teto) · esforço por passo (D13) · escalada no meio (D14) · escalada entre
tentativas (D7) · ledger (D9) · `model-route report` (com ao menos uma linha de agente) · opt-in duplo
(D18, braço A).

## 8. Economia (Q2)

Fonte: transcripts deduplicados por `message.id`. Tabelas por braço: tokens (entrada, saída, cache
lido, cache criado) por modelo, por tipo de agente e por fase real da sessão; custo do cache frio em
cada troca de modelo da sessão (razão de cache lido na primeira mensagem após a troca). Linha B ÷ A
em saída e em custo de lista (peso por modelo do `modelUsage`, não consumo da cota, que não é
público). Uma rodada é n = 1; o scorecard não extrapola.

## 9. Refinamento (Q4)

O scorecard traz, por tipo de agente: despachos, modelos, tokens e escaladas. O runbook
`runbooks/refine.md` orienta: hipótese → override no `.devflow.yaml` de um braço novo (`B2`) → nova
rodada → comparação com B. Override que se prova vira proposta de mudança no `routes.json`, num
workflow próprio no repo `devflow`. Fora do escopo: resultado do `verify:` por task.

## 10. Erros e segurança

| Ponto | Risco | Tratamento |
|---|---|---|
| `bypassPermissions` | agente alcança credenciais, rede, outros repos | L12 + L13. **Risco residual aceito:** não é sandbox — caminhos absolutos (`~/.ssh`, `~/.git-credentials`, repo `devflow`) seguem legíveis; o modelo de ameaça é acidente de um agente cooperativo, não adversário. Isolamento forte (`bwrap` via `--claude-bin`) fica como opção no runbook. |
| Plugin sob teste alterado pelo agente | resultado contaminado | `git status --porcelain` do clone antes/depois de cada braço; sujo → campanha aborta |
| Suíte oculta alterada durante a rodada | Q3 forjado ou contaminado | digest de `acceptance/**`, `fixtures/**` e `lib/accept.mjs` antes/depois de cada braço; mudou → campanha aborta; total da aceitação conferido (13) |
| Rodada travada ou sem cota | retomadas à toa | L15 |
| Leitura de dados do agente | link em diretório intermediário, FIFO, arquivo enorme, JSON não-objeto, `__proto__` | só arquivo regular (`O_NOFOLLOW`), listagem com `withFileTypes` aceitando só arquivo/diretório reais, contenção por `realpath` sob a raiz; linha não-objeto vira violação; agregações em `Map`/`Object.create(null)` |
| Texto livre em `results/` | injeção de Markdown/link no scorecard versionado | ledger normalizado; violações como códigos; evidências só com enums, IDs validados e números; `esc` neutraliza `` []()<>`*_!| `` e quebras de linha |
| Suíte oculta executa código do agente | env do operador, órfãos, escrita no laboratório | env mínimo, `HOME`/`cwd` temporários, grupo de processos morto no timeout; `stop()` não espera processo já morto |
| Subagentes deste workflow | git destrutivo, sessões reais fora de hora | prompt de despacho com o bloco de proibições (Global Constraints do plano), literal |

## 11. Testes (TDD) — do próprio laboratório

| Sinal | Cobertura |
|---|---|
| unit | `arm`, `stream`, `safe-read`, `transcripts`, `ledger`, `prevc`, `invariants` (cada verificação com HELD/MISS/N/A, H1/H2 sintéticos), `scorecard` (incl. injeção), `seed`, `accept` |
| integration | `l1/`: CLI `resolve` (matriz agente × fase), `escalate`, `report`, `--runtime omp`, hook clássico, `router-core` (caracterização de H1/H2) contra o checkout da tag |
| e2e | pipeline com `claude` falso (formato real: ledger por processo, spawn com ID completo, sessão sem `effort`, `prevc.json` com timestamps): `run-arm` (preflight, retomada, parada) → `collect` → `accept` → `score`; campanha A+B |
| lint | `node --check` em todo `.mjs` + guarda contra escrita com caminho literal fora do laboratório |

**Verificação real na fase V:** campanha A + B ao vivo, scorecard gerado e revisado.

## 12. Fora do escopo

- Consertar o DevFlow ou o software-alvo durante a rodada (§2).
- Rodar no omp ao vivo (coberto em L1).
- Rodadas em paralelo e estatística com n > 1 (o runbook permite repetir).
- Sandbox de sistema (`bwrap`) como padrão.
- Publicar o laboratório num remoto.

## 13. Premissas e sondas (fase R, Claude Code 2.1.295)

| # | Premissa | Resultado |
|---|---|---|
| 1 | `claude -p --plugin-dir` carrega o DevFlow e o mod como a instalação | **Sim.** `devflow@inline` 3.7.0 do `pluginDir`; mod ativo (`adapter: mod`); `documentation-writer` na fase E com teto `sonnet` rodou em `haiku`. |
| 2 | `/devflow auto` em `-p` percorre as fases; C conclui sem remoto | **Não sondada** (custo de uma rodada inteira). Coberta por L6/L7/L15; falha vira achado. |
| 3 | `result` do `stream-json` traz uso por modelo | **Sim** (`modelUsage`, `subagent_stats`). Pode vir acumulado entre retomadas: por isso a fonte é o transcript (L8). |
| 4 | `XDG_DATA_HOME` por rodada isola o ledger | **Sim.** O mod cria os diretórios pais sozinho; arquivo por `sessionKey` do processo (não sobrescreve entre retomadas); duas linhas por subagente (spawn com `model` em ID completo, `phase`, `tier`, `source`; depois `usage`). `agentId` do ledger = `agent-<id>` do transcript. |
| 5 | A fase do mod acompanha o PREVC dentro de uma invocação | **Não** (leitura do código, `router-core.onTurnStart`): vira a hipótese H1, medida por `INV-PHASE-SYNC`. |
| 6 | Isolamento sem copiar credencial | **Sim** (receita L12): só `devflow` + `superpowers` carregados, nenhum MCP alheio, `git config --global` vazio, `gh` deslogado, autenticação OK, nada novo em `~/.claude`. Sem L12, a rodada herdava `discord`, `cli-anything`, conectores do claude.ai, `mempalace` e o hook `rtk`. |

## 14. Agentes previstos

architect (revisão R), backend-specialist (libs e scripts), test-writer (oráculo, L1, suíte oculta,
e2e com `claude` falso), security-auditor (revisão pesada da Task 11 e da Task 10), documentation-writer
(README, GABARITO, runbooks).
