---
id: std-observability
description: Todo evento relevante emite log estruturado, métrica ou span rastreável
version: 1.2.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-observability.js
---
## Princípios

- Logs são JSON estruturado via logger central (`logger.info/warn/error`); nunca importe `console` em código de runtime
- Nunca use `console.log`/`console.debug`/`console.info` em runtime — apenas em scripts locais e testes (exceção explícita)
- Campos obrigatórios em todo log: `timestamp`, `level`, `message`, `service`, `env`; adicione `traceId`/`requestId` quando disponível
- Níveis: `debug` (dev/troubleshooting), `info` (evento de negócio), `warn` (condição tratada), `error` (falha que requer investigação)
- Propague `traceId` e `spanId` cruzando toda fronteira (HTTP, fila, função) via W3C Trace Context (`traceparent`)
- Métricas RED para serviços: Rate, Errors, Duration; métricas USE para recursos: Utilization, Saturation, Errors
- Mantenha cardinalidade baixa em labels de métricas: nunca use `userId`, `email` ou `requestId` como label
- Spans em toda chamada externa (DB, HTTP, fila, LLM); nome do span é a operação, nunca URL com IDs dinâmicos
- Nunca logue: senha, token, header `Authorization`, cookie, CPF, número de cartão, payload de webhook de pagamento
- Logue no momento da decisão, não só do erro — "por que escolhi este branch"
- Alertas pageáveis apenas para violação de SLO em produção; todo alerta tem runbook

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `console.log("user", user)` | `logger.info({ userId: user.id }, "user_loaded")` |
| TraceId gerado no log final | Propagar desde a borda do request |
| Mensagem template-literal (`"user ${id} did X"`) | Campo separado `{ userId }` no objeto de log |
| Logar request body inteiro | Logar apenas metadados não-sensíveis |
| Métrica com label de alta cardinalidade (`userId`) | Usar em exemplars ou logs, nunca em label |
| `console.log`/`debug`/`info` em runtime (exceto testes/scripts) | `logger` estruturado com serialização JSON |
