---
title: BigQuery
category: database
status: active
last_updated: 2026-05-20
upstream: https://cloud.google.com/bigquery/docs
sdks:
  - "@google-cloud/bigquery"
  - "@google-cloud/bigquery-storage"
  - googleapis (REST)
  - bq CLI
---

# BigQuery

Manual operacional do BigQuery como **tecnologia/SDK** no projeto. Convenções de modelagem (datasets, naming, partitioning, clustering, schema design) ficam em `@contracts/bigquery` — este documento foca em **como usar o SDK, autenticar, executar queries, ingerir dados, controlar custo e integrar com o resto do stack**.

## O que é

BigQuery é o **data warehouse analítico serverless** do GCP. Storage colunar, execução massivamente paralela (Dremel/Capacitor), escala de TB-PB sem provisionamento, billing por bytes scaneados ou slots reservados.

**Posicionamento no projeto:**

- **OLAP only.** Latência típica de query: segundos a dezenas de segundos. Não é OLTP — qualquer serving de baixa latência permanece em `@stacks/database/postgres` (transacional) ou `@stacks/database/firebase-firestore` (documental real-time).
- **Destino analítico universal:** sink de domain events (`@contracts/events`), CDC do Postgres, exports do Firestore, telemetria de IA (`@stacks/ai/harness-engineering`), audit logs.
- **Engine de transformação:** SQL declarativo + Dataform/dbt para pipelines versionados.
- **Vector search em escala warehouse** via `VECTOR_SEARCH`; serving online de embeddings continua em `@stacks/database/pgvector`.

## SDKs e clients

| Client | Quando usar |
|---|---|
| `@google-cloud/bigquery` | Default em Node/TS. Query, jobs, dataset/table management. |
| `@google-cloud/bigquery-storage` | Storage Write API (gRPC) — ingestion eficiente em alto volume. |
| `googleapis` (REST) | Operações administrativas não cobertas pelo client tipado. |
| `bq` CLI | Ops manual, debug, migrations ad-hoc, scripts de CI. |

### Instanciação canônica

```ts
import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
  // Em GCP: omitir keyFilename — usa metadata server / ADC
  // Local dev: GOOGLE_APPLICATION_CREDENTIALS aponta para JSON
  // CI/CD: Workload Identity Federation (sem JSON)
  location: 'US', // default; sobrescrever quando dataset for multi-region específico
});
```

## Autenticação

Ver regras em `@rules/security` e convenções em `@contracts/secrets`.

- **GCP runtime** (Cloud Run, Cloud Functions, GCE, GKE): metadata server fornece ADC automaticamente. Não passe `keyFilename`.
- **Local dev:** `gcloud auth application-default login` ou `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`.
- **CI/CD:** **Workload Identity Federation** (preferred) — autentica via OIDC do provider de CI sem long-lived keys. Nunca commitar JSON de service account.
- **Service accounts:** least-privilege estrito. Roles típicos:
  - `roles/bigquery.dataViewer` — leitura em dataset específico
  - `roles/bigquery.dataEditor` — escrita em dataset específico
  - `roles/bigquery.jobUser` — submeter jobs (no nível do projeto)
  - `roles/bigquery.metadataViewer` — apenas schema
  - **Evite** `roles/bigquery.admin` fora de contexto administrativo.

## Query API

### Padrão canônico (parameterized + Standard SQL)

