# Roteamento de modelos

O DevFlow pode escolher o modelo e o esforço de cada etapa conforme o que ele já sabe do trabalho (fase do PREVC, skill ativa, agente, task do plano). O objetivo é gastar menos da cota da assinatura, com economia **medida** e com a garantia de que nada roda acima do modelo e do esforço que você escolheu. Decisão: [ADR-017](../.context/engineering/adrs/017-model-routing-v1.0.0.md) (status Proposto, `gated`).

## As três camadas

| Camada | O que faz | Onde existe |
|---|---|---|
| Sessão principal | Modelo por **fase** do PREVC (troca só na fronteira de fase; o padrão faz uma troca por workflow, na passagem R para E) e esforço por **skill** ativa, a cada turno | só no mod |
| Subagentes | Modelo e esforço por task do plano, skill que despacha, fase e agente, nessa precedência; sem regra, o subagente herda | os três adaptadores |
| Escalada | Quando um modelo mais barato falha, sobe um degrau. Entre tentativas: a skill pede uma rubrica e o controlador responde. No meio da execução: opcional, desligada por padrão | entre tentativas nos três; no meio, só no mod |

Os tiers são abstratos (`cheap`, `standard`, `capable`, `top`); cada adaptador os traduz (no Claude Code, `haiku`, `sonnet`, `opus`, `fable`; no omp, model roles). A tabela não guarda ID fixo de modelo.

**Teto.** Nada roda acima do modelo e do esforço que você escolheu. Um `/model` ou `/effort` manual vira o novo teto no passo seguinte. `maxTier` é um teto adicional opcional.

## Os três adaptadores

| Adaptador | Quando | Sessão por fase | Esforço por skill/passo | Escalada no meio | Subagentes | Teto lido de |
|---|---|---|---|---|---|---|
| Mod (function hooks) | Claude Code com `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` | sim | sim | opt-in | sim | modelo e esforço originais da sessão |
| Clássico (`PreToolUse` na ferramenta Agent) | Claude Code sem function hooks | não | não | não | sim, só escolha inicial | último modelo do transcript |
| omp | oh-my-pi | não | não | não | sim, tier para model role | o role que o agente teria sem roteamento (ordem abaixo) |

**Teto do omp.** O adaptador do omp, e a CLI com `--runtime omp`, leem o teto nesta ordem: `agent_role_defaults` de `omp/omp-roles.yaml`; depois o `model:` de `.context/agents/<nome>.md`; depois `activities.execution`. Teto ilegível (por exemplo, o role `commit`) significa não rotear: `resolve` devolve `route: null` e `escalate` devolve `keep`. Sem `--runtime omp`, a CLI resolve contra o teto `top`.

Versão testada do Claude Code: 2.1.294. O check `model-routing` do `doctor` avisa quando o roteamento está pedido e confirmado e a versão do Claude Code é anterior à testada; nesse caso o mod pode não carregar.

## Como ligar

Rotear exige **dois** consentimentos; o repositório sozinho nunca liga nada.

1. No repositório, `models.enabled: true` em `.context/.devflow.yaml`. O `/devflow config` (e o `/devflow init`) conduz a entrevista: camadas, `maxTier`, ledger e escalada no meio.
2. No seu ambiente, `DEVFLOW_MODEL_ROUTING=1` (bloco `env` do `~/.claude/settings.json`). O plugin nunca escreve nesse arquivo.
3. Para o mod, também `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Sem ela, o hook clássico assume os subagentes.

Exemplo de bloco no `.devflow.yaml` (overrides em estilo bloco, sem mapas inline):

```yaml
models:
  enabled: true
  session: true
  subagents: true
  maxTier: capable
  ledger: true
  midRun:
    enabled: false
```

## Comandos

- `/devflow-route` (registrado pelo mod): `status`, `on`, `off` e `session off`. Se outro roteador de sessão estiver habilitado, a camada de sessão do DevFlow se desliga e avisa.
- `node scripts/model-route.mjs resolve|escalate|report`:
  - `resolve --agent <tipo> [--phase P] [--skill S] [--task-tier T] [--runtime claude|omp]` mostra a rota;
  - `escalate --agent <tipo> --tier <T> --report <arquivo>` imprime a rubrica; com `--mid-run` (só no ramo da rubrica) a rubrica é a da escalada no meio da execução; com `--answers <json>` combina as respostas e devolve `keep`, `escalate` ou `human`, aceitando `--signal-red` (há sinal vermelho no ledger do `verify:`) e `--runtime omp` (limita a saída ao teto do agente e devolve também `role`; sob omp, `role` é o campo útil, não `model`);
  - `report [--since ISO] [--transcripts DIR]` (`--transcripts` é o caminho do clássico e do omp, que leem os transcripts em vez do ledger do mod) soma tokens por modelo e por agente/fase, taxa de escalada e o custo das trocas de fase, e fecha com a seção "Antes × depois" (ver Medição).
- `doctor`: o check `model-routing` avisa quando o repositório pede roteamento sem a sua confirmação ou, com o roteamento pedido e confirmado, quando a versão do Claude Code é anterior à testada.

## Custo de cache

O cache de prompt é por modelo: trocar o modelo faz o passo seguinte reler o contexto sem cache. Por isso a sessão troca só na fronteira de fase (padrão: uma vez por workflow). Trocar **só o esforço** não invalida o cache, então o esforço varia por skill e por passo sem esse custo. O relatório mostra a razão de cache após cada troca, para você ver se o cache frio está comendo a economia.

## Medição

Com `models.ledger: true`, cada decisão vira uma linha JSONL fora do repositório (diretório de dados do usuário), só com campos numéricos ou de lista fixa: nunca prompt, resposta ou erro em texto. No mod, o `usage` vem do `turn.complete`; no clássico e no omp, dos transcripts.

### Antes × depois

A seção "Antes × depois" do `report` compara tokens por modelo (entrada, saída e % da saída) em duas janelas, para subagentes e para a sessão. O corte é o timestamp da **primeira linha do ledger**; com o ledger vazio não há corte e o relatório diz que não há comparativo. A janela "depois" vem do ledger; a janela "antes" (e a "depois" quando o ledger não traz `usage`) é preenchida a partir dos transcripts de `--transcripts`. Sem `--transcripts`, a janela "antes" fica vazia. Esse é o comparativo que o gate de 2 semanas usa.

## Armadilha no `.devflow.yaml`

Um comentário na mesma linha depois de uma chave de mapa (`overrides:   # …`) apaga o submapa no leitor. Ponha o comentário na linha de cima.

## Limites declarados

- O peso de cada modelo na cota do Max não é público; o relatório fala em tokens por modelo, nunca em "% da cota".
- A garantia de teto vale quando o adaptador consegue lê-lo; teto ilegível significa não rotear.
- O relatório cobre só o diretório atual (worktrees não são somados).
- Fora do mod não há sessão por fase, esforço por passo nem escalada no meio.
- Risco aceito: um Claude Code antigo com schema estrito pode recusar o `hooks.json` inteiro por causa da chave `modules`. O operador aceitou o risco em 2026-10-10; ele será medido na fase V com um Claude Code antigo, se houver um disponível.
- No hook clássico, um `model` explícito vindo da CLI passa sem teto quando o hook não consegue ler o transcript (raro; no Claude Code a CLI resolve contra o teto `top`).
- A decisão é `gated`: o relatório de 2 semanas precisa confirmar a economia sem regressão de escaladas.
