---
type: adr
name: aws-data-lake
description: AWS Data Lake / Lakehouse — S3+Glue+Athena, formato Parquet, particionamento por data
scope: organizational
source: local
stack: aws
category: infraestrutura
status: Aprovado
created: 2026-04-03
---

# ADR — AWS Data Lake / Lakehouse

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** AWS
- **Categoria:** Infraestrutura

---

## Contexto

Arquitetura Lakehouse combina a flexibilidade de Data Lakes (S3) com a estrutura de Data Warehouses (schema-on-read via Glue Catalog + Athena). Sem padroes, dados ficam desorganizados, queries lentas, e custos explodem.

## Decisao

Adotar arquitetura Lakehouse na AWS com S3 (storage), Glue (catalogacao/ETL), Athena (queries), e formato Parquet como padrao.

## Alternativas Consideradas

- **Data Warehouse puro (Redshift)** — caro, menos flexivel para dados semi-estruturados
- **Data Lake sem catalogo** — dados viram "data swamp"
- **Lakehouse S3+Glue+Athena** — escolhido; custo-beneficio, serverless, escalavel

## Consequencias

- Storage barato e duravel (S3)
- Queries ad-hoc sem provisionar cluster (Athena serverless)
- ETL gerenciado (Glue)
- Requer disciplina de particionamento e formato

## Guardrails

- SEMPRE usar formato Parquet para dados analiticos — NUNCA CSV ou JSON para tabelas de consulta
- SEMPRE particionar dados por data (year/month/day) no S3
- NUNCA criar tabelas no Glue Catalog sem partition keys definidas
- SEMPRE usar compressao Snappy para Parquet (default do ecossistema)
- NUNCA provisionar EMR para jobs que Glue Spark Job resolve
- SEMPRE organizar buckets S3 em camadas: `raw/`, `processed/`, `curated/`
- QUANDO dados raw chegarem em JSON/CSV, ENTAO converter para Parquet na camada processed via Glue Job
- SEMPRE definir schema no Glue Catalog ANTES de fazer queries no Athena

## Enforcement

- [ ] IaC review: tabelas Glue com partition keys
- [ ] CI check: novos uploads S3 usam extensao .parquet (validar no pipeline de ingestao)
- [ ] Code review: ETL jobs produzem Parquet com Snappy
- [ ] Code review: queries Athena usam filtro de particao (evitar full scan)
- [ ] Audit: custos Athena — queries sem filtro de particao geram alerta

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://docs.aws.amazon.com/athena/ |
| Docs externos | https://docs.aws.amazon.com/glue/ |
| ADRs relacionadas | iac-terraform, iac-cdk, least-privilege |

## Evidencias / Anexos

Estrutura de S3:

```
s3://company-data-lake/
├── raw/                    # Dados brutos (JSON, CSV, logs)
│   └── events/
│       └── year=2026/
│           └── month=04/
│               └── day=03/
│                   └── events-001.json.gz
├── processed/              # Dados transformados (Parquet)
│   └── events/
│       └── year=2026/
│           └── month=04/
│               └── day=03/
│                   └── part-00000.parquet
└── curated/                # Dados agregados/modelados
    └── daily_metrics/
        └── year=2026/
            └── month=04/
                └── metrics.parquet
```

Query eficiente no Athena (usa particao):

```sql
-- BOM: filtra por particao
SELECT event_type, count(*)
FROM events
WHERE year = '2026' AND month = '04'
GROUP BY event_type;

-- RUIM: full scan (caro)
SELECT * FROM events;
```
