---
type: spec
name: model-routing
title: Roteamento de modelos do DevFlow (sessão por fase + subagentes por agente/fase/task)
status: rascunho-aprovado-em-seções
scale: LARGE
autonomy: supervised
created: "2026-10-08"
revised: "2026-10-08 — revisão com mods (function hooks); Jev removido; sessão principal por fase"
requiredSignals: [unit, integration, e2e, lint]
---

# Roteamento de modelos do DevFlow — Design

> **Fase:** P (brainstorming). Sem workflow-init, sem branch, sem commit, por decisão do operador.
> O PREVC formal abre depois, a partir desta spec.

## 1. Objetivo

Reduzir o consumo da **cota da assinatura (Pro/Max)** escolhendo modelo e esforço conforme o que o
DevFlow sabe do trabalho em curso:

- **Sessão principal:** modelo por **fase do PREVC** (trocando só na fronteira de fase) e esforço
  por **skill ativa**.
- **Subagentes:** modelo e esforço por **agente**, **fase/skill que despacha** e **task do plano**,
  com escalada quando um modelo mais barato falha.

**Critério de sucesso:** economia **medida** (tokens por modelo × agente/fase, antes e depois), não
estimada; e a garantia estrutural de que nada roda acima do modelo e do esforço que o usuário escolheu.

## 2. Contexto e evidência

### 2.1 Linha de base (este repositório, só campos numéricos dos transcripts)

| Quem despacha | Despachos | Saída | Leitura de cache |
|---|---|---|---|
| `general-purpose` (implementer/revisores do SDD do superpowers) | 117 | 7,7 M | 2,66 B |
| `devflow:*` (todos) | 36 | ~2,3 M | ~1,2 B |

- Nenhum dos 20 agentes em `agents/*.md` declara `model:`; todo subagente herda o modelo da sessão.
  O `settings.json` do operador fixa `model: claude-opus-5-5` e `effortLevel: xhigh`: revisores e
  escritor de docs rodam em Opus/xhigh. Um `meta.json` de subagente deste repo registra `model: opus`.
- O **maior consumidor não é agente do DevFlow**: são os `general-purpose` do SDD, que já orienta
  "use the least powerful model that can handle each role" mas deixa a escolha ao controlador.

### 2.2 Claude Code — hooks clássicos (fonte: binário instalado 2.1.294)

| Fato | Evidência |
|---|---|
| Aliases: `sonnet`, `opus`, `haiku`, `fable` (e `[1m]`, `best`, `opusplan`) | lista de aliases no binário |
| Agente e skill aceitam `model` e `effort` no frontmatter | chaves de frontmatter no binário |
| Ferramenta Agent aceita `model` por despacho, com precedência sobre o frontmatter | descrição da ferramenta Agent |
| `PreToolUse` aceita `updatedInput` | doc de hooks embutida no binário |
| Input de todo hook traz `session_id`, `transcript_path`, `cwd`, `prompt_id` | schema base de input de hook |
| Subagente grava `subagents/agent-<id>.meta.json` (`agentType`, `model`); transcript traz `usage` | inspeção dos transcripts locais (sem conteúdo) |

### 2.3 Claude Code — mods / function hooks (fonte: `claude-code.d.ts` gerado pelo build 2.1.294)

| Evento / API | O que oferece |
|---|---|
| `agent.spawn` | Antes de o modelo do subagente ser resolvido: `subagentType`, `prompt`, `model` (reescrevível; ignorado em `fork`), **`parentModel`** (fixo), `permissionMode`, `parentAgentId`, `fork`, `workflow` (conteúdo não reescrevível). |
| `turn.start` | Início de um turno da sessão principal (`text`, `turnId`). |
| `turn.step` | Cada request ao modelo, **na sessão principal e dentro de subagentes** (`agentId`); `model` e `effort` reescrevíveis por request. |
| `turn.complete` | Fim do turno/execução, com `usage` incluindo o `model` que respondeu. |
| `skill.prompt` | Ativação de uma skill (sinal da skill em curso). |
| `tool.call` | Reage a chamadas de ferramenta, inclusive dentro de subagente. |
| `$.model.complete({ model, prompt })` | Uma completion sem histórico no cliente da própria sessão. |
| `$.command.register`, `$.ui.status`, `$.session.messages({agentId})`, `$.fs`, `$.env` | Comando de barra, status line, mensagens de um loop, arquivos, ambiente. |
| Empacotamento | `hooks/hooks.json` → `modules: [...]`; módulo ES sem Node (tudo via `$`), pode importar arquivos do próprio plugin; `claude plugin validate`/`test`. |

