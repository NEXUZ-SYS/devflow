---
name: knowledge-filter
description: "Use para selecionar apenas os docs de conhecimento relevantes à task atual em vez de carregar todos — reduz ruído de contexto mantendo os docs de knowledge mais pertinentes. Invoque no início do PREVC Planning (após a task estar definida) ou sob demanda quando o usuário pedir 'filtre o knowledge para X' ou mencionar que há muitos docs de contexto ativos. Lê o índice via loadKnowledgeIndex (ou frontmatters diretos), inclui sempre os docs activation: always, adiciona on-demand cujos layer/keywords batem com a task."
---

# knowledge-filter — Filtragem Contextual de Knowledge Docs

Seleciona os docs de conhecimento (DDC) relevantes a uma task específica em vez de carregar todos. Análogo de `devflow:adr-filter` para o contexto narrativo — complementa (não substitui) a injeção de docs `activation: always` feita pelo session-start hook.

## Quando invocar

- **Automaticamente** — durante `devflow:prevc-planning` Step 1, **depois** que a task está definida
- **Sob demanda** — usuário diz "filtre o knowledge para esta task X", ou menciona ter muitos docs de contexto e querer foco

**Não invoque** se `.context/` não existir ou não houver nenhum knowledge doc. Skill é no-op nesse caso.

## Anuncie ao iniciar

"Invocando `devflow:knowledge-filter` para selecionar knowledge docs relevantes a esta task."

## Processo

### Step 1 — Carregar o índice

Use `loadKnowledgeIndex(projectRoot)` (via `scripts/lib/knowledge-loader.mjs`) para obter a lista de todos os knowledge docs com:
- `file` — caminho absoluto
- `layer` — business / product / operations / engineering
- `name` — slug do doc
- `description` — resumo do frontmatter
- `activation` — `always` | `on-demand`
- `owner` — curador responsável

Se a lib não estiver disponível na sessão atual (ambiente sem Node), faça fallback: leia diretamente os frontmatters em `.context/<layer>/*.md` com `type: knowledge` em cada subdir das quatro camadas.

### Step 2 — Entender a task

Receba a descrição da task (do argumento, do plano PREVC em andamento, ou do último turno do usuário). Extraia dois sinais:

1. **Camadas relevantes** — a task é claramente de uma camada (ex: "adicionar endpoint" → engineering; "revisar persona" → product; "configurar deploy" → operations; "mudança de modelo de negócio" → business)?

2. **Keywords** — termos que batem com `description` ou `name` de docs de knowledge (ex: "tom de voz" → `product-tone-of-voice`; "incidente" → `operations-incident-response`).

### Step 3 — Filtrar

Para cada doc no índice, aplique em ordem:

**3a. Filtro de activation:**
- `activation: always` → **sempre inclui**, independente da task

**3b. Filtro de camada (sobre os `on-demand`):**
- Layer bate com o foco principal da task → inclui
- Layer claramente off-topic → rejeita
- Em dúvida → **inclui** (falso positivo é preferível a falso negativo)

**3c. Filtro semântico (sobre os que passaram em 3b):**
- Descrição/name do doc se conecta semanticamente com a task? → inclui
- Claramente off-topic (ex: `operations-rollback` quando task é sobre design system) → rejeita

### Step 4 — Carregar corpos

Para cada doc selecionado, leia o corpo completo do arquivo (excluindo o frontmatter). Se um doc `activation: always` não foi lido ainda, use `loadAlwaysActive(projectRoot)` para otimizar.

### Step 5 — Emitir bloco

Formato de saída (tag `<KNOWLEDGE>` com `filtered="true"` para diferenciar da injeção eager do hook):

```
<KNOWLEDGE filtered="true">
Loaded N of M knowledge doc(s), filtered for task: "<descrição curta da task>".
Signals: layers=[...], keywords=[...].

### <name> [always] (layer: <layer>)
<body do doc>

### <name> [on-demand] (layer: <layer>)
<body do doc>
</KNOWLEDGE>
```

**Tags emitidas no nome do doc:**
- `[always]` — doc de ativação permanente (contexto crítico; sempre presente)
- `[on-demand]` — doc selecionado por relevância à task atual

Se M = N (nenhum doc foi filtrado fora), diga explicitamente: `"Nenhum knowledge doc foi filtrado — todos aplicam a esta task."` Isso evita a impressão de que o filtro quebrou.

## Fallback de segurança

Se `loadKnowledgeIndex` não estiver disponível **e** a leitura direta de frontmatters falhar, carregue apenas os docs com `activation: always` que existam em `.context/<layer>/`. **Correção prevalece sobre otimização** — é preferível injetar só o contexto sempre-ativo a descartar docs críticos.

> Comportamento análogo ao fallback de precaução do `adr-filter`: quando a detecção falha, amplia a cobertura em vez de reduzir.

## Exemplo concreto

Task: *"criar endpoint POST /products com validação de schema e teste unitário"*

1. **Carregar índice** → 9 knowledge docs (5 `always`, 4 `on-demand`)
2. **Sinais** → layers=[engineering, product], keywords=[produto, validação, teste]
3. **Filtrar:**
   - `business-vision` [always] → ✅ sempre inclui
   - `business-glossary` [always] → ✅ sempre inclui
   - `product-vision` [always] → ✅ sempre inclui
   - `product-design-system` [always] → ✅ sempre inclui
   - `product-tone-of-voice` [always] → ✅ sempre inclui
   - `product-persona` [on-demand] → ❌ layer product mas task é backend (off-topic semântico)
   - `operations-deploy` [on-demand] → ❌ deploy não é o foco
   - `engineering-architecture-overview` [on-demand] → ✅ layer bate + task menciona endpoint
   - `engineering-methodology` [on-demand] → ✅ layer bate + task menciona teste unitário
4. **Carregar corpos** de 7 docs selecionados
5. **Emitir** bloco com 7 de 9 (redução de 22%)

## Interação com outros componentes

- **session-start hook** — Continua injetando docs `activation: always` de forma eager. Esta skill emite um bloco **adicional** e **focado** com os `on-demand` relevantes quando invocada durante PREVC.
- **devflow:prevc-planning** — O Step 1 desta skill substitui a injeção indiscriminada de todos os docs de knowledge, carregando apenas os relevantes à task ativa.
- **devflow:adr-filter** — Skill análoga para ADRs. Ambas podem ser invocadas em sequência no Step 1 do PREVC Planning para montar o contexto focado completo.
- **devflow:context-awareness** — Se invocada junto, knowledge-filter e adr-filter ficam na frente — contexto focado vale mais que contexto genérico.

## Anti-patterns

- **Omitir docs `activation: always`** — eles são críticos por definição; nunca filtrá-los fora independente da task
- **Usar só a camada para filtrar** — combine camada + semântica; uma task de "autenticação" pode puxar `business-compliance` mesmo sendo engineering
- **Duplicar o corpo dos docs** — o bloco `<KNOWLEDGE>` é injeção de leitura; não copie o conteúdo para outros artefatos da sessão
