---
title: PostgreSQL
version: 16.x
last_updated: 2026-05-20
status: current
upstream: https://www.postgresql.org/docs/16/
---

# PostgreSQL 16

> RDBMS principal do projeto. Este documento cobre **a tecnologia**: versão pinada, capacidades, extensões, drivers, ferramentas e integrações. Convenções de modelagem (naming de tabelas/colunas, audit fields, soft-delete, identificadores) vivem em `@contracts/postgres`. Embeddings/ANN vivem em `@stacks/database/pgvector`.

## Versão alvo

- **Pinned**: PostgreSQL **16.x** (atualizar minor versions de manutenção sem cerimônia).
- **Postgres 17** está disponível (setembro/2024). Avaliar upgrade quando o ecossistema de provedores gerenciados (Neon, Supabase, Cloud SQL, RDS) e drivers (Drizzle, postgres.js) confirmarem suporte estável em GA — não migrar precocemente.
- **Não suportadas no projeto**: < 15. Migrações de bases legadas devem ser planejadas como evento dedicado, não incremental.

### Postgres 16 — o que importa

- **SQL/JSON improvements**: novos construtores (`JSON_ARRAY`, `JSON_OBJECT`, `JSON_ARRAYAGG`) e predicados padronizados.
- **`pg_stat_io`**: visão granular de I/O por backend/contexto — usar para diagnóstico de hot spots (ver `@rules/observability`).
- **Logical replication on standby**: possibilita publicar a partir de réplicas.
- **Parallel `VACUUM`**: redução de janela de manutenção em tabelas grandes.
- **ICU como collation default**: cuidado em comparações case/accent-sensitive se herdar bases antigas com `libc`.

## Capacidades core relevantes

### Transações e concorrência

- ACID + MVCC nativos.
- Isolation levels disponíveis: `READ COMMITTED` (default), `REPEATABLE READ`, `SERIALIZABLE`.
- Use `SERIALIZABLE` quando houver invariante de negócio cruzando múltiplas linhas/tabelas; aceite serialization failure e faça retry idempotente.
- `SELECT ... FOR UPDATE SKIP LOCKED` para padrões de fila leves sem broker externo.

### Tipos nativos a usar

- `text` (não `varchar(n)` arbitrário).
- `timestamptz` **sempre** (nunca `timestamp` sem timezone).
- `uuid` para PKs (ver `@contracts/postgres`).
- `numeric(p,s)` para money e quantias financeiras (nunca `float`/`double precision`).
- `boolean`, `inet`/`cidr`, `interval`, `daterange`/`tstzrange`.
- `jsonb` (preferir sobre `json` — armazenamento binário, indexável).
- Arrays nativos (`text[]`, `uuid[]`) quando semântica de conjunto pequeno e bounded.
- `enum` apenas quando o domínio é estável; do contrário, lookup table.

### JSONB

Operadores essenciais:

```sql
SELECT data->'user'->>'email' AS email FROM events;
SELECT * FROM events WHERE data @> '{"type":"signup"}';
SELECT * FROM events WHERE data ? 'flagged';
SELECT * FROM events, jsonb_path_query(data, '$.items[*] ? (@.price > 100)') AS hit;
```

Indexação:

```sql
CREATE INDEX events_data_gin ON events USING GIN (data jsonb_path_ops);
```

`jsonb_path_ops` é menor e mais rápido que GIN default quando só se usa `@>`.

### CTEs, window e LATERAL

- CTEs **não são materializadas por padrão** em Postgres 12+ — use `WITH ... AS MATERIALIZED` quando quiser barreira de otimização explícita.
- Window functions (`row_number()`, `lag()`, `percentile_cont`) para analytics inline.
- `LATERAL` para correlacionar subqueries (top-N-per-group).

### Generated columns, partial e expression indexes

```sql
ALTER TABLE invoices ADD COLUMN total_brl numeric(12,2)
  GENERATED ALWAYS AS (subtotal + tax) STORED;

CREATE INDEX users_active_email_idx ON users (email)
  WHERE deleted_at IS NULL;

CREATE INDEX users_lower_email_idx ON users (lower(email));
```

### Triggers, funções e procedures