**Cache:** o cache de prompt é por modelo; trocar o modelo de um loop deixa o passo seguinte sem
cache (o README do jev-router mede 4%; leitura de cache custa 1/10 da entrada). Trocar **esforço** não
afeta o cache.

### 2.4 omp (fonte: `omp/extension.mjs`, `omp/SPIKE-omp-api.md`, `docs/omp-integration.md`)

- O omp **não lê** `hooks/hooks.json`; o DevFlow roda por um adaptador que fia eventos específicos.
- O `tool_call` do omp só retorna `{ block, reason }` — **não reescreve input**.
- Subagente roda pela ferramenta `task`; o modelo vem do **model role** (`pi/smol`, `default`,
  `pi/slow`, `pi/plan`, `commit`), gravado no frontmatter a partir de `omp/omp-roles.yaml`.

### 2.5 Jev e jev-router (avaliados e descartados na v1)

- **Jev** (TypeSafe, doc indexada no docs-mcp como `typesafe-jev`): `POST /v1/systemone`,
  perguntas `noul`/`choice`/`score`, `jev-1.13.0` a US$ 0,042/Mtok de entrada; retenção "pelo tempo
  necessário", sem prazo fixo; ZDR só enterprise (`typesafe.ai/legal/data-processing`).
- **jev-router** (mod da comunidade, `satviksinha/jev-model-router`): roteia a sessão principal
  consultando o Jev a cada turno (`turn.start` → `turn.step`), com `/jev sticky` para conter o custo
  de cache de trocas frequentes.
- **Por que saem (D16):** com mods, o sinal de roteamento já está no estado do DevFlow (fase, skill,
  agente, task); o único julgamento restante — se a falha de um subagente é de capacidade — acontece
  só em falha e cabe ao controlador da sessão (que já leu o relatório) ou a uma completion barata via
  `$.model.complete`. O Jev somaria chave, conta à parte, envio de dados a terceiro e consentimento
  por projeto por um ganho marginal. A interface "decisor" fica pronta para ele voltar se o relatório
  mostrar escaladas erradas.
- **`docs/jev-model-router.md`** (fornecido pelo operador) foi origem conceitual; diverge do README
  oficial (comando `npx ... --mod` não confirmado; chave `jev_router_api_key` inexistente; OpenRouter
  não é provedor; afirma o oposto sobre subagentes).

## 3. Decisões

