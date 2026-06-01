---
id: std-api-conventions
description: APIs HTTP com contrato previsível, versionadas e com status codes corretos
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

- Ordem obrigatória no handler: autenticação → validação → autorização → ação; nunca execute ação antes de verificar quem é o caller
- Paths em `kebab-case`, plural para coleções (`/orders`), singular para singletons (`/health`, `/me`); aninhamento máximo de 2 níveis
- `GET` nunca causa side effect; mutações em `POST`, `PUT`, `PATCH`, `DELETE`
- Status codes: `200/201/204` sucesso; `400` input inválido; `401` sem autenticação; `403` sem permissão; `404` não encontrado; `409` conflito; `429` rate-limit; `5xx` falha do servidor
- Envelope de erro estável: `{ code, message, details?, traceId }` — cliente programa contra `code`, nunca contra `message`
- Paginação cursor-based (`?cursor=...&limit=N`) para listas grandes; offset apenas para UI com page-jump explícito
- Versionamento no path (`/v1/...`): mudança aditiva vai na mesma versão; breaking change cria nova versão
- `Idempotency-Key` em mutations que podem ser retried (`POST /payments`, `POST /orders`)
- JSON payloads em `camelCase`; IDs como strings opacas (ULID/UUID) — nunca integer sequencial exposto
- OpenAPI/contrato atualizado no mesmo PR que muda o shape da API

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `GET /deleteOrder?id=...` | `DELETE /orders/{orderId}` |
| `200` com `{ error: "..." }` | Status HTTP apropriado (4xx) |
| Quebrar v1 em vez de criar v2 | Versionar a breaking change |
| Handler sem autenticação antes da ação | `requireAuth(req)` na primeira linha |
| Paginação `OFFSET 50000` | Cursor-based (`WHERE id > $last`) |
| ID numérico sequencial em URL pública | ULID ou UUID opaco |
| Vazar stack trace no body de erro | `{ code, message, traceId }` sem internals |