```ts
const [rows] = await bq.query({
  query: `
    SELECT user_id, COUNT(*) AS events
    FROM \`${projectId}.events.domain_events\`
    WHERE event_date BETWEEN @from AND @to
      AND tenant_id = @tenant
    GROUP BY user_id
  `,
  params: { from: '2026-05-01', to: '2026-05-20', tenant: 'acme' },
  types: { from: 'DATE', to: 'DATE', tenant: 'STRING' },
  useLegacySql: false,    // sempre
  useQueryCache: true,    // default; mantenha
  location: 'US',
});
```

**Regras de uso do client de query:**

- **Sempre `useLegacySql: false`.** Legacy SQL é deprecated e tem semântica diferente (joins, types, escaping).
- **Sempre parameterized queries** quando há input dinâmico — previne SQL injection. Use `@named` params (preferred) ou `?` posicional.
- **`useQueryCache: true`** (default). Cache de 24h é gratuito para queries determinísticas idênticas. Só desabilite em queries explicitamente não-determinísticas (`CURRENT_TIMESTAMP()`, `RAND()`).
- **`dryRun: true` antes de queries pesadas em dev/prod** — retorna `totalBytesProcessed` estimado sem executar nem cobrar.
  ```ts
  const [job] = await bq.createQueryJob({ query, dryRun: true });
  const bytes = Number(job.metadata.statistics.totalBytesProcessed);
  ```
- **`location` explícito** quando dataset não está em multi-region default. Datasets têm location **imutável** — query precisa bater na location correta.
- **`maximumBytesBilled`** como guard rail em queries de usuário ou ad-hoc:
  ```ts
  await bq.query({ query, maximumBytesBilled: '10000000000' }); // 10 GB cap
  ```
- **Job vs query inline:** `bq.query()` cria job síncrono e aguarda. Para jobs longos, `createQueryJob()` + polling.

### Result handling

- `getRows()` paginado retorna `BigQueryDate`, `BigQueryTimestamp`, `BigQueryDatetime`, `Big` (numeric) — não strings nem `Date` nativos. Converta explicitamente quando serializar para fronteiras externas (ver `@contracts/bigquery`).
- Para resultados grandes, prefira **extract job para GCS** em vez de pull cliente.

## Ingestion

Quatro caminhos, escolha por volume e latência:

| Método | Latência | Custo | Quando usar |
|---|---|---|---|
| **Load jobs** (`table.load(gcsUri, opts)`) | minutos | grátis | Batch de GCS (CSV/JSON/Avro/Parquet/ORC). **Default para batch.** |
| **Storage Write API** (`@google-cloud/bigquery-storage`) | sub-segundo | barato | Streaming alto volume, exactly-once com offsets. **Default para streaming.** |
| **Streaming inserts** (`table.insert(rows)`) | sub-segundo | $0.01/200MB | Legacy; só se Storage Write não couber. Caro em volume. |
| **Federated query / external tables** | query-time | scan cost | GCS/Drive/Cloud SQL/Bigtable lidos in-place. **Nunca em hot path.** |

```ts
// Load job (batch, gratuito)
await bq.dataset('events').table('domain_events').load('gs://bucket/path/*.parquet', {
  sourceFormat: 'PARQUET',
  writeDisposition: 'WRITE_APPEND',
  schemaUpdateOptions: ['ALLOW_FIELD_ADDITION'],
});
```

```ts
// Storage Write API (streaming, eficiente)
import { BigQueryWriteClient } from '@google-cloud/bigquery-storage';
// Use default stream para append-only; committed stream para exactly-once.
```

## Table types

- **Native tables** — storage gerenciado, default.
- **External tables** — apontam para GCS/Drive/Bigtable/Sheets; sem storage cost, mas scan cost a cada query. Útil para data lake patterns.
- **Materialized views** — refresh incremental automático; cobrança normal de storage + custo do refresh. **Não é cache de serving** — latência ainda é de OLAP.
- **Authorized views** — expõem subset/derivação para outros projetos sem dar `dataViewer` na tabela base. Padrão para data sharing intra-org.
- **Snapshots** — copy-on-write read-only em ponto no tempo. Backup/DR.

## Partitioning e clustering

Definidos no DDL e governados em `@contracts/bigquery`. Uso operacional aqui:

- **Sempre filtrar pelo partition column** em tabelas grandes — sem isso, full scan e custo explode.
- Verifique scan reduction via `dryRun` antes de promover query a produção.
- Clustering reduz scan adicional dentro de partição; benefício depende de seletividade.

## Dataform e dbt

Transformações analíticas devem ser versionadas, não ad-hoc:

- **Dataform** (nativo no GCP): models SQL versionados em git, dependency graph, asserts (tests), lineage. Integra com Cloud Composer/Workflows. Default recomendado.
- **dbt** (Core ou Cloud): equivalente, ecossistema maior, multi-warehouse. Use se time já tem dbt em outro warehouse.
- Specs de transformação seguem `@practices/sdd` — modelo declarado antes do SQL.
- **Scheduled queries** (nativo, sem Dataform): tolerável para jobs isolados sem dependências. Não use para pipelines com lineage.

## BigQuery ML

Treina modelos via SQL. Use para:

- `ML.PREDICT` sobre modelos simples (logistic regression, kmeans, ARIMA_PLUS) onde o overhead de Vertex AI não compensa.
- `ML.GENERATE_EMBEDDING` para embeddings em massa via modelo Vertex remoto.
- Forecasting de séries temporais batch.

**Não substitui Vertex AI** para training pesado, fine-tuning ou serving online de baixa latência.

## Vector search

```sql
CREATE VECTOR INDEX my_index
ON `project.dataset.table`(embedding)
OPTIONS(index_type='IVF', distance_type='COSINE');