| # | Decisão |
|---|---|
| D1 | Escopo = **sessão principal (por fase/skill) + subagentes**. Advisor fora. (Revisada: na primeira rodada, só subagentes.) |
| D2 | Todo sinal de roteamento vem do estado do DevFlow (fase, skill, agente, task): tabela determinística, sem classificador externo. |
| D3 | Subagentes — quatro fontes, nesta precedência: tier da task do plano → skill que despacha (contexto explícito, ex.: revisão final) → fase (projeto antes do plugin) → agente (projeto antes do plugin) → `inherit`. (Revisada na R: a skill vinha depois do override de fase do projeto, o que rebaixava a revisão final.) |
| D4 | **Uma lib, três adaptadores.** A lib resolve um **tier abstrato** (`cheap/standard/capable/top`); cada runtime o traduz: **mod** (Claude Code com function hooks), **fallback clássico** `PreToolUse` (Claude Code sem function hooks; só subagentes), **omp** (tier → model role; só subagentes). |
| D5 | **Teto = escolha do usuário.** Modelo: no mod, o `e.model` que chega a cada `turn.step` da sessão e o `parentModel` do `agent.spawn` (as sondas confirmaram que são sempre os do usuário, mesmo com a sessão roteada); no clássico, o último modelo do transcript; no omp, o role que o agente teria sem roteamento. Esforço: o `e.effort` da sessão. Nada roda acima. `maxTier` é teto adicional opcional. A garantia vale quando o adaptador consegue ler o teto; teto ilegível → não roteia. |
| D6 | **Opt-in duplo (D18)**: `agents/*.md` não ganham `model:`; tudo vive no `routes.json` e só os adaptadores aplicam, com `models.enabled: true` no repositório **e** a confirmação do usuário. |
| D7 | Escalada de subagente **entre tentativas**: a skill chama `model-route.mjs escalate`, que devolve uma rubrica; o controlador responde; o CLI combina os limiares de forma determinística. |
| D8 | A escalada só roda após sinal de falha/ambíguo; conclusão bem-sucedida é provada pelo ledger do `verify:` (ADR-013). |
| D9 | Medição = ledger de decisões sem conteúdo + relatório; no mod, `usage` do `turn.complete`; no clássico/omp, dos transcripts. Opt-in (ADR-005). |
| D10 | Onboarding no `devflow:config`: roteamento, camadas (sessão/subagentes), function hooks, ledger. Sem chave externa. |
| D11 | **Sessão por fase, sticky:** o modelo da sessão principal muda só na fronteira de fase do PREVC e fica fixo dentro dela; fora de workflow PREVC, não muda. Default com **uma troca por workflow** (R→E). |
| D12 | **Esforço da sessão por skill**, a cada turno (sem custo de cache), limitado pelo `effortLevel` do usuário. |
| D13 | **Esforço por passo em subagente** (mod): falha de ferramenta sobe um degrau no passo seguinte; sucesso volta ao base. |
| D14 | **Escalada no meio do subagente** (mod, **atrás de `midRun.enabled`, desligada por padrão — D19**): ao atingir exatamente N falhas de ferramenta seguidas (default 3) → decisor via `$.model.complete` (alias `haiku`) com a mesma rubrica, **uma consulta por subagente** → se `escalate`, sobe o modelo pelo resto daquele subagente. No máximo uma troca por subagente, nunca para baixo, ≤ teto. Falha do decisor → segue no tier atual. |
| D15 | No clássico e no omp não há camada de sessão, nem esforço por passo, nem escalada no meio — só escolha inicial e escalada entre tentativas. A diferença é declarada no onboarding. |
| D16 | **Sem Jev na v1** (§2.5). Interface `decider` com implementações `rubric-controller` (entre tentativas) e `model-complete` (no meio); um decisor externo entra depois como novo adaptador. |
| D17 | **Controle do usuário:** comando `/devflow-route` (status / on / off / `session off`), registrado pelo mod; `/model` e `/effort` do usuário passam a ser o novo teto no passo seguinte (lidos de `e.model`/`e.effort`). Se outro roteador de sessão estiver habilitado (`$.settings.read().enabledPlugins`), a camada de sessão do DevFlow se desliga e avisa — nunca dois mods decidindo o mesmo `turn.step` da sessão. O teto dos subagentes continua sendo observado mesmo com a camada de sessão desligada. |
| D18 | **Quem liga é o usuário.** Rotear exige `models.enabled: true` no `.devflow.yaml` (versionado) **e** `DEVFLOW_MODEL_ROUTING=1` no ambiente do usuário (bloco `env` do `~/.claude/settings.json`). Repositório clonado sozinho não liga nada; o `doctor` avisa quando o repo pede roteamento sem a confirmação. (Achado de segurança da R.) |
| D19 | **Escalada no meio desligada por padrão** (`models.midRun.enabled: false`); o onboarding (`/devflow init` → `devflow:config`) pergunta se o usuário quer ligar. O esforço por passo (D13) continua ligado: a sonda R-10 mostrou que trocar só o esforço não invalida o cache. |
| D20 | **omp completo:** o CLI aceita `--runtime omp` em `resolve`/`escalate` e devolve o model role; o enrich do omp aplica teto (o role que o agente teria sem roteamento) e `maxTier`. Tier da task e escalada entre tentativas chegam ao omp. |
| D21 | **ID completo só no `turn.step`.** A sonda R-3 mostrou que o `turn.step` recusa alias. O mod aprende o ID completo de cada tier pelo retorno do `agent.spawn` (que resolve o alias); sem ID conhecido para o tier, a camada de sessão ajusta só o esforço. Na ferramenta Agent / `agent.spawn` vale sempre alias; quando o tier é o próprio teto, o despacho não é tocado. |

## 4. Arquitetura

