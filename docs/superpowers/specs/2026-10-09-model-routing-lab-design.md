---
type: spec
name: model-routing-lab
title: Laboratório de validação autônoma do roteamento de modelos (v3.7.0)
status: rascunho-autônomo
scale: LARGE
autonomy: autonomous
created: "2026-10-09"
requiredSignals: [unit, integration, e2e, lint]
---

# Laboratório de validação autônoma do roteamento de modelos — Design

> **Workflow:** `model-routing-e2e-validation` | **Escala:** LARGE | **Autonomia:** autonomous.
> Spec gerada sem diálogo socrático, por escolha do operador; as decisões e as premissas estão
> registradas em §3 e §13 para revisão na fase R.

## 1. Objetivo

A v3.7.0 entregou o roteamento de modelos (ADR-017): a sessão principal troca de modelo por fase do
PREVC, o esforço segue a skill, cada subagente recebe um tier por agente, fase e task, nada passa do
teto do usuário e o resultado vai para um ledger com relatório. As provas até aqui são testes de
unidade e integração e duas sessões reais curtas. Falta ver o roteamento num **PREVC inteiro, sem
humano, com agentes e subagentes reais**.

O laboratório responde, com evidência, a quatro perguntas:

| # | Pergunta | Evidência |
|---|---|---|
| Q1 | O roteamento obedece à tabela e ao teto num PREVC real? | invariantes sobre ledger + transcripts (§7) |
| Q2 | Quanto economiza? | tokens por modelo, braço roteado × linha de base (§8) |
| Q3 | A qualidade do software se mantém? | suíte de aceitação oculta + fases do PREVC alcançadas (§6) |
| Q4 | Onde a tabela precisa de ajuste? | uso e escaladas por agente/tier → braço de refinamento (§9) |

**Critério de sucesso do laboratório:** uma campanha (braços A e B) roda de ponta a ponta sem
intervenção e gera um scorecard com veredito para cada invariante, a matriz de cobertura das
funcionalidades da v3.7 e o comparativo de tokens.

## 2. Princípios

1. **Capturar, não resolver.** Durante uma rodada, nada é consertado (nem o software-alvo, nem o
   DevFlow). Desvio vira achado no scorecard; correção é um workflow próprio no repo `devflow`. É a
   regra do kit E2E anterior.
2. **Oráculo independente.** O esperado vem de uma tabela escrita à mão (`oracle/oracle.json`,
   derivada da spec §5 do roteamento), nunca da lib que está sob teste.
3. **Isolamento.** Cada rodada roda num workspace novo fora de qualquer diretório versionado; o
   ledger vai para um `XDG_DATA_HOME` da rodada; o plugin vem de um checkout imutável da tag.
4. **Só números.** O que o laboratório guarda das rodadas são métricas numéricas e enums. Prompt,
   resposta, código gerado e transcript nunca entram no repo do laboratório.

## 3. Decisões