SELECT base.* FROM VECTOR_SEARCH(
  TABLE `project.dataset.table`, 'embedding',
  (SELECT @query_embedding AS embedding),
  top_k => 10
);
```

- Vector search em BQ é para **escala warehouse** (milhões+ de vetores, ANN aproximado, latência OLAP).
- **Serving online** (sub-100ms, top-K em request HTTP) permanece em `@stacks/database/pgvector`.

## Custos

Ver guard rails em `@rules/performance`.

| Item | Modelo |
|---|---|
| **On-demand query** | ~$5/TB scaneado (varia por região). Cobra mínimo de 10 MB por query. |
| **Capacity (Reservations)** | Slots dedicados — `autoscaling` ou `pay-as-you-go`. Preferred quando carga é previsível e alta. |
| **Active storage** | ~$0.02/GiB/mês. |
| **Long-term storage** | ~$0.01/GiB/mês (partição sem write há >90 dias). Automático. |
| **Streaming inserts** | $0.01/200MB. Caro em volume. |
| **Storage Write API** | Muito mais barato que streaming inserts. |
| **Result cache** | Gratuito (24h). |

**Práticas operacionais de custo:**

- `dryRun` obrigatório antes de query nova em prod.
- `maximumBytesBilled` em endpoints que aceitam input de usuário.
- `INFORMATION_SCHEMA.JOBS_BY_PROJECT` para auditoria de jobs caros (top scanners, top users).
- Particione e cluster; force filtros nos partition columns via row-level access policies quando aplicável.

## Observabilidade

Ver `@rules/observability`.

- **`INFORMATION_SCHEMA.JOBS_BY_USER` / `JOBS_BY_PROJECT` / `JOBS_BY_ORGANIZATION`** — auditoria de execução: bytes, slot-ms, error, user.
- **Cloud Monitoring** — métricas de slots, query count, storage por dataset.
- **Audit logs em dataset próprio** — habilitar sink de Cloud Logging para `audit_logs` dataset; reter para forense de acesso.
- **Query plan / execution graph** disponível no console e via `getQueryResults` metadata para diagnosticar skew.

## Backup e DR

- **Time travel** — query no estado de até 7 dias atrás (`FOR SYSTEM_TIME AS OF`). Configurável até 90 dias via `max_time_travel_hours` no dataset.
- **Snapshots** — `CREATE SNAPSHOT TABLE ... CLONE ...`. Read-only, sem custo de storage até divergir do source.
- **Cross-region replication** — não nativa; implemente via scheduled copy jobs ou Dataform.
- Location do dataset é **imutável** — escolha consciente para LGPD e DR (ver `@rules/governance`).

## Local dev e testing

Não há emulator oficial robusto.

| Opção | Comentário |
|---|---|
| **Sandbox project no GCP** | Free tier (10 GB storage, 1 TB query/mês). Default para integration tests. |
| **Test dataset isolado** | Dataset `test_<feature>` no projeto de dev, com TTL via `defaultTableExpirationMs`. |
| **DuckDB** | Boa fidelidade de Standard SQL para unit tests de SQL puro. Não cobre features BQ-específicas (DML scripting, scripting, ML). |
| **Mock client** | Aceitável para testes que só verificam que o SQL/params certos foram construídos. Não substitui integration. |

## Integração no projeto

- **Domain events sink** — Pub/Sub → BQ subscription (managed) ou Dataflow (transform + sink). Eventos em `@contracts/events`.
- **AI observability** — tabela `ai_observability.llm_calls` populada via Storage Write API a partir de `@stacks/ai/harness-engineering`.
- **Postgres CDC** — Datastream conecta Cloud SQL/Postgres → BQ, sync near-real-time para analytics. Hot path serving continua no Postgres.
- **Firestore exports** — `firestore export` scheduled → GCS → BQ load. Não use streaming Firestore→BQ em hot path.

## Schema migrations

Ver `@rules/migration`.

- DDL via Dataform (preferred) ou Terraform `google_bigquery_table` / `google_bigquery_dataset`. `bq mk`/`bq update` apenas em ops manual.
- **Forward-only**: adicione coluna nova, deprecate a antiga, drope depois. Nunca rename in-place de coluna em tabela com volume — recrie + backfill.
- BQ aceita add column e relax `REQUIRED → NULLABLE`; recusa rename, type change incompatível, drop column sem `ALTER TABLE DROP COLUMN` explícito (com janela de time travel).

## Anti-patterns

Foco em uso de SDK e operação. Modelagem (naming, partition strategy, schema design) em `@contracts/bigquery`.

- `useLegacySql: true` em qualquer query nova.
- Submeter query grande em dev/prod sem `dryRun` prévio.
- Streaming inserts (`table.insert`) para batch — use Storage Write API ou load job.
- `SELECT *` em tabela ampla quando só algumas colunas são necessárias — storage colunar significa que colunas selecionadas dominam custo.
- String concatenation para montar WHERE em vez de parameterized queries — SQL injection.
- Federated query (external table) em hot path com SLA — latência imprevisível.
- Query em tabela particionada sem filtro no partition column — full scan.
- Long-lived service account keys em CI/CD — use Workload Identity Federation.
- Sem `maximumBytesBilled` em queries que aceitam input de usuário.
- Sem audit log sink configurado para o dataset.
- Dataset em região errada para a base de usuários (cross-region egress, residency LGPD em risco).
- Misturar OLTP serving com BQ — latência mínima de segundos é incompatível com request-response do usuário.
- Materialized view tratada como cache de serving — refresh não é instantâneo e ainda é OLAP.
- Desabilitar `useQueryCache` por hábito — perde os 24h gratuitos.
- `roles/bigquery.admin` para workload de aplicação — sempre least-privilege.
- Dataform/dbt opcionalmente bypassado com SQL ad-hoc em prod — perde lineage e versionamento.

## Referências cruzadas

- Modelagem (naming, datasets, partition/clustering, schema): `@contracts/bigquery`
- OLTP relacional: `@stacks/database/postgres`
- Documental real-time: `@stacks/database/firebase-firestore`
- Serving de vetores online: `@stacks/database/pgvector`
- Telemetria de IA que aterrissa em BQ: `@stacks/ai/harness-engineering`
- Contratos de eventos sink: `@contracts/events`
- Convenções de segredos / ADC: `@contracts/secrets`
- Auth e least-privilege: `@rules/security`
- Audit log / metrics: `@rules/observability`
- `dryRun`, `maximumBytesBilled`, partition filters: `@rules/performance`
- Forward-only schema evolution: `@rules/migration`
- Region / LGPD / residency: `@rules/governance`
- Specs antes de transformações Dataform/dbt: `@practices/sdd`