```
   estado do DevFlow: fase (prevc.json) · skill ativa (skill.prompt) · agente · task do plano
                                   │
                                   ▼
          scripts/lib/model-routing.mjs   (pura; sem node:*; importável pelo mod)
          resolveSessionRoute(fase, skill, teto) → {tier, effort}
          resolveSubagentRoute(...)             → {tier, effort, source}
          capAtCeiling · nextTier · tierOf · tier→alias · tier→role
          scripts/lib/escalation.mjs (pura) → rubrica + combine(respostas) → {action, tier}
                                   │
        ┌──────────────────────────┼─────────────────────────────┐
        ▼                          ▼                             ▼
  MOD (CC + function hooks)   CLÁSSICO (CC sem f.hooks)     OMP
  sessão: turn.start/step      subagentes: PreToolUse      subagentes: tier → role
   modelo por fase (sticky)     (Agent) → updatedInput      (omp-roles; skill passa
   effort por skill             teto = transcript            o role no task)
  subagentes: agent.spawn      escalada entre tentativas    escalada entre tentativas
   teto = modelo original
   effort por passo +
   escalada no meio
  turn.complete → ledger
  /devflow-route · status line
        └──────────────────────────┴─────────────────────────────┘
                                   ▼
          routing-ledger (JSONL sem conteúdo, opt-in)  →  model-route.mjs report
```

### 4.1 Unidades

| Unidade | Responsabilidade | Depende de |
|---|---|---|
| `scripts/lib/model-routing.mjs` | Resolução de sessão e de subagente, teto, escada, tradução tier→alias/role. Pura, sem `node:*`. | tabela e config como argumento |
| `scripts/lib/escalation.mjs` | Rubrica (perguntas fechadas) e `combine(respostas, limiares)` → `{action, tier}`. Pura. | — |
| `assets/model-routing/routes.json` | `session.phases`, `session.skills` (esforço), `agents`, `phases`, `skills`, `effortByTier`, tipos roteáveis, mapas tier→alias e tier→role. | — |
| `scripts/lib/devflow-config.mjs` | Lê `models:` (ADR-011); inválido → desligado. | — |
| `scripts/lib/routing-ledger.mjs` | Formato e allowlist do ledger; escrita em XDG para o CLI. | config |
| `scripts/model-route.mjs` | CLI: `resolve`, `escalate` (emite rubrica / combina respostas), `report`. | libs (Node) |
| **Mod** (módulo TS) | Sessão: `turn.start` (lê fase), `skill.prompt` (skill ativa), `turn.step` (modelo/esforço da sessão). Subagentes: `agent.spawn`, `turn.step` (esforço por passo, escalada no meio), `tool.call` (falhas por `agentId`). `turn.complete` → ledger. `/devflow-route`, `$.ui.status`. | libs puras |
| **Clássico** `hooks/pre-tool-use-agent` | Fallback de subagentes quando function hooks estão desligados; no-op quando o mod está ativo. | lib |
| **omp** `omp-enrich-project-agents.mjs` + skills | Tier → role na escolha inicial (unifica com `omp-roles.yaml`). | lib |

**Empacotamento do mod:** no próprio plugin (`hooks/hooks.json` com `hooks` e `modules`) se o Claude
Code aceitar os dois juntos; senão, plugin irmão `devflow-router` no mesmo marketplace (verificação R-1).

### 4.2 Fluxo da sessão principal (mod)

1. Na primeira vez em que vê a sessão, o mod guarda o **modelo e o esforço originais** (os do
   usuário) — eles são o teto (D5). Um `/model` posterior do usuário vira o novo teto.
2. `turn.start`: lê a fase do `prevc.json` (`$.fs`, containment + allowlist). Se mudou de fase,
   resolve o novo tier da sessão; dentro da mesma fase, mantém (sticky).
3. `skill.prompt`: registra a skill ativa para o esforço do turno.
4. `turn.step` da sessão (sem `agentId`): `next({ ...e, model, effort })` com o tier da fase e o
   esforço da skill, ambos ≤ teto. Status line mostra a rota (`devflow → sonnet · medium · fase E`).

### 4.3 Fluxo de um subagente (mod)

1. `agent.spawn`: roteamento desligado, `fork`, `workflow` ou tipo fora da lista → intocado; `model`
   presente → respeita (`source: explicit`) e aplica o teto; sem `model` → `resolveSubagentRoute` →
   `capAtCeiling(…, modelo original do usuário)` → `next({ ...e, model })`.
