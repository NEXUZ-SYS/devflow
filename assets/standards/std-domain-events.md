---
id: std-domain-events
description: Eventos de domínio com nome no passado, payload versionado e imutável
version: 1.0.0
source: devflow-default
applyTo: ["src/**/*.ts"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-domain-events.js
---
## Princípios

- Evento descreve um fato ocorrido: nome no passado, formato `<Domínio>.<Entidade><Ação>Ocorreu` (ex.: `Pagamento.CobrancaAprovadaOcorreu`)
- Payload obrigatório: `eventId`, `occurredAt`, `version`, `aggregateId` + os dados imutáveis do momento do fato
- Eventos nunca carregam referências mutáveis nem entidades vivas — só os dados do momento da ocorrência (snapshot)
- Schemas são versionados (`v1`, `v2`); quebra de schema publica nova versão em paralelo e mantém consumidores antigos por período de deprecação
- Evento é imutável e append-only: nunca editar nem deletar um evento publicado
- O produtor não conhece os consumidores; o contrato do evento é a fronteira pública
- Idempotência no consumidor: dedup por `eventId`; o mesmo evento pode ser entregue mais de uma vez

## Anti-patterns

| Errado | Corrija para |
|---|---|
| Nome no imperativo/presente (`ProcessarPagamento`) | Nome no passado (`PagamentoProcessadoOcorreu`) |
| `publish({ type, orderId })` sem `version` | Incluir `eventId`, `version`, `occurredAt`, `aggregateId` |
| Payload com referência mutável (entidade viva) | Snapshot imutável dos dados do momento |
| Quebrar schema de evento existente | Publicar `v2` em paralelo; deprecar `v1` com prazo |
| Editar/deletar evento já publicado | Append-only; publicar evento corretivo |
