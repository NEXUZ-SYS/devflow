---
type: spec
name: router-monitor-toolbar
title: Monitor do roteamento de modelos — faixa ao vivo por agente
status: aprovado-em-seções
scale: MEDIUM
autonomy: supervised
created: "2026-10-09"
requiredSignals: [unit, integration, e2e, lint]
---

# Monitor do roteamento de modelos — Design

> **Workflow:** `router-monitor-toolbar` | **Fase:** P | **Branch:** `feature/router-monitor-toolbar`
> Base: roteamento de modelos e esforço da v3.7.0 ([ADR-017](../../../.context/engineering/adrs/017-model-routing-v1.0.0.md), `hooks/router.mjs`).

## 1. Objetivo

Ver **ao vivo**, durante uma sessão, o que o roteador de modelos está fazendo: para a sessão principal
e para cada subagente em execução, uma linha com modelo e esforço aplicados, de onde veio a escolha,
há quanto tempo o agente roda, quantas falhas de ferramenta seguidas ele acumula e quantas vezes a
mesma task já foi redespachada.

**Critério de sucesso:** durante um `/devflow` real, o operador confirma de relance, por exemplo, que o
`devflow:test-writer` da Task 3 está em `sonnet·medium (roteado)` há 01:12, sem falhas, na 2ª tentativa,
sem abrir ledger nem relatório. O relatório pós-fato (`model-route.mjs report`) segue sendo a medição;
o monitor é a observação ao vivo.

**Fora de escopo:** histórico de agentes encerrados, botão de esconder, comando de liga/desliga,
persistência entre sessões, envio de dados para fora.

## 2. Decisões

| # | Decisão | Origem |
|---|---|---|
| M1 | A linha mostra `Modelo: {modelo}·{esforço} ({origem}) \| Tempo: {cronômetro} \| Falhas: {streak} \| Retentativas: {n}` | operador; esforço proposto e aceito |
| M2 | **Falhas** é o streak de falhas de ferramenta seguidas, a mesma regra do `router-core` (erro soma 1, sucesso zera) | operador |
| M3 | **Retentativas** conta redespachos da mesma task: mesma chave `subagentType + id da task do plano`. 1º despacho = 0; sem id = `—` | operador |
| M4 | A faixa aparece **sempre** que há agente vivo, com a origem por linha: `roteado`, `teto` ou `router off` | operador |
| M5 | Abordagem A: lib pura + módulo próprio; o router só publica a decisão aplicada num valor de `$.state` | operador |
| M6 | O módulo é `.mjs`, desenha com `h(...)` e usa `$.state.get/set` puros, para seguir importável no node como o `router.mjs` | revisão da seção 4 |
| M7 | O monitor só observa: nunca reescreve evento, nunca nega, nunca lê arquivo do repositório, nunca grava ledger | seção 3 |

## 3. Arquitetura

| Peça | Papel | Depende de |
|---|---|---|
| `scripts/lib/monitor-core.mjs` | Lib pura (sem `$`, sem `node:*`): estado das linhas, extração do id da task, chave e contagem de retentativas, streak, ciclo de vida, formatação | nada |
| `hooks/router-monitor.mjs` | Segundo módulo em `hooks/hooks.json` → `modules`. Observa eventos, mantém o cronômetro, desenha a faixa `AbovePrompt` | `monitor-core.mjs`, valor `routing` do `$.state` |
| `hooks/router.mjs` | Mudança mínima: publica, dentro de `try`, o modelo/esforço **aplicados** e a origem por loop | já existente |
| `types/index.d.ts` + `"types": "./types/index.d.ts"` no `.claude-plugin/plugin.json` | Contrato do `$.state` do plugin `devflow` (o `claude plugin validate` o exige) | — |

### 3.1 Valores em `$.state` (plugin `devflow`)

```ts
type Origin = "roteado" | "teto";
type RoutingSnapshot = {
  active: boolean;              // router ligado (opt-in duplo + não desligado por /devflow-route off)
  failureStreak: number;        // config.midRun.failureStreak, padrão 3
  loops: Record<string, {       // chave: agentId, ou "main" para a sessão
    model?: string; effort?: string; origin: Origin;
  }>;
};
type MonitorRow = {
  id: string;                   // agentId ou "main"
  label: string;                // "sessão" | subagentType [+ " · " + taskId]
  startedAt: number;            // $.clock.now()
  lastEventAt: number;
  model?: string; effort?: string;
  streak: number;
  retries: number | null;       // null = sem id de task
};
interface PluginState {
  devflow: {
    routing: RoutingSnapshot;
    monitorRows: MonitorRow[];
    monitorRetries: Record<string, number>; // chave "tipo::taskId" → despachos vistos
  };
}
```

