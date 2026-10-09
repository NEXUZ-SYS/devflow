---
type: spec
name: router-monitor-toolbar
title: Monitor do roteamento de modelos — faixa ao vivo por agente
status: aprovado-em-seções (rev.2 — fase R)
scale: MEDIUM
autonomy: supervised
created: "2026-10-09"
revised: "2026-10-09 — rev.2: restrições do engine medidas nas sondas (CC 2.1.296) + revisão do architect + onboarding"
requiredSignals: [unit, integration, e2e, lint]
---

# Monitor do roteamento de modelos — Design

> **Workflow:** `router-monitor-toolbar` | **Fase:** R | **Branch:** `feature/router-monitor-toolbar`
> Base: roteamento de modelos e esforço da v3.7.0 ([ADR-017](../../../.context/engineering/adrs/017-model-routing-v1.0.0.md), `hooks/router.mjs`).

## 1. Objetivo

Ver **ao vivo**, durante uma sessão, o que o roteador de modelos está fazendo: para a sessão principal
e para cada subagente em execução, uma linha com modelo e esforço aplicados, de onde veio a escolha,
há quanto tempo o agente roda, quantas falhas de ferramenta seguidas ele acumula e quantas vezes a
mesma task já foi redespachada.

O monitor roda em **todo projeto** com o plugin DevFlow habilitado (é parte do plugin; nada a instalar
por projeto). O onboarding (`/devflow init`, `/devflow config`) **verifica** que o Claude Code do
projeto carrega o mod.

**Critério de sucesso:** durante um `/devflow` real, o operador confirma de relance, por exemplo, que o
reviewer da Task 3 está em `sonnet·medium (roteado)` há 01:12, sem falhas, na 2ª rodada de revisão,
sem abrir ledger nem relatório. O relatório pós-fato (`model-route.mjs report`) segue sendo a medição;
o monitor é a observação ao vivo.

**Fora de escopo:** histórico de agentes encerrados, botão de esconder, comando de liga/desliga,
persistência entre sessões, envio de dados para fora, reaparecer agente retomado por SendMessage (§6).

## 2. Decisões

