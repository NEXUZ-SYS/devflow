---
id: std-migration
description: Migrações de schema em passos aditivos, idempotentes e reversíveis
version: 1.0.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
weakStandardWarning: true
---
## Princípios

- Sequência obrigatória: expand (adicionar nova forma) → migrate (backfill + dual-read) → contract (remover antiga) — nunca num único passo
- Nunca renomeie, remova ou altere tipo de coluna em uma única release; isso é breaking change disfarçado
- Código novo tolera schema antigo E novo durante a janela de transição; nunca force ordering invisível para o operador
- Toda migration é idempotente: rodar duas vezes produz o mesmo estado; use `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`
- Backfill com critério de filtro que exclua linhas já processadas; persista progresso (checkpoint, last_processed_id) para retomada após falha
- Backfill em batches com `WHERE id BETWEEN $1 AND $2 AND new_column IS NULL`; nunca `UPDATE` sem `WHERE` limitante
- Migrations são passo explícito do pipeline de release, nunca efeito colateral de boot da aplicação
- Documente o plano de rollback no PR antes do deploy; para migrations irreversíveis, declare explicitamente e registre o motivo
- Crie índices com `CONCURRENTLY` para evitar lock em tabelas grandes; nunca dentro de transação

## Anti-patterns

| Errado | Corrija para |
|---|---|
| Renomear coluna em um passo | Adicionar nova + dual-write + backfill + dropar antiga em releases separadas |
| `NOT NULL` sem default em tabela com dados | Adicionar nullable, backfill, depois `NOT NULL` |
| Migration rodada no startup da app | Job dedicado e auditável no pipeline de release |
| Backfill sem `WHERE` filtro de progresso | `WHERE new_column IS NULL LIMIT 1000` em loop |
| `CREATE INDEX` sem `CONCURRENTLY` em produção | `CREATE INDEX CONCURRENTLY` + fora de transação |
| Merge sem plano de rollback documentado | Descrever plano no corpo do PR antes de abrir |