| # | Decisão |
|---|---|
| L1 | Repo **separado e irmão** do `devflow`: `devflow-routing-lab`, git local sem remoto. Spec e plano ficam no repo `devflow` (é onde roda o workflow). O `devflow-e2e-sandbox` não é tocado. |
| L2 | O plugin sob teste é a **tag `v3.7.0`**, clonada (`git clone --depth 1 --branch v3.7.0` do repo local) para um cache do laboratório e carregada com `claude --plugin-dir`. Nada de `git worktree` no repo `devflow` (mutaria o `.git` dele) nem de `plugin install`. Para validar um ajuste, o mesmo mecanismo aceita outro ref (`--devflow-ref`). |
| L3 | O software-alvo é **um encurtador de links** (API HTTP + autenticação por token + limite de taxa + CLI), em Node ≥ 22, só biblioteca padrão. É pequeno o bastante para um PREVC MEDIUM e tem peças que puxam agentes diferentes: arquitetura, backend, segurança, testes e documentação. |
| L4 | O agente vê só `brief/PRODUCT.md`, que fixa a interface pública (comando, porta, variáveis, rotas). A **suíte de aceitação** (`acceptance/`) fica no laboratório e nunca é copiada para o workspace. |
| L5 | Cada execução é um **braço** descrito por dados (`arms/<id>.json`): env, teto (`--model`/`--effort`) e o bloco `models:` do `.devflow.yaml`. Braço novo = arquivo novo. |
| L6 | O PREVC do workspace roda com `claude -p "/devflow:devflow auto …"` em `--permission-mode bypassPermissions`, `--output-format stream-json`. Um **driver** retoma a sessão (`--resume`) com "continue" enquanto o `prevc.json` não chegar à fase C concluída, até um limite de retomadas. |
| L7 | A finalização (fase C) é **local**. O `.devflow.yaml` do seed não declara `prCli` nem remoto, usa `versioning: none` e `autoFinish: false`; com isso a confirmação cai em `superpowers:finishing-a-development-branch`, e a mensagem de retomada do driver manda escolher **merge local**. Nenhuma rodada fala com GitHub. Se a fase C travar mesmo assim, isso vira achado (autonomia sem forge), não conserto. |
| L8 | Coleta = `stream-json` (uso por modelo do evento `result`) + transcripts da sessão e dos subagentes (`meta.json` → `agentType`, `model`; só campos numéricos de `usage`) + ledger + `prevc.json` final + `git log` do workspace + `model-route.mjs report`. |
| L9 | Veredito por verificação: **HELD** (comportou como o oráculo), **MISS** (desviou), **N/A** (não exercitado na rodada). N/A não é falha; vira lacuna de cobertura. |
| L10 | Determinismo onde dá: a **camada L1** testa a CLI da v3.7 (`resolve`/`escalate`/`report`, `--runtime omp`) e o hook clássico em fixtures, contra o oráculo, sem modelo. A **camada L3** (rodadas vivas) cobre o que só aparece numa sessão real. |
| L11 | A fase V deste workflow roda **uma campanha real com os braços A e B**. Os braços C e D ficam no runbook, para rodar quando o operador quiser. |

## 4. Arquitetura

```
 devflow (tag v3.7.0) ──clone──▶ cache/devflow@v3.7.0 ──--plugin-dir──┐
                                                                      ▼
 arms/B-routed.json ─┐                                  ┌──────────────────────────┐
 seed/  ─────────────┼─▶ run-arm.mjs ─▶ workspace novo ─▶│ claude -p /devflow auto  │
 brief/PRODUCT.md ───┘   (driver + resume)               │  P→R→E→V→C, subagentes   │
                                                         └───────────┬──────────────┘
                     stream-json · transcripts · ledger (XDG da rodada) · prevc.json · git
                                                                     ▼
                          collect.mjs ─▶ runs/<id>/metrics.json (só números)
 acceptance/ ─▶ accept.mjs ─▶ runs/<id>/acceptance.json
 oracle/oracle.json ─▶ score.mjs ─▶ results/<data>-<campanha>/scorecard.md
```

### 4.1 Unidades

| Unidade | Responsabilidade | Depende de |
|---|---|---|
| `lib/arm.mjs` | Lê e valida um braço; monta argv, env e o bloco `models:`. Puro. | — |
| `lib/seed.mjs` | Materializa o workspace a partir de `seed/` + braço (git init, commit inicial). | `node:fs`, git |
| `lib/stream.mjs` | Lê `stream-json` linha a linha: `session_id`, uso por modelo, erro, fim. Puro. | — |
| `lib/transcripts.mjs` | Lê transcript principal e de subagentes; extrai só `model`, `agentType` e números de `usage`. | leitura segura |
| `lib/ledger.mjs` | Lê os JSONL do ledger da rodada; confere chaves contra a allowlist da ADR-017. | — |
| `lib/invariants.mjs` | Avalia as verificações de §7 contra o oráculo → `{id, verdict, evidence}`. Puro. | oráculo |
| `lib/scorecard.mjs` | Renderiza o scorecard em Markdown (vereditos, cobertura, economia, qualidade). Puro. | — |
| `scripts/run-arm.mjs` | Prepara a rodada, executa o driver, grava `runs/<id>/`. | libs, `claude` |
| `scripts/collect.mjs` | Gera `metrics.json` de uma rodada. | libs |
| `scripts/accept.mjs` | Sobe o servidor do workspace numa porta livre e roda a suíte oculta. | `acceptance/` |
| `scripts/score.mjs` | Junta as rodadas de uma campanha e gera o scorecard. | libs |
| `scripts/campaign.mjs` | Roda uma lista de braços em sequência e chama `score`. | scripts |
| `l1/` | Testes determinísticos da CLI e do hook clássico da v3.7 contra o oráculo. | cache do plugin |