| # | Decisão | Origem |
|---|---|---|
| M1 | Linha: `{rótulo} Modelo: {modelo}·{esforço} ({origem}) \| Tempo: {cronômetro} \| Falhas: {streak} \| Retentativas: {n}` | operador; esforço proposto e aceito |
| M2 | **Falhas** = streak de falhas de ferramenta seguidas, a regra do `router-core` (erro soma 1, sucesso zera) | operador |
| M3 | **Retentativas** = redespachos da mesma task pelo mesmo papel: chave `subagentType::papel::id da task`. 1º despacho = 0; sem id = `—` | operador; papel acrescentado na R (architect #1) |
| M4 | Faixa **sempre** visível com agente vivo; origem por linha: `roteado`, `teto` ou `router off` | operador |
| M5 | **rev.2.** Um único módulo de hooks: a cola do monitor (o que usa `$`) mora em `hooks/router.mjs`, numa seção própria, e envolve cada hook do router por fora. A lógica pura fica em `scripts/lib/monitor-core.mjs`. | restrição do engine medida nas sondas (§8) |
| M6 | Sem JSX: `h(...)` global, `$.state.get/set` puros, para seguir importável no node | sonda confirmou |
| M7 | O monitor só observa: nunca reescreve evento, nunca nega, nunca lê arquivo do repositório, nunca grava ledger | seção 3 |
| M8 | **Sempre ligado, sem opt-in.** Onboarding só verifica: check `router-monitor` no doctor, chamado pelo `project-init` e pelo `config` | operador (2026-10-09) |
| M9 | Um único cronômetro por sessão, aberto no `session.start` (inclusive o da recarga); tick sem linha viva não escreve nada; trava contra tick sobreposto | architect #4 + reference.md |
| M10 | Retentativas com escopo por workflow do PREVC (operador, fase V): todo plano tem uma "Task 1", e sem escopo despachos de planos diferentes somavam na sessão. Trocar de workflow zera a contagem; sem workflow PREVC ativo, conta pela sessão (escopo `-`) | verificação ao vivo |

## 3. Arquitetura

| Peça | Papel | Depende de |
|---|---|---|
| `scripts/lib/monitor-core.mjs` | Lib pura (sem `$`, sem `node:*`): estado das linhas, id da task e papel, chave e contagem de retentativas, streak, ciclo de vida, formatação | nada |
| `hooks/router.mjs` (seção "Monitor ao vivo") | Funções `mon*` que observam os eventos, o cronômetro e o desenho da faixa `AbovePrompt`; o `register` compõe `mon*` por fora dos hooks do router | `monitor-core.mjs` |
| `hooks/router.mjs` (router) | Mudança mínima: publica, em `try` próprio, modelo/esforço **aplicados** e a origem em `devflow.routing` | já existente |
| `types/index.d.ts` + `"types": "./types/index.d.ts"` no `.claude-plugin/plugin.json` | Contrato do `$.state` do plugin `devflow` | — |
| `scripts/lib/doctor.mjs` (check `router-monitor`) + `skills/project-init`, `skills/config` | Onboarding: verificar que o mod carrega | `claude --version` |

`hooks/hooks.json` **não muda** (`modules: ["./router.mjs"]`).

### 3.1 Restrições do engine (medidas no Claude Code 2.1.296, §8)

1. `hooks.json` → `modules` aceita **um** módulo por plugin.
2. Um plugin registra cada evento **uma vez** sem matcher; o validador confere estaticamente, inclusive nos arquivos importados.
3. O hook passado a `on` é uma **função literal ou o nome de uma** (nada de `chain(a, b)` nem `ns.fn`).
4. `$` só é passado a funções **declaradas no mesmo arquivo** dos `on(...)`; nunca através de import.

Composição resultante (validada na sonda):

```js
on("agent.spawn", ($, e, next) => monAgentSpawn($, e, (x) => onAgentSpawn($, x, next))).catch(($, e, next) => next(e));
on("turn.step", async function* ($, e, next) { return yield* monTurnStep($, e, (x) => routerTurnStep($, x, next)); });
on("ui.render", { component: "AbovePrompt" }, monRender).catch(($, e, next) => next(e));
```

O monitor fica **por fora**: no `agent.spawn` ele vê o resultado final (depois da reescrita do router e
da resolução do engine); no `turn.step` ele vê `e` **antes** da reescrita, por isso o modelo aplicado
vem do valor publicado pelo router (§3.4).

### 3.2 Valores em `$.state` (plugin `devflow`)

```ts
type RoutingOrigin = "roteado" | "teto";
type RoutingLoop = { model: string | null; effort: string | null; origin: RoutingOrigin };
type RoutingSnapshot = { active: boolean; failureStreak: number; loops: Record<string, RoutingLoop> }; // chave: agentId | "main"
type MonitorRow = {
  id: string; label: string; startedAt: number; lastEventAt: number;
  model: string | null; effort: string | null; streak: number; retries: number | null;
};
interface PluginState {
  devflow: { routing: RoutingSnapshot; monitorRows: MonitorRow[]; monitorRetries: Record<string, number> };
}
```

Valores JSON, nunca `undefined`. O router escreve `routing`; o monitor escreve `monitorRows` e
`monitorRetries`; o desenho só lê.

### 3.3 Fluxo

1. **`session.start`**: hidrata a cópia de trabalho a partir de `$.state` e abre o **único**
   `$.clock.every(1000)` da sessão (M9).
2. **`turn.start`**: abre (ou reinicia) a linha `main`.
3. **`agent.spawn`**: `res = await next(e)`; com `res.agentId`, cria a linha (tipo, papel, id da task,
   `startedAt`, `res.model`), calcula as retentativas e grava `monitorRows` e `monitorRetries`.
4. **`tool.call`**: `res = await next(e)`; loop = `e.agentId ?? "main"`; erro soma 1 ao streak,
   sucesso zera; `agentId` sem linha é ignorado.
5. **`turn.step`**: anota `e.model`/`e.effort` na linha (o desenho prefere o valor publicado; §3.4).
6. **`turn.complete`** sem `agentId`: fecha a linha `main`.
7. **Tick** (1 s): sem linha viva, não faz nada; com linha viva, consulta `$.agent.list()`, remove
   subagentes `completed`/`failed`/`killed` (sempre saem) ou ausentes da lista (só saem depois de
   `GRACE_MS` = 3000 ms de vida, para não perder o agente recém-despachado) e grava `monitorRows` (a escrita redesenha a
   faixa e anda o cronômetro). Trava `inTick` impede ticks sobrepostos.

### 3.4 O que o router publica

- No `agent.spawn` roteado: `loops[agentId] = { model: res.model, effort: route.effort, origin }`, com
  `origin = "roteado"` quando o tier difere do teto **ou** o esforço difere do esforço do usuário.
- No `turn.step` de subagente com patch (escalada, esforço por streak): atualiza `model`/`effort`.
- No `turn.step` da sessão: `loops.main = { model: patch?.model ?? e.model, effort: patch?.effort ?? e.effort, origin }`,
  `origin = "roteado"` quando `patch` trouxe `model` ou `effort`.
- `active` reflete `active()`; `/devflow-route off` grava `active: false`.
- A escrita é deduplicada por JSON e o último JSON só é memorizado depois de um `set` bem-sucedido.
- Origem exibida: `loops[loop].origin` quando existe; sem entrada e `active: true`, `teto`; sem o valor
  ou `active: false`, `router off` (e o valor publicado, velho, é ignorado).

## 4. Id da task, papel e retentativas

Formatos reais (aterrado nos arquivos das skills):

| Fonte | Tipo despachado | Onde | Exemplo |
|---|---|---|---|
| `superpowers:subagent-driven-development` | `general-purpose` para todos os papéis | `description` | `Implement Task 3: …`, `Review Task 3 (spec + quality)`, `Re-review Task 3 fix round 2` |
| `devflow:autonomous-loop` | agente da story | `prompt` | linha `- Current story: S2 — …` |

Regras:

1. **Id da task:** `description` com `\bTask (\d+[a-z]?)\b` → `Task N`; senão, os primeiros 2048
   caracteres do `prompt` com `^\s*(?:[-*]\s+)?Current story:\s*(S\d+)\b` (multilinha) → `S2`; senão `null`.
2. **Papel:** início da `description`: `Implement`/`Fix` → `implement`; `Review`/`Re-review` → `review`;
   senão sem papel.
3. **Chave:** `workflow|-::subagentType::papel|-::id` (M10). O router lê `status.project.name` do `prevc.json` (allowlist `workflowFromPrevcJson`) em todo `turn.start`, mesmo com o roteamento desligado, e passa o nome como `scope` ao monitor; sem workflow, `-`. Sem id: sem retentativa (`—`).
4. **Rótulo:** `tipo · id` e, com papel, `tipo · id · papel` (ex.: `general-purpose · Task 3 · review`).

Leitura no SDD: o `review` conta as rodadas de revisão (cada `Re-review` é +1); o `implement` conta os
implementers **novos** (rodadas 4–5 do SDD, despachadas num modelo mais capaz). As rodadas 1–3 retomam
o mesmo implementer por SendMessage (sem `agent.spawn`) e não contam como retentativa.

## 5. Exibição

- Faixa só com linha viva; sem linha, `next(e)`. Cede quando `e.props.hasSurvey`.
- Ordem: `sessão` primeiro, depois subagentes por `startedAt`.
- Linhas visíveis: `min(6, maxRows − 1)` (prop `maxRows` da faixa); acima, `+N agentes`.
- Rótulo cortado em 40 colunas. Nunca trecho do prompt nem da descrição livre.
- Modelo: ID sem `claude-` (`sonnet-5-5`); alias como veio. Esforço após `·`; `-` enquanto desconhecido.
- Tempo: `mm:ss`; `h:mm:ss` a partir de 1 h.
- Cores (ThemeKey): `Falhas` `warning` de 1 a `failureStreak − 1`, `error` a partir de `failureStreak`;
  `Retentativas ≥ 1` `warning`; origem `roteado` `success`, `teto` `subtle`, `router off` `inactive`.
  Sem cor, a prop `color` é omitida.
- Cada linha é um `Text` com `wrap: "truncate-end"`.

```
general-purpose · Task 3 · review         Modelo: sonnet-5-5·medium (roteado) | Tempo: 01:12 | Falhas: 0 | Retentativas: 1
sessão                                    Modelo: opus-5-5·high (teto)        | Tempo: 04:37 | Falhas: 2 | Retentativas: —
```

## 6. Erros, limites e segurança

- **Só observação.** Cada `mon*` devolve o resultado de `next` com `e` intacto; toda a lógica própria
  fica em `try`. Falha do monitor nunca afeta despacho, modelo ou ferramenta. Exceção do router dentro
  do `next` sobe como antes (mesmo `.catch`).
- **Independência.** O monitor funciona com o router desligado (`router off`).
- **Recarga a quente.** Linhas e retentativas vivem em `$.state`; o `session.start` da recarga reabre o cronômetro. Após a recarga o escopo vale `-` até o próximo `turn.start` (que lê o `prevc.json`).
- **Limites.** 50 linhas; 500 chaves de retentativa (sai a menos usada recentemente; recontar renova a chave); 100 loops publicados; id da task
  só nos primeiros 2048 caracteres do prompt, regex ancorada.
- **Linha fantasma.** Se `$.agent.list()` falhar, um subagente sem evento há 30 s sai da faixa.
- **Background.** Subagentes em background seguem na faixa após o fim do turno, até encerrarem na lista.
- **Limitação conhecida.** Agente retomado por SendMessage depois de `completed` não volta à faixa (não
  há `agent.spawn`); backlog.
- **Sempre ligado.** A linha `sessão` aparece a cada turno em todo projeto com o plugin (M8).
- **ADR-017.** Relação **alinhada**: o monitor não lê arquivo do repositório, não grava ledger e não envia
  nada para fora. O router só publica; nunca consome o estado do monitor.

## 7. Testes

TDD: teste falhando antes do código, em cada task.

| Sinal | Arquivo | O que prova |
|---|---|---|
| unit | `tests/lib/monitor-core.test.mjs` | id da task (SDD, story com marcador `- `, ausente, além de 2048); papel; retentativas por `tipo::papel::id` com as descriptions reais do SDD em `general-purpose`; streak; ciclo de vida e 30 s; formatação; limites |
| unit | `tests/lib/test-doctor-router-monitor.mjs` | check `router-monitor`: OK na versão testada, WARN abaixo, WARN sem versão legível |
| integration | `tests/integration/test-router-mod.mjs` (ampliado) | publicação de `routing` (origem por modelo **ou** esforço; `off`; `set` lançando não muda o retorno) |
| integration | `tests/integration/test-router-monitor-mod.mjs` | `hooks/router.mjs` real com `$` falso: spawn → linha; erro → Falhas; redespacho → Retentativas; `completed` → some; background; recarga; `agent.list` falhando; tick sem linha não escreve; render (texto, origem, `+N`, `maxRows`, `hasSurvey`); `$` lançando → resultado de `next` intacto |
| integration | `hooks/router-monitor.test.ts` + `hooks/router.test.ts` | kit (`claude plugin test .`), com `mock.clock`: faixa montada no terminal e no desktop mostra a linha |
| e2e | `tests/e2e/router-monitor-validate.e2e.test.mjs` | contrato (`plugin.json` → `types`, chaves do `PluginState`) e `claude plugin validate .` (pulado com aviso sem `claude`) |
| lint | `tests/run-lint.sh` | gate de sempre |

**Verificação ao vivo (fase V, manual):** sessão interativa com `--plugin-dir`, rodada SDD curta
(implement + review + 1 re-review), captura da faixa; repetir com `/devflow-route off`.

## 8. Sondas da fase R (Claude Code 2.1.296, plugin descartável)

| Premissa | Resultado |
|---|---|
| `.mjs` com `h` global desenha `AbovePrompt` | **Confirmada**: `Text` aninhado, `wrap`, `color`; terminal e desktop |
| Dois módulos do mesmo plugin dividem `$.state` | **Refutada como desenho**: um módulo por plugin. Dentro do módulo, o valor escrito pelo hook interno é lido pelo externo (confirmado) |
| `$.clock.every` com `$` capturado e `cancel()` | **Confirmada** (no kit exige `mock.clock`); a escrita em `$.state` redesenha a faixa a cada tick |
| `tool.call` com `agentId`/`isError` | Coberta pela verificação real da v3.7.0 (o router já depende disso) |
| `"types"` no `plugin.json` × `version-guard` | **Confirmada**: o guard lê só `"version"`; o validate aceita o contrato (sem `export {}` — só `export type`) |
| Extra | Restrições 3.1 (um evento por plugin; hook literal; `$` só para função do mesmo arquivo). No kit: `Text` não guarda `key` na árvore desenhada (buscar por texto); o `$` do teste não tem `.state` (ler pela faixa montada) |

## 9. Onboarding

- **Check `router-monitor`** em `scripts/lib/doctor.mjs`, sempre ativo: lê `claude --version`; abaixo
  de 2.1.293 (menor versão medida carregando o mod) → WARN "o monitor e o roteamento por mod não
  carregam; atualize o Claude Code"; versão ilegível → WARN; senão OK.
- **`/devflow init`** (`skills/project-init/SKILL.md`, novo Step 0.8) e **`/devflow config`**
  (`skills/config/SKILL.md`, passo final): rodam `node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs" --check router-monitor`
  e mostram o resultado. Nunca bloqueiam; não gravam nada no `.devflow.yaml`.