Só o próprio plugin escreve. O router escreve `routing`; o monitor escreve `monitorRows` e
`monitorRetries`; o desenho só lê.

### 3.2 Fluxo

1. **`agent.spawn`**: `res = await next(e)`. Com `res.agentId`, cria a linha: tipo, `startedAt`,
   `res.model`, id da task (seção 4), retentativas = despachos anteriores com a mesma chave, depois
   incrementa a chave.
2. **`tool.call`**: `res = await next(e)`. Loop = `e.agentId ?? "main"`. Se há linha para o loop,
   `res?.isError` soma 1 ao streak e sucesso zera. `agentId` sem linha (forks internos do engine,
   agentes de workflow) é ignorado.
3. **`turn.start`** sem `agentId`: abre (ou reinicia) a linha `main`.
4. **`turn.step`**: atualiza `model`/`effort` da linha com `e.model`/`e.effort` **só quando**
   `routing.loops[loop]` não existe. Motivo: se o hook do monitor envolve o do router, `e` chega
   **antes** da reescrita; o valor confiável é o que o router publicou como aplicado.
5. **`turn.complete`** sem `agentId`: encerra a linha `main`.
6. **Tick** `$.clock.every(1000)`, aberto quando surge a 1ª linha viva e encerrado quando não sobra
   nenhuma: consulta `$.agent.list()`, remove subagentes em `completed`, `failed` ou `killed`, ou
   ausentes da lista; e grava o snapshot em `monitorRows`, o que redesenha a faixa (cronômetro).
7. **`session.start`**: reabre o tick se `monitorRows` traz linha viva (recarga a quente).

### 3.3 O que o router publica

- No `agent.spawn` roteado: `loops[agentId] = { model: res.model, effort: route.effort, origin: route.tier !== route.ceiling ? "roteado" : "teto" }`.
- No `turn.step` de subagente com patch (escalada, esforço por streak): atualiza `model`/`effort` aplicados.
- No `turn.step` da sessão: `loops.main` com o modelo/esforço efetivos (`patch.model ?? e.model`,
  `patch.effort ?? e.effort`) e a origem do `sessionTier` contra o teto.
- `active` reflete `active()`; `/devflow-route off` grava `active: false`.
- Origem exibida pelo monitor: `loops[loop].origin` quando existe; sem entrada para o loop e
  `active: true` (agente fora da tabela, rota nula), `teto`; sem o valor `routing` ou com
  `active: false`, `router off`.
- Toda escrita fica em `try` próprio e não altera o que o hook do router devolve.

## 4. Id da task e retentativas

Formatos reais das skills de despacho (aterrado nos arquivos das skills):

| Fonte | Onde | Exemplo |
|---|---|---|
| `superpowers:subagent-driven-development` | `description` | `Implement Task 3: …`, `Review Task 3 (spec + quality)`, `Re-review Task 3 fix round 2` |
| `devflow:autonomous-loop` | `prompt` | linha `Current story: S2 — …` |

Regra:

1. `description` com `\bTask (\d+[a-z]?)\b` → `Task N`.
2. Senão, os primeiros 2 KB do `prompt`, linha a linha, com `^\s*Current story:\s*(S\d+)\b` → `S2`.
3. Senão, sem id: `retries = null`, exibido `—`.

Chave = `subagentType + "::" + id`. O implementer e o reviewer da mesma task têm chaves diferentes
(tipos diferentes); o `Re-review Task 3` do mesmo tipo do `Review Task 3` conta como retentativa.

## 5. Exibição

- Faixa só com linha viva; sem linha, `next(e)`. Cede quando `e.props.hasSurvey`.
- Ordem: `sessão` primeiro, depois subagentes por `startedAt`. Até 6 linhas; acima, `+N agentes`.
- Rótulo: tipo + id da task, cortado em 32 colunas. Nunca trecho do prompt nem da descrição livre.
- Modelo: ID sem o prefixo `claude-` (`sonnet-5-5`); alias como veio (`sonnet`). Esforço após `·`; `-`
  enquanto desconhecido.