2. `turn.step` com `agentId`: esforço por passo (D13) e, se decidida, a escalada no meio (D14).
3. `tool.call` com `agentId`: conta falhas seguidas; no limiar, aciona o decisor `model-complete`.
4. `turn.complete` do subagente: ledger com `usage` da API.
5. Falha ao fim (ledger do `verify:`, revisor, `BLOCKED`): a skill chama `model-route.mjs escalate`
   para a próxima tentativa (igual nos três adaptadores).

## 5. Tabela de defaults (hipótese inicial, ajustada pelo relatório)

**Tiers e tradução**

| Tier | Claude Code | omp | Esforço base |
|---|---|---|---|
| cheap | `haiku` | `pi/smol` | `low` |
| standard | `sonnet` | `default` | `medium` |
| capable | `opus` | `pi/slow` | `high` |
| top | `fable` | `pi/plan` | `high` |

**Sessão principal por fase** (`routes.json → session.phases`)

| Fase | Tier da sessão |
|---|---|
| P, R | teto (o modelo do usuário) |
| E, V, C | standard |
| fora de workflow | sem troca |

**Esforço da sessão por skill** (`routes.json → session.skills`; sempre ≤ `effortLevel` do usuário)

| Skill | Esforço |
|---|---|
| `superpowers:brainstorming`, `superpowers:writing-plans`, `devflow:prevc-review`, `superpowers:systematic-debugging` | teto |
| `devflow:prevc-execution`, `superpowers:subagent-driven-development`, `devflow:prevc-validation` | `medium` |
| `devflow:commit-message`, `devflow:documentation`, `devflow:prevc-confirmation` | `low` |
| demais | base do tier da fase |

**Subagentes — default por agente** (`routes.json → agents`)

| Tier/esforço | Agentes |
|---|---|
| capable/high | architect, security-auditor |
| standard/high | bug-fixer, performance-optimizer, product-manager |
| standard/medium | code-reviewer, feature-developer, test-writer, refactoring-specialist, backend/frontend/database/devops/mobile-specialist, business/product/operations/engineering-context |
| cheap/low | documentation-writer, memory-specialist |

**Subagentes — overrides por fase/skill**

| Contexto | Override |
|---|---|
| Fase R | code-reviewer → capable |
| Revisão final da branch (SDD na fase E) | → capable (passado explicitamente pela skill) |
| Fase C | documentation-writer → cheap |
| `general-purpose` | P/R/V → standard; E → standard (o tier da task prevalece); C → cheap |

**Tier da task do plano:** o DevFlow estende o cabeçalho de task do `writing-plans` (como já faz com
`**Agent:**`) com `**Tier:** cheap | standard | capable`.

Toda escolha passa por `capAtCeiling(tier, teto do usuário, maxTier)` (D5).

## 6. Escalada de subagentes

### 6.1 Rubrica (comum aos dois decisores)

| id | tipo | pergunta |
|---|---|---|
| `failure_is_capability` | 0–1 | A falha vem de dificuldade de raciocínio/desenho, e não de ambiente, ferramenta, acesso ou informação faltando? |
| `claims_done_with_evidence` | 0–1 | O relatório afirma conclusão citando evidência concreta (comando de teste e saída)? (só entre tentativas) |
| `is_stuck` | 0–1 | O agente diz estar bloqueado, inseguro ou sem convergir? |
| `needed_tier` | cheap/standard/capable/top | Que tier o trabalho restante exige? |

### 6.2 Entre tentativas (três adaptadores) — decisor `rubric-controller`

`model-route.mjs escalate --agent X --tier T --report <arquivo>` imprime a rubrica; o controlador (o
LLM da sessão, que já leu o relatório) responde em JSON; `model-route.mjs escalate --answers <json>`
combina:

| Condição (em ordem) | Ação |
|---|---|
| respostas inválidas/ausentes | `keep` |
| `claims_done_with_evidence ≥ 0,8` com sinal vermelho | `human`: contradição (validador de conclusão) |
| `failure_is_capability < 0,6` | `human`: modelo maior não resolve ambiente/informação |
| tier atual já é o teto | `human` |
| caso contrário | `escalate`: `capAtCeiling(max(nextTier(atual), needed_tier))` |

`human` reusa a escalada humana de cada skill; tentativas seguem limitadas pelos `max_retries`.

### 6.3 No meio da execução (só mod) — decisor `model-complete`