Os scripts recebem caminhos por argumento e nunca escrevem dentro do repo do laboratório, exceto em
`results/`. Rodadas brutas vão para `runs/` (no `.gitignore`).

## 5. Braços

| Braço | Roteamento | Teto (modelo/esforço) | `models:` | Papel |
|---|---|---|---|---|
| **A — baseline** | desligado (sem `DEVFLOW_MODEL_ROUTING`) | o do operador (`opus`/`xhigh`) | ausente | controle; base da economia |
| **B — routed** | ligado | `opus`/`xhigh` | `enabled`, `session`, `subagents`, `ledger`, `midRun.enabled: true` | medição principal |
| **C — ceiling** | ligado | `sonnet`/`medium` | como B | prova estrutural do teto: `architect`/`capable` tem de cair para `sonnet` |
| **D — stress** | ligado | `opus`/`xhigh` | como B + overrides `cheap` em E | força falhas para exercitar escalada entre tentativas e no meio |

O braço A também é o **controle negativo**: sem ledger e todo subagente no modelo da sessão.
Refinamento (§9) acrescenta braços `B2…` com overrides de projeto.

## 6. Software-alvo e qualidade

**`brief/PRODUCT.md`** (o que o agente recebe): encurtador `shortlink`.

- `node src/server.mjs --port <n> --data <dir>`; token em `SHORTLINK_TOKEN`.
- `POST /links` (auth) cria `{slug, url}`; `GET /:slug` → 302; `GET /links/:slug/stats` (auth) →
  acessos; `DELETE /links/:slug` (auth).
- Auth Bearer com comparação em tempo constante; URL só `http`/`https`; slug `[A-Za-z0-9_-]{4,32}`.
- Limite de taxa por token: janela deslizante, N requisições por M segundos, com `429` e
  `Retry-After` (semântica de borda escrita no brief; é a parte com mais chance de falha, de
  propósito).
- Persistência em JSON com escrita atômica (arquivo temporário + rename).
- CLI `node src/cli.mjs add|get|stats|rm` contra a API.
- Testes com `node --test`; README.

**Suíte oculta (`acceptance/`):** testes caixa-preta via HTTP e CLI (≈25 casos) cobrindo rotas,
auth, validação, limite de taxa nas bordas e persistência após reinício. O resultado é o número de
casos que passaram. **Q3 = HELD** quando B passa em pelo menos tantos casos quanto A e o PREVC de B
chega à fase C concluída.

## 7. Verificações (Q1) e matriz de cobertura

| id | Verificação | Braço | Fonte |
|---|---|---|---|
| INV-CEIL | Nenhum turno da sessão nem subagente com modelo ou esforço acima do teto | B, C, D | transcripts + ledger |
| INV-SESS | O modelo da sessão só muda numa fronteira de fase e no máximo uma vez por workflow (R→E) | B | ledger `switched` + transcript |
| INV-SUB | Modelo de cada subagente = oráculo(agente, fase) limitado pelo teto, ou origem `plan`/`skill`/`explicit` registrada no ledger | B, C | meta.json + ledger |
| INV-EFF | Esforço da sessão segue a skill e fica ≤ teto | B | ledger |
| INV-LEDGER | Chaves do ledger ⊆ allowlist, valores por enum/regex, sem texto livre | B, C, D | ledger |
| INV-OFF | Sem ledger; todo subagente no modelo da sessão | A | transcripts |
| INV-PREVC | O workflow passa por P→R→E→V→C (todas as fases que a escala exige) | todos | `prevc.json` |

**Matriz de cobertura da v3.7** (cada item: exercitado / não exercitado, com a evidência):
sessão por fase (D11) · esforço por skill (D12) · subagente por agente (D3) · override de fase
(`code-reviewer` em R → capable) · skill `final-review` → capable · tier da task do plano
(`**Tier:**`) · teto do usuário (D5) · esforço por passo (D13) · escalada no meio (D14) · escalada
entre tentativas (D7) · ledger (D9) · `model-route report` · opt-in duplo (D18, pelo braço A). A
camada L1 cobre de forma determinística o que a rodada viva pode não exercitar: `escalate`,
`--runtime omp`, hook clássico e `maxTier`.