- Tempo: `mm:ss`; `h:mm:ss` a partir de 1 h. Parede desde o spawn (subagente) ou o início do turno (sessão).
- Cores: `Falhas` amarelo de 1 a `failureStreak − 1`, vermelho a partir de `failureStreak`;
  `Retentativas ≥ 1` amarelo; origem `roteado` verde, `teto` cinza, `router off` apagada.
- Cada linha é um `Text` que corta no fim (não quebra), para a altura da faixa não oscilar.

Exemplo:

```
devflow:test-writer · Task 3   Modelo: sonnet-5-5·medium (roteado) | Tempo: 01:12 | Falhas: 0 | Retentativas: 1
sessão                         Modelo: opus-5-5·high (teto)        | Tempo: 04:37 | Falhas: 2 | Retentativas: —
```

## 6. Erros, limites e segurança

- **Só observação.** Todo hook repassa `e` intacto via `next(e)` e é registrado com
  `.catch(($, e, next) => next(e))`. Falha do monitor nunca afeta despacho, modelo ou ferramenta.
- **Independência.** O monitor funciona sem o router (`router off`); o router não depende do monitor.
- **Recarga a quente.** Linhas e mapa de retentativas vivem em `$.state`; o tick reabre no `session.start`.
- **Limites.** No máximo 50 linhas rastreadas; mapa de retentativas com 500 chaves (sai a mais antiga);
  extração do id restrita aos primeiros 2 KB do prompt, regex ancorada.
- **Linha fantasma.** Se `$.agent.list()` falhar, um subagente sem evento há 30 s sai da faixa.
- **Background.** Subagentes em background seguem na faixa após o fim do turno da sessão, até
  encerrarem na lista.
- **ADR-017.** Relação **alinhada**: o monitor não lê arquivo do repositório (o `failureStreak` vem do
  router; sem router, 3), não grava ledger e não envia nada para fora. Nenhum guardrail novo.

## 7. Testes

TDD: teste falhando antes do código, em cada task.

| Sinal | Arquivo | O que prova |
|---|---|---|
| unit | `tests/lib/monitor-core.test.mjs` | extração do id (SDD, story, ausente, além de 2 KB); retentativas por chave; streak; ciclo de vida e fallback de 30 s; formatação (`mm:ss`/`h:mm:ss`, `claude-`, corte, `+N`, cores por limiar); limites 50/500 |
| integration | `tests/integration/test-router-monitor-mod.mjs` | módulo real com `$` falso: spawn → linha; erro → Falhas; redespacho → Retentativas 1; `completed` → linha some; atom → `(roteado)`; sem atom → `router off`; `$` que lança → `next(e)` com `e` intacto; render com os textos esperados |
| integration | `tests/integration/test-router-mod.mjs` (ampliado) | o router publica modelo/esforço/origem **aplicados** no spawn e no passo da sessão; `off` grava `active: false` |
| integration | `hooks/router-monitor.test.ts` | smoke do kit (`claude plugin test .`): o módulo carrega no engine |
| e2e | `tests/e2e/test-router-monitor-validate.mjs` | `claude plugin validate .` passa com o contrato de `$.state`; pulado com aviso sem `claude` |
| lint | `tests/run-lint.sh` | gate de sempre |

**Verificação ao vivo (fase V, manual, declarada como tal):** `claude -p` não desenha a faixa. Na V,
sessão interativa com `--plugin-dir`, rodada SDD curta (2 subagentes + 1 retentativa forçada), com captura.

## 8. Premissas para a fase R (sondas)

1. Um módulo `.mjs` desenha no `ui.render` `AbovePrompt` chamando o `h` global (sem JSX).
2. Dois módulos do mesmo plugin leem e escrevem os mesmos valores de `$.state` (`plugin: "devflow"`).
3. `$.clock.every` pode ser encerrado pelo próprio mod quando não há linha viva (forma exata de cancelar).
4. `tool.call` traz `agentId` nos loops de subagente e `res.isError` nas falhas (o router já depende disso).
5. Adicionar `"types"` ao `plugin.json` não quebra a instalação nem o `version-guard` do pre-commit.