Gatilho: N falhas de ferramenta seguidas no mesmo `agentId`. `state`: os erros recentes daquele loop
(`$.session.messages({agentId})`), redigidos e truncados em 8k. Uma completion via
`$.model.complete` no tier `cheap` responde a rubrica em JSON; mesma combinação, com `human` e teto
virando `keep` (o subagente segue; a decisão final fica para o fim). Resposta ilegível → `keep`.

## 7. Configuração e onboarding

### 7.1 `.devflow.yaml`

```yaml
models:
  enabled: true          # opt-in; ausente = roteamento desligado
  session: true          # camada de sessão (só no mod)
  subagents: true
  maxTier: capable       # teto adicional opcional (o teto principal é a escolha do usuário)
  ledger: true           # opt-in (ADR-005)
  # camada 3 — projeto (tiers abstratos); comentário na linha de cima, nunca depois de `overrides:`
  overrides:
    agents:
      documentation-writer:
        tier: standard
    phases:
      E:
        general-purpose:
          tier: cheap
    session:
      phases:
        E: capable
  midRun:
    enabled: false       # D19 — escalada no meio desligada por padrão; o onboarding pergunta
    failureStreak: 3
  thresholds:
    capability: 0.6
    claimsDone: 0.8
```

Além do bloco acima, rotear exige `DEVFLOW_MODEL_ROUTING=1` no ambiente do **usuário** (D18) — o
onboarding mostra o bloco `env` do `~/.claude/settings.json`; o plugin nunca escreve nele. O leitor do
subset YAML não aceita mapas inline (`{ ... }`): overrides em estilo bloco.

### 7.2 Passo "Roteamento de modelos" no `devflow:config`

