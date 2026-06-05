---
id: std-error-handling
description: Erros classificados, propagados com contexto e nunca silenciados
version: 1.1.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-error-handling.js
---
## Princípios

- Classifique todo erro em: domínio esperado (Result/Either), falha de infraestrutura recuperável (throw + retry), ou bug de programador (throw + crash)
- Use `Result<T, E>` para erros de domínio que o caller deve tratar; use `throw` apenas para bugs e falhas cross-layer
- Defina classes de erro com discriminador `kind` para narrowing; inclua `cause` ao re-lançar para preservar a cadeia
- Nunca escreva `catch {}` ou `catch (e) {}` vazio; se o erro é ignorável, comente o motivo e logue em `debug`
- Logue cada erro exatamente uma vez no boundary mais externo; nunca logue e re-lance o mesmo erro (duplica sem contexto)
- Mensagem técnica do erro é separada da mensagem user-facing; nunca exponha `error.message`, stack ou SQL ao usuário
- Retorne envelope estável ao cliente: `{ code, message, details?, traceId }` — cliente programa contra `code`
- Retry apenas em erros transitórios idempotentes (timeout, 429, 503, ECONNRESET); nunca para 4xx semânticos
- Defina `maxAttempts` e `maxElapsedTime` finitos; use backoff exponencial com jitter
- Defina timeout explícito em toda operação de I/O; propague via `AbortSignal` quando a API suportar
- Circuit breaker em dependência externa instável: após N falhas consecutivas, abra o circuito e falhe rápido em vez de empilhar timeouts

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `catch (e) { return null; }` | `Result.err` ou rethrow com contexto |
| `catch (e) { console.log(e) }` | Log estruturado + rethrow/map |
| `catch (e: any)` sem narrowing | `catch (e: unknown)` + `instanceof` |
| `throw "string"` ou `throw { code: 1 }` | `throw new Error(...)` ou subclasse |
| `.catch(console.error)` em produção | Logger estruturado com schema + propagação |
| Retornar `200` com `{ ok: false }` | Status HTTP correto (4xx/5xx) |
| Vazar `e.message` do ORM ao cliente | Mapear para code estável + log interno |
| Catch-all que mascara qualquer falha como "internal error" | Inspecionar o tipo antes de responder |