- PL/pgSQL para lógica de integridade que **não pode vazar** para a app (audit trail, derivações invariantes).
- Evite lógica de negócio em triggers — mantenha no domínio (ver `@rules/data-modeling`).

### LISTEN/NOTIFY

Pub-sub leve dentro do Postgres. Útil para invalidação de cache local em apps single-region. **Não substitui** broker (Pub/Sub, SQS) para fan-out durável.

### Particionamento

Declarative partitioning (`PARTITION BY RANGE/LIST/HASH`). Avaliar quando uma tabela passa ~100M linhas ou tem retention window óbvio (logs, events). Não particionar prematuramente.

### Full-text search

```sql
ALTER TABLE articles ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', title || ' ' || body)) STORED;

CREATE INDEX articles_tsv_idx ON articles USING GIN (tsv);

SELECT * FROM articles WHERE tsv @@ plainto_tsquery('portuguese', 'pagamento atrasado');
```

Para busca semântica, ver `@stacks/database/pgvector`.

### Row-Level Security (RLS)

Habilitada em tabelas multi-tenant. Define policies por role/sessão; combina com `SET LOCAL app.tenant_id = ...` no início de cada transação. Ver `@rules/security`.

### Constraints

`FOREIGN KEY`, `CHECK`, `UNIQUE`, `EXCLUSION` (com `gist` — útil para evitar overlap de ranges, reservas, agendamentos). Constraints de integridade **moram no banco**, não apenas na app.

## Extensões essenciais

Habilitadas via `CREATE EXTENSION IF NOT EXISTS <ext>` em migration dedicada.

| Extensão | Uso | Notas |
|---|---|---|
| `pgvector` | Embeddings, ANN | Ver `@stacks/database/pgvector` |
| `pgcrypto` | `gen_random_uuid()`, hashing | Postgres 13+ já expõe `gen_random_uuid()` nativo, mas `pgcrypto` adiciona `digest`, `crypt` |
| `citext` | Texto case-insensitive | Útil para emails sem `lower()` em toda query |
| `pg_trgm` | Trigram / fuzzy search | Combine com GIN/GiST para `LIKE '%foo%'` performático |
| `pg_stat_statements` | Top queries por tempo/IO | Mandatory em produção; ver `@rules/observability` |
| `pgaudit` | Audit log estruturado | Quando compliance exigir trilha de DDL/DML |
| `unaccent` | Busca sem acento | Combine com FTS |

**Legacy — não usar em código novo**:

- `uuid-ossp` → preferir `gen_random_uuid()` (nativo / `pgcrypto`).
- `hstore` → preferir `jsonb`.

## Índices

| Tipo | Quando usar |
|---|---|
| B-tree | Default. Igualdade, range, ORDER BY |
| GIN | JSONB, arrays, tsvector, trigram |
| GiST | Geometria, ranges, exclusion constraints |
| BRIN | Tabelas grandes com correlação física (timestamps append-only) |
| Hash | Igualdade pura em valores grandes; raramente justificado vs B-tree |
| SP-GiST | Estruturas não balanceadas (quadtree, radix) |

**Disciplinas**:

- **`CREATE INDEX CONCURRENTLY` sempre em produção.** `DROP INDEX CONCURRENTLY` idem. Ver `@rules/migration`.
- Partial indexes (`WHERE deleted_at IS NULL`) cobrem o caso quente sem inchaço.
- Covering indexes (`INCLUDE (col1, col2)`) habilitam index-only scans.
- Antes de criar índice: `EXPLAIN (ANALYZE, BUFFERS)` provando que o planner usaria. Ver `@rules/performance`.

## Drivers Node.js

### `postgres` (porsager/postgres) — **recomendado**

Driver moderno, TS-first, tagged template literals com escape automático, streaming, transactions, listen/notify.

```typescript
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: 'require',
});

const users = await sql<User[]>`
  SELECT id, email FROM users WHERE active = ${true}
`;
```

Tagged templates parametrizam automaticamente — **nunca** concatenar strings.

### `pg` (node-postgres)

Maduro, ecossistema amplo, base de Drizzle/Prisma/Kysely quando configurados sobre TCP. Mais verboso que `postgres`. Continua válido para libs que dependem dele.

### Edge / serverless

