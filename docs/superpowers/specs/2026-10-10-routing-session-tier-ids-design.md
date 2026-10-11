# ID verificado do tier antes da primeira troca da sessão — design

**Data:** 2026-10-10 · **Escala:** LARGE · **Workflow:** `routing-session-tier-ids` · **ADR:** 017 (evolve minor → v1.2.0)

## 1. Problema

A camada de sessão do roteamento só troca de modelo com ID completo. A sonda R-3 mostrou que o `turn.step` recusa
alias (`sonnet` faz o turno falhar). O mod aprende o ID completo de cada tier por observação: pelo `turn.step` (o
modelo do usuário, ou seja, só o teto) e pelo retorno do `agent.spawn` (o alias resolvido pelo engine). Sem ID do
tier-alvo, `onSessionStep` ajusta só o esforço (D21).

Consequência medida na campanha 2026-10-10-D (plugin v3.8.1, teto opus):

- a sessão ficou em opus durante toda a fase E (439 respostas em opus até o avanço E→V);
- o primeiro sonnet do run apareceu às 23:25:23, num subagente `code-reviewer` despachado na fase V;
- a sessão trocou para sonnet 27 s depois (23:25:50), a única troca registrada no ledger;
- `INV-SESS` deu MISS (27 de 130 mensagens fora do tier: E×11, V×11, C×5). No braço B, 41 de 98, sem nenhuma troca.

O roteamento de sessão só começa depois do primeiro subagente do tier mais barato. Em fluxos em que a fase E é feita
pela própria sessão, sem subagente, a economia principal do roteamento some.

## 2. Objetivo e não-objetivos

**Objetivo:** a sessão troca para o tier da fase no passo seguinte à primeira necessidade, sem depender de um
subagente, e sem nunca mandar ao `turn.step` um ID não verificado.

**Não-objetivos:**

- provedores cujo ID não segue `claude-*` (Bedrock, Vertex, gateways): a sonda rejeita ou o candidato nem passa no
  filtro, e o comportamento continua o atual (só esforço), agora visível no ledger;
- o braço B da campanha 2026-10-10 quase sem ledger (achado separado);
- mudar a tabela de rotas, o teto ou o roteamento de subagentes.

## 3. Desenho

### 3.1 Cadeia de resolução do ID do tier T

Vale só para T abaixo do teto (no teto o `turn.step` não é tocado). Ordem:

1. **Aprendido na sessão** (`state.ids[T]`): veio do engine (`agent.spawn` resolvido ou `turn.step`). Usado direto,
   como hoje.
2. **Candidatos**, nesta ordem e sem repetição:
   1. o cache persistente de IDs verificados (§3.3);
   2. `models.ids.<T>` do `.devflow.yaml`;
   3. a tabela padrão do plugin, em `assets/model-routing/routes.json` → `ids`:
      `cheap: claude-haiku-5-5`, `standard: claude-sonnet-5-5`, `capable: claude-opus-5-5`, `top: claude-fable-5-1`.
3. **Filtro de candidato:** só entra o que casa `^claude-[a-z0-9-]+$` e tem `tierOf(id) === T`. Um repositório não
   consegue mapear `cheap` para opus, nem injetar texto livre.
4. **Sonda:** nenhum candidato vai ao `turn.step` sem verificação na sessão corrente (§3.2). Verificado, vira
   `state.ids[T]`, com origem `probe`.
5. **Sem ID verificado:** só esforço, como hoje, e o ledger registra (§3.4).

O pior caso é o comportamento atual. Um ID errado nunca chega ao `turn.step`.

### 3.2 Sonda

- **Quando:** sob demanda, no primeiro `turn.step` da sessão em que a rota pede T abaixo do teto e não há ID
  verificado de T. Nunca no `session.start` (não gasta nada em sessão que não troca).
- **Como:** `$.model.complete({ model: <candidato>, prompt: "ok", maxTokens: 1, timeoutMs: 15000 })`, sem `await`
  no passo: o passo segue só com esforço e a troca acontece no próximo passo depois que a sonda resolve.
- **Uma sonda por tier em voo.** Passos seguintes não disparam outra enquanto ela não resolve.
- **Classificação do resultado** (função pura no core):
  - `isAnswered: true` ou `reason: "empty-reply"` → **ok**: o ID foi aceito. Vira `state.ids[T]` e vai ao cache;
  - `api-error` com `error` em `invalid_request` ou `model_not_found`, ou `status` 400/404 → **rejected**: descarta o
    candidato e passa ao próximo da cadeia na próxima necessidade;
  - a chamada lança: o engine recusou enviar (modelo bloqueado ou fora da allowlist), o que não se resolve sozinho →
    **rejected**;
  - qualquer outro (`rate_limit`, `overloaded`, `status` nulo, `aborted`) → **error** transitório: tenta de
    novo o mesmo candidato numa necessidade seguinte, até 3 tentativas por tier na sessão; esgotado, desiste do tier
    na sessão.
- **Custo:** uma chamada de 1 token de saída por tier e por sessão, só quando falta ID. Declarado no CHANGELOG e na
  ADR.

### 3.3 Cache persistente de IDs

- Caminho: `<XDG_DATA_HOME ou ~/.local/share>/devflow-model-routing/ids.json`, por usuário (não por projeto). A
  função pura `idsCachePathFrom({ xdgDataHome, home })` mora em `routing-ledger.mjs`, ao lado de `ledgerDirFrom`.
- Formato: `{ "version": 1, "ids": { "<tier>": "<id>" } }`. Leitura tolerante: JSON inválido, versão diferente,
  tier fora do enum ou ID que não passa no filtro → entrada ignorada.
