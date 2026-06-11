---
title: pgvector
version: 0.7.x / 0.8.x
last_updated: 2026-05-20
status: current
upstream: https://github.com/pgvector/pgvector
---

# pgvector

Extensão Postgres para vector similarity search. Standard de facto para RAG e embeddings em Postgres, alternativa a vector DBs dedicadas (Pinecone, Weaviate, Qdrant) quando "uma DB só" é vantagem operacional.

Este documento cobre **a extensão como tecnologia** (versão, tipos, operadores, índices, performance). Convenções de modelagem do projeto (naming, dimensão padrão, FK strategy para chunks/documents, particionamento) ficam em `@contracts/pgvector`. Postgres base em `@stacks/database/postgres`.

## Versão fixada

- **0.7.x / 0.8.x** (lançadas em 2024-2025).
- `0.7` introduziu: `halfvec` (float16), `sparsevec`, binary quantization sobre `bit`, novos operator classes, paralelização do build HNSW, operador `<+>` (L1).
- `0.8` adiciona iterative index scans, melhorando filtered ANN.
- Providers expõem versões específicas — fixar via variável do provider (Neon, Supabase, Cloud SQL, RDS, Crunchy, Aiven, Timescale) e validar com `SELECT extversion FROM pg_extension WHERE extname = 'vector';`.

## Instalação

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Em provisionamento de DBs novas (CI, dev, preview branches): incluir no bootstrap. Esquecer este passo é causa recorrente de falhas em fresh environments.

## Tipos

| Tipo | Storage | Máx dims | Máx dims com índice | Uso |
|---|---|---|---|---|
| `vector(n)` | float32 (4B) | 16.000 | 2.000 | Default. Embeddings de uso geral. |
| `halfvec(n)` (0.7+) | float16 (2B) | 16.000 | 4.000 | Reduz storage e índice pela metade. Tolerância a perda mínima de precisão. Recomendado para embeddings >1k dims. |
| `bit(n)` | 1 bit | 64.000 | 64.000 | Binary quantization. Pre-filter rápido com Hamming/Jaccard. |
| `sparsevec(n)` (0.7+) | esparso | 1.000 nonzero / 16k dims | — | SPLADE, learned sparse embeddings. |

## Operadores de distância

| Operador | Métrica | Operator class HNSW/IVFFlat |
|---|---|---|
| `<->` | L2 / Euclidean | `vector_l2_ops`, `halfvec_l2_ops` |
| `<#>` | Negative inner product (ASC = maior IP) | `vector_ip_ops`, `halfvec_ip_ops` |
| `<=>` | Cosine distance (1 − cosine sim) | `vector_cosine_ops`, `halfvec_cosine_ops` |
| `<+>` (0.7+) | L1 / Manhattan | `vector_l1_ops` |
| `<~>` | Hamming (bit) | `bit_hamming_ops` |
| `<%>` | Jaccard (bit) | `bit_jaccard_ops` |

**Crítico**: operator class do índice deve casar com o operador da query. Índice criado com `vector_l2_ops` não acelera query com `<=>`. Causa #1 de "índice criado, ainda lento".

## Índices

### HNSW (recomendado)

Graph-based. Melhor recall × latency. Build mais lento e mais memória que IVFFlat.

```sql
CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

- `m` (default 16): conexões por nó. Maior = melhor recall, mais memória/storage.
- `ef_construction` (default 64): tamanho da lista dinâmica durante build. Maior = melhor índice, build mais lento.
- `hnsw.ef_search` (default 40, query-time): tamanho da lista durante search. Ajustar por sessão para tunar recall × latency.

```sql
SET hnsw.ef_search = 100;
```

### IVFFlat

Clustering-based. Build rápido, recall menor, requer dados representativos no momento do build.

```sql
CREATE INDEX ON items USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

- `lists`: heurística é `rows / 1000` para até 1M rows, `sqrt(rows)` acima.
- `ivfflat.probes` (default 1): quantos clusters checar. Maior = melhor recall.

### Regras operacionais