- **`@neondatabase/serverless`**: driver HTTP para Neon. Funciona em edge runtimes (Vercel Edge, Cloudflare Workers) onde TCP não é viável.
- **`@vercel/postgres`**: wrapper sobre Neon serverless.

Use **somente em edge runtime**. Em Node runtime padrão, prefira `postgres` + pooler.

## ORMs e query builders

### Drizzle ORM — **recomendado** para apps novos

- TS-first, schema declarado em TS, SQL-like.
- Migrations via `drizzle-kit generate` + `drizzle-kit migrate`.
- Bundle pequeno; sem engine binary.
- Tipos inferidos: `typeof users.$inferSelect`, `typeof users.$inferInsert`.

```typescript
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
```

### Alternativas

| Ferramenta | Quando |
|---|---|
| **Prisma** | Quando o time já depende dele; cuidado com engine binary e bundle em edge/Functions |
| **Kysely** | Query builder type-safe puro, sem ORM, sem migrations próprias |
| **Knex** | Legacy; manter, não adotar |
| **TypeORM** | **Não recomendado** para código novo (decorators, runtime quirks) |

**Em hotspots críticos**, escreva SQL puro via `postgres` ou `sql\`...\`` do Drizzle. ORM não é dogma.

## Connection pooling

- **TCP runtime**: `postgres`/`pg` mantém pool por processo. Defina `max` proporcional ao orçamento de conexões do banco e ao número de processos.
- **Em produção**: **PgBouncer em transaction mode** ou pooler do provedor (Supabase pooler, Neon pooler, RDS Proxy, Cloud SQL Auth Proxy). Em transaction mode, **prepared statements globais não funcionam** — drivers modernos têm fallback (postgres.js: `prepare: false`).
- **Em Functions/Lambda/edge**: connection budget é minúsculo por instância. Pooler é **mandatory**, ou use HTTP driver serverless. Ver `@stacks/backend/firebase-functions`.

## Migrations

Ver `@rules/migration` para a doutrina; ferramentas neste projeto:

- **Drizzle Kit** quando Drizzle for o ORM (padrão).
- **Atlas**, **Sqitch**, **Flyway**, **node-pg-migrate** como alternativas legítimas.

Princípios técnicos da ferramenta:

- Cada migration: forward + (quando viável) reverse.
- DDL idempotente (`IF NOT EXISTS`, `IF EXISTS`) onde o motor permite.
- Expand-and-contract para zero-downtime.
- `NOT NULL` em duas fases: adicionar coluna nullable + default → backfill → `SET NOT NULL`.
- `CREATE INDEX CONCURRENTLY` (não roda dentro de transaction — Drizzle Kit lida; conferir).

## Integração com TypeScript

- Tipos do schema vêm do ORM (Drizzle `$infer*` / Prisma client).
- Na **fronteira HTTP** (request/response), Zod (`@stacks/validation/zod@4`) valida payloads. Tipos de DB e tipos de wire **não são o mesmo objeto**.
- Branded types para IDs (`type UserId = string & { readonly __brand: 'UserId' }`) — referencia `@stacks/language/typescript@6`.

## Integração com Next.js 15

Ver `@stacks/frontend/next@16`.

- Server Components e Server Actions acessam o DB direto. Manter o cliente em módulo singleton no servidor.
- Edge runtime exige driver HTTP (Neon/Vercel) — TCP não é suportado.
- Cuidado com fan-out de conexões em build/ISR — usar pooler.

## Integração com Firebase Functions

Ver `@stacks/backend/firebase-functions`.

- Conectividade: VPC Connector + Cloud SQL, ou Neon/Supabase externos via internet (TLS obrigatório).
- Pool em escopo de módulo (singleton) para reuso entre invocações na mesma instância; cuidado com `max` baixo (cold start cria nova instância, novo pool).
- Pooler externo (PgBouncer/Cloud SQL Auth Proxy) reduz pressão quando Functions escala.

## Performance

Ver `@rules/performance`.

- `EXPLAIN (ANALYZE, BUFFERS)` em qualquer query candidata a hotspot.
- `pg_stat_statements` para identificar top queries por tempo/IO.
- Eliminar N+1 com `JOIN` ou batched queries (`WHERE id = ANY($1::uuid[])`).
- Tuning de `work_mem`, `shared_buffers`, `effective_cache_size` no nível do servidor — geralmente delegado ao provedor gerenciado.
- Autovacuum: ajustar por tabela quente (`autovacuum_vacuum_scale_factor`).