- Gravado sempre que um ID fica verificado (sonda ok) ou aprendido do engine (`agent.spawn`), desde que o roteamento
  esteja ligado. Independe de `models.ledger`. Falha de escrita é silenciosa.
- **É só fonte de candidato:** um ID do cache passa pela sonda na sessão antes de uso. Isso cobre quem troca de conta
  ou de provedor entre sessões.
- Contenção: `$.fs.stat` com `resolve`, sem link, arquivo regular, até 4 KiB, antes de ler.

### 3.4 Ledger

Chaves novas na allowlist do `buildEntry`, com enum:

- `scope: "probe"`, com `tier`, `model` (o candidato, já filtrado pela regex SAFE) e `probe: ok | rejected | error`.
  Uma linha por sonda resolvida.
- `idPending: <tier>` nas linhas de sessão: no turno, a rota pediu esse tier e não havia ID verificado em algum passo.
- `idSource: learned | probe` na linha de sessão em que `switched: true`, dizendo de onde veio o ID da troca.

Nenhum texto livre entra: o resultado da sonda é enum, nunca o texto da resposta.

### 3.5 Configuração

`models.ids` no `.devflow.yaml`, lido por `readModels` (ADR-011, leitor único):

```yaml
models:
  ids:
    standard: claude-sonnet-5-5
```

Chave fora de `TIERS` ou valor que não passa no filtro é ignorado.

### 3.6 Laboratório (repo irmão `devflow-routing-lab`)

- `INV-SESS` mantém o veredito, mas a evidência passa a dizer a causa quando o ledger traz `idPending` e linhas
  `probe`: "N turnos com ID pendente (tier X); sondas: ok A, rejected B, error C".
- Os braços rodam com XDG isolado: o cache começa vazio e a campanha exercita o caminho da sonda.
- Commit local no repo do laboratório (sem remoto), fora do PR do plugin.

## 4. Componentes

| Arquivo | Mudança |
|---|---|
| `scripts/lib/router-core.mjs` | `idCandidates(state, tier, { cache, config, table })`, `classifyProbe(result)`, `onProbeResult(state, tier, id, outcome)`; `onSessionStep` devolve `needProbe: tier` e `idPending` quando falta ID; estado `probes` e `idSource` |
| `hooks/router.mjs` | carrega o cache no `ensure`; dispara a sonda em segundo plano no `turn.step`; grava o cache; linhas `probe`, `idPending`, `idSource` no ledger |
| `scripts/lib/routing-ledger.mjs` | allowlist/enums novos; `idsCachePathFrom`; `parseIdsCache`/`serializeIdsCache` |
| `scripts/lib/models-config.mjs` | `models.ids` |
| `scripts/lib/routing-report.mjs` | seção de sondas (contagem por tier e resultado) e turnos com ID pendente |
| `assets/model-routing/routes.json` | `ids` padrão |
| ADR-017 → v1.2.0 | D21 com cadeia e sonda; guardrail "sem ID verificado, só esforço" |
| `CHANGELOG.md` | entrada em `[Unreleased]` |
| laboratório `lib/invariants.mjs` | evidência do `INV-SESS` |

As libs continuam puras (sem `node:*`); o adaptador só traduz eventos.

## 5. Erros e bordas

- Sonda lança (o engine recusa enviar: `model` bloqueado) → `rejected`; não afeta o passo.
- Teto muda no meio da sessão (`/model`) → os IDs aprendidos continuam válidos; a rota recalcula o tier.
- Fase volta para P/R (teto) → nenhum tier abaixo do teto é pedido; nenhuma sonda.
- Duas necessidades do mesmo tier enquanto a sonda está em voo → uma sonda só.
- Reload do módulo (hot reload) → estado zera; o cache reduz o custo de reaprender.
- Cache com ID de outra conta → a sonda rejeita; o candidato seguinte é testado.

## 6. Testes

- **Unit (core/ledger/config):** cadeia de candidatos (ordem, dedupe, filtro de tier e regex), `classifyProbe` em
  cada braço do resultado, limite de 3 tentativas, sonda única em voo, `onSessionStep` sem ID devolve `needProbe` e
  só esforço, com ID verificado troca e marca `idSource`; `buildEntry` aceita as chaves novas e rejeita valores fora
  do enum; `parseIdsCache` tolerante; `readModels` com `models.ids`.
- **Integração (adaptador com `$` falso):** primeiro passo em E sem ID dispara a sonda e não troca; resolvida ok, o
  passo seguinte troca para o ID verificado; rejected testa o próximo candidato; ledger com `probe`, `idPending` e
  `idSource`; cache gravado e relido na sessão seguinte, sempre re-sondado.
- **E2E:** `claude plugin validate .` segue passando com o mod alterado (teste existente
  `router-monitor-validate.e2e`); `model-route report` (CLI real, `test-model-route-cli`) sobre um ledger com linhas
  `probe` e `idPending` conta as sondas por resultado e não quebra. A troca de modelo de ponta a ponta numa sessão real
  é medida em campo (§7), não na suíte: exigiria chamar a API.
- **Laboratório:** unit do `INV-SESS` com ledger contendo `idPending`/`probe`.

`requiredSignals: [unit, integration, e2e, lint, standards]`.

## 7. Validação em campo

Re-rodar o braço D com a versão nova. Critério: a sessão troca para sonnet na fase E sem subagente sonnet antes, e o
ledger mostra uma linha `probe: ok` antes da troca, com `idSource: probe`.
