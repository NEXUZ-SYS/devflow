---
id: std-data-modeling
description: Modelos com identidade explícita, nullability intencional e tipos fortes
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

- Distinga entidade (tem identidade própria, ciclo de vida) de value object (definido por atributos, imutável)
- IDs opacos: prefira ULID (ordenável) ou UUID v4 (privacidade); nunca auto-increment exposto externamente; gere o ID no domínio antes de persistir
- Branded types para identificadores: `UserId` e `OrderId` não são intercambiáveis mesmo sendo ambos `string`
- Toda tabela/coleção tem `id`, `created_at`, `updated_at`; soft-delete via `deleted_at` apenas quando há requisito real de auditoria
- Nullability é decisão consciente: `null` significa "ausente por design"; nunca use string vazia, `0` ou `-1` como sentinel de "ausente"
- Normalize por padrão (cada fato em um único lugar); desnormalize apenas com motivo declarado e mensurável
- Declare explicitamente quando campo desnormalizado é snapshot imutável vs cache atualizável — são estratégias diferentes
- Valores monetários em centavos (`bigint`) ou `numeric(precision,scale)`; nunca `float` para dinheiro
- Foreign keys sempre têm índice; `ON DELETE` definido explicitamente em toda FK

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `float` para dinheiro | `bigint` centavos ou `numeric(18,4)` |
| Auto-increment exposto em URL pública | ULID ou UUID opaco |
| `string` cru para identificador de domínio | Branded type (`UserId`, `OrderId`) |
| `""` ou `-1` para "valor ausente" | `null` com significado documentado |
| FK sem índice | `CREATE INDEX ON table(fk_column)` |
| Desnormalização "por precaução" | Normalize primeiro; desnormalize com dado de leitura |
| Campo `data jsonb` polimórfico sem schema | Modelar ou validar shape com Zod ao ler |