- Criar índice **depois** de popular dados quando possível. IVFFlat especialmente exige dados representativos para clustering útil.
- Em produção, sempre `CREATE INDEX CONCURRENTLY` para evitar lock de tabela inteira. Detalhes em `@rules/migration`.
- Build HNSW paralelizado em 0.7+ — ajustar `max_parallel_maintenance_workers`.
- `maintenance_work_mem` alto durante build (índice precisa caber em memória idealmente).

## Query patterns

### ANN básica

```sql
SELECT id, content
FROM chunks
ORDER BY embedding <=> $1
LIMIT 10;
```

### Hybrid search

Combinar similaridade vetorial com full-text via `tsvector` ou trigram via `pg_trgm`, fundindo rankings com Reciprocal Rank Fusion (RRF):

```sql
WITH vec AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $1) AS rank
  FROM chunks ORDER BY embedding <=> $1 LIMIT 50
),
fts AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank(tsv, query) DESC) AS rank
  FROM chunks, plainto_tsquery($2) query
  WHERE tsv @@ query LIMIT 50
)
SELECT id, SUM(1.0 / (60 + rank)) AS score
FROM (SELECT * FROM vec UNION ALL SELECT * FROM fts) u
GROUP BY id ORDER BY score DESC LIMIT 10;
```

### Filtered ANN

`WHERE` + `ORDER BY embedding` pode degradar com HNSW quando o filtro é seletivo demais (o grafo não foi construído conhecendo o filtro). Estratégias:

1. **Partial index**: criar índice com `WHERE` para filtros frequentes e estáveis.
   ```sql
   CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops)
     WHERE tenant_id = 'acme';
   ```
2. **Pre-filter via tabela menor**: particionar por dimensão de tenancy (ver `@contracts/pgvector`).
3. **Iterative scans** (0.8+): habilitar com `SET hnsw.iterative_scan = strict_order` ou `relaxed_order` para HNSW respeitar filtros sem perder muito recall.
4. **Binary quantization pre-filter**: manter coluna `embedding_bit bit(N)` derivada, filtrar top-K com Hamming, reranquear top-N com `vector` exato.

## Embeddings (providers)

Referencie `@stacks/ai/vercel-ai-sdk` para geração.

| Provider | Modelo | Dims | Notas |
|---|---|---|---|
| OpenAI | `text-embedding-3-small` | 1536 | Padrão custo/qualidade. |
| OpenAI | `text-embedding-3-large` | 3072 (truncável via `dimensions`) | Suporta Matryoshka — truncar para 512/1024/1536 mantém boa qualidade. |
| Gemini | `text-embedding-004` | 768 | Estável, barato. |
| Gemini | `gemini-embedding-001` | até 3072 | Configurável. |
| Cohere / Voyage / Jina | — | varia | Alternativas; Voyage forte em retrieval especializado. |

- **Normalizar** vetores quando usar inner product. Cosine ignora magnitude. Alguns providers já normalizam (OpenAI sim, Gemini sim por default).
- **Quantization no app**: Matryoshka (truncar dims), depois cast para `halfvec` ou `bit` para storage.
- **Versionar provider + modelo + dimensão** em coluna de metadado — misturar embedding spaces é silently wrong.

## TypeScript

Referencie `@stacks/language/typescript@6` e `@stacks/database/postgres`.

**Drizzle** (pgvector adapter):
```ts
import { pgTable, vector } from 'drizzle-orm/pg-core';

export const chunks = pgTable('chunks', {
  id: uuid().primaryKey(),
  embedding: vector('embedding', { dimensions: 1536 }),
});
```

**Postgres.js**:
```ts
const v = [0.1, 0.2, /* ... */];
await sql`INSERT INTO chunks (embedding) VALUES (${JSON.stringify(v)}::vector)`;
```

**Prisma**: usar `previewFeatures = ["postgresqlExtensions"]` + extension `vector`. Tipo no client é `Unsupported`; queries vetoriais via `$queryRaw`.

App-side: tipar como `number[]`. Conversão para literal `[v1,v2,...]` no driver quando necessário.

## Integração com AI SDKs

- **Vercel AI SDK** (`@stacks/ai/vercel-ai-sdk`): `embed` / `embedMany` para gerar; insert direto na tabela; ANN query antes de `generateText`/`streamText` em pipelines RAG.
- **Mastra** (`@stacks/ai/mastra-sdk`): pgvector é vector store nativo para memory e RAG. Usar quando o agent já está em Mastra.