1. **Detecta** runtime(s), `models:`, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` e outro roteador de sessão
   instalado.
2. **Pergunta:** ligar roteamento; camadas (sessão e/ou subagentes); `maxTier`; ledger.
3. **Function hooks (Claude Code):** explica o que cada caminho entrega (mod = sessão por fase,
   esforço por skill/passo, escalada no meio, `usage` confirmado; sem = só subagentes, escalada entre
   tentativas) e mostra a variável para o bloco `env`. Nunca escreve no `settings.json`.
4. **Custo de cache declarado:** cada troca de fase faz a primeira mensagem seguinte reler o contexto
   sem cache; o default troca uma vez por workflow.
5. **omp:** reaplica `omp-enrich-project-agents.mjs` com a tradução tier→role.
6. **`/devflow update`:** sem `models:`, a feature aparece em "Available features" do
   `references/post-update-guide.md`.

## 8. Medição

**Ledger** (`models.ledger: true`): `~/.local/share/devflow-model-routing/<projeto>/ledger.jsonl`,
fora do repositório. Chaves permitidas: `ts`, `sessionId`, `scope` (`session|subagent`), `agentId`,
`agentType`, `phase`, `skill`, `tier`, `model`, `effort`, `source`
(`plan|skill|project|agent|explicit|inherit|phase`), `ceiling`, `adapter` (`mod|classic|omp`),
`usage` (só números; no mod), `cacheReadRatio`, `escalation{at,from,to,action,scores}`. Nunca prompt,
resposta ou erro em texto.

**Relatório** (`model-route.mjs report [--since]`): tokens por modelo × (agente | fase da sessão),
antes/depois (corte = primeira linha do ledger); taxa de escalada por agente/tier; trocas no meio;
**custo das trocas de fase** (razão de cache no passo seguinte a cada troca da sessão), para mostrar se
o cache frio está comendo a economia.

**Limites declarados:** o peso de cada modelo na cota do Max não é público (tokens por modelo, nunca
"% da cota"). A v1 cobre só o diretório atual.

## 9. Erros e segurança

| Ponto | Falha | Comportamento |
|---|---|---|
| Mod (qualquer hook) | exceção, config inválida, decisor falhou | `.catch` → `next(e)` intocado (comportamento de hoje); nunca `deny` |
| Hook clássico | erro, timeout (5 s), config inválida | sai vazio; nunca nega; nunca emite `permissionDecision`; um único JSON via `JSON.stringify`; wrapper com `exec node` (o processo morre junto com o timeout) |
| `updatedInput` / `next({...e})` | — | preserva todos os campos; só altera `model`/`effort` |
| Arquivos vindos do repositório (`.devflow.yaml`, `prevc.json`) | symlink, FIFO, `/dev/zero`, dispositivo, enorme, fora do root | **leitura segura** em todos os adaptadores e no CLI: `readRegularFileSafe` (`O_NOFOLLOW`, `O_NONBLOCK`, só arquivo regular, limite de tamanho); no mod, `$.fs.stat({resolve:true})` recusa `isLink`, `kind !== "file"`, tamanho acima do limite e `realPath` fora da raiz; allowlist `P/R/E/V/C` (ADR-014). (PoC da R: link para `/dev/zero` levou o processo a 3,9 GB em 1 s.) |
| Cauda do transcript (clássico) | FIFO, enorme | aberta com `O_NOFOLLOW`/`O_NONBLOCK`, só arquivo regular, lê ≤ 256 KB do fim |
| Teto ilegível | — | não roteia |
| Outro roteador de sessão ativo | — | camada de sessão desligada, aviso uma vez (D17) |
| Ledger | falha de escrita | ignorada; valores por allowlist/regex (`^[A-Za-z0-9:_./-]{1,64}$`) ou enum, nunca texto livre; diretório `0700`, arquivo `0600` no CLI; o mod grava no máximo uma vez por turno da sessão, com teto de linhas |
| Relatório | `agentType` hostil (`__proto__`) | buckets em `Map`/`Object.create(null)` |
| Redação da rubrica | relatório enorme | corta em 16 KB, redige, corta em 8 KB (a redação é quadrática no pior caso) |
| Decisor do meio | falhas seguidas | uma consulta por subagente, só quando a sequência atinge exatamente N |

**Dados:** nada sai da Anthropic. O `state` da escalada no meio vai para uma completion na própria
sessão, já redigido e truncado (`instinct-redact.mjs`). A rubrica entre tentativas é respondida pelo
controlador, que já tem o relatório no contexto.

## 10. Testes (TDD, testes reais)

| Sinal | Cobertura |
|---|---|
| unit | resolução de sessão (fase × skill × teto de modelo e de esforço; sticky; fora de workflow sem troca); resolução de subagente (5 camadas × teto × `maxTier`); tipo não roteável intocado; `nextTier`/`tierOf`/`capAtCeiling`; tier→alias/role; parser de `models:` (inválido → desligado); rubrica e `combine` (tabela 6.2 e variação 6.3); esforço por passo; ledger com propriedade "chaves ⊆ allowlist"; **libs sem import de `node:*`** |
| integration | **mod** via `claude plugin test` com engine fake: troca de modelo da sessão só na mudança de fase (contagem de trocas = 1 num workflow P→C); esforço por skill ≤ `effortLevel`; `/model` manual vira teto; `agent.spawn` usa o modelo **original** como teto mesmo com a sessão roteada para baixo; `fork`/workflow intocados; `turn.step` de subagente com esforço por passo e no máximo uma escalada, nunca para baixo; decisor ilegível → `keep`; outro roteador ativo → sessão desligada; `turn.complete` → ledger. **Clássico**: JSON no stdin (sem model → `updatedInput`; com model → intocado; teto do transcript; sem `prevc.json` → roteia pelo default do agente (sem fase), e tipo com `model` explícito dentro do teto fica intocado, acima do teto é rebaixado ao alias do teto; C0 → JSON válido; no-op com mod ativo). **omp**: enrich com tier→role |
| e2e | CLI `resolve/escalate/report` em projeto-fixture em tmpdir (nunca muta diretório versionado), incluindo o ciclo rubrica → respostas → ação; `claude plugin validate` do mod |
| lint | sempre |

**Verificação real na fase V:** uma sessão real com o mod ativo atravessando P→E, confirmando pelo
`usage` do `turn.complete` a troca de modelo da sessão na fronteira, o subagente no modelo roteado e o
teto respeitado; uma sessão com o mod desligado confirmando o fallback clássico; relatório sobre ambas.

## 11. Resultados das sondas da fase R (Claude Code 2.1.294)

Executadas com `claude -p` e um plugin de sonda descartável (hook clássico + módulo), fora do repositório.

| # | Pergunta | Resultado |
|---|---|---|
| R-1 | `hooks` clássicos e `modules` no mesmo `hooks/hooks.json` | **Sim** — `claude plugin validate` aceita e os dois rodam na mesma sessão. O mod fica no próprio plugin. |
| R-2 | Mod depende de `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` | **Sim** — sem a variável o módulo não carrega. A verdade é a do Claude Code: `1|true|yes|on`, com trim e sem diferenciar caixa (`functionHooksOn`). O hook clássico usa a variável como sinal de exclusão mútua. |
| R-2 (fase V) | Reteste da R-2 em sessões reais | **A R-2 acima não vale mais.** Os Claude Code 2.1.293, 2.1.294 e 2.1.295 carregam o mod SEM `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`, até com valor `0` (provável mudança de flag no servidor). O clássico segue consultando a variável só para a exclusão mútua; com ela ausente, mod e clássico podem decidir o mesmo despacho e o resultado converge (clássico só rebaixa abaixo do modelo atual; mod nunca passa do original). Verificado com `devflow:architect` e por simulação. |
| R-2 (nota F2) | Primeiro despacho no clássico | O transcript ainda não tem mensagem do assistente no `PreToolUse` do primeiro despacho: teto ilegível, o clássico não roteia (D5). Do 2º turno em diante roteia. O mod roteia desde o primeiro. |
| R-3 | Reescrever o `model` no `turn.step` da sessão | **Sim, só com ID completo** (`claude-haiku-4-5-20251001` respondeu; o alias `haiku` fez o turno falhar). `e.model` e `e.effort` que chegam são sempre os do usuário; `parentModel` do `agent.spawn` também. Ver D21. Fase V: por isso a troca de sessão é medida contra o último modelo **aplicado**, não contra `e.model`; o `report` conta "Despachos" por `agentId` distinto. |
| R-4 | `skill.prompt` para skill de plugin | **Sim**, com nome qualificado (`probe-routing:ping`). |
| R-5 | `updatedInput` sem `permissionDecision` | **Sim** — o subagente rodou com `model: haiku` (`meta.json`). Ferramenta: `Agent`. |
| R-6 | `$.fs.write` fora do plugin; `$.model.complete` com alias | **Sim** nos dois. `$.fs.stat` existe (`isLink`, `kind`, `size`, `realPath`). Não há append. |
| R-7 | Detectar outro roteador de sessão | Não há `$.plugin.list`; `$.settings.read().enabledPlugins` expõe os plugins habilitados. |
| R-8 | Versão mínima | **2.1.294** (versão testada); abaixo dela o `doctor` avisa e o mod pode não carregar (o mod não checa versão; quem avisa é o `doctor`). |
| R-10 | Trocar só o esforço invalida o cache? | **Não** — esforço alternado `high/low` a cada passo, leitura de cache igual ao controle. |

Restrição do `claude plugin validate` descoberta na sonda: uma função que recebe `$` precisa ser
declarada no topo do módulo (não dentro do `register`); hooks que decidem pedem `.catch`.

## 12. Fora do escopo

- Advisor.
- Decisor externo (Jev) — volta como adaptador do `decider` se o relatório justificar (D16).
- Camada de sessão, esforço por passo e escalada no meio fora do mod (D15).
- Distinguir `model` explícito vindo da skill de `model` escolhido pelo LLM (ambos `source: explicit`).
- Relatório agregando worktrees.
- O custo fixo do `SubagentStart` (normas ≤ 9000 caracteres por despacho) — candidato a follow-up.

## 13. ADR

Decisão arquitetural sem ADR correspondente (relação `none`): cria uma ADR nova ("Roteamento de
modelos do DevFlow — lib única com tier abstrato, sessão por fase e subagentes por agente/fase/task,
teto na escolha do usuário, três adaptadores"), com guardrails de D4–D6, D11, D14, D17, D18 e D21,
mais: leitura segura de todo arquivo vindo do repositório; o mod importa `models-config.mjs` direto (puro)
e o parser segue único (ADR-011); a garantia de teto depende de o adaptador conseguir lê-lo. Número
definido na criação (há renumeração pendente na feature de rastreabilidade). Estende sem contrariar
ADR-005, 009, 011, 014 e 015.

## 14. Agentes previstos na execução

architect (ADR, revisão R), backend-specialist (libs, CLI, mod, adaptador omp), security-auditor
(mod, hook clássico, redação, containment), test-writer (propriedades, `claude plugin test`, e2e),
documentation-writer (guia de onboarding e post-update-guide).