## 8. Economia (Q2)

Do evento `result` do `stream-json` e dos transcripts: tokens de entrada, saída e cache por modelo,
por braço; por agente e por fase da sessão. O scorecard mostra B ÷ A por modelo e no total, e o
custo do cache frio em cada troca de fase (razão de leitura de cache no passo seguinte). Não há
"% da cota": o peso de cada modelo na assinatura não é público. Uma rodada é uma amostra; o
scorecard declara n = 1 e não extrapola.

## 9. Refinamento (Q4)

O scorecard traz, por agente: despachos, tier aplicado, tokens, escaladas e se as tasks dele
passaram no `verify:`. O runbook `runbooks/refine.md` orienta: hipótese → override no
`.devflow.yaml` de um braço novo (`B2`) → nova rodada → comparação com B. Override que se prova vira
proposta de mudança no `routes.json` do plugin, num workflow próprio no repo `devflow`.

## 10. Erros e segurança

| Ponto | Risco | Tratamento |
|---|---|---|
| `bypassPermissions` | o agente age fora do workspace | workspace em diretório próprio da rodada, sem remoto; os guardrails de git do DevFlow seguem ativos; o driver nunca passa credencial de forge |
| Rodada travada ou pedindo humano | `-p` termina sem concluir | o driver retoma até `maxResumes` (default 6); esgotou → rodada `incomplete`, vereditos das fases não alcançadas = N/A |
| Leitura de transcript/ledger | arquivo enorme, link, FIFO | leitura segura (só arquivo regular, sem seguir link, limite de tamanho), igual à v3.7 |
| Privacidade | conteúdo de prompt ou código no repo do lab | `metrics.json` só com números e enums; `runs/` no `.gitignore` |
| Suíte oculta vazando | o agente lê `acceptance/` | o workspace nunca recebe esse diretório; `accept.mjs` roda de fora |
| Custo | campanha consome cota | braços em sequência, nunca em paralelo; o runbook declara o custo esperado; C e D são opcionais |
| Subagentes deste workflow | git destrutivo | prompts com proibição explícita de `gh`/PR/merge/push |

## 11. Testes (TDD) — do próprio laboratório

| Sinal | Cobertura |
|---|---|
| unit | `arm`, `stream`, `transcripts`, `ledger`, `invariants` (cada verificação com casos HELD/MISS/N/A), `scorecard` |
| integration | `l1/`: CLI `resolve` (matriz agente × fase × teto, Claude Code e omp), `escalate` (rubrica → respostas → ação), `report` sobre ledger sintético, hook clássico com JSON no stdin, contra o checkout da tag |
| e2e | pipeline completo com um `claude` falso no `PATH` que emite `stream-json` e transcripts gravados: `run-arm` → `collect` → `accept` (sobre um workspace-fixture) → `score` |
| lint | `node --check` em todo `.mjs` + verificação de que nenhum script escreve fora de `runs/`/`results/` |

**Verificação real na fase V:** campanha A + B ao vivo, scorecard gerado e revisado.

## 12. Fora do escopo

- Consertar o DevFlow ou o software-alvo durante a rodada (§2).
- Rodar no omp ao vivo (coberto em L1).
- Rodadas em paralelo e estatística com n > 1 (o runbook permite repetir).
- Publicar o laboratório num remoto.

## 13. Premissas a confirmar na fase R

1. `claude -p` com `--plugin-dir` carrega o mod `router.mjs` e as skills do DevFlow como a
   instalação normal, e o superpowers vem do escopo de usuário.
2. `/devflow:devflow auto` em `-p` percorre as fases com retomadas; a fase C conclui sem remoto com
   `prCli` sem forge.
3. O `result` do `stream-json` traz uso por modelo; se não trouxer, a soma vem dos transcripts.
4. `XDG_DATA_HOME` por rodada isola o ledger, sem afetar a autenticação do Claude Code.

## 14. Agentes previstos

architect (revisão R), backend-specialist (libs e scripts), test-writer (L1, suíte oculta, e2e com
`claude` falso), security-auditor (`bypassPermissions`, privacidade, leitura segura),
documentation-writer (README, GABARITO, runbooks).
