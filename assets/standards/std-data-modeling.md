---
id: std-data-modeling
description: Modelos com identidade explícita, nullability intencional e tipos fortes
version: 1.2.0
source: devflow-default
applyTo: ["**/*.{sql,ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-data-modeling.js
---
## Princípios

- Distinga entidade (tem identidade própria, ciclo de vida) de value object (definido por atributos, imutável)
- IDs opacos: prefira ULID (ordenável) ou UUID v4 (privacidade); nunca auto-increment exposto externamente; gere o ID no domínio antes de persistir
- Branded types para identificadores: `UserId` e `OrderId` não são intercambiáveis mesmo sendo ambos `string`
- Toda tabela/coleção tem `id`, `created_at`, `updated_at`; soft-delete via `deleted_at` apenas quando há requisito real de auditoria
- Nullability é decisão consciente: `null` significa "ausente por design"; nunca use string vazia, `0` ou `-1` como sentinel de "ausente"
- Normalize por padrão (cada fato em um único lugar); desnormalize apenas com motivo declarado e mensurável
- Declare explicitamente quando campo desnormalizado é snapshot imutável vs cache atualizável — são estratégias diferentes
- Valores monetários em centavos (`bigint`) ou `numeric(precision,scale)`; nunca `float`, `real` ou `double precision` para dinheiro — perda de precisão é certa
- Toda coluna temporal usa `TIMESTAMPTZ` (armazena UTC, converte na borda); `TIMESTAMP` sem timezone interpreta no fuso da sessão silenciosamente
- Texto sem limite real do domínio usa `TEXT`; `VARCHAR(n)` por hábito não dá ganho em Postgres e gera migration dolorosa quando o domínio cresce
- PK é `UUID`/`ULID` opaco gerado no domínio; nunca `BIGSERIAL`/`SERIAL` sequencial exposto via API (vaza ordem e volume)
- Estado mutuamente exclusivo é enum/union único, nunca múltiplos booleanos (`isActive` + `isPending` + `isCancelled`)
- Foreign keys sempre têm índice; `ON DELETE` definido explicitamente em toda FK

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `float`/`real`/`double precision` para dinheiro | `numeric(18,4)` ou `bigint` centavos |
| `TIMESTAMP` sem timezone | `TIMESTAMPTZ` (UTC, converte na borda) |
| `VARCHAR(255)` por hábito | `TEXT` (+ `CHECK` se há invariante real) |
| `BIGSERIAL`/`SERIAL` como PK exposto | `UUID`/`ULID` opaco gerado no domínio |
| Booleano negativo (`is_not_active`) | Enum/union único de estado |
| `string` cru para identificador de domínio | Branded type (`UserId`, `OrderId`) |
| `""` ou `-1` para "valor ausente" | `null` com significado documentado |
| FK sem índice | `CREATE INDEX ON table(fk_column)` |
| Campo `data jsonb` polimórfico sem schema | Modelar ou validar shape com Zod ao ler |