## Performance

Referencie `@rules/performance`.

- **Memory footprint**:
  - `vector(1536)` float32 = ~6KB por linha. Índice HNSW adiciona ~1.5x.
  - `halfvec(1536)` = ~3KB por linha. Índice ~metade.
  - `bit(1536)` = 192B por linha.
- `maintenance_work_mem`: subir durante build de índice (e.g., 2GB+).
- `effective_cache_size`: alinhar com RAM real disponível ao Postgres.
- `hnsw.ef_search`: ajustar por sessão/query baseado em SLO de latency × recall.
- VACUUM e REINDEX em tabelas com alta volatilidade (updates de embedding fragmentam o grafo HNSW).

## Migrations

Referencie `@rules/migration`.

- **Sempre** `CONCURRENTLY` em produção para `CREATE INDEX` e `REINDEX`.
- **Re-embedding** ao trocar provider/modelo/dimensão:
  1. Adicionar nova coluna `embedding_v2 vector(N)` ou nova tabela.
  2. Backfill em batches (job idempotente).
  3. Build de índice CONCURRENTLY.
  4. Swap atomic (rename) ou cut over de leitura via feature flag.
  5. Drop coluna/tabela antiga.

## Quando usar pgvector

| Use pgvector quando | Use vector DB dedicada quando |
|---|---|
| Transações ACID com dados relacionais. | >10M vetores ativos com SLO agressivo. |
| JOIN com metadados, filtros relacionais ricos. | Multi-region replication com SLA. |
| Multi-tenancy via RLS já estabelecido. | Multi-vector, ColBERT, learned sparse maduros. |
| Menos infra para operar. | Features de gerenciamento de namespace nativas. |
| <5-10M vetores e/ou crescimento previsível. | Casos onde Postgres já é gargalo separado. |

## Observabilidade

Referencie `@rules/observability`.

- `EXPLAIN (ANALYZE, BUFFERS)` em queries ANN para confirmar uso do índice (procurar `Index Scan using ... hnsw`).
- `pg_stat_statements`: monitorar top queries vetoriais.
- **Recall monitoring**: amostra periódica comparando resultado ANN vs brute-force (`SET enable_indexscan = off` em query de comparação). Drift de recall indica necessidade de tunar `ef_search` ou rebuild.

## Anti-patterns

- Operator class do índice que não casa com operador da query (ex: `vector_l2_ops` para queries com `<=>`). O índice existe mas nunca é usado.
- Criar IVFFlat em tabela quase vazia — clusters inúteis, recall ruim sem rebuild.
- HNSW com `ef_search` default em casos que exigem recall alto.
- Filtered ANN com filtro muito seletivo sem partial index ou iterative scan.
- Usar `vector(3072)` quando `vector(768)` ou Matryoshka truncado para 1024 atendem — storage e latency pagam o preço.
- Inner product sem normalizar vetores — ranking matematicamente errado.
- Re-embeddar sem versionar provider/modelo/dim — embedding spaces misturados, retrieval silenciosamente quebrado.
- Storage em float32 quando `halfvec` ou binary quantization atendem a precisão alvo.
- `CREATE INDEX` sem `CONCURRENTLY` em produção — lock de tabela.
- Esquecer `CREATE EXTENSION vector;` em CI/CD e ambientes de preview.
- Coluna `vector(N)` única recebendo embeddings de dimensões diferentes via union/views — impede índice e degrada qualidade.
- Confiar 100% em ANN sem re-rank exato para queries críticas (legal, financeiro, médico).

## Referências

- https://github.com/pgvector/pgvector
- https://supabase.com/docs/guides/ai
- https://neon.tech/docs/extensions/pgvector
- Convenções de modelagem do projeto: `@contracts/pgvector`
- Postgres base: `@stacks/database/postgres`
- Geração de embeddings: `@stacks/ai/vercel-ai-sdk`, `@stacks/ai/mastra-sdk`
- Migrations, performance, observability: `@rules/migration`, `@rules/performance`, `@rules/observability`