## Observabilidade

Ver `@rules/observability`.

- `pg_stat_statements`, `pg_stat_activity`, `pg_stat_io` (Postgres 16).
- Slow query log (`log_min_duration_statement`).
- OpenTelemetry: `@opentelemetry/instrumentation-pg` (cobre `pg`; `postgres` requer wrapper manual em alguns casos).
- Métricas mínimas: connections ativas/idle, locks, replication lag, cache hit ratio, table/index bloat.

## Backups e DR

- Continuous WAL archiving + base backups periódicos.
- Em provedores gerenciados (Neon, Supabase, Cloud SQL, RDS), backup é configuração — confirmar retenção e PITR.
- **Restore test** periódico — backup não testado é hipótese. Ver `@rules/governance`.

## Security

Ver `@rules/security`.

- TLS obrigatório (`sslmode=require` no mínimo; `verify-full` quando CA disponível).
- Roles least-privilege. App **nunca** usa superuser.
- Credenciais via Secret Manager (ver `@contracts/secrets` quando publicado).
- Connection string fora de logs (mascarar antes de logar erros do driver).
- RLS habilitada em tabelas multi-tenant.
- Parametrização sempre via driver — nunca string concat (`postgres` tagged templates e Drizzle `sql\`\`` já protegem).

## Provedores

Sem prescrição rígida; opções validadas:

| Provedor | Quando |
|---|---|
| **Neon** | Serverless, branching por feature, free tier generoso, edge-friendly |
| **Supabase** | Quando Auth/Storage/Realtime + Postgres em pacote integrado fizer sentido |
| **Cloud SQL** (GCP) | Integração nativa com Firebase Functions/IAM/VPC |
| **AWS RDS / Aurora Postgres** | Stack AWS predominante |
| **Crunchy Bridge** | Enterprise, alta customização, suporte especializado |

## Local dev

- **Docker Compose** com imagem `postgres:16-alpine` + extensions instaladas via `init.sql`.
- Reset via script (`db:reset`); seed via SQL fixtures.
- **testcontainers** para integration tests — banco real efêmero por suíte. Ver `@rules/testing`.

Exemplo mínimo:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: dev
    ports: ['5432:5432']
    volumes:
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql
```

```sql
-- init.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

## Anti-patterns

Foco em tecnologia. Convenções de modelagem ficam em `@contracts/postgres`.

- `varchar(n)` com `n` arbitrário em vez de `text`.
- `timestamp` sem timezone — **sempre** `timestamptz`.
- `serial`/`bigserial` como PK em entidades de domínio (use `uuid` ou ULID `text`).
- `float`/`double precision` para money — use `numeric(p,s)`.
- String concat em SQL (`sql.unsafe('... ' + userInput)`) — sempre parametrizado.
- Connection per request sem pooler em serverless/edge.
- `SELECT *` em hotspots — especifique colunas.
- Criar índice sem `EXPLAIN` prévio comprovando uso.
- `CREATE INDEX` sem `CONCURRENTLY` em produção.
- Migration destrutiva sem reverse quando reverse é viável.
- `UPDATE`/`DELETE` sem `WHERE` (proteção: psql `\set ON_ERROR_STOP on`, `--single-transaction`, sempre testar em staging).
- Confiar só em validação na app — constraints de integridade ficam no banco também.
- Transação longa segurando locks — quebrar em unidades curtas.
- `SELECT ... LIMIT 1` para checar existência — use `EXISTS (...)`.
- Ignorar timezone do servidor — sempre operar em UTC, converter na borda.
- Logar connection string com password.
- Prepared statements globais com PgBouncer em transaction mode (configurar `prepare: false`).

## Referências

- PostgreSQL 16 docs: https://www.postgresql.org/docs/16/
- postgres.js: https://github.com/porsager/postgres
- Drizzle ORM: https://orm.drizzle.team
- pgvector: ver `@stacks/database/pgvector`
- Convenções de modelagem: ver `@contracts/postgres`
